import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowLeft, Search, Store } from "lucide-react-native";

import { useAuth } from "../src/lib/AuthContext";
import { supabase } from "../src/lib/supabase";

type StorefrontResult = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  primary_category: string | null;
};

export default function BusinessDirectoryPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StorefrontResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const client = supabase;
    let current = true;
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        const term = query.trim().replace(/[%_,]/g, " ");
        const { data, error } = await client
          .from("storefronts")
          .select("id,name,slug,tagline,primary_category")
          .eq("active", true)
          .or(`name.ilike.%${term}%,slug.ilike.%${term}%`)
          .order("featured", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(30);
        if (!current) return;
        if (error) {
          setResults([]);
        } else {
          setResults((data as StorefrontResult[] | null) ?? []);
        }
        setLoading(false);
      })();
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const openBusiness = async (storefront: StorefrontResult) => {
    if (!supabase || !user || !("identities" in user)) {
      Alert.alert("Sign in required", "Sign in to start a secure business conversation.");
      return;
    }
    setOpeningId(storefront.id);
    try {
      const { data, error } = await supabase.rpc("open_business_conversation", {
        target_storefront: storefront.id,
      });
      if (error) throw error;
      router.replace({ pathname: "/business-chat/[id]", params: { id: String(data), store: storefront.name } });
    } catch (error) {
      Alert.alert("Could not open chat", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={20} color="#111827" /></Pressable>
        <View><Text style={styles.title}>Business chat</Text><Text style={styles.subtitle}>Find a store and message its team</Text></View>
      </View>
      <View style={styles.searchBox}><Search size={19} color="#718096" /><TextInput value={query} onChangeText={setQuery} placeholder="Search business or storefront name" placeholderTextColor="#8794a3" style={styles.searchInput} autoFocus /></View>
      <View style={styles.hint}><Store size={17} color="#0a9659" /><Text style={styles.hintText}>Verified storefront conversations stay connected to the store support desk.</Text></View>
      {loading ? <ActivityIndicator color="#07c160" style={{ marginTop: 36 }} /> : null}
      {!loading && query.trim().length >= 2 && !results.length ? <View style={styles.empty}><Store size={30} color="#9eaaa5" /><Text style={styles.emptyTitle}>No businesses found</Text><Text style={styles.emptyCopy}>Try a business name, storefront name, or a shorter search.</Text></View> : null}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <Pressable onPress={() => void openBusiness(item)} style={styles.row}><View style={styles.avatar}><Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>@{item.slug} · {item.primary_category || "Store"}</Text><Text style={styles.tagline} numberOfLines={1}>{item.tagline || "Message this store about products, orders, or support."}</Text></View>{openingId === item.id ? <ActivityIndicator color="#07c160" /> : <Text style={styles.message}>Message</Text>}</Pressable>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  header: { paddingHorizontal: 18, paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#f2f6f4", alignItems: "center", justifyContent: "center" },
  title: { color: "#111827", fontSize: 21, fontWeight: "800" },
  subtitle: { marginTop: 2, color: "#77828d", fontSize: 12 },
  searchBox: { margin: 18, minHeight: 52, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f5f7f6", borderWidth: 1, borderColor: "#e8edeb" },
  searchInput: { flex: 1, minHeight: 50, color: "#111827", fontSize: 15 },
  hint: { marginHorizontal: 18, padding: 13, borderRadius: 14, backgroundColor: "#eff9f3", flexDirection: "row", gap: 9, alignItems: "center" },
  hintText: { flex: 1, color: "#48725a", fontSize: 12, lineHeight: 18 },
  list: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#edf0ef" },
  avatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#dff5e7", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#c6ead4" },
  avatarText: { color: "#078549", fontWeight: "900", fontSize: 17 },
  name: { color: "#17202a", fontSize: 15, fontWeight: "800" },
  meta: { marginTop: 3, color: "#64748b", fontSize: 11, fontWeight: "600" },
  tagline: { marginTop: 4, color: "#7b8793", fontSize: 11 },
  message: { color: "#078549", fontSize: 12, fontWeight: "800" },
  empty: { marginTop: 90, alignItems: "center", paddingHorizontal: 42, gap: 10 },
  emptyTitle: { color: "#17202a", fontSize: 18, fontWeight: "800" },
  emptyCopy: { color: "#77828d", fontSize: 13, textAlign: "center", lineHeight: 20 },
});
