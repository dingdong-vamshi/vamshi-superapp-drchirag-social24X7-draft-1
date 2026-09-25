export type TeamMemberStatus =
  | "not_activated"
  | "awaiting_approval"
  | "verified"
  | "suspended"
  | "removed";

export type TeamPermissionCode =
  | "business_chat_reply"
  | "business_share_products_orders"
  | "business_returns_refunds"
  | "business_team_manage"
  | "business_chat_monitor"
  | "business_chat_assign"
  | "business_feed_view"
  | "business_orders_view";

export type TeamPermission = {
  code: TeamPermissionCode;
  label: string;
  description: string;
};

export type TeamRole = {
  id: string;
  name: string;
  systemKey: string | null;
  description: string;
  isSystem: boolean;
  archivedAt: string | null;
  usageCount: number;
  permissions: TeamPermissionCode[];
};

export type TeamMember = {
  id: string;
  fullName: string;
  approvedDisplayName: string;
  workEmail: string;
  loginId: string;
  customerTagline: string;
  jobTitle: string;
  employeeId: string | null;
  department: string;
  roleId: string;
  roleName: string;
  roleKey: string | null;
  status: TeamMemberStatus;
  identityKind: "work" | "owner_personal";
  representativeVerified: boolean;
  permissions: TeamPermissionCode[];
  createdAt: string;
  activatedAt: string | null;
  approvedAt: string | null;
};

export type TeamDashboard = {
  storefront: {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    verificationStatus: string;
    logoPath: string | null;
  };
  counts: Record<"verified" | "awaitingApproval" | "notActivated" | "suspended" | "removed", number>;
  members: TeamMember[];
  roles: TeamRole[];
  permissionCatalog: TeamPermission[];
  auditEvents: Array<{
    id: string;
    membershipId: string | null;
    eventType: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }>;
};

export type TeamMemberMetrics = {
  membershipId: string;
  openChats: number;
  resolvedChats: number;
  lifetimeChats: number;
  waitingForReply: number;
};

export type TeamInvitationInput = {
  storefrontId: string;
  fullName: string;
  workEmail: string;
  loginId: string;
  customerTagline: string;
  jobTitle: string;
  employeeId: string;
  department: string;
  roleId: string;
  permissions?: TeamPermissionCode[] | null;
};

export type TeamInvitationResult = {
  membershipId: string;
  activationCode: string;
  expiresAt: string;
};
