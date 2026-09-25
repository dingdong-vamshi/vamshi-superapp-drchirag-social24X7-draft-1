import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCheck,
  LogOut,
  MessageSquareText,
  Package,
  Plus,
  RefreshCw,
  Send,
  Users,
  X,
} from "lucide-react-native";
import {
  createBusinessWorkspaceRepository,
  type CompanyFeed,
  type WorkConversation,
  type WorkMessage,
} from "../src/features/businessWorkspace/businessWorkspaceRepository";
import type { BusinessWorkContext } from "../src/features/businessWorkspace/businessAuth";
import { useAuth } from "../src/lib/AuthContext";
import { supabase } from "../src/lib/supabase";

const green = "#087a49";
const ink = "#102133";
const muted = "#63758b";
const line = "#dce7e1";
const mint = "#eef8f3";

export default function BusinessWorkspacePage() {
  const { width } = useWindowDimensions();
  const compact = width < 780;
  const { signOut } = useAuth();
  const repository = useMemo(
    () => (supabase ? createBusinessWorkspaceRepository(supabase) : null),
    [],
  );
  const [context, setContext] = useState<BusinessWorkContext | null>(null);
  const [inbox, setInbox] = useState<WorkConversation[]>([]);
  const [messages, setMessages] = useState<WorkMessage[]>([]);
  const [selected, setSelected] = useState<WorkConversation | null>(null);
  const [feed, setFeed] = useState<CompanyFeed | null>(null);
  const [tab, setTab] = useState<"chats" | "feed">("chats");
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState("");

  const clearWorkspaceData = useCallback(() => {
    setContext(null);
    setInbox([]);
    setMessages([]);
    setSelected(null);
    setFeed(null);
  }, []);

  const revokeInactiveSession = useCallback(async () => {
    clearWorkspaceData();
    await signOut();
    router.replace("/business-login");
  }, [clearWorkspaceData, signOut]);

  const loadInbox = useCallback(async () => {
    if (!repository) return;
    const rows = await repository.listInbox(filter);
    setInbox(rows);
    setSelected((current) =>
      current
        ? (rows.find(
            (item) => item.conversationId === current.conversationId,
          ) ?? null)
        : (rows[0] ?? null),
    );
  }, [repository, filter]);
  const loadMessages = useCallback(
    async (conversationId: string) => {
      if (!repository) return;
      const rows = await repository.listMessages(conversationId);
      setMessages(rows);
      await repository.markRead(conversationId);
    },
    [repository],
  );
  const load = useCallback(async () => {
    if (!repository) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const nextContext = await repository.getContext();
      if (!nextContext || nextContext.status !== "verified") {
        await revokeInactiveSession();
        return;
      }
      setContext(nextContext);
      await loadInbox();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Business workspace could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [repository, loadInbox, revokeInactiveSession]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (selected) void loadMessages(selected.conversationId);
    else setMessages([]);
  }, [selected?.conversationId, loadMessages]);
  useEffect(() => {
    if (!repository || !context) return;
    return repository.subscribe(context.storefrontId, () => {
      void (async () => {
        try {
          const nextContext = await repository.getContext();
          if (!nextContext || nextContext.status !== "verified") {
            await revokeInactiveSession();
            return;
          }
          setContext(nextContext);
          await loadInbox();
          if (selected) await loadMessages(selected.conversationId);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Business workspace could not be refreshed.",
          );
        }
      })();
    });
  }, [
    repository,
    context,
    selected?.conversationId,
    loadInbox,
    loadMessages,
    revokeInactiveSession,
  ]);

  const openFeed = async () => {
    setTab("feed");
    if (!repository || feed) return;
    setBusy(true);
    try {
      setFeed(await repository.getCompanyFeed());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Company feed unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!repository || !selected || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    setBusy(true);
    try {
      await repository.sendMessage(selected.conversationId, body);
      await Promise.all([loadMessages(selected.conversationId), loadInbox()]);
    } catch (cause) {
      setDraft(body);
      setError(
        cause instanceof Error ? cause.message : "Message could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  };
  const resolve = async () => {
    if (!repository || !selected) return;
    setBusy(true);
    try {
      await repository.resolve(selected.conversationId);
      await loadInbox();
      setSelected(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Conversation could not be resolved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const startChat = async () => {
    if (!repository || !phone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await repository.startByPhone(phone.trim());
      if (!id) {
        setError(
          "No eligible customer account matched that exact phone number.",
        );
        return;
      }
      setPhoneOpen(false);
      setPhone("");
      setFilter("open");
      const rows = await repository.listInbox("open");
      setInbox(rows);
      setSelected(rows.find((item) => item.conversationId === id) ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Customer chat could not be started.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <View style={styles.state}>
        <ActivityIndicator color={green} />
        <Text style={styles.stateText}>Opening secure business workspace…</Text>
      </View>
    );
  if (!context)
    return (
      <View style={styles.state}>
        <BriefcaseBusiness size={36} color={green} />
        <Text style={styles.stateTitle}>Work access unavailable</Text>
        <Text style={styles.error}>{error}</Text>
        <Pressable
          onPress={() =>
            void signOut().then(() => router.replace("/business-login"))
          }
          style={styles.primary}
        >
          <Text style={styles.primaryText}>Return to work login</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={[styles.page, compact && styles.pageCompact]}>
      <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
        <View style={styles.company}>
          <View style={styles.companyIcon}>
            <Building2 size={22} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.companyNameRow}>
              <Text style={styles.companyName} numberOfLines={1}>
                {context.storefrontName}
              </Text>
              {context.storefrontVerified ? (
                <BadgeCheck size={17} color="#147ac6" fill="#e3f2ff" />
              ) : null}
            </View>
            <Text style={styles.companyMeta}>{context.roleName} workspace</Text>
          </View>
        </View>
        <View style={[styles.navigation, compact && styles.navigationCompact]}>
          <Nav
            active={tab === "chats"}
            icon={
              <MessageSquareText
                size={18}
                color={tab === "chats" ? green : muted}
              />
            }
            label="Customer chats"
            onPress={() => setTab("chats")}
          />
          <Nav
            active={tab === "feed"}
            icon={<Package size={18} color={tab === "feed" ? green : muted} />}
            label="Company feed"
            onPress={() => void openFeed()}
          />
        </View>
        <View style={styles.identityCard}>
          <View style={styles.identityAvatar}>
            <Text style={styles.identityAvatarText}>
              {context.fullName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.companyNameRow}>
              <Text style={styles.identityName}>{context.fullName}</Text>
              {context.representativeVerified ? (
                <BadgeCheck size={15} color="#147ac6" fill="#e3f2ff" />
              ) : null}
            </View>
            <Text style={styles.identityMeta}>
              {context.jobTitle} · {context.customerTagline}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() =>
              void signOut().then(() => router.replace("/business-login"))
            }
          >
            <LogOut size={18} color="#a52a36" />
          </Pressable>
        </View>
      </View>
      <View style={styles.content}>
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setError(null)}>
              <X size={16} color="#a52a36" />
            </Pressable>
          </View>
        ) : null}
        {tab === "chats" ? (
          <View
            style={[styles.chatLayout, compact && styles.chatLayoutCompact]}
          >
            <View
              style={[
                styles.inbox,
                compact && styles.inboxCompact,
                compact && selected && styles.hidden,
              ]}
            >
              <View style={styles.inboxHeader}>
                <View>
                  <Text style={styles.title}>Customer chats</Text>
                  <Text style={styles.subtitle}>Assigned to you</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="New customer chat"
                  onPress={() => setPhoneOpen(true)}
                  style={styles.addButton}
                >
                  <Plus size={16} color="#ffffff" />
                </Pressable>
              </View>
              <View style={styles.filters}>
                <Filter
                  active={filter === "open"}
                  label="Open"
                  onPress={() => {
                    setFilter("open");
                    setSelected(null);
                  }}
                />
                <Filter
                  active={filter === "resolved"}
                  label="Resolved"
                  onPress={() => {
                    setFilter("resolved");
                    setSelected(null);
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Refresh customer chats"
                  onPress={() => void loadInbox()}
                >
                  <RefreshCw size={16} color={green} />
                </Pressable>
              </View>
              <ScrollView style={styles.inboxScroll}>
                {inbox.map((item) => (
                  <Pressable
                    key={item.conversationId}
                    accessibilityRole="button"
                    accessibilityLabel={`Open chat with ${item.customerDisplayName}`}
                    accessibilityState={{ selected: selected?.conversationId === item.conversationId }}
                    onPress={() => setSelected(item)}
                    style={[
                      styles.conversation,
                      selected?.conversationId === item.conversationId &&
                        styles.conversationActive,
                    ]}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {item.customerDisplayName.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.conversationNameRow}>
                        <Text style={styles.conversationName}>
                          {item.customerDisplayName}
                        </Text>
                        {item.unreadCount ? (
                          <Text style={styles.unread}>{item.unreadCount}</Text>
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={styles.lastMessage}>
                        {item.lastMessage}
                      </Text>
                      <Text style={styles.assignee}>
                        Assigned to {item.assigneeName}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {!inbox.length ? (
                  <View style={styles.empty}>
                    <MessageSquareText size={27} color={green} />
                    <Text style={styles.emptyTitle}>
                      No {filter} conversations
                    </Text>
                    <Text style={styles.emptyCopy}>
                      Assigned customer chats appear here in real time.
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            </View>
            <View
              style={[styles.thread, compact && !selected && styles.hidden]}
            >
              {selected ? (
                <>
                  <View style={styles.threadHeader}>
                    {compact ? (
                      <Pressable onPress={() => setSelected(null)}>
                        <Text style={styles.back}>‹ Inbox</Text>
                      </Pressable>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.threadName}>
                        {selected.customerDisplayName}
                      </Text>
                      <Text style={styles.threadMeta}>
                        Customer identity is privacy-safe ·{" "}
                        {selected.workStatus}
                      </Text>
                    </View>
                    {selected.workStatus === "open" ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Resolve conversation"
                        accessibilityState={{ disabled: busy }}
                        disabled={busy}
                        onPress={() => void resolve()}
                        style={styles.resolve}
                      >
                        <CheckCheck size={15} color={green} />
                        <Text style={styles.resolveText}>Resolve</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <ScrollView contentContainerStyle={styles.messageList}>
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.messageId}
                        message={message}
                        mine={message.senderType !== "customer"}
                      />
                    ))}
                  </ScrollView>
                  {selected.workStatus === "open" ? (
                    <View style={styles.composer}>
                      <TextInput
                        accessibilityLabel="Reply to customer"
                        value={draft}
                        onChangeText={setDraft}
                        multiline
                        placeholder="Reply as verified representative"
                        placeholderTextColor="#91a0ae"
                        style={styles.composerInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Send business reply"
                        accessibilityState={{ disabled: busy || !draft.trim(), busy }}
                        disabled={busy || !draft.trim()}
                        onPress={() => void send()}
                        style={[
                          styles.send,
                          (busy || !draft.trim()) && styles.disabled,
                        ]}
                      >
                        {busy ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <Send size={18} color="#ffffff" />
                        )}
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.resolved}>
                      <CheckCheck size={18} color={green} />
                      <Text style={styles.resolvedText}>
                        Resolved. A new customer message reopens this chat
                        automatically.
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.emptyThread}>
                  <Users size={34} color={green} />
                  <Text style={styles.emptyTitle}>
                    Select an assigned customer
                  </Text>
                  <Text style={styles.emptyCopy}>
                    Customer phone, email and other personal profile fields are
                    never shown here.
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <CompanyFeedPanel feed={feed} loading={busy} />
        )}
      </View>
      <Modal
        visible={phoneOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPhoneOpen(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Start customer chat</Text>
                <Text style={styles.modalCopy}>
                  Enter the customer’s complete known phone number. Partial
                  search and customer directory browsing are disabled.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close customer phone dialog"
                onPress={() => setPhoneOpen(false)}
              >
                <X size={20} color={ink} />
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Exact customer phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="Exact phone number"
              placeholderTextColor="#91a0ae"
              style={styles.phoneInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open assigned chat"
              accessibilityState={{ disabled: busy || !phone.trim(), busy }}
              disabled={busy || !phone.trim()}
              onPress={() => void startChat()}
              style={[
                styles.primary,
                (busy || !phone.trim()) && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryText}>Open assigned chat</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Nav({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.nav, active && styles.navActive]}
    >
      {icon}
      <Text style={[styles.navText, active && styles.navTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}
function Filter({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} conversations`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.filter, active && styles.filterActive]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}
function MessageBubble({
  message,
  mine,
}: {
  message: WorkMessage;
  mine: boolean;
}) {
  return (
    <View style={[styles.messageRow, mine && styles.messageRowMine]}>
      <View style={[styles.bubble, mine && styles.bubbleMine]}>
        <View style={styles.senderRow}>
          <Text style={[styles.sender, mine && styles.senderMine]}>
            {message.senderDisplayName}
          </Text>
          {message.representativeVerified ? (
            <BadgeCheck size={14} color={mine ? "#d9f3ff" : "#147ac6"} />
          ) : null}
        </View>
        {message.senderTagline ? (
          <Text style={[styles.tagline, mine && styles.taglineMine]}>
            {message.senderTagline}
          </Text>
        ) : null}
        <Text style={[styles.messageBody, mine && styles.messageBodyMine]}>
          {message.body}
        </Text>
        <Text style={[styles.time, mine && styles.timeMine]}>
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    </View>
  );
}
function CompanyFeedPanel({
  feed,
  loading,
}: {
  feed: CompanyFeed | null;
  loading: boolean;
}) {
  if (loading && !feed)
    return (
      <View style={styles.state}>
        <ActivityIndicator color={green} />
      </View>
    );
  if (!feed)
    return (
      <View style={styles.state}>
        <Text style={styles.stateText}>
          Company feed is unavailable for this role.
        </Text>
      </View>
    );
  return (
    <ScrollView contentContainerStyle={styles.feed}>
      <View style={styles.feedHero}>
        <View style={styles.companyIcon}>
          <Building2 size={22} color="#ffffff" />
        </View>
        <View>
          <View style={styles.companyNameRow}>
            <Text style={styles.title}>{feed.storefront.name}</Text>
            {feed.storefront.verified ? (
              <BadgeCheck size={18} color="#147ac6" />
            ) : null}
          </View>
          <Text style={styles.subtitle}>{feed.storefront.tagline}</Text>
        </View>
      </View>
      <Text style={styles.feedSection}>Products</Text>
      <View style={styles.productGrid}>
        {feed.products.map((product) => (
          <View key={product.id} style={styles.productCard}>
            <Package size={20} color={green} />
            <Text style={styles.productTitle}>{product.title}</Text>
            <Text style={styles.productCopy}>{product.shortDescription}</Text>
            <Text style={styles.productPrice}>
              ₹{(product.priceMinor / 100).toLocaleString("en-IN")}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.feedSection}>Company posts</Text>
      {feed.posts.map((post) => (
        <View key={post.id} style={styles.postCard}>
          <Text style={styles.postBody}>{post.body}</Text>
          <Text style={styles.postDate}>
            {new Date(post.createdAt).toLocaleString()}
          </Text>
        </View>
      ))}
      {!feed.posts.length ? (
        <Text style={styles.emptyCopy}>No public company posts yet.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: "row", backgroundColor: "#f5f8f6" },
  pageCompact: { flexDirection: "column" },
  sidebar: {
    width: 260,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: line,
    padding: 16,
    gap: 18,
  },
  sidebarCompact: {
    width: "100%",
    padding: 9,
    gap: 8,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: line,
  },
  company: { flexDirection: "row", gap: 10, alignItems: "center" },
  companyIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
  },
  companyNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  companyName: { color: ink, fontSize: 15, fontWeight: "900", maxWidth: 150 },
  companyMeta: { color: muted, fontSize: 10, marginTop: 2 },
  navigation: { gap: 7 },
  navigationCompact: { flexDirection: "row" },
  nav: {
    minHeight: 45,
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  navActive: { backgroundColor: mint },
  navText: { color: muted, fontSize: 12, fontWeight: "800" },
  navTextActive: { color: green },
  identityCard: {
    marginTop: "auto",
    borderRadius: 14,
    backgroundColor: "#f5f8f6",
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  identityAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: mint,
    alignItems: "center",
    justifyContent: "center",
  },
  identityAvatarText: { color: green, fontWeight: "900" },
  identityName: { color: ink, fontSize: 11, fontWeight: "900" },
  identityMeta: { color: muted, fontSize: 9, marginTop: 2 },
  content: { flex: 1, minWidth: 0, padding: 14, gap: 10 },
  errorBanner: {
    borderRadius: 12,
    backgroundColor: "#fff1f1",
    borderWidth: 1,
    borderColor: "#ffc7cb",
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorText: { color: "#a52a36", fontSize: 12 },
  chatLayout: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: line,
    borderRadius: 20,
    overflow: "hidden",
  },
  chatLayoutCompact: { flexDirection: "column" },
  inbox: { width: 350, borderRightWidth: 1, borderRightColor: line },
  inboxCompact: { width: "100%", borderRightWidth: 0 },
  hidden: { display: "none" },
  inboxHeader: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { color: ink, fontSize: 19, fontWeight: "900" },
  subtitle: { color: muted, fontSize: 11, marginTop: 2 },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
  },
  filters: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filter: {
    backgroundColor: "#edf2ef",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterActive: { backgroundColor: green },
  filterText: { color: muted, fontSize: 10, fontWeight: "900" },
  filterTextActive: { color: "#ffffff" },
  inboxScroll: { flex: 1 },
  conversation: {
    padding: 13,
    borderTopWidth: 1,
    borderTopColor: "#edf2ef",
    flexDirection: "row",
    gap: 10,
  },
  conversationActive: { backgroundColor: mint },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e4f6ec",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: green, fontWeight: "900" },
  conversationNameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  conversationName: { color: ink, fontSize: 12, fontWeight: "900" },
  unread: {
    color: "#ffffff",
    backgroundColor: green,
    borderRadius: 999,
    paddingHorizontal: 6,
    fontSize: 9,
    fontWeight: "900",
  },
  lastMessage: { color: muted, fontSize: 11, marginTop: 3 },
  assignee: { color: green, fontSize: 9, marginTop: 3, fontWeight: "700" },
  thread: { flex: 1, minWidth: 0 },
  threadHeader: {
    minHeight: 70,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  back: { color: green, fontWeight: "900" },
  threadName: { color: ink, fontSize: 15, fontWeight: "900" },
  threadMeta: { color: muted, fontSize: 10, marginTop: 2 },
  resolve: {
    borderWidth: 1,
    borderColor: line,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  resolveText: { color: green, fontSize: 10, fontWeight: "900" },
  messageList: { padding: 17, gap: 10 },
  messageRow: { alignItems: "flex-start" },
  messageRowMine: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "78%",
    backgroundColor: "#f0f4f2",
    borderRadius: 15,
    borderBottomLeftRadius: 4,
    padding: 10,
  },
  bubbleMine: {
    backgroundColor: green,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 4,
  },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sender: { color: green, fontSize: 9, fontWeight: "900" },
  senderMine: { color: "#ffffff" },
  tagline: { color: muted, fontSize: 8, marginTop: 2 },
  taglineMine: { color: "#d5f3e4" },
  messageBody: { color: ink, fontSize: 13, lineHeight: 19, marginTop: 4 },
  messageBodyMine: { color: "#ffffff" },
  time: { color: muted, fontSize: 8, marginTop: 5, alignSelf: "flex-end" },
  timeMine: { color: "#cfeadd" },
  composer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: line,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 15,
    backgroundColor: "#f0f4f2",
    color: ink,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  resolved: {
    padding: 14,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: line,
  },
  resolvedText: { color: green, fontSize: 11, fontWeight: "700" },
  empty: { padding: 35, alignItems: "center", gap: 8 },
  emptyTitle: { color: ink, fontSize: 14, fontWeight: "900" },
  emptyCopy: {
    color: muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
  emptyThread: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    padding: 30,
  },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    padding: 25,
    backgroundColor: "#f5f8f6",
  },
  stateText: { color: muted, fontSize: 13 },
  stateTitle: { color: ink, fontSize: 19, fontWeight: "900" },
  error: { color: "#a52a36", fontSize: 12, textAlign: "center" },
  primary: {
    minHeight: 47,
    borderRadius: 14,
    backgroundColor: green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryText: { color: "#ffffff", fontWeight: "900", fontSize: 13 },
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(9,19,15,0.52)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 15,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: { color: ink, fontSize: 19, fontWeight: "900" },
  modalCopy: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 390,
  },
  phoneInput: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: line,
    borderRadius: 13,
    paddingHorizontal: 13,
    color: ink,
  },
  feed: { padding: 18, gap: 14 },
  feedHero: {
    backgroundColor: "#eaf6ff",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  feedSection: { color: ink, fontSize: 16, fontWeight: "900", marginTop: 5 },
  productGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  productCard: {
    flexGrow: 1,
    flexBasis: 210,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: line,
    borderRadius: 15,
    padding: 14,
  },
  productTitle: { color: ink, fontSize: 13, fontWeight: "900", marginTop: 8 },
  productCopy: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  productPrice: { color: green, fontSize: 13, fontWeight: "900", marginTop: 8 },
  postCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: line,
    borderRadius: 15,
    padding: 14,
  },
  postBody: { color: ink, fontSize: 12, lineHeight: 18 },
  postDate: { color: muted, fontSize: 9, marginTop: 8 },
});
