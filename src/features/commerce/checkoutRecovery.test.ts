import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260821130000_recover_checkout_and_demo_payment.sql",
  import.meta.url,
);

async function checkoutMigration() {
  return readFile(migrationUrl, "utf8");
}

test("checkout is buyer-owned, validates COD KYC, clears the cart, and keeps creator attribution", async () => {
  const sql = await checkoutMigration();

  assert.match(sql, /current_user_id uuid := auth\.uid\(\)/);
  assert.match(sql, /if current_user_id is null then/);
  assert.match(sql, /access\.buyer_kyc_status = 'verified'/);
  assert.match(sql, /Cash on delivery requires verified Buyer KYC/);
  assert.match(sql, /delete from public\.cart_items\s+where buyer_id = current_user_id/);
  assert.match(sql, /promotion_id,\s+promotion_click_id,\s+creator_id/s);
});

test("demo online payment is captured without an admin confirmation workflow", async () => {
  const sql = await checkoutMigration();

  assert.match(sql, /selected_payment_status := case when selected_payment_method = 'cod' then 'cod_pending' else 'captured_test' end/);
  assert.match(sql, /case when selected_payment_method = 'cod' then 'cod' else 'demo_online' end/);
  assert.doesNotMatch(sql, /external_payment_pending'\s*;\s*--\s*new checkout/i);
});

test("abandoned checkout reservations are released without deleting their audit records", async () => {
  const sql = await checkoutMigration();

  assert.match(sql, /set inventory_reserved = greatest\(0, product\.inventory_reserved - abandoned\.quantity\)/);
  assert.match(sql, /set status = 'failed'/);
  assert.match(sql, /payment_status = 'failed'/);
  assert.doesNotMatch(sql, /delete from public\.orders/);
  assert.doesNotMatch(sql, /delete from public\.checkout_groups/);
});

test("seller lifecycle is forward-only and delivery settles stock and commission", async () => {
  const sql = await checkoutMigration();

  for (const transition of [
    "'placed', 'confirmed'",
    "'confirmed', 'processing'",
    "'processing', 'shipped'",
    "'shipped', 'out_for_delivery'",
    "'out_for_delivery', 'delivered'",
  ]) {
    assert.ok(sql.includes(transition), `missing lifecycle transition ${transition}`);
  }
  assert.match(sql, /inventory = greatest\(0, product\.inventory - sold\.quantity\)/);
  assert.match(sql, /inventory_reserved = greatest\(0, product\.inventory_reserved - sold\.quantity\)/);
  assert.match(sql, /set status = 'confirmed'/);
});

test("checkout and fulfillment RPCs are not executable by public or anonymous roles", async () => {
  const sql = await checkoutMigration();

  assert.match(sql, /revoke all on function public\.create_creator_commerce_checkout[\s\S]+from public, anon/);
  assert.match(sql, /grant execute on function public\.create_creator_commerce_checkout[\s\S]+to authenticated/);
  assert.match(sql, /revoke all on function public\.seller_update_creator_commerce_fulfillment[\s\S]+from public, anon/);
  assert.match(sql, /grant execute on function public\.seller_update_creator_commerce_fulfillment[\s\S]+to authenticated/);
});
