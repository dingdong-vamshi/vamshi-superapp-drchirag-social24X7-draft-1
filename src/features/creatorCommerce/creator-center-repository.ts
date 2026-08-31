import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getMyCommerceVerificationProfile,
  getMyCreatorApplication,
  type CommerceVerificationProfile,
  type CreatorApplication,
} from './accessRepository';
import {
  createPromotion,
  listCreatorMarketplaceProducts,
  resolveLifecycleProductMediaUrl,
  type LifecycleProduct,
} from './lifecycleRepository';
import {
  rankCreatorGrowth,
  type CreatorCommissionRecord,
  type CreatorGrowthScore,
} from './creator-center-model';

export const creatorCommerceChannel = 'creator_seller';

export type CreatorCenterProduct = LifecycleProduct & {
  coverUrl: string | null;
};

export type CreatorCenterPromotion = {
  id: string;
  productId: string;
  creatorId: string;
  storefrontId: string;
  storefrontName: string;
  storefrontSlug: string;
  productTitle: string;
  productSlug: string;
  trackingCode: string;
  status: string;
  commissionBps: number;
  createdAt: string;
  updatedAt: string;
  clicks: number;
};

export type CreatorCenterProfile = {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  avatarPath: string | null;
  avatarUrl: string | null;
};

export type CreatorCommerceConversation = {
  id: string;
  storefrontId: string;
  storefrontName: string;
  storefrontSlug: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyUsername: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
};

export type CreatorCommerceMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: string;
  body: string;
  createdAt: string;
  productId: string | null;
  productTitle: string | null;
};

export type CreatorSellerDirectoryEntry = {
  userId: string;
  displayName: string;
  username: string;
  storefrontId: string;
  storefrontName: string;
  storefrontSlug: string;
};

export type CreatorCenterData = {
  products: CreatorCenterProduct[];
  promotions: CreatorCenterPromotion[];
  commissions: CreatorCommissionRecord[];
  verification: CommerceVerificationProfile;
  application: CreatorApplication | null;
  profile: CreatorCenterProfile;
  growth: Array<CreatorGrowthScore & { rank: number }>;
  growthAvailable: boolean;
};

const first = <T,>(value: T | T[] | null | undefined) => Array.isArray(value) ? value[0] : value ?? null;

const requireUser = async (client: SupabaseClient) => {
  const session = await client.auth.getSession();
  if (session.error) throw new Error(session.error.message);
  const user = session.data.session?.user;
  if (!user) throw new Error('Sign in with a real Social24 account first.');
  return user;
};

const isMissingRpc = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === 'PGRST202' || error.message?.includes('Could not find the function')));

async function listProducts(client: SupabaseClient) {
  const products = await listCreatorMarketplaceProducts(client);
  return Promise.all(products.map(async (product) => {
    const primary = [...product.mediaItems].sort((left, right) => left.position - right.position)[0];
    if (!primary) return { ...product, coverUrl: null };
    try {
      return { ...product, coverUrl: await resolveLifecycleProductMediaUrl(client, primary) };
    } catch {
      return { ...product, coverUrl: null };
    }
  }));
}

async function listPromotions(client: SupabaseClient, userId: string): Promise<CreatorCenterPromotion[]> {
  const { data, error } = await client
    .from('creator_product_promotions')
    .select('id,product_id,creator_id,storefront_id,tracking_code,status,commission_bps_snapshot,created_at,updated_at,products(title,slug,storefronts(name,slug))')
    .eq('creator_id', userId)
    .order('updated_at', { ascending: false })
    .limit(250);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const ids = rows.map((row) => row.id);
  const clickCounts = new Map<string, number>();
  if (ids.length) {
    const clicks = await client.from('creator_promotion_clicks').select('promotion_id').in('promotion_id', ids).limit(5000);
    if (clicks.error) throw new Error(clicks.error.message);
    (clicks.data ?? []).forEach((click: { promotion_id: string }) => clickCounts.set(click.promotion_id, (clickCounts.get(click.promotion_id) ?? 0) + 1));
  }
  return rows.map((row) => {
    const product = first(row.products) ?? row.products;
    const storefront = first(product?.storefronts) ?? product?.storefronts;
    return {
      id: row.id,
      productId: row.product_id,
      creatorId: row.creator_id,
      storefrontId: row.storefront_id,
      storefrontName: storefront?.name ?? 'Storefront',
      storefrontSlug: storefront?.slug ?? '',
      productTitle: product?.title ?? 'Product',
      productSlug: product?.slug ?? '',
      trackingCode: row.tracking_code,
      status: row.status,
      commissionBps: row.commission_bps_snapshot,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      clicks: clickCounts.get(row.id) ?? 0,
    };
  });
}

async function listCommissions(client: SupabaseClient, userId: string): Promise<CreatorCommissionRecord[]> {
  const { data, error } = await client
    .from('creator_commissions')
    .select('id,creator_id,seller_id,storefront_id,product_id,order_id,order_item_id,eligible_item_minor,commission_bps_snapshot,commission_minor,status,eligible_at,paid_at,reversal_reason,created_at')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const orderIds = [...new Set(rows.map((row) => row.order_id))];
  const itemIds = rows.map((row) => row.order_item_id);
  const storefrontIds = [...new Set(rows.map((row) => row.storefront_id))];
  const [ordersResult, itemsResult, storefrontsResult] = await Promise.all([
    orderIds.length ? client.from('orders').select('id,status').in('id', orderIds) : Promise.resolve({ data: [], error: null }),
    itemIds.length ? client.from('order_items').select('id,product_title_snapshot').in('id', itemIds) : Promise.resolve({ data: [], error: null }),
    storefrontIds.length ? client.from('storefronts').select('id,name').in('id', storefrontIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (storefrontsResult.error) throw new Error(storefrontsResult.error.message);
  const orderById = new Map((ordersResult.data ?? []).map((row: any) => [row.id, row]));
  const itemById = new Map((itemsResult.data ?? []).map((row: any) => [row.id, row]));
  const storefrontById = new Map((storefrontsResult.data ?? []).map((row: any) => [row.id, row]));
  return rows.map((row) => ({
    id: row.id,
    creatorId: row.creator_id,
    sellerId: row.seller_id,
    storefrontId: row.storefront_id,
    storefrontName: storefrontById.get(row.storefront_id)?.name ?? 'Storefront',
    productId: row.product_id,
    productTitle: itemById.get(row.order_item_id)?.product_title_snapshot ?? 'Product',
    orderId: row.order_id,
    orderStatus: orderById.get(row.order_id)?.status ?? 'unknown',
    eligibleItemMinor: row.eligible_item_minor,
    commissionBps: row.commission_bps_snapshot,
    commissionMinor: row.commission_minor,
    status: row.status,
    createdAt: row.created_at,
    eligibleAt: row.eligible_at,
    paidAt: row.paid_at,
    reversalReason: row.reversal_reason,
  }));
}

async function getProfile(client: SupabaseClient, userId: string): Promise<CreatorCenterProfile> {
  const { data, error } = await client.from('profiles').select('id,display_name,username,bio,avatar_path').eq('id', userId).single();
  if (error) throw new Error(error.message);
  let avatarUrl: string | null = null;
  if (data.avatar_path) {
    const signed = await client.storage.from('profile-media').createSignedUrl(data.avatar_path, 3600);
    avatarUrl = signed.data?.signedUrl ?? null;
  }
  return {
    id: data.id,
    displayName: data.display_name?.trim() || data.username || 'Creator',
    username: data.username || userId.slice(0, 8),
    bio: data.bio ?? '',
    avatarPath: data.avatar_path,
    avatarUrl,
  };
}

async function listGrowth(client: SupabaseClient, userId: string, commissions: CreatorCommissionRecord[], profile: CreatorCenterProfile) {
  const { data, error } = await client.rpc('get_creator_growth_leaderboard', { p_limit: 25 });
  if (!error) {
    const rows = ((data ?? []) as any[]).map((row) => ({
      creatorId: row.creator_id,
      displayName: row.display_name || row.username || 'Creator',
      username: row.username || row.creator_id.slice(0, 8),
      avatarPath: row.avatar_path ?? null,
      attributedSalesMinor: Number(row.attributed_sales_minor ?? 0),
      successfulOrders: Number(row.successful_orders ?? 0),
    }));
    return { rows: rankCreatorGrowth(rows), available: true };
  }
  if (!isMissingRpc(error)) throw new Error(error.message);
  const eligible = commissions.filter((record) =>
    ['confirmed', 'eligible', 'payable', 'paid'].includes(record.status)
    && !['cancelled', 'refunded', 'return_approved'].includes(record.orderStatus),
  );
  const ownRow = {
    creatorId: userId,
    displayName: profile.displayName,
    username: profile.username,
    avatarPath: profile.avatarPath,
    attributedSalesMinor: eligible.reduce((sum, record) => sum + record.eligibleItemMinor, 0),
    successfulOrders: new Set(eligible.map((record) => record.orderId)).size,
  };
  return { rows: rankCreatorGrowth([ownRow]), available: false };
}

export async function loadCreatorCenter(client: SupabaseClient): Promise<CreatorCenterData> {
  const user = await requireUser(client);
  const [products, promotions, commissions, verification, application, profile] = await Promise.all([
    listProducts(client),
    listPromotions(client, user.id),
    listCommissions(client, user.id),
    getMyCommerceVerificationProfile(client),
    getMyCreatorApplication(client, user.id),
    getProfile(client, user.id),
  ]);
  const growth = await listGrowth(client, user.id, commissions, profile);
  return { products, promotions, commissions, verification, application, profile, growth: growth.rows, growthAvailable: growth.available };
}

export async function promoteCreatorProduct(client: SupabaseClient, productId: string) {
  return createPromotion(client, productId);
}

export async function listCreatorCommerceConversations(client: SupabaseClient): Promise<CreatorCommerceConversation[]> {
  const user = await requireUser(client);
  const conversations = await client
    .from('conversations')
    .select('id,storefront_id,updated_at')
    .eq('kind', 'business')
    .eq('business_context', 'creator_seller')
    .eq('business_customer_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (conversations.error) throw new Error(conversations.error.message);
  const ids = (conversations.data ?? []).map((row: any) => row.id);
  if (!ids.length) return [];

  const messages = await client.from('messages')
    .select('conversation_id,sender_id,body,created_at')
    .in('conversation_id', ids)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (messages.error) throw new Error(messages.error.message);
  const participantStates = await client.from('conversation_participants')
    .select('conversation_id,last_read_at,manually_unread_at')
    .eq('user_id', user.id)
    .in('conversation_id', ids);
  if (participantStates.error) throw new Error(participantStates.error.message);
  const participantStateByConversation = new Map(
    (participantStates.data ?? []).map((row: any) => [row.conversation_id, row]),
  );
  const latestByConversation = new Map<string, any>();
  (messages.data ?? []).forEach((message: any) => {
    if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message);
  });
  const creatorConversations = conversations.data ?? [];
  const storefrontIds = [...new Set(creatorConversations.map((row: any) => row.storefront_id))];
  const storefronts = await client.from('storefronts').select('id,name,slug,owner_id').in('id', storefrontIds);
  if (storefronts.error) throw new Error(storefronts.error.message);
  const storefrontById = new Map((storefronts.data ?? []).map((row: any) => [row.id, row]));
  return creatorConversations.flatMap((row: any) => {
    const latest = latestByConversation.get(row.id);
    const participantState = participantStateByConversation.get(row.id);
    const unreadCount = (messages.data ?? []).filter((message: any) =>
      message.conversation_id === row.id
      && message.sender_id !== user.id
      && (!participantState?.last_read_at || message.created_at > participantState.last_read_at)
    ).length || (participantState?.manually_unread_at ? 1 : 0);
    const storefront = storefrontById.get(row.storefront_id);
    return [{
      id: row.id,
      storefrontId: row.storefront_id,
      storefrontName: storefront?.name ?? 'Storefront',
      storefrontSlug: storefront?.slug ?? '',
      counterpartyId: storefront?.owner_id ?? '',
      counterpartyName: storefront?.name ?? 'Seller',
      counterpartyUsername: storefront?.slug ?? 'seller',
      lastMessage: latest?.body || 'Creator commerce conversation',
      updatedAt: latest?.created_at ?? row.updated_at,
      unreadCount,
    }];
  });
}

export async function searchApprovedSellers(
  client: SupabaseClient,
  query: string,
): Promise<CreatorSellerDirectoryEntry[]> {
  await requireUser(client);
  const { data, error } = await client.rpc('search_creator_seller_counterparties', {
    p_role: 'seller',
    p_query: query.trim(),
    p_limit: 20,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).flatMap((row) => {
    if (!row.storefront_id) return [];
    return [{
      userId: row.user_id,
      displayName: row.display_name?.trim() || row.username || 'Seller',
      username: row.username || row.user_id.slice(0, 8),
      storefrontId: row.storefront_id,
      storefrontName: row.storefront_name?.trim() || row.display_name?.trim() || 'Storefront',
      storefrontSlug: row.storefront_slug || '',
    } satisfies CreatorSellerDirectoryEntry];
  });
}

export async function openApprovedSellerConversation(
  client: SupabaseClient,
  sellerId: string,
) {
  await requireUser(client);
  const opened = await client.rpc('open_creator_seller_conversation', {
    target_user: sellerId,
    p_role: 'seller',
  });
  if (opened.error) throw new Error(opened.error.message);
  const conversationId = opened.data as string;
  const existing = await client.from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .contains('payload', { commerce_channel: creatorCommerceChannel, directory_context: true })
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data?.length) {
    const sent = await client.rpc('send_personal_message', {
      target_conversation: conversationId,
      message_body: 'Seller collaboration conversation opened.',
      message_kind: 'product',
      message_payload: {
        commerce_channel: creatorCommerceChannel,
        directory_context: true,
        product_title: 'General collaboration',
      },
      message_client_id: crypto.randomUUID(),
    });
    if (sent.error) throw new Error(sent.error.message);
  }
  return conversationId;
}

export async function openCreatorSellerConversation(
  client: SupabaseClient,
  input: { sellerId: string; productId: string; productTitle: string },
) {
  const opened = await client.rpc('open_creator_seller_conversation', {
    target_user: input.sellerId,
    p_role: 'seller',
  });
  if (opened.error) throw new Error(opened.error.message);
  const conversationId = opened.data as string;
  const existing = await client.from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .contains('payload', { commerce_channel: creatorCommerceChannel, product_id: input.productId })
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data?.length) {
    const sent = await client.rpc('send_personal_message', {
      target_conversation: conversationId,
      message_body: `Product context: ${input.productTitle}`,
      message_kind: 'product',
      message_payload: {
        commerce_channel: creatorCommerceChannel,
        product_id: input.productId,
        product_title: input.productTitle,
      },
      message_client_id: crypto.randomUUID(),
    });
    if (sent.error) throw new Error(sent.error.message);
  }
  return conversationId;
}

export async function listCreatorCommerceMessages(client: SupabaseClient, conversationId: string): Promise<CreatorCommerceMessage[]> {
  // The tag identifies the Creator-commerce conversation; the canonical thread includes every participant message.
  const { data, error } = await client.from('messages')
    .select('id,conversation_id,sender_id,kind,body,payload,created_at')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);
  const marked = await client.rpc('mark_personal_conversation_read', { target_conversation: conversationId });
  if (marked.error) throw new Error(marked.error.message);
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: row.kind,
    body: row.body ?? '',
    createdAt: row.created_at,
    productId: typeof row.payload?.product_id === 'string' ? row.payload.product_id : null,
    productTitle: typeof row.payload?.product_title === 'string' ? row.payload.product_title : null,
  }));
}

export async function sendCreatorCommerceMessage(client: SupabaseClient, conversationId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const { error } = await client.rpc('send_personal_message', {
    target_conversation: conversationId,
    message_body: text,
    message_kind: 'text',
    message_payload: { commerce_channel: creatorCommerceChannel },
    message_client_id: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
}
