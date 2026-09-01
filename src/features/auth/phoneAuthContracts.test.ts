import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("login requires email, phone, and password and verifies phone after Auth", () => {
  const login = read("../../../app/(auth)/login.tsx");
  const validation = read("./authValidation.ts");
  const context = read("../../lib/AuthContext.tsx");

  assert.match(login, /icon=\{Smartphone\}[\s\S]*?label="Phone number"/);
  assert.match(login, /validateLogin\(\{ email, phone, password \}\)/);
  assert.match(
    context,
    /signInWithPassword\(\{\s*email: input\.email[\s\S]*?password: input\.password/,
  );
  assert.match(context, /rpc\(\s*"verify_my_login_phone"/);
  assert.match(
    context,
    /if \(phoneError \|\| phoneMatches !== true\)[\s\S]*?auth\.signOut/,
  );
  assert.match(validation, /Incorrect email, phone number or password\./);
  assert.doesNotMatch(validation, /belongs to an account|account exists/i);
});

test("phone migration provides private legacy compatibility and authoritative changes", () => {
  const migration = read(
    "../../../supabase/migrations/20260901074113_account_phone_credentials.sql",
  );

  assert.match(
    migration,
    /create table if not exists private\.account_phone_credentials/,
  );
  assert.match(migration, /'\+919000000000', true/);
  assert.match(migration, /where is_legacy_shared = false/);
  assert.match(
    migration,
    /revoke all on table private\.account_phone_credentials from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /create or replace function public\.verify_my_login_phone/,
  );
  assert.match(
    migration,
    /create or replace function public\.update_my_login_phone/,
  );
  assert.match(
    migration,
    /phone_e164 = excluded\.phone_e164,[\s\S]*?is_legacy_shared = false/,
  );
  assert.match(migration, /new\.raw_user_meta_data ->> 'phone_e164'/);
  assert.match(migration, /raise exception 'A valid phone number is required'/);
  assert.match(migration, /phone = null,[\s\S]*?phone_discoverable = false/);
});

test("account settings changes phone through the private RPC and password through Supabase Auth", () => {
  const screen = read("../profile/AccountSettingsScreen.tsx");

  assert.match(
    screen,
    /rpc\("update_my_login_phone",\s*\{\s*p_phone: normalized,?\s*\}\)/,
  );
  assert.match(screen, /auth\.updateUser\(\{\s*password: newPassword,?\s*\}\)/);
  assert.match(screen, /newPassword !== confirmPassword/);
  assert.doesNotMatch(
    screen,
    /setItem\([^\n]*password|AsyncStorage[\s\S]*password/i,
  );
});
