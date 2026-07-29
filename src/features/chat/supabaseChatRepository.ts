import type {
  RealtimeChannel,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';

import { localChatRepository } from './chatRepository';
import type {
  ChatContact,
  ChatDataSource,
  ChatMessage,
  Conversation,
} from './types';

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  phone?: string | null;
  phone_discoverable?: boolean | null;
  username_discoverable?: boolean | null;
  is_private: boolean | null;
};

type RequestRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  created_at: string;
};

type ParticipantRow = {
  user_id: string;
  last_read_at: string | null;
  profiles: ProfileRow | ProfileRow[] | null;
};

type ConversationRow = {
  id: string;
  kind: 'personal' | 'business' | 'group' | 'support';
  created_by: string;
  created_at: string;
  updated_at: string;
  conversation_participants: ParticipantRow[] | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  client_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

const isUuid = (value?: string | null) =>
  Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));

const normalizeLookup = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/^@/, '')
    .replace(/[%*,()]/g, '');

const normalizePhone = (value: string) => value.replace(/\D+/g, '');

const initialsFor = (name: string) => (name.trim()[0] || '?').toUpperCase();

const firstRelation = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const unique = <T>(values: T[]) => [...new Set(values)];

const toContact = (row: ProfileRow): ChatContact => {
  const name = row.display_name?.trim() || row.username || 'Social 24x7 user';
  return {
    id: row.id,
    name,
    avatarLabel: initialsFor(name),
    username: row.username || row.id.slice(0, 8),
    phone: row.phone_discoverable ? row.phone || undefined : undefined,
    isOnline: false,
  };
};

const samePair = (request: RequestRow, viewerId: string, participantId: string) =>
  (
    request.requester_id === viewerId
    && request.recipient_id === participantId
  ) || (
    request.requester_id === participantId
    && request.recipient_id === viewerId
  );

const requestStateFor = (
  requests: RequestRow[],
  viewerId: string,
  participantId: string,
): { status: Conversation['requestStatus']; createdAt: string; requestId: string } | null => {
  const pairRequests = requests
    .filter((request) => samePair(request, viewerId, participantId))
    .sort((left, right) => right.created_at.localeCompare(left.created_at));

  if (!pairRequests.length) return null;

  const accepted = pairRequests.find((request) => request.status === 'accepted');
  if (accepted) {
    return {
      status: 'accepted',
      createdAt: accepted.created_at,
      requestId: accepted.id,
    };
  }

  const latest = pairRequests[0];
  return {
    status:
      latest.requester_id === viewerId ? 'pending_outgoing' : 'pending_incoming',
    createdAt: latest.created_at,
    requestId: latest.id,
  };
};

const toMessage = (row: MessageRow): ChatMessage => {
  const payload = row.payload ?? {};
  const hasSharedPost = row.kind === 'product' && payload && typeof payload === 'object' && 'post' in payload;
  const hasSticker = payload && typeof payload === 'object' && payload.sticker === true;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id ?? '',
    text: row.body ?? '',
    createdAt: row.created_at,
    status: 'delivered',
    type: hasSharedPost ? 'shared_post' : hasSticker ? 'sticker' : 'text',
    post: hasSharedPost ? (payload.post as ChatMessage['post']) : undefined,
  };
};

const createClientMessageId = () => {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return randomId;
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createSupabaseChatRepository = ({
  client,
  user,
}: {
  client: SupabaseClient;
  user: User | null;
}): ChatDataSource => {
  const viewerId = user?.id && isUuid(user.id) ? user.id : null;
  const listeners = new Set<() => void>();
  let channel: RealtimeChannel | null = null;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const fetchPairRequests = async (participantId: string) => {
    if (!viewerId) return [] as RequestRow[];
    const { data, error } = await client
      .from('connection_requests')
      .select('id,requester_id,recipient_id,status,created_at')
      .or(`and(requester_id.eq.${viewerId},recipient_id.eq.${participantId}),and(requester_id.eq.${participantId},recipient_id.eq.${viewerId})`)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data as RequestRow[] | null) ?? [];
  };

  const fetchPersonalConversationRows = async () => {
    const { data, error } = await client
      .from('conversations')
      .select(`
        id,
        kind,
        created_by,
        created_at,
        updated_at,
        conversation_participants(
          user_id,
          last_read_at,
          profiles!conversation_participants_user_id_fkey(
            id,
            username,
            display_name,
            phone,
            phone_discoverable,
            username_discoverable,
            is_private
          )
        )
      `)
      .eq('kind', 'personal')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return (data as ConversationRow[] | null) ?? [];
  };

  const fetchMessagesByConversationIds = async (conversationIds: string[]) => {
    if (!conversationIds.length) return new Map<string, MessageRow[]>();
    const { data, error } = await client
      .from('messages')
      .select('id,conversation_id,sender_id,kind,body,payload,client_id,created_at,edited_at,deleted_at')
      .in('conversation_id', conversationIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    const grouped = new Map<string, MessageRow[]>();
    ((data as MessageRow[] | null) ?? []).forEach((row) => {
      const next = grouped.get(row.conversation_id) ?? [];
      next.push(row);
      grouped.set(row.conversation_id, next);
    });
    return grouped;
  };

  const findConversationForParticipant = (
    rows: ConversationRow[],
    participantId: string,
  ) =>
    rows.find((row) => {
      const participantIds = (row.conversation_participants ?? []).map(
        (participant) => participant.user_id,
      );
      return participantIds.includes(participantId) && participantIds.includes(viewerId ?? '');
    }) ?? null;

  const fetchContact = async (contactId: string): Promise<ChatContact | null> => {
    const { data, error } = await client
      .from('profiles')
      .select('id,username,display_name,phone,phone_discoverable,username_discoverable,is_private')
      .eq('id', contactId)
      .maybeSingle();

    if (error || !data) return null;
    return toContact(data as ProfileRow);
  };

  const ensureAcceptedConversation = async (participantId: string) => {
    if (!viewerId) throw new Error('Authentication required.');
    if (!isUuid(participantId) || participantId === viewerId) {
      throw new Error('Invalid participant.');
    }

    const requests = await fetchPairRequests(participantId);
    if (!requests.some((request) => request.status === 'accepted')) {
      throw new Error('Message request has not been accepted.');
    }

    const existingRows = await fetchPersonalConversationRows();
    const existing = findConversationForParticipant(existingRows, participantId);
    if (existing) return existing;

    const { data: insertedConversation, error: insertConversationError } = await client
      .from('conversations')
      .insert({
        kind: 'personal',
        created_by: viewerId,
      })
      .select('id,kind,created_by,created_at,updated_at')
      .single();

    if (insertConversationError) {
      throw new Error(insertConversationError.message);
    }

    const { error: insertParticipantsError } = await client
      .from('conversation_participants')
      .upsert(
        [
          { conversation_id: insertedConversation.id, user_id: viewerId },
          { conversation_id: insertedConversation.id, user_id: participantId },
        ],
        { onConflict: 'conversation_id,user_id' },
      );

    if (insertParticipantsError) {
      const retriedRows = await fetchPersonalConversationRows();
      const retried = findConversationForParticipant(retriedRows, participantId);
      if (retried) return retried;
      throw new Error(insertParticipantsError.message);
    }

    const finalRows = await fetchPersonalConversationRows();
    const created = finalRows.find((row) => row.id === insertedConversation.id);
    if (!created) {
      throw new Error('Conversation was created but could not be loaded.');
    }
    return created;
  };

  const resolveConversationId = async (conversationIdOrParticipantId: string) => {
    if (!viewerId) throw new Error('Authentication required.');
    const rows = await fetchPersonalConversationRows();
    const directConversation = rows.find((row) => row.id === conversationIdOrParticipantId);
    if (directConversation) return directConversation.id;
    const ensured = await ensureAcceptedConversation(conversationIdOrParticipantId);
    return ensured.id;
  };

  const toConversation = ({
    row,
    latestMessage,
    viewerProfileId,
    requestStatus,
    requestMessage,
  }: {
    row: ConversationRow;
    latestMessage?: MessageRow;
    viewerProfileId: string;
    requestStatus?: Conversation['requestStatus'];
    requestMessage?: string;
  }): Conversation => {
    const otherParticipant = (row.conversation_participants ?? []).find(
      (participant) => participant.user_id !== viewerProfileId,
    );
    const profile = firstRelation(otherParticipant?.profiles);
    const contact = profile ? toContact(profile) : {
      id: otherParticipant?.user_id ?? row.created_by,
      name: 'Social 24x7 user',
      avatarLabel: 'S',
      username: (otherParticipant?.user_id ?? row.created_by).slice(0, 8),
      isOnline: false,
    };

    const viewerParticipant = (row.conversation_participants ?? []).find(
      (participant) => participant.user_id === viewerProfileId,
    );
    const unreadCount = latestMessage
      && latestMessage.sender_id
      && latestMessage.sender_id !== viewerProfileId
      && (
        !viewerParticipant?.last_read_at
        || latestMessage.created_at > viewerParticipant.last_read_at
      )
      ? 1
      : 0;

    return {
      id: row.id,
      participant: contact,
      lastMessage: latestMessage ? toMessage(latestMessage) : undefined,
      unreadCount,
      updatedAt: latestMessage?.created_at || row.updated_at || row.created_at,
      requestStatus,
      requestMessage,
    };
  };

  const ensureLiveSync = () => {
    if (!viewerId || channel) return;

    channel = client
      .channel(`personal-chat:${viewerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connection_requests' },
        notify,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_participants' },
        notify,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        notify,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        notify,
      )
      .subscribe();

    if (!pollingTimer) {
      pollingTimer = setInterval(() => {
        notify();
      }, 3000);
    }
  };

  const stopLiveSync = () => {
    if (channel) {
      void client.removeChannel(channel);
      channel = null;
    }
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };

  return {
    async listConversations() {
      if (!viewerId) return [];

      const { data, error } = await client
        .from('connection_requests')
        .select('id,requester_id,recipient_id,status,created_at')
        .or(`requester_id.eq.${viewerId},recipient_id.eq.${viewerId}`)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      const requests = (data as RequestRow[] | null) ?? [];
      const acceptedParticipantIds = unique(
        requests
          .filter((request) => request.status === 'accepted')
          .map((request) => (request.requester_id === viewerId ? request.recipient_id : request.requester_id)),
      );

      for (const participantId of acceptedParticipantIds) {
        await ensureAcceptedConversation(participantId);
      }

      const conversationRows = await fetchPersonalConversationRows();
      const messagesByConversationId = await fetchMessagesByConversationIds(
        conversationRows.map((row) => row.id),
      );

      const acceptedConversations = conversationRows.map((row) => {
        const otherId = (row.conversation_participants ?? []).find(
          (participant) => participant.user_id !== viewerId,
        )?.user_id;
        const requestState = otherId
          ? requestStateFor(requests, viewerId, otherId)
          : null;
        const latestMessage = (messagesByConversationId.get(row.id) ?? []).at(-1);
        return toConversation({
          row,
          latestMessage,
          viewerProfileId: viewerId,
          requestStatus: requestState?.status ?? 'accepted',
          requestMessage:
            requestState?.status === 'pending_outgoing'
              ? undefined
              : requestState?.status === 'pending_incoming'
                ? undefined
                : undefined,
        });
      });

      const pendingParticipantIds = unique(
        requests
          .filter((request) => request.status !== 'accepted')
          .map((request) => (request.requester_id === viewerId ? request.recipient_id : request.requester_id)),
      );

      const pendingProfiles = pendingParticipantIds.length
        ? await client
          .from('profiles')
          .select('id,username,display_name,phone,phone_discoverable,username_discoverable,is_private')
          .in('id', pendingParticipantIds)
        : { data: [] as ProfileRow[] | null, error: null };

      if (pendingProfiles.error) throw new Error(pendingProfiles.error.message);

      const pendingConversations = ((pendingProfiles.data as ProfileRow[] | null) ?? [])
        .map((profile): Conversation | null => {
          const state = requestStateFor(requests, viewerId, profile.id);
          if (!state || state.status === 'accepted') return null;
          const contact = toContact(profile);
          return {
            id: profile.id,
            participant: contact,
            unreadCount: state.status === 'pending_incoming' ? 1 : 0,
            updatedAt: state.createdAt,
            requestStatus: state.status,
            requestMessage:
              state.status === 'pending_outgoing'
                ? `Hi ${contact.name}, I would like to message you on Social 24x7.`
                : `${contact.name} wants to message you on Social 24x7.`,
          };
        })
        .filter((conversation): conversation is Conversation => conversation !== null);

      return [...acceptedConversations, ...pendingConversations].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
    },

    async listMessages(conversationId) {
      if (!viewerId) return [];
      const resolvedConversationId = await resolveConversationId(conversationId);
      const { data, error } = await client
        .from('messages')
        .select('id,conversation_id,sender_id,kind,body,payload,client_id,created_at,edited_at,deleted_at')
        .eq('conversation_id', resolvedConversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) throw new Error(error.message);
      return ((data as MessageRow[] | null) ?? []).map(toMessage);
    },

    async sendMessage(input) {
      if (!viewerId) throw new Error('Authentication required.');
      const text = input.text.trim();
      if (!text) throw new Error('Message cannot be empty.');

      const resolvedConversationId = await resolveConversationId(input.conversationId);
      const kind = input.type === 'shared_post' ? 'product' : 'text';
      const payload =
        input.type === 'shared_post' && input.post
          ? { post: input.post }
          : input.type === 'sticker'
            ? { sticker: true }
            : {};

      const { data, error } = await client
        .from('messages')
        .insert({
          conversation_id: resolvedConversationId,
          sender_id: viewerId,
          kind,
          body: text,
          payload,
          client_id: createClientMessageId(),
        })
        .select('id,conversation_id,sender_id,kind,body,payload,client_id,created_at,edited_at,deleted_at')
        .single();

      if (error) throw new Error(error.message);
      notify();
      return toMessage(data as MessageRow);
    },

    async markConversationRead(conversationId) {
      if (!viewerId) return;
      const resolvedConversationId = await resolveConversationId(conversationId);
      const { error } = await client
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', resolvedConversationId)
        .eq('user_id', viewerId);

      if (error) throw new Error(error.message);
    },

    async searchContacts(query) {
      const local = await localChatRepository.searchContacts(query);
      const normalized = normalizeLookup(query);
      const digits = normalizePhone(query);
      if (!normalized && !digits) return local;

      const clauses = [`display_name.ilike.%${normalized}%`];
      if (normalized.length >= 1) clauses.push(`username.eq.${normalized}`);
      if (normalized.length >= 2) clauses.push(`username.ilike.%${normalized}%`);
      if (digits.length >= 6) clauses.push(`phone.ilike.%${digits}%`);

      const { data, error } = await client
        .from('profiles')
        .select('id,username,display_name,phone,phone_discoverable,username_discoverable,is_private')
        .eq('is_private', false)
        .or(clauses.join(','))
        .limit(20);

      if (error || !data) return local;

      const remote = (data as ProfileRow[])
        .filter((profile) => profile.id !== viewerId)
        .filter((profile) => {
          const nameMatches = profile.display_name?.toLocaleLowerCase().includes(normalized);
          const usernameMatches = profile.username_discoverable !== false && profile.username?.toLocaleLowerCase().includes(normalized);
          const phoneMatches = digits.length >= 6 && profile.phone_discoverable === true && normalizePhone(profile.phone || '').includes(digits);
          return nameMatches || usernameMatches || phoneMatches;
        })
        .map(toContact);

      const merged = new Map<string, ChatContact>();
      [...remote, ...local].forEach((contact) => merged.set(contact.id, contact));
      return [...merged.values()];
    },

    async openDirectConversation(contactId) {
      if (!viewerId) throw new Error('Authentication required.');
      const row = await ensureAcceptedConversation(contactId);
      const latestMessage = (
        await fetchMessagesByConversationIds([row.id])
      ).get(row.id)?.at(-1);
      return toConversation({
        row,
        latestMessage,
        viewerProfileId: viewerId,
        requestStatus: 'accepted',
      });
    },

    async sendMessageRequest(contact) {
      if (!viewerId || !isUuid(contact.id)) {
        return localChatRepository.sendMessageRequest(contact);
      }

      const pairRequests = await fetchPairRequests(contact.id);
      const hasAccepted = pairRequests.some((request) => request.status === 'accepted');
      const hasIncomingPending = pairRequests.some(
        (request) =>
          request.requester_id === contact.id
          && request.recipient_id === viewerId
          && request.status === 'pending',
      );

      if (hasAccepted || hasIncomingPending) {
        const { error } = await client
          .from('connection_requests')
          .update({ status: 'accepted' })
          .or(`and(requester_id.eq.${viewerId},recipient_id.eq.${contact.id}),and(requester_id.eq.${contact.id},recipient_id.eq.${viewerId})`);

        if (error) throw new Error(error.message);
        notify();
        return this.openDirectConversation(contact.id);
      }

      const { error } = await client
        .from('connection_requests')
        .upsert(
          {
            requester_id: viewerId,
            recipient_id: contact.id,
            status: 'pending',
          },
          { onConflict: 'requester_id,recipient_id' },
        );

      if (error) throw new Error(error.message);
      notify();

      return {
        id: contact.id,
        participant: contact,
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
        requestStatus: 'pending_outgoing',
        requestMessage: `Hi ${contact.name}, I would like to message you on Social 24x7.`,
      };
    },

    async acceptMessageRequest(conversationId) {
      if (!viewerId || !isUuid(conversationId)) {
        return localChatRepository.acceptMessageRequest(conversationId);
      }

      const { error } = await client
        .from('connection_requests')
        .update({ status: 'accepted' })
        .eq('requester_id', conversationId)
        .eq('recipient_id', viewerId);

      if (error) throw new Error(error.message);
      notify();
      return this.openDirectConversation(conversationId);
    },

    subscribe(listener) {
      listeners.add(listener);
      ensureLiveSync();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stopLiveSync();
        }
      };
    },
  };
};
