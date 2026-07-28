export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type ChatParticipant = {
  id: string;
  name: string;
  avatarLabel: string;
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

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  status: MessageStatus;
  type?: 'text' | 'shared_post' | 'sticker';
  post?: SharedPost;
};

export type SendMessageInput = Pick<ChatMessage, 'conversationId' | 'text'> & Pick<ChatMessage, 'type' | 'post'>;

export type Conversation = {
  id: string;
  participant: ChatContact;
  lastMessage?: ChatMessage;
  unreadCount: number;
  updatedAt: string;
  requestStatus?: 'pending_outgoing' | 'pending_incoming' | 'accepted';
  requestMessage?: string;
};

export type ChatDataSource = {
  listConversations(): Promise<Conversation[]>;
  listMessages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(input: SendMessageInput): Promise<ChatMessage>;
  markConversationRead(conversationId: string): Promise<void>;
  searchContacts(query: string): Promise<ChatContact[]>;
  openDirectConversation(contactId: string): Promise<Conversation>;
  sendMessageRequest(contact: ChatContact, note?: string): Promise<Conversation>;
  acceptMessageRequest(conversationId: string): Promise<Conversation>;
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
