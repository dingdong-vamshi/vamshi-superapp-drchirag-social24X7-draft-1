import assert from "node:assert/strict";
import test from "node:test";

import { calculateReferralBonusBps } from "./rewardMath.ts";

const config = { perActiveReferralBps: 100, maximumBonusBps: 5_000 };

test("a larger equally-active referral network earns a larger boost", () => {
  assert.ok(calculateReferralBonusBps({ totalReferred: 50, activeReferred: 30, ...config }) > calculateReferralBonusBps({ totalReferred: 5, activeReferred: 3, ...config }));
});

test("zero referrals and zero active referrals produce no bonus", () => {
  assert.equal(calculateReferralBonusBps({ totalReferred: 0, activeReferred: 0, ...config }), 0);
  assert.equal(calculateReferralBonusBps({ totalReferred: 9, activeReferred: 0, ...config }), 0);
});

test("the configured cap and unique referral count are enforced", () => {
  assert.equal(calculateReferralBonusBps({ totalReferred: 1_000, activeReferred: 1_000, ...config }), config.maximumBonusBps);
  assert.equal(calculateReferralBonusBps({ totalReferred: 1, activeReferred: 9, ...config }), calculateReferralBonusBps({ totalReferred: 1, activeReferred: 1, ...config }));
});
