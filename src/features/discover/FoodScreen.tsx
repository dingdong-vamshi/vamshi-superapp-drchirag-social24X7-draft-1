import { router } from "expo-router";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowLeft, UtensilsCrossed } from "lucide-react-native";

export default function FoodScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><ArrowLeft color="#111827" size={24} /></Pressable>
        <Text style={styles.title}>Food</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.emptyIcon}><UtensilsCrossed color="#f97316" size={42} /></View>
        <Text style={styles.emptyTitle}>Food is ready for design handoff</Text>
        <Text style={styles.emptyText}>
          I could not access the nested Food frames from the supplied Figma Make link in this environment, so this route is intentionally an honest shell. No fake restaurant, payment, or delivery backend has been invented.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  title: { color: "#111827", fontSize: 28, fontWeight: "600" },
  content: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  emptyIcon: { width: 88, height: 88, borderRadius: 28, backgroundColor: "#fff1e8", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#111827", fontSize: 22, fontWeight: "900", textAlign: "center" },
  emptyText: { color: "#667085", fontSize: 16, lineHeight: 24, textAlign: "center" },
});
