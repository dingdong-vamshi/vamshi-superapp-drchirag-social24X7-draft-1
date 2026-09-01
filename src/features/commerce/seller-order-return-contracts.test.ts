import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repository = readFileSync(new URL('./supabaseShopRepository.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('./SellerStudioScreen.tsx', import.meta.url), 'utf8');

test('Dispatch Date comes from the authoritative shipped event', () => {
  assert.match(repository, /order_events\(status,created_at\)/);
  assert.match(repository, /event\.status === "shipped"/);
  assert.match(repository, /dispatchAt:\s*dispatchEvent\?\.created_at \?\? null/);
});

test('Order and Return filters open stable choice menus and expose a combined reset', () => {
  assert.match(screen, /<SelectDropdown label=\{label\}/);
  assert.doesNotMatch(screen, /Tap for next option/);
  assert.match(screen, /Reset filters/);
});

test('Seller Creator search uses the approved-counterparty directory before opening a shared chat', () => {
  assert.match(repository, /search_creator_seller_counterparties/);
  assert.match(repository, /open_creator_seller_conversation/);
  assert.match(repository, /p_role:\s*"creator"/);
  assert.match(screen, /Search approved Creators/);
});

test('Seller sign-out remains available in desktop and expanded mobile navigation', () => {
  assert.match(screen, /mobileLayout && onSignOut[\s\S]*accessibilityLabel="Log out"/);
  assert.match(screen, /!sidebarCollapsed && !mobileLayout[\s\S]*accessibilityLabel="Log out"/);
});

test('Return tracking remains an internal projection of persisted Return state', () => {
  assert.match(repository, /rpc\("seller_review_creator_commerce_return"/);
  assert.match(repository, /trackingStatus:\s*request\.status === "submitted"/);
  assert.match(repository, /"Awaiting Return Dispatch"/);
  assert.match(repository, /"Returned to Seller"/);
  assert.doesNotMatch(repository, /courierGps|fakeTracking|trackingLatitude/i);
});

test('Seller Returns and chat desks use their mobile containment layouts', () => {
  assert.match(
    screen,
    /activeSection === "orders_returns"[\s\S]*?style=\{\[styles\.orderToolbar, mobileLayout && styles\.orderToolbarMobile\]\}/,
  );
  assert.match(
    screen,
    /activeSection === "business_chat"[\s\S]*?style=\{\[styles\.businessDesk, mobileLayout && styles\.businessDeskMobile\]\}/,
  );
  assert.match(
    screen,
    /style=\{\[styles\.businessList, mobileLayout && styles\.businessListMobile\]\}/,
  );
  assert.match(
    screen,
    /style=\{\[styles\.threadHeader, mobileLayout && styles\.threadHeaderMobile\]\}/,
  );
  assert.match(
    screen,
    /threadHeaderMobile:\s*\{[\s\S]*?flexDirection: "column",[\s\S]*?alignItems: "stretch"/,
  );
});
