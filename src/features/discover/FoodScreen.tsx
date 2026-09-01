import { router } from "expo-router";
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ArrowLeft, Clock3, MapPin, Plus, Search, Star } from "lucide-react-native";

const orange = "#ff650a";
const ink = "#111827";
const muted = "#667085";

type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  rating: string;
  eta: string;
  imageUrl: string;
};

const restaurants: Restaurant[] = [
  {
    id: "masala-street",
    name: "Masala Street",
    cuisine: "North Indian • Biryani",
    rating: "4.8",
    eta: "25-30 min",
    imageUrl:
      "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=480&q=80",
  },
  {
    id: "dosa-house",
    name: "Dosa House",
    cuisine: "South Indian • Breakfast",
    rating: "4.7",
    eta: "20-25 min",
    imageUrl:
      "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=480&q=80",
  },
  {
    id: "burger-yard",
    name: "Burger Yard",
    cuisine: "Burgers • Fries",
    rating: "4.6",
    eta: "20-25 min",
    imageUrl:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=480&q=80",
  },
  {
    id: "sweet-box",
    name: "Sweet Box",
    cuisine: "Desserts • Cakes",
    rating: "4.9",
    eta: "30-35 min",
    imageUrl:
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=480&q=80",
  },
];

export default function FoodScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <ArrowLeft color="#475467" size={28} strokeWidth={2.3} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Food Delivery</Text>
          <Text style={styles.subtitle}>Your location</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search restaurants"
          onPress={() => Alert.alert("Restaurant search", "Coming Soon. Browse the listed restaurants below.")}
          style={styles.headerButton}
        >
          <Search color="#475467" size={30} strokeWidth={2.1} />
        </Pressable>
      </View>

      <View style={styles.addressStrip}>
        <MapPin color="#f75a00" size={21} />
        <Text style={styles.addressText}>Delivering to Home • 123 Main St</Text>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Popular Restaurants
        </Text>
        <View style={styles.restaurantList}>
          {restaurants.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  return (
    <View style={styles.card}>
      <Image source={{ uri: restaurant.imageUrl }} style={styles.image} resizeMode="cover" />
      <View style={styles.cardBody}>
        <Text style={styles.restaurantName}>{restaurant.name}</Text>
        <Text style={styles.cuisine}>{restaurant.cuisine}</Text>
        <View style={styles.metaRow}>
          <View style={styles.ratingRow}>
            <Star color="#f5b700" fill="#f5b700" size={20} />
            <Text style={styles.rating}>{restaurant.rating}</Text>
          </View>
          <View style={styles.timeRow}>
            <Clock3 color="#98a2b3" size={14} />
            <Text style={styles.eta}>{restaurant.eta}</Text>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add ${restaurant.name}`}
        onPress={() => Alert.alert(restaurant.name, "Coming Soon. Restaurant ordering is not enabled in this release.")}
        style={styles.addButton}
      >
        <Plus color="#ffffff" size={28} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    minHeight: 104,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#edf0f2",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  title: { color: "#0b0f19", fontSize: 36, lineHeight: 42, fontWeight: "800" },
  subtitle: { color: muted, fontSize: 20, lineHeight: 28, fontWeight: "500" },
  addressStrip: {
    minHeight: 72,
    backgroundColor: "#fff7eb",
    borderBottomWidth: 1,
    borderBottomColor: "#fed7aa",
    paddingHorizontal: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  addressText: { color: "#d93600", fontSize: 20, fontWeight: "500" },
  content: {
    paddingHorizontal: 30,
    paddingTop: 34,
    paddingBottom: 44,
    gap: 24,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
  },
  sectionTitle: { color: ink, fontSize: 28, lineHeight: 34, fontWeight: "800" },
  restaurantList: { gap: 26 },
  card: {
    minHeight: 182,
    borderRadius: 26,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#eef0f3",
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    boxShadow: "0 7px 16px rgba(15, 23, 42, 0.10)",
  },
  image: { width: 118, height: 118, borderRadius: 18, backgroundColor: "#eef2f6" },
  cardBody: { flex: 1, minWidth: 0, gap: 8 },
  restaurantName: { color: "#0b0f19", fontSize: 25, lineHeight: 31, fontWeight: "800" },
  cuisine: { color: muted, fontSize: 18, lineHeight: 24, fontWeight: "500" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 22, marginTop: 8 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rating: { color: "#111111", fontSize: 20, fontWeight: "800" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  eta: { color: muted, fontSize: 18, lineHeight: 23, fontWeight: "600" },
  addButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: orange,
    alignItems: "center",
    justifyContent: "center",
  },
});
