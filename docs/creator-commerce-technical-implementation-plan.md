# Creator Commerce Technical Implementation Plan

## 1. Current application understanding

Social 24x7 is an Expo and React Native app using Expo Router. The app entry is `expo-router/entry` from `package.json`. The app is currently on Expo `~57.0.8`, Expo Router `~57.0.8`, React `19.2.3`, React Native `0.86.0`, Supabase JS `^2.110.7`, TanStack Query, Expo Image Picker, Expo Video, Socket.IO, Lucide icons, Recharts and AsyncStorage.

Important inspected files and routes:

- Auth routes: `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, plus duplicate `app/auth/login.tsx` and `app/auth/signup.tsx`.
- Main tabs: `app/(tabs)/chats.tsx`, `app/(tabs)/social.tsx`, `app/(tabs)/discover.tsx`, `app/(tabs)/shop.tsx`, `app/(tabs)/wallet.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/social-profile.tsx`.
- Commerce routes: `app/seller/index.tsx`, `app/store/[slug].tsx`, `app/store/[slug]/product/[productSlug].tsx`, `app/business-directory.tsx`, `app/business-chat/[id].tsx`.
- Discover routes that may later connect to commerce or payments: `app/expenses.tsx`, `app/chit-fund.tsx`, `app/bill-split.tsx`, `app/qa-community.tsx`, `app/food.tsx`, `app/notes-tasks.tsx`, `app/nearby-people.tsx`, `app/charity.tsx`, `app/missing-persons.tsx`, `app/anonymous-chat.tsx`, `app/support-feedback.tsx`.

Current authentication is handled through `src/lib/AuthContext.tsx` and `src/lib/supabase.ts`. The app supports real Supabase users and local or demo fallback behavior in some modules. Environment files exist as `.env.example` and `.env.local` with Supabase URL, publishable key and signaling URL keys present. Secret values were not printed.

Current Supabase usage is spread across feature repositories. The profile system uses `profiles`. Social uploads media to `social-stories` and `social-posts`. Shop uploads product media to `shop-media`. Missing persons uses `missing-person-photos` in the latest migration. Chat uses `conversations`, `conversation_participants`, `messages`, `message_requests`, `direct_conversation_pairs`, `message_reactions`, `chat_notifications` and RPC functions for direct chat.

Current Shop functionality exists and should not be replaced immediately. `app/(tabs)/shop.tsx` renders `ShopScreen`. It uses `createSupabaseShopRepository` when Supabase is available and falls back to `localShopRepository` otherwise. The existing Shop supports buyer product browsing, category filters, product detail navigation, local cart state, public storefront pages, public product pages, seller dashboard, seller orders, seller analytics, storefront editing, product creation and product media upload.

Current seller functionality is in `app/seller/index.tsx`, `src/features/commerce/SellerStudioScreen.tsx`, `src/features/commerce/shopRepository.ts` and `src/features/commerce/supabaseShopRepository.ts`. It already models seller applications, storefront drafts, product drafts, seller analytics, seller orders and business conversations.

Current product functionality includes `storefronts`, `products`, `product_media`, product slug pages, categories, product SEO fields, cover media, inventory count, SKU, tags and search keywords. Variants, reserved inventory, approvals, return rules, review media, commission attribution and settlement are not clearly present in the inspected code.

Current cart and order functionality is partial. Cart is local AsyncStorage through `social24x7:commerce-cart:v2`. Seller orders are read from `orders` and `order_fulfillments`, but buyer checkout is currently a placeholder message in the Shop tab. There is no confirmed in-app payment implementation.

Current notification functionality exists for chat through `chat_notifications`. Profile settings mention notifications, but a platform-wide notification center for commerce events is not yet present.

Current wallet or payment functionality is a placeholder. `src/features/wallet/WalletScreen.tsx` points users back to profile for payment-related controls. Discover financial modules are separate and should not be confused with commerce checkout.

Current admin or moderation functionality is limited. There are support tickets, reports in anonymous chat, missing person tips, chat reports and product/store concepts, but no complete admin approval console for sellers, products, returns, disputes or creator commerce moderation was found in the repository.

## 2. Existing reusable functionality

### Expo Router structure

- What it does: file-based app navigation with tabs and feature routes.
- Where it exists: `app/`.
- Creator Commerce use: add seller, creator, product, checkout, order and admin routes without replacing current tabs.
- Modification needed: only new routes and route links after approval.
- Risk: route collisions if new commerce routes reuse vague names such as `/shop` without migration planning.

### Auth and profile foundation

- What it does: real Supabase user sessions, local profile fallback, profile editing and profile directory behavior.
- Where it exists: `src/lib/AuthContext.tsx`, `src/features/profile/profileRepository.ts`, `src/features/profile/ProfileScreen.tsx`, `src/features/social/SocialProfileScreen.tsx`.
- Creator Commerce use: every seller, creator, buyer, employee and admin should connect to a `profiles` identity.
- Modification needed: add role or capability data around profile identity.
- Risk: breaking existing chat and social profile flows if profile ownership semantics are changed too broadly.

### Existing Shop repository interface

- What it does: abstracts product browsing, storefronts, cart, seller dashboard, seller orders, seller analytics and business messages.
- Where it exists: `src/features/commerce/shopRepository.ts`.
- Creator Commerce use: can become the first interface boundary for commerce MVP.
- Modification needed: extend carefully for variants, approvals, carts, checkout and creator attribution.
- Risk: adding too many responsibilities into one repository may make checkout and seller operations hard to test.

### Supabase Shop repository

- What it does: reads `storefronts`, `products`, `product_media`, `orders`, `order_fulfillments`, `storefront_events`, conversations and messages. Uploads product media to `shop-media`.
- Where it exists: `src/features/commerce/supabaseShopRepository.ts`.
- Creator Commerce use: reusable for storefronts, products, seller analytics and business conversations.
- Modification needed: add server-backed cart, order creation, product approval and creator attribution after schema is finalized.
- Risk: current cart is local only, so adding checkout without changing cart persistence would be unsafe.

### Public storefront and product pages

- What they do: public seller storefront and product detail pages with SEO and public product URLs.
- Where they exist: `app/store/[slug].tsx`, `app/store/[slug]/product/[productSlug].tsx`.
- Creator Commerce use: can support public product sharing and creator-linked product traffic.
- Modification needed: add creator attribution parameters later.
- Risk: public pages must not expose drafts, private products or unapproved products.

### Seller Studio UI

- What it does: seller onboarding, storefront editing, product publishing, product media upload, seller orders and analytics.
- Where it exists: `app/seller/index.tsx`, `src/features/commerce/SellerStudioScreen.tsx`, `src/features/commerce/SellerAnalyticsCharts.tsx`.
- Creator Commerce use: reuse as seller MVP foundation.
- Modification needed: split into cleaner flows once approval, verification and product review are added.
- Risk: current seller flow may assume the signed-in user directly owns one storefront.

### Social feed and profile surfaces

- What they do: social home, stories, posts, reels-style media, profile tabs, follow/message buttons and profile product card.
- Where they exist: `app/(tabs)/social.tsx`, `app/(tabs)/social-profile.tsx`, `src/features/social/`.
- Creator Commerce use: product showcase, shoppable posts, shoppable reels and creator profile product shelf.
- Modification needed: add product attachments and creator commerce tabs.
- Risk: social must stay usable even if commerce data fails.

### Chat and business chat

- What they do: direct personal chats, business storefront messaging and message request logic.
- Where they exist: `src/features/chat/`, `app/business-chat/[id].tsx`, `app/business-directory.tsx`.
- Creator Commerce use: buyer to seller pre-sale questions, order support and creator collaboration discussions.
- Modification needed: add order context and seller/creator conversation types later.
- Risk: chat currently has complex request acceptance behavior, so commerce should not depend on it for order-critical state.

### Storage upload patterns

- What they do: social uploads to `social-stories` and `social-posts`, shop media uploads to `shop-media`, missing persons uses `missing-person-photos`.
- Where they exist: `app/(tabs)/social.tsx`, `src/features/commerce/supabaseShopRepository.ts`, migrations.
- Creator Commerce use: product photos, product videos, storefront images and review media.
- Modification needed: private buckets for verification and dispute evidence.
- Risk: document media must never be stored in public product buckets.

## 3. Gaps and conflicts

- Seller verification exists as a draft/application concept but not a complete approval workflow with documents, manual review, rejection reasons, suspension and audit history.
- Creator onboarding and creator eligibility are missing.
- Product variants and SKU-level inventory are missing.
- Reserved stock during checkout is missing.
- Server-side cart is missing. Current cart is local AsyncStorage.
- Checkout and payment are placeholders. No final payment provider is confirmed.
- Product approval, moderation and restricted product rules are missing.
- Creator product attribution from profile, post, reel and storefront click is missing.
- Affiliate commission and seller settlement are missing.
- Product reviews and review moderation are not fully implemented.
- Returns, refunds, cancellation rules and dispute flows are missing.
- Admin console for seller approval, product approval, reports, returns and disputes is missing.
- Existing `ShopScreen` is buyer-friendly but not enough for complete creator commerce.
- Existing seller tools are useful but too broad for a regulated commerce launch without stronger permissions.
- Existing orders appear seller-facing but buyer order history and order details need a dedicated flow.
- The code contains duplicate auth route folders, which should not be touched in the first commerce task unless cleanup is explicitly approved.
- RLS exists in many migrations, but live dashboard RLS and storage policies could not be verified through Supabase MCP in this session.
- `shop-media` is used in code, but bucket creation and policies were not found in the inspected migrations, so this must be confirmed in the live Supabase project.

## 4. Recommended product structure

The safest approach is to extend the existing Shop module gradually rather than replace it. The current Shop already has buyer browsing, storefronts, seller studio, product media, public pages and seller analytics. Replacing it would risk breaking current Shop, Social, Profile, Chat and public store routes.

Recommended structure:

- Buyer experience: Discover products from Shop, Social posts, reels, creator profiles and search. Open product details, select variants, add to cart, checkout, track orders, cancel or request returns.
- Seller experience: apply to sell, complete verification, create storefront, submit products, manage inventory, fulfill orders, respond to buyer messages, review analytics.
- Creator experience: apply or become eligible, add own products or approved affiliate products to profile, attach products to posts and reels, track clicks and attributed orders.
- Admin experience: approve sellers, approve products, manage reports, suspend sellers/products, review returns/refunds, review creator collaborations and audit actions.

Recommended movement:

- Social feed → shoppable post or reel → product details → cart → checkout → order confirmation.
- Creator profile → product showcase → product details → cart → checkout.
- Shop tab → storefront/product discovery → product details → cart.
- Seller dashboard → orders → fulfillment update → buyer notification.
- Creator dashboard → product performance → commission report later.

## 5. Recommended routes

### Buyer routes

- `/shop`: existing buyer product discovery. Reuse. States: loading, empty, product list, filtered list, cart indicator, error.
- `/store/[slug]`: existing public storefront. Reuse. States: loading, not found, live storefront, no products.
- `/store/[slug]/product/[productSlug]`: existing product detail. Reuse and extend. States: loading, unavailable, in stock, out of stock, variant selection.
- `/cart`: create later. Access: signed-in buyers. States: empty, single seller cart, multi seller cart, unavailable item, price changed.
- `/checkout`: create later. Access: signed-in buyers. States: address, delivery, payment, review, processing, failed.
- `/orders`: create later. Access: signed-in buyers. States: empty, order list, filtered status.
- `/orders/[id]`: create later. Access: buyer, seller owner, admin. States: status timeline, shipment, cancel, return.
- `/returns/[orderItemId]`: create later. Access: buyer. States: eligible, not eligible, submitted, approved, rejected.
- `/reviews/create/[orderItemId]`: create later. Access: buyer after delivery.

### Seller routes

- `/seller`: existing seller studio. Reuse and split gradually. States: no application, submitted, approved dashboard, suspended.
- `/seller/onboarding`: create later. Access: signed-in users. States: type, details, documents, store info, submitted.
- `/seller/products`: create later or use section in existing `/seller`. States: drafts, pending approval, live, rejected, archived.
- `/seller/products/[id]/edit`: create later. States: draft, validation errors, media upload.
- `/seller/orders`: create later or use existing seller studio section. States: new, processing, shipped, delivered, cancelled.
- `/seller/analytics`: existing charts can be reused. States: no data, daily/monthly metrics.

### Creator routes

- `/creator`: create later. Access: eligible creators. States: not eligible, apply, approved dashboard.
- `/creator/products`: create later. Access: approved creators. States: own products, affiliate products, pending collaborations.
- `/creator/analytics`: create later. Access: creators. States: clicks, product opens, attributed orders, commissions later.

### Admin routes

- `/admin/commerce`: create later. Access: admins only. States: queues and overview.
- `/admin/commerce/sellers`: seller approval queue.
- `/admin/commerce/products`: product approval queue.
- `/admin/commerce/reports`: product, review, seller and content reports.
- `/admin/commerce/returns`: returns and disputes queue.
- `/admin/commerce/payouts`: settlement review later.

### Public routes

- `/store/[slug]` and `/store/[slug]/product/[productSlug]` should remain public but only show approved active data.

## 6. Seller onboarding flow

Proposed seller onboarding:

1. Choose seller type: individual, business, clinic, creator-owned brand or local seller.
2. Enter personal details: legal name, phone, email and profile identity.
3. Enter business details: business name, business type, registration number where required, tax information if required, city and state.
4. Add business address.
5. Add pickup address.
6. Add return address.
7. Upload verification documents into a private bucket.
8. Enter store information: storefront name, slug, category, tagline, description, logo and banner.
9. Choose product category.
10. Accept terms.
11. Submit application.
12. Admin reviews manually in MVP.
13. Status becomes submitted, approved, rejected, needs more information or suspended.

MVP manual review is acceptable for seller verification, product category approval, document review and seller suspension. Automated document verification should be postponed until business rules and legal expectations are confirmed.

## 7. Creator onboarding and product promotion flow

A creator should become eligible through either manual approval, follower/activity thresholds later or seller approval if they sell their own products.

Creator flows:

- Creator adds approved products to profile showcase.
- Creator attaches products to posts and reels.
- Creator-owned products are products where the creator is also the seller or storefront owner.
- Affiliate products are products owned by another seller and promoted by the creator after approval.
- Product clicks should be tracked from profile, post, reel, search, storefront and external public page.
- Attributed orders should keep creator source, content source and product source.
- Commissions should be postponed until founder approves commission rules, attribution windows, cancellation handling and settlement timing.

MVP should include creator profile product showcase and product links from social content. Affiliate commissions should be later.

## 8. Buyer shopping and checkout flow

Buyer journey:

1. Discover product from Social feed, reel, creator profile, Shop or search.
2. Open product details.
3. View images, videos, price, seller, delivery estimate, availability and reviews.
4. Select variant where applicable.
5. Add to cart.
6. Review cart.
7. Enter or choose address.
8. Validate price, stock and shipping.
9. Start payment after provider decision.
10. Payment succeeds or fails.
11. Order confirmation is created only after safe payment handling.
12. Buyer tracks order.
13. Buyer can cancel if allowed.
14. Buyer can request return or refund if eligible.
15. Buyer can review after delivery.

The checkout must not rely on local cart alone. It needs server validation before payment.

## 9. Product, inventory and media model

Product structure should reuse current `products` and `product_media` if live schema matches the repository. Extend instead of duplicating.

Recommended product model:

- Product: seller, storefront, title, slug, description, category, brand, status, approval status, visibility, review summary.
- Variants: option names such as size, color, weight or pack.
- SKUs: SKU per variant combination.
- Pricing: base price, sale price, tax category, discount fields later.
- Stock: available stock, reserved stock, sold stock.
- Media: ordered image and video gallery, cover media and alt text.
- Category: existing categories can be reused but need client-approved commerce categories.
- Product status: draft, submitted, approved, active, rejected, hidden, archived.
- Inventory history: adjustment reason, actor, before and after.
- Out of stock: visible but disabled or hidden based on seller setting.
- Deletion: prefer soft delete or archive. Avoid hard deleting products attached to orders.

## 10. Cart, checkout and payment plan

Cart design:

- Start MVP with single-seller cart if faster and safer.
- Multi-seller cart can come later by splitting one checkout into seller-specific orders.
- Server cart should replace local-only cart for signed-in checkout.
- Cart must validate product status, variant, stock and price before payment.
- Stock reservation should be short-lived and expire automatically.

Checkout design:

- Confirm address.
- Confirm shipping charges.
- Confirm discounts and taxes.
- Create payment attempt through chosen provider.
- Verify payment on backend or secure server environment.
- Create order idempotently.
- Prevent duplicate payment and duplicate order with idempotency keys.
- Failed payment should release reserved stock.

Payment provider is not decided. Before implementation, founder/client must confirm provider, payment modes, cash on delivery, refunds, settlement ownership and fee handling.

## 11. Orders, fulfillment, returns and refunds

Recommended order statuses:

- pending_payment
- payment_failed
- placed
- confirmed
- processing
- packed
- shipped
- out_for_delivery
- delivered
- cancelled
- return_requested
- return_approved
- return_rejected
- returned
- refund_pending
- refunded
- disputed

Seller order management should include packing, shipping carrier, tracking number, customer note and status timeline. Returns need eligibility checks, buyer reason, media evidence, seller response, admin escalation and refund outcome. Refunds must depend on the final payment provider.

## 12. Database plan

Existing reusable or likely reusable tables from code and migrations:

- `profiles`
- `storefronts`
- `products`
- `product_media`
- `seller_applications`
- `orders`
- `order_fulfillments`
- `storefront_events`
- `conversations`
- `conversation_participants`
- `messages`
- `chat_notifications`
- `support_tickets`
- `support_ticket_responses`

Tables that need extension or confirmation:

- `storefronts`: seller status, verification status, suspension reason, approval timestamps.
- `products`: approval status, moderation status, rejection reason, product type and visibility.
- `product_media`: media type, processing status, alt text and moderation status.
- `orders`: buyer order states, payment attempt id, seller split id and source attribution.
- `order_fulfillments`: status timeline and delivery metadata.

New tables likely required:

- `commerce_roles`: buyer, seller, creator, employee, admin and moderator capabilities.
- `seller_verification_documents`: private seller document records.
- `seller_addresses`: business, pickup and return addresses.
- `product_variants`: product option groups.
- `product_skus`: variant combinations, SKU code, price and inventory.
- `inventory_ledger`: every inventory adjustment and reservation.
- `carts` and `cart_items`: server-backed cart.
- `checkout_sessions`: checkout lifecycle and idempotency.
- `payment_attempts`: provider-neutral payment tracking.
- `order_items`: item-level order rows.
- `order_status_events`: order timeline.
- `return_requests`: returns and refund requests.
- `review_entries`: product and seller reviews.
- `commerce_reports`: product, seller and review reports.
- `creator_profiles`: creator eligibility and approval.
- `creator_product_links`: products shown on creator profile.
- `content_product_tags`: product links attached to posts/reels.
- `creator_attribution_events`: clicks, opens and order attribution.
- `creator_commissions`: later, after commission approval.
- `admin_audit_log`: all admin decisions.

Constraints and indexes:

- Unique storefront slug.
- Unique product slug per storefront.
- Unique SKU per seller or storefront.
- Index product status, approval status, storefront id, category and published date.
- Index orders by buyer, seller, status and created date.
- Index cart by user.
- Index inventory by SKU.
- Add `created_at`, `updated_at`, `deleted_at` where relevant.
- Use check constraints or enums for statuses.
- Use soft deletion for products and storefronts that have historical orders.

## 13. Supabase Storage plan

Public buckets:

- Storefront logos and covers.
- Approved product images.
- Approved product videos.
- Public review media if review media is approved.

Private buckets:

- Seller verification documents.
- Return evidence.
- Dispute evidence.
- Rejected or pending product media if moderation requires privacy.

Existing or referenced buckets:

- `shop-media` is used by commerce code.
- `social-posts` and `social-stories` are used by Social.
- `missing-person-photos` is created in a migration.

Policies required:

- Sellers can upload their own storefront and product media.
- Public users can read only approved public product media.
- Sellers can read their own verification documents.
- Admins can read verification and dispute evidence.
- Buyers can upload return evidence only for their own orders.
- No public access to identity documents or dispute evidence.

## 14. Auth, roles and RLS plan

Access rules:

- Buyers: browse public products, manage own cart, own addresses, own orders, own returns and own reviews.
- Sellers: manage own applications, storefront, products, inventory, orders and business messages.
- Creators: manage own profile product showcase and content product tags after approval.
- Store employees: access only assigned storefront permissions.
- Admins: review sellers, products, reports, returns and disputes.
- Moderators: review product/review/report queues without full financial access.

RLS recommendations:

- Keep RLS enabled.
- Never use the service-role key in frontend code.
- Public read policies should only expose active and approved data.
- Seller write policies must check storefront ownership or assigned employee permission.
- Buyer order policies must check buyer id.
- Seller order policies must check seller/storefront ownership.
- Private document policies must be owner/admin only.
- Admin policies should be capability-based, not email-based.

## 15. Notifications plan

Required notification types:

- Seller application submitted.
- Seller approved, rejected or needs more information.
- Product approved or rejected.
- New order for seller.
- Order confirmed for buyer.
- Order status changed.
- Shipment update.
- Cancellation request and result.
- Return request and result.
- Refund update.
- Product review received.
- Product report received.
- Creator collaboration invite.
- Creator product approval.
- Commission update later.

Existing `chat_notifications` can inspire the notification shape, but commerce should get a broader notifications model or extend a shared notification system rather than overloading chat-only notifications.

## 16. Admin and moderation plan

Admin features:

- Seller approval queue.
- Product approval queue.
- Verification document review.
- Product report review.
- Seller report review.
- Review moderation.
- Seller suspension.
- Product hiding.
- Return and dispute review.
- Refund approval workflow if required.
- Admin audit history.

MVP can use a simple internal admin route with manual approval queues. Do not automate high-risk decisions until business rules are approved.

## 17. Analytics and reporting plan

Seller analytics:

- Storefront views.
- Product views.
- Add-to-cart events.
- Orders.
- Conversion rate.
- Revenue.
- Product performance.

Creator analytics:

- Product profile clicks.
- Post/reel product clicks.
- Product opens.
- Attributed orders.
- Commission estimate later.

Platform analytics:

- GMV.
- Orders by status.
- Seller approval funnel.
- Product approval funnel.
- Returns and refunds.
- Report rates.
- Top creators and products.

MVP needs only basic seller and product analytics. Creator commissions, settlements and advanced attribution can be later.

## 18. Implementation phases

### Phase 1: Foundation and schema alignment

- Goal: make current Shop safe to extend.
- Features: audit live schema, confirm buckets, define roles, define product approval statuses.
- Routes: no major UI routes yet.
- Components: shared commerce status and empty-state components.
- Database work: roles, seller application status, product approval status, audit tables.
- Supabase work: RLS and storage policies.
- Testing: RLS and two-account seller/buyer tests.
- Risks: changing existing Shop data too aggressively.
- Definition of done: existing Shop still works and new status model is ready.

### Phase 2: Seller onboarding MVP

- Goal: sellers can apply and be manually reviewed.
- Features: seller type, details, store details, documents, submit, status.
- Routes: `/seller/onboarding`, existing `/seller`.
- Components: seller application form, status screen, admin review card.
- Database work: seller documents, seller addresses, application statuses.
- Supabase work: private document bucket.
- Testing: seller submits, admin approves, rejected seller cannot publish.
- Risks: document privacy.
- Definition of done: approved seller can proceed to products.

### Phase 3: Product management MVP

- Goal: approved sellers can create approved products.
- Features: product draft, media, price, stock, category, submit for review.
- Routes: `/seller/products`, `/seller/products/[id]/edit`.
- Components: product form, media uploader, product status list.
- Database work: extend products and product media.
- Supabase work: `shop-media` policies.
- Testing: draft, submit, approve, reject, public visibility.
- Risks: unapproved products leaking publicly.
- Definition of done: only approved active products show to buyers.

### Phase 4: Buyer discovery and product detail

- Goal: buyers can browse and open approved products.
- Features: Shop list, storefront, product details, save product later.
- Routes: existing `/shop`, `/store/[slug]`, `/store/[slug]/product/[productSlug]`.
- Components: product cards, variant selector.
- Database work: category and product indexes.
- Supabase work: public read policies.
- Testing: public product visibility and private draft invisibility.
- Risks: public routes exposing seller-only metadata.
- Definition of done: buyer can browse approved catalog.

### Phase 5: Creator product showcase

- Goal: creators can display approved products on profiles.
- Features: creator eligibility, profile product shelf, own vs affiliate labels.
- Routes: `/creator`, `/creator/products`, existing `/social-profile`.
- Components: product shelf and attach-product picker.
- Database work: creator profiles and product links.
- Supabase work: creator permission policies.
- Testing: creator can attach approved products only.
- Risks: affiliate rules not finalized.
- Definition of done: creator profile can show products without checkout attribution yet.

### Phase 6: Shoppable posts and reels

- Goal: social content can open products.
- Features: product tags on posts/reels, product preview bottom sheet.
- Routes: existing Social routes.
- Components: product tag badge, product drawer.
- Database work: content product tags and click events.
- Testing: social works when product data fails.
- Risks: social feed performance.
- Definition of done: product links open from content.

### Phase 7: Cart and checkout

- Goal: safe server-backed checkout.
- Features: cart, address, stock validation, payment handoff, order creation.
- Routes: `/cart`, `/checkout`, `/orders/[id]`.
- Components: cart screen, checkout steps, payment status.
- Database work: carts, checkout sessions, payment attempts, order items.
- Supabase work: RPC/Edge Function or secure backend for order creation.
- Testing: inventory concurrency and idempotency.
- Risks: payment and duplicate orders.
- Definition of done: test checkout creates exactly one order.

### Phase 8: Fulfillment, returns and refunds

- Goal: full post-purchase loop.
- Features: seller fulfillment, tracking, cancellation, return request, refund status.
- Routes: `/orders`, `/seller/orders`, `/returns/[orderItemId]`.
- Components: order timeline, return form.
- Database work: status events, returns, disputes.
- Testing: buyer/seller/admin permissions.
- Risks: refund liability.
- Definition of done: order status and return flow are auditable.

### Phase 9: Creator collaborations and commissions

- Goal: creator affiliate commerce after business approval.
- Features: collaboration requests, commission rules, attribution windows.
- Routes: `/creator/collaborations`, `/creator/analytics`.
- Database work: commission and attribution tables.
- Testing: cancellations and returns adjust commission.
- Risks: disputes over attribution.
- Definition of done: commission records are traceable and reversible.

### Phase 10: Advanced analytics and live commerce later

- Goal: growth tools after stable commerce.
- Features: advanced analytics, promotions, live shopping later.
- Routes: analytics and campaign routes.
- Testing: performance and reporting accuracy.
- Risks: overbuilding before core orders work.
- Definition of done: analytics match order source of truth.

## 19. Testing plan

- Unit tests for product mapping, price formatting, cart calculations and status transitions.
- Integration tests for seller onboarding, product approval, cart, checkout, orders and returns.
- RLS tests for buyer, seller, creator, employee, admin and public access.
- Two-account testing: buyer and seller in separate sessions.
- Seller and buyer testing: seller creates product, buyer purchases, seller fulfills.
- Inventory concurrency tests: two buyers try to buy last stock.
- Checkout idempotency tests: repeated payment callback does not duplicate order.
- Payment webhook tests after provider selection.
- Order permission tests: buyer cannot view another buyer order, seller cannot view another seller order.
- Storage security tests: public cannot read verification documents.
- Mobile and web UI tests through Expo web and target mobile device sizes.

## 20. Risks and constraints

- Existing Shop risk: heavy refactor could break current product/storefront/seller flows.
- Seller data risk: changing storefront ownership or product shape without migration planning can corrupt existing seller data.
- Profile risk: creator roles must not break social profile and chat identity.
- Social risk: shoppable post work must not slow or block the feed.
- Payment risk: provider, settlement, refund and cash-on-delivery rules are not confirmed.
- Inventory risk: local cart and direct order creation can oversell products.
- RLS risk: public products need public read, but drafts and seller documents must stay private.
- Document risk: seller verification docs must never be public.
- Scope risk: attempting TikTok-scale commerce in one phase will delay a usable MVP.
- Regulatory risk: tax, restricted products, returns, refunds, platform liability and seller verification are business/legal decisions.

## 21. Founder/client decisions needed

- Who can become a seller?
- Are individual sellers allowed or only registered businesses?
- What verification documents are required?
- Who approves sellers?
- Who approves products?
- What product categories are allowed first?
- What products are restricted or banned?
- What is the platform commission?
- Will creators earn commission in the first release or later?
- What is the creator commission model?
- Which payment provider will be used?
- Who receives the buyer payment first?
- How and when are sellers paid out?
- Who handles shipping?
- Will delivery partners be integrated?
- Is cash on delivery allowed?
- What is the cancellation policy?
- What is the return window?
- Who pays return shipping?
- Who approves refunds?
- Is multi-seller checkout required in MVP?
- What is the exact first-release scope?

## 22. Recommended first development task

After approval, the first task should be:

Create the Creator Commerce foundation by extending the existing seller and product system without touching buyer checkout yet.

Exact routes:

- Reuse `/seller`.
- Add `/seller/onboarding`.
- Add admin-only review screens later under `/admin/commerce/sellers` only if admin auth is confirmed.

Exact components:

- Reuse `SellerStudioScreen`.
- Add a focused `SellerOnboardingScreen`.
- Add reusable seller status and document upload components.

Exact tables:

- Confirm live `seller_applications`, `storefronts`, `products` and `product_media`.
- Add or extend seller application status, seller addresses and seller verification document records.
- Add admin audit log.

Exact migrations:

- One migration for seller onboarding foundation.
- One migration for private seller document storage policies if bucket is not already present.

Exact policies:

- Seller can read and edit own application.
- Seller can upload own verification documents.
- Admin can review applications and documents.
- Public cannot read seller documents.
- Approved storefronts and approved products remain public-readable only where intended.

Exact test flow:

1. User A signs in.
2. User A submits seller application.
3. User A sees submitted status.
4. Admin approves application.
5. User A sees approved seller dashboard.
6. Public Shop still loads existing approved products.
7. Another user cannot read User A documents or edit User A application.

This is the safest first task because it builds on the current `ShopScreen`, `SellerStudioScreen`, `shopRepository.ts` and `supabaseShopRepository.ts` while avoiding the highest-risk areas: checkout, payments, refunds and commissions.

## Inspection summary

Main routes inspected:

- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app/auth/login.tsx`
- `app/auth/signup.tsx`
- `app/(tabs)/chats.tsx`
- `app/(tabs)/social.tsx`
- `app/(tabs)/discover.tsx`
- `app/(tabs)/shop.tsx`
- `app/(tabs)/wallet.tsx`
- `app/(tabs)/profile.tsx`
- `app/(tabs)/social-profile.tsx`
- `app/seller/index.tsx`
- `app/store/[slug].tsx`
- `app/store/[slug]/product/[productSlug].tsx`
- `app/business-directory.tsx`
- `app/business-chat/[id].tsx`
- Discover feature routes for food, expenses, chit fund, bill split, Q&A, notes, nearby people, charity, missing persons, anonymous chat and support.

Main modules inspected:

- `src/lib/AuthContext.tsx`
- `src/lib/supabase.ts`
- `src/features/commerce/shopRepository.ts`
- `src/features/commerce/supabaseShopRepository.ts`
- `src/features/commerce/ShopScreen.tsx`
- `src/features/commerce/SellerStudioScreen.tsx`
- `src/features/commerce/SellerAnalyticsCharts.tsx`
- `src/features/social/SocialScreen.tsx`
- `src/features/social/SocialProfileScreen.tsx`
- `src/features/social/supabaseSocialRepository.ts`
- `src/features/profile/profileRepository.ts`
- `src/features/chat/ChatScreen.tsx`
- `src/features/chat/supabaseChatRepository.ts`
- `src/features/wallet/WalletScreen.tsx`

Main Supabase tables inspected from repository code and migrations:

- `profiles`
- `storefronts`
- `products`
- `product_media`
- `seller_applications`
- `orders`
- `order_fulfillments`
- `storefront_events`
- `conversations`
- `conversation_participants`
- `messages`
- `message_requests`
- `direct_conversation_pairs`
- `message_reactions`
- `chat_notifications`
- `chat_reports`
- `expense_transactions`
- `chit_groups`
- `chit_group_members`
- `chit_group_invitations`
- `chit_group_contributions`
- `chit_group_loans`
- `bill_split_groups`
- `bill_split_members`
- `bill_split_invitations`
- `bill_split_expenses`
- `bill_split_settlements`
- `qa_topics`
- `qa_questions`
- `qa_answers`
- `notes_tasks_entries`
- `charity_organizations`
- `charity_donation_intents`
- `missing_person_reports`
- `anonymous_channels`
- `anonymous_posts`
- `nearby_people_preferences`
- `support_tickets`
- `support_feature_requests`
- `support_faqs`

Storage buckets inspected from code and migrations:

- `shop-media` referenced by commerce code.
- `social-posts` referenced by social upload code.
- `social-stories` referenced by social upload code.
- `missing-person-photos` created in a migration.

Policies inspected:

- RLS and policies in the listed Supabase migrations for financial services, notes/tasks, charity/missing persons, anonymous/nearby/support, chat direct messages, chat participant state and chat reactions/notifications.
- Live dashboard policies could not be verified through Supabase MCP in this session.

Figma files or frames inspected:

- No new Creator Commerce Figma link was supplied in this task.
- Figma MCP tools were not exposed in the current callable tool list for this turn, so no live Figma frames were inspected for this planning document.
- Prior screenshot context from the project informed the product direction only where it matched existing repository routes.

Public documentation consulted:

- Expo SDK 57 documentation: https://docs.expo.dev/versions/v57.0.0/
- Supabase Row Level Security documentation: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control documentation: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Auth users documentation: https://supabase.com/docs/guides/auth/users
- Supabase Realtime documentation: https://supabase.com/docs/guides/realtime
- Stripe Checkout documentation as a payment-flow reference only, not a provider decision: https://docs.stripe.com/payments/checkout
- Stripe idempotency documentation as a duplicate-payment prevention reference only: https://docs.stripe.com/api/idempotent_requests

Anything that could not be accessed:

- Supabase MCP tools were searched for but not exposed in this session, so live Supabase project tables, buckets and dashboard-only policies could not be inspected directly.
- Supabase changelog markdown was blocked by browser safety controls.
- Figma MCP/plugin tools were not exposed for live inspection in this turn.
- No payment provider dashboard was available and no final provider has been approved.
