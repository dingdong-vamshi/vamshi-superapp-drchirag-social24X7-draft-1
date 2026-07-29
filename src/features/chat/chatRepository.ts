import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

import {
  CURRENT_USER_ID,
  type ChatContact,
  type ChatDataSource,
  type ChatMessage,
  type Conversation,
  type LocalProfileRecord,
} from './types';
import { profileDirectoryKey } from '../profile/profileRepository';
import { seededDemoIdentities, seededDemoMessageRequests } from '../../lib/demoAccounts';

const STORAGE_KEY = 'kora-mobile:chat:v2';
const PROFILE_STORAGE_KEY = profileDirectoryKey;
const DEMO_USERS_STORAGE_KEY = 'kora:demo-users:v1';
const DEMO_SESSION_STORAGE_KEY = 'kora:demo-session:v1';
const DEMO_REQUESTS_STORAGE_KEY = 'kora:demo-message-requests:v1';
type Snapshot = { conversations: Conversation[]; messages: Record<string, ChatMessage[]> };
type DemoRequest = {
  requesterId: string;
  recipientId: string;
  note: string;
  status: 'pending' | 'accepted';
  createdAt: string;
};
type DemoIdentityRecord = {
  id: string;
  phone?: string;
  user_metadata?: {
    name?: string;
    preferred_username?: string;
  };
};

const initialSnapshot: Snapshot = { conversations: [], messages: {} };

let cache: Snapshot | null = null;
const listeners = new Set<() => void>();

function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const samePair = (request: DemoRequest, viewerId: string, participantId: string) =>
  (
    request.requesterId === viewerId
    && request.recipientId === participantId
  ) || (
    request.requesterId === participantId
    && request.recipientId === viewerId
  );

const sortRequestsNewestFirst = (left: DemoRequest, right: DemoRequest) =>
  right.createdAt.localeCompare(left.createdAt);

const initialsFor = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || '?';

export async function currentChatUserId() {
  const raw = await AsyncStorage.getItem(DEMO_SESSION_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { user?: { id?: unknown } };
      if (typeof parsed.user?.id === 'string') return parsed.user.id;
    } catch {
      // fall through to Supabase session lookup below
    }
  }
  if (supabase) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (typeof user?.id === 'string') return user.id;
    } catch {
      // no-op
    }
  }
  return CURRENT_USER_ID;
}

export async function seedChatContact(contact: ChatContact) {
  const raw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
  let profiles: LocalProfileRecord[] = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      profiles = Array.isArray(parsed) ? parsed.filter(isProfileRecord) : [];
    } catch {
      profiles = [];
    }
  }

  const next: LocalProfileRecord = {
    ...contact,
    discoverable: true,
    usernameDiscoverable: true,
    phoneDiscoverable: Boolean(contact.phone),
  };

  const merged = [next, ...profiles.filter((profile) => profile.id !== contact.id)];
  await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(merged));
}

async function readSnapshot(): Promise<Snapshot> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cache = raw ? JSON.parse(raw) as Snapshot : initialSnapshot;
  return cache;
}

function isProfileRecord(value: unknown): value is LocalProfileRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.username === 'string' && typeof item.avatarLabel === 'string';
}

function isDemoIdentityRecord(value: unknown): value is DemoIdentityRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as DemoIdentityRecord;
  return typeof item.id === 'string';
}

function demoIdentityToProfile(identity: DemoIdentityRecord): LocalProfileRecord | null {
  const username = typeof identity.user_metadata?.preferred_username === 'string'
    ? identity.user_metadata.preferred_username.trim().toLocaleLowerCase().replace(/^@/, '')
    : '';
  const name = typeof identity.user_metadata?.name === 'string'
    ? identity.user_metadata.name.trim()
    : username;
  if (!username || !name) return null;
  return {
    id: identity.id,
    name,
    username,
    avatarLabel: initialsFor(name),
    phone: typeof identity.phone === 'string' ? normalizePhone(identity.phone) : undefined,
    discoverable: true,
    usernameDiscoverable: true,
    phoneDiscoverable: true,
    isOnline: false,
  };
}

async function rememberDemoIdentity(identity: DemoIdentityRecord) {
  const raw = await AsyncStorage.getItem(DEMO_USERS_STORAGE_KEY);
  let parsed: unknown = [];
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  const users = Array.isArray(parsed) ? parsed.filter(isDemoIdentityRecord) : [];
  await AsyncStorage.setItem(
    DEMO_USERS_STORAGE_KEY,
    JSON.stringify([identity, ...users.filter((user) => user.id !== identity.id)]),
  );
}

async function readProfiles(): Promise<LocalProfileRecord[]> {
  const raw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
  let profiles: LocalProfileRecord[] = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      profiles = Array.isArray(parsed) ? parsed.filter(isProfileRecord) : [];
    } catch {
      profiles = [];
    }
  }

  const demoProfiles: LocalProfileRecord[] = [];
  seededDemoIdentities.forEach((identity) => {
    const profile = demoIdentityToProfile(identity);
    if (profile) demoProfiles.push(profile);
  });

  const sessionRaw = await AsyncStorage.getItem(DEMO_SESSION_STORAGE_KEY);
  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw) as { user?: unknown };
      if (isDemoIdentityRecord(session.user)) {
        const sessionProfile = demoIdentityToProfile(session.user);
        if (sessionProfile) {
          demoProfiles.push(sessionProfile);
          await rememberDemoIdentity(session.user);
        }
      }
    } catch {
      // Ignore malformed legacy sessions. AuthContext owns session cleanup.
    }
  }

  const demoRaw = await AsyncStorage.getItem(DEMO_USERS_STORAGE_KEY);
  if (!demoRaw) {
    const merged = new Map<string, LocalProfileRecord>();
    [...profiles, ...demoProfiles].forEach((profile) => merged.set(profile.id, profile));
    return [...merged.values()];
  }
  try {
    const parsed: unknown = JSON.parse(demoRaw);
    const storedDemoProfiles = Array.isArray(parsed)
      ? parsed.flatMap((candidate): LocalProfileRecord[] => {
          if (!isDemoIdentityRecord(candidate)) return [];
          const profile = demoIdentityToProfile(candidate);
          return profile ? [profile] : [];
        })
      : [];
    const merged = new Map<string, LocalProfileRecord>();
    [...profiles, ...demoProfiles, ...storedDemoProfiles].forEach((profile) => merged.set(profile.id, profile));
    return [...merged.values()];
  } catch {
    const merged = new Map<string, LocalProfileRecord>();
    [...profiles, ...demoProfiles].forEach((profile) => merged.set(profile.id, profile));
    return [...merged.values()];
  }
}

async function readDemoRequests(): Promise<DemoRequest[]> {
  const raw = await AsyncStorage.getItem(DEMO_REQUESTS_STORAGE_KEY);
  if (!raw) {
    const seeded = seededDemoMessageRequests.map((request) => ({ ...request, status: 'pending' as const }));
    await writeDemoRequests(seeded);
    return seeded;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const stored = Array.isArray(parsed)
      ? parsed.filter((item): item is DemoRequest => {
          if (!item || typeof item !== 'object') return false;
          const candidate = item as DemoRequest;
          return typeof candidate.requesterId === 'string'
            && typeof candidate.recipientId === 'string'
            && typeof candidate.note === 'string'
            && (candidate.status === 'pending' || candidate.status === 'accepted')
            && typeof candidate.createdAt === 'string';
        })
      : [];
    const next = [...stored];
    seededDemoMessageRequests.forEach((seed) => {
      const existingIndex = next.findIndex((request) => request.requesterId === seed.requesterId && request.recipientId === seed.recipientId);
      if (existingIndex === -1) {
        next.push({ ...seed, status: 'pending' as const });
      } else if (next[existingIndex]?.status !== 'accepted' && next[existingIndex]?.status !== 'pending') {
        next[existingIndex] = { ...next[existingIndex], ...seed, status: 'pending' as const };
      }
    });
    if (JSON.stringify(next) !== JSON.stringify(stored)) {
      await writeDemoRequests(next);
    }
    return next;
  } catch {
    const seeded = seededDemoMessageRequests.map((request) => ({ ...request, status: 'pending' as const }));
    await writeDemoRequests(seeded);
    return seeded;
  }
}

async function writeDemoRequests(requests: DemoRequest[]) {
  await AsyncStorage.setItem(DEMO_REQUESTS_STORAGE_KEY, JSON.stringify(requests));
}

const normalizeLookup = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/^@/, '');

const normalizePhone = (value: string) => value.replace(/\D+/g, '');

const searchableValues = (profile: LocalProfileRecord) => [
  profile.name,
  profile.usernameDiscoverable === false ? '' : profile.username,
  profile.phoneDiscoverable === false ? '' : profile.phone ?? '',
];

const conversationFor = (
  contact: ChatContact,
  status: Conversation['requestStatus'],
  note?: string,
): Conversation => ({
  id: contact.id,
  participant: contact,
  unreadCount: status === 'pending_incoming' ? 1 : 0,
  updatedAt: new Date().toISOString(),
  requestStatus: status,
  requestMessage: note,
});

export const messageThreadKey = (viewerId: string, participantId: string) =>
  [viewerId, participantId].sort().join(':');

const presentMessageForViewer = (message: ChatMessage, viewerId: string): ChatMessage => ({
  ...message,
  senderId: message.senderId === viewerId ? CURRENT_USER_ID : message.senderId,
});

export async function ingestChatMessage(message: ChatMessage) {
  const snapshot = await readSnapshot();
  const existing = snapshot.messages[message.conversationId] ?? [];
  if (existing.some((item) => item.id === message.id)) return;
  await saveSnapshot({
    ...snapshot,
    messages: {
      ...snapshot.messages,
      [message.conversationId]: [...existing, message],
    },
  });
}

const requestPriority = (status: Conversation['requestStatus']) => {
  if (status === 'pending_incoming') return 4;
  if (status === 'accepted') return 3;
  if (status === 'pending_outgoing') return 1;
  return 0;
};

function upsertPrioritizedConversation(
  byParticipant: Map<string, Conversation>,
  conversation: Conversation,
) {
  const existing = byParticipant.get(conversation.id);
  if (!existing) {
    byParticipant.set(conversation.id, conversation);
    return;
  }
  const existingPriority = requestPriority(existing.requestStatus);
  const nextPriority = requestPriority(conversation.requestStatus);
  if (
    nextPriority > existingPriority
    || (nextPriority === existingPriority && conversation.updatedAt > existing.updatedAt)
  ) {
    byParticipant.set(conversation.id, {
      ...conversation,
      unreadCount: Math.max(existing.unreadCount, conversation.unreadCount),
    });
  }
}

function resolvePairConversation(
  viewerId: string,
  participant: ChatContact,
  requests: DemoRequest[],
): Conversation | null {
  const pairRequests = requests
    .filter((request) => samePair(request, viewerId, participant.id))
    .sort(sortRequestsNewestFirst);
  if (pairRequests.length === 0) return null;

  const accepted = pairRequests.find((request) => request.status === 'accepted');
  if (accepted) {
    return {
      id: participant.id,
      participant,
      unreadCount: 0,
      updatedAt: accepted.createdAt,
      requestStatus: 'accepted',
      requestMessage: accepted.note,
    };
  }

  const latest = pairRequests[0];
  const incoming = latest.recipientId === viewerId;
  return {
    id: participant.id,
    participant,
    unreadCount: incoming ? 1 : 0,
    updatedAt: latest.createdAt,
    requestStatus: incoming ? 'pending_incoming' : 'pending_outgoing',
    requestMessage: latest.note,
  };
}

async function saveSnapshot(snapshot: Snapshot) {
  cache = snapshot;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  listeners.forEach((listener) => listener());
}

/**
 * Device-first repository. Its interface matches a remote implementation, so a
 * Supabase-backed data source can be injected without changing this screen.
 */
export const localChatRepository: ChatDataSource = {
  async listConversations() {
    const viewerId = await currentChatUserId();
    const snapshot = await readSnapshot();
    const profiles = await readProfiles();
    const requests = await readDemoRequests();
    const requestConversationsByParticipant = new Map<string, Conversation>();
    const participantIds = [...new Set(
      requests.flatMap((request) => {
        if (request.requesterId !== viewerId && request.recipientId !== viewerId) return [];
        return [request.requesterId === viewerId ? request.recipientId : request.requesterId];
      }),
    )];
    participantIds.forEach((participantId) => {
      const participant = profiles.find((profile) => profile.id === participantId);
      if (!participant) return;
      const conversation = resolvePairConversation(viewerId, participant, requests);
      if (!conversation) return;
      upsertPrioritizedConversation(requestConversationsByParticipant, conversation);
    });
    const requestConversations = [...requestConversationsByParticipant.values()];
    const withLatestMessages = requestConversations.map((conversation) => {
      const threadKey = messageThreadKey(viewerId, conversation.participant.id);
      const threadMessages = snapshot.messages[threadKey] ?? [];
      const lastStoredMessage = threadMessages[threadMessages.length - 1];
      if (!lastStoredMessage) return conversation;
      const lastMessage = presentMessageForViewer(lastStoredMessage, viewerId);
      return {
        ...conversation,
        lastMessage,
        updatedAt: lastStoredMessage.createdAt > conversation.updatedAt ? lastStoredMessage.createdAt : conversation.updatedAt,
        unreadCount: lastStoredMessage.senderId !== viewerId ? Math.max(conversation.unreadCount, 1) : conversation.unreadCount,
      };
    });
    const localOnly = snapshot.conversations.filter((conversation) =>
      conversation.participant.id !== viewerId
      && !withLatestMessages.some((request) => request.id === conversation.id)
    );
    return sortConversations([...withLatestMessages, ...localOnly]);
  },
  async listMessages(conversationId) {
    const viewerId = await currentChatUserId();
    const snapshot = await readSnapshot();
    const threadKey = messageThreadKey(viewerId, conversationId);
    return (snapshot.messages[threadKey] ?? []).map((message) => presentMessageForViewer(message, viewerId));
  },
  async sendMessage(input) {
    const { conversationId, text, type = 'text', post } = input;
    const viewerId = await currentChatUserId();
    const threadKey = messageThreadKey(viewerId, conversationId);
    const message: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: threadKey,
      senderId: viewerId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      status: 'sent',
      type,
      post,
    };
    const snapshot = await readSnapshot();
    const target = snapshot.conversations.find((conversation) => conversation.id === conversationId);
    const requests = await readDemoRequests();
    const pairRequests = requests.filter((request) => samePair(request, viewerId, conversationId));
    const hasAcceptedRequest = pairRequests.some((request) => request.status === 'accepted');
    if (
      !hasAcceptedRequest
      && (
        (target?.requestStatus && target.requestStatus !== 'accepted')
        || pairRequests.length > 0
      )
    ) {
      throw new Error('Message request has not been accepted.');
    }
    const messages = [...(snapshot.messages[threadKey] ?? []), message];
    const conversations = snapshot.conversations.map((conversation) => conversation.id === conversationId
      ? { ...conversation, lastMessage: presentMessageForViewer(message, viewerId), unreadCount: 0, updatedAt: message.createdAt }
      : conversation);
    await saveSnapshot({ conversations, messages: { ...snapshot.messages, [threadKey]: messages } });
    return presentMessageForViewer(message, viewerId);
  },
  async searchContacts(query) {
    const viewerId = await currentChatUserId();
    const normalized = normalizeLookup(query);
    const normalizedPhone = normalizePhone(query);
    if (!normalized) return [];
    const profiles = await readProfiles();
    const matches = profiles.filter((profile) => profile.id !== viewerId && profile.discoverable !== false && searchableValues(profile).some((value) => {
      const candidate = value.toLocaleLowerCase().replace(/^@/, '');
      const phoneCandidate = normalizePhone(value);
      if (!candidate.trim()) return false;
      return candidate.includes(normalized) || (!!normalizedPhone && phoneCandidate.includes(normalizedPhone));
    }));
    return matches;
  },
  async openDirectConversation(contactId) {
    const contact = (await readProfiles()).find((entry) => entry.id === contactId && entry.id !== CURRENT_USER_ID && entry.discoverable !== false);
    if (!contact) throw new Error('Contact not found.');
    const snapshot = await readSnapshot();
    const existing = snapshot.conversations.find((conversation) => conversation.id === contact.id);
    if (existing) return existing;
    const conversation = conversationFor(contact, 'accepted');
    await saveSnapshot({ ...snapshot, conversations: [...snapshot.conversations, conversation], messages: { ...snapshot.messages, [conversation.id]: [] } });
    return conversation;
  },
  async sendMessageRequest(contact, note) {
    const viewerId = await currentChatUserId();
    const cleanNote = note?.trim() || `Hi ${contact.name}, I would like to message you on Social 24x7.`;
    const requests = await readDemoRequests();
    const pairRequests = requests.filter((request) => samePair(request, viewerId, contact.id));
    const hasAcceptedRequest = pairRequests.some((request) => request.status === 'accepted');
    const hasIncomingPending = pairRequests.some(
      (request) =>
        request.requesterId === contact.id
        && request.recipientId === viewerId
        && request.status === 'pending',
    );
    const nowIso = new Date().toISOString();

    if (hasAcceptedRequest || hasIncomingPending) {
      await writeDemoRequests(requests.map((request) => (
        samePair(request, viewerId, contact.id)
          ? { ...request, status: 'accepted' as const }
          : request
      )));
      const snapshot = await readSnapshot();
      const accepted = {
        ...(snapshot.conversations.find((conversation) => conversation.id === contact.id) ?? conversationFor(contact, 'accepted')),
        requestStatus: 'accepted' as const,
        requestMessage: cleanNote,
        unreadCount: 0,
        updatedAt: nowIso,
      };
      await saveSnapshot({
        ...snapshot,
        conversations: snapshot.conversations.some((conversation) => conversation.id === contact.id)
          ? snapshot.conversations.map((conversation) => conversation.id === contact.id ? accepted : conversation)
          : [...snapshot.conversations, accepted],
        messages: { ...snapshot.messages, [messageThreadKey(viewerId, contact.id)]: snapshot.messages[messageThreadKey(viewerId, contact.id)] ?? [] },
      });
      return accepted;
    }

    const nextRequest: DemoRequest = {
      requesterId: viewerId,
      recipientId: contact.id,
      note: cleanNote,
      status: 'pending',
      createdAt: nowIso,
    };
    await writeDemoRequests([
      nextRequest,
      ...requests.filter((request) => !(request.requesterId === viewerId && request.recipientId === contact.id)),
    ]);
    const snapshot = await readSnapshot();
    const existing = snapshot.conversations.find((conversation) => conversation.id === contact.id);
    if (existing) {
      const updated = {
        ...existing,
        requestStatus: existing.requestStatus === 'accepted' ? 'accepted' as const : 'pending_outgoing' as const,
        requestMessage: cleanNote || existing.requestMessage,
        updatedAt: new Date().toISOString(),
      };
      await saveSnapshot({
        ...snapshot,
        conversations: snapshot.conversations.map((conversation) => conversation.id === updated.id ? updated : conversation),
      });
      return updated;
    }
    const conversation = conversationFor(contact, 'pending_outgoing', cleanNote);
    await saveSnapshot({
      ...snapshot,
      conversations: [...snapshot.conversations, conversation],
      messages: { ...snapshot.messages, [conversation.id]: [] },
    });
    return conversation;
  },
  async acceptMessageRequest(conversationId) {
    const viewerId = await currentChatUserId();
    const requests = await readDemoRequests();
    await writeDemoRequests(requests.map((request) => (
      samePair(request, viewerId, conversationId)
        ? { ...request, status: 'accepted' as const }
        : request
    )));
    const snapshot = await readSnapshot();
    const existing = snapshot.conversations.find((conversation) => conversation.id === conversationId);
    if (!existing) {
      const contact = (await readProfiles()).find((entry) => entry.id === conversationId);
      if (!contact) throw new Error('Conversation not found.');
      const accepted = conversationFor(contact, 'accepted');
      await saveSnapshot({
        ...snapshot,
        conversations: [...snapshot.conversations, accepted],
        messages: { ...snapshot.messages, [accepted.id]: snapshot.messages[accepted.id] ?? [] },
      });
      return accepted;
    }
    const accepted = { ...existing, requestStatus: 'accepted' as const, unreadCount: 0, updatedAt: new Date().toISOString() };
    await saveSnapshot({
      ...snapshot,
      conversations: snapshot.conversations.map((conversation) => conversation.id === conversationId ? accepted : conversation),
    });
    return accepted;
  },
  async markConversationRead(conversationId) {
    const snapshot = await readSnapshot();
    await saveSnapshot({
      ...snapshot,
      conversations: snapshot.conversations.map((conversation) => conversation.id === conversationId
        ? { ...conversation, unreadCount: 0 }
        : conversation),
    });
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
