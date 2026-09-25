import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TeamDashboard,
  TeamInvitationInput,
  TeamInvitationResult,
  TeamMemberMetrics,
  TeamPermissionCode,
} from "./types";
import type {
  WorkConversation,
  WorkMessage,
} from "../businessWorkspace/businessWorkspaceRepository";

const rpc = async <T>(
  client: SupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data as T;
};

const numericMetrics = (value: Record<string, unknown>): TeamMemberMetrics => ({
  membershipId: String(value.membership_id ?? ""),
  openChats: Number(value.open_chats ?? 0),
  resolvedChats: Number(value.resolved_chats ?? 0),
  lifetimeChats: Number(value.lifetime_chats ?? 0),
  waitingForReply: Number(value.waiting_for_reply ?? 0),
});

const workConversation = (row: Record<string, unknown>): WorkConversation => ({
  conversationId: String(row.conversation_id),
  storefrontId: String(row.storefront_id),
  customerDisplayName: String(row.customer_display_name ?? "Customer"),
  customerAvatarPath: row.customer_avatar_path ? String(row.customer_avatar_path) : null,
  lastMessage: String(row.last_message ?? ""),
  lastMessageAt: String(row.last_message_at),
  workStatus: row.work_status === "resolved" ? "resolved" : "open",
  assigneeMembershipId: row.assignee_membership_id ? String(row.assignee_membership_id) : null,
  assigneeName: String(row.assignee_name ?? "Unassigned"),
  assigneeJobTitle: String(row.assignee_job_title ?? ""),
  unreadCount: Number(row.unread_count ?? 0),
});

const workMessage = (row: Record<string, unknown>): WorkMessage => ({
  messageId: String(row.message_id),
  senderId: String(row.sender_id),
  body: String(row.body ?? ""),
  messageKind: String(row.message_kind ?? "text"),
  createdAt: String(row.created_at),
  senderType: row.sender_type === "customer" ? "customer" : row.sender_type === "representative" ? "representative" : "business",
  senderDisplayName: String(row.sender_display_name ?? "Business"),
  senderTagline: row.sender_tagline ? String(row.sender_tagline) : null,
  representativeVerified: row.representative_verified === true,
});

export interface TeamRepository {
  getDashboard(storefrontId: string): Promise<TeamDashboard>;
  getMetrics(storefrontId: string): Promise<TeamMemberMetrics[]>;
  invite(input: TeamInvitationInput): Promise<TeamInvitationResult>;
  resend(memberId: string): Promise<TeamInvitationResult>;
  approve(memberId: string): Promise<void>;
  transition(
    memberId: string,
    action: "suspend" | "reactivate" | "remove",
  ): Promise<void>;
  updateMember(input: {
    memberId: string;
    roleId: string;
    fullName: string;
    customerTagline: string;
    jobTitle: string;
    department: string;
    permissions?: TeamPermissionCode[] | null;
  }): Promise<void>;
  createRole(input: {
    storefrontId: string;
    name: string;
    description: string;
    permissions: TeamPermissionCode[];
  }): Promise<string>;
  updateRole(input: {
    roleId: string;
    name: string;
    description: string;
    permissions: TeamPermissionCode[];
  }): Promise<void>;
  archiveRole(roleId: string): Promise<void>;
  listSupervisedConversations(): Promise<WorkConversation[]>;
  listSupervisedMessages(conversationId: string): Promise<WorkMessage[]>;
  reassignConversation(conversationId: string, memberId: string): Promise<void>;
}

export function createTeamRepository(client: SupabaseClient): TeamRepository {
  const activation = async (
    name: string,
    parameters: Record<string, unknown>,
  ): Promise<TeamInvitationResult> => {
    const value = await rpc<Record<string, unknown>>(client, name, parameters);
    const row = Array.isArray(value)
      ? (value[0] as Record<string, unknown> | undefined)
      : value;
    if (!row) throw new Error("Activation credentials were not returned.");
    return {
      membershipId: String(row.membership_id ?? ""),
      activationCode: String(row.activation_code ?? ""),
      expiresAt: String(row.expires_at ?? ""),
    };
  };
  return {
    getDashboard: (storefrontId) =>
      rpc(client, "get_storefront_team_dashboard", {
        target_storefront: storefrontId,
      }),
    async getMetrics(storefrontId) {
      const rows = await rpc<Record<string, unknown>[]>(
        client,
        "get_storefront_team_chat_metrics",
        { target_storefront: storefrontId },
      );
      return (rows ?? []).map(numericMetrics);
    },
    invite: (input) =>
      activation("create_storefront_team_invitation", {
        target_storefront: input.storefrontId,
        p_full_name: input.fullName,
        p_work_email: input.workEmail,
        p_login_id: input.loginId,
        p_customer_tagline: input.customerTagline,
        p_job_title: input.jobTitle,
        p_employee_id: input.employeeId || null,
        p_department: input.department,
        p_role_id: input.roleId,
        p_permissions: input.permissions ?? null,
      }),
    resend: (memberId) =>
      activation("resend_storefront_team_activation", {
        target_member: memberId,
      }),
    approve: (memberId) =>
      rpc(client, "approve_storefront_team_member", {
        target_member: memberId,
      }),
    transition: (memberId, action) =>
      rpc(client, "transition_storefront_team_member", {
        target_member: memberId,
        target_action: action,
      }),
    updateMember: (input) =>
      rpc(client, "update_storefront_team_member", {
        target_member: input.memberId,
        p_role_id: input.roleId,
        p_full_name: input.fullName,
        p_customer_tagline: input.customerTagline,
        p_job_title: input.jobTitle,
        p_department: input.department,
        p_permissions: input.permissions ?? null,
      }),
    createRole: (input) =>
      rpc(client, "create_storefront_team_role", {
        target_storefront: input.storefrontId,
        p_name: input.name,
        p_description: input.description,
        p_permissions: input.permissions,
      }),
    updateRole: (input) =>
      rpc(client, "update_storefront_team_role", {
        target_role: input.roleId,
        p_name: input.name,
        p_description: input.description,
        p_permissions: input.permissions,
      }),
    archiveRole: (roleId) =>
      rpc(client, "archive_storefront_team_role", { target_role: roleId }),
    async listSupervisedConversations() {
      const rows = await rpc<Record<string, unknown>[]>(
        client,
        "get_business_workspace_inbox",
        { p_status: null },
      );
      return (rows ?? []).map(workConversation);
    },
    async listSupervisedMessages(conversationId) {
      const rows = await rpc<Record<string, unknown>[]>(
        client,
        "get_business_workspace_messages",
        { target_conversation: conversationId },
      );
      return (rows ?? []).map(workMessage);
    },
    async reassignConversation(conversationId, memberId) {
      await rpc(client, "reassign_business_conversation", {
        target_conversation: conversationId,
        target_member: memberId,
      });
    },
  };
}
