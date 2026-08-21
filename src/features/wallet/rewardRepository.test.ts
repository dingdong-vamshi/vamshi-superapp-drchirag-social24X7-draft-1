import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  coinInputToMicrounits,
  createSupabaseRewardRepository,
  formatCoins,
  readWalletRecipient,
} from "./rewardRepository.ts";

test("formatCoins preserves signed ledger amounts in transfer history", () => {
  assert.equal(formatCoins(10_000_000), "10.00");
  assert.equal(formatCoins(-1_000_000), "-1.00");
});

test("wallet coin input accepts positive amounts with at most six decimals", () => {
  assert.equal(coinInputToMicrounits("1"), 1_000_000);
  assert.equal(coinInputToMicrounits("0.000001"), 1);
  assert.equal(coinInputToMicrounits("0"), null);
  assert.equal(coinInputToMicrounits("1.0000001"), null);
});

test("wallet QR parser accepts only a valid Social24 receive link", () => {
  const id = "272d8b05-da97-4d4c-8294-be45b7958ec9";
  assert.equal(readWalletRecipient(`social24://wallet/receive?user=${id}`), id);
  assert.equal(readWalletRecipient(`https://example.com/wallet/receive?user=${id}`), null);
  assert.equal(readWalletRecipient("social24://wallet/receive?user=not-a-user"), null);
});

test("referral sharing reuses an existing personal conversation", async () => {
  const conversationId = "11111111-1111-4111-8111-111111111111";
  const contactId = "22222222-2222-4222-8222-222222222222";
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "open_personal_conversation") return { data: conversationId, error: null };
      if (name === "send_personal_message") return { data: null, error: null };
      return { data: null, error: { message: `Unexpected RPC ${name}` } };
    },
  };
  const repository = createSupabaseRewardRepository(client as never);

  assert.equal(
    await repository.shareReferralToChat(contactId, "https://social24.example/ref/test"),
    conversationId,
  );
  assert.deepEqual(calls.map((call) => call.name), [
    "open_personal_conversation",
    "send_personal_message",
  ]);
  assert.deepEqual(calls[0]?.args, { participant: contactId });
  assert.equal(calls[1]?.args.target_conversation, conversationId);
  assert.equal(calls[1]?.args.message_kind, "text");
  assert.deepEqual(calls[1]?.args.message_payload, {
    referral_url: "https://social24.example/ref/test",
  });
});

test("reward history resolves transfer counterparties from the immutable ledger", () => {
  const migration = readFileSync(
    new URL("../../../supabase/migrations/20260821144500_wallet_counterparty_history.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /l\.entry_type = 'transfer_out'[\s\S]*'Sent to '/i);
  assert.match(migration, /l\.entry_type = 'transfer_in'[\s\S]*'Received from '/i);
  assert.match(migration, /left join public\.reward_transfers/i);
  assert.match(migration, /where l\.user_id = \(select auth\.uid\(\)\)/i);
});
