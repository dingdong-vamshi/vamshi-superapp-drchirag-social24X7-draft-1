export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type ChatParticipant = {
  id: string;
  name: string;
  avatarLabel: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
};

export type ChatContact = ChatParticipant & {
  username: string;
  /** E.164 numbers are returned only for contacts who allow phone discovery. */
  phone?: string;
};

/** A profile that has explicitly opted into local contact discovery. */
export type LocalProfileRecord = ChatContact & {
  discoverable?: boolean;
  usernameDiscoverable?: boolean;
  phoneDiscoverable?: boolean;
};

export type SharedPost = {
  id: string;
  author: string;
  caption: string;
  imageUrl?: string;
};

export type MessageReaction = {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
};

export type OrderChatEventType =
  | 'order_confirmed'
  | 'order_processing'
  | 'order_shipped'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled'
  | 'return_requested'
  | 'return_approved'
  | 'return_rejected'
  | 'order_refunded';

export type OrderChatItem = {
  orderItemId: string;
  productId?: string;
  title: string;
  slug: string;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
};

export type OrderChatEvidence = {
  id: string;
  orderItemId?: string;
  filename: string;
  mimeType: string;
  source: 'live_capture' | 'uploaded_file';
  createdAt: string;
  signedUrl?: string;
};

export type OrderChatEvent = {
  version: 1;
  eventType: OrderChatEventType;
  orderId: string;
  orderStatus: string;
  storefrontId: string;
  storefrontName: string;
  storefrontSlug: string;
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
  paymentMethod: string;
  paymentStatus: string;
  placedAt: string;
  items: OrderChatItem[];
  carrier?: string;
  trackingNumber?: string;
  packageReference?: string;
  customerNote?: string;
  liveOrderStatus?: string;
  viewerRole?: 'buyer' | 'seller';
  packingEvidence?: OrderChatEvidence[];
  unboxingEvidence?: OrderChatEvidence[];
  canSubmitPackingEvidence?: boolean;
  canSubmitUnboxingEvidence?: boolean;
  canRequestReturn?: boolean;
  returnRequestId?: string;
  returnStatus?: string;
  canReviewReturn?: boolean;
};

export type ChatAttachmentSource = 'camera_capture' | 'gallery' | 'document_picker' | 'document_scan';

export type ChatAttachment = {
  id: string;
  attachmentType: 'image' | 'video' | 'document';
  filename: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  source: ChatAttachmentSource;
  signedUrl?: string;
};

export type ChatLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  label?: string;
  capturedAt: string;
};

export type SharedContact = {
  profileId: string;
  displayName: string;
  username: string;
};

export type ChatPollOption = {
  id: string;
  label: string;
  position: number;
  votes: number;
  selectedByCurrentUser: boolean;
};

export type ChatPoll = {
  id: string;
  question: string;
  status: 'open' | 'closed';
  options: ChatPollOption[];
  totalVotes: number;
};

export type ChatEvent = {
  id: string;
  title: string;
  startsAt: string;
  location?: string;
  description?: string;
  rsvpCounts: { going: number; maybe: number; declined: number };
  currentUserResponse?: 'going' | 'maybe' | 'declined';
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  status: MessageStatus;
  type?: 'text' | 'shared_post' | 'sticker' | 'order_event';
  post?: SharedPost;
  order?: OrderChatEvent;
  attachment?: ChatAttachment;
  location?: ChatLocation;
  contact?: SharedContact;
  poll?: ChatPoll;
  event?: ChatEvent;
  reactions?: MessageReaction[];
};

export type BusinessStorefrontIdentity = {
  id: string;
  name: string;
  slug: string;
  logoPath?: string;
  verificationStatus?: string;
};

export type SendMessageInput = Pick<ChatMessage, 'conversationId' | 'text'> & Pick<ChatMessage, 'type' | 'post'>;

export type ChatReportInput = {
  conversationId: string;
  messageId?: string;
  category: string;
  notes: string;
};

export type ExportedConversation = {
  filename: string;
  text: string;
};

export type Conversation = {
  id: string;
  participant: ChatContact;
  lastMessage?: ChatMessage;
  unreadCount: number;
  updatedAt: string;
  kind?: 'personal' | 'business' | 'group' | 'support';
  isArchived?: boolean;
  isManuallyUnread?: boolean;
  isPinned?: boolean;
  clearedAt?: string | null;
  requestStatus?: 'pending_outgoing' | 'pending_incoming' | 'accepted';
  requestMessage?: string;
  storefront?: BusinessStorefrontIdentity;
  businessRole?: 'customer' | 'seller';
  groupName?: string;
  memberCount?: number;
};

export type ChatDataSource = {
  listConversations(): Promise<Conversation[]>;
  listMessages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(input: SendMessageInput): Promise<ChatMessage>;
  sendAttachment?(input: {
    conversationId: string;
    bytes: ArrayBuffer;
    filename: string;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
    source: ChatAttachmentSource;
  }): Promise<ChatMessage>;
  submitUnboxingEvidence?(input: {
    orderId: string;
    orderItemId: string;
    bytes: ArrayBuffer;
    filename: string;
    mimeType: string;
    source: 'live_capture' | 'uploaded_file';
  }): Promise<void>;
  submitOrderEvidence?(input: {
    orderId: string;
    orderItemId?: string | null;
    kind: 'packing' | 'unboxing';
    bytes: ArrayBuffer;
    filename: string;
    mimeType: string;
    source: 'live_capture' | 'uploaded_file';
  }): Promise<void>;
  reviewOrderReturn?(input: {
    returnRequestId: string;
    decision: 'approved' | 'rejected' | 'under_review';
    reason?: string;
  }): Promise<void>;
  submitOrderReturn?(input: { orderItemId: string; reason: string }): Promise<void>;
  sendLocation?(input: { conversationId: string; location: ChatLocation }): Promise<ChatMessage>;
  sendContact?(input: { conversationId: string; profileId: string }): Promise<ChatMessage>;
  createPoll?(input: { conversationId: string; question: string; options: string[] }): Promise<ChatMessage>;
  votePoll?(pollId: string, optionId: string): Promise<void>;
  createEvent?(input: { conversationId: string; title: string; startsAt: string; location?: string; description?: string }): Promise<ChatMessage>;
  rsvpEvent?(eventId: string, response: 'going' | 'maybe' | 'declined'): Promise<void>;
  keepMemo?(messageId: string): Promise<void>;
  scheduleMessage?(input: { conversationId: string; body: string; sendAt: string; timezone: string }): Promise<void>;
  setVanishMode?(conversationId: string, seconds: 86400 | 604800 | 2592000 | null): Promise<void>;
  markConversationRead(conversationId: string): Promise<void>;
  searchContacts(query: string): Promise<ChatContact[]>;
  openDirectConversation(contactId: string): Promise<Conversation>;
  listGroupEligibleContacts?(): Promise<ChatContact[]>;
  createGroup?(name: string, memberIds: string[]): Promise<Conversation>;
  listGroupMembers?(conversationId: string): Promise<Array<ChatContact & { role: 'admin' | 'member' }>>;
  sendMessageRequest(contact: ChatContact, note?: string): Promise<Conversation>;
  acceptMessageRequest(conversationId: string): Promise<Conversation>;
  rejectMessageRequest?(conversationId: string): Promise<void>;
  cancelMessageRequest?(conversationId: string): Promise<void>;
  archiveConversation?(conversationId: string): Promise<void>;
  unarchiveConversation?(conversationId: string): Promise<void>;
  markConversationUnread?(conversationId: string): Promise<void>;
  setMessageReaction(messageId: string, emoji: string | null): Promise<void>;
  pinConversation?(conversationId: string, pinned: boolean): Promise<void>;
  clearConversation?(conversationId: string): Promise<void>;
  reportConversation?(input: ChatReportInput): Promise<void>;
  exportConversation?(conversationId: string): Promise<ExportedConversation>;
  /** Replace with Supabase Realtime or another transport at composition time. */
  subscribe(listener: () => void): () => void;
};

export type CallKind = 'audio' | 'video';
export type CallPhase = 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';
export type CallSession = {
  id: string;
  conversationId: string;
  recipientId: string;
  kind: CallKind;
  phase: CallPhase;
  direction?: 'incoming' | 'outgoing';
  localStream?: unknown;
  remoteStream?: unknown;
  muted?: boolean;
  cameraOff?: boolean;
  screenSharing?: boolean;
  error?: string;
};
export type CallSignal = { sessionId: string; recipientId: string; type: 'offer' | 'answer' | 'ice-candidate' | 'hangup'; payload?: unknown };

/**
 * Transport boundary for WebRTC signaling. The native media implementation is
 * intentionally injected by the app shell; Expo Go does not include WebRTC.
 */
export type CallAdapter = {
  startCall(input: { conversationId: string; recipientId: string; kind: CallKind }): Promise<CallSession>;
  endCall(sessionId: string): Promise<void>;
  sendSignal(signal: CallSignal): Promise<void>;
  subscribe(listener: (session: CallSession) => void): () => void;
  acceptCall?(sessionId: string): Promise<void>;
  toggleMute?(sessionId: string): Promise<void>;
  toggleCamera?(sessionId: string): Promise<void>;
  shareScreen?(sessionId: string): Promise<void>;
};

export const CURRENT_USER_ID = 'current-user';
