import { Link, type Href } from "expo-router";
import {
  BadgeDollarSign,
  CircleHelp,
  Gamepad2,
  HeartHandshake,
  Headphones,
  MessageCircle,
  NotebookPen,
  PiggyBank,
  Search,
  ShoppingBag,
  Shuffle,
  SplitSquareVertical,
  UserPlus,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

type DiscoverItem = {
  label: string;
  icon: LucideIcon;
  color: string;
  background: string;
  href?: Href;
  action?: () => void;
};

type DiscoverSection = {
  title: string;
  items: DiscoverItem[];
};

const comingSoon = (label: string) =>
  Alert.alert("Coming soon", `${label} is not wired yet in Phase 1.`);

const sections: DiscoverSection[] = [
  {
    title: "Financial Services",
    items: [
      { label: "Expenses", icon: BadgeDollarSign, color: "#ef4444", background: "#fdecec", href: "/expenses" },
      { label: "Chit Fund", icon: PiggyBank, color: "#16a34a", background: "#eaf9ef", href: "/chit-fund" },
      { label: "Bill Split", icon: SplitSquareVertical, color: "#2563eb", background: "#e9f1ff", href: "/bill-split" },
      { label: "Q&A\nCommunity", icon: CircleHelp, color: "#9333ea", background: "#f5ebff", href: "/qa-community" },
    ],
  },
  {
    title: "Daily Services",
    items: [
      { label: "Food", icon: UtensilsCrossed, color: "#f97316", background: "#fff1e8", href: "/food" },
      { label: "Notes", icon: NotebookPen, color: "#d97706", background: "#fff8dc", href: "/notes-tasks" },
      { label: "Nearby\nPeople", icon: UserPlus, color: "#2563eb", background: "#ecf3ff", href: "/nearby-people" },
      { label: "Support", icon: Headphones, color: "#4f46e5", background: "#eef2ff", href: "/support-feedback" },
    ],
  },
  {
    title: "Shopping",
    items: [
      { label: "Shopping", icon: ShoppingBag, color: "#9333ea", background: "#f5ebff", href: "/shop" },
      { label: "Missing\nPerson", icon: Search, color: "#ef4444", background: "#fdecec", href: "/missing-persons" },
      { label: "Charity", icon: HeartHandshake, color: "#ec4899", background: "#ffeef6", href: "/charity" },
      { label: "Anonymous\nChat", icon: MessageCircle, color: "#16a34a", background: "#ebfaef", href: "/anonymous-chat" },
    ],
  },
  {
    title: "Entertainment",
    items: [
      { label: "Games", icon: Gamepad2, color: "#2563eb", background: "#eaf1ff", href: "/games" },
      { label: "Ladder\nShuffle", icon: Shuffle, color: "#f97316", background: "#fff1e8", action: () => comingSoon("Ladder Shuffle") },
    ],
  },
];

export default function DiscoverScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Discover</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Search discover features" onPress={() => comingSoon("Discover search")} style={styles.searchButton}>
            <Search color="#475467" size={28} strokeWidth={2.2} />
          </Pressable>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.grid}>
              {section.items.map((item) => (
                <DiscoverTile key={item.label} item={item} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function DiscoverTile({ item }: { item: DiscoverItem }) {
  const Icon = item.icon;
  const tile = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label.replace("\n", " ")}
      onPress={item.action}
      style={styles.tile}
    >
      <View style={[styles.iconWrap, { backgroundColor: item.background }]}>
        <Icon color={item.color} size={26} strokeWidth={2.1} />
      </View>
      <Text style={styles.tileLabel}>{item.label}</Text>
    </Pressable>
  );

  if (item.href) {
    return (
      <Link href={item.href} asChild>
        {tile}
      </Link>
    );
  }

  return tile;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: { color: "#111827", fontSize: 34, fontWeight: "800" },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { marginBottom: 28 },
  sectionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 18,
  },
  tile: {
    width: "22%",
    minWidth: 78,
    maxWidth: 96,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 2,
  },
  tileLabel: {
    color: "#344054",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    textAlign: "center",
  },
});
