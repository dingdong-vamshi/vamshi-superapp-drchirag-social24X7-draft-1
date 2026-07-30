import type {
  RealtimeChannel,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';

import type {
  ChatContact,
  ChatDataSource,
  ChatMessage,
  ChatReportInput,
  Conversation,
  ExportedConversation,
  MessageReaction,
} from './types';
import { CURRENT_USER_ID } from './types';

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
  archived_at?: string | null;
  manually_unread_at?: string | null;
  pinned_at?: string | null;
  cleared_at?: string | null;
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

type MessageReactionRow = {
  message_id: string;
  user_id: string;
  reaction: string;
  updated_at: string;
};

const SUPPORTED_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'] as const;

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

const toMessage = (
  row: MessageRow,
  viewerId?: string | null,
  reactions: MessageReaction[] = [],
): ChatMessage => {
  const payload = row.payload ?? {};
  const hasSharedPost = row.kind === 'product' && payload && typeof payload === 'object' && 'post' in payload;
  const hasSticker = payload && typeof payload === 'object' && payload.sticker === true;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id && row.sender_id === viewerId ? CURRENT_USER_ID : row.sender_id ?? '',
    text: row.body ?? '',
    createdAt: row.created_at,
    status: 'delivered',
    type: hasSharedPost ? 'shared_post' : hasSticker ? 'sticker' : 'text',
    post: hasSharedPost ? (payload.post as ChatMessage['post']) : undefined,
    reactions,
  };
};

const buildReactionMap = (
  rows: MessageReactionRow[],
  viewerId?: string | null,
) => {
  const grouped = new Map<string, Map<string, MessageReaction>>();

  rows.forEach((row) => {
    const messageReactions = grouped.get(row.message_id) ?? new Map<string, MessageReaction>();
    const current = messageReactions.get(row.reaction) ?? {
      emoji: row.reaction,
      count: 0,
      reactedByCurrentUser: false,
    };
    current.count += 1;
    current.reactedByCurrentUser ||= row.user_id === viewerId;
    messageReactions.set(row.reaction, current);
    grouped.set(row.message_id, messageReactions);
  });

  const final = new Map<string, MessageReaction[]>();
  grouped.forEach((reactionMap, messageId) => {
    final.set(
      messageId,
      [...reactionMap.values()].sort((left, right) =>
        SUPPORTED_REACTIONS.indexOf(left.emoji as (typeof SUPPORTED_REACTIONS)[number]) -
        SUPPORTED_REACTIONS.indexOf(right.emoji as (typeof SUPPORTED_REACTIONS)[number]),
      ),
    );
  });
  return final;
};

const createClientMessageId = () => {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return randomId;
  const fallback = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
  return fallback;
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
          archived_at,
          manually_unread_at,
          pinned_at,
          cleared_at,
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

  const fetchReactionMap = async (messageIds: string[]) => {
    if (!messageIds.length) return new Map<string, MessageReaction[]>();
    const { data, error } = await client
      .from('message_reactions')
      .select('message_id,user_id,reaction,updated_at')
      .in('message_id', messageIds);

    if (error) throw new Error(error.message);
    return buildReactionMap((data as MessageReactionRow[] | null) ?? [], viewerId);
  };

  const attachReactions = async (rows: MessageRow[]) => {
    const reactionMap = await fetchReactionMap(rows.map((row) => row.id));
    return rows.map((row) => toMessage(row, viewerId, reactionMap.get(row.id) ?? []));
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

    const { data: conversationId, error } = await client.rpc('open_personal_conversation', {
      participant: participantId,
    });

    if (error) throw new Error(error.message);
    const finalRows = await fetchPersonalConversationRows();
    const created = finalRows.find((row) => row.id === conversationId);
    if (!created) {
      const fallback = findConversationForParticipant(finalRows, participantId);
      if (fallback) return fallback;
      throw new Error('Conversation was opened but could not be loaded.');
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
    messages,
    viewerProfileId,
    requestStatus,
    requestMessage,
  }: {
    row: ConversationRow;
    latestMessage?: MessageRow;
    messages?: MessageRow[];
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
    const allMessages = messages ?? (latestMessage ? [latestMessage] : []);
    const clearedAt = viewerParticipant?.cleared_at ?? null;
    const visibleMessages = clearedAt
      ? allMessages.filter((message) => message.created_at > clearedAt)
      : allMessages;
    const visibleLatestMessage = visibleMessages.at(-1);
    const unreadMessages = visibleMessages
      .filter((message) =>
        message.sender_id
        && message.sender_id !== viewerProfileId
        && (
          !viewerParticipant?.last_read_at
          || message.created_at > viewerParticipant.last_read_at
        ));
    const manualUnread = Boolean(viewerParticipant?.manually_unread_at);
    const unreadCount = unreadMessages.length || (manualUnread ? 1 : 0);

    return {
      id: row.id,
      participant: contact,
      lastMessage: visibleLatestMessage ? toMessage(visibleLatestMessage, viewerProfileId) : undefined,
      unreadCount,
      updatedAt: visibleLatestMessage?.created_at || row.updated_at || row.created_at,
      kind: row.kind,
      isArchived: Boolean(viewerParticipant?.archived_at),
      isManuallyUnread: manualUnread,
      isPinned: Boolean(viewerParticipant?.pinned_at),
      clearedAt,
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        notify,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_notifications' },
        notify,
      )
      .subscribe();

  };

  const stopLiveSync = () => {
    if (channel) {
      void client.removeChannel(channel);
      channel = null;
    }
  };

  const updateParticipantState = async (
    conversationId: string,
    patch: Partial<Pick<ParticipantRow, 'archived_at' | 'manually_unread_at' | 'last_read_at' | 'pinned_at' | 'cleared_at'>>,
  ) => {
    if (!viewerId) throw new Error('Authentication required.');
    const resolvedConversationId = await resolveConversationId(conversationId);
    const { error } = await client
      .from('conversation_participants')
      .update(patch)
      .eq('conversation_id', resolvedConversationId)
      .eq('user_id', viewerId);
    if (error) throw new Error(error.message);
    notify();
  };

  const loadVisibleMessages = async (resolvedConversationId: string) => {
    const { data: participantState, error: participantError } = await client
      .from('conversation_participants')
      .select('cleared_at')
      .eq('conversation_id', resolvedConversationId)
      .eq('user_id', viewerId)
      .maybeSingle();

    if (participantError) throw new Error(participantError.message);

    const clearedAt = (participantState as { cleared_at?: string | null } | null)?.cleared_at ?? null;
    let query = client
      .from('messages')
      .select('id,conversation_id,sender_id,kind,body,payload,client_id,created_at,edited_at,deleted_at')
      .eq('conversation_id', resolvedConversationId)
      .is('deleted_at', null);

    if (clearedAt) {
      query = query.gt('created_at', clearedAt);
    }

    const { data, error } = await query
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) throw new Error(error.message);
    return attachReactions((data as MessageRow[] | null) ?? []);
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
        const messages = messagesByConversationId.get(row.id) ?? [];
        const latestMessage = messages.at(-1);
        return toConversation({
          row,
          latestMessage,
          messages,
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
            kind: 'personal',
            isArchived: false,
            requestStatus: state.status,
            requestMessage:
              state.status === 'pending_outgoing'
                ? `Hi ${contact.name}, I would like to message you on Social 24x7.`
                : `${contact.name} wants to message you on Social 24x7.`,
          };
        })
        .filter((conversation): conversation is Conversation => conversation !== null);

      return [...acceptedConversations, ...pendingConversations].sort((left, right) => {
        const pinnedSort = Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned));
        if (pinnedSort) return pinnedSort;
        return right.updatedAt.localeCompare(left.updatedAt);
      });
    },

    async listMessages(conversationId) {
      if (!viewerId) return [];
      const resolvedConversationId = await resolveConversationId(conversationId);
      return loadVisibleMessages(resolvedConversationId);
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

      const { data, error } = await client.rpc('send_personal_message', {
        target_conversation: resolvedConversationId,
        message_body: text,
        message_kind: kind,
        message_payload: payload,
        message_client_id: createClientMessageId(),
      });

      if (error) throw new Error(error.message);
      notify();
      return toMessage(data as MessageRow, viewerId);
    },

    async markConversationRead(conversationId) {
      if (!viewerId) return;
      const resolvedConversationId = await resolveConversationId(conversationId);
      const { error } = await client.rpc('mark_personal_conversation_read', {
        target_conversation: resolvedConversationId,
      });

      if (error) throw new Error(error.message);
      await updateParticipantState(resolvedConversationId, { manually_unread_at: null });
    },

    async searchContacts(query) {
      const normalized = normalizeLookup(query);
      const digits = normalizePhone(query);
      if (!normalized && !digits) return [];

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

      if (error) throw new Error(error.message);
      if (!data) return [];

      const remote = (data as ProfileRow[])
        .filter((profile) => profile.id !== viewerId)
        .filter((profile) => {
          const nameMatches = profile.display_name?.toLocaleLowerCase().includes(normalized);
          const usernameMatches = profile.username_discoverable !== false && profile.username?.toLocaleLowerCase().includes(normalized);
          const phoneMatches = digits.length >= 6 && profile.phone_discoverable === true && normalizePhone(profile.phone || '').includes(digits);
          return nameMatches || usernameMatches || phoneMatches;
        })
        .map(toContact);

      return remote;
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
        messages: latestMessage ? [latestMessage] : [],
        viewerProfileId: viewerId,
        requestStatus: 'accepted',
      });
    },

    async sendMessageRequest(contact) {
      if (!viewerId || !isUuid(contact.id)) {
        throw new Error('Sign in with a real Supabase account before sending message requests.');
      }

      const pairRequests = await fetchPairRequests(contact.id);
      const hasAccepted = pairRequests.some((request) => request.status === 'accepted');
      const hasIncomingPending = pairRequests.some(
        (request) =>
          request.requester_id === contact.id
          && request.recipient_id === viewerId
          && request.status === 'pending',
      );

      if (hasIncomingPending) {
        const { error } = await client.rpc('accept_personal_message_request', {
          requester: contact.id,
        });
        if (error) throw new Error(error.message);
        notify();
        return this.openDirectConversation(contact.id);
      }

      if (hasAccepted) {
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
        kind: 'personal',
        isArchived: false,
        requestStatus: 'pending_outgoing',
        requestMessage: `Hi ${contact.name}, I would like to message you on Social 24x7.`,
      };
    },

    async acceptMessageRequest(conversationId) {
      if (!viewerId || !isUuid(conversationId)) {
        throw new Error('Sign in with a real Supabase account before accepting requests.');
      }

      const { error } = await client.rpc('accept_personal_message_request', {
        requester: conversationId,
      });

      if (error) throw new Error(error.message);
      notify();
      return this.openDirectConversation(conversationId);
    },

    async rejectMessageRequest(conversationId) {
      if (!viewerId || !isUuid(conversationId)) return;
      const { error } = await client
        .from('connection_requests')
        .update({ status: 'declined' })
        .eq('requester_id', conversationId)
        .eq('recipient_id', viewerId)
        .eq('status', 'pending');
      if (error) throw new Error(error.message);
      notify();
    },

    async cancelMessageRequest(conversationId) {
      if (!viewerId || !isUuid(conversationId)) return;
      const { error } = await client
        .from('connection_requests')
        .update({ status: 'declined' })
        .eq('requester_id', viewerId)
        .eq('recipient_id', conversationId)
        .eq('status', 'pending');
      if (error) throw new Error(error.message);
      notify();
    },

    async archiveConversation(conversationId) {
      await updateParticipantState(conversationId, { archived_at: new Date().toISOString() });
    },

    async unarchiveConversation(conversationId) {
      await updateParticipantState(conversationId, { archived_at: null });
    },

    async markConversationUnread(conversationId) {
      await updateParticipantState(conversationId, { manually_unread_at: new Date().toISOString() });
    },

    async setMessageReaction(messageId, emoji) {
      if (!viewerId) throw new Error('Authentication required.');
      if (emoji && !SUPPORTED_REACTIONS.includes(emoji as (typeof SUPPORTED_REACTIONS)[number])) {
        throw new Error('Unsupported reaction.');
      }

      const { error } = emoji
        ? await client
          .from('message_reactions')
          .upsert(
            {
              message_id: messageId,
              user_id: viewerId,
              reaction: emoji,
            },
            { onConflict: 'message_id,user_id' },
          )
        : await client
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', viewerId);

      if (error) throw new Error(error.message);
      notify();
    },

    async pinConversation(conversationId, pinned) {
      await updateParticipantState(conversationId, {
        pinned_at: pinned ? new Date().toISOString() : null,
      });
    },

    async clearConversation(conversationId) {
      const clearedAt = new Date().toISOString();
      await updateParticipantState(conversationId, {
        cleared_at: clearedAt,
        last_read_at: clearedAt,
        manually_unread_at: null,
      });
    },

    async reportConversation(input: ChatReportInput) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(input.conversationId);
      const { error } = await client
        .from('chat_reports')
        .insert({
          conversation_id: resolvedConversationId,
          message_id: input.messageId ?? null,
          reporter_id: viewerId,
          category: input.category,
          notes: input.notes.trim() || null,
        });

      if (error) throw new Error(error.message);
      notify();
    },

    async exportConversation(conversationId): Promise<ExportedConversation> {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(conversationId);
      const conversations = await this.listConversations();
      const conversation = conversations.find((item) => item.id === resolvedConversationId);
      const messages = await loadVisibleMessages(resolvedConversationId);
      const title = conversation?.participant.name ?? 'Conversation';
      const exportedAt = new Date();
      const filename = `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'chat'}-${exportedAt.toISOString().slice(0, 10)}.txt`;
      const text = [
        `Chat with ${title}`,
        `Exported ${exportedAt.toLocaleString()}`,
        '',
        ...messages.map((message) => {
          const sender = message.senderId === CURRENT_USER_ID ? 'You' : title;
          return `[${new Date(message.createdAt).toLocaleString()}] ${sender}: ${message.text}`;
        }),
      ].join('\n');

      return { filename, text };
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
