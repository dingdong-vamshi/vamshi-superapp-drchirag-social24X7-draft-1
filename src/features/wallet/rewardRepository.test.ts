import assert from "node:assert/strict";
import test from "node:test";

import { coinInputToMicrounits, formatCoins, readWalletRecipient } from "./rewardRepository.ts";

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
