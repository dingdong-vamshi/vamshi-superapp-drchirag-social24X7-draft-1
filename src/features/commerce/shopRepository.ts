import AsyncStorage from "@react-native-async-storage/async-storage";

export const shopCategories = [
  "All",
  "Wellness",
  "Home",
  "Travel",
  "Everyday",
] as const;

export type ShopCategory = (typeof shopCategories)[number];
export type SellerTier = "local" | "gst";
export type ProductStatus = "draft" | "active" | "archived";

export type UploadAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export type UploadedMedia = {
  path: string;
  url: string;
  storageBucket?: "shop-media" | "product-media";
  mediaType: "image" | "video";
  altText?: string;
  position: number;
  isPrimary?: boolean;
  originalFilename?: string | null;
  mimeType?: string | null;
  bytes?: number;
  width?: number | null;
  height?: number | null;
};

export type StorefrontSummary = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  sellerTier: SellerTier;
  stateCode: string;
  city: string;
  supportPhone: string;
  supportEmail: string;
  primaryCategory: Exclude<ShopCategory, "All">;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  llmSummary?: string | null;
  indexable?: boolean;
  geoEnabled?: boolean;
};

export type ShopProduct = {
  id: string;
  storefrontId: string;
  storefrontName: string;
  storefrontSlug: string;
  name: string;
  slug: string;
  brand: string;
  pricePaise: number;
  category: Exclude<ShopCategory, "All">;
  accent: string;
  description: string;
  shortDescription: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  inventory: number;
  sku: string;
  coverUrl?: string | null;
  mediaUrls: string[];
  tags: string[];
  keywords: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  llmSummary?: string | null;
  creatorPromotionEnabled?: boolean;
  creatorCommissionBps?: number;
  returnWindowDays?: number;
};

export type CartLine = {
  productId: string;
  quantity: number;
  /** Creator referral retained by the authoritative cart when present. */
  promotionCode?: string | null;
};

export type SellerApplicationDraft = {
  legalName: string;
  storefrontName: string;
  storefrontSlug: string;
  businessType: string;
  sellerTier: SellerTier;
  stateCode: string;
  city: string;
  phone: string;
  email: string;
  addressLine: string;
  gstin?: string;
  tagline: string;
  description: string;
  primaryCategory: Exclude<ShopCategory, "All">;
  seoTitle: string;
  seoDescription: string;
  llmSummary: string;
  indexable?: boolean;
  geoEnabled?: boolean;
};

export type StorefrontDraft = Omit<
  SellerApplicationDraft,
  "legalName" | "addressLine" | "gstin"
>;

export type ProductDraft = {
  id?: string;
  title: string;
  slug: string;
  brand: string;
  category: Exclude<ShopCategory, "All">;
  pricePaise: number;
  inventory: number;
  sku: string;
  shortDescription: string;
  description: string;
  status: ProductStatus;
  tags: string[];
  keywords: string[];
  seoTitle: string;
  seoDescription: string;
  llmSummary: string;
  creatorPromotionEnabled: boolean;
  creatorCommissionBps: number;
  returnWindowDays: number;
};

export type SellerDashboard = {
  storefront: StorefrontSummary | null;
  applicationStatus: "none" | "submitted" | "approved";
  products: ShopProduct[];
};

export type SellerOrderStatus =
  | "placed"
  | "confirmed"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type SellerOrder = {
  id: string;
  customerId: string;
  customerName: string;
  customerUsername: string;
  createdAt: string;
  totalPaise: number;
  paymentStatus: string;
  status: SellerOrderStatus;
  fulfillment?: {
    carrier: string;
    trackingNumber: string;
    packageReference: string;
    customerNote: string;
  } | null;
};

export type BusinessConversationSummary = {
  id: string;
  customerId: string;
  customerName: string;
  customerUsername: string;
  lastMessage: string;
  updatedAt: string;
};

export type BusinessMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type SellerAnalytics = {
  dailyActiveVisitors: number;
  monthlyActiveVisitors: number;
  storefrontViews: number;
  productViews: number;
  ordersPlaced: number;
  conversionRate: number;
  revenuePaise: number;
  dailySeries: Array<{ label: string; views: number; visitors: number; orders: number }>;
  paymentMix: Array<{ label: string; value: number }>;
};

export type SellerReturnEvidence = {
  id: string;
  filename: string;
  mimeType: string;
  source: "live_capture" | "uploaded_file";
  createdAt: string;
  capturedAt?: string;
  signedUrl?: string;
};

export type SellerReturn = {
  id: string;
  orderId: string;
  orderItemId: string;
  buyerId: string;
  buyerName: string;
  buyerUsername: string;
  productTitle: string;
  itemSubtotalPaise: number;
  status: string;
  reason: string;
  details?: string;
  sellerNote?: string;
  requestedAt: string;
  reviewedAt?: string;
  evidence: SellerReturnEvidence[];
};

export type SellerFinanceSummary = {
  grossOrderValuePaise: number;
  deliveredSalesPaise: number;
  creatorCommissionPaise: number;
  approvedReturnsPaise: number;
  estimatedSellerAmountPaise: number;
  qualifyingOrderCount: number;
  returnRequestCount: number;
};

export interface ShopRepository {
  listProducts(input?: {
    category?: ShopCategory;
    query?: string;
  }): Promise<ShopProduct[]>;
  listStorefronts(): Promise<StorefrontSummary[]>;
  getStorefrontBySlug(slug: string): Promise<StorefrontSummary | null>;
  getProductBySlug(
    storefrontSlug: string,
    productSlug: string,
  ): Promise<ShopProduct | null>;
  getCart(): Promise<CartLine[]>;
  saveCart(lines: CartLine[]): Promise<void>;
  getWishlistProductIds(): Promise<string[]>;
  toggleWishlist(productId: string): Promise<string[]>;
  getSellerDashboard(): Promise<SellerDashboard>;
  getSellerAnalytics(): Promise<SellerAnalytics>;
  getSellerFinanceSummary(): Promise<SellerFinanceSummary>;
  listSellerOrders(): Promise<SellerOrder[]>;
  listSellerReturns(): Promise<SellerReturn[]>;
  reviewSellerReturn(input: {
    returnRequestId: string;
    decision: "approved" | "rejected" | "under_review";
    reason?: string;
  }): Promise<void>;
  updateSellerOrder(input: {
    orderId: string;
    status: SellerOrderStatus;
    carrier: string;
    trackingNumber: string;
    packageReference: string;
    customerNote: string;
  }): Promise<void>;
  listBusinessConversations(): Promise<BusinessConversationSummary[]>;
  listBusinessMessages(conversationId: string): Promise<BusinessMessage[]>;
  sendBusinessMessage(conversationId: string, body: string): Promise<void>;
  submitSellerApplication(
    draft: SellerApplicationDraft,
  ): Promise<StorefrontSummary>;
  saveStorefront(draft: StorefrontDraft): Promise<StorefrontSummary>;
  saveProduct(draft: ProductDraft): Promise<ShopProduct>;
  setCreatorPromotion(input: {
    productId: string;
    enabled: boolean;
    commissionBps: number;
  }): Promise<ShopProduct>;
  publishProduct(productId: string): Promise<ShopProduct>;
  uploadProductMedia(
    storefrontId: string,
    productId: string,
    assets: UploadAsset[],
  ): Promise<UploadedMedia[]>;
  replaceProductMedia(
    productId: string,
    media: UploadedMedia[],
  ): Promise<ShopProduct>;
}

const cartKey = "social24x7:commerce-cart:v2";
const wishlistKey = "social24x7:commerce-wishlist:v1";

const storefronts: StorefrontSummary[] = [
  {
    id: "store-ritual",
    name: "Ritual Living",
    slug: "ritual-living",
    tagline: "Daily objects for calmer routines",
    description:
      "A soft-goods and home ritual storefront for travel, tea, and everyday calm.",
    sellerTier: "gst",
    stateCode: "KA",
    city: "Bengaluru",
    supportPhone: "",
    supportEmail: "",
    primaryCategory: "Home",
    seoTitle: "Ritual Living on Social 24x7",
    seoDescription:
      "Shop Ritual Living home, travel, and wellness essentials on Social 24x7.",
    llmSummary:
      "Ritual Living sells calm, premium home and travel products for modern routines.",
  },
  {
    id: "store-common",
    name: "Common Ground",
    slug: "common-ground",
    tagline: "Wellness and everyday essentials",
    description:
      "Functional products for workdays, coffee rituals, and steady movement.",
    sellerTier: "local",
    stateCode: "TN",
    city: "Chennai",
    supportPhone: "",
    supportEmail: "",
    primaryCategory: "Wellness",
    seoTitle: "Common Ground on Social 24x7",
    seoDescription:
      "Browse Common Ground wellness and everyday gear on Social 24x7.",
    llmSummary:
      "Common Ground is a Social 24x7 storefront for practical wellness and everyday goods.",
  },
];

export const catalog: ShopProduct[] = [
  {
    id: "balance-mat",
    storefrontId: "store-common",
    storefrontName: "Common Ground",
    storefrontSlug: "common-ground",
    name: "Daily Balance Mat",
    slug: "daily-balance-mat",
    brand: "Common Ground",
    pricePaise: 239900,
    rating: 4.8,
    reviewCount: 126,
    category: "Wellness",
    accent: "#d9f8e7",
    description:
      "A cushioned, non-slip mat for everyday movement with a quick-dry texture.",
    shortDescription: "Non-slip movement mat",
    inStock: true,
    inventory: 24,
    sku: "CG-MAT-01",
    mediaUrls: [],
    tags: ["wellness", "fitness"],
    keywords: ["balance mat", "wellness mat", "exercise mat"],
    seoTitle: "Daily Balance Mat by Common Ground",
    seoDescription:
      "Shop the Daily Balance Mat by Common Ground on Social 24x7.",
    llmSummary:
      "The Daily Balance Mat is a premium wellness mat suited for home workouts and yoga.",
  },
  {
    id: "pour-over",
    storefrontId: "store-ritual",
    storefrontName: "Ritual Living",
    storefrontSlug: "ritual-living",
    name: "Ceramic Pour Over",
    slug: "ceramic-pour-over",
    brand: "Ritual Living",
    pricePaise: 129900,
    rating: 4.7,
    reviewCount: 84,
    category: "Home",
    accent: "#f7e3ca",
    description:
      "Hand-finished dripper for a calmer morning ritual with a steady flow profile.",
    shortDescription: "Hand-finished coffee dripper",
    inStock: true,
    inventory: 17,
    sku: "RL-COFFEE-02",
    mediaUrls: [],
    tags: ["coffee", "home"],
    keywords: ["pour over", "coffee dripper", "ceramic dripper"],
    seoTitle: "Ceramic Pour Over by Ritual Living",
    seoDescription:
      "Discover the Ceramic Pour Over dripper by Ritual Living on Social 24x7.",
    llmSummary:
      "A ceramic pour-over dripper designed for coffee lovers who value a calm brewing ritual.",
  },
  {
    id: "linen-bag",
    storefrontId: "store-ritual",
    storefrontName: "Ritual Living",
    storefrontSlug: "ritual-living",
    name: "Linen Travel Bag",
    slug: "linen-travel-bag",
    brand: "Ritual Living",
    pricePaise: 189900,
    rating: 4.6,
    reviewCount: 52,
    category: "Travel",
    accent: "#e6e2da",
    description:
      "Lightweight organiser with an easy-access pocket and structured inner divider.",
    shortDescription: "Structured travel organiser",
    inStock: true,
    inventory: 11,
    sku: "RL-TRAVEL-04",
    mediaUrls: [],
    tags: ["travel", "organizer"],
    keywords: ["travel bag", "linen organizer"],
    seoTitle: "Linen Travel Bag by Ritual Living",
    seoDescription:
      "Shop the Linen Travel Bag from Ritual Living on Social 24x7.",
    llmSummary:
      "A linen travel organiser designed for clean packing and light daily movement.",
  },
  {
    id: "bottle",
    storefrontId: "store-common",
    storefrontName: "Common Ground",
    storefrontSlug: "common-ground",
    name: "Insulated Water Bottle",
    slug: "insulated-water-bottle",
    brand: "Common Ground",
    pricePaise: 99900,
    rating: 4.9,
    reviewCount: 211,
    category: "Everyday",
    accent: "#d9edff",
    description:
      "Double-wall steel bottle that keeps drinks cold for long commutes and workdays.",
    shortDescription: "Steel daily bottle",
    inStock: true,
    inventory: 40,
    sku: "CG-BOTTLE-07",
    mediaUrls: [],
    tags: ["everyday", "bottle"],
    keywords: ["water bottle", "insulated bottle"],
    seoTitle: "Insulated Water Bottle by Common Ground",
    seoDescription:
      "Buy the Insulated Water Bottle by Common Ground on Social 24x7.",
    llmSummary:
      "An insulated steel water bottle for commuting, work, and everyday hydration.",
  },
];

const localDashboard: SellerDashboard = {
  storefront: null,
  applicationStatus: "none",
  products: [],
};

export function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "store"
  );
}

export function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export const localShopRepository: ShopRepository = {
  async listProducts(input) {
    const category = input?.category ?? "All";
    const needle = input?.query?.trim().toLowerCase() ?? "";
    return catalog.filter(
      (product) =>
        (category === "All" || product.category === category) &&
        (!needle ||
          `${product.name} ${product.brand} ${product.keywords.join(" ")}`
            .toLowerCase()
            .includes(needle)),
    );
  },
  async listStorefronts() {
    return storefronts;
  },
  async getStorefrontBySlug(slug) {
    return storefronts.find((item) => item.slug === slug) ?? null;
  },
  async getProductBySlug(storefrontSlug, productSlug) {
    return (
      catalog.find(
        (item) =>
          item.storefrontSlug === storefrontSlug && item.slug === productSlug,
      ) ?? null
    );
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
  async getWishlistProductIds() {
    const raw = await AsyncStorage.getItem(wishlistKey);
    try { return raw ? JSON.parse(raw) as string[] : []; } catch { return []; }
  },
  async toggleWishlist(productId) {
    const current = await this.getWishlistProductIds();
    const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
    await AsyncStorage.setItem(wishlistKey, JSON.stringify(next));
    return next;
  },
  async getSellerDashboard() {
    return localDashboard;
  },
  async getSellerAnalytics() {
    return {
      dailyActiveVisitors: 0, monthlyActiveVisitors: 0, storefrontViews: 0,
      productViews: 0, ordersPlaced: 0, conversionRate: 0, revenuePaise: 0,
      dailySeries: Array.from({ length: 14 }, (_, index) => ({ label: String(index + 1), views: 0, visitors: 0, orders: 0 })),
      paymentMix: [{ label: "Online", value: 0 }, { label: "Cash on delivery", value: 0 }],
    };
  },
  async getSellerFinanceSummary() {
    return {
      grossOrderValuePaise: 0,
      deliveredSalesPaise: 0,
      creatorCommissionPaise: 0,
      approvedReturnsPaise: 0,
      estimatedSellerAmountPaise: 0,
      qualifyingOrderCount: 0,
      returnRequestCount: 0,
    };
  },
  async listSellerOrders() {
    return [];
  },
  async listSellerReturns() {
    return [];
  },
  async reviewSellerReturn() {
    throw new Error("Return management requires a real Social Chat 24/7 seller account.");
  },
  async updateSellerOrder() {
    throw new Error("Order management requires a real Social Chat 24/7 seller account.");
  },
  async listBusinessConversations() {
    return [];
  },
  async listBusinessMessages() {
    return [];
  },
  async sendBusinessMessage() {
    throw new Error("Business chat requires a real Social Chat 24/7 seller account.");
  },
  async submitSellerApplication() {
    throw new Error(
      "Seller studio requires a real Social 24x7 account connected to Supabase.",
    );
  },
  async saveStorefront() {
    throw new Error(
      "Storefront editing requires a real Social 24x7 account connected to Supabase.",
    );
  },
  async saveProduct() {
    throw new Error(
      "Product management requires a real Social 24x7 account connected to Supabase.",
    );
  },
  async setCreatorPromotion() {
    throw new Error(
      "Affiliate Product management requires a real Social Chat 24/7 seller account.",
    );
  },
  async publishProduct() {
    throw new Error(
      "Product publishing requires a real Social 24x7 account connected to Supabase.",
    );
  },
  async uploadProductMedia(_storefrontId, _productId, assets) {
    return assets.map((asset, index) => ({
      path: asset.uri,
      url: asset.uri,
      mediaType: "image" as const,
      position: index,
    }));
  },
  async replaceProductMedia() {
    throw new Error(
      "Product management requires a real Social 24x7 account connected to Supabase.",
    );
  },
};
