export type CreatorPeriod =
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'all_time';

export type CreatorCommissionRecord = {
  id: string;
  creatorId: string;
  sellerId: string;
  storefrontId: string;
  storefrontName: string;
  productId: string | null;
  productTitle: string;
  orderId: string;
  orderStatus: string;
  eligibleItemMinor: number;
  commissionBps: number;
  commissionMinor: number;
  status: string;
  createdAt: string;
  eligibleAt: string | null;
  paidAt: string | null;
  reversalReason: string | null;
};

export type CreatorEarningsSummary = {
  attributedOrders: number;
  attributedSalesMinor: number;
  estimatedMinor: number;
  pendingMinor: number;
  availableMinor: number;
  earnedMinor: number;
  reversedMinor: number;
  paidMinor: number;
};

const cancelledOrderStatuses = new Set(['cancelled', 'refunded', 'return_approved']);

export const creatorPeriodStart = (period: CreatorPeriod, now = new Date()) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'last_7_days') start.setDate(start.getDate() - 6);
  if (period === 'last_30_days') start.setDate(start.getDate() - 29);
  if (period === 'this_month') start.setDate(1);
  if (period === 'last_month') {
    start.setMonth(start.getMonth() - 1, 1);
  }
  if (period === 'this_year') start.setMonth(0, 1);
  return period === 'all_time' ? null : start;
};

export const creatorPeriodEnd = (period: CreatorPeriod, now = new Date()) => {
  if (period !== 'last_month') return null;
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  end.setDate(0);
  return end;
};

export function filterCreatorRecordsByPeriod<T extends { createdAt: string }>(
  records: readonly T[],
  period: CreatorPeriod,
  now = new Date(),
) {
  const start = creatorPeriodStart(period, now);
  const end = creatorPeriodEnd(period, now);
  if (!start) return [...records];
  return records.filter((record) => {
    const timestamp = new Date(record.createdAt).getTime();
    return timestamp >= start.getTime() && (!end || timestamp <= end.getTime());
  });
}

export function summarizeCreatorEarnings(records: readonly CreatorCommissionRecord[]): CreatorEarningsSummary {
  const qualifying = records.filter((record) =>
    !['cancelled', 'reversed'].includes(record.status)
    && !cancelledOrderStatuses.has(record.orderStatus),
  );
  const attributedOrders = new Set(records.map((record) => record.orderId)).size;
  const attributedSalesMinor = qualifying.reduce((sum, record) => sum + record.eligibleItemMinor, 0);
  const sumStatuses = (statuses: readonly string[], source: readonly CreatorCommissionRecord[] = qualifying) => source
    .filter((record) => statuses.includes(record.status))
    .reduce((sum, record) => sum + record.commissionMinor, 0);
  const estimatedMinor = sumStatuses(['pending']);
  const pendingMinor = sumStatuses(['pending', 'confirmed', 'withheld']);
  const availableMinor = sumStatuses(['eligible', 'payable']);
  const paidMinor = sumStatuses(['paid']);
  const reversedMinor = sumStatuses(['reversed', 'cancelled'], records);
  const earnedMinor = sumStatuses(['confirmed', 'eligible', 'payable', 'paid']);
  return {
    attributedOrders,
    attributedSalesMinor,
    estimatedMinor,
    pendingMinor,
    availableMinor,
    earnedMinor,
    reversedMinor,
    paidMinor,
  };
}

export type CreatorGrowthScore = {
  creatorId: string;
  displayName: string;
  username: string;
  avatarPath: string | null;
  attributedSalesMinor: number;
  successfulOrders: number;
  rank?: number;
};

export function rankCreatorGrowth(rows: readonly CreatorGrowthScore[]) {
  return [...rows]
    .sort((left, right) =>
      right.attributedSalesMinor - left.attributedSalesMinor
      || right.successfulOrders - left.successfulOrders
      || left.creatorId.localeCompare(right.creatorId),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export const creatorPaymentCopy = (summary: CreatorEarningsSummary) => ({
  availableMinor: summary.availableMinor,
  pendingMinor: summary.pendingMinor,
  providerConfigured: false,
  collectionLabel: summary.availableMinor > 0 ? 'Payout integration required' : 'No eligible payments yet',
});
