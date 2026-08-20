/**
 * Referral mining is intentionally capped and uses both scale and activity.
 * The absolute-active term makes 30 active referrals more valuable than 3,
 * even when both networks have the same active percentage.
 */
export function calculateReferralBonusBps(input: {
  totalReferred: number;
  activeReferred: number;
  perActiveReferralBps: number;
  maximumBonusBps: number;
}) {
  const total = Math.max(0, Math.floor(input.totalReferred));
  const active = Math.min(total, Math.max(0, Math.floor(input.activeReferred)));
  const perActive = Math.max(0, Math.floor(input.perActiveReferralBps));
  const cap = Math.max(0, Math.floor(input.maximumBonusBps));
  const absoluteBonus = active * perActive;
  const activityBonus = total > 0 ? Math.floor((perActive * active) / total) : 0;
  return Math.min(cap, absoluteBonus + activityBonus);
}
