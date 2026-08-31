import type { SellerOrder, SellerReturn } from './shopRepository';

export type SellerOrderStatusFilter =
  | 'all'
  | 'on_hold'
  | 'pending'
  | 'ready_to_ship'
  | 'shipped'
  | 'cancelled'
  | 'confirmed'
  | 'processing'
  | 'out_for_delivery'
  | 'delivered';

export type SellerDateFilter = 'all' | 'today' | 'last_7_days' | 'last_30_days' | 'custom';
export type SellerOrderSort = 'newest' | 'oldest' | 'value_high' | 'value_low';
export type SellerReturnSort = 'newest' | 'oldest' | 'value_high' | 'value_low';

const settledPaymentStatuses = new Set(['captured', 'captured_test', 'paid', 'cod_pending', 'cod_collected']);

export function isSellerOrderOnHold(order: Pick<SellerOrder, 'status' | 'paymentStatus'>) {
  return order.status === 'placed' && !settledPaymentStatuses.has(order.paymentStatus.toLowerCase());
}

export function matchesSellerOrderStatus(order: SellerOrder, filter: SellerOrderStatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'on_hold') return isSellerOrderOnHold(order);
  if (filter === 'pending') return ['placed', 'confirmed'].includes(order.status) && !isSellerOrderOnHold(order);
  if (filter === 'ready_to_ship') return order.status === 'processing';
  if (filter === 'shipped') return ['shipped', 'out_for_delivery'].includes(order.status);
  return order.status === filter;
}

function startForDateFilter(filter: SellerDateFilter, now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (filter === 'last_7_days') start.setDate(start.getDate() - 6);
  if (filter === 'last_30_days') start.setDate(start.getDate() - 29);
  return start;
}

export function isWithinSellerDateFilter(
  value: string | null | undefined,
  filter: SellerDateFilter,
  options: { now?: Date; customStart?: string; customEnd?: string } = {},
) {
  if (filter === 'all') return true;
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const now = options.now ?? new Date();
  if (filter === 'custom') {
    const start = options.customStart ? new Date(`${options.customStart}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const end = options.customEnd ? new Date(`${options.customEnd}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return timestamp >= start && timestamp <= end;
  }
  return timestamp >= startForDateFilter(filter, now).getTime();
}

export function filterAndSortSellerOrders(
  orders: readonly SellerOrder[],
  filters: {
    status: SellerOrderStatusFilter;
    orderDate: SellerDateFilter;
    dispatchDate: SellerDateFilter;
    customOrderStart?: string;
    customOrderEnd?: string;
    customDispatchStart?: string;
    customDispatchEnd?: string;
    sort: SellerOrderSort;
    now?: Date;
  },
) {
  const next = orders.filter((order) =>
    matchesSellerOrderStatus(order, filters.status)
    && isWithinSellerDateFilter(order.createdAt, filters.orderDate, {
      now: filters.now,
      customStart: filters.customOrderStart,
      customEnd: filters.customOrderEnd,
    })
    && isWithinSellerDateFilter(order.dispatchAt, filters.dispatchDate, {
      now: filters.now,
      customStart: filters.customDispatchStart,
      customEnd: filters.customDispatchEnd,
    }),
  );
  return next.sort((left, right) => {
    if (filters.sort === 'oldest') return left.createdAt.localeCompare(right.createdAt);
    if (filters.sort === 'value_high') return right.totalPaise - left.totalPaise;
    if (filters.sort === 'value_low') return left.totalPaise - right.totalPaise;
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export function filterAndSortSellerReturns(
  returns: readonly SellerReturn[],
  filters: {
    status: string;
    category: string;
    date: SellerDateFilter;
    customStart?: string;
    customEnd?: string;
    sort: SellerReturnSort;
    now?: Date;
  },
) {
  const next = returns.filter((request) =>
    (filters.status === 'all' || request.status === filters.status)
    && (filters.category === 'all' || request.productCategory === filters.category)
    && isWithinSellerDateFilter(request.requestedAt, filters.date, {
      now: filters.now,
      customStart: filters.customStart,
      customEnd: filters.customEnd,
    }),
  );
  return next.sort((left, right) => {
    if (filters.sort === 'oldest') return left.requestedAt.localeCompare(right.requestedAt);
    if (filters.sort === 'value_high') return right.itemSubtotalPaise - left.itemSubtotalPaise;
    if (filters.sort === 'value_low') return left.itemSubtotalPaise - right.itemSubtotalPaise;
    return right.requestedAt.localeCompare(left.requestedAt);
  });
}

export function groupReturnPerformance(returns: readonly SellerReturn[]) {
  const groups = new Map<string, { productTitle: string; category: string; count: number; valuePaise: number }>();
  returns.forEach((request) => {
    const key = request.productTitle;
    const current = groups.get(key) ?? {
      productTitle: request.productTitle,
      category: request.productCategory,
      count: 0,
      valuePaise: 0,
    };
    current.count += 1;
    current.valuePaise += request.itemSubtotalPaise;
    groups.set(key, current);
  });
  return [...groups.values()].sort((left, right) => right.count - left.count || left.productTitle.localeCompare(right.productTitle));
}
