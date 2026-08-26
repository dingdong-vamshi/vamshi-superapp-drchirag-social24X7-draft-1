import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootLayout = readFileSync("app/_layout.tsx", "utf8");
const authContext = readFileSync("src/lib/AuthContext.tsx", "utf8");
const supabaseClient = readFileSync("src/lib/supabase.ts", "utf8");

test("private application routes are guarded by a real authenticated session", () => {
  assert.match(rootLayout, /<Stack\.Protected guard=\{Boolean\(session\?\.user\)\}>/);
  assert.match(rootLayout, /<Stack\.Screen name="\(tabs\)" \/>/);
  assert.match(rootLayout, /<Stack\.Screen name="seller\/index" \/>/);
  assert.match(rootLayout, /<Stack\.Screen name="checkout\/index" \/>/);
});

test("auth screens are only reachable while logged out", () => {
  assert.match(rootLayout, /<Stack\.Protected guard=\{!session\?\.user\}>/);
  assert.match(rootLayout, /<Stack\.Screen name="\(auth\)" \/>/);
});

test("legacy demo sessions cannot satisfy production route guards", () => {
  assert.doesNotMatch(authContext, /\bsignInDemo\b|\bsignUpDemo\b|type DemoSession/);
  assert.match(authContext, /removeItem\(legacyDemoSessionStorageKey\)/);
});

test("web confirmation redirects are detected and session persistence is enabled", () => {
  assert.match(supabaseClient, /persistSession: true/);
  assert.match(supabaseClient, /autoRefreshToken: true/);
  assert.match(supabaseClient, /detectSessionInUrl: Platform\.OS === 'web'/);
});
