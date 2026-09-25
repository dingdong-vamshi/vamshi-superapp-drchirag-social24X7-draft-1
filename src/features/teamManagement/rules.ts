import type { TeamInvitationInput, TeamMemberStatus } from "./types";

export const teamStatusLabel: Record<TeamMemberStatus, string> = {
  not_activated: "Not activated",
  awaiting_approval: "Awaiting approval",
  verified: "Verified",
  suspended: "Suspended",
  removed: "Removed",
};

export function normalizeBusinessLoginId(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, "");
}

export function syntheticBusinessEmail(loginId: string) {
  const normalized = normalizeBusinessLoginId(loginId);
  return normalized ? `${normalized}@work.social24x7.app` : "";
}

export function isStrongWorkPassword(value: string) {
  return value.length >= 10 && value.length <= 128 &&
    /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

export function validateTeamInvitation(input: TeamInvitationInput) {
  const errors: string[] = [];
  const loginId = normalizeBusinessLoginId(input.loginId);
  if (input.fullName.trim().length < 2) errors.push("Enter the employee's full name.");
  if (!/^\S+@\S+\.\S+$/.test(input.workEmail.trim())) errors.push("Enter a valid work email.");
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(loginId)) errors.push("Login ID must be 3–40 letters, numbers, dots, dashes or underscores.");
  if (!input.customerTagline.trim()) errors.push("Add the customer-facing ‘from Company’ tagline.");
  if (!input.jobTitle.trim()) errors.push("Add a job title.");
  if (!input.department.trim()) errors.push("Add a department.");
  if (!input.roleId) errors.push("Choose a role.");
  return { valid: errors.length === 0, errors, loginId };
}
