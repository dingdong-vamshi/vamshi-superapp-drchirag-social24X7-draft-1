import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowLeft, ChevronDown, Flag, MessageCircle, Send, Shield, ThumbsDown, ThumbsUp, X } from "lucide-react-native";

import { useAuth } from "../../lib/AuthContext";
import {
  createAnonymousPost,
  listAnonymousChannels,
  listAnonymousPosts,
  reportAnonymousPost,
  setAnonymousChannelJoined,
  voteAnonymousPost,
  type AnonymousChannel,
  type AnonymousPost,
} from "./anonymousChatRepository";

const tabs = ["Feed", "Channels", "Guidelines"] as const;

export default function AnonymousChatScreen() {
  const { user, initialized } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Feed");
  const [guidelinesVisible, setGuidelinesVisible] = useState(true);
  const [channelOpen, setChannelOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const hasRealUser = Boolean(user && "id" in user);
  const channelsQuery = useQuery({ queryKey: ["anonymous-channels", hasRealUser ? user!.id : "guest"], queryFn: () => listAnonymousChannels(user), enabled: initialized && hasRealUser });
  const postsQuery = useQuery({ queryKey: ["anonymous-posts", hasRealUser ? user!.id : "guest", selectedChannelId], queryFn: () => listAnonymousPosts(user, selectedChannelId), enabled: initialized && hasRealUser });
  const channels = channelsQuery.data ?? [];
  const selectedChannel = channels.find((item) => item.id === selectedChannelId) ?? channels[0];

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["anonymous-channels"] }),
    queryClient.invalidateQueries({ queryKey: ["anonymous-posts"] }),
  ]);

  const postMutation = useMutation({
    mutationFn: () => createAnonymousPost(user, { channelId: selectedChannel?.id ?? "", body, tags: selectedChannel ? [selectedChannel.slug] : [] }),
    onSuccess: async () => { setBody(""); await refresh(); },
    onError: (error) => Alert.alert("Could not post", error instanceof Error ? error.message : "Please try again."),
  });
  const joinMutation = useMutation({
    mutationFn: ({ channel, joined }: { channel: AnonymousChannel; joined: boolean }) => setAnonymousChannelJoined(user, channel.id, joined),
    onSuccess: refresh,
    onError: (error) => Alert.alert("Could not update channel", error instanceof Error ? error.message : "Please try again."),
  });
  const voteMutation = useMutation({
    mutationFn: ({ post, vote }: { post: AnonymousPost; vote: -1 | 0 | 1 }) => voteAnonymousPost(user, post.id, vote),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["anonymous-posts"] }),
    onError: (error) => Alert.alert("Could not vote", error instanceof Error ? error.message : "Please try again."),
  });
  const reportMutation = useMutation({
    mutationFn: (post: AnonymousPost) => reportAnonymousPost(user, post.id, "Inappropriate content"),
    onSuccess: () => Alert.alert("Reported", "Thanks. Moderation can review this post."),
    onError: (error) => Alert.alert("Could not report", error instanceof Error ? error.message : "Please try again."),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><ArrowLeft size={24} color="#111827" /></Pressable>
        <Text style={styles.title}>Anonymous Chat</Text>
        <Shield size={22} color="#111827" />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {guidelinesVisible ? (
          <View style={styles.notice}>
            <Shield size={22} color="#1746d6" />
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>Community Guidelines</Text>
              <Text style={styles.noticeText}>Keep discussions respectful and constructive. Report inappropriate content.</Text>
            </View>
            <Pressable onPress={() => setGuidelinesVisible(false)}><X size={18} color="#1746d6" /></Pressable>
          </View>
        ) : null}
        <Segmented tabs={tabs} active={tab} onPick={setTab} />
        {!hasRealUser ? <Centered title="Sign in required" text="Anonymous Chat uses a real Supabase account while hiding your identity from other users." /> : null}
        {tab === "Feed" ? (
          <>
            <View style={{ zIndex: 10 }}>
              <Pressable onPress={() => setChannelOpen(!channelOpen)} style={styles.dropdown}>
                <Text style={styles.dropdownText}>{selectedChannel?.name ?? "Loading channels"}</Text>
                <ChevronDown size={20} color="#98a2b3" />
              </Pressable>
              {channelOpen ? (
                <View style={styles.menu}>
                  <Pressable onPress={() => { setSelectedChannelId(null); setChannelOpen(false); }} style={styles.menuItem}><Text style={styles.menuText}>All Channels</Text></Pressable>
                  {channels.map((channel) => <Pressable key={channel.id} onPress={() => { setSelectedChannelId(channel.id); setChannelOpen(false); }} style={styles.menuItem}><Text style={styles.menuText}>{channel.name}</Text></Pressable>)}
                </View>
              ) : null}
            </View>
            <View style={styles.composer}>
              <TextInput value={body} onChangeText={(value) => setBody(value.slice(0, 500))} multiline placeholder="Share your thoughts anonymously..." placeholderTextColor="#667085" style={styles.composerInput} />
              <View style={styles.composerBottom}>
                <Text style={styles.counter}>{body.length}/500</Text>
                <Pressable disabled={!body.trim() || postMutation.isPending || !selectedChannel} onPress={() => postMutation.mutate()} style={[styles.postButton, (!body.trim() || postMutation.isPending) && styles.disabled]}>
                  <Send size={18} color="#ffffff" /><Text style={styles.postButtonText}>{postMutation.isPending ? "Posting..." : "Post"}</Text>
                </Pressable>
              </View>
            </View>
            {postsQuery.isLoading ? <Centered title="Loading anonymous feed" text="Fetching persisted pseudonymous posts..." /> : null}
            {!postsQuery.isLoading && (postsQuery.data ?? []).length === 0 ? <Centered title="No posts yet" text="Join a channel and start a respectful discussion." /> : null}
            {(postsQuery.data ?? []).map((post) => <PostCard key={post.id} post={post} onVote={(vote) => voteMutation.mutate({ post, vote })} onReport={() => reportMutation.mutate(post)} />)}
          </>
        ) : null}
        {tab === "Channels" ? channels.map((channel) => (
          <View key={channel.id} style={styles.channelCard}>
            <MessageCircle size={28} color="#2563eb" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{channel.name}</Text>
              <Text style={styles.cardText}>{channel.description}</Text>
              <Text style={styles.cardText}>{channel.memberCount} members</Text>
            </View>
            <Pressable onPress={() => joinMutation.mutate({ channel, joined: !channel.joined })} style={styles.lightButton}><Text style={styles.lightButtonText}>{channel.joined ? "Leave" : "Join"}</Text></Pressable>
          </View>
        )) : null}
        {tab === "Guidelines" ? <Guidelines /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PostCard({ post, onVote, onReport }: { post: AnonymousPost; onVote: (vote: -1 | 0 | 1) => void; onReport: () => void }) {
  return (
    <View style={styles.postCard}>
      <View style={styles.postHead}><Text style={styles.badge}>#{post.channelSlug}</Text><Text style={styles.cardText}>{relative(post.createdAt)}</Text></View>
      <Text style={styles.postBody}>{post.body}</Text>
      <View style={styles.tags}>{post.tags.map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View>
      <View style={styles.postActions}>
        <Pressable onPress={() => onVote(post.viewerVote === 1 ? 0 : 1)} style={styles.iconAction}><ThumbsUp size={19} color={post.viewerVote === 1 ? "#16a34a" : "#667085"} /><Text>{post.upvotes}</Text></Pressable>
        <Pressable onPress={() => onVote(post.viewerVote === -1 ? 0 : -1)} style={styles.iconAction}><ThumbsDown size={19} color={post.viewerVote === -1 ? "#dc2626" : "#667085"} /><Text>{post.downvotes}</Text></Pressable>
        <View style={styles.iconAction}><MessageCircle size={19} color="#667085" /><Text>{post.comments}</Text></View>
        <Pressable onPress={() => Share.share({ message: post.body })} style={styles.iconAction}><Send size={19} color="#98a2b3" /></Pressable>
        <Pressable onPress={onReport} style={styles.iconAction}><Flag size={19} color="#98a2b3" /></Pressable>
      </View>
    </View>
  );
}

function Guidelines() {
  const items = ["Be respectful and kind to all community members", "No hate speech, harassment, or discriminatory language", "Keep discussions constructive and on-topic", "Respect privacy - don't share personal information", "Report inappropriate content to help keep the community safe", "No spam, excessive self-promotion, or repetitive posts"];
  return (
    <>
      <View style={styles.promise}><Text style={styles.noticeTitle}>Our Community Promise</Text><Text style={styles.noticeText}>We're committed to creating a safe, respectful space where everyone can share thoughts while maintaining dignity and kindness.</Text></View>
      <Text style={styles.sectionTitle}>Community Guidelines</Text>
      {items.map((item, index) => <View key={item} style={styles.guideline}><Text style={styles.number}>{index + 1}</Text><Text style={styles.cardText}>{item}</Text></View>)}
      <View style={styles.warn}><Text style={styles.warnTitle}>Reporting & Moderation</Text><Text style={styles.warnText}>Reports are stored for review. Repeated violations may result in account restrictions.</Text></View>
    </>
  );
}

function Segmented<T extends string>({ tabs, active, onPick }: { tabs: readonly T[]; active: T; onPick: (tab: T) => void }) {
  return <View style={styles.segmented}>{tabs.map((item) => <Pressable key={item} onPress={() => onPick(item)} style={[styles.segment, active === item && styles.segmentActive]}><Text style={styles.segmentText}>{item}</Text></Pressable>)}</View>;
}

function Centered({ title, text }: { title: string; text: string }) {
  return <View style={styles.centered}><Text style={styles.centerTitle}>{title}</Text><Text style={styles.centerText}>{text}</Text></View>;
}

const relative = (iso: string) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: { minHeight: 74, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 18, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  title: { flex: 1, fontSize: 24, fontWeight: "500", color: "#111827" },
  content: { gap: 14, padding: 20, paddingBottom: 40 },
  notice: { borderRadius: 14, borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", padding: 18, flexDirection: "row", gap: 14 },
  noticeTitle: { color: "#1746d6", fontSize: 16, fontWeight: "900", marginBottom: 8 },
  noticeText: { color: "#1746d6", fontSize: 15, lineHeight: 23 },
  segmented: { minHeight: 58, borderRadius: 20, backgroundColor: "#e9e9ee", padding: 6, flexDirection: "row" },
  segment: { flex: 1, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: "#fff" },
  segmentText: { fontSize: 16, fontWeight: "800", color: "#111827" },
  dropdown: { minHeight: 62, borderRadius: 12, backgroundColor: "#f0f1f4", paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dropdownText: { fontSize: 18, color: "#111827" },
  menu: { position: "absolute", top: 66, left: 0, right: 0, zIndex: 20, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7dbe3", overflow: "hidden" },
  menuItem: { padding: 16 },
  menuText: { fontSize: 17, color: "#111827" },
  composer: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 14 },
  composerInput: { minHeight: 120, borderRadius: 12, backgroundColor: "#f0f1f4", color: "#111827", fontSize: 16, padding: 16, textAlignVertical: "top" },
  composerBottom: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counter: { color: "#667085", fontSize: 15 },
  postButton: { borderRadius: 12, backgroundColor: "#05051a", paddingHorizontal: 18, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8 },
  postButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  disabled: { opacity: 0.55 },
  channelCard: { borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#fff", padding: 20, flexDirection: "row", gap: 18, alignItems: "center" },
  cardTitle: { color: "#111827", fontSize: 20, fontWeight: "900" },
  cardText: { color: "#475467", fontSize: 16, lineHeight: 24 },
  lightButton: { borderRadius: 12, borderWidth: 1, borderColor: "#d7dbe3", paddingHorizontal: 18, minHeight: 48, justifyContent: "center" },
  lightButtonText: { color: "#111827", fontWeight: "800", fontSize: 16 },
  postCard: { borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#fff", padding: 18, gap: 16 },
  postHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { backgroundColor: "#eef0f4", color: "#111827", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontWeight: "900" },
  postBody: { color: "#111827", fontSize: 18, lineHeight: 28 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { borderWidth: 1, borderColor: "#d7dbe3", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, fontWeight: "700" },
  postActions: { flexDirection: "row", gap: 18, alignItems: "center" },
  iconAction: { flexDirection: "row", gap: 6, alignItems: "center" },
  centered: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 8 },
  centerTitle: { fontSize: 20, fontWeight: "900", color: "#111827" },
  centerText: { fontSize: 15, color: "#667085", textAlign: "center" },
  promise: { borderRadius: 18, borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", padding: 22 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#111827", marginTop: 8 },
  guideline: { borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#fff", padding: 18, flexDirection: "row", gap: 16, alignItems: "center" },
  number: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#dcfce7", textAlign: "center", lineHeight: 36, color: "#16a34a", fontWeight: "900" },
  warn: { borderRadius: 18, borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb", padding: 22 },
  warnTitle: { color: "#9a3412", fontSize: 18, fontWeight: "900", marginBottom: 10 },
  warnText: { color: "#c2410c", fontSize: 15, lineHeight: 24 },
});
