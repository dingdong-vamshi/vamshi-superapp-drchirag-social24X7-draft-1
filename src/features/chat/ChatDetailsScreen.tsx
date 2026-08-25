import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowLeft,
  BellOff,
  ChevronRight,
  FileText,
  ImageIcon,
  Link2,
  Search,
  UserRound,
  Video,
  X,
} from "lucide-react-native";

import { groupChatDetailsContent, searchConversationMessages } from "./chatDetailsUtils";
import type { ChatDataSource, ChatMessage, Conversation } from "./types";

const brand = "#07934a";
const ink = "#172235";
const muted = "#667085";
const wallpapers = [
  { key: "neutral", label: "Neutral", color: "#edf6ef" },
  { key: "sky", label: "Sky", color: "#dfeffa" },
  { key: "forest", label: "Forest", color: "#dcebdc" },
  { key: "warm", label: "Warm", color: "#f6e8dc" },
  { key: "paper", label: "Paper", color: "#f2eee5" },
] as const;

type WallpaperStyle = (typeof wallpapers)[number]["key"];

export default function ChatDetailsScreen({
  dataSource,
  conversationId,
  onBack,
  onViewProfile,
}: {
  dataSource: ChatDataSource;
  conversationId: string;
  onBack: () => void;
  onViewProfile: (profileId: string) => void;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState<WallpaperStyle>("neutral");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextConversation, nextMessages, preference] = await Promise.all([
        dataSource.getConversation?.(conversationId) ?? Promise.resolve(null),
        dataSource.listMessages(conversationId),
        dataSource.getWallpaper?.(conversationId) ?? Promise.resolve({ style: "neutral" as const }),
      ]);
      if (!nextConversation || nextConversation.kind !== "personal") {
        throw new Error("This personal conversation is unavailable.");
      }
      setConversation(nextConversation);
      setMessages(nextMessages);
      setWallpaper(preference.style);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chat details could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [conversationId, dataSource]);

  const content = useMemo(() => groupChatDetailsContent(messages), [messages]);
  const setMuted = async () => {
    if (!conversation || !dataSource.setConversationMuted || saving) return;
    const next = !conversation.isMuted;
    setConversation({ ...conversation, isMuted: next });
    setSaving(true);
    try {
      await dataSource.setConversationMuted(conversation.id, next);
    } catch (cause) {
      setConversation({ ...conversation, isMuted: !next });
      Alert.alert("Mute not updated", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const applyWallpaper = async (style: WallpaperStyle) => {
    if (!dataSource.setWallpaper || saving) return;
    const previous = wallpaper;
    setWallpaper(style);
    setSaving(true);
    try {
      await dataSource.setWallpaper(conversationId, style);
      setWallpaperOpen(false);
    } catch (cause) {
      setWallpaper(previous);
      Alert.alert("Wallpaper not updated", cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={brand} size="large" /><Text style={styles.stateText}>Loading chat details…</Text></SafeAreaView>;
  }
  if (error || !conversation) {
    return <SafeAreaView style={styles.center}><Text style={styles.stateTitle}>Chat details unavailable</Text><Text style={styles.stateText}>{error}</Text><Pressable onPress={onBack} style={styles.retry}><Text style={styles.retryText}>Back to chat</Text></Pressable></SafeAreaView>;
  }

  const person = conversation.participant;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to personal chat" onPress={onBack} hitSlop={12} style={styles.headerIcon}><ArrowLeft color={ink} size={23} /></Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>Chat Details</Text>
        <View style={styles.headerIcon} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identityCard}>
          <Avatar name={person.name} url={person.avatarUrl} size={96} />
          <Text style={styles.name}>{person.name}</Text>
          <Text style={styles.username}>@{person.username}</Text>
          <Text style={styles.privateCopy}>{person.isOnline ? "Online now" : "Messages and shared content are private"}</Text>
          <View style={styles.quickActions}>
            <QuickAction icon={Search} label="Search" onPress={() => setSearchOpen(true)} />
            {dataSource.setConversationMuted ? <QuickAction icon={BellOff} label={conversation.isMuted ? "Unmute" : "Mute"} active={conversation.isMuted} onPress={() => void setMuted()} /> : null}
            <QuickAction icon={UserRound} label="View Profile" onPress={() => onViewProfile(person.id)} />
            {dataSource.setWallpaper ? <QuickAction icon={ImageIcon} label="Wallpaper" onPress={() => setWallpaperOpen(true)} /> : null}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <SectionHeading title="Media" count={content.media.length} action={content.media.length ? () => setMediaOpen(true) : undefined} />
          {content.media.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRail}>
              {content.media.slice(-6).reverse().map((message) => <MediaTile key={message.id} message={message} />)}
            </ScrollView>
          ) : <EmptyRow text="No photos or videos shared yet" />}
        </View>

        <View style={styles.sectionCard}>
          <SectionHeading title="Conversation" />
          <DetailRow icon={Link2} label="Links" value={`${content.links.length}`} onPress={content.links.length ? () => Linking.openURL(content.links[0].url) : undefined} />
          {content.links.slice(-3).reverse().map((link) => (
            <Pressable key={`${link.messageId}:${link.url}`} accessibilityRole="link" onPress={() => void Linking.openURL(link.url)} style={styles.contentRow}>
              <Link2 color={brand} size={18} />
              <Text numberOfLines={2} style={styles.contentTitle}>{link.url}</Text>
              <ChevronRight color="#98a2b3" size={18} />
            </Pressable>
          ))}
          <DetailRow icon={FileText} label="Files" value={`${content.files.length}`} />
          {content.files.slice(-4).reverse().map((message) => (
            <Pressable key={message.id} disabled={!message.attachment?.signedUrl} onPress={() => message.attachment?.signedUrl && Linking.openURL(message.attachment.signedUrl)} style={styles.contentRow}>
              <FileText color={brand} size={19} />
              <View style={styles.rowCopy}><Text numberOfLines={1} style={styles.contentTitle}>{message.attachment?.filename}</Text><Text style={styles.contentMeta}>{new Date(message.createdAt).toLocaleDateString()}</Text></View>
              {message.attachment?.signedUrl ? <ChevronRight color="#98a2b3" size={18} /> : null}
            </Pressable>
          ))}
          {!content.links.length && !content.files.length ? <EmptyRow text="No links or documents shared yet" /> : null}
        </View>

        {dataSource.setWallpaper ? (
          <Pressable onPress={() => setWallpaperOpen(true)} style={styles.sectionCard}>
            <DetailRow icon={ImageIcon} label="Chat wallpaper" value={wallpapers.find((item) => item.key === wallpaper)?.label} onPress={() => setWallpaperOpen(true)} />
            <Text style={styles.preferenceHint}>This preference is private to your account in this conversation.</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <SearchMessagesModal visible={searchOpen} messages={messages} close={() => setSearchOpen(false)} />
      <MediaModal visible={mediaOpen} messages={content.media} close={() => setMediaOpen(false)} />
      <Modal visible={wallpaperOpen} transparent animationType="fade" onRequestClose={() => setWallpaperOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setWallpaperOpen(false)} />
          <View style={styles.wallpaperSheet}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Chat wallpaper</Text><Text style={styles.modalSubtitle}>Only your view of this chat changes.</Text></View><Pressable onPress={() => setWallpaperOpen(false)} style={styles.close}><X color={ink} size={20} /></Pressable></View>
            <View style={styles.wallpaperGrid}>{wallpapers.map((choice) => <Pressable key={choice.key} disabled={saving} onPress={() => void applyWallpaper(choice.key)} style={[styles.wallpaperChoice, { backgroundColor: choice.color }, wallpaper === choice.key && styles.wallpaperActive]}><Text style={styles.wallpaperLabel}>{choice.label}</Text>{wallpaper === choice.key ? <Text style={styles.wallpaperSelected}>Selected</Text> : null}</Pressable>)}</View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Avatar({ name, url, size }: { name: string; url?: string | null; size: number }) {
  return url ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}><Text style={styles.avatarText}>{name.slice(0, 2).toUpperCase()}</Text></View>;
}

function QuickAction({ icon: Icon, label, active, onPress }: { icon: typeof Search; label: string; active?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.quickAction}><View style={[styles.quickIcon, active && styles.quickIconActive]}><Icon color={brand} size={20} /></View><Text numberOfLines={1} style={styles.quickLabel}>{label}</Text></Pressable>;
}

function SectionHeading({ title, count, action }: { title: string; count?: number; action?: () => void }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}{typeof count === "number" ? ` · ${count}` : ""}</Text>{action ? <Pressable onPress={action}><Text style={styles.viewAll}>View All</Text></Pressable> : null}</View>;
}

function DetailRow({ icon: Icon, label, value, onPress }: { icon: typeof Search; label: string; value?: string; onPress?: () => void }) {
  return <Pressable disabled={!onPress} onPress={onPress} style={styles.detailRow}><Icon color="#475467" size={20} /><Text style={styles.detailLabel}>{label}</Text>{value ? <Text style={styles.detailValue}>{value}</Text> : null}{onPress ? <ChevronRight color="#98a2b3" size={18} /> : null}</Pressable>;
}

function EmptyRow({ text }: { text: string }) { return <Text style={styles.emptyText}>{text}</Text>; }

function MediaTile({ message, large = false }: { message: ChatMessage; large?: boolean }) {
  const attachment = message.attachment!;
  const open = () => attachment.signedUrl && Linking.openURL(attachment.signedUrl);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${attachment.filename}`} disabled={!attachment.signedUrl} onPress={open} style={[styles.mediaTile, large && styles.mediaTileLarge]}>{attachment.attachmentType === "image" && attachment.signedUrl ? <Image source={{ uri: attachment.signedUrl }} style={styles.mediaImage} /> : <View style={styles.videoTile}><Video color={brand} size={large ? 34 : 24} /><Text numberOfLines={2} style={styles.videoName}>{attachment.filename}</Text></View>}</Pressable>;
}

function SearchMessagesModal({ visible, messages, close }: { visible: boolean; messages: ChatMessage[]; close: () => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchConversationMessages(messages, query), [messages, query]);
  useEffect(() => { if (!visible) setQuery(""); }, [visible]);
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaView style={styles.safe}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Search conversation</Text><Pressable onPress={close} style={styles.close}><X color={ink} size={20} /></Pressable></View><View style={styles.searchBox}><Search color="#667085" size={19} /><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Words or file names" style={styles.searchInput} /></View><ScrollView contentContainerStyle={styles.modalContent}>{query.trim() && !results.length ? <EmptyRow text="No matching messages" /> : results.map((message) => <View key={message.id} style={styles.searchResult}><Text numberOfLines={3} style={styles.contentTitle}>{message.text || message.attachment?.filename}</Text><Text style={styles.contentMeta}>{new Date(message.createdAt).toLocaleString()}</Text></View>)}</ScrollView></SafeAreaView></Modal>;
}

function MediaModal({ visible, messages, close }: { visible: boolean; messages: ChatMessage[]; close: () => void }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaView style={styles.safe}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Shared media</Text><Pressable onPress={close} style={styles.close}><X color={ink} size={20} /></Pressable></View><ScrollView contentContainerStyle={styles.mediaGrid}>{[...messages].reverse().map((message) => <MediaTile key={message.id} message={message} large />)}</ScrollView></SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7f6" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28, backgroundColor: "#f5f7f6" },
  stateTitle: { color: ink, fontSize: 20, fontWeight: "800", textAlign: "center" },
  stateText: { color: muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retry: { marginTop: 8, backgroundColor: brand, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12 },
  retryText: { color: "#fff", fontWeight: "800" },
  header: { minHeight: 60, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#dfe5e1" },
  headerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: ink, fontSize: 18, fontWeight: "800" },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 14, gap: 12, paddingBottom: 36 },
  identityCard: { borderRadius: 24, backgroundColor: "#fff", padding: 22, alignItems: "center", borderWidth: 1, borderColor: "#e3e8e5" },
  avatar: { backgroundColor: "#dff4e8", alignItems: "center", justifyContent: "center" },
  avatarText: { color: brand, fontSize: 28, fontWeight: "900" },
  name: { marginTop: 12, color: ink, fontSize: 23, fontWeight: "900" },
  username: { marginTop: 3, color: muted, fontSize: 14 },
  privateCopy: { marginTop: 6, color: "#84918a", fontSize: 12, textAlign: "center" },
  quickActions: { width: "100%", marginTop: 20, flexDirection: "row", justifyContent: "center", gap: 10, flexWrap: "wrap" },
  quickAction: { width: 76, alignItems: "center", gap: 7 },
  quickIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: "#eef8f2", alignItems: "center", justifyContent: "center" },
  quickIconActive: { backgroundColor: "#d9f5e5", borderWidth: 1, borderColor: "#a6e3bf" },
  quickLabel: { color: "#344054", fontSize: 11, fontWeight: "700", textAlign: "center" },
  sectionCard: { borderRadius: 22, backgroundColor: "#fff", padding: 16, borderWidth: 1, borderColor: "#e3e8e5" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { color: ink, fontSize: 18, fontWeight: "800" },
  viewAll: { color: brand, fontSize: 13, fontWeight: "800" },
  mediaRail: { gap: 9 },
  mediaTile: { width: 104, height: 104, borderRadius: 16, overflow: "hidden", backgroundColor: "#edf3ef" },
  mediaTileLarge: { width: "48%", aspectRatio: 1, height: undefined },
  mediaImage: { width: "100%", height: "100%" },
  videoTile: { flex: 1, padding: 10, alignItems: "center", justifyContent: "center", gap: 7 },
  videoName: { color: "#475467", fontSize: 10, textAlign: "center" },
  detailRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e6ebe8" },
  detailLabel: { flex: 1, color: ink, fontSize: 15, fontWeight: "700" },
  detailValue: { color: brand, fontSize: 13, fontWeight: "800" },
  contentRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#edf0ee" },
  rowCopy: { flex: 1, minWidth: 0 },
  contentTitle: { flex: 1, minWidth: 0, color: "#344054", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  contentMeta: { marginTop: 3, color: "#98a2b3", fontSize: 11 },
  emptyText: { paddingVertical: 12, color: "#98a2b3", fontSize: 13, textAlign: "center" },
  preferenceHint: { color: "#84918a", fontSize: 12, lineHeight: 18 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.28)" },
  wallpaperSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: "#fff", padding: 20, paddingBottom: 34 },
  modalHeader: { minHeight: 64, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e9e7" },
  modalTitle: { color: ink, fontSize: 20, fontWeight: "800" },
  modalSubtitle: { marginTop: 3, color: muted, fontSize: 12 },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#eff3f1", alignItems: "center", justifyContent: "center" },
  wallpaperGrid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  wallpaperChoice: { width: "47.5%", minHeight: 82, borderRadius: 18, padding: 14, justifyContent: "flex-end", borderWidth: 2, borderColor: "transparent" },
  wallpaperActive: { borderColor: brand },
  wallpaperLabel: { color: ink, fontSize: 15, fontWeight: "800" },
  wallpaperSelected: { marginTop: 3, color: brand, fontSize: 11, fontWeight: "800" },
  searchBox: { margin: 16, height: 50, borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#eef3f0" },
  searchInput: { flex: 1, height: "100%", color: ink, fontSize: 15 },
  modalContent: { paddingHorizontal: 16, paddingBottom: 30 },
  searchResult: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e9e7" },
  mediaGrid: { padding: 14, flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
