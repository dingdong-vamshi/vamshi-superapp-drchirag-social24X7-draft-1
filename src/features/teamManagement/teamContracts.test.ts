import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = (name: string) => readFileSync(join(root, "supabase", "migrations", name), "utf8");
const foundation = migration("20260925080113_team_management_foundation.sql");
const authorization = migration("20260925080116_team_management_authorization.sql");
const assignment = migration("20260925080118_business_employee_conversation_assignment.sql");
const privacy = migration("20260925080121_business_employee_realtime_and_privacy.sql");
const runtimeFixes = migration("20260925093428_fix_team_management_runtime_contracts.sql");
const activationHookFix = migration("20260925094348_allow_claimed_work_identity_creation.sql");
const workConversationFix = migration("20260925094757_use_storefront_owner_for_work_conversations.sql");
const conversationIdFix = migration("20260925094914_disambiguate_work_conversation_id.sql");
const workParticipantFix = migration("20260925095059_allow_work_identity_conversation_participants.sql");
const workMessageFix = migration("20260925095159_preserve_work_message_attribution.sql");
const edge = readFileSync(join(root, "supabase", "functions", "business-work-auth", "index.ts"), "utf8");
const teamRepository = readFileSync(join(root, "src", "features", "teamManagement", "teamRepository.ts"), "utf8");
const workspace = readFileSync(join(root, "app", "business-workspace.tsx"), "utf8");

test("team entities are tenant-scoped and protected by RLS", () => {
  for (const table of ["storefront_team_roles", "storefront_team_memberships", "storefront_team_invitations", "storefront_team_audit_events"]) {
    assert.match(foundation, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(authorization, /business_team_manage/);
  assert.match(authorization, /identity_kind = 'work'/);
});

test("activation uses server-only admin auth and one-time claim completion", () => {
  assert.match(authorization, /grant execute on function public\.claim_business_team_activation\(text, text\) to service_role/);
  assert.match(authorization, /activation_claim_expires_at = now\(\) \+ interval '5 minutes'/);
  assert.match(authorization, /invitation\.attempts >= invitation\.max_attempts/);
  assert.match(authorization, /invitation\.code_hash <> encode\(digest/);
  assert.match(edge, /auth\.admin\.createUser/);
  assert.match(edge, /account_type: "business_employee"/);
  assert.match(edge, /auth\.admin\.deleteUser/);
  assert.doesNotMatch(edge, /serviceRoleKey[^\n]*(?:json|response)/i);
});

test("auth insert bypass requires a live server-issued activation claim", () => {
  const claimedIdentity = activationHookFix.match(
    /create or replace function private\.is_claimed_business_work_identity[\s\S]*?\$\$;/,
  )?.[0] ?? "";
  assert.match(claimedIdentity, /membership\.status = 'not_activated'/);
  assert.match(claimedIdentity, /membership\.auth_user_id is null/);
  assert.match(claimedIdentity, /invitation\.activation_claim_hash is not null/);
  assert.match(claimedIdentity, /invitation\.activation_claim_expires_at > now\(\)/);
  assert.doesNotMatch(claimedIdentity, /raw_user_meta_data|work_only/);
  assert.match(activationHookFix, /handle_new_auth_user[\s\S]*is_claimed_business_work_identity/);
  assert.match(activationHookFix, /create_creator_commerce_access_for_user[\s\S]*is_claimed_business_work_identity/);
});

test("business chat enforces one active assignee and immediate revocation", () => {
  assert.match(assignment, /conversation_id uuid primary key/);
  assert.match(assignment, /Only the active verified assignee may reply/);
  assert.match(assignment, /delete from public\.conversation_participants/);
  assert.match(assignment, /reopen_business_conversation_after_customer_message/);
});

test("work chat creates the conversation through the storefront owner profile", () => {
  assert.match(workConversationFix, /'buyer_seller', storefront_owner/);
  assert.doesNotMatch(workConversationFix, /'buyer_seller', viewer/);
  assert.match(workConversationFix, /member\.id, viewer,[\s\S]*'assigned'/);
});

test("phone-started work chats use an unambiguous conversation identifier", () => {
  assert.match(conversationIdFix, /created_conversation_id uuid/);
  assert.match(conversationIdFix, /assignment\.conversation_id = created_conversation_id/);
  assert.doesNotMatch(conversationIdFix, /where assignment\.conversation_id = conversation_id/);
});

test("conversation membership accepts isolated Auth-only work identities", () => {
  assert.match(workParticipantFix, /references auth\.users\(id\) on delete cascade/);
  assert.doesNotMatch(workParticipantFix, /references public\.profiles/);
});

test("business messages retain Auth-only representative attribution", () => {
  assert.match(workMessageFix, /foreign key \(sender_id\) references auth\.users\(id\)/);
  assert.doesNotMatch(workMessageFix, /references public\.profiles/);
});

test("work identities receive PII-safe projections and authoritative badges", () => {
  assert.match(privacy, /profiles_business_work_isolation/);
  assert.match(privacy, /posts_business_work_isolation/);
  assert.match(privacy, /business_representative_payload/);
  assert.match(privacy, /get_business_safe_order_context/);
  assert.doesNotMatch(assignment.match(/create or replace function public\.get_business_workspace_inbox[\s\S]*?\$\$;/)?.[0] ?? "", /phone|email|address/i);
});

test("member profile saves have a matching authorized RPC", () => {
  assert.match(teamRepository, /rpc\(client, "update_storefront_team_member"/);
  assert.match(runtimeFixes, /create or replace function public\.update_storefront_team_member\(/);
  assert.match(runtimeFixes, /private\.storefront_team_permission\([\s\S]*'business_team_manage'/);
  assert.match(runtimeFixes, /grant execute on function public\.update_storefront_team_member[\s\S]*to authenticated/);
});

test("private business helpers and lookup attempts stay inaccessible", () => {
  assert.match(runtimeFixes, /alter table private\.business_customer_lookup_attempts enable row level security/);
  for (const helper of [
    "business_representative_payload",
    "chat_send_permitted",
    "reopen_business_conversation_after_customer_message",
  ]) {
    assert.match(runtimeFixes, new RegExp(`revoke all on function private\\.${helper}`));
  }
});

test("realtime membership changes revoke an inactive open session", () => {
  assert.match(workspace, /repository\.getContext\(\)/);
  assert.match(workspace, /nextContext\.status !== "verified"/);
  assert.match(workspace, /await revokeInactiveSession\(\)/);
  assert.match(workspace, /setContext\(null\)/);
  assert.match(workspace, /await signOut\(\)/);
});
