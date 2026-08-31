import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterAndSortSellerOrders,
  filterAndSortSellerReturns,
  groupReturnPerformance,
  matchesSellerOrderStatus,
} from './seller-order-return-filters.ts';
import type { SellerOrder, SellerReturn } from './shopRepository.ts';

const order = (overrides: Partial<SellerOrder> = {}): SellerOrder => ({
  id: overrides.id ?? crypto.randomUUID(),
  customerId: 'buyer',
  customerName: 'Buyer',
  customerUsername: 'buyer',
  createdAt: '2026-08-29T10:00:00.000Z',
  dispatchAt: null,
  totalPaise: 10_000,
  paymentStatus: 'captured_test',
  status: 'placed',
  fulfillment: null,
  ...overrides,
});

const returnRequest = (overrides: Partial<SellerReturn> = {}): SellerReturn => ({
  id: overrides.id ?? crypto.randomUUID(),
  orderId: 'order',
  orderItemId: 'item',
  buyerId: 'buyer',
  buyerName: 'Buyer',
  buyerUsername: 'buyer',
  productTitle: 'Shoes',
  productCategory: 'Fashion',
  itemSubtotalPaise: 10_000,
  status: 'submitted',
  reason: 'Size',
  requestedAt: '2026-08-29T10:00:00.000Z',
  trackingStatus: 'Return Requested',
  evidence: [],
  ...overrides,
});

test('Seller status aliases map onto authoritative Order states without creating new states', () => {
  assert.equal(matchesSellerOrderStatus(order({ status: 'processing' }), 'ready_to_ship'), true);
  assert.equal(matchesSellerOrderStatus(order({ status: 'out_for_delivery' }), 'shipped'), true);
  assert.equal(matchesSellerOrderStatus(order({ status: 'placed', paymentStatus: 'external_integration_pending' }), 'on_hold'), true);
  assert.equal(matchesSellerOrderStatus(order({ status: 'confirmed' }), 'pending'), true);
});

test('Seller Order filters combine status, date and numeric value sorting', () => {
  const rows = [
    order({ id: 'a', status: 'processing', totalPaise: 5_000, createdAt: '2026-08-30T10:00:00.000Z' }),
    order({ id: 'b', status: 'processing', totalPaise: 15_000, createdAt: '2026-08-28T10:00:00.000Z' }),
    order({ id: 'c', status: 'delivered', totalPaise: 25_000, createdAt: '2026-08-30T10:00:00.000Z' }),
  ];
  const filtered = filterAndSortSellerOrders(rows, {
    status: 'ready_to_ship', orderDate: 'last_7_days', dispatchDate: 'all', sort: 'value_high', now: new Date('2026-08-31T12:00:00.000Z'),
  });
  assert.deepEqual(filtered.map((row) => row.id), ['b', 'a']);
});

test('Return filters and grouped return counts use real rows in the correct context', () => {
  const rows = [
    returnRequest({ id: 'a', productTitle: 'Shoes', itemSubtotalPaise: 5_000 }),
    returnRequest({ id: 'b', productTitle: 'Shoes', itemSubtotalPaise: 15_000, status: 'approved' }),
    returnRequest({ id: 'c', productTitle: 'Bag', productCategory: 'Travel', itemSubtotalPaise: 25_000 }),
  ];
  const filtered = filterAndSortSellerReturns(rows, { status: 'all', category: 'Fashion', date: 'all', sort: 'value_high' });
  assert.deepEqual(filtered.map((row) => row.id), ['b', 'a']);
  assert.deepEqual(groupReturnPerformance(rows).map((row) => [row.productTitle, row.count]), [['Shoes', 2], ['Bag', 1]]);
});
