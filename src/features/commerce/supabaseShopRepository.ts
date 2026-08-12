import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  type BusinessConversationSummary,
  type BusinessMessage,
  type CartLine,
  type ProductDraft,
  type SellerApplicationDraft,
  type SellerAnalytics,
  type SellerDashboard,
  type SellerOrder,
  type SellerOrderStatus,
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

const cartKey = "social24x7:commerce-cart:v2";
const mediaBucket = "shop-media";

type StorefrontRow = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  seller_tier: "local" | "gst";
  state_code: string | null;
  primary_category: Exclude<ShopCategory, "All"> | null;
  logo_path: string | null;
  banner_path: string | null;
  seo_title: string | null;
  seo_description: string | null;
  llm_summary: string | null;
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
  product_media?: Array<{ path: string; position: number | null }> | null;
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
      }
    | {
        carrier: string | null;
        tracking_number: string | null;
        package_reference: string | null;
        customer_note: string | null;
      }[]
    | null;
};

type BusinessConversationRow = {
  id: string;
  created_by: string;
  updated_at: string;
  conversation_participants:
    | Array<{
        user_id: string;
        profiles:
          | { display_name: string | null; username: string | null }
          | { display_name: string | null; username: string | null }[]
          | null;
      }>
    | null;
  messages: Array<{ body: string | null; created_at: string }> | null;
};

type BusinessMessageRow = {
  id: string;
  sender_id: string;
  body: string | null;
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
    coverUrl: toPublicUrl(client, coverPath),
    mediaUrls: media.map((item) => toPublicUrl(client, item.path) ?? item.path),
    tags: row.tags ?? [],
    keywords: row.search_keywords ?? [],
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    llmSummary: row.llm_summary,
  };
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
      let query = client
        .from("products")
        .select(
          "id,storefront_id,title,slug,brand,price_minor,sale_price_minor,inventory,category,short_description,description,sku,status,cover_path,tags,search_keywords,seo_title,seo_description,llm_summary,storefronts!products_storefront_id_fkey(id,name,slug),product_media(path,position)",
        )
        .eq("status", "active")
        .order("featured", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(60);

      if (category) query = query.eq("category", category);
      if (queryText) {
        const escaped = queryText.replace(/[%_,]/g, " ");
        query = query.or(`title.ilike.%${escaped}%,brand.ilike.%${escaped}%`);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data as ProductRow[]).map((row) => productFromRow(client, row));
    },

    async listStorefronts() {
      const { data, error } = await client
        .from("storefronts")
        .select(
          "id,name,slug,tagline,description,seller_tier,state_code,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary,indexable,geo_enabled",
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
          "id,name,slug,tagline,description,seller_tier,state_code,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary",
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
          "id,storefront_id,title,slug,brand,price_minor,sale_price_minor,inventory,category,short_description,description,sku,status,cover_path,tags,search_keywords,seo_title,seo_description,llm_summary,storefronts!inner(id,name,slug),product_media(path,position)",
        )
        .eq("status", "active")
        .eq("slug", productSlug)
        .eq("storefronts.slug", storefrontSlug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? productFromRow(client, data as ProductRow) : null;
    },

    async getCart() {
      const raw = await AsyncStorage.getItem(cartKey);
      if (!raw) return [];
      try {
        return JSON.parse(raw) as CartLine[];
      } catch {
        return [];
      }
    },

    async saveCart(lines) {
      await AsyncStorage.setItem(cartKey, JSON.stringify(lines));
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
              "id,name,slug,tagline,description,seller_tier,state_code,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary",
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
              "id,storefront_id,title,slug,brand,price_minor,sale_price_minor,inventory,category,short_description,description,sku,status,cover_path,tags,search_keywords,seo_title,seo_description,llm_summary,storefronts!products_storefront_id_fkey(id,name,slug),product_media(path,position)",
            )
            .eq("storefront_id", storefront.id)
            .order("updated_at", { ascending: false })
        : { data: [], error: null };

      if (products.error) throw new Error(products.error.message);

      return {
        storefront,
        applicationStatus: (appData as SellerApplicationRow | null)?.status ?? "none",
        products: ((products.data as ProductRow[] | null) ?? []).map((row) =>
          productFromRow(client, row),
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
          "id,customer_id,status,total_minor,payment_status,created_at,profiles!orders_customer_id_fkey(display_name,username),order_fulfillments(carrier,tracking_number,package_reference,customer_note)",
        )
        .eq("storefront_id", storefront.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);

      return ((data as OrderRow[] | null) ?? []).map((row) => {
        const profile = firstRelation(row.profiles);
        const fulfillment = firstRelation(row.order_fulfillments);
        return {
          id: row.id,
          customerId: row.customer_id,
          customerName: profile?.display_name?.trim() || profile?.username || "Customer",
          customerUsername: profile?.username || row.customer_id.slice(0, 8),
          createdAt: row.created_at,
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
          "id,name,slug,tagline,description,seller_tier,state_code,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary",
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
          "id,name,slug,tagline,description,seller_tier,state_code,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary",
        )
        .single();
      if (error) throw new Error(error.message);
      return storefrontFromRow(client, data as StorefrontRow);
    },

    async saveProduct(draft) {
      const authUser = requireUser();
      const { data: storefrontData, error: storefrontError } = await client
        .from("storefronts")
        .select("id,name,slug,tagline,description,seller_tier,state_code,primary_category,logo_path,banner_path,seo_title,seo_description,llm_summary")
        .eq("owner_id", authUser.id)
        .limit(1)
        .single();
      if (storefrontError) throw new Error(storefrontError.message);

      const payload = {
        id: draft.id,
        storefront_id: storefrontData.id,
        title: draft.title.trim(),
        slug: slugify(draft.slug || draft.title),
        brand: draft.brand.trim() || storefrontData.name,
        category: draft.category,
        price_minor: Math.max(0, draft.pricePaise),
        inventory: Math.max(0, draft.inventory),
        sku: draft.sku.trim(),
        short_description: draft.shortDescription.trim(),
        description: draft.description.trim(),
        status: draft.status,
        tags: draft.tags,
        search_keywords: draft.keywords,
        seo_title: draft.seoTitle.trim(),
        seo_description: draft.seoDescription.trim(),
        llm_summary: draft.llmSummary.trim(),
        published_at:
          draft.status === "active" ? new Date().toISOString() : null,
      };
      const { data, error } = await client
        .from("products")
        .upsert(payload, { onConflict: "id" })
        .select(
          "id,storefront_id,title,slug,brand,price_minor,sale_price_minor,inventory,category,short_description,description,sku,status,cover_path,tags,search_keywords,seo_title,seo_description,llm_summary,storefronts!products_storefront_id_fkey(id,name,slug),product_media(path,position)",
        )
        .single();
      if (error) throw new Error(error.message);
      return productFromRow(client, data as ProductRow);
    },

    async uploadProductMedia(storefrontId, productId, assets) {
      requireUser();
      const uploads: UploadedMedia[] = [];
      for (const [index, asset] of assets.entries()) {
        const response = await fetch(asset.uri);
        const bytes = await response.arrayBuffer();
        const fallbackExtension = asset.mimeType?.includes("png")
          ? "png"
          : asset.mimeType?.includes("webp")
            ? "webp"
            : asset.mimeType?.includes("gif")
              ? "gif"
              : "jpg";
        const rawExtension = asset.fileName?.split(".").pop()?.toLowerCase();
        const extension =
          rawExtension && /^[a-z0-9]{2,5}$/.test(rawExtension)
            ? rawExtension
            : fallbackExtension;
        const path = `${storefrontId}/products/${productId}/${Date.now()}-${index}.${extension}`;
        const { error } = await client.storage.from(mediaBucket).upload(path, bytes, {
          contentType: asset.mimeType ?? "image/jpeg",
          upsert: false,
          cacheControl: "31536000",
        });
        if (error) throw new Error(error.message);
        uploads.push({
          path,
          url: toPublicUrl(client, path) ?? path,
          mediaType: "image",
          position: index,
        });
      }
      return uploads;
    },

    async replaceProductMedia(productId, media) {
      requireUser();
      const { error: deleteError } = await client
        .from("product_media")
        .delete()
        .eq("product_id", productId);
      if (deleteError) throw new Error(deleteError.message);

      if (media.length) {
        const { error: insertError } = await client.from("product_media").insert(
          media.map((item) => ({
            product_id: productId,
            path: item.path,
            media_type: item.mediaType,
            alt_text: item.altText ?? "",
            position: item.position,
            is_primary: item.position === 0,
          })),
        );
        if (insertError) throw new Error(insertError.message);
      }

      const { error: productUpdateError } = await client
        .from("products")
        .update({ cover_path: media[0]?.path ?? null })
        .eq("id", productId);
      if (productUpdateError) throw new Error(productUpdateError.message);

      const { data, error } = await client
        .from("products")
        .select(
          "id,storefront_id,title,slug,brand,price_minor,sale_price_minor,inventory,category,short_description,description,sku,status,cover_path,tags,search_keywords,seo_title,seo_description,llm_summary,storefronts!products_storefront_id_fkey(id,name,slug),product_media(path,position)",
        )
        .eq("id", productId)
        .single();
      if (error) throw new Error(error.message);
      return productFromRow(client, data as ProductRow);
    },
  };
}

export function productShareLine(product: ShopProduct) {
  return `${product.name} · ${formatInr(product.pricePaise)} · @${product.storefrontSlug}`;
}
