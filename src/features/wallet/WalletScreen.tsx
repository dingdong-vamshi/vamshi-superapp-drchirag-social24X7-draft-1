import {
  CreditCard,
  History,
  ShieldCheck,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

export default function WalletScreen({
  onOpenProfile,
  onBrowseShop,
}: {
  onOpenProfile: () => void;
  onBrowseShop: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Wallet</Text>
          <Text style={styles.subtitle}>Payments and balance tools are being phased in carefully.</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <WalletCards color="#16a34a" size={28} strokeWidth={2.1} />
          </View>
          <Text style={styles.heroEyebrow}>PHASE 1</Text>
          <Text style={styles.heroTitle}>Wallet UI is ready for the next payment step</Text>
          <Text style={styles.heroCopy}>
            We kept this screen frontend-safe for now so we don’t invent payment behavior before approval.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available now</Text>
          <InfoRow
            icon={ShieldCheck}
            title="Protected payment area"
            text="This shell gives us the final navigation slot without touching settlement logic."
          />
          <InfoRow
            icon={UserRound}
            title="Profile payment access"
            text="Existing payment-related account controls remain reachable through profile."
          />
        </View>

        <View style={styles.actions}>
          <Pressable onPress={onOpenProfile} style={[styles.button, styles.primaryButton]}>
            <Text style={styles.primaryButtonText}>Open profile</Text>
          </Pressable>
          <Pressable onPress={onBrowseShop} style={[styles.button, styles.secondaryButton]}>
            <Text style={styles.secondaryButtonText}>Browse shop</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coming next</Text>
          <InfoRow
            icon={CreditCard}
            title="Saved methods"
            text="Card and method management will stay locked until payment behavior is approved."
          />
          <InfoRow
            icon={History}
            title="Transactions"
            text="Order-linked transaction history will plug in later without changing current order models today."
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  const Icon = icon;
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon color="#16a34a" size={22} strokeWidth={2.1} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  header: { marginBottom: 20 },
  title: { color: "#111827", fontSize: 34, fontWeight: "800" },
  subtitle: { color: "#667085", fontSize: 15, marginTop: 6, lineHeight: 22 },
  hero: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: "#f4fbf6",
    borderWidth: 1,
    borderColor: "#d9f2e0",
    marginBottom: 22,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroEyebrow: { color: "#16a34a", fontSize: 12, fontWeight: "800", letterSpacing: 1.1 },
  heroTitle: { color: "#111827", fontSize: 24, lineHeight: 30, fontWeight: "800", marginTop: 8 },
  heroCopy: { color: "#667085", fontSize: 15, lineHeight: 22, marginTop: 10 },
  section: { marginBottom: 20, gap: 12 },
  sectionTitle: { color: "#111827", fontSize: 16, fontWeight: "700" },
  row: {
    flexDirection: "row",
    gap: 14,
    borderRadius: 22,
    padding: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf0f3",
  },
  rowIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#effaf3",
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1 },
  rowTitle: { color: "#111827", fontSize: 15, fontWeight: "700" },
  rowText: { color: "#667085", fontSize: 13, lineHeight: 19, marginTop: 4 },
  actions: { gap: 12, marginBottom: 22 },
  button: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButton: { backgroundColor: "#16a34a" },
  secondaryButton: { backgroundColor: "#effaf3", borderWidth: 1, borderColor: "#d9f2e0" },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  secondaryButtonText: { color: "#13803f", fontSize: 15, fontWeight: "800" },
});
