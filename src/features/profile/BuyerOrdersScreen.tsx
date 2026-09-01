import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ArrowLeft,
  ChevronRight,
  PackageOpen,
  ReceiptText,
  X,
} from "lucide-react-native";
import {
  formatMinor,
  listBuyerOrderItems,
  type BuyerOrderItem,
} from "../creatorCommerce/lifecycleRepository";
import { supabase } from "../../lib/supabase";

export default function BuyerOrdersScreen() {
  const [items, setItems] = useState<BuyerOrderItem[]>([]);
  const [selected, setSelected] = useState<BuyerOrderItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      setItems(await listBuyerOrderItems(supabase));
    } catch {
      setError("Unable to load your purchases. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <ArrowLeft size={21} color="#102033" />
        </Pressable>
        <View>
          <Text accessibilityRole="header" style={styles.title}>
            Orders & purchases
          </Text>
          <Text style={styles.subtitle}>Your buyer purchase history</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color="#0aa766" /> : null}
        {error ? (
          <Pressable onPress={() => void load()} style={styles.empty}>
            <Text style={styles.emptyTitle}>{error}</Text>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        ) : null}
        {!loading && !error && !items.length ? (
          <View style={styles.empty}>
            <PackageOpen size={34} color="#087447" />
            <Text style={styles.emptyTitle}>No purchases yet</Text>
            <Text style={styles.emptyCopy}>
              Products you buy through Social24 will appear here.
            </Text>
          </View>
        ) : null}
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Open Order ${item.orderId.slice(0, 8)}`}
            onPress={() => setSelected(item)}
            style={styles.orderCard}
          >
            <View style={styles.orderIcon}>
              <ReceiptText size={21} color="#087447" />
            </View>
            <View style={styles.orderCopy}>
              <Text style={styles.orderTitle}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.storefrontName} · Qty {item.quantity}
              </Text>
              <Text style={styles.meta}>
                {new Date(item.createdAt).toLocaleDateString("en-IN")} · Order #
                {item.orderId.slice(0, 8).toUpperCase()}
              </Text>
              <View style={styles.status}>
                <Text style={styles.statusText}>
                  {item.orderStatus.replaceAll("_", " ")}
                </Text>
              </View>
            </View>
            <View style={styles.amount}>
              <Text style={styles.amountText}>
                {formatMinor(item.subtotalMinor)}
              </Text>
              <ChevronRight size={18} color="#94a3b8" />
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <Modal
        visible={Boolean(selected)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.sheet}>
            {selected ? (
              <>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetTitle}>Order details</Text>
                    <Text style={styles.subtitle}>
                      #{selected.orderId.toUpperCase()}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close Order details"
                    onPress={() => setSelected(null)}
                    style={styles.iconButton}
                  >
                    <X size={20} color="#102033" />
                  </Pressable>
                </View>
                <Detail label="Product" value={selected.title} />
                <Detail label="Store" value={selected.storefrontName} />
                <Detail
                  label="Amount"
                  value={formatMinor(selected.subtotalMinor)}
                />
                <Detail label="Quantity" value={String(selected.quantity)} />
                <Detail
                  label="Status"
                  value={selected.orderStatus.replaceAll("_", " ")}
                />
                <Detail
                  label="Date"
                  value={new Date(selected.createdAt).toLocaleString("en-IN")}
                />
              </>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f8f6" },
  header: {
    minHeight: 72,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#dfe8e3",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#eef4f0",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#102033", fontSize: 23, fontWeight: "900" },
  subtitle: { color: "#64748b", fontSize: 12, marginTop: 2 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 48,
    gap: 11,
  },
  orderCard: {
    width: "100%",
    minWidth: 0,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dfe8e3",
    backgroundColor: "#fff",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  orderIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#edf8f2",
    alignItems: "center",
    justifyContent: "center",
  },
  orderCopy: { flex: 1, minWidth: 0 },
  orderTitle: { color: "#102033", fontSize: 15, fontWeight: "900" },
  meta: { color: "#64748b", fontSize: 11, lineHeight: 17, marginTop: 3 },
  status: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#e7f8ef",
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 7,
  },
  statusText: {
    color: "#087447",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  amount: { alignItems: "flex-end", flexDirection: "row", gap: 4 },
  amountText: { color: "#102033", fontSize: 13, fontWeight: "900" },
  empty: {
    minHeight: 260,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  emptyTitle: {
    color: "#102033",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyCopy: { color: "#64748b", fontSize: 13, textAlign: "center" },
  link: { color: "#087447", fontWeight: "900" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "82%",
    alignSelf: "center",
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  sheetTitle: { color: "#102033", fontSize: 22, fontWeight: "900" },
  detail: {
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1ef",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  detailLabel: { color: "#64748b", fontSize: 13 },
  detailValue: {
    flex: 1,
    minWidth: 0,
    color: "#102033",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
    textTransform: "capitalize",
  },
});
