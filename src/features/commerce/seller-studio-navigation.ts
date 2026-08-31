export type SellerSection =
  | "overview"
  | "orders_manage"
  | "orders_returns"
  | "orders_return_settings"
  | "products_add"
  | "products_manage"
  | "products_ratings"
  | "products_bundle"
  | "products_accelerator"
  | "products_opportunities"
  | "logistics_overview"
  | "logistics_warehouses"
  | "logistics_fulfillment"
  | "logistics_shipping"
  | "logistics_social24"
  | "marketing_promotions"
  | "marketing_campaigns"
  | "marketing_programs"
  | "marketing_ads"
  | "marketing_shop_page"
  | "affiliate_products"
  | "affiliate_automations"
  | "live_video"
  | "growth"
  | "apps_partners"
  | "analytics"
  | "account_health"
  | "finance"
  | "storefront"
  | "business_chat"
  | "creator_chat"
  | "discoverability"
  | "operations";

export type SellerModuleStatus = "functional" | "coming_soon";

export type SellerNavigationChild = {
  key: SellerSection;
  label: string;
  status: SellerModuleStatus;
};

export type SellerNavigationGroup = {
  key: string;
  label: string;
  defaultSection: SellerSection;
  children: SellerNavigationChild[];
  utility?: boolean;
};

const child = (key: SellerSection, label: string, status: SellerModuleStatus = "functional"): SellerNavigationChild => ({ key, label, status });

export const sellerNavigation: SellerNavigationGroup[] = [
  { key: "home", label: "Home", defaultSection: "overview", children: [child("overview", "Overview")] },
  { key: "orders", label: "Orders", defaultSection: "orders_manage", children: [
    child("orders_manage", "Manage Orders"), child("orders_returns", "Manage Returns"), child("orders_return_settings", "Return Settings"),
  ] },
  { key: "products", label: "Products", defaultSection: "products_manage", children: [
    child("products_add", "Add Products"), child("products_manage", "Manage Products"), child("products_ratings", "Product Ratings", "coming_soon"),
    child("products_bundle", "Product Bundle", "coming_soon"), child("products_accelerator", "Sales Accelerator", "coming_soon"), child("products_opportunities", "Product Opportunities", "coming_soon"),
  ] },
  { key: "logistics", label: "Logistics", defaultSection: "logistics_overview", children: [
    child("logistics_overview", "Overview"), child("logistics_warehouses", "Warehouses", "coming_soon"), child("logistics_fulfillment", "Fulfillment"),
    child("logistics_shipping", "Shipping"), child("logistics_social24", "Fulfilled by Social24", "coming_soon"),
  ] },
  { key: "marketing", label: "Marketing", defaultSection: "marketing_promotions", children: [
    child("marketing_promotions", "Promotions", "coming_soon"), child("marketing_campaigns", "Campaigns", "coming_soon"), child("marketing_programs", "Programs", "coming_soon"),
    child("marketing_ads", "Shop Ads", "coming_soon"), child("marketing_shop_page", "Shop Page", "coming_soon"),
  ] },
  { key: "affiliate", label: "Affiliate", defaultSection: "affiliate_products", children: [
    child("affiliate_products", "Products"), child("affiliate_automations", "Automations", "coming_soon"),
  ] },
  { key: "live_video", label: "LIVE & Video", defaultSection: "live_video", children: [child("live_video", "LIVE & Video", "coming_soon")] },
  { key: "growth", label: "Growth", defaultSection: "growth", children: [child("growth", "Growth", "coming_soon")] },
  { key: "apps_partners", label: "Apps & Partners", defaultSection: "apps_partners", children: [child("apps_partners", "Apps & Partners", "coming_soon")] },
  { key: "analytics", label: "Analytics", defaultSection: "analytics", children: [child("analytics", "Analytics")] },
  { key: "account_health", label: "Account Health", defaultSection: "account_health", children: [child("account_health", "Account Health", "coming_soon")] },
  { key: "finance", label: "Finance", defaultSection: "finance", children: [child("finance", "Finance")] },
  { key: "storefront", label: "Storefront", defaultSection: "storefront", utility: true, children: [child("storefront", "Storefront")] },
  { key: "business_chat", label: "Business Chat", defaultSection: "business_chat", utility: true, children: [child("business_chat", "Business Chat")] },
  { key: "creator_chat", label: "Creator Chats", defaultSection: "creator_chat", utility: true, children: [child("creator_chat", "Creator Chats")] },
  { key: "discoverability", label: "SEO & AI", defaultSection: "discoverability", utility: true, children: [child("discoverability", "SEO & AI")] },
  { key: "operations", label: "Operations", defaultSection: "operations", utility: true, children: [child("operations", "Operations")] },
];

export const sellerSections = sellerNavigation.flatMap((group) => group.children);

export function isSellerSection(value: unknown): value is SellerSection {
  return typeof value === "string" && sellerSections.some((section) => section.key === value);
}

export function sellerGroupForSection(section: SellerSection) {
  return sellerNavigation.find((group) => group.children.some((childItem) => childItem.key === section)) ?? sellerNavigation[0];
}

export function sellerSectionLabel(section: SellerSection) {
  return sellerSections.find((item) => item.key === section)?.label ?? "Seller Studio";
}

export function toggleSellerNavigationGroup(
  currentGroup: string,
  clickedGroup: string,
  hasSubmenu: boolean,
) {
  if (!hasSubmenu) return "";
  return currentGroup === clickedGroup ? "" : clickedGroup;
}
