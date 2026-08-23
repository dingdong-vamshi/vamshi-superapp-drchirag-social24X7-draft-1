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
  ChatAttachment,
  ChatEvent,
  ChatLocation,
  ChatPoll,
  Conversation,
  ExportedConversation,
  MessageReaction,
} from './types';
import { CURRENT_USER_ID } from './types';
import { toAttachment, toLocation, toOrderEvent } from './chatContractParsers';

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  phone?: string | null;
  phone_discoverable?: boolean | null;
  username_discoverable?: boolean | null;
  is_private: boolean | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
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
  member_role?: 'admin' | 'member';
  profiles: ProfileRow | ProfileRow[] | null;
};

type ConversationRow = {
  id: string;
  kind: 'personal' | 'business' | 'group' | 'support';
  storefront_id: string | null;
  business_customer_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  title?: string | null;
  image_path?: string | null;
  storefronts: StorefrontRow | StorefrontRow[] | null;
  conversation_participants: ParticipantRow[] | null;
};

type StorefrontRow = {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  verification_status: string | null;
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
  expires_at?: string | null;
};

type MessageReactionRow = {
  message_id: string;
  user_id: string;
  reaction: string;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  storage_path: string;
  attachment_type: 'image' | 'video' | 'document';
  original_filename: string;
  mime_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  source: ChatAttachment['source'];
};

type PollRow = {
  id: string;
  question: string;
  status: 'open' | 'closed';
  chat_poll_options: Array<{ id: string; label: string; position: number }> | null;
  chat_poll_votes: Array<{ option_id: string; voter_id: string }> | null;
};

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  description: string | null;
  chat_event_rsvps: Array<{ user_id: string; response: 'going' | 'maybe' | 'declined' }> | null;
};

type OrderStateRow = {
  id: string;
  status: string;
  customer_id: string;
};

type OrderEvidenceRow = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  return_request_id: string | null;
  evidence_kind: 'packing' | 'unboxing' | 'return';
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  evidence_source: 'live_capture' | 'uploaded_file';
  captured_at: string | null;
  created_at: string;
};

type OrderReturnRow = {
  id: string;
  order_id: string;
  order_item_id: string;
  status: string;
  reason: string;
  details: string | null;
  admin_note: string | null;
  requested_at: string;
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

const stringValue = (value: unknown) => typeof value === 'string' ? value : '';

const toContact = (row: ProfileRow): ChatContact => {
  const name = row.display_name?.trim() || row.username || 'Social 24x7 user';
  return {
    id: row.id,
    name,
    avatarLabel: initialsFor(name),
    avatarUrl: row.avatar_url || null,
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
  const order = row.kind === 'order' ? toOrderEvent(payload) : undefined;
  const attachment = ['image', 'video', 'file'].includes(row.kind) ? toAttachment(payload) : undefined;
  const location = row.kind === 'location' ? toLocation(payload) : undefined;
  const contact = row.kind === 'contact' && payload.version === 1 && isUuid(stringValue(payload.profile_id))
    ? {
        profileId: stringValue(payload.profile_id),
        displayName: stringValue(payload.display_name) || 'Social 24x7 user',
        username: stringValue(payload.username),
      }
    : undefined;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id && row.sender_id === viewerId ? CURRENT_USER_ID : row.sender_id ?? '',
    text: row.body ?? '',
    createdAt: row.created_at,
    status: 'delivered',
    type: order ? 'order_event' : hasSharedPost ? 'shared_post' : hasSticker ? 'sticker' : 'text',
    post: hasSharedPost ? (payload.post as ChatMessage['post']) : undefined,
    order,
    attachment,
    location,
    contact,
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
  let syncFallback: ReturnType<typeof setInterval> | null = null;

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

  const fetchConversationRows = async (
    kinds: ConversationRow['kind'][] = ['personal', 'business', 'group'],
  ) => {
    const { data, error } = await client
      .from('conversations')
      .select(`
        id,
        kind,
        storefront_id,
        business_customer_id,
        created_by,
        created_at,
        updated_at,
        title,
        image_path,
        storefronts!conversations_storefront_id_fkey(
          id,
          name,
          slug,
          logo_path,
          verification_status
        ),
        conversation_participants(
          user_id,
          last_read_at,
          archived_at,
          manually_unread_at,
          pinned_at,
          cleared_at,
          member_role,
          profiles!conversation_participants_user_id_fkey(
            id,
            username,
            display_name,
            phone,
            phone_discoverable,
            username_discoverable,
            is_private
            ,avatar_path
          )
        )
      `)
      .in('kind', kinds)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    const rows = (data as ConversationRow[] | null) ?? [];
    const paths = unique(rows.flatMap((row) =>
      (row.conversation_participants || []).flatMap((participant) => {
        const profile = firstRelation(participant.profiles);
        return profile?.avatar_path ? [profile.avatar_path] : [];
      }),
    ));
    const signed = paths.length
      ? await client.storage.from('profile-media').createSignedUrls(paths, 3600)
      : { data: [], error: null };
    const urls = new Map(paths.map((path, index) => [path, signed.data?.[index]?.signedUrl || null]));
    rows.forEach((row) => row.conversation_participants?.forEach((participant) => {
      const profiles = Array.isArray(participant.profiles) ? participant.profiles : participant.profiles ? [participant.profiles] : [];
      profiles.forEach((profile) => { profile.avatar_url = profile.avatar_path ? urls.get(profile.avatar_path) || null : null; });
    }));
    return rows;
  };

  const fetchPersonalConversationRows = () => fetchConversationRows(['personal']);

  const fetchMessagesByConversationIds = async (conversationIds: string[]) => {
    if (!conversationIds.length) return new Map<string, MessageRow[]>();
    const { data, error } = await client
      .from('messages')
      .select('id,conversation_id,sender_id,kind,body,payload,client_id,created_at,edited_at,deleted_at,expires_at')
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
    const messages = rows.map((row) => toMessage(row, viewerId, reactionMap.get(row.id) ?? []));
    const attachmentIds = unique(messages.flatMap((message) => message.attachment?.id ? [message.attachment.id] : []));
    let hydrated = messages;
    if (attachmentIds.length) {
      const { data, error } = await client
        .from('chat_attachments')
        .select('id,storage_path,attachment_type,original_filename,mime_type,bytes,width,height,duration_ms,source')
        .in('id', attachmentIds);
      if (error) throw new Error(error.message);
      const attachments = (data as AttachmentRow[] | null) ?? [];
      const signed = await client.storage.from('chat-media').createSignedUrls(attachments.map((attachment) => attachment.storage_path), 3600);
      if (signed.error) throw new Error(signed.error.message);
      const byId = new Map(attachments.map((attachment, index) => [attachment.id, {
        id: attachment.id,
        attachmentType: attachment.attachment_type,
        filename: attachment.original_filename,
        mimeType: attachment.mime_type,
        bytes: attachment.bytes,
        width: attachment.width ?? undefined,
        height: attachment.height ?? undefined,
        durationMs: attachment.duration_ms ?? undefined,
        source: attachment.source,
        signedUrl: signed.data[index]?.signedUrl ?? undefined,
      } satisfies ChatAttachment]));
      hydrated = hydrated.map((message) => message.attachment ? { ...message, attachment: byId.get(message.attachment.id) ?? message.attachment } : message);
    }

    const pollIds = unique(rows.flatMap((row) => row.kind === 'poll' && isUuid(stringValue(row.payload?.poll_id)) ? [stringValue(row.payload?.poll_id)] : []));
    if (pollIds.length) {
      const { data, error } = await client.from('chat_polls').select('id,question,status,chat_poll_options(id,label,position),chat_poll_votes(option_id,voter_id)').in('id', pollIds);
      if (error) throw new Error(error.message);
      const polls = new Map(((data as PollRow[] | null) ?? []).map((poll) => {
        const votes = poll.chat_poll_votes ?? [];
        const value: ChatPoll = {
          id: poll.id,
          question: poll.question,
          status: poll.status,
          options: (poll.chat_poll_options ?? []).sort((a,b) => a.position-b.position).map((option) => ({
            id: option.id,
            label: option.label,
            position: option.position,
            votes: votes.filter((vote) => vote.option_id === option.id).length,
            selectedByCurrentUser: votes.some((vote) => vote.option_id === option.id && vote.voter_id === viewerId),
          })),
          totalVotes: votes.length,
        };
        return [poll.id, value];
      }));
      hydrated = hydrated.map((message, index) => {
        const pollId = stringValue(rows[index]?.payload?.poll_id);
        return pollId && polls.has(pollId) ? { ...message, poll: polls.get(pollId) } : message;
      });
    }

    const eventIds = unique(rows.flatMap((row) => row.kind === 'event' && isUuid(stringValue(row.payload?.event_id)) ? [stringValue(row.payload?.event_id)] : []));
    if (eventIds.length) {
      const { data, error } = await client.from('chat_events').select('id,title,starts_at,location,description,chat_event_rsvps(user_id,response)').in('id', eventIds);
      if (error) throw new Error(error.message);
      const events = new Map(((data as EventRow[] | null) ?? []).map((event) => {
        const rsvps = event.chat_event_rsvps ?? [];
        const value: ChatEvent = {
          id: event.id,
          title: event.title,
          startsAt: event.starts_at,
          location: event.location ?? undefined,
          description: event.description ?? undefined,
          rsvpCounts: {
            going: rsvps.filter((rsvp) => rsvp.response === 'going').length,
            maybe: rsvps.filter((rsvp) => rsvp.response === 'maybe').length,
            declined: rsvps.filter((rsvp) => rsvp.response === 'declined').length,
          },
          currentUserResponse: rsvps.find((rsvp) => rsvp.user_id === viewerId)?.response,
        };
        return [event.id, value];
      }));
      hydrated = hydrated.map((message, index) => {
        const eventId = stringValue(rows[index]?.payload?.event_id);
        return eventId && events.has(eventId) ? { ...message, event: events.get(eventId) } : message;
      });
    }

    const orderIds = unique(hydrated.flatMap((message) => message.order?.orderId ? [message.order.orderId] : []));
    if (orderIds.length) {
      const [ordersResult, evidenceResult, returnResult] = await Promise.all([
        client.from('orders').select('id,status,customer_id').in('id', orderIds),
        client
          .from('commerce_order_evidence')
          .select('id,order_id,order_item_id,return_request_id,evidence_kind,storage_path,file_name,mime_type,evidence_source,captured_at,created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false }),
        client
          .from('return_requests')
          .select('id,order_id,order_item_id,status,reason,details,admin_note,requested_at')
          .in('order_id', orderIds)
          .order('requested_at', { ascending: false }),
      ]);
      if (ordersResult.error) throw new Error(ordersResult.error.message);
      if (evidenceResult.error) throw new Error(evidenceResult.error.message);
      if (returnResult.error) throw new Error(returnResult.error.message);
      const orderStates = new Map(((ordersResult.data as OrderStateRow[] | null) ?? []).map((order) => [order.id, order]));
      const evidenceRows = (evidenceResult.data as OrderEvidenceRow[] | null) ?? [];
      const returnRows = (returnResult.data as OrderReturnRow[] | null) ?? [];
      const signed = evidenceRows.length
        ? await client.storage.from('creator-commerce-private').createSignedUrls(evidenceRows.map((evidence) => evidence.storage_path), 3600)
        : { data: [], error: null };
      if (signed.error) throw new Error(signed.error.message);
      const packingByOrder = new Map<string, NonNullable<ChatMessage['order']>['packingEvidence']>();
      const unboxingByOrder = new Map<string, NonNullable<ChatMessage['order']>['unboxingEvidence']>();
      const returnEvidenceByRequest = new Map<string, NonNullable<NonNullable<ChatMessage['order']>['returnRequests']>[number]['evidence']>();
      evidenceRows.forEach((evidence, index) => {
        const value = {
          id: evidence.id,
          orderItemId: evidence.order_item_id ?? undefined,
          returnRequestId: evidence.return_request_id ?? undefined,
          filename: evidence.file_name || (evidence.evidence_kind === 'packing' ? 'Packing evidence' : 'Unboxing evidence'),
          mimeType: evidence.mime_type || 'application/octet-stream',
          source: evidence.evidence_source,
          createdAt: evidence.created_at,
          capturedAt: evidence.captured_at ?? undefined,
          signedUrl: signed.data?.[index]?.signedUrl ?? undefined,
        };
        if (evidence.evidence_kind === 'return' && evidence.return_request_id) {
          const next = returnEvidenceByRequest.get(evidence.return_request_id) ?? [];
          next.push(value);
          returnEvidenceByRequest.set(evidence.return_request_id, next);
          return;
        }
        const target = evidence.evidence_kind === 'packing' ? packingByOrder : unboxingByOrder;
        const next = target.get(evidence.order_id) ?? [];
        next.push(value);
        target.set(evidence.order_id, next);
      });
      const returnsByOrder = new Map<string, OrderReturnRow[]>();
      returnRows.forEach((request) => {
        const next = returnsByOrder.get(request.order_id) ?? [];
        next.push(request);
        returnsByOrder.set(request.order_id, next);
      });
      hydrated = hydrated.map((message) => {
        if (!message.order) return message;
        const live = orderStates.get(message.order.orderId);
        const packingEvidence = packingByOrder.get(message.order.orderId) ?? [];
        const unboxingEvidence = unboxingByOrder.get(message.order.orderId) ?? [];
        const returnRowsForOrder = returnsByOrder.get(message.order.orderId) ?? [];
        const returnRequests = returnRowsForOrder.map((request) => ({
          id: request.id,
          orderItemId: request.order_item_id,
          status: request.status,
          reason: request.reason,
          details: request.details ?? undefined,
          sellerNote: request.admin_note ?? undefined,
          requestedAt: request.requested_at,
          evidence: returnEvidenceByRequest.get(request.id) ?? [],
        }));
        const latestReturn = returnRowsForOrder[0];
        const viewerRole = live?.customer_id === viewerId ? 'buyer' : 'seller';
        const liveStatus = live?.status ?? message.order.orderStatus;
        return {
          ...message,
          order: {
            ...message.order,
            liveOrderStatus: liveStatus,
            viewerRole,
            packingEvidence,
            unboxingEvidence,
            returnRequests,
            canSubmitPackingEvidence: viewerRole === 'seller' && ['placed', 'confirmed', 'processing'].includes(liveStatus) && packingEvidence.length === 0,
            canSubmitUnboxingEvidence: viewerRole === 'buyer' && liveStatus === 'delivered',
            canRequestReturn: viewerRole === 'buyer' && ['delivered', 'return_requested', 'return_approved', 'return_rejected'].includes(liveStatus) && message.order.items.some((item) => !returnRowsForOrder.some((request) => request.order_item_id === item.orderItemId)),
            returnRequestId: latestReturn?.id,
            returnStatus: latestReturn?.status,
            canReviewReturn: viewerRole === 'seller' && returnRowsForOrder.some((request) => ['submitted', 'under_review'].includes(request.status)),
          },
        };
      });
    }
    return hydrated;
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
      .select('id,username,display_name,phone,phone_discoverable,username_discoverable,is_private,avatar_path')
      .eq('id', contactId)
      .maybeSingle();

    if (error || !data) return null;
    const profile = data as ProfileRow;
    if (profile.avatar_path) {
      const signed = await client.storage.from('profile-media').createSignedUrl(profile.avatar_path, 3600);
      profile.avatar_url = signed.data?.signedUrl || null;
    }
    return toContact(profile);
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
    const rows = await fetchConversationRows();
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
    const personContact = profile ? toContact(profile) : {
      id: otherParticipant?.user_id ?? row.created_by,
      name: 'Social 24x7 user',
      avatarLabel: 'S',
      username: (otherParticipant?.user_id ?? row.created_by).slice(0, 8),
      isOnline: false,
    };
    const storefront = firstRelation(row.storefronts);
    const businessRole = row.kind === 'business'
      ? row.business_customer_id === viewerProfileId ? 'customer' : 'seller'
      : undefined;
    const contact = row.kind === 'group'
      ? {
          id: row.id,
          name: row.title?.trim() || 'Group chat',
          avatarLabel: initialsFor(row.title?.trim() || 'Group chat'),
          username: `group-${row.id.slice(0, 8)}`,
          isOnline: false,
        }
      : row.kind === 'business' && storefront && businessRole === 'customer'
      ? {
          ...personContact,
          name: storefront.name,
          avatarLabel: initialsFor(storefront.name),
          username: storefront.slug,
          avatarUrl: storefront.logo_path
            ? client.storage.from('shop-media').getPublicUrl(storefront.logo_path).data.publicUrl
            : undefined,
        }
      : personContact;

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
      businessRole,
      storefront: storefront
        ? {
            id: storefront.id,
            name: storefront.name,
            slug: storefront.slug,
            logoPath: storefront.logo_path ?? undefined,
            verificationStatus: storefront.verification_status ?? undefined,
          }
        : undefined,
      groupName: row.kind === 'group' ? row.title?.trim() || 'Group chat' : undefined,
      memberCount: row.kind === 'group' ? row.conversation_participants?.length || 0 : undefined,
    };
  };

  const ensureLiveSync = () => {
    if (!viewerId || channel) return;

    // Route transitions can briefly keep the inbox and detail repositories
    // mounted together. A unique topic avoids mutating an already-subscribed
    // Supabase channel while both screens hand off their listeners.
    channel = client
      .channel(`chat:${viewerId}:${createClientMessageId()}`)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_poll_votes' }, notify)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_event_rsvps' }, notify)
      .subscribe();

    // Keep chat usable if a deployment temporarily omits a table from the
    // Realtime publication. Postgres Changes remains the fast path; this quiet
    // fallback reconciles inbox/detail state without requiring a reload.
    syncFallback ??= setInterval(notify, 4_000);

  };

  const stopLiveSync = () => {
    if (channel) {
      void client.removeChannel(channel);
      channel = null;
    }
    if (syncFallback) {
      clearInterval(syncFallback);
      syncFallback = null;
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
      .select('id,conversation_id,sender_id,kind,body,payload,client_id,created_at,edited_at,deleted_at,expires_at')
      .eq('conversation_id', resolvedConversationId)
      .is('deleted_at', null);

    if (clearedAt) {
      query = query.gt('created_at', clearedAt);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    return attachReactions(((data as MessageRow[] | null) ?? []).reverse());
  };

  const submitCommerceEvidence = async (input: {
    orderId: string;
    orderItemId?: string | null;
    returnRequestId?: string | null;
    kind: 'packing' | 'unboxing' | 'return';
    bytes: ArrayBuffer;
    filename: string;
    mimeType: string;
    source: 'live_capture' | 'uploaded_file';
  }) => {
    if (!viewerId) throw new Error('Authentication required.');
    if (!isUuid(input.orderId) || (input.orderItemId && !isUuid(input.orderItemId)) || (input.returnRequestId && !isUuid(input.returnRequestId))) {
      throw new Error('Invalid order evidence target.');
    }
    if (input.kind === 'return' && (!input.orderItemId || !input.returnRequestId)) {
      throw new Error('Return evidence must target an open return request.');
    }
    if (input.bytes.byteLength < 1 || input.bytes.byteLength > 15_728_640) {
      throw new Error('Order evidence must be 15 MiB or smaller.');
    }
    const intentRpc = input.source === 'live_capture'
      ? 'begin_trusted_commerce_evidence_capture'
      : 'begin_uploaded_commerce_evidence_capture';
    const { data: intentData, error: intentError } = await client.rpc(intentRpc, {
      p_order_id: input.orderId,
      p_order_item_id: input.orderItemId ?? null,
      p_evidence_kind: input.kind,
      p_return_request_id: input.returnRequestId ?? null,
    });
    if (intentError) throw new Error(intentError.message);
    const intent = (Array.isArray(intentData) ? intentData[0] : intentData) as { intent_id: string; path_prefix: string } | null;
    if (!intent) throw new Error('Evidence capture could not be authorized.');
    const extension = input.filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1]
      ?? input.mimeType.split('/')[1]?.replace('jpeg', 'jpg')
      ?? 'bin';
    const storagePath = `${intent.path_prefix}.${extension}`;
    const upload = await client.storage.from('creator-commerce-private').upload(storagePath, input.bytes, {
      contentType: input.mimeType,
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);
    const { error } = await client.rpc('finalize_commerce_evidence_capture', {
      p_intent_id: intent.intent_id,
      p_storage_path: storagePath,
      p_file_name: input.filename,
      p_mime_type: input.mimeType,
      p_file_size: input.bytes.byteLength,
    });
    if (error) {
      await client.storage.from('creator-commerce-private').remove([storagePath]);
      throw new Error(error.message);
    }
    notify();
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

      const conversationRows = await fetchConversationRows();
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
          .select('id,username,display_name,phone,phone_discoverable,username_discoverable,is_private,avatar_path')
          .in('id', pendingParticipantIds)
        : { data: [] as ProfileRow[] | null, error: null };

      if (pendingProfiles.error) throw new Error(pendingProfiles.error.message);

      const pendingRows = (pendingProfiles.data as ProfileRow[] | null) ?? [];
      const pendingPaths = pendingRows.flatMap((profile) => profile.avatar_path ? [profile.avatar_path] : []);
      if (pendingPaths.length) {
        const signed = await client.storage.from('profile-media').createSignedUrls(pendingPaths, 3600);
        pendingRows.forEach((profile) => {
          if (profile.avatar_path) {
            const index = pendingPaths.indexOf(profile.avatar_path);
            profile.avatar_url = signed.data?.[index]?.signedUrl || null;
          }
        });
      }

      const pendingConversations = pendingRows
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

    async sendAttachment(input) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(input.conversationId);
      const byteLength = input.bytes instanceof ArrayBuffer ? input.bytes.byteLength : input.bytes.size;
      if (byteLength < 1 || byteLength > 104_857_600) {
        throw new Error('Attachment must be 100 MiB or smaller.');
      }
      const extension = input.filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1]
        ?? input.mimeType.split('/')[1]?.replace('jpeg', 'jpg')
        ?? 'bin';
      const durationMs = input.durationMs == null ? null : Math.round(input.durationMs);
      if (durationMs != null && (!Number.isFinite(durationMs) || durationMs < 0)) {
        throw new Error('Attachment preparation failed: invalid video duration metadata.');
      }
      const storagePath = `${resolvedConversationId}/${viewerId}/${createClientMessageId()}.${extension}`;
      const uploadStartedAt = Date.now();
      if (__DEV__) console.info('[chat-attachment] Storage upload started', {
        bucket: 'chat-media',
        storagePath,
        contentType: input.mimeType,
        byteLength,
        payloadType: input.bytes instanceof ArrayBuffer ? 'ArrayBuffer' : input.bytes.constructor.name,
        filename: input.filename,
        source: input.source,
        durationMs,
      });
      input.onStage?.('uploading');
      const upload = await client.storage.from('chat-media').upload(storagePath, input.bytes, {
        contentType: input.mimeType,
        upsert: false,
      });
      if (upload.error) {
        if (__DEV__) console.error('[chat-attachment] Storage upload failed', {
          code: upload.error.name,
          message: upload.error.message,
          storagePath,
          mimeType: input.mimeType,
          byteLength,
        });
        throw new Error(`Attachment upload failed: ${upload.error.message}`);
      }
      if (__DEV__) console.info('[chat-attachment] Storage upload succeeded', {
        data: upload.data,
        storagePath,
        elapsedMs: Date.now() - uploadStartedAt,
      });

      input.onStage?.('finalizing');
      const finalizationStartedAt = Date.now();
      const { data, error } = await client.rpc('send_chat_attachment', {
        target_conversation: resolvedConversationId,
        target_storage_path: storagePath,
        target_filename: input.filename,
        target_mime_type: input.mimeType,
        target_bytes: byteLength,
        target_width: input.width ?? null,
        target_height: input.height ?? null,
        target_duration_ms: durationMs,
        target_source: input.source,
      });
      if (error) {
        if (__DEV__) console.error('[chat-attachment] send_chat_attachment failed', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          storagePath,
          mimeType: input.mimeType,
          byteLength,
          durationMs,
        });
        const cleanup = await client.storage.from('chat-media').remove([storagePath]);
        if (__DEV__) console.warn('[chat-attachment] Failed-upload cleanup result', {
          data: cleanup.data,
          error: cleanup.error,
          storagePath,
        });
        const diagnostic = [error.message, error.code ? `code ${error.code}` : '', error.details, error.hint]
          .filter(Boolean)
          .join(' · ');
        throw new Error(`Attachment finalization failed: ${diagnostic}`);
      }
      const messageRow = data as MessageRow;
      if (__DEV__) console.info('[chat-attachment] Attachment finalized', {
        messageId: messageRow.id,
        attachmentId: messageRow.payload?.attachment_id,
        storagePath,
        mimeType: input.mimeType,
        byteLength,
        durationMs,
        elapsedMs: Date.now() - finalizationStartedAt,
      });
      notify();
      return toMessage(messageRow, viewerId);
    },

    async submitUnboxingEvidence(input) {
      await submitCommerceEvidence({ ...input, kind: 'unboxing' });
    },

    async submitOrderEvidence(input) {
      await submitCommerceEvidence(input);
    },

    async reviewOrderReturn(input) {
      if (!viewerId) throw new Error('Authentication required.');
      const { error } = await client.rpc('seller_review_creator_commerce_return', {
        p_return_request_id: input.returnRequestId,
        p_decision: input.decision,
        p_reason: input.reason?.trim() || null,
      });
      if (error) throw new Error(error.message);
      notify();
    },

    async submitOrderReturn(input) {
      if (!viewerId) throw new Error('Authentication required.');
      if (!input.reason.trim()) throw new Error('Add a reason for the return.');
      const { error } = await client.rpc('submit_creator_commerce_return', {
        p_order_item_id: input.orderItemId,
        p_reason: input.reason.trim(),
        p_details: input.details?.trim() || null,
      });
      if (error) throw new Error(error.message);
      notify();
    },

    async sendLocation(input) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(input.conversationId);
      const { data, error } = await client.rpc('send_structured_chat_message', {
        target_conversation: resolvedConversationId,
        target_kind: 'location',
        target_payload: {
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          accuracy: input.location.accuracy ?? null,
          label: input.location.label ?? null,
          captured_at: input.location.capturedAt,
        },
      });
      if (error) throw new Error(error.message);
      notify();
      return toMessage(data as MessageRow, viewerId);
    },

    async sendContact(input) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(input.conversationId);
      const { data, error } = await client.rpc('send_structured_chat_message', {
        target_conversation: resolvedConversationId,
        target_kind: 'contact',
        target_payload: { profile_id: input.profileId },
      });
      if (error) throw new Error(error.message);
      notify();
      return toMessage(data as MessageRow, viewerId);
    },

    async createPoll(input) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(input.conversationId);
      const { data, error } = await client.rpc('create_chat_poll', {
        target_conversation: resolvedConversationId,
        target_question: input.question,
        target_options: input.options,
      });
      if (error) throw new Error(error.message);
      notify();
      return toMessage(data as MessageRow, viewerId);
    },

    async votePoll(pollId, optionId) {
      if (!viewerId) throw new Error('Authentication required.');
      const { error } = await client.rpc('vote_chat_poll', { target_poll: pollId, target_option: optionId });
      if (error) throw new Error(error.message);
      notify();
    },

    async createEvent(input) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(input.conversationId);
      const { data, error } = await client.rpc('create_chat_event', {
        target_conversation: resolvedConversationId,
        target_title: input.title,
        target_starts_at: input.startsAt,
        target_location: input.location ?? null,
        target_description: input.description ?? null,
      });
      if (error) throw new Error(error.message);
      notify();
      return toMessage(data as MessageRow, viewerId);
    },

    async rsvpEvent(eventId, response) {
      if (!viewerId) throw new Error('Authentication required.');
      const { error } = await client.rpc('rsvp_chat_event', { target_event: eventId, target_response: response });
      if (error) throw new Error(error.message);
      notify();
    },

    async keepMemo(messageId) {
      if (!viewerId) throw new Error('Authentication required.');
      const { error } = await client.rpc('keep_chat_message_memo', { target_message: messageId });
      if (error) throw new Error(error.message);
    },

    async scheduleMessage(input) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(input.conversationId);
      const { error } = await client.rpc('schedule_chat_message', {
        target_conversation: resolvedConversationId,
        target_body: input.body,
        target_send_at: input.sendAt,
        target_timezone: input.timezone,
        target_idempotency_key: createClientMessageId(),
      });
      if (error) throw new Error(error.message);
    },

    async setVanishMode(conversationId, seconds) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(conversationId);
      const { error } = await client.rpc('set_chat_vanish_mode', {
        target_conversation: resolvedConversationId,
        target_seconds: seconds,
      });
      if (error) throw new Error(error.message);
    },

    async getWallpaper(conversationId) {
      if (!viewerId) return { style: 'neutral', imageUrl: null };
      const resolvedConversationId = await resolveConversationId(conversationId);
      const { data, error } = await client.from('chat_wallpaper_preferences')
        .select('wallpaper_style, wallpaper_image_path')
        .eq('conversation_id', resolvedConversationId)
        .eq('user_id', viewerId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const settings = data as { wallpaper_style?: string; wallpaper_image_path?: string | null } | null;
      const style = settings?.wallpaper_style;
      const imagePath = settings?.wallpaper_image_path;
      const signed = imagePath
        ? await client.storage.from('chat-media').createSignedUrl(imagePath, 60 * 60)
        : null;
      if (signed?.error) throw new Error(signed.error.message);
      return {
        style: style === 'sky' || style === 'forest' || style === 'warm' || style === 'paper' ? style : 'neutral',
        imageUrl: signed?.data?.signedUrl ?? null,
      };
    },

    async setWallpaper(conversationId, style) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(conversationId);
      const { error } = await client.rpc('set_my_chat_wallpaper', {
        target_conversation: resolvedConversationId,
        target_wallpaper: style,
      });
      if (error) throw new Error(error.message);
    },

    async setWallpaperImage(input) {
      if (!viewerId) throw new Error('Authentication required.');
      const resolvedConversationId = await resolveConversationId(input.conversationId);
      if (input.bytes.byteLength < 1 || input.bytes.byteLength > 10_485_760) {
        throw new Error('Wallpaper images must be 10 MiB or smaller.');
      }
      if (!input.mimeType.startsWith('image/')) throw new Error('Choose an image for the wallpaper.');
      const extension = input.filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1]
        ?? input.mimeType.split('/')[1]?.replace('jpeg', 'jpg')
        ?? 'jpg';
      const storagePath = `${resolvedConversationId}/${viewerId}/wallpaper-${createClientMessageId()}.${extension}`;
      const upload = await client.storage.from('chat-media').upload(storagePath, input.bytes, {
        contentType: input.mimeType,
        upsert: false,
      });
      if (upload.error) throw new Error(upload.error.message);
      const { error } = await client.rpc('set_my_chat_wallpaper_image', {
        target_conversation: resolvedConversationId,
        target_storage_path: storagePath,
      });
      if (error) {
        await client.storage.from('chat-media').remove([storagePath]);
        throw new Error(error.message);
      }
      const signed = await client.storage.from('chat-media').createSignedUrl(storagePath, 60 * 60);
      if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'Wallpaper could not be opened.');
      return signed.data.signedUrl;
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
        .select('id,username,display_name,phone,phone_discoverable,username_discoverable,is_private,avatar_path')
        .eq('is_private', false)
        .or(clauses.join(','))
        .limit(20);

      if (error) throw new Error(error.message);
      if (!data) return [];

      const remoteProfiles = data as ProfileRow[];
      const avatarPaths = remoteProfiles.flatMap((profile) => profile.avatar_path ? [profile.avatar_path] : []);
      if (avatarPaths.length) {
        const signed = await client.storage.from('profile-media').createSignedUrls(avatarPaths, 3600);
        remoteProfiles.forEach((profile) => {
          if (profile.avatar_path) {
            const index = avatarPaths.indexOf(profile.avatar_path);
            profile.avatar_url = signed.data?.[index]?.signedUrl || null;
          }
        });
      }

      const remote = remoteProfiles
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

    async listGroupEligibleContacts() {
      if (!viewerId) return [];
      const { data, error } = await client.rpc('list_group_eligible_contacts');
      if (error) throw new Error(error.message);
      const profiles = (data || []) as ProfileRow[];
      const signed = await Promise.all(profiles.map(async (profile) => {
        if (!profile.avatar_path) return profile;
        const result = await client.storage.from('profile-media').createSignedUrl(profile.avatar_path, 3600);
        return { ...profile, avatar_url: result.data?.signedUrl || null };
      }));
      return signed.map(toContact);
    },

    async createGroup(name, memberIds) {
      if (!viewerId) throw new Error('Authentication required.');
      const { data: conversationId, error } = await client.rpc('create_group_conversation', {
        group_name: name.trim(),
        member_ids: memberIds,
      });
      if (error) throw new Error(error.message);
      const rows = await fetchConversationRows(['group']);
      const row = rows.find((item) => item.id === conversationId);
      if (!row) throw new Error('Group was created but could not be loaded.');
      notify();
      return toConversation({ row, viewerProfileId: viewerId, requestStatus: 'accepted' });
    },

    async listGroupMembers(conversationId) {
      const { data, error } = await client.rpc('get_group_members', {
        target_conversation: conversationId,
      });
      if (error) throw new Error(error.message);
      const profiles = (data || []) as Array<ProfileRow & { member_role: 'admin' | 'member' }>;
      const signed = await Promise.all(profiles.map(async (profile) => {
        if (!profile.avatar_path) return profile;
        const result = await client.storage.from('profile-media').createSignedUrl(profile.avatar_path, 3600);
        return { ...profile, avatar_url: result.data?.signedUrl || null };
      }));
      return signed.map((profile) => ({ ...toContact(profile), role: profile.member_role }));
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
