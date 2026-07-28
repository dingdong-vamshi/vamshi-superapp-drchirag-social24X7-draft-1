import type { SupabaseClient, User } from '@supabase/supabase-js';

import { localChatRepository } from './chatRepository';
import type { ChatContact, ChatDataSource, Conversation } from './types';

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
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  created_at: string;
};

const samePair = (request: RequestRow, viewerId: string, participantId: string) =>
  (
    request.requester_id === viewerId
    && request.recipient_id === participantId
  ) || (
    request.requester_id === participantId
    && request.recipient_id === viewerId
  );

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

const resolveRequestStatus = (
  requests: RequestRow[],
  viewerId: string,
  participantId: string,
): { status: Conversation['requestStatus']; createdAt: string } | null => {
  const pairRequests = requests
    .filter((request) => samePair(request, viewerId, participantId))
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  if (!pairRequests.length) return null;

  const accepted = pairRequests.find((request) => request.status === 'accepted');
  if (accepted) {
    return { status: 'accepted', createdAt: accepted.created_at };
  }

  const latest = pairRequests[0];
  return {
    status: latest.requester_id === viewerId ? 'pending_outgoing' : 'pending_incoming',
    createdAt: latest.created_at,
  };
};

export const createSupabaseChatRepository = ({
  client,
  user,
}: {
  client: SupabaseClient;
  user: User | null;
}): ChatDataSource => {
  const viewerId = isUuid(user?.id) ? user?.id : null;

  return {
    async listConversations() {
      const local = await localChatRepository.listConversations();
      if (!viewerId) return local;

      const { data, error } = await client
        .from('connection_requests')
        .select('requester_id,recipient_id,status,created_at')
        .or(`requester_id.eq.${viewerId},recipient_id.eq.${viewerId}`)
        .order('created_at', { ascending: false });

      if (error || !data?.length) return local;

      const requests = data as RequestRow[];
      const otherIds = [...new Set(requests.map((row) => (row.requester_id === viewerId ? row.recipient_id : row.requester_id)))];
      const { data: profiles } = await client
        .from('profiles')
        .select('id,username,display_name,phone,phone_discoverable,username_discoverable,is_private')
        .in('id', otherIds);

      const contacts = new Map((profiles as ProfileRow[] | null | undefined)?.map((profile) => [profile.id, toContact(profile)]) ?? []);
      const remote = otherIds.flatMap((otherId) => {
        const contact = contacts.get(otherId);
        const resolved = resolveRequestStatus(requests, viewerId, otherId);
        if (!contact || !resolved) return [];
        return [{
          id: otherId,
          participant: contact,
          unreadCount: resolved.status === 'pending_incoming' ? 1 : 0,
          updatedAt: resolved.createdAt,
          requestStatus: resolved.status,
          requestMessage: resolved.status === 'pending_outgoing'
            ? `Hi ${contact.name}, I would like to message you on Social 24x7.`
            : `${contact.name} wants to message you on Social 24x7.`,
        } satisfies Conversation];
      });

      const localOnly = local.filter((conversation) => !remote.some((item) => item.id === conversation.id));
      return [...remote, ...localOnly].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    listMessages: localChatRepository.listMessages,
    sendMessage: localChatRepository.sendMessage,
    markConversationRead: localChatRepository.markConversationRead,
    openDirectConversation: localChatRepository.openDirectConversation,

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

    async sendMessageRequest(contact, note) {
      if (viewerId && isUuid(contact.id)) {
        const { data } = await client
          .from('connection_requests')
          .select('requester_id,recipient_id,status,created_at')
          .or(`and(requester_id.eq.${viewerId},recipient_id.eq.${contact.id}),and(requester_id.eq.${contact.id},recipient_id.eq.${viewerId})`);
        const pairRequests = (data as RequestRow[] | null | undefined) ?? [];
        const hasAccepted = pairRequests.some((request) => request.status === 'accepted');
        const hasIncomingPending = pairRequests.some(
          (request) =>
            request.requester_id === contact.id
            && request.recipient_id === viewerId
            && request.status === 'pending',
        );

        if (hasAccepted || hasIncomingPending) {
          await client
            .from('connection_requests')
            .update({ status: 'accepted' })
            .or(`and(requester_id.eq.${viewerId},recipient_id.eq.${contact.id}),and(requester_id.eq.${contact.id},recipient_id.eq.${viewerId})`);
          return localChatRepository.acceptMessageRequest(contact.id);
        }

        await client
          .from('connection_requests')
          .upsert(
            {
              requester_id: viewerId,
              recipient_id: contact.id,
              status: 'pending',
            },
            { onConflict: 'requester_id,recipient_id' },
          );
      }
      return localChatRepository.sendMessageRequest(contact, note);
    },

    async acceptMessageRequest(conversationId) {
      if (viewerId && isUuid(conversationId)) {
        await client
          .from('connection_requests')
          .update({ status: 'accepted' })
          .or(`and(requester_id.eq.${conversationId},recipient_id.eq.${viewerId}),and(requester_id.eq.${viewerId},recipient_id.eq.${conversationId})`);
      }
      return localChatRepository.acceptMessageRequest(conversationId);
    },

    subscribe: localChatRepository.subscribe,
  };
};
