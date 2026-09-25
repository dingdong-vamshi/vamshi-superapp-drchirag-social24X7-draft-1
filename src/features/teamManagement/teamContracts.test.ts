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
const edge = readFileSync(join(root, "supabase", "functions", "business-work-auth", "index.ts"), "utf8");

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
  assert.match(edge, /auth\.admin\.createUser/);
  assert.match(edge, /account_type: "business_employee"/);
  assert.match(edge, /auth\.admin\.deleteUser/);
});

test("business chat enforces one active assignee and immediate revocation", () => {
  assert.match(assignment, /conversation_id uuid primary key/);
  assert.match(assignment, /Only the active verified assignee may reply/);
  assert.match(assignment, /delete from public\.conversation_participants/);
  assert.match(assignment, /reopen_business_conversation_after_customer_message/);
});

test("work identities receive PII-safe projections and authoritative badges", () => {
  assert.match(privacy, /profiles_business_work_isolation/);
  assert.match(privacy, /posts_business_work_isolation/);
  assert.match(privacy, /business_representative_payload/);
  assert.match(privacy, /get_business_safe_order_context/);
  assert.doesNotMatch(assignment.match(/create or replace function public\.get_business_workspace_inbox[\s\S]*?\$\$;/)?.[0] ?? "", /phone|email|address/i);
});
