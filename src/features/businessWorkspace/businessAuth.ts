import type { User } from "@supabase/supabase-js";
import { normalizeBusinessLoginId, syntheticBusinessEmail } from "../teamManagement/rules";

export const isBusinessWorkIdentity = (user: User | null | undefined) =>
  user?.app_metadata?.account_type === "business_employee";

export const businessLoginEmail = (loginId: string) => syntheticBusinessEmail(normalizeBusinessLoginId(loginId));

export type BusinessWorkContext = {
  membershipId: string;
  storefrontId: string;
  storefrontName: string;
  storefrontSlug: string;
  storefrontVerified: boolean;
  fullName: string;
  customerTagline: string;
  jobTitle: string;
  department: string;
  roleId: string;
  roleName: string;
  status: "not_activated" | "awaiting_approval" | "verified" | "suspended" | "removed";
  representativeVerified: boolean;
  permissions: string[];
};
