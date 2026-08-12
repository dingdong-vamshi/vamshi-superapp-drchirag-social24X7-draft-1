import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminProductDecisionsFor,
  canEditLifecycleProduct,
  canSubmitLifecycleProduct,
  formatMinor,
  listAdminProductQueue,
  listCreatorMarketplaceProducts,
  listSellerLifecycleProducts,
  reviewLifecycleProduct,
  saveSellerLifecycleProduct,
  sellerFulfillmentDecisionsFor,
  slugifyCommerce,
  submitLifecycleProduct,
} from './lifecycleRepository.ts';

test('slugifyCommerce creates product-safe slugs', () => {
  assert.equal(slugifyCommerce('  Creator Commerce Test Product!  '), 'creator-commerce-test-product');
  assert.equal(slugifyCommerce('₹₹'), 'product');
  assert.equal(slugifyCommerce('A'.repeat(100)).length, 62);
});

test('formatMinor renders INR minor units', () => {
  assert.equal(formatMinor(500), '₹5');
  assert.equal(formatMinor(123456), '₹1,235');
});

test('seller edits and submits only mutable product states', () => {
  for (const status of ['draft', 'changes_required', 'rejected'] as const) {
    assert.equal(canEditLifecycleProduct(status), true);
    assert.equal(canSubmitLifecycleProduct(status), true);
  }
  for (const status of ['submitted', 'under_review', 'approved', 'suspended', 'archived'] as const) {
    assert.equal(canEditLifecycleProduct(status), false);
    assert.equal(canSubmitLifecycleProduct(status), false);
  }
});

test('admin actions follow the authoritative review state machine', () => {
  assert.deepEqual(adminProductDecisionsFor('submitted'), ['under_review', 'approved', 'changes_required', 'rejected']);
  assert.deepEqual(adminProductDecisionsFor('under_review'), ['approved', 'changes_required', 'rejected']);
  assert.deepEqual(adminProductDecisionsFor('approved'), ['suspended']);
  assert.deepEqual(adminProductDecisionsFor('suspended'), ['approved']);
  assert.deepEqual(adminProductDecisionsFor('draft'), []);
  assert.deepEqual(adminProductDecisionsFor('archived'), []);
});

test('seller fulfillment exposes only the next forward transition', () => {
  assert.deepEqual(sellerFulfillmentDecisionsFor('draft'), ['confirmed']);
  assert.deepEqual(sellerFulfillmentDecisionsFor('placed'), ['confirmed']);
  assert.deepEqual(sellerFulfillmentDecisionsFor('confirmed'), ['processing']);
  assert.deepEqual(sellerFulfillmentDecisionsFor('processing'), ['shipped']);
  assert.deepEqual(sellerFulfillmentDecisionsFor('shipped'), ['out_for_delivery']);
  assert.deepEqual(sellerFulfillmentDecisionsFor('out_for_delivery'), ['delivered']);
  assert.deepEqual(sellerFulfillmentDecisionsFor('delivered'), []);
});

test('approved seller provisions a storefront and one draft reaches admin approval and creator discovery', async () => {
  const sellerId = '272d8b05-da97-4d4c-8294-be45b7958ec9';
  const storefrontId = 'ab78991c-29a0-4286-aa82-201e88ae1b15';
  const productId = '0282490e-1a3f-487d-9778-997d349a425c';
  const now = '2026-08-08T00:00:00.000Z';
  const storefront = { id: storefrontId, name: 'Social24 Test Store' };
  const baseProduct = {
    id: productId,
    storefront_id: storefrontId,
    title: 'Social24 Test Sneakers',
    slug: 'social24-test-sneakers',
    category: 'Everyday',
    short_description: 'Test product created only for Creator Commerce acceptance testing.',
    description: 'Test product created only for Creator Commerce acceptance testing.',
    price_minor: 100000,
    sale_price_minor: 90000,
    inventory: 10,
    inventory_reserved: 0,
    sku: 'S24-TEST-001',
    status: 'draft',
    product_approval_status: 'draft',
    creator_promotion_enabled: true,
    creator_commission_bps: 2000,
    return_window_days: 7,
    review_note: null,
    updated_at: now,
    storefronts: { ...storefront, owner_id: sellerId },
    product_media: [],
  };
  const tableResponses = [
    { data: { seller_status: 'approved' }, error: null },
    {
      data: {
        storefront_name: storefront.name,
        storefront_slug: 'social24-test-store',
        business_name: storefront.name,
        business_type: 'independent',
        seller_tier: 'local',
        state_code: 'KA',
        registered_state: 'KARNATAKA',
        city: 'Bengaluru',
        phone: '9000000000',
        email: 'seller@example.test',
        legal_name: 'Social24 Test Seller',
        status: 'approved',
      },
      error: null,
    },
    { data: storefront, error: null },
    { data: baseProduct, error: null },
    { data: storefront, error: null },
    { data: [baseProduct], error: null },
    { data: [{ ...baseProduct, product_approval_status: 'submitted' }], error: null },
    {
      data: [{ ...baseProduct, status: 'active', product_approval_status: 'approved' }],
      error: null,
    },
  ];
  const rpcResponses: Record<string, Array<{ data: unknown; error: unknown }>> = {
    ensure_creator_commerce_storefront: [
      { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
      { data: storefrontId, error: null },
    ],
    save_creator_commerce_product: [
      { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
    ],
    submit_creator_commerce_product: [
      { data: { ...baseProduct, product_approval_status: 'submitted' }, error: null },
    ],
    review_creator_commerce_product: [
      { data: { ...baseProduct, product_approval_status: 'under_review' }, error: null },
      { data: { ...baseProduct, status: 'active', product_approval_status: 'approved' }, error: null },
    ],
  };
  const calls: Array<{ table: string; action: string; value?: unknown }> = [];
  const nextTableResponse = () => {
    const response = tableResponses.shift();
    assert.ok(response, 'unexpected repository table call');
    return response;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: sellerId } }, error: null }) },
    rpc: async (name: string) => {
      const response = rpcResponses[name]?.shift();
      assert.ok(response, `unexpected RPC call: ${name}`);
      return response;
    },
    from: (table: string) => {
      const builder: any = {
        select(value: string) { calls.push({ table, action: 'select', value }); return builder; },
        eq(column: string, value: unknown) { calls.push({ table, action: `eq:${column}`, value }); return builder; },
        in(column: string, value: unknown) { calls.push({ table, action: `in:${column}`, value }); return builder; },
        order(column: string, value: unknown) { calls.push({ table, action: `order:${column}`, value }); return builder; },
        limit(value: number) { calls.push({ table, action: 'limit', value }); return builder; },
        upsert(value: unknown) { calls.push({ table, action: 'upsert', value }); return builder; },
        single: async () => nextTableResponse(),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(nextTableResponse()).then(resolve, reject),
      };
      return builder;
    },
  } as any;

  const draft = await saveSellerLifecycleProduct(client, {
    title: baseProduct.title,
    slug: baseProduct.slug,
    category: baseProduct.category,
    priceMinor: baseProduct.price_minor,
    salePriceMinor: baseProduct.sale_price_minor,
    inventory: baseProduct.inventory,
    shortDescription: baseProduct.short_description,
    description: baseProduct.description,
    sku: baseProduct.sku,
    creatorPromotionEnabled: true,
    creatorCommissionBps: 2000,
    returnWindowDays: 7,
  });
  assert.equal(draft.approvalStatus, 'draft');
  assert.equal(draft.storefrontId, storefrontId);
  const productUpsert = calls.find((call) => call.table === 'products' && call.action === 'upsert');
  assert.deepEqual(
    { storefront_id: (productUpsert?.value as any).storefront_id, status: (productUpsert?.value as any).status },
    { storefront_id: storefrontId, status: 'draft' },
  );

  const reloaded = await listSellerLifecycleProducts(client);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0]?.id, productId);
  assert.equal((await submitLifecycleProduct(client, productId)).approvalStatus, 'submitted');
  assert.equal((await listAdminProductQueue(client))[0]?.approvalStatus, 'submitted');
  assert.equal((await reviewLifecycleProduct(client, productId, 'under_review', '')).approvalStatus, 'under_review');
  assert.equal((await reviewLifecycleProduct(client, productId, 'approved', '')).approvalStatus, 'approved');
  assert.equal((await listCreatorMarketplaceProducts(client))[0]?.approvalStatus, 'approved');
  assert.equal(tableResponses.length, 0);
});
