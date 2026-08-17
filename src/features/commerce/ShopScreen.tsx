import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Search, ShoppingBag, Sparkles } from "lucide-react-native";
import {
  type CartLine,
  formatInr,
  localShopRepository,
  type ShopProduct,
  type ShopRepository,
  type StorefrontSummary,
} from "./shopRepository";

type Props = {
  repository?: ShopRepository;
  onCartPress?: () => void;
  onCheckout?: (lines: CartLine[]) => void | Promise<void>;
  onProductPress?: (product: ShopProduct) => void;
  onStorefrontPress?: (storefront: StorefrontSummary) => void;
};

type LoadState = "loading" | "ready" | "error";

const panelBg = "#ffffff";
const line = "#e7ece9";
const ink = "#121816";
const muted = "#6b7a72";
const green = "#0ab35f";

export function ShopScreen({
  repository = localShopRepository,
  onCartPress,
  onCheckout,
  onProductPress,
  onStorefrontPress,
}: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [storefronts, setStorefronts] = useState<StorefrontSummary[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [isSaving, setSaving] = useState(false);
  const [isCheckingOut, setCheckingOut] = useState(false);
  const [isCartOpen, setCartOpen] = useState(false);

  const load = async () => {
    setState("loading");
    try {
      const [nextProducts, nextStorefronts, nextCart] = await Promise.all([
        repository.listProducts({ category: "All", query }),
        repository.listStorefronts(),
        repository.getCart(),
      ]);
      setProducts(nextProducts);
      setStorefronts(nextStorefronts);
      setCart(nextCart);
      setState("ready");
    } catch (error) {
      console.error(error);
      setState("error");
    }
  };

  useEffect(() => {
    void load();
  }, [repository, query]);

  const cartProducts = cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    return product ? [{ product, quantity: line.quantity }] : [];
  });
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cartProducts.reduce(
    (sum, line) => sum + line.product.pricePaise * line.quantity,
    0,
  );

  const updateCart = async (productId: string, delta: number) => {
    if (isSaving) return;
    const exists = cart.find((line) => line.productId === productId);
    const quantity = Math.max(0, (exists?.quantity ?? 0) + delta);
    const next =
      quantity === 0
        ? cart.filter((line) => line.productId !== productId)
        : exists
          ? cart.map((line) =>
              line.productId === productId ? { ...line, quantity } : line,
            )
          : [...cart, { productId, quantity }];
    setCart(next);
    setSaving(true);
    try {
      await repository.saveCart(next);
    } catch {
      setCart(cart);
      Alert.alert("Cart not saved", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCheckout = async () => {
    if (isCheckingOut) return;
    if (!cart.length) {
      Alert.alert("Your bag is empty", "Add a product before continuing to checkout.");
      return;
    }
    if (!onCheckout) {
      Alert.alert(
        "Checkout not wired",
        "The seller catalog is live. Payment and order settlement can be connected next.",
      );
      return;
    }

    setCheckingOut(true);
    try {
      await onCheckout(cart);
      await repository.saveCart([]);
      setCart([]);
      setCartOpen(false);
    } catch (error) {
      Alert.alert(
        "Checkout not started",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setCheckingOut(false);
    }
  };

  const storefrontPreview = useMemo(
    () =>
      storefronts.slice(0, 6).map((item) => ({
        ...item,
        productCount: products.filter(
          (product) => product.storefrontId === item.id,
        ).length,
      })),
    [products, storefronts],
  );

  if (state === "loading") {
    return <CenteredState loading label="Loading the marketplace…" />;
  }
  if (state === "error") {
    return (
      <CenteredState
        label="We couldn’t load the marketplace."
        actionLabel="Try again"
        onAction={() => void load()}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.heading}>
              <View>
                <Text style={styles.title}>Shop</Text>
                <Text style={styles.subtitle}>
                  Browse real storefronts and products from sellers across Social
                  24x7.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open bag with ${cartCount} item${cartCount === 1 ? "" : "s"}`}
                onPress={() => (onCartPress ? onCartPress() : setCartOpen(true))}
                style={styles.cartButton}
              >
                <ShoppingBag color={ink} size={20} />
                {cartCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{cartCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            <View style={styles.hero}>
              <View style={{ flex: 1 }}>
                <View style={styles.heroPill}>
                  <Sparkles size={13} color="#0a8e4f" />
                  <Text style={styles.heroPillText}>CONSUMER MARKETPLACE</Text>
                </View>
                <Text style={styles.heroTitle}>
                  Discover storefronts curated for everyday life.
                </Text>
                <Text style={styles.heroText}>
                  Shop is now buyer-only inside the app. Seller onboarding,
                  catalog publishing, and storefront management stay on the web
                  admin side.
                </Text>
              </View>
            </View>

            <View style={styles.search}>
              <Search size={18} color="#6c7a72" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search products, stores or keywords"
                placeholderTextColor="#94a39a"
                style={styles.searchInput}
              />
            </View>

            {storefrontPreview.length ? (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Featured storefronts</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.storefrontRail}
                >
                  {storefrontPreview.map((storefront) => (
                    <Pressable
                      key={storefront.id}
                      onPress={() => onStorefrontPress?.(storefront)}
                      style={styles.storefrontCard}
                    >
                      <View style={styles.storefrontAvatar}>
                        <Text style={styles.storefrontAvatarText}>
                          {storefront.name[0]}
                        </Text>
                      </View>
                      <Text style={styles.storefrontName}>
                        {storefront.name}
                      </Text>
                      <Text style={styles.storefrontTagline} numberOfLines={2}>
                        {storefront.tagline}
                      </Text>
                      <Text style={styles.storefrontMeta}>
                        {storefront.primaryCategory} · {storefront.productCount} live
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Catalog</Text>
            </View>
          </>
        }
        data={products}
        numColumns={2}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            quantity={cart.find((line) => line.productId === item.id)?.quantity ?? 0}
            onAdd={() => void updateCart(item.id, 1)}
            onPress={() => onProductPress?.(item)}
          />
        )}
        ListEmptyComponent={
          <CenteredState
            label="No products matched this filter."
            actionLabel="Clear filters"
            onAction={() => {
              setQuery("");
            }}
          />
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open cart with ${cartCount} item${cartCount === 1 ? "" : "s"}`}
        onPress={() => (onCartPress ? onCartPress() : setCartOpen(true))}
        style={styles.floatingCart}
      >
        <ShoppingBag color="#ffffff" size={22} />
        <Text style={styles.floatingCartText}>Cart</Text>
        {cartCount ? <View style={styles.floatingCartBadge}><Text style={styles.badgeText}>{cartCount}</Text></View> : null}
      </Pressable>

      <Modal
        visible={isCartOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCartOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Your bag</Text>
                <Text style={styles.sheetSubtitle}>
                  {cartCount} item{cartCount === 1 ? "" : "s"}
                </Text>
              </View>
              <Pressable
                style={styles.close}
                onPress={() => setCartOpen(false)}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <ScrollView>
              {cartProducts.length ? (
                cartProducts.map(({ product, quantity }) => (
                  <View key={product.id} style={styles.cartLine}>
                    <ProductThumb product={product} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartLineTitle}>{product.name}</Text>
                      <Text style={styles.cartLineMeta}>
                        {formatInr(product.pricePaise)} · Qty {quantity}
                      </Text>
                    </View>
                    <View style={styles.stepper}>
                      <Pressable onPress={() => void updateCart(product.id, -1)}>
                        <Text style={styles.stepperText}>−</Text>
                      </Pressable>
                      <Pressable onPress={() => void updateCart(product.id, 1)}>
                        <Text style={styles.stepperText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>Your bag is ready when you are.</Text>
              )}
            </ScrollView>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatInr(cartTotal)}</Text>
            </View>
            <Pressable
              disabled={isCheckingOut || !cart.length}
              style={[styles.checkout, (isCheckingOut || !cart.length) && styles.checkoutDisabled]}
              onPress={() => void handleCheckout()}
            >
              <Text style={styles.checkoutText}>
                {isCheckingOut ? "Opening checkout..." : "Continue to checkout"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ProductCard({
  item,
  quantity,
  onAdd,
  onPress,
}: {
  item: ShopProduct;
  quantity: number;
  onAdd: () => void;
  onPress?: () => void;
}) {
  return (
    <View style={styles.product}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}`} onPress={onPress} style={styles.productArt}>
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={styles.productImage} />
        ) : (
          <ProductThumb product={item} large />
        )}
      </Pressable>
      <Text style={styles.productStore}>@{item.storefrontSlug}</Text>
      <Text style={styles.productName} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.productCopy} numberOfLines={2}>
        {item.shortDescription}
      </Text>
      <View style={styles.productBottom}>
        <View>
          <Text style={styles.productPrice}>{formatInr(item.pricePaise)}</Text>
          <Text style={styles.productMeta}>
            SKU {item.sku || "NA"} · {item.inventory} left
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Add ${item.name} to bag`} style={styles.addButton} onPress={onAdd}>
          <Text style={styles.addButtonText}>{quantity ? `+${quantity}` : "+"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProductThumb({
  product,
  large,
}: {
  product: ShopProduct;
  large?: boolean;
}) {
  return (
    <View
      style={[
        styles.thumb,
        { backgroundColor: product.accent },
        large && styles.thumbLarge,
      ]}
    >
      <Text style={[styles.thumbText, large && styles.thumbTextLarge]}>
        {product.name[0]}
      </Text>
    </View>
  );
}

function CenteredState({
  loading,
  label,
  actionLabel,
  onAction,
}: {
  loading?: boolean;
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centered}>
      {loading ? <ActivityIndicator color={green} /> : null}
      <Text style={styles.centeredLabel}>{label}</Text>
      {actionLabel ? (
        <Pressable style={styles.secondaryButton} onPress={onAction}>
          <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: panelBg },
  floatingCart: {
    position: "absolute",
    right: 18,
    bottom: 18,
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    backgroundColor: green,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    boxShadow: "0 8px 20px rgba(0, 137, 70, 0.28)",
  },
  floatingCartText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  floatingCartBadge: { minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: "#e73845", alignItems: "center", justifyContent: "center" },
  heading: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 28, fontWeight: "800", color: ink },
  subtitle: { marginTop: 4, color: muted, fontSize: 13, lineHeight: 18 },
  cartButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#eef6f1",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#d44e4e",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  hero: {
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 28,
    backgroundColor: "#daf4e2",
    gap: 14,
  },
  heroPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroPillText: { color: "#0a8e4f", fontSize: 10, fontWeight: "800" },
  heroTitle: {
    marginTop: 12,
    color: ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  heroText: { marginTop: 7, color: "#4e675c", fontSize: 13, lineHeight: 19 },
  search: {
    marginHorizontal: 16,
    marginTop: 16,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#f3f6f4",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, height: "100%", color: ink, fontSize: 15 },
  categoryRail: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  categoryChip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#f4f6f4",
    borderWidth: 1,
    borderColor: "#e2e7e3",
  },
  categoryChipActive: {
    backgroundColor: green,
    borderColor: green,
  },
  categoryText: { color: "#536158", fontWeight: "700", fontSize: 13 },
  categoryTextActive: { color: "#ffffff" },
  section: { marginTop: 4 },
  sectionHead: {
    paddingHorizontal: 18,
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: ink },
  storefrontRail: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  storefrontCard: {
    width: 168,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "#f8fbf9",
    borderWidth: 1,
    borderColor: line,
  },
  storefrontAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#d8f0e2",
    alignItems: "center",
    justifyContent: "center",
  },
  storefrontAvatarText: { color: "#0b8d50", fontWeight: "900", fontSize: 18 },
  storefrontName: {
    marginTop: 12,
    color: ink,
    fontSize: 15,
    fontWeight: "800",
  },
  storefrontTagline: {
    marginTop: 6,
    color: muted,
    fontSize: 12,
    lineHeight: 17,
  },
  storefrontMeta: {
    marginTop: 10,
    color: "#0b8d50",
    fontSize: 11,
    fontWeight: "700",
  },
  grid: { paddingHorizontal: 12, paddingBottom: 28 },
  gridRow: { justifyContent: "space-between", gap: 12 },
  product: {
    width: "48.15%",
    marginBottom: 12,
    padding: 10,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: line,
  },
  productArt: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#f1f5f2",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  productImage: { width: "100%", height: "100%" },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbLarge: { width: 72, height: 72, borderRadius: 24 },
  thumbText: { fontSize: 18, fontWeight: "900", color: ink },
  thumbTextLarge: { fontSize: 26 },
  productStore: {
    marginTop: 10,
    color: "#0c8f52",
    fontSize: 11,
    fontWeight: "800",
  },
  productName: {
    marginTop: 6,
    color: ink,
    fontWeight: "800",
    fontSize: 15,
    lineHeight: 20,
    minHeight: 40,
  },
  productCopy: {
    marginTop: 4,
    color: muted,
    fontSize: 12,
    lineHeight: 17,
    minHeight: 34,
  },
  productBottom: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 8,
  },
  productPrice: { color: ink, fontWeight: "900", fontSize: 15 },
  productMeta: { marginTop: 3, color: muted, fontSize: 10 },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  centeredLabel: { color: muted, fontSize: 15, textAlign: "center" },
  secondaryButton: {
    borderRadius: 16,
    backgroundColor: "#edf7f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryButtonText: { color: green, fontWeight: "800", fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    minHeight: 300,
    maxHeight: "78%",
    padding: 20,
    paddingBottom: 26,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 22, fontWeight: "800", color: ink },
  sheetSubtitle: { color: muted, marginTop: 3 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf2ee",
  },
  closeText: { color: ink, fontSize: 20, lineHeight: 20 },
  cartLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  cartLineTitle: { color: ink, fontWeight: "700", fontSize: 15 },
  cartLineMeta: { color: muted, marginTop: 4 },
  stepper: { flexDirection: "row", gap: 16, alignItems: "center" },
  stepperText: { color: "#0d8a4e", fontSize: 24, fontWeight: "500" },
  totalRow: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: line,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: { color: ink, fontWeight: "700", fontSize: 16 },
  totalValue: { color: ink, fontWeight: "900", fontSize: 17 },
  checkout: {
    marginTop: 14,
    backgroundColor: green,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
  },
  checkoutDisabled: { opacity: 0.55 },
  checkoutText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  emptyText: {
    paddingVertical: 36,
    color: muted,
    textAlign: "center",
  },
});
