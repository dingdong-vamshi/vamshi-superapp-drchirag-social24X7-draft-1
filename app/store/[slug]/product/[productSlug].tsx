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
  View,
} from "react-native";
import { ArrowLeft, ShoppingBag, Store } from "lucide-react-native";
import { ShopProduct, formatInr } from "../../../../src/features/commerce/shopRepository";
import { createSupabaseShopRepository } from "../../../../src/features/commerce/supabaseShopRepository";
import { supabase } from "../../../../src/lib/supabase";

export default function ProductPage() {
  const { slug, productSlug } = useLocalSearchParams<{
    slug: string;
    productSlug: string;
  }>();
  const repository = useMemo(
    () =>
      supabase
        ? createSupabaseShopRepository({ client: supabase, user: null })
        : null,
    [],
  );
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [savingCart, setSavingCart] = useState(false);

  useEffect(() => {
    if (!repository || !slug || !productSlug) return;
    void (async () => {
      setLoading(true);
      try {
        const nextProduct = await repository.getProductBySlug(slug, productSlug);
        setProduct(nextProduct);
        const cart = await repository.getCart();
        setQuantity(cart.find((item) => item.productId === nextProduct?.id)?.quantity ?? 0);
      } finally {
        setLoading(false);
      }
    })();
  }, [productSlug, repository, slug]);

  const title = product?.seoTitle ?? `${product?.name ?? "Product"} | Social 24x7`;
  const description =
    product?.seoDescription ??
    product?.shortDescription ??
    "Discover products on Social 24x7 Shop.";
  const ldJson = product
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description,
        sku: product.sku,
        brand: { "@type": "Brand", name: product.brand },
        offers: {
          "@type": "Offer",
          priceCurrency: "INR",
          price: product.pricePaise / 100,
          availability: product.inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        },
      })
    : null;

  const addToCart = async () => {
    if (!repository || !product || savingCart || !product.inStock) return;
    setSavingCart(true);
    try {
      const cart = await repository.getCart();
      const existing = cart.find((item) => item.productId === product.id);
      const nextQuantity = Math.min(product.inventory, (existing?.quantity ?? 0) + 1);
      const next = existing
        ? cart.map((item) => item.productId === product.id ? { ...item, quantity: nextQuantity } : item)
        : [...cart, { productId: product.id, quantity: 1 }];
      await repository.saveCart(next);
      setQuantity(nextQuantity);
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
          <Text style={styles.headerTitle}>Product</Text>
          <View style={styles.back} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#08aa5a" />
          </View>
        ) : !product ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>Product not found</Text>
            <Text style={styles.emptyText}>
              This product is not publicly available yet.
            </Text>
          </View>
        ) : (
          <>
            {product.coverUrl ? (
              <Image source={{ uri: product.coverUrl }} style={styles.heroImage} />
            ) : (
              <View style={[styles.heroImage, { backgroundColor: product.accent }]} />
            )}
            <View style={styles.body}>
              <View style={styles.storePill}>
                <Store size={14} color="#0a8d50" />
                <Text style={styles.storePillText}>@{product.storefrontSlug}</Text>
              </View>
              <Text style={styles.title}>{product.name}</Text>
              <Text style={styles.price}>{formatInr(product.pricePaise)}</Text>
              <Text style={styles.meta}>
                {product.category} · SKU {product.sku || "NA"} · Inventory{" "}
                {product.inventory}
              </Text>
              <Text style={styles.description}>{product.description}</Text>

              {product.tags.length ? (
                <View style={styles.tagRail}>
                  {product.tags.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <Pressable
                disabled={savingCart || !product.inStock}
                style={[styles.primary, (!product.inStock || savingCart) && styles.primaryDisabled]}
                onPress={() => void addToCart()}
              >
                <ShoppingBag size={16} color="#ffffff" />
                <Text style={styles.primaryText}>
                  {savingCart ? "Adding…" : product.inStock ? quantity ? `Add another · ${quantity} in bag` : "Add to bag" : "Out of stock"}
                </Text>
              </Pressable>
              {quantity ? (
                <Pressable onPress={() => router.push("/cart")} style={styles.secondary}>
                  <Text style={styles.secondaryText}>Open bag and continue to checkout</Text>
                </Pressable>
              ) : null}
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
  heroImage: {
    marginHorizontal: 16,
    width: undefined,
    aspectRatio: 1.12,
    borderRadius: 28,
    backgroundColor: "#eef4f0",
  },
  body: { paddingHorizontal: 18, paddingTop: 20 },
  storePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    backgroundColor: "#eef8f2",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  storePillText: { color: "#0a8d50", fontWeight: "800" },
  title: {
    marginTop: 14,
    color: "#111111",
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
  },
  price: { marginTop: 12, color: "#111111", fontSize: 22, fontWeight: "900" },
  meta: { marginTop: 8, color: "#697870", fontSize: 13, lineHeight: 18 },
  description: {
    marginTop: 16,
    color: "#334840",
    fontSize: 15,
    lineHeight: 22,
  },
  tagRail: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    borderRadius: 999,
    backgroundColor: "#f3f6f4",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tagText: { color: "#55635c", fontSize: 12, fontWeight: "700" },
  primary: {
    marginTop: 24,
    borderRadius: 18,
    backgroundColor: "#08aa5a",
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  primaryDisabled: { opacity: 0.55 },
  secondary: { marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: "#cfe5d7", paddingVertical: 13, alignItems: "center" },
  secondaryText: { color: "#087d45", fontWeight: "800", fontSize: 14 },
});
