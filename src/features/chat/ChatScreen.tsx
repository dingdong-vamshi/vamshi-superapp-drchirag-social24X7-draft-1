import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Clipboard from "expo-clipboard";
import EmojiPicker, { type EmojiType } from "rn-emoji-keyboard";
import {
  ActivityIndicator,
  Alert,
  type AlertButton,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Camera,
  Copy,
  Ellipsis,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  Plus,
  Reply,
  Search,
  Send,
  Settings,
  Share2,
  Store,
  UserPlus,
  UsersRound,
  Video,
  VideoOff,
  X,
} from "lucide-react-native";

import { unconfiguredCallAdapter } from "./callAdapter";
import {
  CURRENT_USER_ID,
  type CallAdapter,
  type CallKind,
  type CallSession,
  type ChatContact,
  type ChatDataSource,
  type ChatMessage,
  type Conversation,
  type SharedPost,
} from "./types";

type Props = {
  dataSource?: ChatDataSource;
  callAdapter?: CallAdapter;
  onBack?: () => void;
  onBusinessSearch?: () => void;
  sharedPost?: SharedPost;
};
type LoadState = "loading" | "ready" | "error";
type ChatListFilter = "all" | "unread" | "requests" | "archived";

const unavailableChatRepository: ChatDataSource = {
  async listConversations() {
    throw new Error("Sign in with a real Supabase account to load chats.");
  },
  async listMessages() {
    throw new Error("Sign in with a real Supabase account to load messages.");
  },
  async sendMessage() {
    throw new Error("Sign in with a real Supabase account to send messages.");
  },
  async setMessageReaction() {
    throw new Error("Sign in with a real Supabase account to react to messages.");
  },
  async markConversationRead() {},
  async searchContacts() {
    return [];
  },
  async openDirectConversation() {
    throw new Error("Sign in with a real Supabase account to open chats.");
  },
  async sendMessageRequest() {
    throw new Error("Sign in with a real Supabase account to send requests.");
  },
  async acceptMessageRequest() {
    throw new Error("Sign in with a real Supabase account to accept requests.");
  },
  subscribe() {
    return () => {};
  },
};

const formatTime = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
const preview = (conversation: Conversation) =>
  conversation.lastMessage?.text ||
  conversation.requestMessage ||
  (conversation.requestStatus === "pending_outgoing"
    ? "Message request sent"
    : "No messages yet");

export default function ChatScreen({
  dataSource = unavailableChatRepository,
  callAdapter = unconfiguredCallAdapter,
  onBack,
  onBusinessSearch,
  sharedPost,
}: Props) {
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [lookup, setLookup] = useState("");
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [segment, setSegment] = useState<"personal" | "business">("personal");
  const [listFilter, setListFilter] = useState<ChatListFilter>("all");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const selectedRef = useRef<Conversation | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const hasLoadedOnceRef = useRef(false);
  const loadSeqRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownRequestSignatureRef = useRef<string | null>(null);

  const loadConversations = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    const loadId = ++loadSeqRef.current;
    const shouldBlock =
      mode === "initial" &&
      !hasLoadedOnceRef.current &&
      conversationsRef.current.length === 0;
    try {
      setError(null);
      if (shouldBlock) setState("loading");
      else setIsRefreshing(true);
      const next = await dataSource.listConversations();
      if (loadId !== loadSeqRef.current) return;
      conversationsRef.current = next;
      setConversations(next);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
      setState("ready");
    } catch {
      if (!hasLoadedOnceRef.current && conversationsRef.current.length === 0) {
        setError("Chats could not be loaded from this device. Please try again.");
        setState("error");
      } else {
        setError("Chats could not be refreshed. Showing your latest loaded conversations.");
      }
    } finally {
      if (loadId === loadSeqRef.current) setIsRefreshing(false);
    }
  }, [dataSource]);

  const openConversation = useCallback(
    async (conversation: Conversation) => {
      setSelected(conversation);
      if (
        conversation.requestStatus &&
        conversation.requestStatus !== "accepted"
      ) {
        setMessages([]);
        setState("ready");
        return;
      }
      setState("loading");
      try {
        await dataSource.markConversationRead(conversation.id);
        setMessages(await dataSource.listMessages(conversation.id));
        setState("ready");
      } catch {
        setError(
          "Messages could not be loaded. Your existing messages are safe on this device.",
        );
        setState("error");
      }
    },
    [dataSource],
  );

  const refreshSelectedMessages = useCallback(
    async (conversationId: string) => {
      try {
        setMessages(await dataSource.listMessages(conversationId));
        setState("ready");
      } catch {
        setError(
          "Messages could not be refreshed. Check your connection and try again.",
        );
      }
    },
    [dataSource],
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    hasLoadedOnceRef.current = hasLoadedOnce;
  }, [hasLoadedOnce]);

  const runRealtimeRefresh = useCallback(() => {
    const active = selectedRef.current;
    if (active) void refreshSelectedMessages(active.id);
    else void loadConversations("refresh");
  }, [loadConversations, refreshSelectedMessages]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(runRealtimeRefresh, 250);
  }, [runRealtimeRefresh]);

  useEffect(() => {
    void loadConversations("initial");
  }, [loadConversations]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(
    () => dataSource.subscribe(scheduleRealtimeRefresh),
    [dataSource, scheduleRealtimeRefresh],
  );
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);
  useEffect(
    () =>
      callAdapter.subscribe((next) => {
        setCallSession(next.phase === "ended" ? null : next);
      }),
    [callAdapter],
  );
  useEffect(() => {
    let mounted = true;
    const search = async () => {
      if (lookup.trim()) {
        const result = await dataSource.searchContacts(lookup);
        if (mounted) setContacts(result);
      } else if (mounted) setContacts([]);
    };
    void search().catch(() => mounted && setContacts([]));
    return () => {
      mounted = false;
    };
  }, [dataSource, lookup]);

  const sendRequest = async (contact: ChatContact) => {
    const note = `Hi ${contact.name}, I would like to message you on Social 24x7.`;
    try {
      setRequestingId(contact.id);
      await dataSource.sendMessageRequest(contact, note);
      await loadConversations("refresh");
      setNewChatOpen(false);
      setLookup("");
      Alert.alert(
        "Request sent",
        `${contact.name} will see a message request notification before the chat opens.`,
      );
    } catch {
      setError("That request could not be sent. Please try again.");
    } finally {
      setRequestingId(null);
    }
  };

  // Keep every hook above view branches. Selecting a conversation must not
  // change this component's hook order.
  const segmentConversations = useMemo(
    () =>
      conversations.filter((conversation) => {
        const kind = conversation.kind ?? "personal";
        return segment === "business" ? kind === "business" : kind !== "business";
      }),
    [conversations, segment],
  );
  const filtered = useMemo(
    () => {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      return segmentConversations
        .filter((conversation) => {
          if (listFilter === "unread") return conversation.unreadCount > 0;
          if (listFilter === "requests") {
            return Boolean(
              conversation.requestStatus &&
              conversation.requestStatus !== "accepted",
            );
          }
          if (listFilter === "archived") return Boolean(conversation.isArchived);
          return !conversation.isArchived;
        })
        .filter((conversation) => {
          if (!normalizedQuery) return true;
          const haystack = [
            conversation.participant.name,
            conversation.participant.username,
            preview(conversation),
          ]
            .join(" ")
            .toLocaleLowerCase();
          return haystack.includes(normalizedQuery);
        });
    },
    [listFilter, query, segmentConversations],
  );
  const visibleSegmentConversations = useMemo(
    () => segmentConversations.filter((conversation) => !conversation.isArchived),
    [segmentConversations],
  );
  const unreadMessages = useMemo(
    () =>
      visibleSegmentConversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      ),
    [visibleSegmentConversations],
  );
  const incomingRequests = useMemo(
    () =>
      conversations.filter(
        (conversation) => conversation.requestStatus === "pending_incoming",
      ),
    [conversations],
  );
  const incomingRequestSignature = useMemo(
    () => incomingRequests.map((request) => request.id).sort().join("|"),
    [incomingRequests],
  );
  useEffect(() => {
    if (!incomingRequestSignature || selectedRef.current) return;
    if (shownRequestSignatureRef.current === incomingRequestSignature) return;
    shownRequestSignatureRef.current = incomingRequestSignature;
    setRequestsOpen(true);
  }, [incomingRequestSignature]);
	  const acceptIncomingRequest = async (conversation: Conversation) => {
	    try {
	      setAcceptingId(conversation.id);
	      await dataSource.acceptMessageRequest(conversation.id);
	      await loadConversations("refresh");
	      setRequestsOpen(false);
	    } catch {
	      Alert.alert("Could not accept", "Please try again.");
	    } finally {
	      setAcceptingId(null);
	    }
	  };
  const rejectIncomingRequest = async (conversation: Conversation) => {
    if (!dataSource.rejectMessageRequest) return;
    try {
      setActioningId(conversation.id);
      await dataSource.rejectMessageRequest(conversation.id);
      await loadConversations("refresh");
    } catch {
      Alert.alert("Could not reject", "Please try again.");
    } finally {
      setActioningId(null);
    }
  };
  const cancelOutgoingRequest = async (conversation: Conversation) => {
    if (!dataSource.cancelMessageRequest) return;
    try {
      setActioningId(conversation.id);
      await dataSource.cancelMessageRequest(conversation.id);
      await loadConversations("refresh");
    } catch {
      Alert.alert("Could not cancel", "Please try again.");
    } finally {
      setActioningId(null);
    }
  };
  const archiveConversation = async (conversation: Conversation) => {
    const action = conversation.isArchived
      ? dataSource.unarchiveConversation
      : dataSource.archiveConversation;
    if (!action) return;
    try {
      setActioningId(conversation.id);
      await action(conversation.id);
      await loadConversations("refresh");
    } catch {
      Alert.alert("Could not update archive", "Please try again.");
    } finally {
      setActioningId(null);
    }
  };
  const toggleReadState = async (conversation: Conversation) => {
    try {
      setActioningId(conversation.id);
      if (conversation.unreadCount > 0) await dataSource.markConversationRead(conversation.id);
      else if (dataSource.markConversationUnread) await dataSource.markConversationUnread(conversation.id);
      await loadConversations("refresh");
    } catch {
      Alert.alert("Could not update read state", "Please try again.");
    } finally {
      setActioningId(null);
    }
  };
  const showConversationActions = (conversation: Conversation) => {
    const buttons: AlertButton[] = [
      { text: "Open", onPress: () => void openConversation(conversation) },
    ];
    if (conversation.requestStatus === "pending_incoming") {
      buttons.push(
        { text: "Accept", onPress: () => void acceptIncomingRequest(conversation) },
        { text: "Reject", style: "destructive", onPress: () => void rejectIncomingRequest(conversation) },
      );
    } else if (conversation.requestStatus === "pending_outgoing") {
      buttons.push({
        text: "Cancel request",
        style: "destructive",
        onPress: () => void cancelOutgoingRequest(conversation),
      });
    } else {
      buttons.push(
        {
          text: conversation.unreadCount > 0 ? "Mark as read" : "Mark as unread",
          onPress: () => void toggleReadState(conversation),
        },
        {
          text: conversation.isArchived ? "Unarchive" : "Archive",
          onPress: () => void archiveConversation(conversation),
        },
      );
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(conversation.participant.name, "Choose a chat action.", buttons);
  };

  if (selected)
    return (
      <ConversationView
        conversation={selected}
        messages={messages}
        state={state}
        error={error}
        dataSource={dataSource}
        callAdapter={callAdapter}
        callSession={callSession}
        sharedPost={sharedPost}
        acceptRequest={async (conversationId) => {
          const accepted = await dataSource.acceptMessageRequest(conversationId);
          setSelected(accepted);
          return accepted;
        }}
	        onBack={() => {
	          setSelected(null);
	          setError(null);
	          void loadConversations("refresh");
	        }}
      />
    );
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Chats
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            onPress={() => setNewChatOpen(true)}
            style={styles.iconButton}
          >
            <Plus color="#ffffff" size={24} />
          </Pressable>
	          <Pressable
	            accessibilityRole="button"
	            accessibilityLabel="Chat settings"
	            disabled
	            accessibilityState={{ disabled: true }}
	            style={styles.iconButtonMuted}
	          >
            <Settings color="#475467" size={20} />
          </Pressable>
          <Pressable
	            accessibilityRole="button"
	            accessibilityLabel={`More options${incomingRequests.length ? `, ${incomingRequests.length} request${incomingRequests.length === 1 ? "" : "s"} waiting` : ""}`}
	            onPress={() => setToolsOpen(true)}
	            style={styles.iconButtonMuted}
	          >
            <Ellipsis color="#475467" size={20} />
            {incomingRequests.length > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {incomingRequests.length > 9 ? "9+" : incomingRequests.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
      <View style={styles.searchBox}>
        <Search color="#728096" size={18} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search chats and people"
          placeholderTextColor="#728096"
          style={styles.searchInput}
          accessibilityLabel="Search conversations"
          returnKeyType="search"
        />
      </View>
      <View style={styles.segmentedControl}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: segment === "personal" }}
          onPress={() => setSegment("personal")}
          style={[
            styles.segmentButton,
            segment === "personal" && styles.segmentButtonActive,
          ]}
        >
          <UsersRound
            color={segment === "personal" ? "#16a34a" : "#667085"}
            size={18}
          />
          <Text
            style={[
              styles.segmentLabel,
              segment === "personal" && styles.segmentLabelActive,
            ]}
          >
            Personal
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: segment === "business" }}
          onPress={() => setSegment("business")}
          style={[
            styles.segmentButton,
            segment === "business" && styles.segmentButtonActive,
          ]}
        >
          <Store
            color={segment === "business" ? "#16a34a" : "#667085"}
            size={18}
          />
          <Text
            style={[
              styles.segmentLabel,
              segment === "business" && styles.segmentLabelActive,
            ]}
          >
            Business
          </Text>
        </Pressable>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryPrimary}>
          {visibleSegmentConversations.length}{" "}
          {segment === "personal" ? "personal chats" : "business chats"}
        </Text>
        <Text style={styles.summarySecondary}>
          {unreadMessages} unread
        </Text>
        <Text style={styles.summarySecondary}>
          {incomingRequests.length} requests
        </Text>
      </View>
      <View style={styles.filterRow}>
        {([
          ["all", "All"],
          ["unread", "Unread"],
          ["requests", "Requests"],
          ["archived", "Archived"],
        ] as const).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: listFilter === value }}
            onPress={() => setListFilter(value)}
            style={[
              styles.filterChip,
              listFilter === value && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                listFilter === value && styles.filterChipTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {isRefreshing && hasLoadedOnce ? (
        <Text style={styles.refreshHint}>Refreshing chats…</Text>
      ) : error && hasLoadedOnce ? (
        <Text style={styles.refreshError}>{error}</Text>
      ) : null}
      {sharedPost && (
        <View style={styles.shareSelectionBanner}>
          <View style={styles.shareSelectionIcon}>
            <Share2 color="#ffffff" size={18} />
          </View>
          <View style={styles.shareSelectionCopy}>
            <Text style={styles.shareSelectionTitle}>
              Share @{sharedPost.author}&apos;s post
            </Text>
            <Text numberOfLines={1} style={styles.shareSelectionCaption}>
              {sharedPost.caption || "Social 24x7 post"}
            </Text>
          </View>
          <Text style={styles.shareSelectionHint}>Select chat</Text>
        </View>
      )}
      {incomingRequests.length > 0 && (
        <IncomingRequestBanner
          count={incomingRequests.length}
          latest={incomingRequests[0]}
          onPress={() => setRequestsOpen(true)}
        />
      )}
      {state === "loading" && !hasLoadedOnce && conversations.length === 0 ? (
        <Loading />
      ) : state === "error" && conversations.length === 0 ? (
        <ErrorState message={error} retry={() => void loadConversations("initial")} />
      ) : segment === "business" && filtered.length === 0 ? (
        <BusinessPlaceholder onBusinessSearch={onBusinessSearch} />
      ) : filtered.length === 0 ? (
        <EmptyState query={query} onStart={() => setNewChatOpen(true)} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.id}:${item.requestStatus ?? "chat"}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ConversationRow
              item={item}
              busy={actioningId === item.id}
              onPress={() => void openConversation(item)}
              onMore={() => showConversationActions(item)}
            />
          )}
        />
      )}
      <NewChatModal
        visible={newChatOpen}
        lookup={lookup}
        setLookup={setLookup}
        contacts={contacts}
        requestingId={requestingId}
        close={() => {
          setNewChatOpen(false);
          setLookup("");
        }}
        sendRequest={sendRequest}
      />
      <RequestsModal
        visible={requestsOpen}
        requests={incomingRequests}
        acceptingId={acceptingId}
        close={() => setRequestsOpen(false)}
	        acceptRequest={acceptIncomingRequest}
	        rejectRequest={rejectIncomingRequest}
	      />
      <ChatToolsModal
        visible={toolsOpen}
        close={() => setToolsOpen(false)}
        filter={listFilter}
        setFilter={(next) => {
          setListFilter(next);
          setToolsOpen(false);
        }}
        requestCount={incomingRequests.length}
        openRequests={() => {
          setToolsOpen(false);
          setRequestsOpen(true);
        }}
      />
      <CallOverlay
        session={callSession}
        participantName="Incoming call"
        adapter={callAdapter}
      />
    </SafeAreaView>
  );
}

function IncomingRequestBanner({
  count,
  latest,
  onPress,
}: {
  count: number;
  latest: Conversation;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${count} message request${count === 1 ? "" : "s"} waiting. Open notifications.`}
      onPress={onPress}
      style={styles.requestBanner}
    >
      <View style={styles.requestBannerIcon}>
        <Bell color="#ffffff" size={18} />
      </View>
      <View style={styles.requestBannerCopy}>
        <Text style={styles.requestBannerTitle}>
          {count === 1
            ? `${latest.participant.name} wants to message you`
            : `${count} message requests waiting`}
        </Text>
        <Text style={styles.requestBannerText}>
          Tap to review and accept from notifications.
        </Text>
      </View>
      <Text style={styles.requestBannerAction}>View</Text>
    </Pressable>
  );
}

function ConversationView({
  conversation,
  messages,
  state,
  error,
  dataSource,
  callAdapter,
  callSession,
  sharedPost,
  acceptRequest,
  onBack,
}: {
  conversation: Conversation;
  messages: ChatMessage[];
  state: LoadState;
  error: string | null;
  dataSource: ChatDataSource;
  callAdapter: CallAdapter;
  callSession: CallSession | null;
  sharedPost?: SharedPost;
  acceptRequest: (conversationId: string) => Promise<Conversation>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [messageReactions, setMessageReactions] = useState<
    Record<string, string>
  >({});
  const list = useRef<FlatList<ChatMessage>>(null);
  const send = async () => {
    if (conversation.requestStatus && conversation.requestStatus !== "accepted")
      return;
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);
    try {
      await dataSource.sendMessage({ conversationId: conversation.id, text });
    } catch (cause) {
      setDraft(text);
      Alert.alert(
        "Message not sent",
        cause instanceof Error
          ? cause.message
          : "Please try again in a moment.",
      );
    } finally {
      setSending(false);
    }
  };
  const share = async () => {
    const post = sharedPost ?? {
      id: "local-shared-post",
      author: "Karthikeyan",
      caption: "Shared from Social 24x7",
    };
    try {
      await dataSource.sendMessage({
        conversationId: conversation.id,
        text: `Shared a post from ${post.author}`,
        type: "shared_post",
        post,
      });
    } catch {
      Alert.alert(
        "Could not share post",
        "Please try again when your connection is restored.",
      );
    }
  };
  const sendSticker = async (sticker: string) => {
    if (conversation.requestStatus && conversation.requestStatus !== "accepted")
      return;
    setStickersOpen(false);
    try {
      await dataSource.sendMessage({
        conversationId: conversation.id,
        text: sticker,
        type: "sticker",
      });
    } catch (cause) {
      Alert.alert(
        "Sticker not sent",
        cause instanceof Error
          ? cause.message
          : "Please check your connection and try again.",
      );
    }
  };
  const chooseEmoji = (emoji: EmojiType) => {
    setDraft((current) => `${current}${emoji.emoji}`);
  };
  const copyMessage = async () => {
    if (!actionMessage) return;
    await Clipboard.setStringAsync(actionMessage.text);
    setActionMessage(null);
  };
  const replyToMessage = () => {
    if (!actionMessage) return;
    const quote = actionMessage.text.replace(/\s+/g, " ").slice(0, 90);
    setDraft(`↪ “${quote}”\n`);
    setActionMessage(null);
  };
  const reactToMessage = (emoji: string) => {
    if (!actionMessage) return;
    setMessageReactions((current) => ({
      ...current,
      [actionMessage.id]: emoji,
    }));
    setActionMessage(null);
  };
  const startCall = async (kind: CallKind) => {
    if (conversation.requestStatus && conversation.requestStatus !== "accepted") {
      Alert.alert(
        "Request pending",
        "Calls unlock after the message request is accepted.",
      );
      return;
    }
    try {
      await callAdapter.startCall({
        conversationId: conversation.id,
        recipientId: conversation.participant.id,
        kind,
      });
    } catch (cause) {
      Alert.alert(
        "Calls unavailable",
        cause instanceof Error
          ? cause.message
          : "Camera and microphone access could not be started.",
      );
    }
  };
  const accept = async () => {
    try {
      await acceptRequest(conversation.id);
    } catch {
      Alert.alert("Could not accept", "Please try again.");
    }
  };
  const hasDraft = Boolean(draft.trim());
  const composerLocked = Boolean(
    conversation.requestStatus && conversation.requestStatus !== "accepted",
  );
  const sendDisabled = sending || composerLocked || !hasDraft;
  useEffect(() => {
    list.current?.scrollToEnd({ animated: true });
  }, [messages.length]);
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={[styles.fill, styles.conversationScreen]}
        behavior={Platform.select({ ios: "padding", android: undefined })}
        keyboardVerticalOffset={8}
      >
        <View style={styles.conversationHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to chats"
            onPress={onBack}
            hitSlop={12}
          >
            <ArrowLeft color="#162033" size={25} />
          </Pressable>
          <Avatar
            label={conversation.participant.avatarLabel}
            online={conversation.participant.isOnline}
          />
          <View style={styles.headerInfo}>
            <Text accessibilityRole="header" style={styles.personName}>
              {conversation.participant.name}
            </Text>
            <Text style={styles.presence}>
              {conversation.participant.isOnline ? "online" : "Messages are private"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search this conversation"
            disabled
            accessibilityState={{ disabled: true }}
            style={[styles.callControl, styles.disabledAction]}
          >
            <Search color="#475467" size={20} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Start audio call with ${conversation.participant.name}`}
            onPress={() => void startCall("audio")}
            style={styles.callControl}
          >
            <Phone color="#475467" size={19} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More conversation actions"
            disabled
            accessibilityState={{ disabled: true }}
            style={[styles.callControl, styles.disabledAction]}
          >
            <Ellipsis color="#475467" size={20} />
          </Pressable>
        </View>
        {sharedPost &&
          (!conversation.requestStatus ||
            conversation.requestStatus === "accepted") && (
            <View style={styles.pendingShareCard}>
              <View style={styles.pendingShareCopy}>
                <Text style={styles.pendingShareEyebrow}>
                  SHARING FROM SOCIAL
                </Text>
                <Text numberOfLines={2} style={styles.pendingShareText}>
                  <Text style={styles.pendingShareAuthor}>
                    @{sharedPost.author}{" "}
                  </Text>
                  {sharedPost.caption || "Shared a post"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Send this post to ${conversation.participant.name}`}
                onPress={() => void share()}
                style={styles.pendingShareButton}
              >
                <Send color="#ffffff" size={17} />
                <Text style={styles.pendingShareButtonText}>Send</Text>
              </Pressable>
            </View>
          )}
        {state === "loading" ? (
          <Loading />
        ) : state === "error" ? (
          <ErrorState message={error} retry={onBack} />
        ) : conversation.requestStatus === "pending_outgoing" ? (
          <RequestState
            title="Request sent"
            message={`${conversation.participant.name} will get a message request notification. The chat opens after they accept.`}
          />
        ) : conversation.requestStatus === "pending_incoming" ? (
          <RequestState
            title={`${conversation.participant.name} wants to message you`}
            message={
              conversation.requestMessage ||
              "Accept the request to start this conversation."
            }
            actionLabel="Accept request"
            onAction={() => void accept()}
          />
        ) : messages.length === 0 ? (
          <EmptyConversation name={conversation.participant.name} />
        ) : (
          <FlatList
            ref={list}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                onLongPress={() => setActionMessage(item)}
                reaction={messageReactions[item.id]}
              />
            )}
            onContentSizeChange={() =>
              list.current?.scrollToEnd({ animated: false })
            }
          />
        )}
        <View style={styles.composer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a sticker"
            disabled={composerLocked}
            accessibilityState={{ disabled: composerLocked }}
            onPress={() => setStickersOpen(true)}
            style={[
              styles.composerAccessory,
              composerLocked && styles.disabledAction,
            ]}
          >
            <Plus color="#667085" size={22} />
          </Pressable>
          <View style={styles.inputShell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open emoji keyboard"
              onPress={() => setEmojiOpen(true)}
              style={styles.inputAccessory}
            >
              <MessageCircle color="#667085" size={20} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              style={styles.composerInput}
              placeholder={
                conversation.requestStatus === "pending_outgoing"
                  ? "Waiting for request acceptance"
                  : "Message"
              }
              placeholderTextColor="#728096"
              multiline
              maxLength={2000}
              accessibilityLabel={`Message ${conversation.participant.name}`}
              editable={!composerLocked}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach camera media"
              disabled
              accessibilityState={{ disabled: true }}
              style={[styles.inputAccessory, styles.disabledAction]}
            >
              <Camera color="#667085" size={20} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open payment actions"
            disabled
            accessibilityState={{ disabled: true }}
            style={[styles.payButton, styles.disabledAction]}
          >
            <Text style={styles.payButtonText}>Pay</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasDraft ? "Send message" : "Voice messages unavailable"}
            accessibilityState={{ disabled: sendDisabled }}
            disabled={sendDisabled}
            onPress={() => void send()}
            style={[
              styles.sendButton,
              sendDisabled && styles.sendDisabled,
            ]}
          >
            {hasDraft ? (
              <Send color="#fff" size={19} />
            ) : (
              <MicOff color="#fff" size={19} />
            )}
          </Pressable>
        </View>
        <EmojiPicker
          open={emojiOpen}
          onClose={() => setEmojiOpen(false)}
          onEmojiSelected={chooseEmoji}
          enableSearchBar
          enableRecentlyUsed
          categoryPosition="top"
          theme={{
            backdrop: "#00000066",
            container: "#ffffff",
            header: "#111111",
            category: { iconActive: "#07c160" },
          }}
        />
        <StickerPicker
          visible={stickersOpen}
          close={() => setStickersOpen(false)}
          select={(sticker) => void sendSticker(sticker)}
        />
        <MessageActions
          message={actionMessage}
          close={() => setActionMessage(null)}
          copy={() => void copyMessage()}
          reply={replyToMessage}
          react={reactToMessage}
        />
        <CallOverlay
          session={callSession}
          participantName={conversation.participant.name}
          adapter={callAdapter}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ConversationRow({
  item,
  busy,
  onPress,
  onMore,
}: {
  item: Conversation;
  busy: boolean;
  onPress: () => void;
  onMore: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${item.participant.name}${item.unreadCount ? `, ${item.unreadCount} unread messages` : ""}`}
      onPress={onPress}
      style={styles.row}
    >
      <Avatar
        label={item.participant.avatarLabel}
        online={item.participant.isOnline}
      />
	      <View style={styles.rowCopy}>
	        <View style={styles.rowTop}>
	          <Text style={styles.personName}>{item.participant.name}</Text>
	          <View style={styles.rowMeta}>
	            <Text style={styles.time}>{formatTime(item.updatedAt)}</Text>
	            <Pressable
	              accessibilityRole="button"
	              accessibilityLabel={`More actions for ${item.participant.name}`}
	              disabled={busy}
	              onPress={(event) => {
	                event.stopPropagation();
	                onMore();
	              }}
	              hitSlop={10}
	              style={styles.rowMore}
	            >
	              {busy ? (
	                <ActivityIndicator color="#667085" size="small" />
	              ) : (
	                <Ellipsis color="#667085" size={18} />
	              )}
	            </Pressable>
	          </View>
	        </View>
        <View style={styles.rowBottom}>
          <Text
            numberOfLines={1}
            style={[
              styles.preview,
              item.unreadCount > 0 && styles.previewUnread,
            ]}
          >
            {preview(item)}
          </Text>
          {item.requestStatus && item.requestStatus !== "accepted" && (
            <View style={styles.requestPill}>
              <Bell color="#078f4a" size={11} />
              <Text style={styles.requestPillText}>
                {item.requestStatus === "pending_outgoing"
                  ? "Request sent"
                  : "New request"}
              </Text>
            </View>
          )}
          {item.unreadCount > 0 && (
            <View
              accessible
              accessibilityLabel={`${item.unreadCount} unread messages`}
              style={styles.badge}
            >
              <Text style={styles.badgeText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function BusinessPlaceholder({
  onBusinessSearch,
}: {
  onBusinessSearch?: () => void;
}) {
  return (
    <View style={styles.businessWrap}>
        <View style={styles.businessCard}>
          <View style={styles.businessIcon}>
            <Store color="#16a34a" size={28} />
          </View>
        <Text style={styles.businessTitle}>Business chats stay separate</Text>
        <Text style={styles.businessText}>
          Storefront conversations will appear here once you open a verified
          business chat. We kept this segment safe instead of inventing new chat
          types.
        </Text>
        {onBusinessSearch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search sellers"
            onPress={onBusinessSearch}
            style={styles.businessButton}
          >
            <Text style={styles.businessButtonText}>Search sellers</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Avatar({ label, online }: { label: string; online?: boolean }) {
  return (
    <View style={styles.avatarWrap}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{label.slice(0, 2).toUpperCase()}</Text>
      </View>
      {online && <View style={styles.online} />}
    </View>
  );
}
function MessageBubble({
  message,
  onLongPress,
  reaction,
}: {
  message: ChatMessage;
  onLongPress: () => void;
  reaction?: string;
}) {
  const mine = message.senderId === CURRENT_USER_ID;
  return (
    <View style={[styles.messageWrap, mine && styles.mineWrap]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${mine ? "Your" : "Received"} message. Long press for actions.`}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={[
          styles.message,
          message.type === "sticker" && styles.stickerMessage,
          mine ? styles.mine : styles.theirs,
          message.type === "sticker" && styles.transparentMessage,
        ]}
      >
        {message.type === "shared_post" && message.post && (
          <View style={[styles.sharedPost, mine && styles.sharedPostMine]}>
            <Text style={[styles.sharedBy, mine && styles.mineText]}>
              Shared post · @{message.post.author}
            </Text>
            <Text
              style={[styles.sharedCaption, mine && styles.mineText]}
              numberOfLines={3}
            >
              {message.post.caption}
            </Text>
          </View>
        )}
        <Text
          style={[
            styles.messageText,
            message.type === "sticker" && styles.stickerText,
            mine && styles.mineText,
          ]}
        >
          {message.text}
        </Text>
        <Text style={[styles.messageTime, mine && styles.mineTime]}>
          {formatTime(message.createdAt)}
          {mine && message.status === "read" ? " · Read" : ""}
        </Text>
      </Pressable>
      {reaction ? (
        <View style={[styles.reactionPill, mine && styles.reactionPillMine]}>
          <Text style={styles.reactionPillText}>{reaction}</Text>
        </View>
      ) : null}
    </View>
  );
}

const STICKERS = [
  "👋✨", "😂💚", "🥳🎉", "😍🌟", "👍🔥", "🙏💫",
  "💪😎", "🤗💛", "☕😊", "🚀✨", "💯🙌", "🎂🎈",
];

function StickerPicker({
  visible,
  close,
  select,
}: {
  visible: boolean;
  close: () => void;
  select: (sticker: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.sheetBackdrop} onPress={close}>
        <Pressable style={styles.stickerSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Stickers</Text>
              <Text style={styles.sheetSubtitle}>Tap one to send instantly</Text>
            </View>
            <Pressable accessibilityLabel="Close stickers" onPress={close} style={styles.sheetClose}>
              <X color="#172235" size={20} />
            </Pressable>
          </View>
          <View style={styles.stickerGrid}>
            {STICKERS.map((sticker) => (
              <Pressable
                key={sticker}
                accessibilityRole="button"
                accessibilityLabel={`Send sticker ${sticker}`}
                onPress={() => select(sticker)}
                style={styles.stickerTile}
              >
                <Text style={styles.stickerTileText}>{sticker}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MessageActions({
  message,
  close,
  copy,
  reply,
  react,
}: {
  message: ChatMessage | null;
  close: () => void;
  copy: () => void;
  reply: () => void;
  react: (emoji: string) => void;
}) {
  return (
    <Modal visible={Boolean(message)} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.sheetBackdrop} onPress={close}>
        <Pressable style={styles.actionSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.reactionTray}>
            {["❤️", "😂", "😮", "😢", "😡", "👍"].map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
                onPress={() => react(emoji)}
                style={styles.reactionOption}
              >
                <Text style={styles.reactionOptionText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <Text numberOfLines={2} style={styles.actionPreview}>{message?.text}</Text>
          <Pressable accessibilityRole="button" onPress={reply} style={styles.actionRow}>
            <Reply color="#078f4a" size={20} />
            <Text style={styles.actionText}>Reply</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={copy} style={styles.actionRow}>
            <Copy color="#078f4a" size={20} />
            <Text style={styles.actionText}>Copy message</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StreamVideo({
  stream,
  muted,
  local,
}: {
  stream?: unknown;
  muted?: boolean;
  local?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream as MediaStream;
  }, [stream]);
  if (Platform.OS !== "web" || !stream) return null;
  return createElement("video", {
    ref: videoRef,
    autoPlay: true,
    playsInline: true,
    muted,
    style: local
      ? {
          position: "absolute",
          right: 18,
          top: 18,
          width: 118,
          height: 164,
          borderRadius: 18,
          objectFit: "cover",
          backgroundColor: "#162033",
          zIndex: 2,
        }
      : {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          backgroundColor: "#101916",
        },
  });
}

function CallOverlay({
  session,
  participantName,
  adapter,
}: {
  session: CallSession | null;
  participantName: string;
  adapter: CallAdapter;
}) {
  if (!session) return null;
  const active = session.phase === "connected" || session.phase === "connecting";
  const incoming = session.direction === "incoming" && session.phase === "ringing";
  const run = async (action?: (id: string) => Promise<void>) => {
    if (!action) return;
    try {
      await action(session.id);
    } catch (cause) {
      Alert.alert("Call action unavailable", cause instanceof Error ? cause.message : "Please try again.");
    }
  };
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView style={styles.callScreen}>
        <View style={styles.remoteVideo}>
          <StreamVideo stream={session.remoteStream} />
          <StreamVideo stream={session.localStream} muted local />
          {!session.remoteStream && (
            <View style={styles.callIdentity}>
              <View style={styles.callAvatar}>
                <Text style={styles.callAvatarText}>
                  {participantName.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.callName}>{participantName}</Text>
              <Text style={styles.callStatus}>
                {incoming
                  ? `Incoming ${session.kind} call`
                  : session.phase === "ringing"
                    ? "Ringing…"
                    : session.phase === "connecting"
                      ? "Connecting securely…"
                      : session.phase === "failed"
                        ? session.error || "Call failed"
                        : "Connected"}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.callControls}>
          {incoming ? (
            <>
              <CallButton
                label="Decline"
                danger
                icon={<PhoneOff color="#ffffff" size={25} />}
                action={() => void run(adapter.endCall.bind(adapter))}
              />
              <CallButton
                label="Accept"
                success
                icon={<Phone color="#ffffff" size={25} />}
                action={() => void run(adapter.acceptCall?.bind(adapter))}
              />
            </>
          ) : (
            <>
              <CallButton
                label={session.muted ? "Unmute" : "Mute"}
                icon={session.muted ? <MicOff color="#ffffff" size={23} /> : <Mic color="#ffffff" size={23} />}
                action={() => void run(adapter.toggleMute?.bind(adapter))}
              />
              {session.kind === "video" && (
                <CallButton
                  label={session.cameraOff ? "Camera on" : "Camera off"}
                  icon={session.cameraOff ? <VideoOff color="#ffffff" size={23} /> : <Video color="#ffffff" size={23} />}
                  action={() => void run(adapter.toggleCamera?.bind(adapter))}
                />
              )}
              {session.kind === "video" && (
                <CallButton
                  label={session.screenSharing ? "Sharing" : "Share screen"}
                  icon={<MonitorUp color="#ffffff" size={23} />}
                  action={() => void run(adapter.shareScreen?.bind(adapter))}
                />
              )}
              <CallButton
                label="End"
                danger
                icon={<PhoneOff color="#ffffff" size={25} />}
                action={() => void run(adapter.endCall.bind(adapter))}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function CallButton({
  label,
  icon,
  action,
  danger,
  success,
}: {
  label: string;
  icon: ReactNode;
  action: () => void;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={action} style={styles.callButtonWrap}>
      <View style={[styles.callButton, danger && styles.callButtonDanger, success && styles.callButtonSuccess]}>
        {icon}
      </View>
      <Text style={styles.callButtonLabel}>{label}</Text>
    </Pressable>
  );
}
function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color="#00A85A" size="large" />
      <Text style={styles.centerText}>Loading your conversations…</Text>
    </View>
  );
}
function ErrorState({
  message,
  retry,
}: {
  message: string | null;
  retry: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.centerText}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={styles.retry}
      >
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}
function EmptyState({
  query,
  onStart,
}: {
  query: string;
  onStart: () => void;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <MessageCircle color="#00A85A" size={30} />
        </View>
        <Text style={styles.errorTitle}>
          {query ? "No conversations found" : "Your inbox is ready"}
        </Text>
        <Text style={styles.centerText}>
          {query
            ? "Try a different name or search people."
            : "Search people by name, username or phone number and send a request."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onStart}
          style={styles.startButton}
        >
          <Plus color="#ffffff" size={18} />
          <Text style={styles.startButtonText}>Search people</Text>
        </Pressable>
      </View>
    </View>
  );
}
function EmptyConversation({ name }: { name: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Start your conversation</Text>
      <Text style={styles.centerText}>
        Send {name} a message. Conversations are private by default.
      </Text>
    </View>
  );
}
function RequestState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Bell color="#00A85A" size={28} />
        </View>
        <Text style={styles.errorTitle}>{title}</Text>
        <Text style={styles.centerText}>{message}</Text>
        {actionLabel && onAction && (
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            style={styles.startButton}
          >
            <CheckCircle2 color="#ffffff" size={18} />
            <Text style={styles.startButtonText}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
function RequestsModal({
  visible,
  requests,
  acceptingId,
  close,
  acceptRequest,
  rejectRequest,
}: {
  visible: boolean;
  requests: Conversation[];
  acceptingId: string | null;
  close: () => void;
  acceptRequest: (conversation: Conversation) => Promise<void>;
  rejectRequest: (conversation: Conversation) => Promise<void>;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.modalHeader}>
          <View>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              Notifications
            </Text>
            <Text style={styles.modalSubtitle}>Message requests</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close message requests"
            onPress={close}
            style={styles.iconButton}
          >
            <X color="#162033" size={24} />
          </Pressable>
        </View>
        {requests.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Bell color="#00A85A" size={28} />
            </View>
            <Text style={styles.errorTitle}>No new requests</Text>
            <Text style={styles.centerText}>
              When someone asks to message you, it will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(request) => request.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.requestCard}>
                <Avatar
                  label={item.participant.avatarLabel}
                  online={item.participant.isOnline}
                />
                <View style={styles.contactCopy}>
                  <Text style={styles.personName}>{item.participant.name}</Text>
                  <Text style={styles.contactMeta}>
                    @{item.participant.username}
                  </Text>
                  <Text style={styles.requestNote} numberOfLines={2}>
                    {item.requestMessage ||
                      `${item.participant.name} wants to message you.`}
                  </Text>
                </View>
	                <View style={styles.requestActions}>
	                  <Pressable
	                    accessibilityRole="button"
	                    accessibilityLabel={`Reject request from ${item.participant.name}`}
	                    disabled={acceptingId === item.id}
	                    onPress={() => void rejectRequest(item)}
	                    style={styles.rejectButton}
	                  >
	                    <X color="#b42318" size={15} />
	                  </Pressable>
	                  <Pressable
	                    accessibilityRole="button"
	                    accessibilityLabel={`Accept request from ${item.participant.name}`}
	                    disabled={acceptingId === item.id}
	                    onPress={() => void acceptRequest(item)}
	                    style={styles.acceptButton}
	                  >
	                    {acceptingId === item.id ? (
	                      <ActivityIndicator color="#ffffff" size="small" />
	                    ) : (
	                      <>
	                        <CheckCircle2 color="#ffffff" size={15} />
	                        <Text style={styles.requestButtonText}>Accept</Text>
	                      </>
	                    )}
	                  </Pressable>
	                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
	  );
	}
function ChatToolsModal({
  visible,
  close,
  filter,
  setFilter,
  requestCount,
  openRequests,
}: {
  visible: boolean;
  close: () => void;
  filter: ChatListFilter;
  setFilter: (filter: ChatListFilter) => void;
  requestCount: number;
  openRequests: () => void;
}) {
  const filters: Array<{ value: ChatListFilter; label: string }> = [
    { value: "all", label: "Show active chats" },
    { value: "unread", label: "Show unread chats" },
    { value: "requests", label: "Show message requests" },
    { value: "archived", label: "Show archived chats" },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.sheetBackdrop} onPress={close}>
        <Pressable style={styles.actionSheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Chat tools</Text>
              <Text style={styles.sheetSubtitle}>Filter and review your real conversations</Text>
            </View>
            <Pressable accessibilityLabel="Close chat tools" onPress={close} style={styles.sheetClose}>
              <X color="#172235" size={20} />
            </Pressable>
          </View>
          {filters.map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item.value }}
              onPress={() => setFilter(item.value)}
              style={styles.actionRow}
            >
              <CheckCircle2
                color={filter === item.value ? "#078f4a" : "#98a2b3"}
                size={19}
              />
              <Text style={styles.actionText}>{item.label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            disabled={requestCount === 0}
            onPress={openRequests}
            style={[styles.actionRow, requestCount === 0 && styles.disabledAction]}
          >
            <Bell color={requestCount ? "#078f4a" : "#98a2b3"} size={19} />
            <Text style={styles.actionText}>
              Review requests {requestCount ? `(${requestCount})` : ""}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function NewChatModal({
  visible,
  lookup,
  setLookup,
  contacts,
  requestingId,
  close,
  sendRequest,
}: {
  visible: boolean;
  lookup: string;
  setLookup: (value: string) => void;
  contacts: ChatContact[];
  requestingId: string | null;
  close: () => void;
  sendRequest: (contact: ChatContact) => Promise<void>;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.modalHeader}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            Search people
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close new chat"
            onPress={close}
            style={styles.iconButton}
          >
            <X color="#162033" size={24} />
          </Pressable>
        </View>
        <Text style={styles.lookupHelp}>
          Search name, username or phone number, then send a message request.
          Only real Supabase profiles appear here.
        </Text>
        <View style={styles.searchBox}>
          <Search color="#728096" size={18} />
          <TextInput
            value={lookup}
            onChangeText={setLookup}
            autoFocus
            placeholder="@username or phone number"
            placeholderTextColor="#728096"
            style={styles.searchInput}
            accessibilityLabel="Find a user by username or phone number"
          />
        </View>
        {!lookup.trim() ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Find a person</Text>
            <Text style={styles.centerText}>
              Enter their name, username or phone number to send a message request.
            </Text>
          </View>
        ) : contacts.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>No eligible user found</Text>
            <Text style={styles.centerText}>
              Try the full phone number or exact username.
            </Text>
          </View>
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={(contact) => contact.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Send message request to ${item.name}`}
                onPress={() => void sendRequest(item)}
                style={styles.contactRow}
              >
                <Avatar label={item.avatarLabel} online={item.isOnline} />
                <View style={styles.contactCopy}>
                  <Text style={styles.personName}>{item.name}</Text>
                  <Text style={styles.contactMeta}>
                    @{item.username}
                    {item.phone ? ` · ${item.phone}` : ""}
                  </Text>
                </View>
                <View style={styles.requestButton}>
                  {requestingId === item.id ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <UserPlus color="#ffffff" size={15} />
                      <Text style={styles.requestButtonText}>Request</Text>
                    </>
                  )}
                </View>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  fill: { flex: 1 },
  header: {
    minHeight: 72,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
  },
  headerCopy: { flex: 1 },
  title: { color: "#111111", fontSize: 34, lineHeight: 40, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonMuted: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f2f4f7",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: "#ff3b30",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  modalHeader: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#cfcfcf",
    backgroundColor: "#ffffff",
  },
  modalTitle: { color: "#111111", fontSize: 18, fontWeight: "700" },
  modalSubtitle: { color: "#668071", fontSize: 12, marginTop: 2 },
  lookupHelp: {
    color: "#888888",
    lineHeight: 20,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  offlineBanner: {
    backgroundColor: "#e8f7ed",
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  offlineText: { color: "#477a58", fontSize: 11, lineHeight: 16 },
  searchBox: {
    marginHorizontal: 16,
    marginTop: 4,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#f4f6f5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, color: "#111111", fontSize: 15, paddingVertical: 6 },
  segmentedControl: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: "#f2f4f7",
    padding: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  segmentButtonActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#101828",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  segmentLabel: { color: "#667085", fontSize: 16, fontWeight: "700" },
  segmentLabelActive: { color: "#16a34a" },
  summaryRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  summaryPrimary: { color: "#101828", fontSize: 16, fontWeight: "800" },
  summarySecondary: { color: "#667085", fontSize: 15, fontWeight: "500" },
  filterRow: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f4f7",
  },
  filterChipActive: { backgroundColor: "#e7f8ee" },
  filterChipText: { color: "#667085", fontSize: 12, fontWeight: "800" },
  filterChipTextActive: { color: "#078f4a" },
  refreshHint: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  refreshError: {
    color: "#b42318",
    fontSize: 12,
    fontWeight: "700",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  shareSelectionBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#effaf3",
    borderWidth: 1,
    borderColor: "#ccebd7",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  shareSelectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "#07c160",
    alignItems: "center",
    justifyContent: "center",
  },
  shareSelectionCopy: { flex: 1, minWidth: 0 },
  shareSelectionTitle: { color: "#173c28", fontSize: 13, fontWeight: "800" },
  shareSelectionCaption: { color: "#668071", fontSize: 12, marginTop: 2 },
  shareSelectionHint: { color: "#078f4a", fontSize: 12, fontWeight: "800" },
  requestBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: "#07c160",
    borderBottomWidth: 4,
    borderBottomColor: "#058b46",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    boxShadow: "0 10px 22px rgba(7, 193, 96, 0.20)",
  },
  requestBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  requestBannerCopy: { flex: 1, minWidth: 0 },
  requestBannerTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  requestBannerText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  requestBannerAction: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  contactResults: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "#ffffff",
  },
  resultsLabel: {
    color: "#888888",
    fontWeight: "600",
    fontSize: 11,
    marginBottom: 4,
  },
  contactRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#dddddd",
  },
  contactCopy: { flex: 1, minWidth: 0 },
  contactMeta: { color: "#888888", fontSize: 12, marginTop: 2 },
  requestButton: {
    minWidth: 92,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#07c160",
    borderBottomWidth: 3,
    borderBottomColor: "#058b46",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  requestButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  acceptButton: {
    minWidth: 86,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#07c160",
    borderBottomWidth: 3,
    borderBottomColor: "#058b46",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
	  },
  requestActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rejectButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#ffccc7",
    alignItems: "center",
    justifyContent: "center",
  },
  requestCard: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#edf0ee",
    boxShadow: "0 5px 16px rgba(20, 35, 27, 0.05)",
  },
  requestNote: {
    color: "#66756c",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  list: { paddingHorizontal: 0, paddingBottom: 24 },
  row: {
    minHeight: 92,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#eef2f6",
  },
  avatarWrap: { width: 51, height: 51 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#dff4e7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#07934a", fontSize: 18, fontWeight: "700" },
  online: {
    position: "absolute",
    right: 0,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#07c160",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  rowCopy: { flex: 1, minWidth: 0, justifyContent: "center", gap: 6 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowMore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 },
  personName: { color: "#111111", fontSize: 18, fontWeight: "700" },
  time: { color: "#667085", fontSize: 13, fontWeight: "500" },
  preview: { color: "#667085", fontSize: 15, flex: 1, lineHeight: 20 },
  previewUnread: { color: "#333333", fontWeight: "500" },
  requestPill: {
    height: 23,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: "#eaf8ef",
    borderWidth: 1,
    borderColor: "#cbedd8",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  requestPillText: { color: "#078f4a", fontSize: 10, fontWeight: "800" },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#07c160",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 10,
  },
  emptyCard: {
    width: "100%",
    maxWidth: 360,
    padding: 26,
    borderRadius: 26,
    backgroundColor: "#f0faf3",
    borderWidth: 2,
    borderColor: "#d1f0dc",
    borderBottomWidth: 7,
    borderBottomColor: "#b5e4c7",
    alignItems: "center",
    boxShadow: "0 12px 22px rgba(7, 112, 58, 0.10)",
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  startButton: {
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: "#07c160",
    borderBottomWidth: 4,
    borderBottomColor: "#058b46",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  startButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  centerText: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  errorTitle: {
    color: "#111111",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  retry: {
    marginTop: 6,
    backgroundColor: "#07c160",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryText: { color: "#FFFFFF", fontWeight: "600" },
  conversationScreen: { backgroundColor: "#ebe7df" },
  conversationHeader: {
    minHeight: 60,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#cfcfcf",
    backgroundColor: "#ffffff",
  },
  headerInfo: { flex: 1, minWidth: 0 },
  presence: { color: "#888888", fontSize: 12, marginTop: 2 },
  callControl: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f4f4f4",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingShareCard: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ccebd7",
    backgroundColor: "#effaf3",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pendingShareCopy: { flex: 1, minWidth: 0 },
  pendingShareEyebrow: {
    color: "#078f4a",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  pendingShareText: {
    color: "#33443a",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  pendingShareAuthor: { color: "#173c28", fontWeight: "800" },
  pendingShareButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#07c160",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pendingShareButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  messageList: { padding: 16, paddingBottom: 24, gap: 8 },
  messageWrap: { alignItems: "flex-start" },
  mineWrap: { alignItems: "flex-end" },
  message: {
    maxWidth: "82%",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10,
    elevation: 2,
  },
  mine: { backgroundColor: "#12d39b" },
  theirs: { backgroundColor: "#ffffff" },
  messageText: { color: "#111111", fontSize: 16, lineHeight: 24 },
  stickerMessage: { paddingHorizontal: 4, paddingVertical: 2 },
  transparentMessage: { backgroundColor: "transparent" },
  stickerText: {
    fontSize: 42,
    lineHeight: 54,
    textShadowColor: "rgba(0,0,0,0.10)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  mineText: { color: "#111111" },
  sharedPost: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: "#d5d5d5",
    paddingBottom: 8,
  },
  sharedPostMine: { borderColor: "#72ce52" },
  sharedBy: {
    color: "#576b95",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 3,
  },
  sharedCaption: { color: "#111111", fontSize: 14, lineHeight: 19 },
  messageTime: {
    marginTop: 4,
    color: "#999999",
    fontSize: 11,
    alignSelf: "flex-end",
  },
  mineTime: { color: "rgba(255,255,255,0.86)" },
  reactionPill: {
    marginTop: 4,
    marginLeft: 10,
    minWidth: 34,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  reactionPillMine: { marginLeft: 0, marginRight: 10 },
  reactionPillText: { fontSize: 14 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#d3d7de",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  composerAccessory: {
    width: 36,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  inputShell: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: "#f2f4f7",
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  inputAccessory: {
    width: 42,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  composerInput: {
    flex: 1,
    maxHeight: 112,
    minHeight: 50,
    backgroundColor: "transparent",
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 12,
    color: "#111111",
    fontSize: 16,
  },
  payButton: {
    minWidth: 58,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#9333ea",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  payButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  sendButton: {
    width: 44,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#07c160",
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { backgroundColor: "#b9d9c4" },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 18, 15, 0.42)",
    justifyContent: "flex-end",
  },
  stickerSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 30,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d9dedb",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetTitle: { color: "#111111", fontSize: 20, fontWeight: "800" },
  sheetSubtitle: { color: "#7b8580", fontSize: 13, marginTop: 2 },
  sheetClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f1f6f3",
    alignItems: "center",
    justifyContent: "center",
  },
  stickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  stickerTile: {
    width: "22%",
    minWidth: 68,
    aspectRatio: 1,
    borderRadius: 20,
    backgroundColor: "#f1faf4",
    borderWidth: 1,
    borderColor: "#d7f0df",
    alignItems: "center",
    justifyContent: "center",
  },
  stickerTileText: { fontSize: 32 },
  actionSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    paddingBottom: 30,
    gap: 4,
  },
  reactionTray: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  reactionOption: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  reactionOptionText: { fontSize: 22 },
  actionPreview: {
    color: "#66716b",
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  actionRow: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionText: { color: "#172235", fontSize: 16, fontWeight: "600" },
  disabledAction: { opacity: 0.45 },
  callScreen: { flex: 1, backgroundColor: "#101916" },
  remoteVideo: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#101916",
  },
  callIdentity: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  callAvatar: {
    width: 112,
    height: 112,
    borderRadius: 40,
    backgroundColor: "#07c160",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 18px 44px rgba(7,193,96,0.28)",
  },
  callAvatarText: { color: "#ffffff", fontSize: 38, fontWeight: "800" },
  callName: { color: "#ffffff", fontSize: 25, fontWeight: "800", marginTop: 22 },
  callStatus: { color: "#adbbb4", fontSize: 15, marginTop: 8, textAlign: "center" },
  callControls: {
    minHeight: 122,
    backgroundColor: "#101916",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  callButtonWrap: { alignItems: "center", width: 72, gap: 7 },
  callButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#33413b",
    alignItems: "center",
    justifyContent: "center",
  },
  callButtonDanger: { backgroundColor: "#ed3f4f" },
  callButtonSuccess: { backgroundColor: "#07c160" },
  callButtonLabel: { color: "#e8efeb", fontSize: 11, textAlign: "center" },
  businessWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  businessCard: {
    borderRadius: 28,
    backgroundColor: "#f4fbf6",
    borderWidth: 1,
    borderColor: "#daf2e0",
    padding: 24,
    alignItems: "center",
  },
  businessIcon: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  businessTitle: {
    color: "#111827",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  businessText: {
    color: "#667085",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
  },
  businessButton: {
    marginTop: 18,
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  businessButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
});
