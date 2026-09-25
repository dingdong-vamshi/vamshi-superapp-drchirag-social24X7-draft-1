import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { BusinessWorkContext } from "./businessAuth";

export type WorkConversation = {
  conversationId: string;
  storefrontId: string;
  customerDisplayName: string;
  customerAvatarPath: string | null;
  lastMessage: string;
  lastMessageAt: string;
  workStatus: "open" | "resolved";
  assigneeMembershipId: string | null;
  assigneeName: string;
  assigneeJobTitle: string;
  unreadCount: number;
};

export type WorkMessage = {
  messageId: string;
  senderId: string;
  body: string;
  messageKind: string;
  createdAt: string;
  senderType: "customer" | "representative" | "business";
  senderDisplayName: string;
  senderTagline: string | null;
  representativeVerified: boolean;
};

export type CompanyFeed = {
  storefront: {
    id: string;
    name: string;
    slug: string;
    tagline: string;
    logoPath: string | null;
    verified: boolean;
  };
  products: Array<{
    id: string;
    title: string;
    slug: string;
    shortDescription: string;
    priceMinor: number;
    currency: string;
    coverPath: string | null;
    inventoryAvailable: number;
  }>;
  posts: Array<{
    id: string;
    body: string;
    mediaPaths: string[];
    mediaType: string;
    createdAt: string;
  }>;
};

const rpc = async <T>(
  client: SupabaseClient,
  name: string,
  parameters: Record<string, unknown> = {},
): Promise<T> => {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data as T;
};

const conversation = (row: Record<string, unknown>): WorkConversation => ({
  conversationId: String(row.conversation_id),
  storefrontId: String(row.storefront_id),
  customerDisplayName: String(row.customer_display_name ?? "Customer"),
  customerAvatarPath: row.customer_avatar_path
    ? String(row.customer_avatar_path)
    : null,
  lastMessage: String(row.last_message ?? ""),
  lastMessageAt: String(row.last_message_at),
  workStatus: row.work_status === "resolved" ? "resolved" : "open",
  assigneeMembershipId: row.assignee_membership_id
    ? String(row.assignee_membership_id)
    : null,
  assigneeName: String(row.assignee_name ?? "Unassigned"),
  assigneeJobTitle: String(row.assignee_job_title ?? ""),
  unreadCount: Number(row.unread_count ?? 0),
});

const message = (row: Record<string, unknown>): WorkMessage => ({
  messageId: String(row.message_id),
  senderId: String(row.sender_id),
  body: String(row.body ?? ""),
  messageKind: String(row.message_kind ?? "text"),
  createdAt: String(row.created_at),
  senderType:
    row.sender_type === "customer"
      ? "customer"
      : row.sender_type === "representative"
        ? "representative"
        : "business",
  senderDisplayName: String(row.sender_display_name ?? "Business"),
  senderTagline: row.sender_tagline ? String(row.sender_tagline) : null,
  representativeVerified: row.representative_verified === true,
});

export interface BusinessWorkspaceRepository {
  getContext(): Promise<BusinessWorkContext | null>;
  listInbox(status?: "open" | "resolved" | null): Promise<WorkConversation[]>;
  listMessages(conversationId: string): Promise<WorkMessage[]>;
  sendMessage(conversationId: string, body: string): Promise<void>;
  startByPhone(phone: string): Promise<string | null>;
  resolve(conversationId: string): Promise<void>;
  markRead(conversationId: string): Promise<void>;
  getCompanyFeed(): Promise<CompanyFeed>;
  subscribe(storefrontId: string, onChange: () => void): () => void;
}

export function createBusinessWorkspaceRepository(
  client: SupabaseClient,
): BusinessWorkspaceRepository {
  return {
    getContext: () => rpc(client, "get_my_business_work_context"),
    async listInbox(status = null) {
      const rows = await rpc<Record<string, unknown>[]>(
        client,
        "get_business_workspace_inbox",
        { p_status: status },
      );
      return (rows ?? []).map(conversation);
    },
    async listMessages(conversationId) {
      const rows = await rpc<Record<string, unknown>[]>(
        client,
        "get_business_workspace_messages",
        { target_conversation: conversationId },
      );
      return (rows ?? []).map(message);
    },
    async sendMessage(conversationId, body) {
      await rpc(client, "send_business_employee_message", {
        target_conversation: conversationId,
        message_body: body,
        message_client_id: null,
      });
    },
    startByPhone: (phone) =>
      rpc(client, "start_business_customer_chat_by_phone", { p_phone: phone }),
    async resolve(conversationId) {
      await rpc(client, "resolve_business_conversation", {
        target_conversation: conversationId,
      });
    },
    async markRead(conversationId) {
      await rpc(client, "mark_business_conversation_read", {
        target_conversation: conversationId,
      });
    },
    getCompanyFeed: () => rpc(client, "get_business_company_feed"),
    subscribe(storefrontId, onChange) {
      const channels: RealtimeChannel[] = [
        client
          .channel(`business-workspace-messages:${storefrontId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "messages" },
            onChange,
          ),
        client
          .channel(`business-workspace-assignments:${storefrontId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "business_conversation_assignments",
              filter: `storefront_id=eq.${storefrontId}`,
            },
            onChange,
          ),
        client
          .channel(`business-workspace-assignment-events:${storefrontId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "business_conversation_assignment_events",
              filter: `storefront_id=eq.${storefrontId}`,
            },
            onChange,
          ),
        client
          .channel(`business-workspace-member:${storefrontId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "storefront_team_memberships",
              filter: `storefront_id=eq.${storefrontId}`,
            },
            onChange,
          ),
      ];
      channels.forEach((channel) => void channel.subscribe());
      return () => {
        channels.forEach((channel) => void client.removeChannel(channel));
      };
    },
  };
}
