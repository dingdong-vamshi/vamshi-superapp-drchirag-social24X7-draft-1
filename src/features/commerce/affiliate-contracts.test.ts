import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Seller Affiliate changes reuse the owned Product and ownership-checked RPC", () => {
  const repository = read("./supabaseShopRepository.ts");
  const migration = read("../../../supabase/migrations/20260817110333_creator_commerce_progressive_onboarding_and_direct_publish.sql");
  const affiliateMethod = repository.slice(repository.indexOf("async setCreatorPromotion"), repository.indexOf("async publishProduct"));

  assert.match(affiliateMethod, /from\("products"\)[\s\S]*\.eq\("id", input\.productId\)/);
  assert.match(affiliateMethod, /rpc\("save_creator_commerce_product"/);
  assert.match(affiliateMethod, /p_creator_promotion_enabled: input\.enabled/);
  assert.match(affiliateMethod, /p_creator_commission_bps: input\.enabled \? input\.commissionBps : 0/);
  assert.match(migration, /where product\.id = p_product_id[\s\S]*product\.storefront_id = storefront\.id/i);
  assert.match(migration, /creator_commission_bps[\s\S]*between 500 and 7000/i);
});

test("Creator discovery filters Affiliate OFF while Buyer Shop remains unaffected", () => {
  const creatorRepository = read("../creatorCommerce/lifecycleRepository.ts");
  const shopRepository = read("./supabaseShopRepository.ts");
  const creatorQuery = creatorRepository.slice(creatorRepository.indexOf("export async function listCreatorMarketplaceProducts"), creatorRepository.indexOf("export async function listMyPromotions"));
  const buyerQuery = shopRepository.slice(shopRepository.indexOf("async listProducts"), shopRepository.indexOf("async listStorefronts"));

  assert.match(creatorQuery, /\.eq\('status', 'active'\)/);
  assert.match(creatorQuery, /\.eq\('product_approval_status', 'approved'\)/);
  assert.match(creatorQuery, /\.eq\('creator_promotion_enabled', true\)/);
  assert.match(creatorQuery, /\.gt\('inventory', 0\)/);
  assert.doesNotMatch(buyerQuery, /creator_promotion_enabled', true/);
});

test("promotion creation preserves Seller ownership, commission snapshot and attribution history", () => {
  const lifecycleMigration = read("../../../supabase/migrations/20260808071712_creator_commerce_phase_2_lifecycle.sql");
  assert.match(lifecycleMigration, /create or replace function public\.create_creator_product_promotion/i);
  assert.match(lifecycleMigration, /p\.creator_promotion_enabled\s*=\s*true/i);
  assert.match(lifecycleMigration, /commission_bps_snapshot/i);
  assert.match(lifecycleMigration, /creator_id, seller_id, storefront_id, product_id, promotion_id, promotion_click_id/i);
  assert.match(lifecycleMigration, /unique \(order_item_id\)/i);
});
