import assert from 'node:assert/strict';
import test from 'node:test';
import {
  creatorPaymentCopy,
  filterCreatorRecordsByPeriod,
  rankCreatorGrowth,
  summarizeCreatorEarnings,
  type CreatorCommissionRecord,
} from './creator-center-model.ts';

const commission = (overrides: Partial<CreatorCommissionRecord> = {}): CreatorCommissionRecord => ({
  id: overrides.id ?? crypto.randomUUID(),
  creatorId: 'creator-a',
  sellerId: 'seller-a',
  storefrontId: 'store-a',
  storefrontName: 'Store A',
  productId: 'product-a',
  productTitle: 'Product A',
  orderId: overrides.orderId ?? crypto.randomUUID(),
  orderStatus: 'delivered',
  eligibleItemMinor: 10_000,
  commissionBps: 1_000,
  commissionMinor: 1_000,
  status: 'confirmed',
  createdAt: '2026-08-29T10:00:00.000Z',
  eligibleAt: null,
  paidAt: null,
  reversalReason: null,
  ...overrides,
});

test('Creator dashboard totals derive from qualifying real records and keep reversals separate', () => {
  const rows = [
    commission({ orderId: 'order-1', status: 'confirmed' }),
    commission({ orderId: 'order-2', status: 'eligible', commissionMinor: 2_000, eligibleItemMinor: 20_000 }),
    commission({ orderId: 'order-3', status: 'paid', commissionMinor: 3_000, eligibleItemMinor: 30_000 }),
    commission({ orderId: 'order-4', status: 'reversed', commissionMinor: 4_000, eligibleItemMinor: 40_000 }),
    commission({ orderId: 'order-5', status: 'confirmed', orderStatus: 'return_approved', commissionMinor: 5_000, eligibleItemMinor: 50_000 }),
  ];
  assert.deepEqual(summarizeCreatorEarnings(rows), {
    attributedOrders: 5,
    attributedSalesMinor: 60_000,
    estimatedMinor: 0,
    pendingMinor: 1_000,
    availableMinor: 2_000,
    earnedMinor: 1_000 + 2_000 + 3_000,
    reversedMinor: 4_000,
    paidMinor: 3_000,
  });
});

test('period controls use record timestamps without inventing historical buckets', () => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const rows = [
    commission({ id: 'recent', createdAt: '2026-08-30T10:00:00.000Z' }),
    commission({ id: 'month', createdAt: '2026-08-03T10:00:00.000Z' }),
    commission({ id: 'previous', createdAt: '2026-07-20T10:00:00.000Z' }),
  ];
  assert.deepEqual(filterCreatorRecordsByPeriod(rows, 'last_7_days', now).map((row) => row.id), ['recent']);
  assert.deepEqual(filterCreatorRecordsByPeriod(rows, 'this_month', now).map((row) => row.id), ['recent', 'month']);
  assert.deepEqual(filterCreatorRecordsByPeriod(rows, 'last_month', now).map((row) => row.id), ['previous']);
});

test('Growth ranking is deterministic and based on attributed sales then successful Orders', () => {
  const ranked = rankCreatorGrowth([
    { creatorId: 'b', displayName: 'B', username: 'b', avatarPath: null, attributedSalesMinor: 50_000, successfulOrders: 4 },
    { creatorId: 'a', displayName: 'A', username: 'a', avatarPath: null, attributedSalesMinor: 50_000, successfulOrders: 4 },
    { creatorId: 'c', displayName: 'C', username: 'c', avatarPath: null, attributedSalesMinor: 40_000, successfulOrders: 10 },
  ]);
  assert.deepEqual(ranked.map((row) => [row.creatorId, row.rank]), [['a', 1], ['b', 2], ['c', 3]]);
});

test('Collect Payment never claims money moved without a payout provider', () => {
  const summary = summarizeCreatorEarnings([commission({ status: 'eligible' })]);
  assert.deepEqual(creatorPaymentCopy(summary), {
    availableMinor: 1_000,
    pendingMinor: 0,
    providerConfigured: false,
    collectionLabel: 'Payout integration required',
  });
});
