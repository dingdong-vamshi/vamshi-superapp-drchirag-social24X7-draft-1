import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("Creator Center scopes private rows to the signed-in Creator", () => {
  const repository = read("./creator-center-repository.ts");
  assert.match(
    repository,
    /from\('creator_product_promotions'\)[\s\S]*?\.eq\('creator_id', userId\)/,
  );
  assert.match(
    repository,
    /from\('creator_commissions'\)[\s\S]*?\.eq\('creator_id', userId\)/,
  );
  assert.match(repository, /from\('profiles'\)[\s\S]*?\.eq\('id', userId\)/);
});

test("Creator/Seller and Buyer/Seller use distinct authoritative storefront conversation identities", () => {
  const creatorRepository = read("./creator-center-repository.ts");
  const sellerRepository = read("../commerce/supabaseShopRepository.ts");
  const chatRepository = read("../chat/supabaseChatRepository.ts");
  const chatMigration = read(
    "../../../supabase/migrations/20260831114255_isolate_creator_seller_conversations.sql",
  );
  const route = read("../chat/CommerceChatRoute.tsx");

  assert.doesNotMatch(creatorRepository, /open_business_conversation/);
  assert.match(creatorRepository, /open_creator_seller_conversation/);
  assert.match(
    creatorRepository,
    /creatorCommerceChannel\s*=\s*'creator_seller'/,
  );
  assert.match(
    creatorRepository,
    /message_payload:\s*\{\s*commerce_channel:\s*creatorCommerceChannel/,
  );
  assert.match(
    creatorRepository,
    /\.eq\('business_context', 'creator_seller'\)/,
  );
  assert.match(sellerRepository, /commerce_channel:\s*"creator_seller"/);
  assert.match(
    sellerRepository,
    /\.eq\("business_context", "creator_seller"\)/,
  );
  assert.match(sellerRepository, /\.eq\("business_context", "buyer_seller"\)/);
  assert.match(sellerRepository, /channel\(`seller-creator-commerce-/);
  assert.match(
    sellerRepository,
    /filter:\s*`conversation_id=eq\.\$\{conversationId\}`/,
  );
  assert.match(sellerRepository, /\.eq\("owner_id", authUser\.id\)/);
  assert.match(sellerRepository, /\.eq\("storefront_id", storefront\.id\)/);
  assert.match(chatRepository, /context = 'standard'/);
  assert.match(
    chatRepository,
    /query\.eq\('business_context', 'creator_seller'\)/,
  );
  assert.match(
    chatMigration,
    /unique index conversations_business_context_identity_key[\s\S]*\(storefront_id, business_customer_id, business_context\)/i,
  );
  assert.match(chatMigration, /business_context = 'buyer_seller'/);
  assert.match(chatMigration, /business_context = 'creator_seller'/);
  assert.match(chatMigration, /public\.commerce_order_chat_events/);
  assert.match(route, /context: 'creator_seller'/);
  assert.match(route, /section: 'chats'/);
  assert.match(route, /section: 'creator_chat'/);
});

test("Growth aggregate is approved-Creator-only and excludes unfinished or reversed commerce", () => {
  const migration = read(
    "../../../supabase/migrations/20260831053649_creator_center_growth_leaderboard.sql",
  );
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /access\.creator_status = 'approved'/);
  assert.match(
    migration,
    /from public\.creator_commerce_access access[\s\S]*left join public\.creator_commissions/,
  );
  assert.match(migration, /case when commerce_order\.status = 'delivered'/);
  assert.match(migration, /commerce_order\.status = 'delivered'/);
  assert.match(
    migration,
    /commission\.status in \('confirmed', 'eligible', 'payable', 'paid'\)/,
  );
  assert.match(migration, /revoke all[\s\S]*from public, anon/);
  assert.doesNotMatch(migration, /commission_minor[\s\S]*returns table/i);
});

test("Creator controls use real menus and Affiliate Links avoid generic sharing", () => {
  const screen = read("./CreatorCenterScreen.tsx");
  const dropdown = read("../../components/SelectDropdown.tsx");
  assert.match(screen, /<SelectDropdown/);
  assert.match(dropdown, /<Modal[\s\S]*Close choices/);
  assert.match(dropdown, /accessibilityState=\{\{ selected: isSelected \}\}/);
  assert.match(screen, /View Product/);
  assert.doesNotMatch(screen, /Share Affiliate link|Share\.share/);
  assert.match(screen, /Provider Setup/);
});

test("Creator Home and Discover Orders receive the same period-filtered commission source", () => {
  const screen = read("./CreatorCenterScreen.tsx");
  assert.match(screen, /commissions=\{filteredCommissions\}/);
  assert.match(screen, /HomeSection[\s\S]*commissions=\{filteredCommissions\}/);
  assert.match(
    screen,
    /same period-filtered attribution records power Creator Home and Discover/i,
  );
});

test("Counterparty directory restricts search and conversation creation to approved Creator/Seller roles", () => {
  const migration = read(
    "../../../supabase/migrations/20260831082001_creator_seller_counterparty_directory.sql",
  );
  const repository = read("./creator-center-repository.ts");
  const screen = read("./CreatorCenterScreen.tsx");
  assert.match(migration, /search_creator_seller_counterparties/);
  assert.match(migration, /access\.seller_status = 'approved'/);
  assert.match(migration, /access\.creator_status = 'approved'/);
  assert.match(migration, /open_creator_seller_conversation/);
  assert.match(migration, /p_role = 'seller'/);
  assert.match(migration, /p_role = 'creator'/);
  assert.match(migration, /auth_identity\.deleted_at is null/);
  assert.match(
    migration,
    /on conflict \(storefront_id, business_customer_id\) where kind = 'business'/i,
  );
  const isolationMigration = read(
    "../../../supabase/migrations/20260831114255_isolate_creator_seller_conversations.sql",
  );
  assert.match(
    isolationMigration,
    /on conflict \(storefront_id, business_customer_id, business_context\) where kind = 'business'/i,
  );
  assert.match(migration, /revoke all[\s\S]*from public, anon/);
  assert.match(repository, /searchApprovedSellers[\s\S]*p_role: 'seller'/);
  assert.match(
    repository,
    /openApprovedSellerConversation[\s\S]*p_role: 'seller'/,
  );
  assert.match(screen, /Search approved Sellers/);
  assert.doesNotMatch(screen, /router\.push\('\/business-directory'\)/);
});

test("Creator Center mobile layout gives headings full width and contains card copy", () => {
  const screen = read("./CreatorCenterScreen.tsx");

  assert.match(
    screen,
    /mobile \? \(\s*<View style=\{styles\.mobileUtilityRow\}>/,
  );
  assert.match(
    screen,
    /<View style=\{styles\.titleBlock\}>\s*<Text style=\{styles\.pageTitle\}>/,
  );
  assert.match(
    screen,
    /topbarMobile:\s*\{\s*flexDirection: "column",\s*alignItems: "stretch"/,
  );
  assert.match(screen, /titleBlock:\s*\{\s*flex: 1,\s*minWidth: 0\s*\}/);
  assert.match(
    screen,
    /panel:\s*\{[\s\S]*?minWidth: 0,[\s\S]*?maxWidth: "100%",[\s\S]*?alignSelf: "stretch"/,
  );
  assert.doesNotMatch(
    screen,
    /panel:\s*\{\s*flexGrow: 1,\s*flexBasis: 330/,
  );
  assert.match(
    screen,
    /panelColumn:\s*\{\s*flexGrow: 1,\s*flexBasis: 330/,
  );
  assert.match(screen, /layout === "column" && styles\.panelColumn/);
  assert.match(
    screen,
    /productCardMobile:\s*\{\s*width: "100%",\s*maxWidth: "100%",\s*flexBasis: "100%"\s*\}/,
  );
  assert.match(
    screen,
    /linkCardMobile:\s*\{\s*flexDirection: "column",\s*alignItems: "stretch"\s*\}/,
  );
  assert.match(
    screen,
    /linkCopy:\s*\{\s*flex: 1,\s*minWidth: 220,\s*maxWidth: "100%"/,
  );
  assert.match(
    screen,
    /linkValue:\s*\{[\s\S]*?wordBreak: "break-all",[\s\S]*?overflowWrap: "anywhere"/,
  );
  assert.match(
    screen,
    /collectCardMobile:\s*\{\s*flexDirection: "column",\s*alignItems: "stretch"\s*\}/,
  );
  assert.match(
    screen,
    /collectCopy:\s*\{\s*flex: 1,\s*minWidth: 0,\s*maxWidth: "100%"\s*\}/,
  );
});
