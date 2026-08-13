import { useLocalSearchParams, router } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowLeft, Heart, MapPin, Search, ShoppingBag, Star, Store } from "lucide-react-native";
import { CartLine, ShopProduct, StorefrontSummary, formatInr } from "../../src/features/commerce/shopRepository";
import { createSupabaseShopRepository } from "../../src/features/commerce/supabaseShopRepository";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/lib/AuthContext";

export default function StorefrontPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const repository = useMemo(
    () =>
      supabase
        ? createSupabaseShopRepository({ client: supabase, user: null })
        : null,
    [],
  );
  const [loading, setLoading] = useState(true);
  const [storefront, setStorefront] = useState<StorefrontSummary | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [savingCart, setSavingCart] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!slug || !repository) return;
    void (async () => {
      setLoading(true);
      try {
        const [store, allProducts] = await Promise.all([
          repository.getStorefrontBySlug(slug),
          repository.listProducts(),
        ]);
        setStorefront(store);
        setProducts(allProducts.filter((item) => item.storefrontSlug === slug));
        setCart(await repository.getCart());
      } finally {
        setLoading(false);
      }
    })();
  }, [repository, slug]);

  useEffect(() => {
    if (!supabase || !storefront || !user || !("identities" in user)) return;
    void supabase.from("storefront_events").insert({
      storefront_id: storefront.id,
      visitor_id: user.id,
      session_key: user.id,
      event_type: "storefront_view",
    });
  }, [storefront?.id, user]);

  const title = storefront?.seoTitle ?? `${storefront?.name ?? "Store"} | Social 24x7`;
  const description =
    storefront?.seoDescription ??
    storefront?.description ??
    "Discover seller storefronts on Social 24x7.";
  const ldJson = storefront
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Store",
        name: storefront.name,
        description,
        url: `/store/${storefront.slug}`,
        areaServed: storefront.stateCode,
      })
    : null;
  const visibleProducts = products.filter((product) => `${product.name} ${product.shortDescription} ${product.tags.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const updateCart = async (productId: string, delta: number) => {
    if (!repository || savingCart) return;
    const currentLine = cart.find((item) => item.productId === productId);
    const quantity = Math.max(0, (currentLine?.quantity ?? 0) + delta);
    const next = quantity === 0
      ? cart.filter((item) => item.productId !== productId)
      : currentLine
        ? cart.map((item) => item.productId === productId ? { ...item, quantity } : item)
        : [...cart, { productId, quantity }];
    const previous = cart;
    setCart(next);
    setSavingCart(true);
    try {
      await repository.saveCart(next);
    } catch {
      setCart(previous);
    } finally {
      setSavingCart(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        {ldJson ? (
          <script type="application/ld+json">{ldJson}</script>
        ) : null}
      </Head>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => router.back()}>
            <ArrowLeft size={18} color="#111111" />
          </Pressable>
          <Text style={styles.headerTitle}>Storefront</Text>
          <View style={styles.back} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#08aa5a" />
          </View>
        ) : !storefront ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>Storefront not found</Text>
            <Text style={styles.emptyText}>
              This public storefront is not available yet.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.marketNav}>
              <Text style={styles.marketBrand}>Social Chat 24/7 Shop</Text>
              <View style={styles.marketActions}>
                <Heart size={19} color="#27332c" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open bag with ${cartCount} items`}
                  onPress={() => router.push("/cart")}
                  style={styles.bagButton}
                >
                  <ShoppingBag size={19} color="#27332c" />
                  {cartCount ? <View style={styles.bagBadge}><Text style={styles.bagBadgeText}>{cartCount}</Text></View> : null}
                </Pressable>
              </View>
            </View>
            <View style={styles.hero}>
              <View style={styles.heroCover} />
              <View style={styles.logoWrap}>
                {storefront.logoUrl ? (
                  <Image source={{ uri: storefront.logoUrl }} style={styles.logoImage} />
                ) : (
                  <Store size={28} color="#0b8e51" />
                )}
              </View>
              <Text style={styles.storeName}>{storefront.name}</Text>
              <Text style={styles.tagline}>{storefront.tagline}</Text>
              <View style={styles.metaRow}>
                <MapPin size={13} color="#6d7c74" />
                <Text style={styles.metaText}>
                  {storefront.stateCode} · {storefront.primaryCategory} ·{" "}
                  {storefront.sellerTier.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.description}>{storefront.description}</Text>
              <View style={styles.shopChips}><Text style={styles.shopChip}>Curated by {storefront.name}</Text><Text style={styles.shopChip}>{products.length} listings</Text></View>
            </View>

            <View style={styles.listingHeader}><View><Text style={styles.sectionTitle}>Shop all listings</Text><Text style={styles.listingSub}>{visibleProducts.length} handcrafted and ready-to-ship items</Text></View><View style={styles.sortChip}><Text style={styles.sortText}>Most relevant</Text></View></View>
            <View style={styles.searchBar}><Search size={19} color="#718078" /><TextInput value={search} onChangeText={setSearch} placeholder="Search this shop" placeholderTextColor="#829188" style={styles.searchInput}/></View>
            <View style={styles.grid}>
              {visibleProducts.map((product) => {
                const quantity = cart.find((item) => item.productId === product.id)?.quantity ?? 0;
                return (
                <View key={product.id} style={styles.card}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${product.name}`}
                    onPress={() =>
                      router.push({
                        pathname: "/store/[slug]/product/[productSlug]",
                        params: { slug: storefront.slug, productSlug: product.slug },
                      })
                    }
                  >
                  {product.coverUrl ? (
                    <Image source={{ uri: product.coverUrl }} style={styles.cardImage} />
                  ) : (
                    <View style={[styles.cardImage, { backgroundColor: product.accent }]} />
                  )}
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={styles.cardPrice}>{formatInr(product.pricePaise)}</Text>
                  <View style={styles.ratingRow}><Star size={12} fill="#1c8a54" color="#1c8a54"/><Text style={styles.ratingText}>{product.rating.toFixed(1)} ({product.reviewCount || "new"})</Text></View>
                  <Text style={styles.cardMeta} numberOfLines={2}>
                    {product.shortDescription}
                  </Text>
                  </Pressable>
                  <View style={styles.cartActions}>
                    <Pressable disabled={savingCart || !product.inStock} onPress={() => void updateCart(product.id, 1)} style={styles.addButton}>
                      <Text style={styles.addButtonText}>{quantity ? `Add one · ${quantity} in bag` : product.inStock ? "Add to bag" : "Out of stock"}</Text>
                    </Pressable>
                    {quantity ? <Pressable disabled={savingCart} onPress={() => void updateCart(product.id, -1)}><Text style={styles.removeOne}>Remove one</Text></Pressable> : null}
                  </View>
                </View>
              );})}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingBottom: 40 },
  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#edf3ef",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111111" },
  centered: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: "#111111" },
  emptyText: { marginTop: 8, color: "#697870", textAlign: "center" },
  marketNav: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e8eee9", flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  marketBrand: { color:"#18231c", fontSize:15, fontWeight:"900" },
  marketActions: { flexDirection:"row", gap:16 },
  bagButton: { position: "relative" },
  bagBadge: { position: "absolute", top: -10, right: -10, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: "#d44e4e", alignItems: "center", justifyContent: "center" },
  bagBadgeText: { color: "#ffffff", fontSize: 9, fontWeight: "900" },
  hero: {
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 22,
    backgroundColor: "#fff",
    borderWidth:1,
    borderColor:"#e7ece8",
    padding: 22,
    alignItems: "center",
    overflow:"hidden",
  },
  heroCover:{ position:"absolute", top:0, left:0, right:0, height:108, backgroundColor:"#dff4e7" },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: { width: "100%", height: "100%", borderRadius: 36 },
  storeName: {
    marginTop: 30,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
    color: "#111111",
    textAlign: "center",
  },
  tagline: {
    marginTop: 8,
    color: "#4d665a",
    textAlign: "center",
    fontSize: 14,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  metaText: { color: "#6d7c74", fontWeight: "700", fontSize: 12 },
  description: {
    marginTop: 14,
    color: "#395045",
    textAlign: "center",
    lineHeight: 20,
  },
  shopChips:{ marginTop:16, flexDirection:"row", gap:8, flexWrap:"wrap", justifyContent:"center" },
  shopChip:{ backgroundColor:"#f4f8f5", borderWidth:1, borderColor:"#e0eae2", borderRadius:999, paddingHorizontal:10, paddingVertical:6, color:"#41604e", fontSize:11, fontWeight:"700" },
  listingHeader:{ paddingHorizontal:18, marginTop:24, marginBottom:12, flexDirection:"row", alignItems:"flex-end", justifyContent:"space-between", gap:12 },
  sectionTitle: {
    paddingHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    color: "#111111",
    fontSize: 20,
    fontWeight: "900",
  },
  listingSub:{ color:"#748178", fontSize:12, marginTop:5 },
  sortChip:{ borderRadius:999, backgroundColor:"#fff", borderWidth:1, borderColor:"#dce6df", paddingHorizontal:11, paddingVertical:8 },
  sortText:{ color:"#415148", fontSize:11, fontWeight:"800" },
  searchBar:{ marginHorizontal:18, marginBottom:16, height:46, borderRadius:12, borderWidth:1, borderColor:"#dce6df", backgroundColor:"#fff", flexDirection:"row", alignItems:"center", paddingHorizontal:13, gap:9 },
  searchInput:{ flex:1, color:"#17211b", fontSize:14 },
  grid: {
    paddingHorizontal: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "47.8%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6ece8",
    backgroundColor: "#ffffff",
    padding: 9,
  },
  cartActions: { marginTop: 10, gap: 7 },
  addButton: { minHeight: 36, borderRadius: 10, backgroundColor: "#0a9f57", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  addButtonText: { color: "#ffffff", fontSize: 11, fontWeight: "900" },
  removeOne: { color: "#9b2f2f", fontSize: 10, fontWeight: "800", textAlign: "center" },
  cardImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: "#eef4f0",
  },
  cardTitle: {
    marginTop: 10,
    color: "#111111",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  cardPrice: { marginTop: 8, color: "#111111", fontWeight: "900" },
  ratingRow:{ marginTop:7, flexDirection:"row", alignItems:"center", gap:4 },
  ratingText:{ color:"#506057", fontSize:11, fontWeight:"700" },
  cardMeta: { marginTop: 4, color: "#6f7d75", fontSize: 12, lineHeight: 17 },
});
