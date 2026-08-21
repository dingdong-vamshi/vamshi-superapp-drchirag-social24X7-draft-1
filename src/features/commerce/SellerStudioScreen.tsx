import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Asset } from "expo-asset";
import {
  BarChart3,
  Activity,
  Bell,
  Boxes,
  ChevronDown,
  ClipboardList,
  MessageSquareText,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Send,
  LayoutGrid,
  MessageCircle,
  PackagePlus,
  Plus,
  SearchCheck,
  Settings2,
  Store,
  Truck,
  Video,
  WalletCards,
} from "lucide-react-native";
import {
  type BusinessConversationSummary,
  type BusinessMessage,
  type ProductDraft,
  type SellerApplicationDraft,
  type SellerAnalytics,
  type SellerDashboard,
  type SellerOrder,
  type SellerOrderStatus,
  shopCategories,
  type ShopCategory,
  type ShopProduct,
  type ShopRepository,
  slugify,
  type UploadAsset,
} from "./shopRepository";
import SellerAnalyticsCharts from "./SellerAnalyticsCharts";

type Props = {
  repository: ShopRepository;
  pickProductImages?: () => Promise<UploadAsset[]>;
  persistenceKey?: string;
};

type SellerSection =
  | "overview"
  | "storefront"
  | "catalog"
  | "orders"
  | "business_chat"
  | "discoverability"
  | "operations";

const ink = "#0e1726";
const muted = "#64748b";
const line = "#dce6df";
const green = "#0fa968";
const greenDeep = "#0a7f4d";
const canvas = "#f5f8f6";
const panel = "#ffffff";
const mint = "#eef8f3";
const dark = "#111111";
const commerceFont = Platform.select({
  web: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  default: "System",
});

const navItems: {
  key: SellerSection;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  blurb: string;
}[] = [
  {
    key: "overview",
    label: "Overview",
    icon: Activity,
    blurb: "Health, sales posture, and storefront launch status.",
  },
  {
    key: "storefront",
    label: "Storefront",
    icon: Store,
    blurb: "Brand identity, slug, category, and customer-facing details.",
  },
  {
    key: "catalog",
    label: "Catalog",
    icon: PackagePlus,
    blurb: "Products, images, SKUs, pricing, and inventory.",
  },
  {
    key: "orders",
    label: "Orders",
    icon: ClipboardList,
    blurb: "Orders, fulfilment, tracking, and customer delivery updates.",
  },
  {
    key: "business_chat",
    label: "Business chat",
    icon: MessageSquareText,
    blurb: "Buyer conversations, call handoffs, and service desk replies.",
  },
  {
    key: "discoverability",
    label: "SEO & AI",
    icon: SearchCheck,
    blurb: "Programmatic SEO and model-readable summaries.",
  },
  {
    key: "operations",
    label: "Operations",
    icon: Settings2,
    blurb: "Support contacts, payouts posture, and launch readiness.",
  },
];

const defaultSellerDraft: SellerApplicationDraft = {
  legalName: "",
  storefrontName: "",
  storefrontSlug: "",
  businessType: "independent",
  sellerTier: "local",
  stateCode: "",
  city: "",
  phone: "",
  email: "",
  addressLine: "",
  gstin: "",
  tagline: "",
  description: "",
  primaryCategory: "Everyday",
  seoTitle: "",
  seoDescription: "",
  llmSummary: "",
  indexable: true,
  geoEnabled: true,
};

const defaultProductDraft: ProductDraft = {
  title: "",
  slug: "",
  brand: "",
  category: "Everyday",
  pricePaise: 0,
  inventory: 0,
  sku: "",
  shortDescription: "",
  description: "",
  status: "active",
  tags: [],
  keywords: [],
  seoTitle: "",
  seoDescription: "",
  llmSummary: "",
  creatorPromotionEnabled: true,
  creatorCommissionBps: 1000,
  returnWindowDays: 7,
};

const sellerHeroIllustration = require("../../../assets/images/seller-central-hero-v1.png");
const sellerSectionIllustrations = {
  storefront: require("../../../assets/images/seller-storefront-v1.png"),
  catalog: require("../../../assets/images/seller-catalog-v1.png"),
  orders: require("../../../assets/images/seller-orders-v1.png"),
  business: require("../../../assets/images/seller-business-chat-v1.png"),
  seo: require("../../../assets/images/seller-seo-v1.png"),
  operations: require("../../../assets/images/seller-operations-v1.png"),
} as const;

export function SellerStudioScreen({
  repository,
  pickProductImages,
  persistenceKey,
}: Props) {
  const { width: viewportWidth } = useWindowDimensions();
  const mobileLayout = viewportWidth < 900;
  const [dashboard, setDashboard] = useState<SellerDashboard | null>(null);
  const [sellerDraft, setSellerDraft] =
    useState<SellerApplicationDraft>(defaultSellerDraft);
  const [productDraft, setProductDraft] =
    useState<ProductDraft>(defaultProductDraft);
  const [selectedAssets, setSelectedAssets] = useState<UploadAsset[]>([]);
  const [productSaveNotice, setProductSaveNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeSection, setActiveSection] =
    useState<SellerSection>("overview");
  const [draftRestored, setDraftRestored] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);
  const [businessConversations, setBusinessConversations] = useState<
    BusinessConversationSummary[]
  >([]);
  const [selectedBusinessConversation, setSelectedBusinessConversation] =
    useState<BusinessConversationSummary | null>(null);
  const [businessMessages, setBusinessMessages] = useState<BusinessMessage[]>([]);
  const [businessMessageDraft, setBusinessMessageDraft] = useState("");

  useEffect(() => {
    let active = true;
    const restoreProductWork = async () => {
      if (!persistenceKey) {
        if (active) setDraftRestored(true);
        return;
      }
      try {
        const saved = await AsyncStorage.getItem(persistenceKey);
        if (!saved || !active) return;
        const parsed = JSON.parse(saved) as {
          activeSection?: SellerSection;
          productDraft?: Partial<ProductDraft>;
        };
        if (parsed.productDraft) {
          setProductDraft({ ...defaultProductDraft, ...parsed.productDraft });
          if (parsed.productDraft.title || parsed.productDraft.description || parsed.productDraft.sku) {
            setProductSaveNotice({ tone: "success", message: "Your unfinished Product form was restored." });
          }
        }
        if (parsed.activeSection && navItems.some((item) => item.key === parsed.activeSection)) {
          setActiveSection(parsed.activeSection);
        }
      } catch {
        // A corrupt local draft should never block Seller Studio.
      } finally {
        if (active) setDraftRestored(true);
      }
    };
    void restoreProductWork();
    return () => { active = false; };
  }, [persistenceKey]);

  useEffect(() => {
    if (!persistenceKey || !draftRestored) return;
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(persistenceKey, JSON.stringify({ activeSection, productDraft }));
    }, 250);
    return () => clearTimeout(timer);
  }, [activeSection, draftRestored, persistenceKey, productDraft]);

  useEffect(() => {
    const loadSellerDashboard = async () => {
      setLoading(true);
      try {
        const next = await repository.getSellerDashboard();
        setDashboard(next);
        if (next.storefront) {
          setSellerDraft((current) => ({
            ...current,
            storefrontName: next.storefront?.name ?? current.storefrontName,
            storefrontSlug: next.storefront?.slug ?? current.storefrontSlug,
            tagline: next.storefront?.tagline ?? current.tagline,
            description: next.storefront?.description ?? current.description,
            sellerTier: next.storefront?.sellerTier ?? current.sellerTier,
            stateCode: next.storefront?.stateCode ?? current.stateCode,
            city: next.storefront?.city ?? current.city,
            phone: next.storefront?.supportPhone ?? current.phone,
            email: next.storefront?.supportEmail ?? current.email,
            primaryCategory:
              next.storefront?.primaryCategory ?? current.primaryCategory,
            seoTitle:
              next.storefront?.seoTitle ??
              `${next.storefront?.name} on Social Chat 24/7`,
            seoDescription:
              next.storefront?.seoDescription ?? current.seoDescription,
            llmSummary: next.storefront?.llmSummary ?? current.llmSummary,
            indexable: next.storefront?.indexable ?? current.indexable,
            geoEnabled: next.storefront?.geoEnabled ?? current.geoEnabled,
          }));
        }
      } catch (error) {
        setDashboard({
          storefront: null,
          applicationStatus: "none",
          products: [],
        });
        Alert.alert(
          "Seller Central",
          error instanceof Error
            ? error.message
            : "Unable to load seller workspace.",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadSellerDashboard();
  }, [repository, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      setOrders(await repository.listSellerOrders());
    } catch (error) {
      Alert.alert(
        "Unable to load orders",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      setAnalytics(await repository.getSellerAnalytics());
    } catch {
      setAnalytics(null);
    }
  };

  const loadBusinessDesk = async () => {
    try {
      const next = await repository.listBusinessConversations();
      setBusinessConversations(next);
      if (!selectedBusinessConversation && next[0]) {
        setSelectedBusinessConversation(next[0]);
      }
    } catch (error) {
      Alert.alert(
        "Unable to load business chat",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  useEffect(() => {
    if (activeSection === "orders") void loadOrders();
    if (activeSection === "business_chat") void loadBusinessDesk();
    if (activeSection === "overview") void loadAnalytics();
  }, [activeSection, refreshKey]);

  useEffect(() => {
    if (!selectedBusinessConversation) {
      setBusinessMessages([]);
      return;
    }
    void repository
      .listBusinessMessages(selectedBusinessConversation.id)
      .then(setBusinessMessages)
      .catch(() => setBusinessMessages([]));
  }, [repository, selectedBusinessConversation?.id]);

  const productCount = dashboard?.products.length ?? 0;
  const totalInventory =
    dashboard?.products.reduce((sum, item) => sum + item.inventory, 0) ?? 0;
  const liveProducts =
    dashboard?.products.filter((item) => item.inStock).length ?? 0;
  const seoCoverage = useMemo(() => {
    if (!dashboard?.products.length) return 0;
    const complete = dashboard.products.filter(
      (item) =>
        Boolean(item.seoTitle?.trim()) &&
        Boolean(item.seoDescription?.trim()) &&
        Boolean(item.llmSummary?.trim()),
    ).length;
    return Math.round((complete / dashboard.products.length) * 100);
  }, [dashboard?.products]);
  const healthChecks = [
    {
      label: "Storefront identity",
      complete: Boolean(dashboard?.storefront?.name && dashboard?.storefront?.slug),
    },
    { label: "Sellable catalog", complete: liveProducts > 0 },
    { label: "Inventory available", complete: totalInventory > 0 },
    { label: "Search readiness", complete: seoCoverage >= 60 },
  ];
  const completedHealthChecks = healthChecks.filter((item) => item.complete).length;
  const healthScore = Math.round((completedHealthChecks / healthChecks.length) * 100);

  const saveSeller = async () => {
    setBusy(true);
    try {
      const hasStorefront = Boolean(dashboard?.storefront);
      const payload = {
        ...sellerDraft,
        storefrontSlug:
          sellerDraft.storefrontSlug || slugify(sellerDraft.storefrontName),
        seoTitle:
          sellerDraft.seoTitle ||
          `${sellerDraft.storefrontName || "Store"} on Social Chat 24/7`,
      };
      const storefront = hasStorefront
        ? await repository.saveStorefront({
            storefrontName: payload.storefrontName,
            storefrontSlug: payload.storefrontSlug,
            businessType: payload.businessType,
            sellerTier: payload.sellerTier,
            stateCode: payload.stateCode,
            city: payload.city,
            phone: payload.phone,
            email: payload.email,
            tagline: payload.tagline,
            description: payload.description,
            primaryCategory: payload.primaryCategory,
            seoTitle: payload.seoTitle,
            seoDescription: payload.seoDescription,
            llmSummary: payload.llmSummary,
            indexable: payload.indexable,
            geoEnabled: payload.geoEnabled,
          })
        : await repository.submitSellerApplication(payload);
      refresh();
      setActiveSection("storefront");
      Alert.alert(
        "Storefront saved",
        `${storefront.name} is now configured for the Shop experience.`,
      );
    } catch (error) {
      Alert.alert(
        "Unable to save storefront",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const editProduct = (product: ShopProduct) => {
    setProductDraft({
      id: product.id,
      title: product.name,
      slug: product.slug,
      brand: product.brand,
      category: product.category,
      pricePaise: product.pricePaise,
      inventory: product.inventory,
      sku: product.sku,
      shortDescription: product.shortDescription,
      description: product.description,
      status: product.inStock ? "active" : "draft",
      tags: product.tags,
      keywords: product.keywords,
      seoTitle: product.seoTitle ?? "",
      seoDescription: product.seoDescription ?? "",
      llmSummary: product.llmSummary ?? "",
      creatorPromotionEnabled: product.creatorPromotionEnabled ?? true,
      creatorCommissionBps: product.creatorCommissionBps ?? 1000,
      returnWindowDays: product.returnWindowDays ?? 7,
    });
    setSelectedAssets([]);
    setProductSaveNotice(null);
    setActiveSection("catalog");
  };

  const saveProduct = async () => {
    setProductSaveNotice(null);
    if (!productDraft.id && selectedAssets.length === 0) {
      const message = "Add at least one Product image before publishing.";
      setProductSaveNotice({ tone: "error", message });
      Alert.alert("Product image required", message);
      return;
    }
    if (
      productDraft.creatorPromotionEnabled &&
      (productDraft.creatorCommissionBps < 500 || productDraft.creatorCommissionBps > 7000)
    ) {
      const message = "Creator commission must be between 5% and 70%.";
      setProductSaveNotice({ tone: "error", message });
      Alert.alert("Commission out of range", message);
      return;
    }
    setBusy(true);
    try {
      const product = await repository.saveProduct({
        ...productDraft,
        slug: productDraft.slug || slugify(productDraft.title),
        seoTitle: productDraft.seoTitle || productDraft.title,
      });
      if (selectedAssets.length && dashboard?.storefront) {
        const media = await repository.uploadProductMedia(
          dashboard.storefront.id,
          product.id,
          selectedAssets,
        );
        await repository.replaceProductMedia(product.id, media);
      }
      await repository.publishProduct(product.id);
      setProductDraft(defaultProductDraft);
      setSelectedAssets([]);
      setProductSaveNotice({
        tone: "success",
        message: selectedAssets.length
          ? `Product and ${selectedAssets.length} media item(s) published live.`
          : "Product published live.",
      });
      refresh();
      Alert.alert(
        "Catalog updated",
        `${product.name} is live in Shop without a separate Product approval step.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      setProductSaveNotice({ tone: "error", message });
      Alert.alert(
        "Unable to save product",
        message,
      );
    } finally {
      setBusy(false);
    }
  };

  const saveOrderFulfillment = async (input: {
    status: SellerOrderStatus;
    carrier: string;
    trackingNumber: string;
    packageReference: string;
    customerNote: string;
  }) => {
    if (!selectedOrder) return;
    setBusy(true);
    try {
      await repository.updateSellerOrder({ orderId: selectedOrder.id, ...input });
      setSelectedOrder(null);
      await loadOrders();
      Alert.alert("Order updated", "The fulfilment status is ready for the customer order timeline.");
    } catch (error) {
      Alert.alert(
        "Unable to update order",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const sendBusinessDeskMessage = async () => {
    if (!selectedBusinessConversation || !businessMessageDraft.trim()) return;
    setBusy(true);
    try {
      await repository.sendBusinessMessage(
        selectedBusinessConversation.id,
        businessMessageDraft,
      );
      setBusinessMessageDraft("");
      const [messages] = await Promise.all([
        repository.listBusinessMessages(selectedBusinessConversation.id),
        loadBusinessDesk(),
      ]);
      setBusinessMessages(messages);
    } catch (error) {
      Alert.alert(
        "Unable to send reply",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (Platform.OS !== "web") {
    return (
      <View style={styles.unsupported}>
        <Text style={styles.unsupportedTitle}>Seller Central is web-only</Text>
        <Text style={styles.unsupportedText}>
          Customers shop inside the app. Store operations, catalog publishing,
          SEO setup, and inventory control live in the web dashboard.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={green} />
        <Text style={styles.centeredLabel}>
          Loading Social Chat 24/7 Seller Central…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.page, mobileLayout && styles.pageMobile]}>
      <View style={[styles.sidebar, sidebarCollapsed && !mobileLayout && styles.sidebarCollapsed, mobileLayout && styles.sidebarMobile]}>
        <View style={[styles.brandBlock, mobileLayout && styles.brandBlockMobile]}>
          <View style={styles.logoMark}>
            <MessageCircle size={21} color="#ffffff" fill="#ffffff" />
          </View>
          {!sidebarCollapsed || mobileLayout ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.brandTitle}>Social Chat 24/7</Text>
              <Text style={styles.brandMeta}>Seller Central</Text>
            </View>
          ) : null}
          {!mobileLayout ? <Pressable
            accessibilityLabel={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onPress={() => setSidebarCollapsed((value) => !value)}
            style={styles.sidebarToggle}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={17} color={muted} />
            ) : (
              <PanelLeftClose size={17} color={muted} />
            )}
          </Pressable> : null}
        </View>

        {!sidebarCollapsed && !mobileLayout ? (
          <View style={styles.sidebarStatus}>
            <Text style={styles.sidebarStatusEyebrow}>YOUR STORE</Text>
            <Text style={styles.sidebarStatusTitle}>
              {dashboard?.storefront?.name || "Create your storefront"}
            </Text>
            <Text style={styles.sidebarStatusCopy}>
              {dashboard?.storefront
                ? `socialchat247.app/store/${dashboard.storefront.slug}`
                : "A public store, catalog, and checkout-ready presence in one place."}
            </Text>
          </View>
        ) : null}

        <ScrollView horizontal={mobileLayout} showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.navList, mobileLayout && styles.navListMobile]}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeSection;
            return (
              <Pressable
                key={item.key}
                onPress={() => setActiveSection(item.key)}
                style={[styles.navItem, active && styles.navItemActive]}
              >
                <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}>
                  <Icon
                    size={18}
                    color={active ? "#ffffff" : "#9fb4a8"}
                    strokeWidth={2.2}
                  />
                </View>
                {!sidebarCollapsed || mobileLayout ? (
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                      {item.label}
                    </Text>
                    {active ? (
                      <Text style={styles.navBlurb} numberOfLines={1}>
                        {item.blurb}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {!sidebarCollapsed && !mobileLayout ? (
          <View style={styles.sidebarFooter}>
            <Text style={styles.sidebarFooterTitle}>Need help?</Text>
            <Text style={styles.sidebarFooterCopy}>
              Seller support is available from your Social Chat 24/7 account.
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView style={[styles.main, mobileLayout && styles.mainMobile]} contentContainerStyle={[styles.mainContent, mobileLayout && styles.mainContentMobile]}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.topBarTitle}>{navItems.find((item) => item.key === activeSection)?.label}</Text>
            <Text style={styles.topBarMeta}>
              {dashboard?.storefront?.name || "Seller workspace"}
              <Text style={styles.topBarDot}> • </Text>
              {dashboard?.storefront ? "Live workspace" : "Setup in progress"}
            </Text>
          </View>
          <View style={styles.topActions}>
            <Pressable style={styles.iconButton} accessibilityLabel="Notifications">
              <Bell size={18} color={ink} strokeWidth={2.1} />
              <View style={styles.notificationDot} />
            </Pressable>
            {activeSection !== "business_chat" ? <Pressable
              onPress={() => setActiveSection("catalog")}
              style={styles.topPrimaryAction}
            >
              <Plus size={17} color="#ffffff" strokeWidth={2.7} />
              <Text style={styles.topPrimaryActionText}>Add product</Text>
            </Pressable> : null}
            <Pressable style={styles.accountButton}>
              <View style={styles.accountAvatar}>
                <Text style={styles.accountAvatarText}>
                  {(dashboard?.storefront?.name || "S").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <ChevronDown size={16} color={muted} strokeWidth={2.3} />
            </Pressable>
          </View>
        </View>

        {activeSection !== "business_chat" ? <>
        <View style={styles.heroCard}>
          <View style={styles.heroCopyBlock}>
            <Text style={styles.heroEyebrow}>SOCIAL CHAT 24/7 COMMERCE</Text>
            <Text style={styles.heroTitle}>
              Your store, ready for the next sale.
            </Text>
            <Text style={styles.heroCopy}>
              Manage the products, inventory, storefront, and discoverability
              that power your customer-facing Shop experience.
            </Text>
          </View>
          <View style={styles.heroArtworkPanel}>
            <SellerArtwork source={sellerHeroIllustration} variant="hero" />
          </View>
          <StoreHealthCard
            score={healthScore}
            checks={healthChecks}
            onPress={() => setActiveSection(completedHealthChecks === 0 ? "storefront" : "catalog")}
          />
        </View>

        <View style={styles.metricsRow}>
          <MetricCard
            icon={LayoutGrid}
            label="Live products"
            value={String(liveProducts)}
            blurb="Published and in stock"
          />
          <MetricCard
            icon={Boxes}
            label="Inventory units"
            value={String(totalInventory)}
            blurb="Total stock across catalog"
          />
          <MetricCard
            icon={SearchCheck}
            label="SEO + AI coverage"
            value={`${seoCoverage}%`}
            blurb="Products with title, meta, and LLM summary"
          />
          <MetricCard
            icon={WalletCards}
            label="Commerce posture"
            value={dashboard?.storefront ? "Active" : "Setup"}
            blurb="Store readiness and operations"
          />
        </View>
        </> : null}

        {activeSection === "overview" ? (
          <View style={styles.sectionStack}>
            <SectionShell
              title="Overview"
              subtitle="A top-level pulse on storefront readiness, catalog quality, and discoverability."
              showArtwork={false}
            >
              <AnalyticsPanel
                hasStorefront={Boolean(dashboard?.storefront)}
                productCount={productCount}
                totalInventory={totalInventory}
                analytics={analytics}
              />
              <View style={styles.overviewGrid}>
                <InsightCard
                  title="Storefront status"
                  value={dashboard?.storefront ? "Configured" : "Pending"}
                  tone="green"
                  body={
                    dashboard?.storefront
                      ? `Your public storefront is available at /store/${dashboard.storefront.slug}.`
                      : "Complete your storefront profile to unlock public shopping pages."
                  }
                />
                <InsightCard
                  title="Catalog health"
                  value={`${productCount} products`}
                  tone="blue"
                  body="Use the Catalog section to manage SKUs, inventory counts, pricing, images, and product content."
                />
                <InsightCard
                  title="Search + AI readiness"
                  value={`${seoCoverage}%`}
                  tone="dark"
                  body="SEO titles, descriptions, summaries, and keyword fields help search engines and LLMs understand your storefront."
                />
              </View>
            </SectionShell>

            <SectionShell
              title="Commerce capabilities"
              subtitle="Everything your storefront needs to publish, operate, and be discovered."
              showArtwork={false}
            >
              <View style={styles.pillRow}>
                {[
                  "Storefront setup",
                  "SKU management",
                  "Inventory tracking",
                  "Media upload",
                  "Programmatic SEO",
                  "LLM-readable summaries",
                  "Web crawlable store pages",
                ].map((item) => (
                  <View key={item} style={styles.featurePill}>
                    <Text style={styles.featurePillText}>{item}</Text>
                  </View>
                ))}
              </View>
            </SectionShell>
          </View>
        ) : null}

        {activeSection === "storefront" ? (
          <SectionShell
            title="Storefront builder"
            subtitle="Brand identity, public slug, category fit, seller tier, and customer-facing information."
          >
            <TwoColumnLayout
              left={
                <>
                  <Field
                    label="Legal name"
                    value={sellerDraft.legalName}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, legalName: value }))
                    }
                  />
                  <Field
                    label="Storefront name"
                    value={sellerDraft.storefrontName}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({
                        ...current,
                        storefrontName: value,
                        storefrontSlug: current.storefrontSlug || slugify(value),
                      }))
                    }
                  />
                  <Field
                    label="Storefront slug"
                    value={sellerDraft.storefrontSlug}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({
                        ...current,
                        storefrontSlug: slugify(value),
                      }))
                    }
                  />
                  <Field
                    label="Tagline"
                    value={sellerDraft.tagline}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, tagline: value }))
                    }
                  />
                  <Field
                    label="Store description"
                    value={sellerDraft.description}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, description: value }))
                    }
                    multiline
                  />
                  <Field
                    label="Business type"
                    value={sellerDraft.businessType}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, businessType: value }))
                    }
                  />
                  <Field
                    label="Seller tier (local or gst)"
                    value={sellerDraft.sellerTier}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({
                        ...current,
                        sellerTier: value.trim().toLowerCase() === "gst" ? "gst" : "local",
                      }))
                    }
                  />
                  <Field
                    label="Primary category"
                    value={sellerDraft.primaryCategory}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({
                        ...current,
                        primaryCategory:
                          (shopCategories.find((item) => item === value) as Exclude<
                            ShopCategory,
                            "All"
                          > | undefined) ?? current.primaryCategory,
                      }))
                    }
                  />
                </>
              }
              right={
                <>
                  <PreviewCard
                    title="Storefront preview"
                    body="This is the metadata shape used for your consumer-facing shop destination."
                  >
                    <Text style={styles.previewTitle}>
                      {sellerDraft.storefrontName || "Your storefront name"}
                    </Text>
                    <Text style={styles.previewSlug}>
                      /store/{sellerDraft.storefrontSlug || "your-store"}
                    </Text>
                    <Text style={styles.previewTagline}>
                      {sellerDraft.tagline || "A clean tagline for your public store"}
                    </Text>
                    <Text style={styles.previewBody}>
                      {sellerDraft.description ||
                        "Your storefront description will appear here and will also support search engine and AI model understanding."}
                    </Text>
                  </PreviewCard>

                  <Field
                    label="State code"
                    value={sellerDraft.stateCode}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, stateCode: value }))
                    }
                  />
                  <Field
                    label="City"
                    value={sellerDraft.city}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, city: value }))
                    }
                  />
                  <Field
                    label="Support phone"
                    value={sellerDraft.phone}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, phone: value }))
                    }
                  />
                  <Field
                    label="Support email"
                    value={sellerDraft.email}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, email: value }))
                    }
                  />
                  <Field
                    label="Address"
                    value={sellerDraft.addressLine}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({
                        ...current,
                        addressLine: value,
                      }))
                    }
                    multiline
                  />
                  <Field
                    label="GSTIN (optional for now)"
                    value={sellerDraft.gstin ?? ""}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, gstin: value }))
                    }
                  />
                </>
              }
            />

            <ActionBar>
              <PrimaryButton
                label={dashboard?.storefront ? "Save storefront" : "Create seller account"}
                busy={busy}
                onPress={() => void saveSeller()}
              />
            </ActionBar>
          </SectionShell>
        ) : null}

        {activeSection === "catalog" ? (
          <SectionShell
            title="Catalog and inventory"
            subtitle="Merchandise products with pricing, inventory counts, SKUs, media, and conversion-focused copy."
          >
            <TwoColumnLayout
              left={
                <>
                  <Field
                    label="Product title"
                    value={productDraft.title}
                    onChangeText={(value) =>
                      setProductDraft((current) => ({
                        ...current,
                        title: value,
                        slug: current.slug || slugify(value),
                      }))
                    }
                  />
                  <Field
                    label="Product slug"
                    value={productDraft.slug}
                    onChangeText={(value) =>
                      setProductDraft((current) => ({
                        ...current,
                        slug: slugify(value),
                      }))
                    }
                  />
                  <Field
                    label="Brand"
                    value={productDraft.brand}
                    onChangeText={(value) =>
                      setProductDraft((current) => ({ ...current, brand: value }))
                    }
                  />
                  <Field
                    label="Category"
                    value={productDraft.category}
                    onChangeText={(value) =>
                      setProductDraft((current) => ({
                        ...current,
                        category:
                          (shopCategories.find((item) => item === value) as Exclude<
                            ShopCategory,
                            "All"
                          > | undefined) ?? current.category,
                      }))
                    }
                  />
                  <Field
                    label="Price in paise"
                    value={String(productDraft.pricePaise)}
                    keyboardType="numeric"
                    onChangeText={(value) =>
                      setProductDraft((current) => ({
                        ...current,
                        pricePaise: Number(value.replace(/\D+/g, "") || 0),
                      }))
                    }
                  />
                  <Field
                    label="Inventory"
                    value={String(productDraft.inventory)}
                    keyboardType="numeric"
                    onChangeText={(value) =>
                      setProductDraft((current) => ({
                        ...current,
                        inventory: Number(value.replace(/\D+/g, "") || 0),
                      }))
                    }
                  />
                  <Field
                    label="SKU"
                    value={productDraft.sku}
                    onChangeText={(value) =>
                      setProductDraft((current) => ({ ...current, sku: value }))
                    }
                  />
                </>
              }
              right={
                <>
                  <Field
                    label="Short description"
                    value={productDraft.shortDescription}
                    onChangeText={(value) =>
                      setProductDraft((current) => ({
                        ...current,
                        shortDescription: value,
                      }))
                    }
                  />
                  <Field
                    label="Product description"
                    value={productDraft.description}
                    onChangeText={(value) =>
                      setProductDraft((current) => ({
                        ...current,
                        description: value,
                      }))
                    }
                    multiline
                  />
                  <Field
                    label="Tags (comma separated)"
                    value={productDraft.tags.join(", ")}
                    onChangeText={(value) =>
                      setProductDraft((current) => ({
                        ...current,
                        tags: splitCsv(value),
                      }))
                    }
                  />
                  <Field
                    label="Search keywords (comma separated)"
                    value={productDraft.keywords.join(", ")}
                    onChangeText={(value) =>
                      setProductDraft((current) => ({
                        ...current,
                        keywords: splitCsv(value),
                      }))
                    }
                  />
                  <View style={styles.commissionPanel}>
                    <View style={styles.commissionHeadingRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.previewTitle}>Creator promotion</Text>
                        <Text style={styles.previewBody}>Let approved Creators promote this Product using tracked links.</Text>
                      </View>
                      <Switch
                        value={productDraft.creatorPromotionEnabled}
                        onValueChange={(value) => setProductDraft((current) => ({
                          ...current,
                          creatorPromotionEnabled: value,
                          creatorCommissionBps: value ? Math.max(current.creatorCommissionBps, 500) : 0,
                        }))}
                        trackColor={{ false: "#d8e1dc", true: "#a7e2c2" }}
                        thumbColor={productDraft.creatorPromotionEnabled ? green : "#ffffff"}
                      />
                    </View>
                    {productDraft.creatorPromotionEnabled ? (
                      <Field
                        label="Creator commission % (5–70)"
                        value={String(productDraft.creatorCommissionBps / 100)}
                        keyboardType="numeric"
                        onChangeText={(value) => setProductDraft((current) => ({
                          ...current,
                          creatorCommissionBps: Math.round(Number(value.replace(/[^0-9.]/g, "") || 0) * 100),
                        }))}
                      />
                    ) : null}
                    <Field
                      label="Return window days"
                      value={String(productDraft.returnWindowDays)}
                      keyboardType="numeric"
                      onChangeText={(value) => setProductDraft((current) => ({
                        ...current,
                        returnWindowDays: Math.max(0, Math.min(30, Number(value.replace(/\D+/g, "") || 0))),
                      }))}
                    />
                  </View>

                  <PreviewCard
                    title="Media"
                    body="Add up to ten product images stored through the Supabase-backed media flow."
                  >
                    <Pressable
                      style={styles.mediaPicker}
                      accessibilityRole="button"
                      accessibilityLabel="Add product media"
                      onPress={async () => {
                        if (!pickProductImages) {
                          Alert.alert(
                            "Picker unavailable",
                            "Media picker is not wired in this build.",
                          );
                          return;
                        }
                        const assets = await pickProductImages();
                        if (assets.length) {
                          setSelectedAssets(assets);
                          setProductSaveNotice(null);
                        }
                      }}
                    >
                      <Plus size={18} color={green} />
                      <Text style={styles.mediaPickerText}>
                        Add 1 to 10 product images
                      </Text>
                    </Pressable>
                    {selectedAssets.length ? (
                      <>
                        <Text style={styles.mediaSelectionText}>
                          {selectedAssets.length} media item(s) selected
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.assetRail}
                        >
                          {selectedAssets.map((asset) => (
                            <View key={asset.uri} style={styles.assetCard}>
                              <Image source={{ uri: asset.uri }} style={styles.assetImage} />
                            </View>
                          ))}
                        </ScrollView>
                      </>
                    ) : null}
                  </PreviewCard>
                </>
              }
            />

            <ActionBar>
              <PrimaryButton
                label={productDraft.id ? "Update product" : "Publish product"}
                busy={busy}
                onPress={() => void saveProduct()}
              />
            </ActionBar>
            {productSaveNotice ? (
              <Text
                accessibilityRole="alert"
                style={
                  productSaveNotice.tone === "error"
                    ? styles.productSaveError
                    : styles.productSaveSuccess
                }
              >
                {productSaveNotice.message}
              </Text>
            ) : null}

            <View style={styles.tableShell}>
              <Text style={styles.tableTitle}>Catalog inventory</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1.6 }]}>Product</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>SKU</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.9 }]}>Price</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.8 }]}>Stock</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.8 }]}>State</Text>
              </View>
              {(dashboard?.products ?? []).length ? (
                dashboard?.products.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit product ${item.name}`}
                    onPress={() => editProduct(item)}
                    style={styles.tableRow}
                  >
                    <View style={[styles.tableCell, { flex: 1.6 }]}>
                      <Text style={styles.tablePrimary}>{item.name}</Text>
                      <Text style={styles.tableSecondary}>@{item.storefrontSlug}</Text>
                    </View>
                    <Text style={[styles.tableCellText, { flex: 1 }]}>{item.sku}</Text>
                    <Text style={[styles.tableCellText, { flex: 0.9 }]}>
                      ₹{(item.pricePaise / 100).toFixed(2)}
                    </Text>
                    <Text style={[styles.tableCellText, { flex: 0.8 }]}>
                      {item.inventory}
                    </Text>
                    <View style={[styles.tableCell, { flex: 0.8 }]}>
                      <View
                        style={[
                          styles.stockBadge,
                          item.inStock ? styles.stockBadgeLive : styles.stockBadgeDraft,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stockBadgeText,
                            item.inStock
                              ? styles.stockBadgeTextLive
                              : styles.stockBadgeTextDraft,
                          ]}
                        >
                          {item.inStock ? "Live" : "Draft"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))
              ) : (
                <EmptyHint text="No products yet. Start by publishing your first SKU." />
              )}
            </View>
          </SectionShell>
        ) : null}

        {activeSection === "orders" ? (
          <SectionShell
            title="Orders and fulfilment"
            subtitle="Manage customer orders, pack references, carrier tracking, and delivery updates from one operational queue."
          >
            <View style={styles.orderToolbar}>
              <View>
                <Text style={styles.tableTitle}>Order queue</Text>
                <Text style={styles.orderToolbarCopy}>
                  Status updates feed the customer order timeline in Social Chat 24/7.
                </Text>
              </View>
              <Pressable style={styles.secondaryButton} onPress={() => void loadOrders()}>
                <Text style={styles.secondaryButtonText}>Refresh orders</Text>
              </Pressable>
            </View>
            {ordersLoading ? <ActivityIndicator color={green} /> : null}
            <View style={styles.tableShell}>
              <View style={styles.orderTableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>Order</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.25 }]}>Customer</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.9 }]}>Total</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Fulfilment</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.75 }]}>Action</Text>
              </View>
              {orders.length ? orders.map((order) => (
                <Pressable key={order.id} onPress={() => setSelectedOrder(order)} style={styles.orderRow}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.tablePrimary}>#{order.id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={styles.tableSecondary}>{formatDate(order.createdAt)}</Text>
                  </View>
                  <View style={{ flex: 1.25 }}>
                    <Text style={styles.tablePrimary}>{order.customerName}</Text>
                    <Text style={styles.tableSecondary}>@{order.customerUsername}</Text>
                  </View>
                  <Text style={[styles.tableCellText, { flex: 0.9 }]}>₹{(order.totalPaise / 100).toFixed(2)}</Text>
                  <View style={{ flex: 1 }}>
                    <OrderStatusBadge status={order.status} />
                    {order.fulfillment?.trackingNumber ? <Text style={styles.trackingText}>{order.fulfillment.trackingNumber}</Text> : null}
                  </View>
                  <View style={{ flex: 0.75 }}>
                    <Text style={styles.manageOrderText}>Manage</Text>
                  </View>
                </Pressable>
              )) : <EmptyHint text="No orders have arrived yet. New buyer orders will appear here automatically." />}
            </View>
          </SectionShell>
        ) : null}

        {activeSection === "business_chat" ? (
          <SectionShell
            title=""
            subtitle=""
            showArtwork={false}
          >
            <View style={styles.businessDesk}>
              <View style={styles.businessList}>
                <View style={styles.businessListHeader}>
                  <View><Text style={styles.businessListTitle}>Inbox</Text><Text style={styles.businessListMeta}>Customer conversations</Text></View>
                  <View style={styles.onlineBadge}><View style={styles.onlineDot} /><Text style={styles.onlineText}>Live</Text></View>
                </View>
                <View style={styles.inboxSearch}><Text style={styles.inboxSearchText}>Search conversations</Text></View>
                <View style={styles.inboxFilterRow}><Text style={styles.inboxFilterActive}>All</Text><Text style={styles.inboxFilter}>Unread</Text><Text style={styles.inboxFilter}>Orders</Text></View>
                {businessConversations.length ? businessConversations.map((conversation) => (
                  <Pressable
                    key={conversation.id}
                    onPress={() => setSelectedBusinessConversation(conversation)}
                    style={[styles.businessConversation, selectedBusinessConversation?.id === conversation.id && styles.businessConversationActive]}
                  >
                    <View style={styles.businessAvatar}><Text style={styles.businessAvatarText}>{conversation.customerName.slice(0, 1).toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.businessCustomerName}>{conversation.customerName}</Text>
                      <Text style={styles.businessLastMessage} numberOfLines={1}>{conversation.lastMessage}</Text>
                    </View>
                  </Pressable>
                )) : <View style={styles.inboxEmpty}><View style={styles.inboxEmptyMark}><MessageSquareText size={22} color={green} /></View><Text style={styles.inboxEmptyTitle}>Nothing new</Text><Text style={styles.inboxEmptyCopy}>Customer questions and product enquiries will appear here.</Text></View>}
              </View>
              <View style={styles.businessThread}>
                {selectedBusinessConversation ? (
                  <>
                    <View style={styles.threadHeader}>
                      <View style={styles.threadIdentity}>
                        <View style={styles.businessAvatar}><Text style={styles.businessAvatarText}>{selectedBusinessConversation.customerName.slice(0, 1).toUpperCase()}</Text></View>
                        <View><Text style={styles.businessCustomerName}>{selectedBusinessConversation.customerName}</Text><Text style={styles.threadMeta}>@{selectedBusinessConversation.customerUsername} · Customer</Text></View>
                      </View>
                      <View style={styles.threadActions}>
                        <Pressable style={styles.iconButton}><PhoneCall size={17} color={ink} /></Pressable>
                        <Pressable style={styles.iconButton}><Video size={17} color={ink} /></Pressable>
                      </View>
                    </View>
                    <ScrollView style={styles.messageRail} contentContainerStyle={styles.messageRailContent}>
                      {businessMessages.map((message) => {
                        const isSeller = message.senderId !== selectedBusinessConversation.customerId;
                        return <View key={message.id} style={[styles.businessBubble, isSeller ? styles.businessBubbleSeller : styles.businessBubbleCustomer]}><Text style={[styles.businessBubbleText, isSeller && styles.businessBubbleTextSeller]}>{message.body}</Text><Text style={[styles.messageTime, isSeller && styles.messageTimeSeller]}>{formatTime(message.createdAt)}</Text></View>;
                      })}
                    </ScrollView>
                    <View style={styles.replyComposer}>
                      <TextInput value={businessMessageDraft} onChangeText={setBusinessMessageDraft} placeholder="Reply as your store…" placeholderTextColor="#98a2b3" style={styles.replyInput} />
                      <Pressable onPress={() => void sendBusinessDeskMessage()} disabled={busy} style={styles.replySend}><Send size={17} color="#ffffff" /></Pressable>
                    </View>
                  </>
                ) : <BusinessDeskEmpty />}
              </View>
            </View>
          </SectionShell>
        ) : null}

        {activeSection === "discoverability" ? (
          <SectionShell
            title="SEO and AI crawlability"
            subtitle="Make product and storefront pages understandable to search engines and model-based discovery systems."
          >
            <TwoColumnLayout
              left={
                <>
                  <Field
                    label="SEO title"
                    value={sellerDraft.seoTitle}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, seoTitle: value }))
                    }
                  />
                  <Field
                    label="SEO description"
                    value={sellerDraft.seoDescription}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({
                        ...current,
                        seoDescription: value,
                      }))
                    }
                    multiline
                  />
                  <Field
                    label="LLM storefront summary"
                    value={sellerDraft.llmSummary}
                    onChangeText={(value) =>
                      setSellerDraft((current) => ({ ...current, llmSummary: value }))
                    }
                    multiline
                  />
                  <View style={styles.crawlControl}>
                    <View style={{ flex: 1 }}><Text style={styles.crawlTitle}>Publish crawlable pages</Text><Text style={styles.crawlCopy}>Enables indexable storefront and programmatic SKU URLs with metadata and JSON-LD.</Text></View>
                    <Switch value={sellerDraft.indexable ?? true} onValueChange={(value) => setSellerDraft((current) => ({ ...current, indexable: value }))} trackColor={{ false: "#d5ddd8", true: "#7ee0aa" }} thumbColor={sellerDraft.indexable ? green : "#ffffff"} />
                  </View>
                  <View style={styles.crawlControl}>
                    <View style={{ flex: 1 }}><Text style={styles.crawlTitle}>Enable GEO summaries</Text><Text style={styles.crawlCopy}>Adds location and plain-language business context for AI search and local intent.</Text></View>
                    <Switch value={sellerDraft.geoEnabled ?? true} onValueChange={(value) => setSellerDraft((current) => ({ ...current, geoEnabled: value }))} trackColor={{ false: "#d5ddd8", true: "#7ee0aa" }} thumbColor={sellerDraft.geoEnabled ? green : "#ffffff"} />
                  </View>
                </>
              }
              right={
                <>
                  <PreviewCard
                    title="Discoverability guidance"
                    body="Your public storefront and product pages are intended to remain crawlable so they can rank in search and be legible to AI-driven discovery."
                  >
                    <View style={styles.guidanceList}>
                      {[
                        "Use category-specific product titles",
                        "Write plain-language meta descriptions",
                        "Keep keywords relevant to product intent",
                        "Add LLM summaries that explain product utility clearly",
                        "Maintain unique copy for storefront and products",
                      ].map((item) => (
                        <View key={item} style={styles.guidanceRow}>
                          <View style={styles.guidanceDot} />
                          <Text style={styles.guidanceText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </PreviewCard>
                  <PreviewCard title="Programmatic page inventory" body="Every active SKU receives its own canonical, crawlable URL when publishing is enabled.">
                    <InfoRow label="Storefront" value={`/store/${sellerDraft.storefrontSlug || "your-store"}`} />
                    <InfoRow label="Active product pages" value={`${liveProducts} programmatic URLs`} />
                    <InfoRow label="Sitemap status" value={sellerDraft.indexable === false ? "Paused" : "Ready for crawl"} />
                    <InfoRow label="GEO context" value={sellerDraft.geoEnabled === false ? "Off" : `${sellerDraft.city || "City"}, ${sellerDraft.stateCode || "State"}`} />
                  </PreviewCard>

                  <PreviewCard
                    title="Search preview"
                    body="A simplified preview of how your listing metadata may appear."
                  >
                    <Text style={styles.searchPreviewTitle}>
                      {sellerDraft.seoTitle || "Your SEO title will appear here"}
                    </Text>
                    <Text style={styles.searchPreviewUrl}>
                      https://socialchat247.app/store/
                      {sellerDraft.storefrontSlug || "your-store"}
                    </Text>
                    <Text style={styles.searchPreviewBody}>
                      {sellerDraft.seoDescription ||
                        "Your SEO description will support search engine results and AI retrieval summaries."}
                    </Text>
                  </PreviewCard>
                </>
              }
            />

            <ActionBar>
              <PrimaryButton
                label="Save discoverability settings"
                busy={busy}
                onPress={() => void saveSeller()}
              />
            </ActionBar>
          </SectionShell>
        ) : null}

        {activeSection === "operations" ? (
          <SectionShell
            title="Operations"
            subtitle="Customer support posture, commercial readiness, and seller-side controls."
          >
            <View style={styles.operationsGrid}>
              <PreviewCard
                title="Support profile"
                body="The contact details below are used to coordinate commerce operations and storefront trust."
              >
                <Field
                  label="Support email"
                  value={sellerDraft.email}
                  onChangeText={(email) =>
                    setSellerDraft((current) => ({ ...current, email }))
                  }
                />
                <Field
                  label="Phone"
                  value={sellerDraft.phone}
                  onChangeText={(phone) =>
                    setSellerDraft((current) => ({ ...current, phone }))
                  }
                />
                <Field
                  label="City"
                  value={sellerDraft.city}
                  onChangeText={(city) =>
                    setSellerDraft((current) => ({ ...current, city }))
                  }
                />
                <Field
                  label="State"
                  value={sellerDraft.stateCode}
                  onChangeText={(stateCode) =>
                    setSellerDraft((current) => ({ ...current, stateCode }))
                  }
                />
                <PrimaryButton
                  label="Save support details"
                  busy={busy}
                  onPress={() => void saveSeller()}
                />
              </PreviewCard>

              <PreviewCard
                title="Commerce readiness"
                body="A fast health read for the seller workspace."
              >
                <InfoRow
                  label="Storefront"
                  value={dashboard?.storefront ? "Configured" : "Pending"}
                />
                <InfoRow label="Products" value={String(productCount)} />
                <InfoRow label="Inventory" value={String(totalInventory)} />
                <InfoRow label="SEO coverage" value={`${seoCoverage}%`} />
              </PreviewCard>
            </View>
          </SectionShell>
        ) : null}
      </ScrollView>
      <FulfillmentModal
        order={selectedOrder}
        busy={busy}
        onClose={() => setSelectedOrder(null)}
        onSave={saveOrderFulfillment}
      />
    </View>
  );
}

function FulfillmentModal({
  order,
  busy,
  onClose,
  onSave,
}: {
  order: SellerOrder | null;
  busy: boolean;
  onClose: () => void;
  onSave: (input: {
    status: SellerOrderStatus;
    carrier: string;
    trackingNumber: string;
    packageReference: string;
    customerNote: string;
  }) => void;
}) {
  const [status, setStatus] = useState<SellerOrderStatus>("confirmed");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [packageReference, setPackageReference] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  useEffect(() => {
    if (!order) return;
    setStatus(order.status);
    setCarrier(order.fulfillment?.carrier ?? "");
    setTrackingNumber(order.fulfillment?.trackingNumber ?? "");
    setPackageReference(order.fulfillment?.packageReference ?? "");
    setCustomerNote(order.fulfillment?.customerNote ?? "");
  }, [order?.id]);

  return (
    <Modal transparent visible={Boolean(order)} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.fulfillmentModal}>
          <View style={styles.modalHeading}>
            <View>
              <Text style={styles.modalEyebrow}>FULFILMENT DESK</Text>
              <Text style={styles.modalTitle}>Order #{order?.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.modalCopy}>Update packing, carrier, and tracking information for {order?.customerName ?? "the customer"}.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalClose}><Text style={styles.modalCloseText}>×</Text></Pressable>
          </View>
          <View style={styles.statusSelector}>
            {(["confirmed", "processing", "shipped", "out_for_delivery", "delivered"] as SellerOrderStatus[]).map((value) => (
              <Pressable key={value} onPress={() => setStatus(value)} style={[styles.statusOption, status === value && styles.statusOptionActive]}>
                <Text style={[styles.statusOptionText, status === value && styles.statusOptionTextActive]}>{value.replaceAll("_", " ")}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.modalFields}>
            <Field label="Carrier" value={carrier} onChangeText={setCarrier} />
            <Field label="Tracking number" value={trackingNumber} onChangeText={setTrackingNumber} />
            <Field label="Package reference / SKU bundle" value={packageReference} onChangeText={setPackageReference} />
            <Field label="Customer delivery note" value={customerNote} onChangeText={setCustomerNote} multiline />
          </View>
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.modalCancel}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
            <PrimaryButton label="Save fulfilment" busy={busy} onPress={() => onSave({ status, carrier, trackingNumber, packageReference, customerNote })} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OrderStatusBadge({ status }: { status: SellerOrderStatus }) {
  const tone = status === "delivered" ? styles.orderStatusDelivered : status === "shipped" || status === "out_for_delivery" ? styles.orderStatusTransit : styles.orderStatusActive;
  return <View style={[styles.orderStatusBadge, tone]}><PackageCheck size={13} color={status === "delivered" ? "#0a7f4d" : "#3d617d"} /><Text style={styles.orderStatusText}>{status.replaceAll("_", " ")}</Text></View>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  blurb,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  blurb: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIconWrap}>
        <Icon size={18} color={greenDeep} strokeWidth={2.3} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricBlurb}>{blurb}</Text>
    </View>
  );
}

function StoreHealthCard({
  score,
  checks,
  onPress,
}: {
  score: number;
  checks: Array<{ label: string; complete: boolean }>;
  onPress: () => void;
}) {
  const completed = checks.filter((item) => item.complete).length;
  return (
    <View style={styles.storeHealthCard}>
      <View style={styles.storeHealthTopRow}>
        <View>
          <Text style={styles.storeHealthEyebrow}>LAUNCH READINESS</Text>
          <Text style={styles.storeHealthTitle}>{completed} of {checks.length} essentials ready</Text>
        </View>
        <View style={styles.healthRing}>
          <View style={styles.healthRingInner}>
            <Text style={styles.healthRingValue}>{score}</Text>
            <Text style={styles.healthRingUnit}>%</Text>
          </View>
        </View>
      </View>
      <View style={styles.healthCheckList}>
        {checks.slice(0, 3).map((item) => (
          <View key={item.label} style={styles.healthCheckRow}>
            <View style={[styles.healthCheckDot, item.complete && styles.healthCheckDotComplete]} />
            <Text style={[styles.healthCheckText, item.complete && styles.healthCheckTextComplete]}>{item.label}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={onPress} style={styles.healthAction}>
        <Text style={styles.healthActionText}>{completed === checks.length ? "Review operations" : "Complete next step"}</Text>
      </Pressable>
    </View>
  );
}

function AnalyticsPanel({
  hasStorefront,
  productCount,
  totalInventory,
  analytics,
}: {
  hasStorefront: boolean;
  productCount: number;
  totalInventory: number;
  analytics: SellerAnalytics | null;
}) {
  return (
    <View style={styles.analyticsStack}>
      <View style={styles.analyticsPanel}>
        <View style={styles.analyticsCopy}>
          <View style={styles.analyticsLabelRow}><View style={styles.analyticsIconOrb}><BarChart3 size={18} color="#ffffff" strokeWidth={2.3} /></View><Text style={styles.analyticsEyebrow}>STORE PERFORMANCE</Text></View>
          <Text style={styles.analyticsTitle}>A clearer pulse on your commerce activity.</Text>
          <Text style={styles.analyticsText}>{hasStorefront ? `${productCount} catalog items and ${totalInventory} units contribute to your store health.` : "Finish your storefront setup to unlock live sales, fulfilment, and conversion reporting."}</Text>
        </View>
        <View style={styles.analyticsQuickStats}>
          <MiniStat label="Daily active" value={String(analytics?.dailyActiveVisitors ?? 0)} />
          <MiniStat label="Monthly active" value={String(analytics?.monthlyActiveVisitors ?? 0)} />
          <MiniStat label="Conversion" value={`${analytics?.conversionRate ?? 0}%`} />
        </View>
      </View>
      <SellerAnalyticsCharts analytics={analytics} />
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) { return <View style={styles.miniStat}><Text style={styles.miniStatValue}>{value}</Text><Text style={styles.miniStatLabel}>{label}</Text></View>; }

function MetricChart({ title, value, note, color, values, labels }: { title: string; value: string; note: string; color: string; values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return <View style={styles.metricChart}><View style={styles.metricChartHeader}><View><Text style={styles.metricChartTitle}>{title}</Text><Text style={styles.metricChartValue}>{value}</Text></View><View style={[styles.chartGlow, { backgroundColor: color }]} /></View><Text style={styles.metricChartNote}>{note}</Text><View style={styles.metricBars}>{values.map((value, index) => <View key={`${labels[index]}-${index}`} style={styles.metricBarItem}><View style={styles.metricBarWell}><View style={[styles.metricBarFill, { height: `${Math.max(5, (value / max) * 100)}%`, backgroundColor: color }]} /></View>{index % 2 === 0 ? <Text style={styles.metricChartTick}>{labels[index]}</Text> : null}</View>)}</View></View>;
}

function PaymentChart({ paymentMix, productViews }: { paymentMix: Array<{ label: string; value: number }>; productViews: number }) {
  const total = paymentMix.reduce((sum, item) => sum + item.value, 0);
  return <View style={styles.metricChart}><View style={styles.metricChartHeader}><View><Text style={styles.metricChartTitle}>Payment mix</Text><Text style={styles.metricChartValue}>{total}</Text></View><View style={[styles.chartGlow, { backgroundColor: "#f3ad3d" }]} /></View><Text style={styles.metricChartNote}>{productViews} product detail views</Text><View style={styles.paymentChartBody}><View style={styles.paymentDonut}><View style={styles.paymentDonutInner}><Text style={styles.paymentDonutText}>{total ? "100%" : "—"}</Text></View></View><View style={styles.paymentLegend}>{paymentMix.map((item, index) => <View key={item.label} style={styles.paymentLegendRow}><View style={[styles.paymentLegendDot, { backgroundColor: index === 0 ? green : "#f3ad3d" }]} /><Text style={styles.paymentLegendLabel}>{item.label}</Text><Text style={styles.paymentLegendValue}>{item.value}</Text></View>)}</View></View></View>;
}

function SectionShell({
  title,
  subtitle,
  children,
  showArtwork = true,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  showArtwork?: boolean;
}) {
  return (
    <View style={styles.sectionShell}>
      <View style={styles.sectionHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        {showArtwork ? <SectionArt section={title} /> : null}
      </View>
      <View style={styles.sectionInner}>{children}</View>
    </View>
  );
}

function SectionArt({ section }: { section: string }) {
  const image = section.includes("Storefront") ? sellerSectionIllustrations.storefront : section.includes("Catalog") ? sellerSectionIllustrations.catalog : section.includes("Order") ? sellerSectionIllustrations.orders : section.includes("Business") ? sellerSectionIllustrations.business : section.includes("SEO") ? sellerSectionIllustrations.seo : section.includes("Operation") ? sellerSectionIllustrations.operations : sellerHeroIllustration;
  return (
    <View style={styles.sectionArt}>
      <SellerArtwork source={image} variant="section" />
    </View>
  );
}

function SellerArtwork({
  source,
  variant,
}: {
  source: number;
  variant: "hero" | "section";
}) {
  const style = variant === "hero" ? styles.heroIllustration : styles.sectionArtImage;
  if (Platform.OS === "web") {
    return (
      <img
        alt=""
        src={Asset.fromModule(source).uri}
        style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
      />
    );
  }
  return <Image source={source} resizeMode="cover" style={style} />;
}

function TwoColumnLayout({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <View style={styles.twoCol}>
      <View style={styles.column}>{left}</View>
      <View style={styles.column}>{right}</View>
    </View>
  );
}

function PreviewCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.previewCard}>
      <Text style={styles.previewCardTitle}>{title}</Text>
      <Text style={styles.previewCardBody}>{body}</Text>
      <View style={{ marginTop: 14, gap: 12 }}>{children}</View>
    </View>
  );
}

function InsightCard({
  title,
  value,
  body,
  tone,
}: {
  title: string;
  value: string;
  body: string;
  tone: "green" | "blue" | "dark";
}) {
  const toneStyle =
    tone === "green"
      ? styles.insightGreen
      : tone === "blue"
        ? styles.insightBlue
        : styles.insightDark;
  return (
    <View style={[styles.insightCard, toneStyle]}>
      <Text style={styles.insightTitle}>{title}</Text>
      <Text style={styles.insightValue}>{value}</Text>
      <Text style={styles.insightBody}>{body}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholder={label}
        placeholderTextColor="#97a6b5"
        style={[styles.field, multiline && styles.fieldArea]}
      />
    </View>
  );
}

function ActionBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.actionBar}>{children}</View>;
}

function PrimaryButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.primaryButton}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </Pressable>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <View style={styles.emptyHint}>
      <Text style={styles.emptyHintText}>{text}</Text>
    </View>
  );
}

function BusinessDeskEmpty() {
  return (
    <View style={styles.businessDeskEmpty}>
      <View style={styles.businessDeskOrb}><MessageSquareText size={32} color="#ffffff" /></View>
      <Text style={styles.businessDeskEmptyTitle}>Your business inbox is ready</Text>
      <Text style={styles.businessDeskEmptyCopy}>Select a customer conversation to read and reply. New chats from your storefront arrive here in real time.</Text>
      <View style={styles.businessDeskEmptyPills}><Text style={styles.businessDeskEmptyPill}>Store replies</Text><Text style={styles.businessDeskEmptyPill}>Order support</Text><Text style={styles.businessDeskEmptyPill}>Customer care</Text></View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f6f7f8",
    flexDirection: "row",
  },
  pageMobile: { flexDirection: "column" },
  sidebar: {
    width: 258,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 16,
    borderRightWidth: 1,
    borderRightColor: "#e7e9ea",
  },
  sidebarCollapsed: { width: 76, paddingHorizontal: 12 },
  sidebarMobile: { width: "100%", paddingTop: 10, paddingBottom: 8, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: "#e7e9ea" },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    paddingBottom: 17,
    borderBottomWidth: 1,
    borderBottomColor: "#edf0ef",
  },
  brandBlockMobile: { paddingBottom: 8 },
  sidebarToggle: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#f7f8f8" },
  logoMark: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#0b8d55",
    shadowColor: "#078549",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  brandTitle: { color: ink, fontFamily: commerceFont, fontWeight: "800", fontSize: 15, letterSpacing: -0.2 },
  brandMeta: { color: "#74808d", marginTop: 2, fontSize: 11, fontWeight: "600" },
  sidebarStatus: {
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: "#eff9f3",
    padding: 14,
    borderWidth: 1,
    borderColor: "#d5eddd",
  },
  sidebarStatusEyebrow: {
    color: "#368354",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  sidebarStatusTitle: {
    color: ink,
    marginTop: 7,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 22,
  },
  sidebarStatusCopy: {
    marginTop: 5,
    color: "#5e7768",
    fontSize: 12,
    lineHeight: 18,
  },
  navList: { marginTop: 18, gap: 4 },
  navListMobile: { marginTop: 4, flexDirection: "row", paddingRight: 10 },
  navItem: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "transparent",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  navItemActive: {
    backgroundColor: "#eff9f3",
  },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e6ece8",
    shadowColor: "#9ba9a1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 2,
    elevation: 2,
  },
  navIconWrapActive: { backgroundColor: green, borderColor: "#0b9557", shadowColor: "#078549", shadowOpacity: 0.32, elevation: 4 },
  navLabel: { color: "#485563", fontWeight: "700", fontSize: 13 },
  navLabelActive: { color: greenDeep },
  navBlurb: { color: "#7a8a83", marginTop: 2, fontSize: 10, lineHeight: 14 },
  navBlurbActive: { color: "#5e7768" },
  sidebarFooter: {
    marginTop: "auto",
    borderRadius: 14,
    backgroundColor: "#f7f8f8",
    padding: 13,
    borderWidth: 1,
    borderColor: "#eaedeb",
  },
  sidebarFooterTitle: { color: ink, fontWeight: "800", fontSize: 12 },
  sidebarFooterCopy: { color: muted, marginTop: 5, fontSize: 11, lineHeight: 16 },
  main: { flex: 1 },
  mainMobile: { width: "100%" },
  mainContent: { padding: 22, gap: 18, paddingBottom: 44, maxWidth: 1500, width: "100%", alignSelf: "center" },
  mainContentMobile: { padding: 12, gap: 12 },
  topBar: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  topBarTitle: { color: ink, fontFamily: commerceFont, fontSize: 20, fontWeight: "800", letterSpacing: -0.45 },
  topBarMeta: { marginTop: 4, color: muted, fontSize: 12 },
  topBarDot: { color: "#b4bfc8" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconButton: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: "#e5e8e9", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  notificationDot: { position: "absolute", width: 7, height: 7, borderRadius: 4, backgroundColor: green, borderWidth: 1, borderColor: "#ffffff", top: 8, right: 9 },
  topPrimaryAction: { minHeight: 38, paddingHorizontal: 13, borderRadius: 11, backgroundColor: green, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  topPrimaryActionText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  accountButton: { paddingLeft: 3, flexDirection: "row", alignItems: "center", gap: 5 },
  accountAvatar: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#1f2937", alignItems: "center", justifyContent: "center" },
  accountAvatarText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  heroCard: {
    borderRadius: 18,
    padding: 22,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e9ea",
    flexDirection: "row",
    gap: 20,
    alignItems: "stretch",
    minHeight: 250,
  },
  heroCopyBlock: { flex: 1, minWidth: 280, justifyContent: "center", paddingVertical: 10 },
  heroArtworkPanel: {
    width: 300,
    minHeight: 204,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#eff9f3",
    borderWidth: 1,
    borderColor: "#d4ecdc",
    alignItems: "center",
    justifyContent: "center",
  },
  heroIllustration: { width: "100%", height: "100%", opacity: 1 },
  heroEyebrow: {
    color: greenDeep,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  heroTitle: {
    marginTop: 9,
    color: ink,
    fontSize: 29,
    lineHeight: 35,
    fontFamily: commerceFont,
    fontWeight: "800",
    maxWidth: 760,
  },
  heroCopy: { marginTop: 10, color: muted, fontSize: 13, lineHeight: 21, maxWidth: 690 },
  storeHealthCard: {
    width: 260,
    borderRadius: 16,
    backgroundColor: "#102a1f",
    padding: 16,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#1f4d3a",
  },
  storeHealthTopRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" },
  storeHealthEyebrow: { color: "#9bcbb0", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  storeHealthTitle: { marginTop: 6, color: "#ffffff", maxWidth: 118, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  healthRing: { width: 58, height: 58, borderRadius: 29, padding: 5, backgroundColor: "#22bc75", shadowColor: "#021a0d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.32, shadowRadius: 5, elevation: 4 },
  healthRingInner: { flex: 1, borderRadius: 24, backgroundColor: "#173a2b", alignItems: "center", justifyContent: "center", flexDirection: "row" },
  healthRingValue: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  healthRingUnit: { color: "#aee5c4", fontSize: 8, marginTop: 5, fontWeight: "800" },
  healthCheckList: { marginTop: 13, gap: 7 },
  healthCheckRow: { flexDirection: "row", gap: 7, alignItems: "center" },
  healthCheckDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#486c5a" },
  healthCheckDotComplete: { backgroundColor: "#56da91", shadowColor: "#56da91", shadowOpacity: 0.45, shadowRadius: 3, elevation: 2 },
  healthCheckText: { color: "#8eae9d", fontSize: 10, fontWeight: "700" },
  healthCheckTextComplete: { color: "#d6eee0" },
  healthAction: { marginTop: 14, borderRadius: 9, backgroundColor: "#1d4936", paddingVertical: 9, alignItems: "center", borderWidth: 1, borderColor: "#356a50" },
  healthActionText: { color: "#dcf9e8", fontSize: 10, fontWeight: "900" },
  metricsRow: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  metricCard: {
    minWidth: 210,
    flexGrow: 1,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: "#e7e9ea",
    shadowColor: "#476153",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  metricIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#eff9f3",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d6eddf",
    shadowColor: "#799988",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 3,
  },
  metricLabel: { marginTop: 13, color: muted, fontSize: 11, fontWeight: "700" },
  metricValue: { marginTop: 6, color: ink, fontFamily: commerceFont, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  metricBlurb: { marginTop: 6, color: muted, fontSize: 11, lineHeight: 17 },
  sectionStack: { gap: 20 },
  sectionShell: {
    borderRadius: 18,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "#e7e9ea",
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "stretch", gap: 20 },
  sectionArt: { width: 210, minHeight: 122, borderRadius: 15, overflow: "hidden", backgroundColor: "#f3f8f5", borderWidth: 1, borderColor: "#e0ebe4", alignItems: "center", justifyContent: "center" },
  sectionArtImage: { width: "100%", height: "100%", opacity: 1 },
  analyticsStack: { gap: 14 },
  analyticsPanel: { borderRadius: 16, backgroundColor: "#102a1f", padding: 18, flexDirection: "row", gap: 18, overflow: "hidden" },
  analyticsCopy: { flex: 1, minWidth: 235 },
  analyticsLabelRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  analyticsIconOrb: { width: 34, height: 34, borderRadius: 11, backgroundColor: green, alignItems: "center", justifyContent: "center", shadowColor: "#0c7a4c", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 3, elevation: 4 },
  analyticsEyebrow: { color: "#a9d9bd", fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  analyticsTitle: { marginTop: 13, color: "#ffffff", fontSize: 19, fontWeight: "800", lineHeight: 25 },
  analyticsText: { marginTop: 7, color: "#bed2c5", fontSize: 12, lineHeight: 18, maxWidth: 430 },
  analyticsLegend: { marginTop: 15, flexDirection: "row", alignItems: "center", gap: 6 },
  analyticsLegendDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: "#42d780" },
  analyticsLegendText: { color: "#dcf6e6", fontSize: 10, fontWeight: "700" },
  analyticsPeriod: { marginLeft: "auto", color: "#86a694", fontSize: 10 },
  analyticsQuickStats: { width: 305, flexDirection: "row", gap: 8, alignItems: "stretch" },
  miniStat: { flex: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 13, justifyContent: "center", backgroundColor: "#1b402f", borderWidth: 1, borderColor: "#2e5945" },
  miniStatValue: { color: "#ffffff", fontSize: 17, fontWeight: "800" },
  miniStatLabel: { marginTop: 5, color: "#a9c4b2", fontSize: 9, lineHeight: 12, fontWeight: "700" },
  analyticsChartsGrid: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  metricChart: { flex: 1, minWidth: 250, minHeight: 214, borderRadius: 15, backgroundColor: "#fbfcfc", borderWidth: 1, borderColor: "#e5ebe8", padding: 15 },
  metricChartHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  metricChartTitle: { color: "#596773", fontSize: 11, fontWeight: "700" },
  metricChartValue: { marginTop: 6, color: ink, fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  metricChartNote: { marginTop: 4, color: "#87939c", fontSize: 10 },
  chartGlow: { width: 12, height: 12, borderRadius: 6, shadowColor: "#546", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  metricBars: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 5, paddingTop: 12 },
  metricBarItem: { flex: 1, height: 106, alignItems: "center", justifyContent: "flex-end" },
  metricBarWell: { width: "100%", flex: 1, justifyContent: "flex-end", borderRadius: 5, backgroundColor: "#eef2f0", overflow: "hidden" },
  metricBarFill: { width: "100%", borderRadius: 5, minHeight: 4 },
  metricChartTick: { height: 14, marginTop: 4, color: "#8b969e", fontSize: 8 },
  paymentChartBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 10 },
  paymentDonut: { width: 92, height: 92, borderRadius: 46, backgroundColor: "#f3ad3d", padding: 14, borderWidth: 9, borderColor: green, alignItems: "center", justifyContent: "center", shadowColor: "#c5a36a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 3 },
  paymentDonutInner: { width: "100%", height: "100%", borderRadius: 40, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  paymentDonutText: { color: ink, fontSize: 12, fontWeight: "800" },
  paymentLegend: { flex: 1, gap: 10 },
  paymentLegendRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  paymentLegendDot: { width: 8, height: 8, borderRadius: 4 },
  paymentLegendLabel: { flex: 1, color: "#66747d", fontSize: 10 },
  paymentLegendValue: { color: ink, fontSize: 11, fontWeight: "800" },
  chartCard: { width: 310, minHeight: 160, borderRadius: 14, backgroundColor: "#183a2c", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22, position: "relative", overflow: "hidden" },
  chartGridLine: { position: "absolute", left: 16, right: 16, top: "22%", height: 1, backgroundColor: "#2a5540" },
  chartBars: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 7 },
  chartBarGroup: { flex: 1, height: 120, justifyContent: "flex-end", alignItems: "center" },
  chartBar: { width: "100%", maxWidth: 18, borderRadius: 6, backgroundColor: "#4ce28c", borderWidth: 1, borderColor: "#7bf0a9", shadowColor: "#0a9659", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 2, elevation: 2 },
  chartTick: { position: "absolute", bottom: -17, color: "#8aad9b", fontSize: 9 },
  sectionTitle: { color: ink, fontFamily: commerceFont, fontSize: 20, fontWeight: "800", letterSpacing: -0.35 },
  sectionSubtitle: { marginTop: 5, color: muted, fontSize: 12, lineHeight: 19 },
  sectionInner: { marginTop: 18, gap: 16 },
  overviewGrid: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  insightCard: {
    flexGrow: 1,
    minWidth: 250,
    borderRadius: 15,
    padding: 17,
  },
  insightGreen: { backgroundColor: "#eff9f3" },
  insightBlue: { backgroundColor: "#f2f7fc" },
  insightDark: { backgroundColor: "#f4f5f6" },
  insightTitle: { color: muted, fontSize: 11, fontWeight: "700" },
  insightValue: { color: ink, fontSize: 25, fontWeight: "800", marginTop: 10 },
  insightBody: { color: "#4c5f73", marginTop: 7, fontSize: 12, lineHeight: 19 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  featurePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f7f8f8",
    borderWidth: 1,
    borderColor: "#e2ebe5",
  },
  featurePillText: { color: "#45545d", fontWeight: "700", fontSize: 11 },
  twoCol: { flexDirection: "row", gap: 18, flexWrap: "wrap" },
  column: { flex: 1, minWidth: 280, gap: 14 },
  fieldWrap: { gap: 8 },
  fieldLabel: { color: "#34414d", fontWeight: "700", fontSize: 12 },
  field: {
    borderWidth: 1,
    borderColor: line,
    backgroundColor: "#ffffff",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: ink,
    fontSize: 14,
  },
  fieldArea: { minHeight: 112, textAlignVertical: "top" },
  crawlControl: { borderRadius: 13, borderWidth: 1, borderColor: "#dbe9e0", backgroundColor: "#f4fbf7", padding: 14, flexDirection: "row", alignItems: "center", gap: 14 },
  crawlTitle: { color: ink, fontSize: 13, fontWeight: "800" },
  crawlCopy: { marginTop: 4, color: "#587062", fontSize: 11, lineHeight: 16 },
  previewCard: {
    borderRadius: 14,
    padding: 17,
    backgroundColor: "#f9faf9",
    borderWidth: 1,
    borderColor: "#e2ebe5",
  },
  previewCardTitle: { color: ink, fontSize: 15, fontWeight: "800" },
  previewCardBody: { marginTop: 6, color: muted, fontSize: 12, lineHeight: 19 },
  previewTitle: { color: ink, fontSize: 22, fontWeight: "900" },
  previewSlug: { color: greenDeep, fontSize: 13, fontWeight: "800" },
  previewTagline: { color: "#345346", fontSize: 13, fontWeight: "700" },
  previewBody: { color: muted, fontSize: 13, lineHeight: 20 },
  mediaPicker: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbe8d7",
    backgroundColor: "#eff8f3",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mediaPickerText: { color: greenDeep, fontWeight: "800", fontSize: 14 },
  mediaSelectionText: { color: greenDeep, fontWeight: "800", fontSize: 12 },
  assetRail: { gap: 10, paddingTop: 4 },
  assetCard: {
    width: 96,
    height: 96,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#edf4ef",
  },
  assetImage: { width: "100%", height: "100%" },
  actionBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 6,
  },
  primaryButton: {
    minWidth: 190,
    borderRadius: 11,
    backgroundColor: green,
    paddingHorizontal: 22,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#ffffff", fontWeight: "900", fontSize: 14 },
  productSaveSuccess: { color: greenDeep, fontSize: 13, fontWeight: "800" },
  productSaveError: { color: "#b42318", fontSize: 13, fontWeight: "800" },
  tableShell: {
    marginTop: 4,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#e2ebe5",
    overflow: "hidden",
  },
  tableTitle: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    color: ink,
    fontWeight: "800",
    fontSize: 16,
    backgroundColor: "#fafbfb",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#f4f8f5",
    borderTopWidth: 1,
    borderTopColor: "#e2ebe5",
  },
  tableHeaderText: { color: "#587061", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: "#eef3ef",
    backgroundColor: "#ffffff",
  },
  orderToolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16 },
  orderToolbarCopy: { color: muted, fontSize: 12, marginTop: 5 },
  secondaryButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#dfe5e2", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: "#315240", fontSize: 12, fontWeight: "800" },
  orderTableHeader: { flexDirection: "row", paddingHorizontal: 18, paddingVertical: 12, backgroundColor: "#f7f9f8", borderTopWidth: 1, borderTopColor: "#e2ebe5" },
  orderRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#eef3ef", backgroundColor: "#ffffff" },
  orderStatusBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  orderStatusActive: { backgroundColor: "#edf4f8" },
  orderStatusTransit: { backgroundColor: "#fff5df" },
  orderStatusDelivered: { backgroundColor: "#e8f8ee" },
  orderStatusText: { color: "#38546b", fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  trackingText: { marginTop: 4, color: muted, fontSize: 10 },
  manageOrderText: { color: greenDeep, fontWeight: "800", fontSize: 12 },
  businessDesk: { minHeight: 620, flexDirection: "row", borderWidth: 1, borderColor: "#dce5e0", borderRadius: 18, overflow: "hidden", backgroundColor: "#ffffff", shadowColor: "#2b4938", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 5 },
  businessList: { width: 330, borderRightWidth: 1, borderRightColor: "#e5ece8", backgroundColor: "#fbfcfb" },
  businessListHeader: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  businessListTitle: { color: ink, fontWeight: "900", fontSize: 18, letterSpacing: -0.3 },
  businessListMeta: { color: "#829087", fontSize: 11, marginTop: 3 },
  inboxSearch: { marginHorizontal: 14, height: 38, borderRadius: 10, backgroundColor: "#f0f4f1", paddingHorizontal: 12, justifyContent: "center" },
  inboxSearchText: { color: "#8b978f", fontSize: 12, fontWeight: "600" },
  inboxFilterRow: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 17, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e8eeea" },
  inboxFilter: { color: "#85928a", fontSize: 11, fontWeight: "700" },
  inboxFilterActive: { color: greenDeep, fontSize: 11, fontWeight: "900" },
  onlineBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#edf9f1", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  onlineDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: green },
  onlineText: { color: greenDeep, fontWeight: "800", fontSize: 10 },
  businessConversation: { padding: 14, flexDirection: "row", gap: 10, borderBottomWidth: 1, borderBottomColor: "#eef1f0" },
  businessConversationActive: { backgroundColor: "#eff9f3" },
  businessAvatar: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#dff5e7", alignItems: "center", justifyContent: "center" },
  businessAvatarText: { color: greenDeep, fontWeight: "900", fontSize: 13 },
  businessCustomerName: { color: ink, fontSize: 12, fontWeight: "800" },
  businessLastMessage: { marginTop: 4, color: muted, fontSize: 11 },
  businessThread: { flex: 1, minWidth: 0, backgroundColor: "#ffffff" },
  threadHeader: { minHeight: 66, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#e6ebe8" },
  threadIdentity: { flexDirection: "row", gap: 10, alignItems: "center" },
  threadMeta: { color: muted, fontSize: 10, marginTop: 3 },
  threadActions: { flexDirection: "row", gap: 8 },
  messageRail: { flex: 1, maxHeight: 370, backgroundColor: "#f8faf9" },
  messageRailContent: { padding: 16, gap: 8, justifyContent: "flex-end", minHeight: 320 },
  businessBubble: { maxWidth: "72%", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13 },
  businessBubbleSeller: { alignSelf: "flex-end", backgroundColor: green, borderBottomRightRadius: 4 },
  businessBubbleCustomer: { alignSelf: "flex-start", backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e3e8e5", borderBottomLeftRadius: 4 },
  businessBubbleText: { color: ink, fontSize: 12, lineHeight: 18 },
  businessBubbleTextSeller: { color: "#ffffff" },
  messageTime: { marginTop: 4, color: "#8b97a2", fontSize: 9, alignSelf: "flex-end" },
  messageTimeSeller: { color: "#d5f6e3" },
  replyComposer: { padding: 12, borderTopWidth: 1, borderTopColor: "#e6ebe8", flexDirection: "row", gap: 8, backgroundColor: "#ffffff" },
  inboxEmpty: { paddingHorizontal: 28, paddingTop: 72, alignItems: "center" },
  inboxEmptyMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#eaf8ef", alignItems: "center", justifyContent: "center" },
  inboxEmptyTitle: { color: ink, fontSize: 14, fontWeight: "900", marginTop: 15 },
  inboxEmptyCopy: { color: "#79867f", fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 7 },
  businessDeskEmpty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 42, backgroundColor: "#f8fbf9" },
  businessDeskOrb: { width: 74, height: 74, borderRadius: 25, backgroundColor: green, alignItems: "center", justifyContent: "center", shadowColor: "#087d48", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 13, elevation: 5 },
  businessDeskEmptyTitle: { marginTop: 20, color: ink, fontSize: 22, fontWeight: "900", letterSpacing: -0.45 },
  businessDeskEmptyCopy: { marginTop: 9, maxWidth: 380, textAlign: "center", color: "#6f7e75", fontSize: 13, lineHeight: 20 },
  businessDeskEmptyPills: { marginTop: 19, flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  businessDeskEmptyPill: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dce8e0", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, color: "#527060", fontSize: 10, fontWeight: "800" },
  replyInput: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: "#dde5e0", paddingHorizontal: 11, fontSize: 12, color: ink },
  replySend: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: green },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.42)", alignItems: "center", justifyContent: "center", padding: 24 },
  fulfillmentModal: { width: "100%", maxWidth: 620, maxHeight: "94%", borderRadius: 18, padding: 20, backgroundColor: "#ffffff" },
  modalHeading: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  modalEyebrow: { color: greenDeep, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  modalTitle: { marginTop: 7, color: ink, fontSize: 20, fontWeight: "800" },
  modalCopy: { marginTop: 5, color: muted, fontSize: 12, lineHeight: 18, maxWidth: 450 },
  modalClose: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#f4f6f5" },
  modalCloseText: { color: ink, fontSize: 26, lineHeight: 28, fontWeight: "400" },
  statusSelector: { marginTop: 18, flexDirection: "row", flexWrap: "wrap", gap: 7 },
  statusOption: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: "#f5f7f6", borderWidth: 1, borderColor: "#e4e9e6" },
  statusOptionActive: { backgroundColor: "#eff9f3", borderColor: "#83cf9f" },
  statusOptionText: { color: muted, fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  statusOptionTextActive: { color: greenDeep },
  modalFields: { marginTop: 18, gap: 13 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 20 },
  modalCancel: { minHeight: 42, paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalCancelText: { color: muted, fontSize: 12, fontWeight: "800" },
  tableCell: { justifyContent: "center" },
  tablePrimary: { color: ink, fontWeight: "800", fontSize: 14 },
  tableSecondary: { color: muted, marginTop: 4, fontSize: 12 },
  tableCellText: { color: "#304255", fontSize: 13, alignSelf: "center" },
  stockBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  stockBadgeLive: { backgroundColor: "#e9f8ef" },
  stockBadgeDraft: { backgroundColor: "#eff3f7" },
  stockBadgeText: { fontSize: 11, fontWeight: "900" },
  stockBadgeTextLive: { color: greenDeep },
  stockBadgeTextDraft: { color: "#526171" },
  emptyHint: { padding: 22, alignItems: "center" },
  emptyHintText: { color: muted, fontSize: 13 },
  guidanceList: { gap: 10 },
  guidanceRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  guidanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: green,
    marginTop: 6,
  },
  guidanceText: { flex: 1, color: "#42576b", fontSize: 13, lineHeight: 20 },
  searchPreviewTitle: { color: "#1558d6", fontSize: 18, fontWeight: "700" },
  searchPreviewUrl: { color: "#1f7a34", fontSize: 12, marginTop: 4 },
  searchPreviewBody: { color: "#4a5564", fontSize: 13, lineHeight: 20, marginTop: 8 },
  commissionPanel: { gap: 12, borderWidth: 1, borderColor: line, borderRadius: 14, padding: 14, backgroundColor: mint },
  commissionHeadingRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  operationsGrid: { flexDirection: "row", gap: 18, flexWrap: "wrap" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e6efe9",
    paddingVertical: 10,
  },
  infoLabel: { color: muted, fontSize: 12, fontWeight: "700" },
  infoValue: { color: ink, fontSize: 13, fontWeight: "800", flexShrink: 1, textAlign: "right" },
  centered: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  centeredLabel: { color: muted, fontSize: 15, textAlign: "center" },
  unsupported: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  unsupportedTitle: {
    color: ink,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  unsupportedText: {
    marginTop: 8,
    color: muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 520,
  },
});
