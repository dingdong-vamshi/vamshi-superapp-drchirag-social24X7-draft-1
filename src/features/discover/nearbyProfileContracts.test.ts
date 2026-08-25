import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Nearby profile migration separates bio and keeps coordinates behind discovery RPC", () => {
  const migration = readFileSync(new URL("../../../supabase/migrations/20260825074414_nearby_profile_bio.sql", import.meta.url), "utf8");
  assert.match(migration, /add column if not exists nearby_bio/i);
  assert.match(migration, /using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /save_my_nearby_profile/i);
  assert.match(migration, /get_nearby_people_v2/i);
  const publicShape = migration.match(/get_nearby_people_v2\([\s\S]*?returns table \(([\s\S]*?)\)\s*language sql/i)?.[1] ?? "";
  assert.doesNotMatch(publicShape, /approximate_lat|approximate_lng/i);
  assert.match(migration, /revoke all on function public\.get_nearby_people_v2[\s\S]*from public, anon/i);
});

test("Nearby client persists through Supabase RPC instead of component-only state", () => {
  const repository = readFileSync(new URL("./nearbyPeopleRepository.ts", import.meta.url), "utf8");
  const screen = readFileSync(new URL("./NearbyPeopleScreen.tsx", import.meta.url), "utf8");
  assert.match(repository, /rpc\("save_my_nearby_profile"/);
  assert.match(repository, /rpc\("get_nearby_people_v2"/);
  assert.match(screen, /saveNearbyProfile\(\{ user, bio, interests \}\)/);
  assert.match(screen, /snapToInterval=\{stride\}/);
  assert.match(screen, /Interests\s+←\s+Profile\s+→\s+Bio/);
});
