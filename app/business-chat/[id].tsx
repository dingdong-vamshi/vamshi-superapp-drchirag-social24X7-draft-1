import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowLeft, Phone, Send, Video } from "lucide-react-native";

import { useAuth } from "../../src/lib/AuthContext";
import { supabase } from "../../src/lib/supabase";

type Message = { id: string; sender_id: string; body: string | null; created_at: string };

export default function BusinessConversationPage() {
  const { id, store } = useLocalSearchParams<{ id: string; store?: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    const { data, error } = await supabase.from("messages").select("id,sender_id,body,created_at").eq("conversation_id", id).is("deleted_at", null).order("created_at", { ascending: true }).limit(200);
    if (error) Alert.alert("Unable to load messages", error.message);
    else setMessages((data as Message[] | null) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !supabase || !user || !("identities" in user)) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({ conversation_id: id, sender_id: user.id, body, kind: "text" });
    if (error) Alert.alert("Unable to send", error.message);
    else { setDraft(""); await load(); }
    setSending(false);
  };

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={20} color="#15211b" /></Pressable><View style={{ flex: 1 }}><Text style={styles.name}>{store || "Business chat"}</Text><Text style={styles.status}>Store support · secure conversation</Text></View><Pressable style={styles.call}><Phone size={18} color="#15211b" /></Pressable><Pressable style={styles.call}><Video size={18} color="#15211b" /></Pressable></View>
    {loading ? <ActivityIndicator color="#07c160" style={{ marginTop: 48 }} /> : <FlatList data={messages} keyExtractor={(item) => item.id} contentContainerStyle={styles.messages} renderItem={({ item }) => { const mine = item.sender_id === user?.id; return <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}><Text style={[styles.bubbleText, mine && styles.mineText]}>{item.body}</Text><Text style={[styles.time, mine && styles.mineTime]}>{new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(item.created_at))}</Text></View>; }} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Start the conversation</Text><Text style={styles.emptyCopy}>Ask this store about products, orders, or delivery.</Text></View>} />}
    <View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Message business…" placeholderTextColor="#94a1ae" style={styles.input} multiline /><Pressable onPress={() => void send()} disabled={sending} style={styles.send}>{sending ? <ActivityIndicator color="#ffffff" /> : <Send size={18} color="#ffffff" />}</Pressable></View>
  </KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" }, fill: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: "#e5ebe7", backgroundColor: "#ffffff" },
  back: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f1f6f3", alignItems: "center", justifyContent: "center" },
  name: { color: "#15211b", fontSize: 16, fontWeight: "800" }, status: { marginTop: 3, color: "#548061", fontSize: 11 },
  call: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#f2f6f4" },
  messages: { flexGrow: 1, justifyContent: "flex-end", padding: 16, gap: 8, backgroundColor: "#f7faf8" },
  bubble: { maxWidth: "78%", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 15 }, mine: { alignSelf: "flex-end", backgroundColor: "#07c160", borderBottomRightRadius: 4 }, theirs: { alignSelf: "flex-start", backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2eae5", borderBottomLeftRadius: 4 },
  bubbleText: { color: "#1d2a22", fontSize: 14, lineHeight: 20 }, mineText: { color: "#ffffff" }, time: { marginTop: 4, color: "#8b9990", alignSelf: "flex-end", fontSize: 9 }, mineTime: { color: "#d8f8e4" },
  empty: { alignItems: "center", padding: 32 }, emptyTitle: { color: "#17221b", fontSize: 18, fontWeight: "800" }, emptyCopy: { color: "#718078", marginTop: 7, textAlign: "center" },
  composer: { padding: 12, flexDirection: "row", gap: 9, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: "#e5ebe7", backgroundColor: "#ffffff" },
  input: { flex: 1, minHeight: 43, maxHeight: 120, borderRadius: 14, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 10, color: "#16231b", backgroundColor: "#f4f7f5", fontSize: 14 }, send: { width: 43, height: 43, borderRadius: 14, backgroundColor: "#07c160", alignItems: "center", justifyContent: "center" },
});
