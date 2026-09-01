import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useVideoPlayer, VideoView } from "expo-video";
import EmojiPicker, { type EmojiType } from "rn-emoji-keyboard";
import {
  ActivityIndicator,
  Alert,
  type AlertButton,
  FlatList,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Camera,
  Copy,
  FileText,
  Ellipsis,
  MessageCircle,
  MicOff,
  Phone,
  Plus,
  ImageIcon,
  MapPin,
  Reply,
  QrCode,
  Search,
  Send,
  Settings,
  Share2,
  Store,
  UserPlus,
  UserRound,
  UsersRound,
  Video,
  X,
} from "lucide-react-native";

import { unconfiguredCallAdapter } from "./callAdapter";
import DocumentScannerModal, {
  type ScannedDocumentPage,
} from "./DocumentScannerModal";
import SafeLinkText from "./SafeLinkText";
import {
  normalizeChatMedia,
  normalizeImagePickerDurationMs,
  readWebMediaBlob,
} from "./chatMediaUtils";
import {
  CURRENT_USER_ID,
  type CallAdapter,
  type CallKind,
  type ChatContact,
  type ChatDataSource,
  type ChatAttachment,
  type ChatMessage,
  type Conversation,
  type MessageReaction,
  type OrderChatEvidence,
  type SharedPost,
} from "./types";

type Props = {
  dataSource?: ChatDataSource;
  callAdapter?: CallAdapter;
  onBack?: () => void;
  onBusinessSearch?: () => void;
  onViewStore?: (slug: string) => void;
  onViewOrder?: (orderId: string) => void;
  onViewProfile?: (profileId: string) => void;
  onOpenChatDetails?: (conversationId: string) => void;
  viewer?: ChatContact | null;
  onOpenOwnProfile?: () => void;
  onOpenQr?: () => void;
  initialConversationId?: string;
  sharedPost?: SharedPost;
  onShareComplete?: () => void;
};
type LoadState = "loading" | "ready" | "error";
type ChatListFilter = "all" | "unread" | "requests" | "archived";
type PendingChatAttachment = {
  uri: string;
  webFile?: Blob;
  filename: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  source: "camera_capture" | "gallery" | "document_picker" | "document_scan";
};

const readLocalMediaBytes = async (
  uri: string,
  unavailableMessage: string,
  webFile?: Blob,
) => {
  if (Platform.OS !== "web") {
    const file = new ExpoFile(uri);
    if (!file.exists) throw new Error(unavailableMessage);
    return file.arrayBuffer();
  }

  if (webFile) return readWebMediaBlob(webFile);

  const response = await fetch(uri);
  if (!response.ok) throw new Error(unavailableMessage);
  return response.arrayBuffer();
};

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
    throw new Error(
      "Sign in with a real Supabase account to react to messages.",
    );
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
const formatCaptureTimestamp = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(date))
    .replace(",", " •");
const trustedCaptureLabel = (mimeType: string, capturedAt: string) =>
  `${mimeType.startsWith("video/") ? "TRUE VIDEO" : "TRUE PHOTO"} • ${formatCaptureTimestamp(capturedAt)}`;
// Storage signed URLs are deliberately short lived and can be regenerated on
// every background refresh. They are not a message change, so including them
// in the comparison causes a needless list replacement (and a scroll jump).
const messageRefreshSignature = (messages: ChatMessage[]) =>
  JSON.stringify(messages, (key, value) =>
    key === "signedUrl" ? undefined : value,
  );
const sortMessagesByCreatedAt = (messages: ChatMessage[]) =>
  [...messages].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
const formatMinor = (value: number, currency = "INR") =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
const DEFAULT_CHAT_WALLPAPER = require("../../../assets/images/chat-doodle-wallpaper.webp");
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
  onViewStore,
  onViewOrder,
  onViewProfile,
  onOpenChatDetails,
  viewer,
  onOpenOwnProfile,
  onOpenQr,
  initialConversationId,
  sharedPost,
  onShareComplete,
}: Props) {
  const { width } = useWindowDimensions();
  const desktopConversation = Platform.OS === "web" && width >= 1024;
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
  const [groupOpen, setGroupOpen] = useState(false);
  const [selectedShareIds, setSelectedShareIds] = useState<string[]>([]);
  const [sharingPost, setSharingPost] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [segment, setSegment] = useState<"personal" | "business">("personal");
  const [listFilter, setListFilter] = useState<ChatListFilter>("all");
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const selectedRef = useRef<Conversation | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const hasLoadedOnceRef = useRef(false);
  const loadSeqRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownRequestSignatureRef = useRef<string | null>(null);
  const initialConversationOpenedRef = useRef(false);
  const messageSignatureRef = useRef("");
  const selectedRefreshInFlightRef = useRef(false);

  const replaceMessagesIfChanged = useCallback((next: ChatMessage[]) => {
    const signature = messageRefreshSignature(next);
    if (signature === messageSignatureRef.current) return;
    messageSignatureRef.current = signature;
    setMessages(next);
  }, []);

  const appendSentMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => {
      const next = sortMessagesByCreatedAt([
        ...current.filter((item) => item.id !== message.id),
        message,
      ]);
      messageSignatureRef.current = messageRefreshSignature(next);
      return next;
    });
    setSelected((current) =>
      current && current.id === message.conversationId
        ? { ...current, lastMessage: message, updatedAt: message.createdAt }
        : current,
    );
  }, []);

  const loadConversations = useCallback(
    async (mode: "initial" | "refresh" | "silent" = "refresh") => {
      const loadId = ++loadSeqRef.current;
      const shouldBlock =
        mode === "initial" &&
        !hasLoadedOnceRef.current &&
        conversationsRef.current.length === 0;
      try {
        setError(null);
        if (shouldBlock) setState("loading");
        else if (mode === "refresh") setIsRefreshing(true);
        const next = await dataSource.listConversations();
        if (loadId !== loadSeqRef.current) return;
        conversationsRef.current = next;
        setConversations(next);
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
        setState("ready");
      } catch (caughtError) {
        const detail =
          caughtError instanceof Error && caughtError.message.trim()
            ? ` ${caughtError.message}`
            : "";
        if (
          !hasLoadedOnceRef.current &&
          conversationsRef.current.length === 0
        ) {
          setError(
            `Chats could not be loaded from this device. Please try again.${detail}`,
          );
          setState("error");
        } else {
          setError(
            `Chats could not be refreshed. Showing your latest loaded conversations.${detail}`,
          );
        }
      } finally {
        if (loadId === loadSeqRef.current) setIsRefreshing(false);
      }
    },
    [dataSource],
  );

  const openConversation = useCallback(
    async (conversation: Conversation) => {
      setSelected(conversation);
      messageSignatureRef.current = "";
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
        replaceMessagesIfChanged(
          await dataSource.listMessages(conversation.id),
        );
        setState("ready");
      } catch {
        setError(
          "Messages could not be loaded. Your existing messages are safe on this device.",
        );
        setState("error");
      }
    },
    [dataSource, replaceMessagesIfChanged],
  );

  const refreshSelectedMessages = useCallback(
    async (conversationId: string) => {
      if (selectedRefreshInFlightRef.current) return;
      selectedRefreshInFlightRef.current = true;
      try {
        const next = await dataSource.listMessages(conversationId);
        if (selectedRef.current?.id === conversationId) {
          replaceMessagesIfChanged(next);
        }
        setState("ready");
      } catch {
        setError(
          "Messages could not be refreshed. Check your connection and try again.",
        );
      } finally {
        selectedRefreshInFlightRef.current = false;
        // A refresh fetches the latest complete message list. Subsequent realtime
        // signals are debounced and only replace the list when its content changed.
      }
    },
    [dataSource, replaceMessagesIfChanged],
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
    else void loadConversations("silent");
  }, [loadConversations, refreshSelectedMessages]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(runRealtimeRefresh, 450);
  }, [runRealtimeRefresh]);

  useEffect(() => {
    void loadConversations("initial");
  }, [loadConversations]);
  useEffect(() => {
    if (
      !initialConversationId ||
      initialConversationOpenedRef.current ||
      !hasLoadedOnce
    )
      return;
    initialConversationOpenedRef.current = true;
    const initialConversation = conversations.find(
      (conversation) => conversation.id === initialConversationId,
    );
    if (initialConversation) {
      setSegment(
        initialConversation.kind === "business" ? "business" : "personal",
      );
      void openConversation(initialConversation);
      return;
    }

    if (!dataSource.getConversation) {
      setError(
        "This conversation is unavailable or you no longer have access.",
      );
      setState("error");
      return;
    }

    let active = true;
    setState("loading");
    void dataSource
      .getConversation(initialConversationId)
      .then((directConversation) => {
        if (!active) return;
        if (!directConversation) {
          setError(
            "This conversation is unavailable or you no longer have access.",
          );
          setState("error");
          return;
        }
        conversationsRef.current = [
          directConversation,
          ...conversationsRef.current.filter(
            (conversation) => conversation.id !== directConversation.id,
          ),
        ];
        setConversations(conversationsRef.current);
        setSegment(
          directConversation.kind === "business" ? "business" : "personal",
        );
        void openConversation(directConversation);
      })
      .catch(() => {
        if (!active) return;
        setError(
          "This conversation is unavailable or you no longer have access.",
        );
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [
    conversations,
    dataSource,
    hasLoadedOnce,
    initialConversationId,
    openConversation,
  ]);
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
        return segment === "business"
          ? kind === "business"
          : kind !== "business";
      }),
    [conversations, segment],
  );
  const shareableConversationIds = useMemo(
    () =>
      new Set(
        conversations
          .filter((conversation) => {
            const kind = conversation.kind ?? "personal";
            return (
              (kind === "personal" ||
                kind === "group" ||
                kind === "business") &&
              (!conversation.requestStatus ||
                conversation.requestStatus === "accepted")
            );
          })
          .map((conversation) => conversation.id),
      ),
    [conversations],
  );
  const filtered = useMemo(() => {
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
  }, [listFilter, query, segmentConversations]);
  const visibleSegmentConversations = useMemo(
    () =>
      segmentConversations.filter((conversation) => !conversation.isArchived),
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
    () =>
      incomingRequests
        .map((request) => request.id)
        .sort()
        .join("|"),
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
      if (conversation.unreadCount > 0)
        await dataSource.markConversationRead(conversation.id);
      else if (dataSource.markConversationUnread)
        await dataSource.markConversationUnread(conversation.id);
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
        {
          text: "Accept",
          onPress: () => void acceptIncomingRequest(conversation),
        },
        {
          text: "Reject",
          style: "destructive",
          onPress: () => void rejectIncomingRequest(conversation),
        },
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
          text:
            conversation.unreadCount > 0 ? "Mark as read" : "Mark as unread",
          onPress: () => void toggleReadState(conversation),
        },
        {
          text: conversation.isArchived ? "Unarchive" : "Archive",
          onPress: () => void archiveConversation(conversation),
        },
      );
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(
      conversation.participant.name,
      "Choose a chat action.",
      buttons,
    );
  };

  const sendSharedPost = async () => {
    if (!sharedPost || !selectedShareIds.length || sharingPost) return;
    setSharingPost(true);
    try {
      const eligibleIds = selectedShareIds.filter((conversationId) =>
        shareableConversationIds.has(conversationId),
      );
      if (!eligibleIds.length)
        throw new Error("Choose a personal, group, or business chat.");
      await Promise.all(
        eligibleIds.map((conversationId) =>
          dataSource.sendMessage({
            conversationId,
            text: `Shared a post from ${sharedPost.author}`,
            type: "shared_post",
            post: sharedPost,
          }),
        ),
      );
      setSelectedShareIds([]);
      onShareComplete?.();
      Alert.alert(
        "Post shared",
        `Sent to ${eligibleIds.length} chat${eligibleIds.length === 1 ? "" : "s"}.`,
      );
      await loadConversations("refresh");
    } catch (cause) {
      Alert.alert(
        "Post not shared",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    } finally {
      setSharingPost(false);
    }
  };

  if (selected)
    return (
      <View
        style={desktopConversation ? styles.desktopChatWorkspace : styles.fill}
      >
        {desktopConversation ? (
          <View style={styles.desktopChatRail}>
            <View style={styles.desktopChatRailHeader}>
              <Text style={styles.desktopChatRailTitle}>Chats</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start a new chat"
                onPress={() => setNewChatOpen(true)}
                style={styles.iconButton}
              >
                <Plus color="#ffffff" size={22} />
              </Pressable>
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ConversationRow
                  item={item}
                  busy={actioningId === item.id}
                  selected={item.id === selected.id}
                  onPress={() => void openConversation(item)}
                  onMore={() => showConversationActions(item)}
                />
              )}
            />
          </View>
        ) : null}
        <View style={styles.desktopConversationPane}>
          <ConversationView
            conversation={selected}
            messages={messages}
            state={state}
            error={error}
            dataSource={dataSource}
            callAdapter={callAdapter}
            viewer={viewer}
            sharedPost={sharedPost}
            onViewStore={onViewStore}
            onViewOrder={onViewOrder}
            onViewProfile={onViewProfile}
            onOpenChatDetails={onOpenChatDetails}
            onMessageSent={appendSentMessage}
            acceptRequest={async (conversationId) => {
              const accepted =
                await dataSource.acceptMessageRequest(conversationId);
              setSelected(accepted);
              return accepted;
            }}
            onBack={() => {
              if (initialConversationId && onBack) {
                onBack();
                return;
              }
              setSelected(null);
              setError(null);
              void loadConversations("refresh");
            }}
          />
        </View>
      </View>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open my profile"
            disabled={!onOpenOwnProfile}
            onPress={onOpenOwnProfile}
            style={styles.viewerAvatarButton}
          >
            <Avatar
              label={viewer?.avatarLabel ?? "M"}
              url={viewer?.avatarUrl}
              online={false}
            />
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
        <Text style={styles.summarySecondary}>{unreadMessages} unread</Text>
        <Text style={styles.summarySecondary}>
          {incomingRequests.length} requests
        </Text>
      </View>
      <View style={styles.filterRow}>
        {(
          [
            ["all", "All"],
            ["unread", "Unread"],
            ["requests", "Requests"],
            ["archived", "Archived"],
          ] as const
        ).map(([value, label]) => (
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
        <ErrorState
          message={error}
          retry={() => void loadConversations("initial")}
        />
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
              selected={selectedShareIds.includes(item.id)}
              onPress={() => {
                if (sharedPost) {
                  if (!shareableConversationIds.has(item.id)) return;
                  if (item.requestStatus && item.requestStatus !== "accepted")
                    return;
                  setSelectedShareIds((current) =>
                    current.includes(item.id)
                      ? current.filter((id) => id !== item.id)
                      : [...current, item.id],
                  );
                  return;
                }
                void openConversation(item);
              }}
              onMore={() => showConversationActions(item)}
            />
          )}
        />
      )}
      {sharedPost ? (
        <View style={styles.multiShareBar}>
          <Text style={styles.multiShareCount}>
            {selectedShareIds.length} selected
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send post to selected chats"
            disabled={!selectedShareIds.length || sharingPost}
            onPress={() => void sendSharedPost()}
            style={[
              styles.multiShareButton,
              (!selectedShareIds.length || sharingPost) &&
                styles.disabledAction,
            ]}
          >
            {sharingPost ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Send color="#ffffff" size={18} />
            )}
            <Text style={styles.multiShareButtonText}>Send</Text>
          </Pressable>
        </View>
      ) : null}
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
        openNewGroup={() => {
          setToolsOpen(false);
          setGroupOpen(true);
        }}
        openQr={() => {
          setToolsOpen(false);
          onOpenQr?.();
        }}
      />
      <NewGroupModal
        visible={groupOpen}
        dataSource={dataSource}
        close={() => setGroupOpen(false)}
        created={(conversation) => {
          setGroupOpen(false);
          setSegment("personal");
          setConversations((current) => [
            conversation,
            ...current.filter((item) => item.id !== conversation.id),
          ]);
          void openConversation(conversation);
        }}
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
  viewer,
  sharedPost,
  onViewStore,
  onViewOrder,
  onViewProfile,
  onOpenChatDetails,
  onMessageSent,
  acceptRequest,
  onBack,
}: {
  conversation: Conversation;
  messages: ChatMessage[];
  state: LoadState;
  error: string | null;
  dataSource: ChatDataSource;
  callAdapter: CallAdapter;
  viewer?: ChatContact | null;
  sharedPost?: SharedPost;
  onViewStore?: (slug: string) => void;
  onViewOrder?: (orderId: string) => void;
  onViewProfile?: (profileId: string) => void;
  onOpenChatDetails?: (conversationId: string) => void;
  onMessageSent: (message: ChatMessage) => void;
  onVotePoll?: (pollId: string, optionId: string) => void;
  onRsvpEvent?: (
    eventId: string,
    response: "going" | "maybe" | "declined",
  ) => void;
  acceptRequest: (conversationId: string) => Promise<Conversation>;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const contextDrawerDesktop = Platform.OS === "web" && width >= 900;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [reactionPendingId, setReactionPendingId] = useState<string | null>(
    null,
  );
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingChatAttachment | null>(null);
  const [attachmentSending, setAttachmentSending] = useState(false);
  const [attachmentStage, setAttachmentStage] = useState<
    "preparing" | "uploading" | "finalizing"
  >("preparing");
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ChatContact[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [structuredPending, setStructuredPending] = useState(false);
  const [evidenceTarget, setEvidenceTarget] = useState<{
    orderId: string;
    orderItemId?: string;
    returnRequestId?: string;
    title: string;
    kind: "packing" | "unboxing" | "return";
  } | null>(null);
  const [returnTarget, setReturnTarget] = useState<{
    orderItemId: string;
    title: string;
  } | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnDetails, setReturnDetails] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [viewingEvidence, setViewingEvidence] =
    useState<OrderChatEvidence | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<{
    attachment: ChatAttachment;
    createdAt: string;
    trusted: boolean;
  } | null>(null);
  const [commerceActionPending, setCommerceActionPending] = useState(false);
  const [groupMembersOpen, setGroupMembersOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState<
    "neutral" | "sky" | "forest" | "warm" | "paper"
  >("neutral");
  const [wallpaperImageUrl, setWallpaperImageUrl] = useState<string | null>(
    null,
  );
  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const [wallpaperSaving, setWallpaperSaving] = useState(false);
  const [wallpaperFeedback, setWallpaperFeedback] = useState<string | null>(
    null,
  );
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [contextDetail, setContextDetail] = useState<
    | { kind: "order"; id: string }
    | { kind: "user"; id: string }
    | { kind: "chat"; id: string }
    | null
  >(null);
  const list = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    let active = true;
    setWallpaper("neutral");
    setWallpaperImageUrl(null);
    setWallpaperFeedback(null);
    void dataSource
      .getWallpaper?.(conversation.id)
      .then((saved) => {
        if (!active || !saved) return;
        setWallpaper(saved.style);
        setWallpaperImageUrl(saved.imageUrl ?? null);
      })
      .catch(() => active && setWallpaper("neutral"));
    return () => {
      active = false;
    };
  }, [conversation.id, dataSource]);

  useEffect(() => {
    if (!contactOpen || contactQuery.trim().length < 2) {
      setContactResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setContactLoading(true);
      void dataSource
        .searchContacts(contactQuery)
        .then((results) => active && setContactResults(results))
        .catch(() => active && setContactResults([]))
        .finally(() => active && setContactLoading(false));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [contactOpen, contactQuery, dataSource]);

  const captureMedia = async (
    source: "camera_capture" | "document_scan" = "camera_capture",
  ) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted)
        throw new Error("Camera permission is required.");
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes:
          source === "document_scan" ? ["images"] : ["images", "videos"],
        allowsEditing: source === "document_scan",
        quality: 0.84,
        videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const kind =
        asset.type === "video" || asset.mimeType?.startsWith("video/")
          ? "video"
          : "image";
      const normalized = normalizeChatMedia({
        filename: asset.fileName,
        mimeType: asset.mimeType,
        kind,
        fallbackStem: `${source === "document_scan" ? "scan" : "capture"}-${Date.now()}`,
      });
      const durationMs = normalizeImagePickerDurationMs(
        asset.duration,
        Platform.OS === "web" ? "web" : "native",
      );
      if (__DEV__)
        console.info("[chat-attachment] Camera asset ready", {
          platform: Platform.OS,
          browser:
            Platform.OS === "web" && typeof navigator !== "undefined"
              ? navigator.userAgent
              : undefined,
          source,
          assetType: asset.type,
          payloadType: asset.file?.constructor.name ?? "native-uri",
          reportedFilename: asset.fileName,
          reportedMimeType: asset.mimeType,
          reportedSize: asset.fileSize,
          reportedDuration: asset.duration,
          normalizedFilename: normalized.filename,
          normalizedMimeType: normalized.mimeType,
          normalizedDurationMs: durationMs,
          lastModified: asset.file?.lastModified,
        });
      setAttachmentMenuOpen(false);
      setAttachmentError(null);
      setPendingAttachment({
        uri: asset.uri,
        webFile: asset.file,
        filename: normalized.filename,
        mimeType: normalized.mimeType,
        size: asset.fileSize,
        width: asset.width,
        height: asset.height,
        durationMs,
        source,
      });
    } catch (cause) {
      Alert.alert(
        "Camera unavailable",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  const pickGallery = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error("Photo library permission is required.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.84,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const kind =
        asset.type === "video" || asset.mimeType?.startsWith("video/")
          ? "video"
          : "image";
      const normalized = normalizeChatMedia({
        filename: asset.fileName,
        mimeType: asset.mimeType,
        kind,
        fallbackStem: `gallery-${Date.now()}`,
      });
      const durationMs = normalizeImagePickerDurationMs(
        asset.duration,
        Platform.OS === "web" ? "web" : "native",
      );
      if (__DEV__)
        console.info("[chat-attachment] Gallery asset ready", {
          platform: Platform.OS,
          payloadType: asset.file?.constructor.name ?? "native-uri",
          reportedFilename: asset.fileName,
          reportedMimeType: asset.mimeType,
          reportedSize: asset.fileSize,
          reportedDuration: asset.duration,
          normalizedFilename: normalized.filename,
          normalizedMimeType: normalized.mimeType,
          normalizedDurationMs: durationMs,
          lastModified: asset.file?.lastModified,
        });
      setAttachmentMenuOpen(false);
      setAttachmentError(null);
      setPendingAttachment({
        uri: asset.uri,
        webFile: asset.file,
        filename: normalized.filename,
        mimeType: normalized.mimeType,
        size: asset.fileSize,
        width: asset.width,
        height: asset.height,
        durationMs,
        source: "gallery",
      });
    } catch (cause) {
      Alert.alert(
        "Gallery unavailable",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  const submitOrderEvidence = async (
    source: "live_capture" | "uploaded_file",
  ) => {
    if (!evidenceTarget || commerceActionPending) return;
    if (
      !dataSource.submitOrderEvidence &&
      !(
        evidenceTarget.kind === "unboxing" &&
        evidenceTarget.orderItemId &&
        dataSource.submitUnboxingEvidence
      )
    )
      return;
    try {
      const permission =
        source === "live_capture"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          source === "live_capture"
            ? "Camera permission is required."
            : "Photo library permission is required.",
        );
      const result =
        source === "live_capture"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images", "videos"],
              quality: 0.84,
              videoMaxDuration: 60,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images", "videos"],
              quality: 0.84,
            });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const bytes = await readLocalMediaBytes(
        asset.uri,
        "The selected evidence could not be read.",
        asset.file,
      );
      setCommerceActionPending(true);
      const normalized = normalizeChatMedia({
        filename: asset.fileName,
        mimeType: asset.mimeType,
        kind:
          asset.type === "video" || asset.mimeType?.startsWith("video/")
            ? "video"
            : "image",
        fallbackStem: `${evidenceTarget.kind}-${source === "live_capture" ? "live" : "upload"}-${Date.now()}`,
      });
      if (dataSource.submitOrderEvidence) {
        await dataSource.submitOrderEvidence({
          orderId: evidenceTarget.orderId,
          orderItemId: evidenceTarget.orderItemId,
          returnRequestId: evidenceTarget.returnRequestId,
          kind: evidenceTarget.kind,
          bytes,
          filename: normalized.filename,
          mimeType: normalized.mimeType,
          source,
        });
      } else if (
        evidenceTarget.orderItemId &&
        dataSource.submitUnboxingEvidence
      ) {
        await dataSource.submitUnboxingEvidence({
          orderId: evidenceTarget.orderId,
          orderItemId: evidenceTarget.orderItemId,
          bytes,
          filename: normalized.filename,
          mimeType: normalized.mimeType,
          source,
        });
      }
      setEvidenceTarget(null);
      Alert.alert(
        "Evidence submitted",
        source === "live_capture"
          ? "Private live-capture evidence is attached to this order."
          : "Your private uploaded file is attached to this order.",
      );
    } catch (cause) {
      Alert.alert(
        "Evidence not submitted",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    } finally {
      setCommerceActionPending(false);
    }
  };

  const submitReturnFromChat = async () => {
    if (!returnTarget || !dataSource.submitOrderReturn || commerceActionPending)
      return;
    if (!returnReason.trim()) {
      Alert.alert(
        "Return reason required",
        "Tell the seller why this item is being returned.",
      );
      return;
    }
    setCommerceActionPending(true);
    try {
      await dataSource.submitOrderReturn({
        orderItemId: returnTarget.orderItemId,
        reason: returnReason,
        details: returnDetails,
      });
      setReturnTarget(null);
      setReturnReason("");
      setReturnDetails("");
      Alert.alert(
        "Return requested",
        "The request is now available for the seller to review.",
      );
    } catch (cause) {
      Alert.alert(
        "Return not submitted",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    } finally {
      setCommerceActionPending(false);
    }
  };

  const reviewReturnFromChat = async (
    returnRequestId: string,
    decision: "approved" | "rejected" | "under_review",
  ) => {
    if (!dataSource.reviewOrderReturn || commerceActionPending) return;
    setCommerceActionPending(true);
    try {
      await dataSource.reviewOrderReturn({
        returnRequestId,
        decision,
        reason:
          decision === "under_review"
            ? "Please provide more information in this Business Chat."
            : undefined,
      });
      Alert.alert(
        decision === "approved"
          ? "Return approved"
          : decision === "rejected"
            ? "Return rejected"
            : "More information requested",
        decision === "under_review"
          ? "The buyer can reply in this Business Chat with the additional information."
          : "The buyer and commission status have been updated.",
      );
    } catch (cause) {
      Alert.alert(
        "Return not updated",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    } finally {
      setCommerceActionPending(false);
    }
  };

  const pickDocument = async (includeImages = false) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: includeImages
          ? ["application/pdf", "image/*"]
          : [
              "application/pdf",
              "text/plain",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setAttachmentMenuOpen(false);
      setAttachmentError(null);
      setPendingAttachment({
        uri: asset.uri,
        filename: asset.name,
        mimeType: asset.mimeType || "application/pdf",
        size: asset.size,
        source: "document_picker",
      });
    } catch (cause) {
      Alert.alert(
        "Document unavailable",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  const scanDocument = async () => {
    setAttachmentMenuOpen(false);
    setScannerOpen(true);
  };

  const confirmScannedDocument = (page: ScannedDocumentPage) => {
    setScannerOpen(false);
    setAttachmentError(null);
    setPendingAttachment({ ...page, source: "document_scan" });
  };

  const sendPendingAttachment = async () => {
    if (!pendingAttachment || !dataSource.sendAttachment || attachmentSending)
      return;
    setAttachmentSending(true);
    setAttachmentStage("preparing");
    setAttachmentError(null);
    try {
      const bytes = pendingAttachment.webFile
        ? new Blob([pendingAttachment.webFile], {
            type: pendingAttachment.mimeType,
          })
        : await readLocalMediaBytes(
            pendingAttachment.uri,
            "The selected file could not be read.",
          );
      const byteLength =
        bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.size;
      if (!byteLength)
        throw new Error("The selected file is empty. Please select it again.");
      if (byteLength > 104_857_600)
        throw new Error("Attachment must be 100 MiB or smaller.");
      await dataSource.sendAttachment({
        conversationId: conversation.id,
        bytes,
        filename: pendingAttachment.filename,
        mimeType: pendingAttachment.mimeType,
        width: pendingAttachment.width,
        height: pendingAttachment.height,
        durationMs: pendingAttachment.durationMs,
        source: pendingAttachment.source,
        onStage: setAttachmentStage,
      });
      setPendingAttachment(null);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Retry when your connection is restored.";
      if (__DEV__) console.error("[chat-attachment] Send failed", cause);
      setAttachmentError(message);
      if (Platform.OS !== "web") Alert.alert("Attachment not sent", message);
    } finally {
      setAttachmentSending(false);
    }
  };

  const shareLocation = async () => {
    if (!dataSource.sendLocation) return;
    try {
      setAttachmentMenuOpen(false);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error("Foreground location permission is required.");
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? undefined,
        capturedAt: new Date(position.timestamp).toISOString(),
      };
      Alert.alert(
        "Share current location?",
        `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Send",
            onPress: () =>
              void dataSource
                .sendLocation?.({ conversationId: conversation.id, location })
                .catch((cause) =>
                  Alert.alert(
                    "Location not sent",
                    cause instanceof Error ? cause.message : "Please retry.",
                  ),
                ),
          },
        ],
      );
    } catch (cause) {
      Alert.alert(
        "Location unavailable",
        cause instanceof Error
          ? cause.message
          : "This browser/device does not support current location.",
      );
    }
  };

  const shareContact = async (contact: ChatContact) => {
    if (!dataSource.sendContact) return;
    try {
      setContactLoading(true);
      await dataSource.sendContact({
        conversationId: conversation.id,
        profileId: contact.id,
      });
      setContactOpen(false);
      setContactQuery("");
    } catch (cause) {
      Alert.alert(
        "Contact not sent",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    } finally {
      setContactLoading(false);
    }
  };

  const createPoll = async (question: string, options: string[]) => {
    if (!dataSource.createPoll) return;
    setStructuredPending(true);
    try {
      await dataSource.createPoll({
        conversationId: conversation.id,
        question,
        options,
      });
      setPollOpen(false);
    } catch (cause) {
      Alert.alert(
        "Poll not created",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    } finally {
      setStructuredPending(false);
    }
  };

  const createEvent = async (input: {
    title: string;
    startsAt: string;
    location?: string;
    description?: string;
  }) => {
    if (!dataSource.createEvent) return;
    setStructuredPending(true);
    try {
      await dataSource.createEvent({
        conversationId: conversation.id,
        ...input,
      });
      setEventOpen(false);
    } catch (cause) {
      Alert.alert(
        "Event not created",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    } finally {
      setStructuredPending(false);
    }
  };

  const votePoll = async (pollId: string, optionId: string) => {
    try {
      await dataSource.votePoll?.(pollId, optionId);
    } catch (cause) {
      Alert.alert(
        "Vote not saved",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    }
  };

  const rsvpEvent = async (
    eventId: string,
    response: "going" | "maybe" | "declined",
  ) => {
    try {
      await dataSource.rsvpEvent?.(eventId, response);
    } catch (cause) {
      Alert.alert(
        "RSVP not saved",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    }
  };

  const keepMemo = async () => {
    if (!visibleActionMessage || !dataSource.keepMemo) return;
    try {
      await dataSource.keepMemo(visibleActionMessage.id);
      setActionMessage(null);
      Alert.alert(
        "Saved to Keep Memo",
        "This message is now a private note in Notes & Tasks.",
      );
    } catch (cause) {
      Alert.alert(
        "Memo not saved",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    }
  };

  const scheduleMessage = async (body: string, sendAt: string) => {
    if (!dataSource.scheduleMessage) return;
    setStructuredPending(true);
    try {
      await dataSource.scheduleMessage({
        conversationId: conversation.id,
        body,
        sendAt,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setScheduleOpen(false);
      Alert.alert(
        "Message scheduled",
        "The server will deliver it at the selected time, even if this app is closed.",
      );
    } catch (cause) {
      Alert.alert(
        "Message not scheduled",
        cause instanceof Error ? cause.message : "Please retry.",
      );
    } finally {
      setStructuredPending(false);
    }
  };

  const chooseVanishMode = () => {
    if (!dataSource.setVanishMode) return;
    setAttachmentMenuOpen(false);
    const setMode = (seconds: 86400 | 604800 | 2592000 | null) =>
      void dataSource
        .setVanishMode?.(conversation.id, seconds)
        .then(() =>
          Alert.alert(
            "Vanish Mode updated",
            seconds
              ? "Eligible user messages will disappear after the chosen duration. Commerce and system records never vanish."
              : "Vanish Mode is off.",
          ),
        )
        .catch((cause) =>
          Alert.alert(
            "Vanish Mode not updated",
            cause instanceof Error ? cause.message : "Please retry.",
          ),
        );
    Alert.alert(
      "Vanish Mode",
      "Screenshots and previously exported content cannot be prevented. Order, payment, fulfillment, return, refund, and system events never vanish.",
      [
        { text: "Off", onPress: () => setMode(null) },
        { text: "24 hours", onPress: () => setMode(86400) },
        { text: "7 days", onPress: () => setMode(604800) },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };
  const chooseWallpaper = () => {
    if (!dataSource.setWallpaper) return;
    setAttachmentMenuOpen(false);
    setWallpaperPickerOpen(true);
  };

  const applyWallpaper = async (
    style: "neutral" | "sky" | "forest" | "warm" | "paper",
  ) => {
    if (!dataSource.setWallpaper || wallpaperSaving) return;
    setWallpaperSaving(true);
    try {
      await dataSource.setWallpaper(conversation.id, style);
      setWallpaper(style);
      setWallpaperImageUrl(null);
      setWallpaperFeedback(
        `${style === "neutral" ? "Neutral" : style[0].toUpperCase() + style.slice(1)} wallpaper applied.`,
      );
      setWallpaperPickerOpen(false);
    } catch (cause) {
      setWallpaperFeedback(
        cause instanceof Error
          ? cause.message
          : "Wallpaper not updated. Please retry.",
      );
    } finally {
      setWallpaperSaving(false);
    }
  };

  const chooseWallpaperImage = async () => {
    if (!dataSource.setWallpaperImage || wallpaperSaving) return;
    setWallpaperSaving(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error("Photo library permission is required.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.75,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const bytes = await readLocalMediaBytes(
        asset.uri,
        "The wallpaper image could not be read.",
        asset.file,
      );
      const imageUrl = await dataSource.setWallpaperImage({
        conversationId: conversation.id,
        bytes,
        filename: asset.fileName || `wallpaper-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
      });
      setWallpaper("paper");
      setWallpaperImageUrl(imageUrl);
      setWallpaperFeedback("Image wallpaper applied.");
      setWallpaperPickerOpen(false);
    } catch (cause) {
      setWallpaperFeedback(
        cause instanceof Error
          ? cause.message
          : "Wallpaper not updated. Please retry.",
      );
    } finally {
      setWallpaperSaving(false);
    }
  };
  const send = async () => {
    if (conversation.requestStatus && conversation.requestStatus !== "accepted")
      return;
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);
    try {
      const sentMessage = await dataSource.sendMessage({
        conversationId: conversation.id,
        text,
      });
      onMessageSent(sentMessage);
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
  const hasDraft = Boolean(draft.trim());
  const composerLocked = Boolean(
    conversation.requestStatus && conversation.requestStatus !== "accepted",
  );
  const searchedMessages = useMemo(() => {
    const normalized = messageSearchQuery.trim().toLocaleLowerCase();
    if (!normalized) return messages;
    return messages.filter((message) =>
      message.text.toLocaleLowerCase().includes(normalized),
    );
  }, [messageSearchQuery, messages]);
  const visibleActionMessage = actionMessage
    ? (messages.find((message) => message.id === actionMessage.id) ??
      actionMessage)
    : null;
  const reactToMessage = async (emoji: string) => {
    const targetMessage = visibleActionMessage;
    if (!targetMessage || reactionPendingId) return;
    const currentReaction = targetMessage.reactions?.find(
      (reaction) => reaction.reactedByCurrentUser,
    );
    const nextReaction = currentReaction?.emoji === emoji ? null : emoji;
    setReactionPendingId(targetMessage.id);
    try {
      await dataSource.setMessageReaction(targetMessage.id, nextReaction);
      setActionMessage(null);
    } catch (cause) {
      Alert.alert(
        "Reaction not saved",
        cause instanceof Error
          ? cause.message
          : "Please check your connection and try again.",
      );
    } finally {
      setReactionPendingId(null);
    }
  };
  const startCall = async (kind: CallKind) => {
    if (
      conversation.requestStatus &&
      conversation.requestStatus !== "accepted"
    ) {
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
        callerName: viewer?.name,
        callerAvatarUrl: viewer?.avatarUrl || undefined,
        remoteName: conversation.participant.name,
        remoteAvatarUrl: conversation.participant.avatarUrl || undefined,
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
  useEffect(() => {
    list.current?.scrollToEnd({ animated: true });
  }, [messages.length]);
  const presenceLabel = conversation.storefront
    ? conversation.businessContext === "creator_seller"
      ? conversation.businessRole === "seller"
        ? "Creator commerce · Messages are private"
        : "Approved Seller · Messages are private"
      : conversation.businessRole === "seller"
        ? `Customer · ${conversation.storefront.name}`
        : `${conversation.storefront.verificationStatus === "approved" ? "Verified store" : "Store"} · Messages are private`
    : conversation.kind === "group"
      ? `${conversation.memberCount || 0} members · Messages are private`
      : conversation.participant.isOnline
        ? "online"
        : "Messages are private";
  const canOpenStoreFromHeader = Boolean(
    conversation.storefront &&
    onViewStore &&
    conversation.businessRole !== "seller",
  );
  const openHeaderDetails = () => {
    if (conversation.kind === "group") {
      setGroupMembersOpen(true);
      return;
    }
    if (conversation.kind === "personal") {
      setContextDetail({ kind: "chat", id: conversation.id });
    }
  };
  const headerIdentity = (
    <>
      <Text accessibilityRole="header" style={styles.personName}>
        {conversation.participant.name}
      </Text>
      <Text style={styles.presence}>{presenceLabel}</Text>
    </>
  );
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              conversation.kind === "group"
                ? "View group members"
                : conversation.kind === "personal"
                  ? `Open chat details for ${conversation.participant.name}`
                  : conversation.participant.name
            }
            disabled={Boolean(conversation.storefront)}
            onPress={openHeaderDetails}
          >
            <Avatar
              label={conversation.participant.avatarLabel}
              url={conversation.participant.avatarUrl}
              online={conversation.participant.isOnline}
            />
          </Pressable>
          {canOpenStoreFromHeader ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${conversation.storefront!.name} store catalog`}
              accessibilityHint="Opens the store and its product listings"
              onPress={() => onViewStore!(conversation.storefront!.slug)}
              style={({ pressed }) => [
                styles.headerInfo,
                styles.storefrontHeaderLink,
                pressed && styles.storefrontHeaderLinkPressed,
              ]}
            >
              {headerIdentity}
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={
                conversation.kind === "personal"
                  ? !onOpenChatDetails
                  : conversation.kind !== "group"
              }
              onPress={openHeaderDetails}
              style={styles.headerInfo}
            >
              {headerIdentity}
            </Pressable>
          )}
          {conversation.storefront && onViewStore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${conversation.storefront.name} storefront`}
              onPress={() => onViewStore(conversation.storefront!.slug)}
              style={styles.callControl}
            >
              <Store color="#078549" size={19} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search this conversation"
              onPress={() => setMessageSearchOpen(true)}
              style={styles.callControl}
            >
              <Search color="#475467" size={20} />
            </Pressable>
          )}
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
            onPress={() => setAttachmentMenuOpen(true)}
            style={styles.callControl}
          >
            <Ellipsis color="#475467" size={20} />
          </Pressable>
        </View>
        <ImageBackground
          source={
            wallpaperImageUrl
              ? { uri: wallpaperImageUrl }
              : DEFAULT_CHAT_WALLPAPER
          }
          resizeMode="cover"
          imageStyle={[
            styles.wallpaperImage,
            !wallpaperImageUrl && styles.defaultWallpaperImage,
          ]}
          style={[
            styles.wallpaperArea,
            wallpaperImageUrl && wallpaper === "sky" && styles.wallpaperSky,
            wallpaperImageUrl &&
              wallpaper === "forest" &&
              styles.wallpaperForest,
            wallpaperImageUrl && wallpaper === "warm" && styles.wallpaperWarm,
            wallpaperImageUrl && wallpaper === "paper" && styles.wallpaperPaper,
          ]}
        >
          {wallpaperFeedback ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.wallpaperFeedback}
            >
              <Text style={styles.wallpaperFeedbackText}>
                {wallpaperFeedback}
              </Text>
            </View>
          ) : null}
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
              renderItem={({ item, index }) => {
                const nextMessage = messages[index + 1];
                const showIncomingAvatar =
                  conversation.kind !== "group" &&
                  item.type !== "order_event" &&
                  item.senderId !== CURRENT_USER_ID &&
                  (!nextMessage ||
                    nextMessage.senderId !== item.senderId ||
                    nextMessage.type === "order_event");
                return (
                  <MessageBubble
                    message={item}
                    onLongPress={() => setActionMessage(item)}
                    reactions={item.reactions ?? []}
                    incomingAvatar={
                      showIncomingAvatar
                        ? {
                            label: conversation.participant.avatarLabel,
                            url: conversation.participant.avatarUrl,
                          }
                        : undefined
                    }
                    onViewOrder={(id) =>
                      setContextDetail({ kind: "order", id })
                    }
                    onViewProfile={(id) =>
                      setContextDetail({ kind: "user", id })
                    }
                    onVotePoll={(pollId, optionId) =>
                      void votePoll(pollId, optionId)
                    }
                    onRsvpEvent={(eventId, response) =>
                      void rsvpEvent(eventId, response)
                    }
                    onAddEvidence={(
                      orderId,
                      orderItemId,
                      title,
                      kind,
                      returnRequestId,
                    ) =>
                      setEvidenceTarget({
                        orderId,
                        orderItemId,
                        title,
                        kind,
                        returnRequestId,
                      })
                    }
                    onViewEvidence={setViewingEvidence}
                    onViewAttachment={(attachment) =>
                      setViewingAttachment({
                        attachment,
                        createdAt: item.createdAt,
                        trusted:
                          Boolean(conversation.storefront) &&
                          attachment.source === "camera_capture",
                      })
                    }
                    onRequestReturn={(orderItemId, title) => {
                      setReturnTarget({ orderItemId, title });
                      setReturnReason("");
                      setReturnDetails("");
                    }}
                    onReviewReturn={(returnRequestId, decision) =>
                      void reviewReturnFromChat(returnRequestId, decision)
                    }
                  />
                );
              }}
            />
          )}
        </ImageBackground>
        <View style={styles.composer}>
          <View style={styles.inputShell}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open attachment menu"
              disabled={composerLocked}
              accessibilityState={{ disabled: composerLocked }}
              onPress={() => setAttachmentMenuOpen(true)}
              style={[
                styles.inputAccessory,
                composerLocked && styles.disabledAction,
              ]}
            >
              <Plus color="#667085" size={22} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open emoji keyboard"
              onPress={() => setEmojiOpen(true)}
              style={styles.inputAccessory}
            >
              <MessageCircle color="#667085" size={20} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach camera media"
              disabled={composerLocked || !dataSource.sendAttachment}
              accessibilityState={{
                disabled: composerLocked || !dataSource.sendAttachment,
              }}
              onPress={() => void captureMedia()}
              style={[
                styles.inputAccessory,
                (composerLocked || !dataSource.sendAttachment) &&
                  styles.disabledAction,
              ]}
            >
              <Camera color="#667085" size={20} />
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
              onKeyPress={(event) => {
                if (Platform.OS !== "web") return;
                const nativeEvent =
                  event.nativeEvent as typeof event.nativeEvent & {
                    shiftKey?: boolean;
                    isComposing?: boolean;
                  };
                if (
                  nativeEvent.key !== "Enter" ||
                  nativeEvent.shiftKey ||
                  nativeEvent.isComposing
                )
                  return;
                (
                  event as typeof event & { preventDefault?: () => void }
                ).preventDefault?.();
                if (hasDraft && !sending) void send();
              }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hasDraft ? "Send message" : "Voice messages unavailable"
            }
            accessibilityState={{ disabled: sending || composerLocked }}
            disabled={sending || composerLocked}
            onPress={() =>
              hasDraft
                ? void send()
                : Alert.alert(
                    "Voice messages",
                    "Coming Soon. Text, images, videos, files and links are available now.",
                  )
            }
            style={[
              styles.sendButton,
              (sending || composerLocked) && styles.sendDisabled,
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
        <AttachmentMenu
          visible={attachmentMenuOpen}
          close={() => setAttachmentMenuOpen(false)}
          gallery={() => void pickGallery()}
          document={() => void pickDocument()}
          location={() => void shareLocation()}
          contact={() => {
            setAttachmentMenuOpen(false);
            setContactOpen(true);
          }}
          sticker={() => {
            setAttachmentMenuOpen(false);
            setStickersOpen(true);
          }}
          scan={() => void scanDocument()}
          poll={() => {
            setAttachmentMenuOpen(false);
            setPollOpen(true);
          }}
          event={() => {
            setAttachmentMenuOpen(false);
            setEventOpen(true);
          }}
          schedule={() => {
            setAttachmentMenuOpen(false);
            setScheduleOpen(true);
          }}
          vanish={chooseVanishMode}
          wallpaper={chooseWallpaper}
        />
        <WallpaperPicker
          visible={wallpaperPickerOpen}
          current={wallpaper}
          saving={wallpaperSaving}
          close={() => !wallpaperSaving && setWallpaperPickerOpen(false)}
          apply={(style) => void applyWallpaper(style)}
          chooseImage={() => void chooseWallpaperImage()}
        />
        <AttachmentPreview
          attachment={pendingAttachment}
          showTrustedCapture={Boolean(conversation.storefront)}
          sending={attachmentSending}
          stage={attachmentStage}
          error={attachmentError}
          cancel={() => {
            if (attachmentSending) return;
            setPendingAttachment(null);
            setAttachmentError(null);
          }}
          send={() => void sendPendingAttachment()}
        />
        <DocumentScannerModal
          visible={scannerOpen}
          close={() => setScannerOpen(false)}
          confirm={confirmScannedDocument}
        />
        <EvidenceViewer
          evidence={viewingEvidence}
          close={() => setViewingEvidence(null)}
        />
        <ChatMediaViewer
          media={viewingAttachment}
          close={() => setViewingAttachment(null)}
        />
        <ContactShareModal
          visible={contactOpen}
          query={contactQuery}
          setQuery={setContactQuery}
          contacts={contactResults}
          loading={contactLoading}
          close={() => {
            setContactOpen(false);
            setContactQuery("");
          }}
          share={(contact) => void shareContact(contact)}
        />
        <PollComposer
          visible={pollOpen}
          pending={structuredPending}
          close={() => setPollOpen(false)}
          submit={(question, options) => void createPoll(question, options)}
        />
        <EventComposer
          visible={eventOpen}
          pending={structuredPending}
          close={() => setEventOpen(false)}
          submit={(input) => void createEvent(input)}
        />
        <ScheduleComposer
          visible={scheduleOpen}
          pending={structuredPending}
          close={() => setScheduleOpen(false)}
          submit={(body, sendAt) => void scheduleMessage(body, sendAt)}
        />
        <UnboxingEvidenceModal
          target={evidenceTarget}
          pending={commerceActionPending}
          close={() => !commerceActionPending && setEvidenceTarget(null)}
          choose={(source) => void submitOrderEvidence(source)}
        />
        <ReturnRequestModal
          target={returnTarget}
          reason={returnReason}
          setReason={setReturnReason}
          details={returnDetails}
          setDetails={setReturnDetails}
          pending={commerceActionPending}
          close={() => !commerceActionPending && setReturnTarget(null)}
          submit={() => void submitReturnFromChat()}
        />
        <MessageActions
          message={visibleActionMessage}
          reacting={Boolean(reactionPendingId)}
          close={() => setActionMessage(null)}
          copy={() => void copyMessage()}
          reply={replyToMessage}
          react={(emoji) => void reactToMessage(emoji)}
          keepMemo={() => void keepMemo()}
        />
        <GroupMembersModal
          visible={groupMembersOpen}
          conversation={conversation}
          dataSource={dataSource}
          close={() => setGroupMembersOpen(false)}
          openProfile={(id) => {
            setGroupMembersOpen(false);
            onViewProfile?.(id);
          }}
        />
        <Modal
          visible={messageSearchOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMessageSearchOpen(false)}
        >
          <View style={styles.messageSearchBackdrop}>
            <View style={styles.messageSearchCard}>
              <View style={styles.messageSearchHeader}>
                <Text style={styles.messageSearchTitle}>
                  Search conversation
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close message search"
                  onPress={() => setMessageSearchOpen(false)}
                  style={styles.callControl}
                >
                  <X color="#475467" size={20} />
                </Pressable>
              </View>
              <View style={styles.searchBox}>
                <Search color="#728096" size={18} />
                <TextInput
                  autoFocus
                  value={messageSearchQuery}
                  onChangeText={setMessageSearchQuery}
                  placeholder="Search messages"
                  style={styles.searchInput}
                />
              </View>
              <FlatList
                data={searchedMessages}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No matching messages.</Text>
                }
                renderItem={({ item }) => (
                  <View style={styles.messageSearchResult}>
                    <Text style={styles.messageSearchSender}>
                      {item.senderId === CURRENT_USER_ID
                        ? "You"
                        : conversation.participant.name}
                    </Text>
                    <Text style={styles.messageSearchBody}>{item.text}</Text>
                    <Text style={styles.messageSearchTime}>
                      {formatTime(item.createdAt)}
                    </Text>
                  </View>
                )}
              />
            </View>
          </View>
        </Modal>
        <ChatContextDrawer
          detail={contextDetail}
          desktop={contextDrawerDesktop}
          conversation={conversation}
          messages={messages}
          close={() => setContextDetail(null)}
          openFull={(detail) => {
            setContextDetail(null);
            if (detail.kind === "order") onViewOrder?.(detail.id);
            else if (detail.kind === "user") onViewProfile?.(detail.id);
            else onOpenChatDetails?.(detail.id);
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatContextDrawer({
  detail,
  desktop,
  conversation,
  messages,
  close,
  openFull,
}: {
  detail: { kind: "order" | "user" | "chat"; id: string } | null;
  desktop: boolean;
  conversation: Conversation;
  messages: ChatMessage[];
  close: () => void;
  openFull: (detail: { kind: "order" | "user" | "chat"; id: string }) => void;
}) {
  const order =
    detail?.kind === "order"
      ? messages.find((message) => message.order?.orderId === detail.id)?.order
      : null;
  const title =
    detail?.kind === "order"
      ? "Order details"
      : detail?.kind === "user"
        ? conversation.participant.name
        : "Chat details";

  return (
    <Modal
      visible={Boolean(detail)}
      transparent
      animationType={desktop ? "fade" : "slide"}
      onRequestClose={close}
    >
      <View
        style={[
          styles.contextBackdrop,
          desktop
            ? styles.contextBackdropDesktop
            : styles.contextBackdropMobile,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close contextual details"
          onPress={close}
          style={styles.sheetDismissArea}
        />
        <View
          style={[
            styles.contextCard,
            desktop ? styles.contextCardDesktop : styles.contextCardMobile,
          ]}
        >
          <View style={styles.contextHeader}>
            <View style={styles.grow}>
              <Text style={styles.contextEyebrow}>
                {detail?.kind === "order"
                  ? "COMMERCE"
                  : detail?.kind === "user"
                    ? "SOCIAL PROFILE"
                    : "CONVERSATION"}
              </Text>
              <Text accessibilityRole="header" style={styles.contextTitle}>
                {title}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close details"
              onPress={close}
              style={styles.callControl}
            >
              <X color="#475467" size={20} />
            </Pressable>
          </View>
          {detail?.kind === "order" ? (
            order ? (
              <ScrollView contentContainerStyle={styles.contextBody}>
                <Text style={styles.contextStrong}>{order.storefrontName}</Text>
                <Text style={styles.contextMuted}>
                  Order #{order.orderId.slice(0, 8)} ·{" "}
                  {order.eventType.replaceAll("_", " ")}
                </Text>
                {order.items.map((item) => (
                  <Text key={item.orderItemId} style={styles.contextItem}>
                    {item.quantity} × {item.title}
                  </Text>
                ))}
                <Text style={styles.contextTotal}>
                  Total {formatMinor(order.totalMinor, order.currency)}
                </Text>
                {order.trackingNumber ? (
                  <Text style={styles.contextMuted}>
                    Tracking {order.trackingNumber}
                  </Text>
                ) : null}
              </ScrollView>
            ) : (
              <Text style={styles.contextEmpty}>
                This order summary is no longer present in the loaded chat page.
              </Text>
            )
          ) : (
            <View style={styles.contextBody}>
              <Avatar
                label={conversation.participant.avatarLabel}
                url={conversation.participant.avatarUrl}
                online={conversation.participant.isOnline}
              />
              <Text style={styles.contextStrong}>
                {conversation.participant.name}
              </Text>
              <Text style={styles.contextMuted}>
                @{conversation.participant.username}
              </Text>
              <Text style={styles.contextMuted}>
                {conversation.kind === "group"
                  ? `${conversation.memberCount || 0} members`
                  : conversation.participant.isOnline
                    ? "Online now"
                    : "Private Social24 conversation"}
              </Text>
            </View>
          )}
          {detail ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => openFull(detail)}
              style={styles.contextPrimary}
            >
              <Text style={styles.contextPrimaryText}>
                {detail.kind === "order"
                  ? "Open full order"
                  : detail.kind === "user"
                    ? "Open full profile"
                    : "Open chat settings"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ConversationRow({
  item,
  busy,
  selected = false,
  onPress,
  onMore,
}: {
  item: Conversation;
  busy: boolean;
  selected?: boolean;
  onPress: () => void;
  onMore: () => void;
}) {
  return (
    <View style={[styles.row, selected && styles.rowSelected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open conversation with ${item.participant.name}${item.unreadCount ? `, ${item.unreadCount} unread messages` : ""}`}
        onPress={onPress}
        style={styles.rowMain}
      >
        <Avatar
          label={item.participant.avatarLabel}
          url={item.participant.avatarUrl}
          online={item.participant.isOnline}
        />
        <View style={styles.rowCopy}>
          <View style={styles.rowTop}>
            <Text style={styles.personName}>{item.participant.name}</Text>
            <View style={styles.rowMeta}>
              <Text style={styles.time}>{formatTime(item.updatedAt)}</Text>
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
            {selected ? <CheckCircle2 color="#078f4a" size={20} /> : null}
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${item.participant.name}`}
        disabled={busy}
        accessibilityState={{ disabled: busy }}
        onPress={onMore}
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

function Avatar({
  label,
  url,
  online,
}: {
  label: string;
  url?: string | null;
  online?: boolean;
}) {
  return (
    <View style={styles.avatarWrap}>
      <View style={styles.avatar}>
        {url ? (
          <Image source={{ uri: url }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>
            {label.slice(0, 2).toUpperCase()}
          </Text>
        )}
      </View>
      {online && <View style={styles.online} />}
    </View>
  );
}

function MessageSurface({
  systemEvent,
  accessibilityRole,
  accessibilityLabel,
  onLongPress,
  onPress,
  webLongPressProps,
  style,
  children,
}: {
  systemEvent: boolean;
  accessibilityRole?: "button";
  accessibilityLabel: string;
  onLongPress?: () => void;
  onPress?: () => void;
  webLongPressProps: {
    onContextMenu?: (event: { preventDefault?: () => void }) => void;
  };
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  if (systemEvent) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={style}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onLongPress={onLongPress}
      onPress={onPress}
      delayLongPress={350}
      {...webLongPressProps}
      style={style}
    >
      {children}
    </Pressable>
  );
}

function MessageBubble({
  message,
  onLongPress,
  reactions,
  incomingAvatar,
  onViewOrder,
  onViewProfile,
  onVotePoll,
  onRsvpEvent,
  onAddEvidence,
  onViewEvidence,
  onViewAttachment,
  onRequestReturn,
  onReviewReturn,
}: {
  message: ChatMessage;
  onLongPress: () => void;
  reactions: MessageReaction[];
  incomingAvatar?: { label: string; url?: string | null };
  onViewOrder?: (orderId: string) => void;
  onViewProfile?: (profileId: string) => void;
  onVotePoll?: (pollId: string, optionId: string) => void;
  onRsvpEvent?: (
    eventId: string,
    response: "going" | "maybe" | "declined",
  ) => void;
  onAddEvidence?: (
    orderId: string,
    orderItemId: string | undefined,
    title: string,
    kind: "packing" | "unboxing" | "return",
    returnRequestId?: string,
  ) => void;
  onViewEvidence?: (evidence: OrderChatEvidence) => void;
  onViewAttachment?: (attachment: ChatAttachment) => void;
  onRequestReturn?: (orderItemId: string, title: string) => void;
  onReviewReturn?: (
    returnRequestId: string,
    decision: "approved" | "rejected" | "under_review",
  ) => void;
}) {
  const systemEvent = message.type === "order_event";
  const mine = !systemEvent && message.senderId === CURRENT_USER_ID;
  const showOrderEvidence = Boolean(
    message.order &&
    [
      "order_delivered",
      "return_requested",
      "return_approved",
      "return_rejected",
    ].includes(message.order.eventType),
  );
  const openStructured =
    message.order && onViewOrder
      ? () => onViewOrder(message.order!.orderId)
      : message.attachment?.signedUrl
        ? () => void Linking.openURL(message.attachment!.signedUrl!)
        : message.location
          ? () =>
              void Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${message.location!.latitude},${message.location!.longitude}`,
              )
          : message.contact && onViewProfile
            ? () => onViewProfile(message.contact!.profileId)
            : undefined;
  const webLongPressProps =
    Platform.OS === "web"
      ? {
          onContextMenu: (event: { preventDefault?: () => void }) => {
            event.preventDefault?.();
            onLongPress();
          },
        }
      : {};
  return (
    <View
      style={[
        styles.messageWrap,
        mine && styles.mineWrap,
        systemEvent && styles.systemEventWrap,
      ]}
    >
      <View
        style={[
          styles.messagePressRow,
          mine && styles.messagePressRowMine,
          systemEvent && styles.systemEventPressRow,
        ]}
      >
        {incomingAvatar ? (
          <MessageAvatar
            label={incomingAvatar.label}
            url={incomingAvatar.url}
          />
        ) : null}
        <MessageSurface
          systemEvent={systemEvent}
          accessibilityRole={
            !systemEvent &&
            !message.poll &&
            !message.event &&
            !message.order &&
            !message.attachment &&
            openStructured
              ? "button"
              : undefined
          }
          accessibilityLabel={
            systemEvent
              ? "System order update"
              : `${mine ? "Your" : "Received"} message. Long press for actions.`
          }
          onLongPress={systemEvent ? undefined : onLongPress}
          onPress={
            systemEvent ||
            message.poll ||
            message.event ||
            message.order ||
            message.attachment
              ? undefined
              : openStructured
          }
          webLongPressProps={systemEvent ? {} : webLongPressProps}
          style={[
            styles.message,
            message.type === "sticker" && styles.stickerMessage,
            mine ? styles.mine : styles.theirs,
            systemEvent && styles.systemEventMessage,
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
          {message.type === "order_event" && message.order ? (
            <View
              style={[styles.orderEventCard, mine && styles.orderEventCardMine]}
            >
              <View style={styles.orderEventHeader}>
                <Text
                  style={[styles.orderEventEyebrow, mine && styles.mineText]}
                >
                  ORDER UPDATE
                </Text>
                <Text
                  style={[styles.orderEventStatus, mine && styles.mineText]}
                >
                  {message.text}
                </Text>
              </View>
              <Text style={[styles.orderEventStore, mine && styles.mineText]}>
                {message.order.storefrontName} · #
                {message.order.orderId.slice(0, 8)}
              </Text>
              {message.order.items.slice(0, 3).map((item) => (
                <Text
                  key={item.orderItemId}
                  style={[styles.orderEventItem, mine && styles.mineText]}
                >
                  {item.quantity} × {item.title}
                </Text>
              ))}
              <Text style={[styles.orderEventTotal, mine && styles.mineText]}>
                Total{" "}
                {formatMinor(message.order.totalMinor, message.order.currency)}
              </Text>
              {message.order.carrier || message.order.trackingNumber ? (
                <Text style={[styles.orderEventMeta, mine && styles.mineText]}>
                  {[message.order.carrier, message.order.trackingNumber]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              ) : null}
              {message.order.packingEvidence?.length ? (
                <View style={styles.orderEvidenceList}>
                  <Text style={styles.orderEvidenceEyebrow}>
                    PRIVATE PACKING EVIDENCE
                  </Text>
                  {message.order.packingEvidence.map((evidence) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View private packing evidence ${evidence.filename}`}
                      key={evidence.id}
                      disabled={!evidence.signedUrl}
                      onPress={() => onViewEvidence?.(evidence)}
                      style={styles.orderEvidenceRow}
                    >
                      <View style={styles.grow}>
                        <Text
                          style={styles.orderEvidenceTitle}
                          numberOfLines={1}
                        >
                          {evidence.filename}
                        </Text>
                        <Text style={styles.orderEvidenceSource}>
                          {evidence.source === "live_capture"
                            ? trustedCaptureLabel(
                                evidence.mimeType,
                                evidence.createdAt,
                              )
                            : "Uploaded file"}{" "}
                          · Buyer and seller only
                        </Text>
                      </View>
                      {evidence.signedUrl ? (
                        <Text style={styles.orderEventAction}>View</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {message.order.canSubmitPackingEvidence &&
              onAddEvidence &&
              ["order_confirmed", "order_processing"].includes(
                message.order.eventType,
              ) ? (
                <View style={styles.orderCommerceActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Submit packing evidence"
                    onPress={() =>
                      onAddEvidence(
                        message.order!.orderId,
                        undefined,
                        "Packing evidence",
                        "packing",
                      )
                    }
                    style={styles.orderCommerceButton}
                  >
                    <Camera size={14} color="#087c43" />
                    <Text style={styles.orderCommerceButtonText}>
                      Submit packing evidence
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {showOrderEvidence && message.order.unboxingEvidence?.length ? (
                <View style={styles.orderEvidenceList}>
                  <Text style={styles.orderEvidenceEyebrow}>
                    PRIVATE UNBOXING EVIDENCE
                  </Text>
                  {message.order.unboxingEvidence.map((evidence) => {
                    const item = message.order!.items.find(
                      (candidate) =>
                        candidate.orderItemId === evidence.orderItemId,
                    );
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View private unboxing evidence for ${item?.title ?? evidence.filename}`}
                        key={evidence.id}
                        disabled={!evidence.signedUrl}
                        onPress={() => onViewEvidence?.(evidence)}
                        style={styles.orderEvidenceRow}
                      >
                        <View style={styles.grow}>
                          <Text
                            style={styles.orderEvidenceTitle}
                            numberOfLines={1}
                          >
                            {item?.title ?? evidence.filename}
                          </Text>
                          <Text style={styles.orderEvidenceSource}>
                            {evidence.source === "live_capture"
                              ? trustedCaptureLabel(
                                  evidence.mimeType,
                                  evidence.createdAt,
                                )
                              : "Uploaded file"}{" "}
                            · Buyer and seller only
                          </Text>
                        </View>
                        {evidence.signedUrl ? (
                          <Text style={styles.orderEventAction}>View</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {showOrderEvidence &&
              message.order.canSubmitUnboxingEvidence &&
              onAddEvidence ? (
                <View style={styles.orderCommerceActions}>
                  {message.order.items
                    .filter(
                      (item) =>
                        !message.order!.unboxingEvidence?.some(
                          (evidence) =>
                            evidence.orderItemId === item.orderItemId,
                        ),
                    )
                    .map((item) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Submit unboxing evidence for ${item.title}`}
                        key={item.orderItemId}
                        onPress={() =>
                          onAddEvidence(
                            message.order!.orderId,
                            item.orderItemId,
                            item.title,
                            "unboxing",
                          )
                        }
                        style={styles.orderCommerceButton}
                      >
                        <Camera size={14} color="#087c43" />
                        <Text style={styles.orderCommerceButtonText}>
                          Submit evidence · {item.title}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              ) : null}
              {showOrderEvidence &&
                message.order.returnRequests?.map((request) => {
                  const item = message.order!.items.find(
                    (candidate) =>
                      candidate.orderItemId === request.orderItemId,
                  );
                  const openReturn = ["submitted", "under_review"].includes(
                    request.status,
                  );
                  return (
                    <View key={request.id} style={styles.returnRequestCard}>
                      <View style={styles.returnRequestHeader}>
                        <Text style={styles.orderEvidenceEyebrow}>
                          RETURN ·{" "}
                          {item?.title ?? request.orderItemId.slice(0, 8)}
                        </Text>
                        <Text style={styles.returnRequestStatus}>
                          {request.status.replaceAll("_", " ")}
                        </Text>
                      </View>
                      <Text style={styles.returnRequestReason}>
                        {request.reason}
                      </Text>
                      {request.details ? (
                        <Text style={styles.orderEventMeta}>
                          {request.details}
                        </Text>
                      ) : null}
                      {request.sellerNote ? (
                        <Text style={styles.returnRequestNote}>
                          Seller: {request.sellerNote}
                        </Text>
                      ) : null}
                      {request.evidence.map((evidence) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`View return evidence ${evidence.filename}`}
                          key={evidence.id}
                          disabled={!evidence.signedUrl}
                          onPress={() => onViewEvidence?.(evidence)}
                          style={styles.orderEvidenceRow}
                        >
                          <View style={styles.grow}>
                            <Text
                              style={styles.orderEvidenceTitle}
                              numberOfLines={1}
                            >
                              {evidence.filename}
                            </Text>
                            <Text style={styles.orderEvidenceSource}>
                              {evidence.source === "live_capture" &&
                              evidence.capturedAt
                                ? trustedCaptureLabel(
                                    evidence.mimeType,
                                    evidence.capturedAt,
                                  )
                                : "Uploaded file"}{" "}
                              · Buyer and seller only
                            </Text>
                          </View>
                          {evidence.signedUrl ? (
                            <Text style={styles.orderEventAction}>View</Text>
                          ) : null}
                        </Pressable>
                      ))}
                      {message.order!.viewerRole === "buyer" &&
                      openReturn &&
                      onAddEvidence ? (
                        <View style={styles.orderCommerceActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add evidence to return for ${item?.title ?? "item"}`}
                            onPress={() =>
                              onAddEvidence(
                                message.order!.orderId,
                                request.orderItemId,
                                item?.title ?? "Return evidence",
                                "return",
                                request.id,
                              )
                            }
                            style={styles.orderCommerceButton}
                          >
                            <Camera size={14} color="#087c43" />
                            <Text style={styles.orderCommerceButtonText}>
                              Add return evidence
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {message.order!.viewerRole === "seller" &&
                      openReturn &&
                      onReviewReturn ? (
                        <View style={styles.orderCommerceActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Approve buyer return"
                            onPress={() =>
                              onReviewReturn(request.id, "approved")
                            }
                            style={styles.orderCommerceButton}
                          >
                            <Text style={styles.orderCommerceButtonText}>
                              Approve return
                            </Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Reject buyer return"
                            onPress={() =>
                              onReviewReturn(request.id, "rejected")
                            }
                            style={[
                              styles.orderCommerceButton,
                              styles.returnCommerceButton,
                            ]}
                          >
                            <Text
                              style={[
                                styles.orderCommerceButtonText,
                                styles.returnCommerceButtonText,
                              ]}
                            >
                              Reject return
                            </Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Request more return information"
                            onPress={() =>
                              onReviewReturn(request.id, "under_review")
                            }
                            style={styles.orderCommerceButton}
                          >
                            <Text style={styles.orderCommerceButtonText}>
                              Request more information
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              {showOrderEvidence &&
              message.order.canRequestReturn &&
              onRequestReturn ? (
                <View style={styles.orderCommerceActions}>
                  {message.order.items
                    .filter(
                      (item) =>
                        !message.order!.returnRequests?.some(
                          (request) => request.orderItemId === item.orderItemId,
                        ),
                    )
                    .map((item) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Request return for ${item.title}`}
                        key={item.orderItemId}
                        onPress={() =>
                          onRequestReturn(item.orderItemId, item.title)
                        }
                        style={[
                          styles.orderCommerceButton,
                          styles.returnCommerceButton,
                        ]}
                      >
                        <Text
                          style={[
                            styles.orderCommerceButtonText,
                            styles.returnCommerceButtonText,
                          ]}
                        >
                          Request return · {item.title}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              ) : null}
              {onViewOrder ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View order ${message.order.orderId.slice(0, 8)}`}
                  onPress={() => onViewOrder(message.order!.orderId)}
                >
                  <Text
                    style={[
                      styles.orderEventAction,
                      mine && styles.orderEventActionMine,
                    ]}
                  >
                    View order
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {message.attachment ? (
            <View
              style={[styles.attachmentCard, mine && styles.attachmentCardMine]}
            >
              {message.attachment.attachmentType === "image" &&
              message.attachment.signedUrl ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View image ${message.attachment.filename}`}
                  onPress={() => onViewAttachment?.(message.attachment!)}
                  style={styles.timelineMediaFrame}
                >
                  <Image
                    source={{ uri: message.attachment.signedUrl }}
                    style={styles.attachmentImage}
                    resizeMode="cover"
                  />
                </Pressable>
              ) : message.attachment.attachmentType === "video" &&
                message.attachment.signedUrl ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View video ${message.attachment.filename}`}
                  onPress={() => onViewAttachment?.(message.attachment!)}
                  style={styles.timelineVideoFrame}
                >
                  <TimelineVideoPreview url={message.attachment.signedUrl} />
                  <View pointerEvents="none" style={styles.timelinePlayButton}>
                    <Video size={24} color="#fff" />
                  </View>
                </Pressable>
              ) : (
                <View style={styles.attachmentFileIcon}>
                  <FileText color="#087c43" size={24} />
                </View>
              )}
              {message.attachment.attachmentType === "document" ? (
                <>
                  <Text
                    style={[styles.attachmentName, mine && styles.mineText]}
                    numberOfLines={2}
                  >
                    {message.attachment.filename}
                  </Text>
                  <Text
                    style={[styles.attachmentMeta, mine && styles.mineText]}
                  >
                    document ·{" "}
                    {(message.attachment.bytes / 1_048_576).toFixed(1)} MiB
                  </Text>
                </>
              ) : null}
              {message.attachment.source === "document_scan" ? (
                <Text style={styles.scanBadge}>Scanned in app</Text>
              ) : null}
              {message.attachment.signedUrl &&
              message.attachment.attachmentType === "document" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open attachment ${message.attachment.filename}`}
                  onPress={() =>
                    void Linking.openURL(message.attachment!.signedUrl!)
                  }
                >
                  <Text style={styles.orderEventAction}>Open attachment</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {message.location ? (
            <View
              style={[styles.structuredCard, mine && styles.attachmentCardMine]}
            >
              <MapPin color="#087c43" size={24} />
              <Text style={[styles.attachmentName, mine && styles.mineText]}>
                {message.location.label || "Current location"}
              </Text>
              <Text style={[styles.attachmentMeta, mine && styles.mineText]}>
                {message.location.latitude.toFixed(5)},{" "}
                {message.location.longitude.toFixed(5)}
              </Text>
              {message.location.accuracy ? (
                <Text style={[styles.attachmentMeta, mine && styles.mineText]}>
                  Accuracy ±{Math.round(message.location.accuracy)} m
                </Text>
              ) : null}
              <Text style={styles.orderEventAction}>Open map</Text>
            </View>
          ) : null}
          {message.contact ? (
            <View
              style={[styles.structuredCard, mine && styles.attachmentCardMine]}
            >
              <UserRound color="#087c43" size={24} />
              <Text style={[styles.attachmentName, mine && styles.mineText]}>
                {message.contact.displayName}
              </Text>
              <Text style={[styles.attachmentMeta, mine && styles.mineText]}>
                @
                {message.contact.username ||
                  message.contact.profileId.slice(0, 8)}
              </Text>
              {onViewProfile ? (
                <Text style={styles.orderEventAction}>View profile</Text>
              ) : null}
            </View>
          ) : null}
          {message.poll ? (
            <View style={[styles.pollCard, mine && styles.attachmentCardMine]}>
              <Text style={styles.orderEventEyebrow}>POLL</Text>
              <Text style={[styles.pollQuestion, mine && styles.mineText]}>
                {message.poll.question}
              </Text>
              {message.poll.options.map((option) => {
                const ratio = message.poll!.totalVotes
                  ? option.votes / message.poll!.totalVotes
                  : 0;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Vote ${option.label}`}
                    disabled={message.poll!.status !== "open" || !onVotePoll}
                    onPress={() => onVotePoll?.(message.poll!.id, option.id)}
                    style={[
                      styles.pollOption,
                      option.selectedByCurrentUser && styles.pollOptionSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.pollOptionFill,
                        { width: `${Math.round(ratio * 100)}%` },
                      ]}
                    />
                    <Text style={styles.pollOptionLabel}>{option.label}</Text>
                    <Text style={styles.pollOptionVotes}>{option.votes}</Text>
                  </Pressable>
                );
              })}
              <Text style={styles.attachmentMeta}>
                {message.poll.totalVotes} vote
                {message.poll.totalVotes === 1 ? "" : "s"} · single choice
              </Text>
            </View>
          ) : null}
          {message.event ? (
            <View style={[styles.eventCard, mine && styles.attachmentCardMine]}>
              <Text style={styles.orderEventEyebrow}>EVENT</Text>
              <Text style={[styles.pollQuestion, mine && styles.mineText]}>
                {message.event.title}
              </Text>
              <Text style={[styles.attachmentMeta, mine && styles.mineText]}>
                {new Date(message.event.startsAt).toLocaleString()}
              </Text>
              {message.event.location ? (
                <Text style={[styles.attachmentMeta, mine && styles.mineText]}>
                  📍 {message.event.location}
                </Text>
              ) : null}
              {message.event.description ? (
                <Text style={[styles.attachmentMeta, mine && styles.mineText]}>
                  {message.event.description}
                </Text>
              ) : null}
              <View style={styles.rsvpRow}>
                {(["going", "maybe", "declined"] as const).map((response) => (
                  <Pressable
                    key={response}
                    accessibilityRole="button"
                    onPress={() => onRsvpEvent?.(message.event!.id, response)}
                    style={[
                      styles.rsvpButton,
                      message.event!.currentUserResponse === response &&
                        styles.rsvpButtonActive,
                    ]}
                  >
                    <Text style={styles.rsvpText}>
                      {response} {message.event!.rsvpCounts[response]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <SafeLinkText
            style={[
              styles.messageText,
              message.type === "sticker" && styles.stickerText,
              (message.type === "order_event" ||
                message.attachment ||
                message.location ||
                message.contact ||
                message.poll ||
                message.event) &&
                styles.hiddenMessageBody,
              mine && styles.mineText,
            ]}
            linkStyle={mine ? styles.mineText : styles.messageLink}
          >
            {message.text}
          </SafeLinkText>
          <Text style={[styles.messageTime, mine && styles.mineTime]}>
            {formatTime(message.createdAt)}
            {mine && message.status === "read" ? " · Read" : ""}
          </Text>
        </MessageSurface>
      </View>
      {reactions.length > 0 ? (
        <View style={[styles.reactionRow, mine && styles.reactionRowMine]}>
          {reactions.map((reaction) => (
            <View
              key={reaction.emoji}
              style={[
                styles.reactionPill,
                reaction.reactedByCurrentUser && styles.reactionPillActive,
              ]}
            >
              <Text style={styles.reactionPillText}>
                {reaction.emoji}
                {reaction.count > 1 ? ` ${reaction.count}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MessageAvatar({ label, url }: { label: string; url?: string | null }) {
  return (
    <View
      accessibilityLabel={`${label} message avatar`}
      style={styles.messageAvatar}
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.messageAvatarImage} />
      ) : (
        <Text style={styles.messageAvatarText}>
          {label.slice(0, 2).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function WallpaperPicker({
  visible,
  current,
  saving,
  close,
  apply,
  chooseImage,
}: {
  visible: boolean;
  current: "neutral" | "sky" | "forest" | "warm" | "paper";
  saving: boolean;
  close: () => void;
  apply: (style: "neutral" | "sky" | "forest" | "warm" | "paper") => void;
  chooseImage: () => void;
}) {
  const choices: Array<{
    style: "neutral" | "sky" | "forest" | "warm" | "paper";
    label: string;
    color: string;
  }> = [
    { style: "neutral", label: "Neutral", color: "#f4f1ea" },
    { style: "sky", label: "Sky", color: "#eaf4ff" },
    { style: "forest", label: "Forest", color: "#edf7ef" },
    { style: "warm", label: "Warm", color: "#fff4ea" },
    { style: "paper", label: "Paper", color: "#fbfaf5" },
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.wallpaperModalBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close wallpaper picker"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.wallpaperModalCard}>
          <View style={styles.wallpaperModalHeader}>
            <View>
              <Text style={styles.wallpaperModalTitle}>Chat wallpaper</Text>
              <Text style={styles.wallpaperModalSubtitle}>
                Only this conversation changes. Messages stay readable.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close wallpaper picker"
              onPress={close}
              disabled={saving}
              style={styles.wallpaperModalClose}
            >
              <X color="#344054" size={20} />
            </Pressable>
          </View>
          <View style={styles.wallpaperChoiceGrid}>
            {choices.map((choice) => (
              <Pressable
                key={choice.style}
                accessibilityRole="button"
                accessibilityLabel={`Apply ${choice.label} wallpaper`}
                accessibilityState={{
                  selected: current === choice.style,
                  disabled: saving,
                }}
                disabled={saving}
                onPress={() => apply(choice.style)}
                style={[
                  styles.wallpaperChoice,
                  { backgroundColor: choice.color },
                  current === choice.style && styles.wallpaperChoiceActive,
                ]}
              >
                <Text style={styles.wallpaperChoiceLabel}>{choice.label}</Text>
                {current === choice.style ? (
                  <CheckCircle2 color="#087443" size={17} />
                ) : null}
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose image wallpaper"
            disabled={saving}
            onPress={chooseImage}
            style={[
              styles.wallpaperImageButton,
              saving && styles.disabledAction,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#087443" />
            ) : (
              <ImageIcon color="#087443" size={19} />
            )}
            <Text style={styles.wallpaperImageButtonText}>Choose image</Text>
          </Pressable>
          <Text style={styles.wallpaperModalHint}>
            Image selection opens your device photo library.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function AttachmentMenu({
  visible,
  close,
  gallery,
  document,
  location,
  contact,
  sticker,
  scan,
  poll,
  event,
  schedule,
  vanish,
  wallpaper,
}: {
  visible: boolean;
  close: () => void;
  gallery: () => void;
  document: () => void;
  location: () => void;
  contact: () => void;
  sticker: () => void;
  scan: () => void;
  poll: () => void;
  event: () => void;
  schedule: () => void;
  vanish: () => void;
  wallpaper: () => void;
}) {
  const actions = [
    { label: "Gallery", icon: ImageIcon, action: gallery },
    { label: "Document", icon: FileText, action: document },
    { label: "Location", icon: MapPin, action: location },
    { label: "Contact", icon: UserRound, action: contact },
    { label: "Poll", icon: CheckCircle2, action: poll },
    { label: "Event", icon: Bell, action: event },
    { label: "Schedule", icon: Send, action: schedule },
    { label: "Vanish Mode", icon: X, action: vanish },
    { label: "Chat wallpaper", icon: ImageIcon, action: wallpaper },
    { label: "Sticker", icon: MessageCircle, action: sticker },
    { label: "Scan Document", icon: Camera, action: scan },
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close attachment menu"
          onPress={close}
          style={styles.sheetDismissArea}
        />
        <View style={styles.actionSheet}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Share in chat</Text>
              <Text style={styles.sheetSubtitle}>
                Private to conversation participants
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close attachment menu"
              onPress={close}
              style={styles.sheetClose}
            >
              <X color="#172235" size={20} />
            </Pressable>
          </View>
          <View style={styles.attachmentActionGrid}>
            {actions.map((item) => {
              const Icon = item.icon;
              return (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={item.action}
                  style={styles.attachmentAction}
                >
                  <View style={styles.attachmentActionIcon}>
                    <Icon color="#087c43" size={22} />
                  </View>
                  <Text style={styles.attachmentActionText}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TrustedMediaOverlay({ label }: { label: string }) {
  return (
    <View pointerEvents="none" style={styles.trustedMediaOverlay}>
      <Text style={styles.trustedMediaOverlayText}>{label}</Text>
    </View>
  );
}

function TimelineVideoPreview({ url }: { url: string }) {
  const player = useVideoPlayer(url, (next) => {
    next.muted = true;
  });
  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit="cover"
      playsInline
      fullscreenOptions={{ enable: false }}
      style={styles.trustedVideo}
    />
  );
}

function TrustedVideoPlayer({
  url,
  watermark,
}: {
  url: string;
  watermark?: string;
}) {
  const player = useVideoPlayer(url);
  return (
    <View style={styles.trustedVideoFrame}>
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        playsInline
        fullscreenOptions={{ enable: false }}
        style={styles.trustedVideo}
      />
      {watermark ? <TrustedMediaOverlay label={watermark} /> : null}
    </View>
  );
}

function ChatMediaViewer({
  media,
  close,
}: {
  media: {
    attachment: ChatAttachment;
    createdAt: string;
    trusted: boolean;
  } | null;
  close: () => void;
}) {
  const attachment = media?.attachment;
  const trustedLabel =
    media?.trusted && attachment
      ? trustedCaptureLabel(attachment.mimeType, media.createdAt)
      : undefined;
  return (
    <Modal
      visible={Boolean(media)}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.evidenceViewerSafe}>
        <View style={styles.evidenceViewerHeader}>
          <View style={styles.grow}>
            <Text style={styles.evidenceViewerTitle} numberOfLines={1}>
              {attachment?.filename ?? "Media"}
            </Text>
            <Text style={styles.evidenceViewerMeta}>
              {trustedLabel ? "Verified in-app camera capture" : "Chat media"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close media viewer"
            onPress={close}
            style={styles.evidenceViewerClose}
          >
            <X size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.evidenceViewerBody}>
          {attachment?.signedUrl && attachment.attachmentType === "image" ? (
            <View style={styles.evidenceViewerMediaFrame}>
              <Image
                source={{ uri: attachment.signedUrl }}
                resizeMode="contain"
                style={styles.evidenceViewerMedia}
              />
              {trustedLabel ? (
                <TrustedMediaOverlay label={trustedLabel} />
              ) : null}
            </View>
          ) : attachment?.signedUrl && attachment.attachmentType === "video" ? (
            <TrustedVideoPlayer
              url={attachment.signedUrl}
              watermark={trustedLabel}
            />
          ) : (
            <View style={styles.previewFile}>
              <FileText color="#87dbaa" size={50} />
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function EvidenceViewer({
  evidence,
  close,
}: {
  evidence: OrderChatEvidence | null;
  close: () => void;
}) {
  const trustedLabel =
    evidence?.source === "live_capture" && evidence.capturedAt
      ? trustedCaptureLabel(evidence.mimeType, evidence.capturedAt)
      : undefined;
  return (
    <Modal
      visible={Boolean(evidence)}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.evidenceViewerSafe}>
        <View style={styles.evidenceViewerHeader}>
          <View style={styles.grow}>
            <Text style={styles.evidenceViewerTitle} numberOfLines={1}>
              {evidence?.filename ?? "Evidence"}
            </Text>
            <Text style={styles.evidenceViewerMeta}>
              {trustedLabel ?? "Uploaded evidence · not a TRUE capture"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close evidence viewer"
            onPress={close}
            style={styles.evidenceViewerClose}
          >
            <X size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.evidenceViewerBody}>
          {evidence?.signedUrl && evidence.mimeType.startsWith("image/") ? (
            <View style={styles.evidenceViewerMediaFrame}>
              <Image
                source={{ uri: evidence.signedUrl }}
                resizeMode="contain"
                style={styles.evidenceViewerMedia}
              />
              {trustedLabel ? (
                <TrustedMediaOverlay label={trustedLabel} />
              ) : null}
            </View>
          ) : evidence?.signedUrl && evidence.mimeType.startsWith("video/") ? (
            <TrustedVideoPlayer
              url={evidence.signedUrl}
              watermark={trustedLabel}
            />
          ) : (
            <View style={styles.previewFile}>
              <FileText color="#87dbaa" size={50} />
            </View>
          )}
        </View>
        {evidence?.signedUrl &&
        !evidence.mimeType.startsWith("image/") &&
        !evidence.mimeType.startsWith("video/") ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${evidence.filename} externally`}
            onPress={() => void Linking.openURL(evidence.signedUrl!)}
            style={styles.evidenceExternalButton}
          >
            <Text style={styles.evidenceExternalText}>Open original</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function AttachmentPreview({
  attachment,
  showTrustedCapture,
  sending,
  stage,
  error,
  cancel,
  send,
}: {
  attachment: PendingChatAttachment | null;
  showTrustedCapture: boolean;
  sending: boolean;
  stage: "preparing" | "uploading" | "finalizing";
  error: string | null;
  cancel: () => void;
  send: () => void;
}) {
  return (
    <Modal
      visible={Boolean(attachment)}
      transparent
      animationType="fade"
      onRequestClose={cancel}
    >
      <View style={styles.previewBackdrop}>
        <View style={styles.previewCard}>
          <Text style={styles.sheetTitle}>Preview attachment</Text>
          {attachment?.mimeType.startsWith("image/") ? (
            <Image
              source={{ uri: attachment.uri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.previewFile}>
              <FileText color="#087c43" size={42} />
            </View>
          )}
          <Text style={styles.previewName}>{attachment?.filename}</Text>
          <Text style={styles.sheetSubtitle}>
            {attachment?.mimeType}
            {attachment?.source === "camera_capture"
              ? showTrustedCapture
                ? " · TRUE camera capture"
                : " · Camera capture"
              : ""}
          </Text>
          {error ? (
            <Text
              accessibilityLiveRegion="assertive"
              style={styles.previewError}
            >
              Not sent: {error} Your recording is still here—tap Send to retry.
            </Text>
          ) : null}
          <View style={styles.previewActions}>
            <Pressable
              accessibilityRole="button"
              disabled={sending}
              onPress={cancel}
              style={styles.previewCancel}
            >
              <Text style={styles.previewCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={sending}
              onPress={send}
              style={styles.previewSend}
            >
              {sending ? (
                <>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.previewSendText}>
                    {stage === "preparing"
                      ? "Preparing"
                      : stage === "uploading"
                        ? "Uploading"
                        : "Finalizing"}
                  </Text>
                </>
              ) : (
                <Text style={styles.previewSendText}>Send</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ContactShareModal({
  visible,
  query,
  setQuery,
  contacts,
  loading,
  close,
  share,
}: {
  visible: boolean;
  query: string;
  setQuery: (value: string) => void;
  contacts: ChatContact[];
  loading: boolean;
  close: () => void;
  share: (contact: ChatContact) => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Share a Social 24x7 contact</Text>
            <Text style={styles.sheetSubtitle}>
              Only the selected profile is shared
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close contact picker"
            onPress={close}
            style={styles.sheetClose}
          >
            <X color="#172235" size={20} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Search color="#98a2b3" size={18} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name or username"
            style={styles.searchInput}
          />
        </View>
        {loading ? (
          <ActivityIndicator color="#087c43" />
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.modalList}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {query.trim().length < 2
                  ? "Type at least two characters."
                  : "No matching profiles."}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Share ${item.name}`}
                onPress={() => share(item)}
                style={styles.actionRow}
              >
                <Avatar label={item.avatarLabel} url={item.avatarUrl} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowPreview}>@{item.username}</Text>
                </View>
                <Text style={styles.orderEventAction}>Share</Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function PollComposer({
  visible,
  pending,
  close,
  submit,
}: {
  visible: boolean;
  pending: boolean;
  close: () => void;
  submit: (question: string, options: string[]) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const valid =
    question.trim().length > 0 &&
    options.filter((option) => option.trim()).length >= 2;
  const resetClose = () => {
    if (!pending) {
      setQuestion("");
      setOptions(["", ""]);
      close();
    }
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetClose}
    >
      <SafeAreaView style={styles.composerSheet}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Create poll</Text>
            <Text style={styles.sheetSubtitle}>One choice per participant</Text>
          </View>
          <Pressable
            accessibilityLabel="Close poll"
            onPress={resetClose}
            style={styles.sheetClose}
          >
            <X color="#172235" size={20} />
          </Pressable>
        </View>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask a question"
          maxLength={240}
          style={styles.structuredInput}
        />
        {options.map((option, index) => (
          <TextInput
            key={index}
            value={option}
            onChangeText={(value) =>
              setOptions((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? value : item,
                ),
              )
            }
            placeholder={`Option ${index + 1}`}
            maxLength={120}
            style={styles.structuredInput}
          />
        ))}
        {options.length < 10 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setOptions((current) => [...current, ""])}
            style={styles.addOption}
          >
            <Plus color="#087c43" size={17} />
            <Text style={styles.orderEventAction}>Add option</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={!valid || pending}
          onPress={() =>
            submit(
              question.trim(),
              options.map((option) => option.trim()).filter(Boolean),
            )
          }
          style={[
            styles.structuredSubmit,
            (!valid || pending) && styles.disabledAction,
          ]}
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.previewSendText}>Create poll</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function EventComposer({
  visible,
  pending,
  close,
  submit,
}: {
  visible: boolean;
  pending: boolean;
  close: () => void;
  submit: (input: {
    title: string;
    startsAt: string;
    location?: string;
    description?: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const parsedDate = new Date(dateTime);
  const valid =
    title.trim().length > 0 &&
    dateTime.trim().length > 0 &&
    !Number.isNaN(parsedDate.getTime());
  const resetClose = () => {
    if (!pending) {
      setTitle("");
      setDateTime("");
      setLocation("");
      setDescription("");
      close();
    }
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetClose}
    >
      <SafeAreaView style={styles.composerSheet}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Create event</Text>
            <Text style={styles.sheetSubtitle}>Example: 2026-08-15 18:30</Text>
          </View>
          <Pressable
            accessibilityLabel="Close event"
            onPress={resetClose}
            style={styles.sheetClose}
          >
            <X color="#172235" size={20} />
          </Pressable>
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Event title"
          maxLength={160}
          style={styles.structuredInput}
        />
        <TextInput
          value={dateTime}
          onChangeText={setDateTime}
          placeholder="YYYY-MM-DD HH:mm"
          style={styles.structuredInput}
        />
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Location (optional)"
          maxLength={240}
          style={styles.structuredInput}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Description (optional)"
          multiline
          maxLength={1000}
          style={[styles.structuredInput, styles.structuredMultiline]}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!valid || pending}
          onPress={() =>
            submit({
              title: title.trim(),
              startsAt: parsedDate.toISOString(),
              location: location.trim() || undefined,
              description: description.trim() || undefined,
            })
          }
          style={[
            styles.structuredSubmit,
            (!valid || pending) && styles.disabledAction,
          ]}
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.previewSendText}>Create event</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function ScheduleComposer({
  visible,
  pending,
  close,
  submit,
}: {
  visible: boolean;
  pending: boolean;
  close: () => void;
  submit: (body: string, sendAt: string) => void;
}) {
  const [body, setBody] = useState("");
  const [dateTime, setDateTime] = useState("");
  const parsedDate = new Date(dateTime);
  const valid =
    body.trim().length > 0 &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.getTime() > Date.now() + 60_000;
  const resetClose = () => {
    if (!pending) {
      setBody("");
      setDateTime("");
      close();
    }
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetClose}
    >
      <SafeAreaView style={styles.composerSheet}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Schedule message</Text>
            <Text style={styles.sheetSubtitle}>
              Delivered by the server, 1 minute to 30 days ahead
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close schedule message"
            onPress={resetClose}
            style={styles.sheetClose}
          >
            <X color="#172235" size={20} />
          </Pressable>
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Message"
          multiline
          maxLength={2000}
          style={[styles.structuredInput, styles.structuredMultiline]}
        />
        <TextInput
          value={dateTime}
          onChangeText={setDateTime}
          placeholder="YYYY-MM-DD HH:mm"
          style={styles.structuredInput}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!valid || pending}
          onPress={() => submit(body.trim(), parsedDate.toISOString())}
          style={[
            styles.structuredSubmit,
            (!valid || pending) && styles.disabledAction,
          ]}
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.previewSendText}>Schedule</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function UnboxingEvidenceModal({
  target,
  pending,
  close,
  choose,
}: {
  target: {
    orderId: string;
    orderItemId?: string;
    returnRequestId?: string;
    title: string;
    kind: "packing" | "unboxing" | "return";
  } | null;
  pending: boolean;
  close: () => void;
  choose: (source: "live_capture" | "uploaded_file") => void;
}) {
  return (
    <Modal
      visible={Boolean(target)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.composerSheet}>
        <View style={styles.sheetHeader}>
          <View style={styles.grow}>
            <Text style={styles.sheetTitle}>
              Submit {target?.kind ?? "order"} evidence
            </Text>
            <Text style={styles.sheetSubtitle} numberOfLines={2}>
              {target?.title} · Private to buyer and seller
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close order evidence"
            disabled={pending}
            onPress={close}
            style={styles.sheetClose}
          >
            <X color="#172235" size={20} />
          </Pressable>
        </View>
        <Text style={styles.evidenceHelp}>
          Choose how this evidence was created. The source is stored and shown
          clearly on the order card.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={() => choose("live_capture")}
          style={styles.evidenceChoice}
        >
          <View style={styles.evidenceChoiceIcon}>
            <Camera color="#087c43" size={24} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.evidenceChoiceTitle}>
              Use Camera — TRUE capture
            </Text>
            <Text style={styles.evidenceChoiceText}>
              Capture a new photo or video now. Server-issued evidence metadata
              will show TRUE PHOTO or TRUE VIDEO with a timestamp.
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={() => choose("uploaded_file")}
          style={styles.evidenceChoice}
        >
          <View style={styles.evidenceChoiceIcon}>
            <ImageIcon color="#087c43" size={24} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.evidenceChoiceTitle}>
              Upload from Device — Existing evidence
            </Text>
            <Text style={styles.evidenceChoiceText}>
              Choose an existing photo or video. It will be labelled Uploaded
              file.
            </Text>
          </View>
        </Pressable>
        {pending ? (
          <ActivityIndicator color="#087c43" style={{ marginTop: 18 }} />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function ReturnRequestModal({
  target,
  reason,
  setReason,
  details,
  setDetails,
  pending,
  close,
  submit,
}: {
  target: { orderItemId: string; title: string } | null;
  reason: string;
  setReason: (value: string) => void;
  details: string;
  setDetails: (value: string) => void;
  pending: boolean;
  close: () => void;
  submit: () => void;
}) {
  return (
    <Modal
      visible={Boolean(target)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.composerSheet}>
        <View style={styles.sheetHeader}>
          <View style={styles.grow}>
            <Text style={styles.sheetTitle}>Request a return</Text>
            <Text style={styles.sheetSubtitle} numberOfLines={2}>
              {target?.title} · Add evidence after submitting
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close return request"
            disabled={pending}
            onPress={close}
            style={styles.sheetClose}
          >
            <X color="#172235" size={20} />
          </Pressable>
        </View>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Why are you returning this item?"
          placeholderTextColor="#8a9690"
          multiline
          maxLength={1000}
          style={[styles.structuredInput, styles.structuredMultiline]}
        />
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="Extra details for the seller (optional)"
          placeholderTextColor="#8a9690"
          multiline
          maxLength={2000}
          style={[styles.structuredInput, styles.structuredMultiline]}
        />
        <Text style={styles.evidenceHelp}>
          The request goes directly to the seller for review. Both sides can
          follow its status in this Business Chat.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={pending || !reason.trim()}
          onPress={submit}
          style={[
            styles.structuredSubmit,
            (pending || !reason.trim()) && styles.disabledAction,
          ]}
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.previewSendText}>Submit return request</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const STICKERS = [
  "👋✨",
  "😂💚",
  "🥳🎉",
  "😍🌟",
  "👍🔥",
  "🙏💫",
  "💪😎",
  "🤗💛",
  "☕😊",
  "🚀✨",
  "💯🙌",
  "🎂🎈",
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close stickers"
          onPress={close}
          style={styles.sheetDismissArea}
        />
        <View style={styles.stickerSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Stickers</Text>
              <Text style={styles.sheetSubtitle}>
                Tap one to send instantly
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close stickers"
              onPress={close}
              style={styles.sheetClose}
            >
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
        </View>
      </View>
    </Modal>
  );
}

function MessageActions({
  message,
  close,
  copy,
  reply,
  react,
  reacting,
  keepMemo,
}: {
  message: ChatMessage | null;
  close: () => void;
  copy: () => void;
  reply: () => void;
  react: (emoji: string) => void;
  reacting: boolean;
  keepMemo: () => void;
}) {
  const currentReaction = message?.reactions?.find(
    (reaction) => reaction.reactedByCurrentUser,
  )?.emoji;
  return (
    <Modal
      visible={Boolean(message)}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close message actions"
          onPress={close}
          style={styles.sheetDismissArea}
        />
        <View style={styles.actionSheet}>
          <View style={styles.reactionTray}>
            {["❤️", "😂", "😮", "😢", "😡", "👍"].map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: reacting,
                  selected: currentReaction === emoji,
                }}
                accessibilityLabel={
                  currentReaction === emoji
                    ? `Remove ${emoji} reaction`
                    : `React with ${emoji}`
                }
                disabled={reacting}
                onPress={() => react(emoji)}
                style={[
                  styles.reactionOption,
                  currentReaction === emoji && styles.reactionOptionActive,
                  reacting && styles.reactionOptionDisabled,
                ]}
              >
                <Text style={styles.reactionOptionText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <Text numberOfLines={2} style={styles.actionPreview}>
            {message?.text}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={reply}
            style={styles.actionRow}
          >
            <Reply color="#078f4a" size={20} />
            <Text style={styles.actionText}>Reply</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={copy}
            style={styles.actionRow}
          >
            <Copy color="#078f4a" size={20} />
            <Text style={styles.actionText}>Copy message</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={keepMemo}
            style={styles.actionRow}
          >
            <FileText color="#078f4a" size={20} />
            <Text style={styles.actionText}>Keep Memo</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
      <View style={styles.conversationStateCard}>
        <Text style={[styles.errorTitle, styles.conversationStateTitle]}>
          Start your conversation
        </Text>
        <Text style={[styles.centerText, styles.conversationStateText]}>
          Send {name} a message. Conversations are private by default.
        </Text>
      </View>
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
                  url={item.participant.avatarUrl}
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
  openNewGroup,
  openQr,
}: {
  visible: boolean;
  close: () => void;
  filter: ChatListFilter;
  setFilter: (filter: ChatListFilter) => void;
  requestCount: number;
  openRequests: () => void;
  openNewGroup: () => void;
  openQr: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close chat tools"
          onPress={close}
          style={styles.sheetDismissArea}
        />
        <View style={styles.actionSheet}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Chat tools</Text>
              <Text style={styles.sheetSubtitle}>
                Groups, QR connections, archive and preferences
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close chat tools"
              onPress={close}
              style={styles.sheetClose}
            >
              <X color="#172235" size={20} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={openNewGroup}
            style={styles.actionRow}
          >
            <UsersRound color="#078f4a" size={19} />
            <Text style={styles.actionText}>New Group</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={openQr}
            style={styles.actionRow}
          >
            <QrCode color="#078f4a" size={19} />
            <Text style={styles.actionText}>My QR / Scan QR</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setFilter("archived")}
            style={styles.actionRow}
          >
            <CheckCircle2
              color={filter === "archived" ? "#078f4a" : "#98a2b3"}
              size={19}
            />
            <Text style={styles.actionText}>Archived Chats</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              close();
              Alert.alert(
                "Chat settings",
                "Message requests, archived chats and privacy are backed by your account. Notification permissions are managed in your device settings.",
                [
                  ...(requestCount
                    ? [
                        {
                          text: `Review ${requestCount} request${requestCount === 1 ? "" : "s"}`,
                          onPress: openRequests,
                        },
                      ]
                    : []),
                  { text: "OK" },
                ],
              );
            }}
            style={styles.actionRow}
          >
            <Settings color="#078f4a" size={19} />
            <Text style={styles.actionText}>Chat Settings</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function NewGroupModal({
  visible,
  dataSource,
  close,
  created,
}: {
  visible: boolean;
  dataSource: ChatDataSource;
  close: () => void;
  created: (conversation: Conversation) => void;
}) {
  const [name, setName] = useState("");
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!visible) {
      setName("");
      setSelectedIds([]);
      return;
    }
    setLoading(true);
    dataSource
      .listGroupEligibleContacts?.()
      .then(setContacts)
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [dataSource, visible]);
  const submit = async () => {
    if (
      !dataSource.createGroup ||
      name.trim().length < 2 ||
      selectedIds.length < 2
    )
      return;
    setCreating(true);
    try {
      created(await dataSource.createGroup(name, selectedIds));
    } catch (cause) {
      Alert.alert(
        "Group not created",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    } finally {
      setCreating(false);
    }
  };
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
            New group
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close new group"
            onPress={close}
            style={styles.iconButtonMuted}
          >
            <X color="#172235" size={22} />
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="Group name"
          value={name}
          onChangeText={setName}
          maxLength={80}
          placeholder="Group name"
          style={styles.groupNameInput}
        />
        <Text style={styles.lookupHelp}>
          Choose at least two accepted contacts. The group is saved to Supabase
          and appears for every member.
        </Text>
        {loading ? (
          <Loading />
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={(contact) => contact.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No accepted contacts are available for a group yet.
              </Text>
            }
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);
              return (
                <Pressable
                  style={[
                    styles.groupContactRow,
                    selected && styles.rowSelected,
                  ]}
                  onPress={() =>
                    setSelectedIds((current) =>
                      selected
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id],
                    )
                  }
                >
                  <Avatar label={item.avatarLabel} url={item.avatarUrl} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.personName}>{item.name}</Text>
                    <Text style={styles.contactMeta}>@{item.username}</Text>
                  </View>
                  <CheckCircle2
                    color={selected ? "#078f4a" : "#c5ccc8"}
                    size={22}
                  />
                </Pressable>
              );
            }}
          />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create group"
          disabled={
            creating ||
            name.trim().length < 2 ||
            selectedIds.length < 2 ||
            !dataSource.createGroup
          }
          onPress={() => void submit()}
          style={[
            styles.createGroupButton,
            (creating ||
              name.trim().length < 2 ||
              selectedIds.length < 2 ||
              !dataSource.createGroup) &&
              styles.disabledAction,
          ]}
        >
          {creating ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.createGroupButtonText}>
              Create group ({selectedIds.length})
            </Text>
          )}
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function GroupMembersModal({
  visible,
  conversation,
  dataSource,
  close,
  openProfile,
}: {
  visible: boolean;
  conversation: Conversation;
  dataSource: ChatDataSource;
  close: () => void;
  openProfile: (id: string) => void;
}) {
  const [members, setMembers] = useState<
    Array<ChatContact & { role: "admin" | "member" }>
  >([]);
  useEffect(() => {
    if (!visible) return;
    dataSource
      .listGroupMembers?.(conversation.id)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [conversation.id, dataSource, visible]);
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
            <Text style={styles.modalTitle}>
              {conversation.groupName || conversation.participant.name}
            </Text>
            <Text style={styles.contactMeta}>
              {members.length || conversation.memberCount || 0} members
            </Text>
          </View>
          <Pressable onPress={close} style={styles.iconButtonMuted}>
            <X color="#172235" size={22} />
          </Pressable>
        </View>
        <FlatList
          data={members}
          keyExtractor={(member) => member.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.groupContactRow}
              onPress={() => openProfile(item.id)}
            >
              <Avatar label={item.avatarLabel} url={item.avatarUrl} />
              <View style={styles.rowCopy}>
                <Text style={styles.personName}>{item.name}</Text>
                <Text style={styles.contactMeta}>@{item.username}</Text>
              </View>
              <Text style={styles.groupRole}>{item.role}</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
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
              Enter their name, username or phone number to send a message
              request.
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
                <Avatar
                  label={item.avatarLabel}
                  url={item.avatarUrl}
                  online={item.isOnline}
                />
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
  desktopChatWorkspace: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#ffffff",
  },
  desktopChatRail: {
    width: 360,
    maxWidth: "34%",
    borderRightWidth: 1,
    borderRightColor: "#dfe6e1",
    backgroundColor: "#ffffff",
  },
  desktopChatRailHeader: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#edf0ee",
  },
  desktopChatRailTitle: { color: "#101828", fontSize: 26, fontWeight: "900" },
  desktopConversationPane: { flex: 1, minWidth: 0 },
  wallpaperArea: { flex: 1, backgroundColor: "#050806" },
  wallpaperSky: { backgroundColor: "#eaf4ff" },
  wallpaperForest: { backgroundColor: "#edf7ef" },
  wallpaperWarm: { backgroundColor: "#fff4ea" },
  wallpaperPaper: { backgroundColor: "#fbfaf5" },
  wallpaperImage: { opacity: 1 },
  defaultWallpaperImage: { opacity: 1 },
  conversationStateCard: {
    alignSelf: "center",
    margin: 20,
    padding: 22,
    borderRadius: 22,
    backgroundColor: "rgba(20,25,22,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  conversationStateTitle: { color: "#ffffff" },
  conversationStateText: { color: "#d5ddd8" },
  messageSearchBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  messageSearchCard: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "78%",
    borderRadius: 24,
    padding: 16,
    gap: 12,
    backgroundColor: "#ffffff",
  },
  messageSearchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  messageSearchTitle: { color: "#101828", fontSize: 21, fontWeight: "900" },
  messageSearchResult: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e4e7ec",
  },
  messageSearchSender: { color: "#087c43", fontSize: 12, fontWeight: "900" },
  messageSearchBody: {
    color: "#1d2939",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  messageSearchTime: { color: "#98a2b3", fontSize: 11, marginTop: 5 },
  contextBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.32)" },
  contextBackdropDesktop: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  contextBackdropMobile: { justifyContent: "flex-end" },
  contextCard: {
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 14,
    boxShadow: "0 20px 50px rgba(15,23,42,0.22)",
  },
  contextCardDesktop: {
    width: 390,
    maxWidth: "38%",
    height: "100%",
    borderTopLeftRadius: 26,
    borderBottomLeftRadius: 26,
  },
  contextCardMobile: {
    width: "100%",
    maxHeight: "86%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 28,
  },
  contextHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e4e7ec",
  },
  contextEyebrow: {
    color: "#087c43",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  contextTitle: {
    color: "#101828",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 3,
  },
  contextBody: { alignItems: "flex-start", gap: 9, paddingVertical: 8 },
  contextStrong: { color: "#101828", fontSize: 18, fontWeight: "900" },
  contextMuted: { color: "#667085", fontSize: 14, lineHeight: 20 },
  contextItem: { color: "#344054", fontSize: 15, lineHeight: 22 },
  contextTotal: {
    color: "#087c43",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5,
  },
  contextEmpty: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 21,
    paddingVertical: 24,
  },
  contextPrimary: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#07b75b",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  contextPrimaryText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  wallpaperFeedback: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#083f2b",
  },
  wallpaperFeedbackText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  wallpaperModalBackdrop: {
    flex: 1,
    backgroundColor: "#10182880",
    justifyContent: "center",
    padding: 24,
  },
  wallpaperModalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    maxWidth: 540,
    width: "100%",
    alignSelf: "center",
    gap: 16,
  },
  wallpaperModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },
  wallpaperModalTitle: { color: "#101828", fontSize: 22, fontWeight: "800" },
  wallpaperModalSubtitle: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    maxWidth: 380,
  },
  wallpaperModalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f2f4f7",
    alignItems: "center",
    justifyContent: "center",
  },
  wallpaperChoiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  wallpaperChoice: {
    minWidth: 124,
    flexGrow: 1,
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  wallpaperChoiceActive: { borderWidth: 2, borderColor: "#087443" },
  wallpaperChoiceLabel: { color: "#344054", fontSize: 15, fontWeight: "800" },
  wallpaperImageButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#b7ebcd",
    backgroundColor: "#effbf3",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  wallpaperImageButtonText: {
    color: "#087443",
    fontSize: 16,
    fontWeight: "800",
  },
  wallpaperModalHint: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
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
  viewerAvatarButton: {
    borderRadius: 999,
    overflow: "hidden",
  },
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
  multiShareBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#dce5df",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  multiShareCount: { color: "#33413a", fontWeight: "800" },
  multiShareButton: {
    minWidth: 106,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 15,
    backgroundColor: "#07c160",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  multiShareButtonText: { color: "#ffffff", fontWeight: "900" },
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
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#eef2f6",
  },
  rowSelected: { backgroundColor: "#effaf3", borderColor: "#b9e4c8" },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrap: { width: 51, height: 51 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#dff4e7",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { color: "#07934a", fontSize: 18, fontWeight: "700" },
  groupNameInput: {
    margin: 16,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8e1dc",
    paddingHorizontal: 15,
    color: "#172235",
    fontSize: 16,
  },
  groupContactRow: {
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8e4",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  createGroupButton: {
    margin: 16,
    minHeight: 52,
    borderRadius: 17,
    backgroundColor: "#07c160",
    alignItems: "center",
    justifyContent: "center",
  },
  createGroupButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  groupRole: {
    color: "#078f4a",
    fontWeight: "800",
    textTransform: "capitalize",
  },
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
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 24,
  },
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
  conversationScreen: { backgroundColor: "#edf6ef" },
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
  storefrontHeaderLink: {
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  storefrontHeaderLinkPressed: {
    backgroundColor: "#edf8f1",
    opacity: 0.82,
  },
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
  messageList: { padding: 12, paddingBottom: 20, gap: 6 },
  messageWrap: { alignItems: "flex-start" },
  grow: { flex: 1 },
  mineWrap: { alignItems: "flex-end" },
  systemEventWrap: { alignItems: "center", width: "100%" },
  messagePressRow: {
    width: "100%",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  messagePressRowMine: { justifyContent: "flex-end" },
  systemEventPressRow: { width: "100%", justifyContent: "center" },
  message: {
    minWidth: 64,
    maxWidth: "78%",
    flexShrink: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10,
    elevation: 2,
  },
  mine: { backgroundColor: "#087a55" },
  theirs: { backgroundColor: "#222925" },
  systemEventMessage: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: 2,
    overflow: "hidden",
    backgroundColor: "#dff4e8",
    alignItems: "center",
    justifyContent: "center",
  },
  messageAvatarImage: { width: "100%", height: "100%" },
  messageAvatarText: { color: "#078549", fontSize: 9, fontWeight: "900" },
  messageText: { color: "#f6f8f7", fontSize: 15, lineHeight: 21 },
  messageLink: { color: "#76e6b5" },
  hiddenMessageBody: { display: "none" },
  orderEventCard: {
    minWidth: 238,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7eee0",
    backgroundColor: "#f4fbf7",
    padding: 13,
    gap: 5,
  },
  orderEventCardMine: { backgroundColor: "rgba(255,255,255,0.66)" },
  orderEventHeader: { gap: 2, marginBottom: 3 },
  orderEventEyebrow: {
    color: "#078f4a",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  orderEventStatus: { color: "#12251a", fontSize: 16, fontWeight: "900" },
  orderEventStore: { color: "#52645a", fontSize: 12, fontWeight: "700" },
  orderEventItem: { color: "#26372e", fontSize: 13 },
  orderEventTotal: {
    color: "#12251a",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },
  orderEventMeta: { color: "#52645a", fontSize: 12 },
  orderEventAction: {
    color: "#078f4a",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 5,
  },
  orderEventActionMine: { color: "#075c34" },
  orderEvidenceList: {
    marginTop: 8,
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: "#d7eee0",
    paddingTop: 8,
  },
  orderEvidenceEyebrow: {
    color: "#5b6d62",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  orderEvidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    padding: 9,
  },
  orderEvidenceTitle: { color: "#17241c", fontSize: 11, fontWeight: "900" },
  orderEvidenceSource: { color: "#637269", fontSize: 9, marginTop: 2 },
  orderCommerceActions: { gap: 6, marginTop: 7 },
  orderCommerceButton: {
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#bfe6cf",
    backgroundColor: "#eaf9f0",
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  orderCommerceButtonText: {
    color: "#087c43",
    fontSize: 10,
    fontWeight: "900",
    flexShrink: 1,
  },
  returnCommerceButton: { borderColor: "#f1c7c7", backgroundColor: "#fff3f3" },
  returnCommerceButtonText: { color: "#a83b3b" },
  returnRequestCard: {
    marginTop: 8,
    gap: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#d7eee0",
    backgroundColor: "#eef8f2",
    padding: 10,
  },
  returnRequestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  returnRequestStatus: {
    color: "#087443",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  returnRequestReason: { color: "#17241c", fontSize: 12, fontWeight: "800" },
  returnRequestNote: {
    color: "#42584b",
    fontSize: 11,
    lineHeight: 16,
    borderRadius: 9,
    backgroundColor: "#fff",
    padding: 8,
  },
  attachmentCard: { minWidth: 220, gap: 5 },
  attachmentCardMine: { backgroundColor: "rgba(255,255,255,0.2)" },
  attachmentImage: {
    width: 230,
    height: 180,
    borderRadius: 14,
    backgroundColor: "#e9f0eb",
  },
  timelineMediaFrame: {
    position: "relative",
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 14,
  },
  timelineVideoFrame: {
    position: "relative",
    width: 230,
    height: 180,
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#17241c",
  },
  timelinePlayButton: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 52,
    height: 52,
    marginLeft: -26,
    marginTop: -26,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  trustedVideoFrame: {
    position: "relative",
    width: "100%",
    maxWidth: 520,
    minWidth: 230,
    height: 260,
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#17241c",
  },
  trustedVideo: { width: "100%", height: "100%" },
  trustedMediaOverlay: {
    position: "absolute",
    top: 10,
    right: 10,
    alignItems: "flex-end",
  },
  trustedMediaOverlayText: {
    maxWidth: "94%",
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.2,
    backgroundColor: "rgba(7,43,24,0.72)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: "hidden",
  },
  attachmentFileIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f8ef",
  },
  attachmentName: { color: "#17241c", fontSize: 14, fontWeight: "900" },
  attachmentMeta: { color: "#637269", fontSize: 11 },
  liveCaptureBadge: {
    alignSelf: "flex-start",
    color: "#075c34",
    fontSize: 10,
    fontWeight: "900",
    backgroundColor: "#d9f6e5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  scanBadge: {
    alignSelf: "flex-start",
    color: "#475467",
    fontSize: 10,
    fontWeight: "900",
    backgroundColor: "#edf1ef",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  structuredCard: {
    minWidth: 220,
    gap: 5,
    borderRadius: 14,
    padding: 10,
    backgroundColor: "#f4fbf7",
  },
  evidenceHelp: {
    color: "#66766d",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  evidenceChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 82,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#d5e9dc",
    backgroundColor: "#f5fcf7",
    padding: 14,
  },
  evidenceChoiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e3f7eb",
  },
  evidenceChoiceTitle: { color: "#17241c", fontSize: 14, fontWeight: "900" },
  evidenceChoiceText: {
    color: "#66766d",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  attachmentActionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  attachmentAction: {
    width: "31%",
    minWidth: 96,
    alignItems: "center",
    gap: 7,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e1eae4",
    backgroundColor: "#fbfdfb",
  },
  attachmentActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eaf8ef",
  },
  attachmentActionText: {
    color: "#26362d",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  previewBackdrop: {
    flex: 1,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,20,14,0.72)",
  },
  previewCard: {
    width: "100%",
    maxWidth: 520,
    padding: 18,
    gap: 12,
    borderRadius: 22,
    backgroundColor: "#fff",
  },
  previewImage: {
    width: "100%",
    height: 320,
    borderRadius: 16,
    backgroundColor: "#edf2ee",
  },
  previewFile: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#edf8f1",
  },
  previewName: { color: "#17241c", fontSize: 16, fontWeight: "900" },
  previewError: {
    color: "#9f1c1c",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    borderRadius: 12,
    backgroundColor: "#fff0f0",
    padding: 10,
  },
  previewActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  previewCancel: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf1ef",
  },
  previewCancelText: { color: "#34463c", fontWeight: "800" },
  previewSend: {
    minWidth: 100,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#07b75b",
  },
  previewSendText: { color: "#fff", fontWeight: "900" },
  evidenceViewerSafe: { flex: 1, backgroundColor: "#07110b" },
  evidenceViewerHeader: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#26372e",
  },
  evidenceViewerTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  evidenceViewerMeta: { color: "#a9b8af", fontSize: 11, marginTop: 3 },
  evidenceViewerClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#24352b",
  },
  evidenceViewerBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  evidenceViewerMediaFrame: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#000",
  },
  evidenceViewerMedia: { width: "100%", height: "100%" },
  evidenceExternalButton: {
    minHeight: 48,
    margin: 16,
    borderRadius: 14,
    backgroundColor: "#dff4e7",
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceExternalText: { color: "#087443", fontWeight: "900" },
  modalList: { paddingHorizontal: 18, paddingBottom: 24, gap: 8 },
  emptyText: {
    color: "#667085",
    fontSize: 14,
    textAlign: "center",
    padding: 24,
  },
  rowName: { color: "#17241c", fontSize: 15, fontWeight: "900" },
  rowPreview: { color: "#667085", fontSize: 12 },
  pollCard: {
    minWidth: 260,
    gap: 8,
    borderRadius: 15,
    padding: 11,
    backgroundColor: "#f7fcf8",
  },
  pollQuestion: { color: "#17241c", fontSize: 16, fontWeight: "900" },
  pollOption: {
    minHeight: 40,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e7de",
    backgroundColor: "#fff",
  },
  pollOptionSelected: { borderColor: "#07a952" },
  pollOptionFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#e3f7ea",
  },
  pollOptionLabel: {
    flex: 1,
    color: "#24352b",
    fontSize: 13,
    fontWeight: "700",
  },
  pollOptionVotes: { color: "#087c43", fontSize: 12, fontWeight: "900" },
  eventCard: {
    minWidth: 260,
    gap: 7,
    borderRadius: 15,
    padding: 12,
    backgroundColor: "#f7fcf8",
  },
  rsvpRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  rsvpButton: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#edf2ef",
  },
  rsvpButtonActive: {
    backgroundColor: "#d8f4e2",
    borderWidth: 1,
    borderColor: "#42ae70",
  },
  rsvpText: {
    color: "#30513e",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  composerSheet: { flex: 1, gap: 12, padding: 18, backgroundColor: "#fbfdfb" },
  structuredInput: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dce6df",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#17241c",
    backgroundColor: "#fff",
  },
  structuredMultiline: { minHeight: 110, textAlignVertical: "top" },
  addOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    padding: 8,
  },
  structuredSubmit: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#07b75b",
  },
  stickerMessage: { minWidth: 0, paddingHorizontal: 4, paddingVertical: 2 },
  transparentMessage: { backgroundColor: "transparent" },
  stickerText: {
    fontSize: 42,
    lineHeight: 54,
    textShadowColor: "rgba(0,0,0,0.10)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  mineText: { color: "#ffffff" },
  sharedPost: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: "#d5d5d5",
    paddingBottom: 8,
  },
  sharedPostMine: { borderColor: "#72ce52" },
  sharedBy: {
    color: "#b9d8c8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 3,
  },
  sharedCaption: { color: "#ffffff", fontSize: 14, lineHeight: 19 },
  messageTime: {
    marginTop: 4,
    color: "#999999",
    fontSize: 11,
    alignSelf: "flex-end",
  },
  mineTime: { color: "rgba(255,255,255,0.86)" },
  reactionRow: {
    marginTop: 4,
    marginLeft: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    alignSelf: "flex-start",
  },
  reactionRowMine: {
    marginLeft: 0,
    marginRight: 10,
    alignSelf: "flex-end",
    justifyContent: "flex-end",
  },
  reactionPill: {
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
  reactionPillActive: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#07c160",
  },
  reactionPillText: { fontSize: 14 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#d3d7de",
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  composerAccessory: {
    width: 36,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  inputShell: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: "#f2f4f7",
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  inputAccessory: {
    width: 38,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  composerInput: {
    flex: 1,
    maxHeight: 112,
    minHeight: 42,
    backgroundColor: "transparent",
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 8,
    color: "#111111",
    fontSize: 15,
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
    height: 44,
    borderRadius: 22,
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
  sheetDismissArea: {
    ...StyleSheet.absoluteFill,
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
  reactionOptionActive: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#07c160",
  },
  reactionOptionDisabled: { opacity: 0.45 },
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
