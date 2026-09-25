import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootLayout = readFileSync("app/_layout.tsx", "utf8");
const authContext = readFileSync("src/lib/AuthContext.tsx", "utf8");
const supabaseClient = readFileSync("src/lib/supabase.ts", "utf8");

test("personal and business routes require their isolated authenticated identities", () => {
  assert.match(rootLayout, /const personalSession = Boolean\(session\?\.user\) && !workIdentity/);
  assert.match(rootLayout, /<Stack\.Protected guard=\{personalSession\}>/);
  assert.match(rootLayout, /<Stack\.Screen name="\(tabs\)" \/>/);
  assert.match(rootLayout, /<Stack\.Screen name="seller\/index" \/>/);
  assert.match(rootLayout, /<Stack\.Screen name="checkout\/index" \/>/);
  assert.match(rootLayout, /<Stack\.Protected guard=\{Boolean\(session\?\.user\) && workIdentity\}>/);
  assert.match(rootLayout, /<Stack\.Screen name="business-workspace" \/>/);
});

test("auth screens are only reachable while logged out", () => {
  assert.match(rootLayout, /<Stack\.Protected guard=\{!session\?\.user\}>/);
  assert.match(rootLayout, /<Stack\.Screen name="\(auth\)" \/>/);
  assert.match(rootLayout, /<Stack\.Screen name="business-login" \/>/);
  assert.match(rootLayout, /<Stack\.Screen name="business-activate" \/>/);
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

test("business login validates work access before publishing the session", () => {
  assert.match(authContext, /const businessSignInInFlight = useRef\(false\)/);
  assert.match(authContext, /businessSignInInFlight\.current && nextSession/);
  assert.match(authContext, /businessSignInInFlight\.current = true[\s\S]*get_my_business_work_context[\s\S]*businessSignInInFlight\.current = false/);
});
