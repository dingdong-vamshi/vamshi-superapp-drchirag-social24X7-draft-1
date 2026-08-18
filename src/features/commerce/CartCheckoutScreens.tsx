import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, MapPin, ShieldCheck, ShoppingBag, Truck } from "lucide-react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartLine, ShopProduct, ShopRepository } from "./shopRepository";
import { formatInr } from "./shopRepository";
import {
  getLatestBuyerDeliveryAddress,
  replaceLifecycleCart,
  saveAddressAndCheckout,
  type BuyerDeliveryAddress,
} from "../creatorCommerce/lifecycleRepository";

const green = "#08aa5a";
const ink = "#111814";
const muted = "#68766f";
const line = "#e3ebe6";
const platformFeeMinor = 500;

type CartProps = {
  repository: ShopRepository;
  client: SupabaseClient;
  onBack: () => void;
  onContinue: () => void;
};

export function CartScreen({ repository, client, onBack, onContinue }: CartProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [address, setAddress] = useState<BuyerDeliveryAddress | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [nextCart, nextProducts, nextAddress] = await Promise.all([
        repository.getCart(),
        repository.listProducts({ category: "All", query: "" }),
        getLatestBuyerDeliveryAddress(client),
      ]);
      setCart(nextCart);
      setProducts(nextProducts);
      setAddress(nextAddress);
    } catch (cause) {
      Alert.alert("Cart could not be loaded", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [repository, client]);

  const lines = useMemo(
    () => cart.flatMap((line) => {
      const product = products.find((item) => item.id === line.productId);
      return product ? [{ product, quantity: line.quantity }] : [];
    }),
    [cart, products],
  );
  const subtotal = lines.reduce((total, line) => total + line.product.pricePaise * line.quantity, 0);
  const count = cart.reduce((total, line) => total + line.quantity, 0);

  const updateQuantity = async (productId: string, delta: number) => {
    if (saving) return;
    const previous = cart;
    const existing = cart.find((line) => line.productId === productId);
    const product = products.find((item) => item.id === productId);
    const quantity = Math.min(product?.inventory ?? 99, Math.max(0, (existing?.quantity ?? 0) + delta));
    const next = quantity === 0
      ? cart.filter((line) => line.productId !== productId)
      : cart.map((line) => line.productId === productId ? { ...line, quantity } : line);
    setCart(next);
    setSaving(true);
    try {
      await repository.saveCart(next);
    } catch (cause) {
      setCart(previous);
      Alert.alert("Cart not updated", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const continueToCheckout = async () => {
    if (saving || !cart.length) return;
    setSaving(true);
    try {
      await replaceLifecycleCart(client, cart);
      onContinue();
    } catch (cause) {
      Alert.alert("Checkout could not start", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading your bag…" />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader title={`Cart (${count})`} subtitle="Review your items before checkout." onBack={onBack} />

        <View style={styles.addressCard}>
          <MapPin size={22} color={green} />
          <View style={styles.grow}>
            <Text style={styles.cardEyebrow}>DELIVER TO</Text>
            {address ? (
              <>
                <Text style={styles.addressName}>{address.recipientName}</Text>
                <Text style={styles.addressText}>{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ""}, {address.city}, {address.stateCode} {address.postalCode}</Text>
              </>
            ) : (
              <Text style={styles.addressText}>Add your delivery address during checkout.</Text>
            )}
          </View>
          <Pressable accessibilityRole="button" onPress={onContinue}><Text style={styles.linkText}>{address ? "Change" : "Add"}</Text></Pressable>
        </View>

        {!lines.length ? (
          <View style={styles.emptyCard}>
            <ShoppingBag size={34} color="#9aa79f" />
            <Text style={styles.emptyTitle}>Your bag is empty</Text>
            <Text style={styles.emptyText}>Add products from Shop or a seller storefront.</Text>
          </View>
        ) : lines.map(({ product, quantity }) => (
          <View key={product.id} style={styles.productCard}>
            <ProductImage product={product} />
            <View style={styles.grow}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.storeName}>{product.storefrontName}</Text>
              <Text style={styles.price}>{formatInr(product.pricePaise)}</Text>
            </View>
            <View style={styles.quantityControl}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${product.name}`} onPress={() => void updateQuantity(product.id, -1)} style={styles.quantityButton}><Text style={styles.quantitySymbol}>−</Text></Pressable>
              <Text style={styles.quantityText}>{quantity}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Add one ${product.name}`} onPress={() => void updateQuantity(product.id, 1)} style={styles.quantityButton}><Text style={styles.quantitySymbol}>+</Text></Pressable>
            </View>
          </View>
        ))}

        {lines.length ? (
          <View style={styles.summaryCard}>
            <SummaryRow label="Subtotal" value={formatInr(subtotal)} />
            <SummaryRow label="Shipping" value="Free" valueColor={green} />
            <View style={styles.divider} />
            <SummaryRow label="Total before platform fee" value={formatInr(subtotal)} strong />
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.bottomBar}>
        <Pressable accessibilityRole="button" disabled={!cart.length || saving} onPress={() => void continueToCheckout()} style={[styles.primaryButton, (!cart.length || saving) && styles.disabledButton]}>
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Proceed to Checkout</Text>}
        </Pressable>
      </View>
    </View>
  );
}

type CheckoutProps = {
  repository: ShopRepository;
  client: SupabaseClient;
  onBack: () => void;
  onSuccess: (checkoutId: string, paymentMethod: "cod" | "external", totalMinor: number) => void;
};

export function CheckoutScreen({ repository, client, onBack, onSuccess }: CheckoutProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "external">("external");
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postalCode, setPostalCode] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [nextCart, nextProducts, address] = await Promise.all([
          repository.getCart(),
          repository.listProducts({ category: "All", query: "" }),
          getLatestBuyerDeliveryAddress(client),
        ]);
        setCart(nextCart);
        setProducts(nextProducts);
        if (address) {
          setRecipientName(address.recipientName);
          setPhone(address.phone);
          setAddressLine1(address.addressLine1);
          setCity(address.city);
          setStateCode(address.stateCode);
          setPostalCode(address.postalCode);
        }
      } catch (cause) {
        Alert.alert("Checkout could not be loaded", cause instanceof Error ? cause.message : "Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [repository, client]);

  const lines = cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    return product ? [{ product, quantity: line.quantity }] : [];
  });
  const subtotal = lines.reduce((total, line) => total + line.product.pricePaise * line.quantity, 0);
  const total = subtotal + platformFeeMinor;

  const placeOrder = async () => {
    if (submitting) return;
    if (!recipientName.trim() || !phone.trim() || !addressLine1.trim() || !city.trim() || !stateCode.trim() || !postalCode.trim()) {
      Alert.alert("Delivery address required", "Complete every delivery field before placing the order.");
      return;
    }
    if (!cart.length) {
      Alert.alert("Your bag is empty", "Return to Shop and add a product.");
      return;
    }
    setSubmitting(true);
    try {
      await replaceLifecycleCart(client, cart);
      const checkoutId = await saveAddressAndCheckout(client, {
        recipientName,
        phone,
        addressLine1,
        city,
        stateCode,
        postalCode,
        paymentMethod,
      });
      await repository.saveCart([]);
      onSuccess(checkoutId, paymentMethod, total);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Please try again.";
      if (paymentMethod === "cod" && /kyc|verification|verified buyer/i.test(message)) {
        Alert.alert("Buyer KYC required for COD", "Cash on delivery is available after Buyer KYC is verified. Complete Buyer KYC in Earn & Sell, or choose Test online payment for this order.");
      } else {
        Alert.alert("Order not placed", message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Preparing secure checkout…" />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader title="Checkout" subtitle="Delivery, payment and order review." onBack={onBack} />
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}><MapPin size={20} color={green} /><Text style={styles.sectionTitle}>Delivery address</Text></View>
          <Field label="Recipient name" value={recipientName} onChangeText={setRecipientName} />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="Address" value={addressLine1} onChangeText={setAddressLine1} />
          <View style={styles.fieldRow}>
            <View style={styles.grow}><Field label="City" value={city} onChangeText={setCity} /></View>
            <View style={styles.smallField}><Field label="State" value={stateCode} onChangeText={setStateCode} autoCapitalize="characters" /></View>
          </View>
          <Field label="Postal code" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}><CreditCard size={20} color={green} /><Text style={styles.sectionTitle}>Payment method</Text></View>
          <PaymentOption selected={paymentMethod === "external"} title="Test online payment" subtitle="Secure provider integration is represented by the current test flow." icon={<CreditCard size={20} color={green} />} onPress={() => setPaymentMethod("external")} />
          <PaymentOption selected={paymentMethod === "cod"} title="Cash on delivery" subtitle="Pay when the seller’s shipment reaches you." icon={<Banknote size={20} color={green} />} onPress={() => setPaymentMethod("cod")} />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}><ShoppingBag size={20} color={green} /><Text style={styles.sectionTitle}>Order summary</Text></View>
          {lines.map(({ product, quantity }) => (
            <View key={product.id} style={styles.checkoutLine}><Text style={styles.checkoutLineTitle}>{quantity} × {product.name}</Text><Text style={styles.checkoutLinePrice}>{formatInr(product.pricePaise * quantity)}</Text></View>
          ))}
          <View style={styles.divider} />
          <SummaryRow label="Subtotal" value={formatInr(subtotal)} />
          <SummaryRow label="Shipping" value="Free" valueColor={green} />
          <SummaryRow label="Platform fee" value={formatInr(platformFeeMinor)} />
          <View style={styles.divider} />
          <SummaryRow label="Total" value={formatInr(total)} strong />
        </View>

        <View style={styles.secureNote}><ShieldCheck size={19} color={green} /><Text style={styles.secureText}>Your delivery details are protected by Supabase row-level security.</Text></View>
      </ScrollView>
      <View style={styles.bottomBar}>
        <View><Text style={styles.payLabel}>TOTAL</Text><Text style={styles.payTotal}>{formatInr(total)}</Text></View>
        <Pressable accessibilityRole="button" disabled={submitting || !cart.length} onPress={() => void placeOrder()} style={[styles.primaryButton, styles.payButton, (submitting || !cart.length) && styles.disabledButton]}>
          {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{paymentMethod === "cod" ? "Place COD Order" : "Proceed to Test Payment"}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

export function CheckoutSuccessScreen({ paymentMethod, totalMinor, reference, onContinue }: { paymentMethod: string; totalMinor: number; reference: string; onContinue: () => void }) {
  return (
    <View style={styles.successScreen}>
      <View style={styles.successIcon}><CheckCircle2 size={44} color={green} /></View>
      <Text style={styles.successTitle}>{paymentMethod === "cod" ? "Order placed" : "Checkout created"}</Text>
      <Text style={styles.successText}>{paymentMethod === "cod" ? "The seller can now confirm and fulfil your COD order." : "The test checkout is waiting for the configured payment confirmation step."}</Text>
      <View style={styles.successCard}>
        <SummaryRow label="Amount" value={formatInr(totalMinor)} strong />
        <SummaryRow label="Reference" value={`#${reference.slice(0, 8)}`} />
        <View style={styles.successFeature}><Truck size={18} color={green} /><Text style={styles.successFeatureText}>Order updates will appear in your Business Chat.</Text></View>
      </View>
      <Pressable accessibilityRole="button" onPress={onContinue} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Continue Shopping</Text></Pressable>
    </View>
  );
}

function PageHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}><ArrowLeft size={24} color={green} /></Pressable><View><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View></View>;
}

function ProductImage({ product }: { product: ShopProduct }) {
  return product.coverUrl ? <Image source={{ uri: product.coverUrl }} style={styles.productImage} /> : <View style={[styles.productImage, styles.productPlaceholder]}><Text style={styles.productPlaceholderText}>{product.name.slice(0, 1).toUpperCase()}</Text></View>;
}

function SummaryRow({ label, value, strong, valueColor }: { label: string; value: string; strong?: boolean; valueColor?: string }) {
  return <View style={styles.summaryRow}><Text style={[styles.summaryLabel, strong && styles.summaryStrong]}>{label}</Text><Text style={[styles.summaryValue, strong && styles.summaryStrong, valueColor ? { color: valueColor } : null]}>{value}</Text></View>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#95a299" style={styles.input} {...inputProps} /></View>;
}

function PaymentOption({ selected, title, subtitle, icon, onPress }: { selected: boolean; title: string; subtitle: string; icon: React.ReactNode; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.paymentOption, selected && styles.paymentSelected]}><View style={styles.paymentIcon}>{icon}</View><View style={styles.grow}><Text style={styles.paymentTitle}>{title}</Text><Text style={styles.paymentSubtitle}>{subtitle}</Text></View><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View></Pressable>;
}

function LoadingState({ label }: { label: string }) {
  return <View style={styles.loading}><ActivityIndicator color={green} /><Text style={styles.loadingText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8faf9" },
  content: { padding: 18, paddingBottom: 130, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 5 },
  backButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "#eef2ef" },
  title: { color: ink, fontSize: 28, fontWeight: "900" },
  subtitle: { color: muted, fontSize: 13, marginTop: 2 },
  addressCard: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 17, borderRadius: 18, borderWidth: 1, borderColor: "#cdebd9", backgroundColor: "#effbf4" },
  grow: { flex: 1 },
  cardEyebrow: { color: green, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  addressName: { color: ink, fontSize: 16, fontWeight: "900", marginTop: 4 },
  addressText: { color: muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  linkText: { color: green, fontSize: 14, fontWeight: "900" },
  productCard: { flexDirection: "row", alignItems: "center", gap: 13, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#ffffff" },
  productImage: { width: 72, height: 72, borderRadius: 14, backgroundColor: "#eaf4ff" },
  productPlaceholder: { alignItems: "center", justifyContent: "center" },
  productPlaceholderText: { color: ink, fontSize: 26, fontWeight: "900" },
  productName: { color: ink, fontSize: 15, fontWeight: "900" },
  storeName: { color: muted, fontSize: 12, marginTop: 3 },
  price: { color: green, fontSize: 16, fontWeight: "900", marginTop: 8 },
  quantityControl: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: line, borderRadius: 999, overflow: "hidden" },
  quantityButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  quantitySymbol: { color: green, fontSize: 21, fontWeight: "800" },
  quantityText: { minWidth: 25, color: ink, textAlign: "center", fontSize: 14, fontWeight: "900" },
  summaryCard: { gap: 10, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#ffffff" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16 },
  summaryLabel: { color: muted, fontSize: 14 },
  summaryValue: { color: ink, fontSize: 14, fontWeight: "800", maxWidth: "55%", textAlign: "right" },
  summaryStrong: { color: ink, fontSize: 17, fontWeight: "900" },
  divider: { height: 1, backgroundColor: line, marginVertical: 3 },
  bottomBar: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: line, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", gap: 14 },
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: green, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  disabledButton: { opacity: 0.45 },
  emptyCard: { alignItems: "center", padding: 34, borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#ffffff" },
  emptyTitle: { color: ink, fontSize: 18, fontWeight: "900", marginTop: 12 },
  emptyText: { color: muted, fontSize: 13, marginTop: 5, textAlign: "center" },
  sectionCard: { gap: 12, padding: 17, borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#ffffff" },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionTitle: { color: ink, fontSize: 18, fontWeight: "900" },
  field: { gap: 6 },
  fieldLabel: { color: "#526158", fontSize: 12, fontWeight: "800" },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: "#d9e5dd", backgroundColor: "#fbfdfc", paddingHorizontal: 13, color: ink, fontSize: 14 },
  fieldRow: { flexDirection: "row", gap: 10 },
  smallField: { width: 105 },
  paymentOption: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: line, backgroundColor: "#fbfdfc" },
  paymentSelected: { borderColor: green, backgroundColor: "#effbf4" },
  paymentIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  paymentTitle: { color: ink, fontSize: 14, fontWeight: "900" },
  paymentSubtitle: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#acb9b1", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: green },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: green },
  checkoutLine: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  checkoutLineTitle: { color: ink, fontSize: 13, fontWeight: "700", flex: 1 },
  checkoutLinePrice: { color: ink, fontSize: 13, fontWeight: "800" },
  secureNote: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 6 },
  secureText: { color: muted, fontSize: 12, flex: 1 },
  payLabel: { color: muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  payTotal: { color: ink, fontSize: 20, fontWeight: "900" },
  payButton: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#f8faf9" },
  loadingText: { color: muted, fontSize: 14, fontWeight: "700" },
  successScreen: { flex: 1, backgroundColor: "#f8faf9", padding: 24, justifyContent: "center", alignItems: "center" },
  successIcon: { width: 82, height: 82, borderRadius: 41, backgroundColor: "#eafaf1", alignItems: "center", justifyContent: "center" },
  successTitle: { color: ink, fontSize: 29, fontWeight: "900", marginTop: 18 },
  successText: { color: muted, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 430, marginTop: 8 },
  successCard: { width: "100%", maxWidth: 480, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: line, backgroundColor: "#ffffff", gap: 12, marginVertical: 24 },
  successFeature: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 4 },
  successFeatureText: { color: muted, fontSize: 12, flex: 1 },
});
