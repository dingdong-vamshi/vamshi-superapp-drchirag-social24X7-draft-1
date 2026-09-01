import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../../../supabase/migrations/20260901052605_realtime_notifications_coin_games.sql", import.meta.url),
  "utf8",
);

test("quick game debit is server-authoritative, idempotent and wallet-backed", () => {
  assert.match(migration, /start_quick_game_with_mined_coins/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /unique \(user_id, idempotency_key\)/);
  assert.match(migration, /'game_entry'/);
  assert.match(migration, /-game_cost/);
  assert.match(migration, /Insufficient mined coins/);
});

test("supported game list is explicit and order conversion is not invented", () => {
  for (const game of ["quick-tic-tac-toe", "quick-snake-ladder", "quick-memory-match"]) {
    assert.match(migration, new RegExp(game));
  }
  assert.doesNotMatch(migration, /coin.*rupee|rupee.*coin|coin.*inr|inr.*coin/i);
});

test("chat and notification tables are published to Supabase Realtime", () => {
  for (const table of ["messages", "conversations", "conversation_participants", "commerce_notifications", "social_notifications", "reward_ledger"]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /supabase_realtime/);
});
