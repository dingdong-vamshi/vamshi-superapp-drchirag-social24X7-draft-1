import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  type BusinessConversationSummary,
  type BusinessMessage,
  type CreatorConversationMessage,
  type CreatorConversationSummary,
  type CreatorDirectoryEntry,
  type CartLine,
  type ProductDraft,
  type SellerApplicationDraft,
  type SellerAnalytics,
  type SellerDashboard,
  type SellerFinanceSummary,
  type SellerOrder,
  type SellerOrderStatus,
  type SellerReturn,
  type ShopCategory,
  type ShopProduct,
  type ShopRepository,
  type StorefrontDraft,
  type StorefrontSummary,
  type UploadedMedia,
  type UploadAsset,
  formatInr,
  localShopRepository,
  slugify,
} from "./shopRepository";

const cartKeyForUser = (userId: string | null | undefined) =>
  `social24x7:commerce-cart:v3:${userId ?? "guest"}`;
const mediaBucket = "shop-media";
const privateProductMediaBucket = "product-media";
const productSelect =
  "id,storefront_id,title,slug,brand,price_minor,sale_price_minor,inventory,category,short_description,description,sku,status,cover_path,tags,search_keywords,seo_title,seo_description,llm_summary,creator_promotion_enabled,creator_commission_bps,return_window_days,storefronts!products_storefront_id_fkey(id,name,slug),product_media(path,position,storage_bucket)";

type StorefrontRow = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  seller_tier: "local" | "gst";
  state_code: string | null;
  city: string | null;
  support_phone: string | null;
  support_email: string | null;
  primary_category: Exclude<ShopCategory, "All"> | null;
  logo_path: string | null;
  banner_path: string | null;
  seo_title: string | null;
  seo_description: string | null;
  llm_summary: string | null;
  creator_promotion_enabled: boolean;
  creator_commission_bps: number;
  return_window_days: number;
  indexable?: boolean;
  geo_enabled?: boolean;
};

type ProductRow = {
  id: string;
  storefront_id: string;
  title: string;
  slug: string;
  brand: string | null;
  price_minor: number;
  sale_price_minor: number | null;
  inventory: number;
  category: Exclude<ShopCategory, "All">;
  short_description: string | null;
  description: string | null;
  sku: string | null;
  status: "draft" | "active" | "archived";
  cover_path: string | null;
  tags: string[] | null;
  search_keywords: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  llm_summary: string | null;
  creator_promotion_enabled: boolean;
  creator_commission_bps: number;
  return_window_days: number;
  storefronts:
    | {
        id: string;
        name: string;
        slug: string;
      }
    | {
        id: string;
        name: string;
        slug: string;
      }[]
    | null;
  product_media?: Array<{
    path: string;
    position: number | null;
    storage_bucket: "shop-media" | "product-media" | null;
  }> | null;
};

type SellerApplicationRow = {
  status: "submitted" | "approved";
};

type OrderRow = {
  id: string;
  customer_id: string;
  status: SellerOrderStatus;
  total_minor: number;
  payment_status: string | null;
  created_at: string;
  profiles:
    | { display_name: string | null; username: string | null }
    | { display_name: string | null; username: string | null }[]
    | null;
  order_fulfillments:
    | {
        carrier: string | null;
        tracking_number: string | null;
        package_reference: string | null;
        customer_note: string | null;
        updated_at: string | null;
      }
    | {
        carrier: string | null;
        tracking_number: string | null;
        package_reference: string | null;
        customer_note: string | null;
        updated_at: string | null;
      }[]
    | null;
  order_events:
    | Array<{ status: string; created_at: string }>
    | { status: string; created_at: string }
    | null;
};

type BusinessConversationRow = {
  id: string;
  created_by: string;
  business_customer_id?: string | null;
  updated_at: string;
  conversation_participants:
    | Array<{
        user_id: string;
        last_read_at?: string | null;
        manually_unread_at?: string | null;
        profiles:
          | { display_name: string | null; username: string | null }
          | { display_name: string | null; username: string | null }[]
          | null;
      }>
    | null;
  messages: Array<{
    sender_id?: string | null;
    body: string | null;
    created_at: string;
    payload?: Record<string, unknown> | null;
  }> | null;
};

type BusinessMessageRow = {
  id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  kind?: string;
  payload?: Record<string, unknown> | null;
};

type SellerReturnRow = {
  id: string;
  order_id: string;
  order_item_id: string;
  buyer_id: string;
  status: string;
  reason: string;
  details: string | null;
  admin_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
};

type SellerReturnItemRow = {
  id: string;
  product_title_snapshot: string;
  subtotal_minor: number;
  products: { category: string | null } | { category: string | null }[] | null;
};

type SellerReturnEvidenceRow = {
  id: string;
  return_request_id: string | null;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  evidence_source: "live_capture" | "uploaded_file";
  captured_at: string | null;
  created_at: string;
};

const accentByCategory: Record<Exclude<ShopCategory, "All">, string> = {
  Wellness: "#d9f8e7",
  Home: "#f7e3ca",
  Travel: "#e6e2da",
  Everyday: "#d9edff",
};

const toPublicUrl = (client: SupabaseClient, path?: string | null) =>
  path ? client.storage.from(mediaBucket).getPublicUrl(path).data.publicUrl : null;

const storefrontFromRow = (
  client: SupabaseClient,
  row: StorefrontRow,
): StorefrontSummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  tagline: row.tagline ?? "",
  description: row.description ?? "",
  sellerTier: row.seller_tier,
  stateCode: row.state_code ?? "",
  city: row.city ?? "",
  supportPhone: row.support_phone ?? "",
  supportEmail: row.support_email ?? "",
  primaryCategory: row.primary_category ?? "Everyday",
  logoUrl: toPublicUrl(client, row.logo_path),
  bannerUrl: toPublicUrl(client, row.banner_path),
  seoTitle: row.seo_title,
  seoDescription: row.seo_description,
  llmSummary: row.llm_summary,
  indexable: row.indexable ?? true,
  geoEnabled: row.geo_enabled ?? true,
});

const productFromRow = (
  client: SupabaseClient,
  row: ProductRow,
  resolvedMediaUrls = new Map<string, string>(),
): ShopProduct => {
  const storefront = Array.isArray(row.storefronts)
    ? row.storefronts[0]
    : row.storefronts;
  const media = [...(row.product_media ?? [])].sort(
    (left, right) => (left.position ?? 0) - (right.position ?? 0),
  );
  const coverPath = row.cover_path ?? media[0]?.path ?? null;
  return {
    id: row.id,
    storefrontId: row.storefront_id,
    storefrontName: storefront?.name ?? "Seller",
    storefrontSlug: storefront?.slug ?? "store",
    name: row.title,
    slug: row.slug,
    brand: row.brand ?? storefront?.name ?? "Seller",
    pricePaise: row.sale_price_minor ?? row.price_minor,
    rating: 4.8,
    reviewCount: 0,
    category: row.category,
    accent: accentByCategory[row.category] ?? "#eaf3ee",
    description: row.description ?? "",
    shortDescription: row.short_description ?? row.description ?? "",
    inStock: row.inventory > 0 && row.status === "active",
    inventory: row.inventory,
    sku: row.sku ?? "",
    coverUrl: coverPath
      ? resolvedMediaUrls.get(coverPath) ?? toPublicUrl(client, coverPath)
      : null,
    mediaUrls: media.map(
      (item) => resolvedMediaUrls.get(item.path) ?? toPublicUrl(client, item.path) ?? item.path,
    ),
    tags: row.tags ?? [],
    keywords: row.search_keywords ?? [],
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    llmSummary: row.llm_summary,
    creatorPromotionEnabled: row.creator_promotion_enabled,
    creatorCommissionBps: row.creator_commission_bps,
    returnWindowDays: row.return_window_days,
  };
};

const productFromRowWithMedia = async (
  client: SupabaseClient,
  row: ProductRow,
) => {
  const privatePaths = (row.product_media ?? [])
    .filter((item) => item.storage_bucket === privateProductMediaBucket)
    .map((item) => item.path);
  const resolved = new Map<string, string>();
  if (privatePaths.length) {
    const { data, error } = await client.storage
      .from(privateProductMediaBucket)
      .createSignedUrls(privatePaths, 60 * 60);
    if (!error) {
      (data ?? []).forEach((item, index) => {
        if (item.signedUrl) resolved.set(privatePaths[index], item.signedUrl);
      });
    }
  }
  return productFromRow(client, row, resolved);
};

const normalizeCategory = (
  category?: ShopCategory,
): Exclude<ShopCategory, "All"> | null =>
  !category || category === "All" ? null : category;

const firstRelation = <T,>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? value[0] : value ?? null;

export function createSupabaseShopRepository({
  client,
  user,
}: {
  client: SupabaseClient;
  user: User | null;
}): ShopRepository {
  const cartKey = cartKeyForUser(user?.id);
  const requireUser = () => {
    if (!user) {
      throw new Error("Please sign in with a Social 24x7 account first.");
    }
    return user;
  };

  return {
    async listProducts(input) {
      const category = normalizeCategory(input?.category);
      const queryText = input?.query?.trim();
      let storefrontIds: string[] = [];
      if (queryText) {
        const escapedStore = queryText.replace(/[%_,()]/g, " ");
        const storefrontResult = await client
          .from("storefronts")
          .select("id")
          .eq("active", true)
          .or(`name.ilike.%${escapedStore}%,slug.ilike.%${escapedStore}%,tagline.ilike.%${escapedStore}%`)
          .limit(30);
        if (storefrontResult.error) throw new Error(storefrontResult.error.message);
        storefrontIds = (storefrontResult.data || []).map((row) => row.id);
      }
      let query = client
        .from("products")
        .select(
          productSelect,
        )
        .eq("status", "active")
        .order("featured", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(60);

      if (category) query = query.eq("category", category);
      if (queryText) {
        const escaped = queryText.replace(/[%_,()]/g, " ");
        const categoryMatch = ["Wellness", "Home", "Travel", "Everyday"].find(
          (value) => value.toLocaleLowerCase() === queryText.trim().toLocaleLowerCase(),
        );
        const clauses = [
          `title.ilike.%${escaped}%`,
          `brand.ilike.%${escaped}%`,
          `short_description.ilike.%${escaped}%`,
          `description.ilike.%${escaped}%`,
        ];
        if (categoryMatch) clauses.push(`category.eq.${categoryMatch}`);
        if (storefrontIds.length) clauses.push(`storefront_id.in.(${storefrontIds.join(",")})`);
        query = query.or(clauses.join(","));
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return Promise.all((data as ProductRow[]).map((row) => productFromRowWithMedia(client, row)));
    },

    async listStorefronts() {
      const { data, error } = await client
        .from("storefronts")
        .select(
          "id,name,slug,tagline,description,seller_tier,state_code,city,support_phone,support_email,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary,indexable,geo_enabled",
        )
        .eq("active", true)
        .order("featured", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(24);
      if (error) throw new Error(error.message);
      return (data as StorefrontRow[]).map((row) => storefrontFromRow(client, row));
    },

    async getStorefrontBySlug(slug) {
      const { data, error } = await client
        .from("storefronts")
        .select(
          "id,name,slug,tagline,description,seller_tier,state_code,city,support_phone,support_email,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary",
        )
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? storefrontFromRow(client, data as StorefrontRow) : null;
    },

    async getProductBySlug(storefrontSlug, productSlug) {
      const { data, error } = await client
        .from("products")
        .select(
          "id,storefront_id,title,slug,brand,price_minor,sale_price_minor,inventory,category,short_description,description,sku,status,cover_path,tags,search_keywords,seo_title,seo_description,llm_summary,storefronts!inner(id,name,slug),product_media(path,position,storage_bucket)",
        )
        .eq("status", "active")
        .eq("slug", productSlug)
        .eq("storefronts.slug", storefrontSlug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? productFromRowWithMedia(client, data as ProductRow) : null;
    },

    async getCart() {
      if (user) {
        const { data, error } = await client
          .from("cart_items")
          .select("product_id,quantity,creator_product_promotions(tracking_code)")
          .order("updated_at", { ascending: false });
        if (error) throw new Error(error.message);
        return ((data as Array<{
          product_id: string;
          quantity: number;
          creator_product_promotions:
            | { tracking_code: string }[]
            | { tracking_code: string }
            | null;
        }> | null) ?? []).map((row) => ({
          productId: row.product_id,
          quantity: row.quantity,
          promotionCode: firstRelation(row.creator_product_promotions)?.tracking_code ?? null,
        }));
      }
      const raw = await AsyncStorage.getItem(cartKey);
      if (!raw) return [];
      try {
        return JSON.parse(raw) as CartLine[];
      } catch {
        return [];
      }
    },

    async saveCart(lines) {
      if (user) {
        const current = await this.getCart();
        const desired = new Map(lines.map((line) => [line.productId, line]));
        for (const line of current) {
          if (desired.has(line.productId)) continue;
          const { error } = await client.rpc("upsert_creator_commerce_cart_item", {
            p_product_id: line.productId,
            p_quantity: 0,
            p_tracking_code: null,
          });
          if (error) throw new Error(error.message);
        }
        for (const line of lines) {
          const existing = current.find((item) => item.productId === line.productId);
          const { error } = await client.rpc("upsert_creator_commerce_cart_item", {
            p_product_id: line.productId,
            p_quantity: line.quantity,
            p_tracking_code: line.promotionCode ?? existing?.promotionCode ?? null,
          });
          if (error) throw new Error(error.message);
        }
        return;
      }
      await AsyncStorage.setItem(cartKey, JSON.stringify(lines));
    },

    async getWishlistProductIds() {
      if (!user) {
        const raw = await AsyncStorage.getItem(`${cartKey}:wishlist`);
        try { return raw ? JSON.parse(raw) as string[] : []; } catch { return []; }
      }
      const { data, error } = await client
        .from("product_wishlists")
        .select("product_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as Array<{ product_id: string }> | null) ?? []).map((row) => row.product_id);
    },

    async toggleWishlist(productId) {
      const current = await this.getWishlistProductIds();
      if (!user) {
        const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
        await AsyncStorage.setItem(`${cartKey}:wishlist`, JSON.stringify(next));
        return next;
      }
      const saved = current.includes(productId);
      const result = saved
        ? await client.from("product_wishlists").delete().eq("user_id", user.id).eq("product_id", productId)
        : await client.from("product_wishlists").insert({ user_id: user.id, product_id: productId });
      if (result.error) throw new Error(result.error.message);
      return saved ? current.filter((id) => id !== productId) : [...current, productId];
    },

    async getSellerDashboard() {
      if (!user) {
        return {
          storefront: null,
          applicationStatus: "none",
          products: [],
        };
      }

      const [{ data: storefrontData, error: storefrontError }, { data: appData, error: appError }] =
        await Promise.all([
          client
            .from("storefronts")
            .select(
              "id,name,slug,tagline,description,seller_tier,state_code,city,support_phone,support_email,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary",
            )
            .eq("owner_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          client
            .from("seller_applications")
            .select("status")
            .eq("owner_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (storefrontError) throw new Error(storefrontError.message);
      if (appError) throw new Error(appError.message);

      const storefront = storefrontData
        ? storefrontFromRow(client, storefrontData as StorefrontRow)
        : null;

      const products = storefront
        ? await client
            .from("products")
            .select(
              productSelect,
            )
            .eq("storefront_id", storefront.id)
            .order("updated_at", { ascending: false })
        : { data: [], error: null };

      if (products.error) throw new Error(products.error.message);

      return {
        storefront,
        applicationStatus: (appData as SellerApplicationRow | null)?.status ?? "none",
        products: await Promise.all(
          ((products.data as ProductRow[] | null) ?? []).map((row) =>
            productFromRowWithMedia(client, row),
          ),
        ),
      } satisfies SellerDashboard;
    },

    async getSellerAnalytics() {
      const authUser = requireUser();
      const { data: storefront, error: storefrontError } = await client
        .from("storefronts")
        .select("id")
        .eq("owner_id", authUser.id)
        .maybeSingle();
      if (storefrontError) throw new Error(storefrontError.message);
      if (!storefront) return localShopRepository.getSellerAnalytics();

      const since = new Date();
      since.setDate(since.getDate() - 13);
      since.setHours(0, 0, 0, 0);
      const [{ data: eventData, error: eventError }, { data: orderData, error: orderError }] = await Promise.all([
        client.from("storefront_events").select("event_type,visitor_id,session_key,occurred_at").eq("storefront_id", storefront.id).gte("occurred_at", since.toISOString()).order("occurred_at", { ascending: true }).limit(5000),
        client.from("orders").select("id,total_minor,payment_method,status,created_at").eq("storefront_id", storefront.id).gte("created_at", since.toISOString()).order("created_at", { ascending: true }).limit(5000),
      ]);
      if (eventError) throw new Error(eventError.message);
      if (orderError) throw new Error(orderError.message);

      const dayKeys = Array.from({ length: 14 }, (_, index) => {
        const date = new Date(since);
        date.setDate(date.getDate() + index);
        return date.toISOString().slice(0, 10);
      });
      const buckets = new Map(dayKeys.map((key) => [key, { label: key.slice(8), views: 0, visitors: new Set<string>(), orders: 0 }]));
      const events = (eventData ?? []) as Array<{ event_type: string; visitor_id: string | null; session_key: string; occurred_at: string }>;
      const visitors = new Set<string>();
      const dailyVisitors = new Set<string>();
      events.forEach((event) => {
        const key = event.occurred_at.slice(0, 10);
        const bucket = buckets.get(key);
        const visitor = event.visitor_id ?? event.session_key;
        visitors.add(visitor);
        if (key === dayKeys[dayKeys.length - 1]) dailyVisitors.add(visitor);
        if (bucket) {
          if (event.event_type === "storefront_view") bucket.views += 1;
          bucket.visitors.add(visitor);
        }
      });
      const orders = (orderData ?? []) as Array<{ id: string; total_minor: number; payment_method: string; status: string; created_at: string }>;
      orders.forEach((order) => { const bucket = buckets.get(order.created_at.slice(0, 10)); if (bucket) bucket.orders += 1; });
      const paidOrders = orders.filter((order) => !["draft", "cancelled", "refunded"].includes(order.status));
      const onlineOrders = paidOrders.filter((order) => order.payment_method !== "cod").length;
      const codOrders = paidOrders.filter((order) => order.payment_method === "cod").length;
      const storefrontViews = events.filter((event) => event.event_type === "storefront_view").length;

      return {
        dailyActiveVisitors: dailyVisitors.size,
        monthlyActiveVisitors: visitors.size,
        storefrontViews,
        productViews: events.filter((event) => event.event_type === "product_view").length,
        ordersPlaced: paidOrders.length,
        conversionRate: storefrontViews ? Math.round((paidOrders.length / storefrontViews) * 1000) / 10 : 0,
        revenuePaise: paidOrders.reduce((total, order) => total + order.total_minor, 0),
        dailySeries: dayKeys.map((key) => { const bucket = buckets.get(key)!; return { label: bucket.label, views: bucket.views, visitors: bucket.visitors.size, orders: bucket.orders }; }),
        paymentMix: [{ label: "Online", value: onlineOrders }, { label: "Cash on delivery", value: codOrders }],
      } satisfies SellerAnalytics;
    },

    async getSellerFinanceSummary() {
      const authUser = requireUser();
      const { data: storefront, error: storefrontError } = await client
        .from("storefronts")
        .select("id")
        .eq("owner_id", authUser.id)
        .maybeSingle();
      if (storefrontError) throw new Error(storefrontError.message);
      if (!storefront) return localShopRepository.getSellerFinanceSummary();

      const [ordersResult, commissionResult, returnsResult] = await Promise.all([
        client.from("orders").select("id,total_minor,status").eq("storefront_id", storefront.id).limit(5000),
        client.from("creator_commissions").select("commission_minor,status").eq("storefront_id", storefront.id).limit(5000),
        client.from("return_requests").select("id,status,order_item_id").eq("storefront_id", storefront.id).limit(5000),
      ]);
      if (ordersResult.error) throw new Error(ordersResult.error.message);
      if (commissionResult.error) throw new Error(commissionResult.error.message);
      if (returnsResult.error) throw new Error(returnsResult.error.message);

      const orders = (ordersResult.data ?? []) as Array<{ id: string; total_minor: number; status: string }>;
      const qualifyingOrders = orders.filter((order) => !["draft", "cancelled", "refunded"].includes(order.status));
      const commissions = (commissionResult.data ?? []) as Array<{ commission_minor: number; status: string }>;
      const activeCommission = commissions
        .filter((commission) => !["reversed", "cancelled"].includes(commission.status))
        .reduce((total, commission) => total + commission.commission_minor, 0);
      const returns = (returnsResult.data ?? []) as Array<{ id: string; status: string; order_item_id: string }>;
      const approvedItemIds = returns
        .filter((request) => ["approved", "received", "refunded"].includes(request.status))
        .map((request) => request.order_item_id);
      let approvedReturnsPaise = 0;
      if (approvedItemIds.length) {
        const { data: itemData, error: itemError } = await client
          .from("order_items")
          .select("id,subtotal_minor")
          .in("id", approvedItemIds);
        if (itemError) throw new Error(itemError.message);
        approvedReturnsPaise = ((itemData ?? []) as Array<{ id: string; subtotal_minor: number }>)
          .reduce((total, item) => total + item.subtotal_minor, 0);
      }
      const grossOrderValuePaise = qualifyingOrders.reduce((total, order) => total + order.total_minor, 0);
      return {
        grossOrderValuePaise,
        deliveredSalesPaise: orders
          .filter((order) => order.status === "delivered")
          .reduce((total, order) => total + order.total_minor, 0),
        creatorCommissionPaise: activeCommission,
        approvedReturnsPaise,
        estimatedSellerAmountPaise: Math.max(0, grossOrderValuePaise - activeCommission - approvedReturnsPaise),
        qualifyingOrderCount: qualifyingOrders.length,
        returnRequestCount: returns.length,
      } satisfies SellerFinanceSummary;
    },

    async listSellerOrders() {
      const authUser = requireUser();
      const { data: storefront, error: storefrontError } = await client
        .from("storefronts")
        .select("id")
        .eq("owner_id", authUser.id)
        .maybeSingle();
      if (storefrontError) throw new Error(storefrontError.message);
      if (!storefront) return [];

      const { data, error } = await client
        .from("orders")
        .select(
          "id,customer_id,status,total_minor,payment_status,created_at,profiles!orders_customer_id_fkey(display_name,username),order_fulfillments(carrier,tracking_number,package_reference,customer_note,updated_at),order_events(status,created_at)",
        )
        .eq("storefront_id", storefront.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);

      return ((data as OrderRow[] | null) ?? []).map((row) => {
        const profile = firstRelation(row.profiles);
        const fulfillment = firstRelation(row.order_fulfillments);
        const dispatchEvent = (Array.isArray(row.order_events) ? row.order_events : row.order_events ? [row.order_events] : [])
          .filter((event) => event.status === "shipped")
          .sort((left, right) => left.created_at.localeCompare(right.created_at))[0];
        return {
          id: row.id,
          customerId: row.customer_id,
          customerName: profile?.display_name?.trim() || profile?.username || "Customer",
          customerUsername: profile?.username || row.customer_id.slice(0, 8),
          createdAt: row.created_at,
          dispatchAt: dispatchEvent?.created_at ?? null,
          totalPaise: row.total_minor,
          paymentStatus: row.payment_status || "Payment pending",
          status: row.status,
          fulfillment: fulfillment
            ? {
                carrier: fulfillment.carrier ?? "",
                trackingNumber: fulfillment.tracking_number ?? "",
                packageReference: fulfillment.package_reference ?? "",
                customerNote: fulfillment.customer_note ?? "",
              }
            : null,
        } satisfies SellerOrder;
      });
    },

    async listSellerReturns() {
      const authUser = requireUser();
      const { data: storefront, error: storefrontError } = await client
        .from("storefronts")
        .select("id")
        .eq("owner_id", authUser.id)
        .maybeSingle();
      if (storefrontError) throw new Error(storefrontError.message);
      if (!storefront) return [];

      const { data, error } = await client
        .from("return_requests")
        .select("id,order_id,order_item_id,buyer_id,status,reason,details,admin_note,requested_at,reviewed_at")
        .eq("storefront_id", storefront.id)
        .order("requested_at", { ascending: false })
        .limit(250);
      if (error) throw new Error(error.message);
      const requests = ((data as SellerReturnRow[] | null) ?? []);
      if (!requests.length) return [];

      const buyerIds = [...new Set(requests.map((request) => request.buyer_id))];
      const itemIds = requests.map((request) => request.order_item_id);
      const returnIds = requests.map((request) => request.id);
      const [profilesResult, itemsResult, evidenceResult] = await Promise.all([
        client.from("profiles").select("id,display_name,username").in("id", buyerIds),
        client.from("order_items").select("id,product_title_snapshot,subtotal_minor,products(category)").in("id", itemIds),
        client.from("commerce_order_evidence")
          .select("id,return_request_id,storage_path,file_name,mime_type,evidence_source,captured_at,created_at")
          .in("return_request_id", returnIds)
          .order("created_at", { ascending: false }),
      ]);
      if (profilesResult.error) throw new Error(profilesResult.error.message);
      if (itemsResult.error) throw new Error(itemsResult.error.message);
      if (evidenceResult.error) throw new Error(evidenceResult.error.message);
      const evidenceRows = (evidenceResult.data as SellerReturnEvidenceRow[] | null) ?? [];
      const signed = evidenceRows.length
        ? await client.storage.from("creator-commerce-private").createSignedUrls(evidenceRows.map((item) => item.storage_path), 3600)
        : { data: [], error: null };
      if (signed.error) throw new Error(signed.error.message);
      const profileById = new Map(((profilesResult.data ?? []) as Array<{ id: string; display_name: string | null; username: string | null }>).map((profile) => [profile.id, profile]));
      const itemById = new Map(((itemsResult.data as SellerReturnItemRow[] | null) ?? []).map((item) => [item.id, item]));
      const signedByPath = new Map(evidenceRows.map((item, index) => [item.storage_path, signed.data?.[index]?.signedUrl]));

      return requests.map((request) => {
        const buyer = profileById.get(request.buyer_id);
        const item = itemById.get(request.order_item_id);
        return {
          id: request.id,
          orderId: request.order_id,
          orderItemId: request.order_item_id,
          buyerId: request.buyer_id,
          buyerName: buyer?.display_name?.trim() || buyer?.username || "Buyer",
          buyerUsername: buyer?.username || request.buyer_id.slice(0, 8),
          productTitle: item?.product_title_snapshot ?? "Product",
          productCategory: firstRelation(item?.products)?.category ?? "Uncategorised",
          itemSubtotalPaise: item?.subtotal_minor ?? 0,
          status: request.status,
          reason: request.reason,
          details: request.details ?? undefined,
          sellerNote: request.admin_note ?? undefined,
          requestedAt: request.requested_at,
          reviewedAt: request.reviewed_at ?? undefined,
          trackingStatus: request.status === "submitted"
            ? "Return Requested"
            : request.status === "under_review"
              ? "More Information Required"
              : request.status === "approved"
                ? "Awaiting Return Dispatch"
                : request.status === "received"
                  ? "Returned to Seller"
                  : request.status === "refunded"
                    ? "Refunded / Closed"
                    : request.status === "cancelled"
                      ? "Cancelled"
                      : "Closed",
          evidence: evidenceRows
            .filter((evidence) => evidence.return_request_id === request.id)
            .map((evidence) => ({
              id: evidence.id,
              filename: evidence.file_name || "Return evidence",
              mimeType: evidence.mime_type || "application/octet-stream",
              source: evidence.evidence_source,
              createdAt: evidence.created_at,
              capturedAt: evidence.captured_at ?? undefined,
              signedUrl: signedByPath.get(evidence.storage_path) ?? undefined,
            })),
        } satisfies SellerReturn;
      });
    },

    async reviewSellerReturn(input) {
      requireUser();
      const { error } = await client.rpc("seller_review_creator_commerce_return", {
        p_return_request_id: input.returnRequestId,
        p_decision: input.decision,
        p_reason: input.reason?.trim() || null,
      });
      if (error) throw new Error(error.message);
    },

    async updateSellerOrder(input) {
      const authUser = requireUser();
      const { error: orderError } = await client
        .from("orders")
        .update({ status: input.status })
        .eq("id", input.orderId);
      if (orderError) throw new Error(orderError.message);

      const { error: fulfillmentError } = await client
        .from("order_fulfillments")
        .upsert(
          {
            order_id: input.orderId,
            status: input.status,
            carrier: input.carrier.trim(),
            tracking_number: input.trackingNumber.trim(),
            package_reference: input.packageReference.trim(),
            customer_note: input.customerNote.trim(),
            updated_by: authUser.id,
          },
          { onConflict: "order_id" },
        );
      if (fulfillmentError) throw new Error(fulfillmentError.message);

      const statusLabel = input.status.replaceAll("_", " ");
      const { error: eventError } = await client.from("order_events").insert({
        order_id: input.orderId,
        actor_id: authUser.id,
        status: input.status,
        detail: input.trackingNumber.trim()
          ? `${statusLabel}: ${input.carrier.trim() || "Carrier"} · ${input.trackingNumber.trim()}`
          : `Order marked ${statusLabel}.`,
      });
      if (eventError) throw new Error(eventError.message);
    },

    async listBusinessConversations() {
      const authUser = requireUser();
      const { data: storefront, error: storefrontError } = await client
        .from("storefronts")
        .select("id")
        .eq("owner_id", authUser.id)
        .maybeSingle();
      if (storefrontError) throw new Error(storefrontError.message);
      if (!storefront) return [];

      const { data, error } = await client
        .from("conversations")
        .select(
          "id,created_by,updated_at,conversation_participants(user_id,profiles!conversation_participants_user_id_fkey(display_name,username)),messages(body,created_at)",
        )
        .eq("kind", "business")
        .eq("business_context", "buyer_seller")
        .eq("storefront_id", storefront.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);

      return ((data as BusinessConversationRow[] | null) ?? []).map((row) => {
        const customer = (row.conversation_participants ?? []).find(
          (participant) => participant.user_id !== authUser.id,
        );
        const profile = firstRelation(customer?.profiles);
        const latest = [...(row.messages ?? [])].sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        )[0];
        return {
          id: row.id,
          customerId: customer?.user_id ?? row.created_by,
          customerName: profile?.display_name?.trim() || profile?.username || "Customer",
          customerUsername: profile?.username || "customer",
          lastMessage: latest?.body || "New business conversation",
          updatedAt: latest?.created_at || row.updated_at,
        } satisfies BusinessConversationSummary;
      });
    },

    async listBusinessMessages(conversationId) {
      requireUser();
      const { data, error } = await client
        .from("messages")
        .select("id,sender_id,body,created_at")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw new Error(error.message);
      return ((data as BusinessMessageRow[] | null) ?? []).map((row) => ({
        id: row.id,
        senderId: row.sender_id,
        body: row.body ?? "",
        createdAt: row.created_at,
      }));
    },

    async sendBusinessMessage(conversationId, body) {
      const authUser = requireUser();
      const text = body.trim();
      if (!text) return;
      const { error } = await client.from("messages").insert({
        conversation_id: conversationId,
        sender_id: authUser.id,
        body: text,
        kind: "text",
      });
      if (error) throw new Error(error.message);
    },

    async listCreatorConversations() {
      const authUser = requireUser();
      const { data: storefront, error: storefrontError } = await client
        .from("storefronts")
        .select("id")
        .eq("owner_id", authUser.id)
        .maybeSingle();
      if (storefrontError) throw new Error(storefrontError.message);
      if (!storefront) return [];

      const { data, error } = await client
        .from("conversations")
        .select(
          "id,created_by,business_customer_id,updated_at,conversation_participants(user_id,last_read_at,manually_unread_at,profiles!conversation_participants_user_id_fkey(display_name,username)),messages(sender_id,body,created_at,payload)",
        )
        .eq("kind", "business")
        .eq("business_context", "creator_seller")
        .eq("storefront_id", storefront.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);

      return ((data as BusinessConversationRow[] | null) ?? []).map((row) => {
        const creatorId = row.business_customer_id ?? row.created_by;
        const creator = (row.conversation_participants ?? []).find(
          (participant) => participant.user_id === creatorId,
        );
        const profile = firstRelation(creator?.profiles);
        // The tag identifies the Creator-commerce conversation; the canonical thread includes every participant message.
        const latest = [...(row.messages ?? [])].sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        )[0];
        const viewerState = (row.conversation_participants ?? []).find(
          (participant) => participant.user_id === authUser.id,
        );
        const unreadCount = (row.messages ?? []).filter((message) =>
          message.sender_id
          && message.sender_id !== authUser.id
          && (!viewerState?.last_read_at || message.created_at > viewerState.last_read_at)
        ).length || (viewerState?.manually_unread_at ? 1 : 0);
        return {
          id: row.id,
          creatorId,
          creatorName: profile?.display_name?.trim() || profile?.username || "Creator",
          creatorUsername: profile?.username || "creator",
          lastMessage: latest?.body || "Creator commerce enquiry",
          updatedAt: latest?.created_at || row.updated_at,
          unreadCount,
        } satisfies CreatorConversationSummary;
      });
    },

    async listCreatorMessages(conversationId) {
      requireUser();
      // The tag identifies the Creator-commerce conversation; the canonical thread includes every participant message.
      const { data, error } = await client
        .from("messages")
        .select("id,sender_id,body,created_at,kind,payload")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw new Error(error.message);
      const marked = await client.rpc("mark_personal_conversation_read", { target_conversation: conversationId });
      if (marked.error) throw new Error(marked.error.message);
      return ((data as BusinessMessageRow[] | null) ?? []).map((row) => ({
        id: row.id,
        senderId: row.sender_id,
        body: row.body ?? "",
        createdAt: row.created_at,
        kind: row.kind ?? "text",
        productTitle: typeof row.payload?.product_title === "string"
          ? row.payload.product_title
          : undefined,
      } satisfies CreatorConversationMessage));
    },

    async sendCreatorMessage(conversationId, body) {
      const text = body.trim();
      if (!text) return;
      const { error } = await client.rpc("send_personal_message", {
        target_conversation: conversationId,
        message_body: text,
        message_kind: "text",
        message_payload: { commerce_channel: "creator_seller" },
        message_client_id: globalThis.crypto.randomUUID(),
      });
      if (error) throw new Error(error.message);
    },

    async searchApprovedCreators(query) {
      requireUser();
      const { data, error } = await client.rpc("search_creator_seller_counterparties", {
        p_role: "creator",
        p_query: query.trim(),
        p_limit: 20,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ user_id: string; display_name: string | null; username: string | null }>).map((row) => ({
        userId: row.user_id,
        displayName: row.display_name?.trim() || row.username || "Creator",
        username: row.username || row.user_id.slice(0, 8),
      } satisfies CreatorDirectoryEntry));
    },

    async openCreatorConversation(creatorId) {
      requireUser();
      const { data, error } = await client.rpc("open_creator_seller_conversation", {
        target_user: creatorId,
        p_role: "creator",
      });
      if (error) throw new Error(error.message);
      const conversationId = data as string;
      const existing = await client
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .contains("payload", { commerce_channel: "creator_seller", directory_context: true })
        .limit(1);
      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data?.length) {
        const sent = await client.rpc("send_personal_message", {
          target_conversation: conversationId,
          message_body: "Creator collaboration conversation opened.",
          message_kind: "product",
          message_payload: { commerce_channel: "creator_seller", directory_context: true, product_title: "General collaboration" },
          message_client_id: globalThis.crypto.randomUUID(),
        });
        if (sent.error) throw new Error(sent.error.message);
      }
      return conversationId;
    },

    subscribeCreatorMessages(conversationId, onChange) {
      const channel = client
        .channel(`seller-creator-commerce-${conversationId}-${globalThis.crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          () => onChange(),
        )
        .subscribe();
      return () => { void client.removeChannel(channel); };
    },

    async submitSellerApplication(draft) {
      const authUser = requireUser();
      const slug = slugify(draft.storefrontSlug || draft.storefrontName);
      const storefrontPayload = {
        owner_id: authUser.id,
        name: draft.storefrontName.trim(),
        slug,
        tagline: draft.tagline.trim(),
        description: draft.description.trim(),
        seller_tier: draft.sellerTier,
        business_type: draft.businessType.trim() || "independent",
        state_code: draft.stateCode.trim().toUpperCase(),
        city: draft.city.trim(),
        support_phone: draft.phone.trim(),
        support_email: draft.email.trim().toLowerCase(),
        primary_category: draft.primaryCategory,
        seo_title: draft.seoTitle.trim(),
        seo_description: draft.seoDescription.trim(),
        llm_summary: draft.llmSummary.trim(),
        indexable: draft.indexable ?? true,
        geo_enabled: draft.geoEnabled ?? true,
        active: true,
        verification_status: "approved",
      };

      const { data: storefrontData, error: storefrontError } = await client
        .from("storefronts")
        .upsert(storefrontPayload, { onConflict: "owner_id" })
        .select(
          "id,name,slug,tagline,description,seller_tier,state_code,city,support_phone,support_email,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary",
        )
        .single();
      if (storefrontError) throw new Error(storefrontError.message);

      const { error: appError } = await client.from("seller_applications").upsert(
        {
          owner_id: authUser.id,
          storefront_id: storefrontData.id,
          legal_name: draft.legalName.trim(),
          storefront_name: draft.storefrontName.trim(),
          storefront_slug: slug,
          business_type: draft.businessType.trim() || "independent",
          seller_tier: draft.sellerTier,
          state_code: draft.stateCode.trim().toUpperCase(),
          city: draft.city.trim(),
          phone: draft.phone.trim(),
          email: draft.email.trim().toLowerCase(),
          address_line: draft.addressLine.trim(),
          gstin: draft.gstin?.trim() || null,
          status: "approved",
          verification_mode: "self_attested",
        },
        { onConflict: "owner_id" },
      );
      if (appError) throw new Error(appError.message);

      return storefrontFromRow(client, storefrontData as StorefrontRow);
    },

    async saveStorefront(draft) {
      const authUser = requireUser();
      const payload = {
        owner_id: authUser.id,
        name: draft.storefrontName.trim(),
        slug: slugify(draft.storefrontSlug || draft.storefrontName),
        tagline: draft.tagline.trim(),
        description: draft.description.trim(),
        seller_tier: draft.sellerTier,
        business_type: draft.businessType.trim() || "independent",
        state_code: draft.stateCode.trim().toUpperCase(),
        city: draft.city.trim(),
        support_phone: draft.phone.trim(),
        support_email: draft.email.trim().toLowerCase(),
        primary_category: draft.primaryCategory,
        seo_title: draft.seoTitle.trim(),
        seo_description: draft.seoDescription.trim(),
        llm_summary: draft.llmSummary.trim(),
        indexable: draft.indexable ?? true,
        geo_enabled: draft.geoEnabled ?? true,
        active: true,
      };
      const { data, error } = await client
        .from("storefronts")
        .upsert(payload, { onConflict: "owner_id" })
        .select(
          "id,name,slug,tagline,description,seller_tier,state_code,city,support_phone,support_email,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary",
        )
        .single();
      if (error) throw new Error(error.message);
      return storefrontFromRow(client, data as StorefrontRow);
    },

    async saveProduct(draft) {
      const authUser = requireUser();
      const { data: storefrontData, error: storefrontError } = await client
        .from("storefronts")
        .select("id,name,slug,tagline,description,seller_tier,state_code,city,support_phone,support_email,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary")
        .eq("owner_id", authUser.id)
        .limit(1)
        .single();
      if (storefrontError) throw new Error(storefrontError.message);

      const saved = await client.rpc("save_creator_commerce_product", {
        p_product_id: draft.id ?? null,
        p_title: draft.title.trim(),
        p_slug: slugify(draft.slug || draft.title),
        p_category: draft.category,
        p_price_minor: Math.max(0, draft.pricePaise),
        p_sale_price_minor: null,
        p_inventory: Math.max(0, draft.inventory),
        p_sku: draft.sku.trim(),
        p_short_description: draft.shortDescription.trim(),
        p_description: draft.description.trim(),
        p_creator_promotion_enabled: draft.creatorPromotionEnabled,
        p_creator_commission_bps: draft.creatorPromotionEnabled ? draft.creatorCommissionBps : 0,
        p_return_window_days: draft.returnWindowDays,
      });
      if (saved.error) throw new Error(saved.error.message);
      const savedProduct = saved.data as ProductRow;
      const { data, error } = await client
        .from("products")
        .update({
          brand: draft.brand.trim() || storefrontData.name,
          tags: draft.tags,
          search_keywords: draft.keywords,
          seo_title: draft.seoTitle.trim(),
          seo_description: draft.seoDescription.trim(),
          llm_summary: draft.llmSummary.trim(),
        })
        .eq("id", savedProduct.id)
        .select(
          productSelect,
        )
        .single();
      if (error) throw new Error(error.message);
      return productFromRowWithMedia(client, data as ProductRow);
    },

    async setCreatorPromotion(input) {
      requireUser();
      const { data: rawData, error: rawError } = await client
        .from("products")
        .select("id,title,slug,category,price_minor,sale_price_minor,inventory,sku,short_description,description,creator_promotion_enabled,creator_commission_bps,return_window_days")
        .eq("id", input.productId)
        .single();
      if (rawError) throw new Error(rawError.message);
      const raw = rawData as Pick<ProductRow, "id" | "title" | "slug" | "category" | "price_minor" | "sale_price_minor" | "inventory" | "sku" | "short_description" | "description" | "return_window_days">;
      const saved = await client.rpc("save_creator_commerce_product", {
        p_product_id: raw.id,
        p_title: raw.title,
        p_slug: raw.slug,
        p_category: raw.category,
        p_price_minor: raw.price_minor,
        p_sale_price_minor: raw.sale_price_minor,
        p_inventory: raw.inventory,
        p_sku: raw.sku ?? "",
        p_short_description: raw.short_description ?? "",
        p_description: raw.description ?? "",
        p_creator_promotion_enabled: input.enabled,
        p_creator_commission_bps: input.enabled ? input.commissionBps : 0,
        p_return_window_days: raw.return_window_days,
      });
      if (saved.error) throw new Error(saved.error.message);
      const { data, error } = await client
        .from("products")
        .select(productSelect)
        .eq("id", input.productId)
        .single();
      if (error) throw new Error(error.message);
      return productFromRowWithMedia(client, data as ProductRow);
    },

    async publishProduct(productId) {
      const { data, error } = await client.rpc("publish_creator_commerce_product", {
        p_product_id: productId,
      });
      if (error) throw new Error(error.message);
      const { data: productData, error: productError } = await client
        .from("products")
        .select(productSelect)
        .eq("id", productId)
        .single();
      if (productError) throw new Error(productError.message);
      return productFromRowWithMedia(client, (productData ?? data) as ProductRow);
    },

    async uploadProductMedia(_storefrontId, productId, assets) {
      const authUser = requireUser();
      const uploads: UploadedMedia[] = [];
      for (const [index, asset] of assets.entries()) {
        const response = await fetch(asset.uri);
        const bytes = await response.arrayBuffer();
        const mimeType = asset.mimeType ?? "image/jpeg";
        if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
          throw new Error("Product media supports JPEG, PNG, and WebP images only.");
        }
        if (bytes.byteLength < 1 || bytes.byteLength > 10 * 1024 * 1024) {
          throw new Error("Each Product image must be no larger than 10 MiB.");
        }
        const fallbackExtension = asset.mimeType?.includes("png")
          ? "png"
          : asset.mimeType?.includes("webp")
            ? "webp"
            : "jpg";
        const rawExtension = asset.fileName?.split(".").pop()?.toLowerCase();
        const extension =
          rawExtension && /^[a-z0-9]{2,5}$/.test(rawExtension)
            ? rawExtension
            : fallbackExtension;
        const path = `${authUser.id}/products/${productId}/${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}`}.${extension}`;
        const { error } = await client.storage.from(privateProductMediaBucket).upload(path, bytes, {
          contentType: mimeType,
          upsert: false,
          cacheControl: "3600",
        });
        if (error) throw new Error(error.message);
        uploads.push({
          path,
          url: asset.uri,
          storageBucket: privateProductMediaBucket,
          mediaType: "image",
          position: index,
          isPrimary: index === 0,
          originalFilename: asset.fileName ?? null,
          mimeType,
          bytes: bytes.byteLength,
        });
      }
      return uploads;
    },

    async replaceProductMedia(productId, media) {
      requireUser();
      const { data: previousMedia } = await client
        .from("product_media")
        .select("path,storage_bucket")
        .eq("product_id", productId);
      const { error: replaceError } = await client.rpc(
        "replace_creator_commerce_product_media",
        {
          p_product_id: productId,
          p_media: media.map((item, index) => ({
            path: item.path,
            media_type: "image",
            alt_text: item.altText ?? "",
            position: index,
            is_primary: index === 0,
            original_filename: item.originalFilename ?? null,
            mime_type: item.mimeType ?? "image/jpeg",
            bytes: item.bytes ?? 1,
            width: item.width ?? null,
            height: item.height ?? null,
          })),
        },
      );
      if (replaceError) {
        await client.storage
          .from(privateProductMediaBucket)
          .remove(media.map((item) => item.path));
        throw new Error(replaceError.message);
      }

      const stalePrivatePaths = (previousMedia ?? [])
        .filter(
          (item) => item.storage_bucket === privateProductMediaBucket
            && !media.some((next) => next.path === item.path),
        )
        .map((item) => item.path);
      if (stalePrivatePaths.length) {
        await client.storage.from(privateProductMediaBucket).remove(stalePrivatePaths);
      }

      const { data, error } = await client
        .from("products")
        .select(
          productSelect,
        )
        .eq("id", productId)
        .single();
      if (error) throw new Error(error.message);
      return {
        ...(await productFromRowWithMedia(client, data as ProductRow)),
        coverUrl: media[0]?.url ?? null,
        mediaUrls: media.map((item) => item.url),
      };
    },
  };
}

export function productShareLine(product: ShopProduct) {
  return `${product.name} · ${formatInr(product.pricePaise)} · @${product.storefrontSlug}`;
}
