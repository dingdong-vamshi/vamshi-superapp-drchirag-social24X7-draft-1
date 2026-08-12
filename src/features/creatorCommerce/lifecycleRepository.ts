import type { SupabaseClient } from '@supabase/supabase-js';

export type ProductApprovalStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'changes_required'
  | 'rejected'
  | 'suspended'
  | 'archived';

export type LifecycleProduct = {
  id: string;
  storefrontId: string;
  storefrontName: string;
  sellerId: string;
  title: string;
  slug: string;
  category: string;
  shortDescription: string;
  description: string;
  priceMinor: number;
  salePriceMinor: number | null;
  inventory: number;
  inventoryReserved: number;
  sku: string;
  status: 'draft' | 'active' | 'archived';
  approvalStatus: ProductApprovalStatus;
  creatorPromotionEnabled: boolean;
  creatorCommissionBps: number;
  returnWindowDays: number;
  reviewNote: string | null;
  updatedAt: string;
  mediaPaths: string[];
};

export type ProductDraftInput = {
  id?: string;
  title: string;
  slug: string;
  category: string;
  priceMinor: number;
  salePriceMinor?: number | null;
  inventory: number;
  shortDescription: string;
  description: string;
  sku: string;
  creatorPromotionEnabled: boolean;
  creatorCommissionBps: number;
  returnWindowDays: number;
};

export type CreatorPromotion = {
  id: string;
  productId: string;
  creatorId: string;
  trackingCode: string;
  status: string;
  commissionBpsSnapshot: number;
  productTitle: string;
  storefrontName: string;
};

export type CartLine = {
  id: string;
  productId: string;
  title: string;
  storefrontName: string;
  quantity: number;
  unitPriceMinor: number;
  promotionCode: string | null;
};

export type CheckoutSummary = {
  id: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotalMinor: number;
  platformFeeMinor: number;
  totalMinor: number;
  createdAt: string;
};

export type SellerLifecycleOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  totalMinor: number;
  createdAt: string;
  itemCount: number;
};

export type CreatorCommission = {
  id: string;
  status: string;
  commissionMinor: number;
  eligibleItemMinor: number;
  productTitle: string;
  orderId: string;
  createdAt: string;
};

export type BuyerOrderItem = {
  id: string;
  orderId: string;
  title: string;
  storefrontName: string;
  quantity: number;
  subtotalMinor: number;
  commissionStatus: string;
  returnWindowEndsAt: string | null;
  orderStatus: string;
};

export type AdminCheckout = {
  id: string;
  buyerId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalMinor: number;
  createdAt: string;
};

export type AdminBuyerAccess = {
  userId: string;
  buyerKycStatus: string;
};

export type AdminReturnRequest = {
  id: string;
  buyerId: string;
  orderId: string;
  status: string;
  reason: string;
  requestedAt: string;
};

export type LifecycleOrderEvidence = {
  id: string;
  ownerId: string;
  orderId: string | null;
  orderItemId: string | null;
  kind: 'packing' | 'unboxing';
  storagePath: string;
  fileName: string | null;
  mimeType: string | null;
  createdAt: string;
  signedUrl: string | null;
};

type ProductRow = {
  id: string;
  storefront_id: string;
  title: string;
  slug: string;
  category: string;
  short_description: string | null;
  description: string | null;
  price_minor: number;
  sale_price_minor: number | null;
  inventory: number;
  inventory_reserved: number;
  sku: string | null;
  status: 'draft' | 'active' | 'archived';
  product_approval_status: ProductApprovalStatus;
  creator_promotion_enabled: boolean;
  creator_commission_bps: number;
  return_window_days: number;
  review_note: string | null;
  updated_at: string;
  storefronts?: { id: string; name: string; owner_id: string } | { id: string; name: string; owner_id: string }[] | null;
  product_media?: Array<{ path: string; position: number | null }> | null;
};

const productSelect =
  'id,storefront_id,title,slug,category,short_description,description,price_minor,sale_price_minor,inventory,inventory_reserved,sku,status,product_approval_status,creator_promotion_enabled,creator_commission_bps,return_window_days,review_note,updated_at,storefronts!products_storefront_id_fkey(id,name,owner_id),product_media(path,position)';

const first = <T,>(value: T | T[] | null | undefined) => Array.isArray(value) ? value[0] : value ?? null;

const productFromRow = (row: ProductRow): LifecycleProduct => {
  const storefront = first(row.storefronts);
  return {
    id: row.id,
    storefrontId: row.storefront_id,
    storefrontName: storefront?.name ?? 'Storefront',
    sellerId: storefront?.owner_id ?? '',
    title: row.title,
    slug: row.slug,
    category: row.category,
    shortDescription: row.short_description ?? '',
    description: row.description ?? '',
    priceMinor: row.price_minor,
    salePriceMinor: row.sale_price_minor,
    inventory: row.inventory,
    inventoryReserved: row.inventory_reserved,
    sku: row.sku ?? '',
    status: row.status,
    approvalStatus: row.product_approval_status,
    creatorPromotionEnabled: row.creator_promotion_enabled,
    creatorCommissionBps: row.creator_commission_bps,
    returnWindowDays: row.return_window_days,
    reviewNote: row.review_note,
    updatedAt: row.updated_at,
    mediaPaths: [...(row.product_media ?? [])]
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
      .map((media) => media.path),
  };
};

const requireSupabaseUserId = async (client: SupabaseClient) => {
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(error.message);
  const userId = data.user?.id;
  if (!userId) throw new Error('Sign in with a real Supabase account first.');
  return userId;
};

const isMissingRpc = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === 'PGRST202' || error.message?.includes('Could not find the function')));

async function ensureSellerStorefront(client: SupabaseClient, userId: string) {
  const { data: provisionedId, error: provisionError } = await client.rpc('ensure_creator_commerce_storefront');
  if (!provisionError) {
    const { data, error } = await client.from('storefronts').select('id,name').eq('id', provisionedId).single();
    if (error) throw new Error(error.message);
    return data as { id: string; name: string };
  }
  if (!isMissingRpc(provisionError)) throw new Error(provisionError.message);

  // Compatibility path for a rolling deploy where the UI arrives before the
  // provisioning migration. RLS still restricts both rows to the signed-in owner.
  const { data: access, error: accessError } = await client
    .from('creator_commerce_access')
    .select('seller_status')
    .eq('user_id', userId)
    .single();
  if (accessError) throw new Error(accessError.message);
  if (access?.seller_status !== 'approved') throw new Error('Seller approval is required before saving products.');

  const { data: application, error: applicationError } = await client
    .from('seller_applications')
    .select('storefront_name,storefront_slug,business_name,business_type,seller_tier,state_code,registered_state,city,phone,email,legal_name,status')
    .eq('owner_id', userId)
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  if (applicationError) throw new Error(applicationError.message);

  const baseSlug = slugifyCommerce(application.storefront_slug || application.storefront_name || 'store');
  const payload = {
    owner_id: userId,
    name: application.storefront_name?.trim() || 'Creator Commerce Store',
    slug: baseSlug,
    tagline: application.business_name?.trim() || 'Creator Commerce seller',
    description: application.business_name?.trim() || application.legal_name?.trim() || 'Creator Commerce storefront',
    seller_tier: application.seller_tier || 'local',
    business_type: application.business_type || 'independent',
    state_code: (application.state_code || application.registered_state || '').trim().toUpperCase(),
    city: application.city?.trim() || null,
    support_phone: application.phone?.trim() || null,
    support_email: application.email?.trim().toLowerCase() || null,
    primary_category: 'Everyday',
    seo_title: application.storefront_name?.trim() || 'Creator Commerce Store',
    seo_description: application.business_name?.trim() || 'Creator Commerce storefront',
    llm_summary: application.business_name?.trim() || application.legal_name?.trim() || 'Creator Commerce storefront',
    indexable: true,
    geo_enabled: true,
    active: true,
    verification_status: 'approved',
  };
  let result = await client.from('storefronts').upsert(payload, { onConflict: 'owner_id' }).select('id,name').single();
  if (result.error?.code === '23505') {
    result = await client
      .from('storefronts')
      .upsert({ ...payload, slug: `${baseSlug.slice(0, 52)}-${userId.slice(0, 8)}` }, { onConflict: 'owner_id' })
      .select('id,name')
      .single();
  }
  if (result.error) throw new Error(result.error.message);
  return result.data as { id: string; name: string };
}

export const formatMinor = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(value / 100));

export const slugifyCommerce = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 62) || 'product';

export const sellerEditableProductStatuses: ProductApprovalStatus[] = ['draft', 'changes_required', 'rejected'];

export const canEditLifecycleProduct = (status: ProductApprovalStatus) =>
  sellerEditableProductStatuses.includes(status);

export const canSubmitLifecycleProduct = canEditLifecycleProduct;

export type AdminProductDecision = 'under_review' | 'approved' | 'changes_required' | 'rejected' | 'suspended';

export const adminProductDecisionsFor = (status: ProductApprovalStatus): AdminProductDecision[] => {
  if (status === 'submitted') return ['under_review', 'approved', 'changes_required', 'rejected'];
  if (status === 'under_review') return ['approved', 'changes_required', 'rejected'];
  if (status === 'approved') return ['suspended'];
  if (status === 'suspended') return ['approved'];
  return [];
};

export const sellerFulfillmentDecisionsFor = (status: string) => {
  if (status === 'draft' || status === 'placed') return ['confirmed'];
  if (status === 'confirmed') return ['processing'];
  if (status === 'processing') return ['shipped'];
  if (status === 'shipped') return ['out_for_delivery'];
  if (status === 'out_for_delivery') return ['delivered'];
  return [];
};

export async function listSellerLifecycleProducts(client: SupabaseClient) {
  const userId = await requireSupabaseUserId(client);
  const storefront = await ensureSellerStorefront(client, userId);

  const { data, error } = await client
    .from('products')
    .select(productSelect)
    .eq('storefront_id', storefront.id)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as ProductRow[] | null) ?? []).map(productFromRow);
}

export async function saveSellerLifecycleProduct(client: SupabaseClient, input: ProductDraftInput) {
  const userId = await requireSupabaseUserId(client);
  const storefront = await ensureSellerStorefront(client, userId);
  const { data, error } = await client.rpc('save_creator_commerce_product', {
    p_product_id: input.id ?? null,
    p_title: input.title.trim(),
    p_slug: slugifyCommerce(input.slug || input.title),
    p_category: input.category,
    p_price_minor: Math.max(0, input.priceMinor),
    p_sale_price_minor: input.salePriceMinor && input.salePriceMinor > 0 ? input.salePriceMinor : null,
    p_inventory: Math.max(0, input.inventory),
    p_sku: input.sku.trim() || slugifyCommerce(input.title).slice(0, 24),
    p_short_description: input.shortDescription.trim().slice(0, 180),
    p_description: input.description.trim(),
    p_creator_promotion_enabled: input.creatorPromotionEnabled,
    p_creator_commission_bps: input.creatorPromotionEnabled ? input.creatorCommissionBps : 0,
    p_return_window_days: input.returnWindowDays,
  });
  if (!error) return productFromRow(data as ProductRow);
  if (!isMissingRpc(error)) throw new Error(error.message);

  if (input.id) {
    const { data: existing, error: existingError } = await client
      .from('products')
      .select('product_approval_status')
      .eq('id', input.id)
      .eq('storefront_id', storefront.id)
      .single();
    if (existingError) throw new Error(existingError.message);
    if (!canEditLifecycleProduct(existing.product_approval_status as ProductApprovalStatus)) {
      throw new Error('Only draft, changes-required, or rejected products can be edited.');
    }
  }

  const payload = {
    id: input.id,
    storefront_id: storefront.id,
    title: input.title.trim(),
    slug: slugifyCommerce(input.slug || input.title),
    brand: storefront.name,
    category: input.category,
    price_minor: Math.max(0, input.priceMinor),
    sale_price_minor: input.salePriceMinor && input.salePriceMinor > 0 ? input.salePriceMinor : null,
    inventory: Math.max(0, input.inventory),
    sku: input.sku.trim() || slugifyCommerce(input.title).slice(0, 24),
    short_description: input.shortDescription.trim().slice(0, 180),
    description: input.description.trim(),
    creator_promotion_enabled: input.creatorPromotionEnabled,
    creator_commission_bps: input.creatorPromotionEnabled ? input.creatorCommissionBps : 0,
    return_window_days: input.returnWindowDays,
    status: 'draft',
    product_approval_status: 'draft',
    approval_requested_at: null,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    published_at: null,
  };
  const fallback = await client.from('products').upsert(payload, { onConflict: 'id' }).select(productSelect).single();
  if (fallback.error) throw new Error(fallback.error.message);
  return productFromRow(fallback.data as ProductRow);
}

export async function submitLifecycleProduct(client: SupabaseClient, productId: string) {
  const { data, error } = await client.rpc('submit_creator_commerce_product', { p_product_id: productId });
  if (error) throw new Error(error.message);
  return productFromRow(data as ProductRow);
}

export async function listAdminProductQueue(client: SupabaseClient) {
  const { data, error } = await client
    .from('products')
    .select(productSelect)
    .in('product_approval_status', ['submitted', 'under_review', 'approved', 'changes_required', 'rejected', 'suspended'])
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data as ProductRow[] | null) ?? []).map(productFromRow);
}

export async function reviewLifecycleProduct(client: SupabaseClient, productId: string, decision: AdminProductDecision, reason: string) {
  const { data, error } = await client.rpc('review_creator_commerce_product', {
    p_product_id: productId,
    p_decision: decision,
    p_reason: reason.trim() || null,
  });
  if (error) throw new Error(error.message);
  return productFromRow(data as ProductRow);
}

export async function listCreatorMarketplaceProducts(client: SupabaseClient) {
  const { data, error } = await client
    .from('products')
    .select(productSelect)
    .eq('status', 'active')
    .eq('product_approval_status', 'approved')
    .eq('creator_promotion_enabled', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(80);
  if (error) throw new Error(error.message);
  return ((data as ProductRow[] | null) ?? []).map(productFromRow);
}

export async function createPromotion(client: SupabaseClient, productId: string): Promise<CreatorPromotion> {
  const { data, error } = await client.rpc('create_creator_product_promotion', { p_product_id: productId });
  if (error) throw new Error(error.message);
  const row = data as { id: string; product_id: string; creator_id: string; tracking_code: string; status: string; commission_bps_snapshot: number };
  return {
    id: row.id,
    productId: row.product_id,
    creatorId: row.creator_id,
    trackingCode: row.tracking_code,
    status: row.status,
    commissionBpsSnapshot: row.commission_bps_snapshot,
    productTitle: 'Promotion',
    storefrontName: 'Storefront',
  };
}

export async function recordCreatorPromotionClick(client: SupabaseClient, trackingCode: string) {
  const code = trackingCode.trim();
  if (!code) throw new Error('A promotion tracking code is required.');
  const { data, error } = await client.rpc('record_creator_promotion_click', {
    p_tracking_code: code,
    p_source: 'buyer_link',
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listMyPromotions(client: SupabaseClient): Promise<CreatorPromotion[]> {
  const { data, error } = await client
    .from('creator_product_promotions')
    .select('id,product_id,creator_id,tracking_code,status,commission_bps_snapshot,products(title,storefronts(name))')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data as any[] | null) ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    creatorId: row.creator_id,
    trackingCode: row.tracking_code,
    status: row.status,
    commissionBpsSnapshot: row.commission_bps_snapshot,
    productTitle: first(row.products)?.title ?? row.products?.title ?? 'Product',
    storefrontName: first(first(row.products)?.storefronts)?.name ?? first(row.products?.storefronts)?.name ?? 'Storefront',
  }));
}

export async function addLifecycleCartItem(client: SupabaseClient, productId: string, quantity: number, trackingCode?: string | null) {
  const { error } = await client.rpc('upsert_creator_commerce_cart_item', {
    p_product_id: productId,
    p_quantity: quantity,
    p_tracking_code: trackingCode ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function listLifecycleCart(client: SupabaseClient): Promise<CartLine[]> {
  const { data, error } = await client
    .from('cart_items')
    .select('id,product_id,quantity,creator_product_promotions(tracking_code),products(title,price_minor,sale_price_minor,storefronts(name))')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as any[] | null) ?? []).map((row) => {
    const product = first(row.products) ?? row.products;
    return {
      id: row.id,
      productId: row.product_id,
      title: product?.title ?? 'Product',
      storefrontName: first(product?.storefronts)?.name ?? product?.storefronts?.name ?? 'Storefront',
      quantity: row.quantity,
      unitPriceMinor: product?.sale_price_minor ?? product?.price_minor ?? 0,
      promotionCode: first(row.creator_product_promotions)?.tracking_code ?? row.creator_product_promotions?.tracking_code ?? null,
    };
  });
}

export async function saveAddressAndCheckout(client: SupabaseClient, input: {
  recipientName: string;
  phone: string;
  addressLine1: string;
  city: string;
  stateCode: string;
  postalCode: string;
  paymentMethod: 'cod' | 'external';
}) {
  const userId = await requireSupabaseUserId(client);
  const { data: address, error: addressError } = await client
    .from('buyer_delivery_addresses')
    .insert({
      buyer_id: userId,
      recipient_name: input.recipientName.trim(),
      phone: input.phone.trim(),
      address_line1: input.addressLine1.trim(),
      city: input.city.trim(),
      state_code: input.stateCode.trim().toUpperCase(),
      postal_code: input.postalCode.trim(),
      label: 'Checkout',
    })
    .select('id')
    .single();
  if (addressError) throw new Error(addressError.message);

  const idempotencyKey = crypto.randomUUID();
  const { data, error } = await client.rpc('create_creator_commerce_checkout', {
    p_address_id: address.id,
    p_payment_method: input.paymentMethod,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listMyCheckouts(client: SupabaseClient): Promise<CheckoutSummary[]> {
  const { data, error } = await client
    .from('checkout_groups')
    .select('id,status,payment_method,payment_status,subtotal_minor,platform_fee_minor,total_minor,created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return ((data as any[] | null) ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    subtotalMinor: row.subtotal_minor,
    platformFeeMinor: row.platform_fee_minor,
    totalMinor: row.total_minor,
    createdAt: row.created_at,
  }));
}

export async function listSellerLifecycleOrders(client: SupabaseClient): Promise<SellerLifecycleOrder[]> {
  const userId = await requireSupabaseUserId(client);
  const { data: storefront, error: storefrontError } = await client
    .from('storefronts')
    .select('id')
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle();
  if (storefrontError) throw new Error(storefrontError.message);
  if (!storefront) return [];

  const { data, error } = await client
    .from('orders')
    .select('id,status,payment_status,total_minor,created_at,order_items(id)')
    .eq('storefront_id', storefront.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data as any[] | null) ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    paymentStatus: row.payment_status,
    totalMinor: row.total_minor,
    createdAt: row.created_at,
    itemCount: row.order_items?.length ?? 0,
  }));
}

export async function updateLifecycleFulfillment(client: SupabaseClient, orderId: string, status: string) {
  const { error } = await client.rpc('seller_update_creator_commerce_fulfillment', {
    p_order_id: orderId,
    p_status: status,
    p_carrier: 'Internal test carrier',
    p_tracking_number: `TEST-${orderId.slice(0, 8)}`,
    p_package_reference: 'EXTERNAL INTEGRATION PENDING',
    p_customer_note: 'Updated from Creator Commerce seller tools.',
    p_packing_evidence_path: null,
  });
  if (error) throw new Error(error.message);
}

export async function listAdminCheckouts(client: SupabaseClient): Promise<AdminCheckout[]> {
  const { data, error } = await client
    .from('checkout_groups')
    .select('id,buyer_id,status,payment_method,payment_status,total_minor,created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return ((data as any[] | null) ?? []).map((row) => ({
    id: row.id,
    buyerId: row.buyer_id,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    totalMinor: row.total_minor,
    createdAt: row.created_at,
  }));
}

export async function confirmAdminCheckoutPaymentForTest(client: SupabaseClient, checkoutId: string) {
  const { error } = await client.rpc('admin_confirm_checkout_payment_for_test', { p_checkout_group_id: checkoutId });
  if (error) throw new Error(error.message);
}

export async function listAdminBuyerAccess(client: SupabaseClient): Promise<AdminBuyerAccess[]> {
  const { data, error } = await client
    .from('creator_commerce_access')
    .select('user_id,buyer_kyc_status')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data as any[] | null) ?? []).map((row) => ({ userId: row.user_id, buyerKycStatus: row.buyer_kyc_status }));
}

export async function setAdminBuyerKycForTest(client: SupabaseClient, userId: string, status: string) {
  const { error } = await client.rpc('admin_set_buyer_kyc_status_for_test', { p_user_id: userId, p_status: status });
  if (error) throw new Error(error.message);
}

export async function listAdminReturns(client: SupabaseClient): Promise<AdminReturnRequest[]> {
  const { data, error } = await client
    .from('return_requests')
    .select('id,buyer_id,order_id,status,reason,requested_at')
    .order('requested_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return ((data as any[] | null) ?? []).map((row) => ({
    id: row.id,
    buyerId: row.buyer_id,
    orderId: row.order_id,
    status: row.status,
    reason: row.reason,
    requestedAt: row.requested_at,
  }));
}

export async function reviewAdminReturn(client: SupabaseClient, returnId: string, decision: 'approved' | 'rejected', reason: string) {
  const { error } = await client.rpc('admin_review_creator_commerce_return', {
    p_return_request_id: returnId,
    p_decision: decision,
    p_reason: reason.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function listLifecycleOrderEvidence(client: SupabaseClient): Promise<LifecycleOrderEvidence[]> {
  const { data, error } = await client
    .from('commerce_order_evidence')
    .select('id,owner_id,order_id,order_item_id,evidence_kind,storage_path,file_name,mime_type,created_at')
    .in('evidence_kind', ['packing', 'unboxing'])
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return Promise.all(((data as any[] | null) ?? []).map(async (row) => {
    const signed = await client.storage.from('creator-commerce-private').createSignedUrl(row.storage_path, 900);
    return {
      id: row.id,
      ownerId: row.owner_id,
      orderId: row.order_id,
      orderItemId: row.order_item_id,
      kind: row.evidence_kind,
      storagePath: row.storage_path,
      fileName: row.file_name,
      mimeType: row.mime_type,
      createdAt: row.created_at,
      signedUrl: signed.data?.signedUrl ?? null,
    } as LifecycleOrderEvidence;
  }));
}

export async function uploadLifecycleOrderEvidence(
  client: SupabaseClient,
  input: {
    orderId: string;
    orderItemId?: string | null;
    kind: 'packing' | 'unboxing';
    asset: { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number | null };
  },
) {
  const userId = await requireSupabaseUserId(client);
  const response = await fetch(input.asset.uri);
  if (!response.ok) throw new Error('Could not read the selected evidence file.');
  const bytes = await response.arrayBuffer();
  const rawExtension = input.asset.fileName?.split('.').pop()?.toLowerCase();
  const fallbackExtension = input.asset.mimeType?.includes('video') ? 'mp4' : input.asset.mimeType?.includes('png') ? 'png' : 'jpg';
  const extension = rawExtension && /^[a-z0-9]{2,5}$/.test(rawExtension) ? rawExtension : fallbackExtension;
  const path = `${userId}/orders/${input.orderId}/${input.kind}/${Date.now()}.${extension}`;
  const upload = await client.storage.from('creator-commerce-private').upload(path, bytes, {
    contentType: input.asset.mimeType ?? response.headers.get('content-type') ?? 'application/octet-stream',
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);
  const inserted = await client.from('commerce_order_evidence').insert({
    owner_id: userId,
    order_id: input.orderId,
    order_item_id: input.orderItemId ?? null,
    evidence_kind: input.kind,
    storage_path: path,
    file_name: input.asset.fileName ?? null,
    mime_type: input.asset.mimeType ?? null,
    file_size: input.asset.fileSize ?? bytes.byteLength,
  });
  if (inserted.error) {
    await client.storage.from('creator-commerce-private').remove([path]);
    throw new Error(inserted.error.message);
  }
  return path;
}

export async function listCreatorCommissions(client: SupabaseClient): Promise<CreatorCommission[]> {
  const { data, error } = await client
    .from('creator_commissions')
    .select('id,status,commission_minor,eligible_item_minor,order_id,created_at,order_items(product_title_snapshot)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data as any[] | null) ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    commissionMinor: row.commission_minor,
    eligibleItemMinor: row.eligible_item_minor,
    productTitle: first(row.order_items)?.product_title_snapshot ?? row.order_items?.product_title_snapshot ?? 'Product',
    orderId: row.order_id,
    createdAt: row.created_at,
  }));
}

export async function submitLifecycleReturn(client: SupabaseClient, orderItemId: string, reason: string) {
  const { error } = await client.rpc('submit_creator_commerce_return', {
    p_order_item_id: orderItemId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function listBuyerOrderItems(client: SupabaseClient): Promise<BuyerOrderItem[]> {
  const userId = await requireSupabaseUserId(client);
  const { data, error } = await client
    .from('order_items')
    .select('id,order_id,product_title_snapshot,storefront_name_snapshot,quantity,subtotal_minor,commission_status,return_window_ends_at,orders(status)')
    .eq('buyer_id', userId)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  return ((data as any[] | null) ?? []).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    title: row.product_title_snapshot,
    storefrontName: row.storefront_name_snapshot,
    quantity: row.quantity,
    subtotalMinor: row.subtotal_minor,
    commissionStatus: row.commission_status,
    returnWindowEndsAt: row.return_window_ends_at,
    orderStatus: first(row.orders)?.status ?? row.orders?.status ?? 'unknown',
  }));
}
