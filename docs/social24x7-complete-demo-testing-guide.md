# Social 24x7

## Complete End to End Testing and Client Presentation Guide

Prepared for presenting and manually testing the current Social 24x7 build with Mr Chirag.

Worktree inspected: `/Users/vamshipendyala/Desktop/july28drchiag-creator-commerce-auth`  
Supabase project referenced by the app: `nqwhmmigtbhrmmdvwzms`  
Local demo URL used during inspection: `http://localhost:8098`

This guide is intentionally practical. It is written for a developer or founder who needs to open the app, explain what each area does, and click through the safest live demo path without accidentally promising unfinished integrations.

Passwords are not printed in this document. Use the separately shared QA password for the QA accounts.

---

## 1. Application overview

Social 24x7 is a social super-app prototype with five main bottom tabs:

| Tab | Purpose | Current status |
| --- | --- | --- |
| Chats | Personal chat, business chat entry, requests, unread and archive states | PARTIAL |
| Social | Social feed, stories, profile/social posting shell | PARTIAL |
| Discover | Mini apps, utilities, games, community and service discovery | PARTIAL |
| Shop | Consumer storefront and product browsing | WORKING for browsing, PARTIAL for full commerce checkout |
| Wallet | Placeholder for protected payments and future transaction tools | EXTERNAL INTEGRATION PENDING |

The most complete business flow today is Creator Commerce. It connects:

```text
Seller onboarding
  -> Admin seller approval
  -> Product draft
  -> Product media
  -> Admin product approval
  -> Creator promotion
  -> Buyer referral link
  -> Cart and checkout
  -> Seller fulfilment
  -> Buyer evidence and return
  -> Admin return decision
  -> Creator commission status
```

### 30-second opening statement

“Social 24x7 is being built as a social-first commerce and utility platform. The main app already has Chats, Social, Discover, Shop, Wallet, Profile, Games, daily utilities, and a deeper Creator Commerce flow. The strongest demo today is Creator Commerce: a seller can get approved, create a product, attach media, submit it for admin approval, a creator can promote it with a tracked link, a buyer can place a test order, and admin can review KYC, returns, evidence, and commission outcomes. Some areas are intentionally marked as pending because they depend on real payment, KYC, logistics, or settlement providers.”

---

## 2. Demo accounts and role map

| Role | Account | Use for | Notes |
| --- | --- | --- | --- |
| Commerce Admin | `admin@gmail.com` | `/commerce/admin` review queues, KYC test controls, external payment test controls, returns | Admin is not automatically seller/creator; the hub may show Seller/Creator not applied for admin. |
| Approved Seller + Creator + Professional | `naveen.qa24@gmail.com` | Seller tools, product studio, advanced seller studio, creator workspace, commissions | This is the main demo account for “business owner plus creator” flows. |
| Normal Buyer | `yogesh.qa24@gmail.com` | Creator-attributed buyer link, cart, checkout, buyer KYC behavior, unboxing evidence, returns | KYC is controlled by Admin test controls for the demo build. |
| Additional QA users | `arjun.qa24@gmail.com`, `kavya.qa24@gmail.com` | Negative tests and alternate-user permission checks | Use only if you need a second buyer/non-admin account. |

Important: if the wrong role is signed in, routes will look locked. This is expected. Example: an admin can open Admin review, but an admin who is not approved as seller will not see seller tools.

---

## 3. Recommended presentation order, 15-20 minutes

1. Open with the five bottom tabs: Chats, Social, Discover, Shop, Wallet.
2. Show Discover as the “super-app menu.”
3. Open Shop and show live storefront/product browsing.
4. Open Profile and show where Creator Commerce lives.
5. Switch to Naveen and show Creator Commerce Hub.
6. Open Seller tools and explain product creation, media, commission and return window.
7. Open Advanced Seller Studio `/seller` and show Catalog, Orders, Business chat, SEO & AI.
8. Switch to Admin and show `/commerce/admin`: application reviews, product queue, KYC, returns.
9. Switch to Naveen creator tools and show promotion link / commissions.
10. Switch to Buyer and show referral, cart, checkout, evidence and return.
11. Close with the readiness dashboard: what is working, partial, external pending.

---

## 4. Discover

How to reach: bottom tab **Discover** or direct route `/discover`.

What it is for: Discover is the super-app launcher. It groups finance, daily services, shopping, community, and games into simple cards.

| Section | Card | Route or behavior | Status | What to say |
| --- | --- | --- | --- | --- |
| Financial Services | Expenses | `/expenses` | PARTIAL | Expense UI exists; real finance workflows need further validation. |
| Financial Services | Chit Fund | `/chit-fund` | PARTIAL | Group shell exists; do not present as regulated finance production-ready. |
| Financial Services | Bill Split | `/bill-split` | PARTIAL | Groups/activity/friends shell exists. |
| Financial Services | Q&A Community | `/qa-community` | WORKING/PARTIAL | Q&A feed can show questions and tabs; full moderation is not the demo focus. |
| Daily Services | Food | `/food` | PARTIAL | Restaurant cards and add buttons exist; no real delivery provider. |
| Daily Services | Notes | `/notes-tasks` | PARTIAL | Notes/tasks UI exists; test create/search carefully before client use. |
| Daily Services | Nearby People | `/nearby-people` | PARTIAL | Safety-first nearby UI exists; GPS package message says approximate/offline-safe. |
| Daily Services | Support | `/support-feedback` | PARTIAL | Issue and feature request surfaces exist. |
| Shopping | Shopping | `/shop` | WORKING for browsing | Opens the consumer marketplace. |
| Shopping | Missing Person | `/missing-persons` | PARTIAL | Report/search UI exists; do not treat as verified emergency system. |
| Shopping | Charity | `/charity` | PARTIAL | Donation/volunteer UI exists; payment/provider not final. |
| Shopping | Anonymous Chat | `/anonymous-chat` | PARTIAL | Anonymous feed/posting shell exists with community guidelines. |
| Entertainment | Games | `/games` | WORKING for quick games | Quick arcade games pass automated tests. |
| Entertainment | Ladder Shuffle | Coming soon alert | NOT IMPLEMENTED | Explicitly says not wired in Phase 1. |

Non-obvious controls:

- The search icon on Discover shows a “Coming soon” alert. Do not present it as a live global search.
- The Games card is safe to demo. Ladder Shuffle is not.

What to test:

- Click each safe card and confirm it routes to the correct page.
- Click Discover search and Ladder Shuffle only if you want to show that unfinished features are clearly guarded.

Expected result:

- Real cards route to their pages.
- Coming-soon controls show an alert instead of silently failing.

Client talk track:

“Discover is the extensible launch surface. We can add or mature mini-apps one by one without disturbing the core social and commerce tabs.”

---

## 5. Games

How to reach: Discover -> Games, or direct `/games`.

Current visible areas:

- Quick Play Arcade
  - Tic-Tac-Toe
  - Snake & Ladder
  - Memory Match
- Realtime rooms area
  - Create
  - Room list/loading state

What to test:

| Game | Route | What to click | Expected result | Status |
| --- | --- | --- | --- | --- |
| Tic-Tac-Toe | `/games/quick-tic-tac-toe` | Tap a cell | User move and bot move happen; Reset board works | WORKING |
| Snake & Ladder | `/games/quick-snake-ladder` | Roll dice | Player/bot position changes; exact 100 win logic exists | WORKING |
| Memory Match | `/games/quick-memory-match` | Flip cards | Matches count up; Shuffle again resets | WORKING |
| Realtime rooms | `/games` | Create | Requires signed-in realtime-ready account; test separately | PARTIAL |

Automated verification performed:

- `npm run test:games` passed 6/6.

Client talk track:

“Quick games are already playable. Realtime multiplayer is the next level and should be shown carefully because it depends on live account/session state.”

---

## 6. Chats

How to reach: bottom tab **Chats** or direct `/chats`.

What it is for: personal messaging and business messaging entry points.

Visible controls:

- Start a new chat
- Chat settings
- More options
- Search chats and people
- Personal / Business tabs
- Filters: All, Unread, Requests, Archived
- Search people
- Business placeholder can route to Business Directory

Important things to show:

- Personal chats and Business chats are separated.
- Requests and archived states are visible in the UI.
- Business chat is connected conceptually to seller/store conversations.

What to test:

- Open Chats.
- Switch Personal -> Business.
- Click Search people.
- If a known contact exists, start/request a chat; otherwise present this as a ready shell.

Expected result:

- Tabs and filters switch without crashing.
- Empty state explains what to do next.

Current status: PARTIAL. The UI is present and integrated with repository code, but do not promise production chat scale, calling, or moderation in this demo.

Client talk track:

“Chats is the social backbone. The same app can support personal conversations and buyer-to-seller business conversations without mixing them.”

---

## 7. Social

How to reach: bottom tab **Social** or direct `/social`.

What it is for: social feed, stories, post creation entry, profile presence.

Visible controls seen in the current build:

- Search
- Add story
- Create post
- Create a new post
- Feed empty state when there is no content
- Bottom tab navigation

What to test:

- Open Social.
- Confirm the feed loads.
- Tap Add story and Create post only if you are ready to test media/post creation.
- Open profile/social profile if presenting user identity.

Expected result:

- Social route opens.
- Empty feed or existing content is handled cleanly.

Current status: PARTIAL. It is presentable as the social landing surface, but Creator Commerce is the more complete demo flow.

Client talk track:

“Social is the home layer. Commerce is not a separate app; it lives inside a social identity and conversation environment.”

---

## 8. Shop

How to reach: bottom tab **Shop** or direct `/shop`.

What it is for: consumer browsing of approved storefronts and products.

Visible areas:

- Header: Shop
- Subtitle: Browse real storefronts and products from sellers across Social 24x7
- Cart icon
- Hero: CONSUMER MARKETPLACE
- Search products, stores or keywords
- Categories: All, Wellness, Home, Travel, Everyday
- Featured storefronts
- Catalog product grid

Known live demo data during inspection:

- Storefront: Social24 Test Store
- Products:
  - Manual Test Product
  - Social24 Test Sneakers

What to test:

- Open Shop.
- Search for `Manual Test Product`.
- Filter category if needed.
- Open a product or storefront.
- Use the cart icon only if you are prepared to explain that Shop browsing and Creator Commerce checkout are separate surfaces right now.

Expected result:

- Approved/live products are visible.
- Storefront/product detail routes open.

Current status: WORKING for browsing, PARTIAL for full buyer checkout. The deeper checkout demo should use `/commerce/buyer`.

Client talk track:

“Shop is the consumer marketplace. It shows approved storefronts and live products. The Creator Commerce buyer path adds referral attribution, KYC behavior, checkout testing, evidence, returns and commissions.”

---

## 9. Wallet

How to reach: bottom tab **Wallet** or direct `/wallet`.

What it is for: protected future payment and transaction area.

Visible areas:

- PHASE 1
- Wallet UI is ready for the next payment step
- Available now:
  - Protected payment area
  - Profile payment access
- Buttons:
  - Open profile
  - Browse shop
- Coming next:
  - Saved methods
  - Transactions

Current status: EXTERNAL INTEGRATION PENDING.

What not to claim:

- Do not say wallet balance, bank settlement, saved cards, refunds, or creator payout are production-ready.

Client talk track:

“Wallet is intentionally guarded. The navigation and protected area exist, but real payments, stored methods, transaction ledger and settlements should only be switched on after provider decisions.”

---

## 10. Profile

How to reach: bottom tab/profile route `/profile`.

What it is for: user identity, account settings, activity and Creator Commerce entry.

Visible areas:

- User profile header
- Edit profile
- Your activity
  - Orders & purchases
  - Saved content
  - Creator Commerce
- Account
  - Notifications
  - Privacy & safety
  - Location preferences
- Payments & support
  - Payments
  - Security
  - Help centre
- Sign out

What to test:

- Open Profile.
- Click Creator Commerce.
- Confirm it opens the Creator Commerce hub.
- Confirm Sign out is available before switching accounts.

Expected result:

- Creator Commerce opens through the profile path.
- Account settings rows are visible.

Current status: WORKING as navigation/account shell, PARTIAL for settings that still need final provider integrations.

Client talk track:

“Profile is where identity, settings and commerce capabilities come together. A user can be a buyer, seller, creator, professional, or admin depending on approval state.”

---

## 11. Creator Commerce overview

How to reach:

- Profile -> Creator Commerce
- or direct `/commerce`

Hub cards:

- Seller
- Creator
- Professional
- Buyer KYC

Main action rows:

- Become a Seller
- Become a Creator
- Buyer marketplace
- Seller tools
- Creator tools
- Admin review, only if the account has admin capability
- Refresh commerce status

Role behavior:

- Not Applied: onboarding is available.
- Submitted / Under review: application is locked until admin acts.
- Approved: tools open.
- Rejected / Needs information / Suspended: user sees the current state and admin notes.

Current status: WORKING for the implemented approval-gated commerce lifecycle.

Client talk track:

“This hub is deliberately role-based. The backend owns capability state. The UI does not pretend someone is a seller, creator, professional, or admin unless Supabase returns that capability.”

---

## 12. Seller onboarding

How to reach: `/commerce` -> Become a Seller, or `/commerce/seller-onboarding`.

What it is for: collecting seller identity, business and location data, GST/non-GST type, documents and evidence before admin approval.

Important controls:

- GST Registered Seller / Non-GST Seller
- Legal identity name
- Store name
- Business name
- Registered state
- City
- Phone
- Email
- GSTIN
- Store address
- Pickup address
- Private evidence/document upload fields
- Submit application

What to test:

- Use a non-approved account only if you need to show the application flow.
- Fill required fields.
- Attach safe test evidence.
- Submit.
- Switch to Admin and approve/reject/request info.

Expected result:

- Submitted application appears in `/commerce/admin`.
- User cannot self-approve.

Current status: WORKING for the tested onboarding/admin approval path.

Client talk track:

“Seller access is not just a button. The seller applies once, evidence is stored privately, and admin makes the decision.”

---

## 13. Creator and professional onboarding

How to reach:

- `/commerce` -> Become a Creator
- Direct route `/commerce/creator-onboarding`

What it is for:

- General creator application
- Verified professional application
- Private evidence upload
- Admin-controlled approval

Important controls:

- General Creator / Verified Professional
- Category or niche
- About
- Instagram handle
- YouTube handle
- Identity name
- Government identity evidence
- Professional credential/supporting evidence when professional is selected

What to test:

- Submit a creator or professional application.
- Confirm application status changes to Submitted.
- Switch to Admin and review.
- Confirm approved creator/professional status appears in hub.

Current status: WORKING for approval flow, evidence viewing and admin control.

Client talk track:

“Creators and professionals are separated from sellers. A person can be approved to promote, approved as a seller, and approved as a professional independently.”

---

## 14. Seller Product Studio

How to reach:

- Sign in as `naveen.qa24@gmail.com`.
- Open `/commerce`.
- Click Seller tools.
- Direct route: `/commerce/seller`.

What it is for: creating a commerce product, enabling creator promotion, setting commission and return policy, then submitting to admin.

Fields and controls:

| Control | Meaning |
| --- | --- |
| Open advanced media studio | Opens `/seller`, the advanced web Seller Central. |
| Title | Product display name. |
| Slug | URL-safe product slug. |
| Category | Wellness, Home, Travel, Everyday. |
| Price ₹ | Base product price. |
| Sale price ₹ | Optional sale price. |
| Inventory | Total stock. |
| SKU | Seller stock keeping unit. |
| Description | Product copy. |
| Creator promotion enabled | Allows creators to promote the product. |
| Creator commission % | Must be 5-70% when promotion is enabled. |
| Return window days | Backend clamps range to 0-30 days. |
| Save product draft | Persists product without admin review. |
| Submit for approval | Moves product into Product approval queue. |
| Edit | Available only when product state is mutable. |

Lifecycle:

```text
Draft
  -> Submitted
  -> Under review
  -> Approved / Active
  -> Suspended, Reinstated, or Archived depending on admin/product state
```

What to test:

- Do not recreate Manual Test Product unless you need a new clean product.
- Open existing product.
- Confirm Media count, inventory, commission and return window are visible.
- Save a draft only if you intentionally changed data.
- Submit for approval only for a draft product.

Expected result:

- Draft saves and reloads from backend.
- Submitted product appears in Admin Product approval queue.
- Approved product becomes promotable to creators.

Current status: WORKING. Product media RLS was previously verified through the live admin/product flow: Manual Test Product showed media attached; Social24 Test Sneakers currently has 0/10 media because that product data has no media attached.

Client talk track:

“Seller Product Studio owns the commercial terms: price, stock, SKU, creator commission, return window and whether creators can promote the item.”

---

## 15. Advanced Seller Studio

How to reach:

- From Seller Product Studio click Open advanced media studio.
- Direct route: `/seller`.
- Requires an approved seller account.

Sidebar sections:

- Overview
- Storefront
- Catalog
- Orders
- Business chat
- SEO & AI
- Operations

### Overview

Use for: seller health/readiness and quick access to product creation.

Current status: WORKING/PARTIAL depending on logged-in seller data.

### Storefront

Use for: seller public store profile.

Important fields:

- Storefront name
- Storefront slug
- Business name
- Tagline
- Store description
- Store tier
- Primary category
- City
- State code
- Support email
- Support phone
- Registered address
- GSTIN/PAN
- Save storefront / Create seller account

Current status: WORKING for approved seller/storefront management.

### Catalog

Use for: product media, catalog copy, pricing and inventory.

Important fields:

- Product title
- Product slug
- Brand
- Category
- Price in paise
- Inventory
- SKU
- Short description
- Product description
- Tags
- Search keywords
- Add 1 to 10 product images
- Publish product / Update product
- Catalog inventory table

What to test:

- Select a product.
- Add product images.
- Click Update product.
- Confirm media count updates in Catalog inventory and Admin Product queue.

Current status: WORKING for the current media path after the RLS fix. If a row shows 0/10 media, verify whether that product actually has media selected before treating it as a bug.

### Orders

Use for: seller fulfilment operations.

Visible controls:

- Refresh orders
- Manage
- Order queue
- Customer
- Total
- Fulfilment status

For the strict lifecycle demo, use `/commerce/seller` Seller fulfillment because it exposes controlled status transitions and packing evidence.

Current status: PARTIAL/WORKING for tested lifecycle orders.

### Business chat

Use for: customer conversation inbox connected to seller/storefront.

Visible controls:

- Inbox
- Search conversations
- All / Unread / Orders
- Customer thread
- Phone/video icons
- Reply as your store

Current status: PARTIAL. Text reply surfaces exist; do not present phone/video as finished calling.

### SEO & AI

Use for: crawlability and AI discovery metadata.

Controls include:

- Save discoverability settings
- Publish crawlable pages
- Enable GEO summaries

Current status: PARTIAL. Present as preparation for search/model discoverability, not guaranteed ranking.

### Operations

Use for: operational readiness/support profile.

Current status: PARTIAL. Do not promise courier, payout, tax or settlement automation here yet.

Client talk track:

“The advanced studio is where a real seller would manage the store, catalog media, orders, customer conversations and discoverability. The simpler Creator Commerce seller studio is the approval-safe product lifecycle surface.”

---

## 16. Commerce Admin

How to reach:

- Sign in as `admin@gmail.com`.
- Open `/commerce/admin`.
- Or from `/commerce`, click Admin review when visible.

Main admin areas:

1. Application reviews
2. Product approval queue
3. External checkout test controls
4. Buyer KYC test review
5. Return requests

### Application reviews

Use for seller, creator and professional approvals.

Visible controls:

- Refresh applications
- View evidence
- Open evidence
- Copy path
- Reason for reject/request info/suspend
- Under review
- Approve
- Request info
- Reject
- Suspend

What to test:

- Refresh applications.
- Open evidence.
- Approve or suspend only if testing a disposable application.

Expected result:

- Status changes persist and role hub updates for the applicant.

Current status: WORKING.

### Product approval queue

Use for product moderation before the item becomes live/promotable.

Visible data:

- Product title
- Storefront
- Price
- Approval status
- Commission %
- Inventory/reserved count
- SKU
- Return window
- Description
- Media count
- Media thumbnails if attached
- Reason/notes

Admin decisions from source/tests:

| Current product review state | Available admin decisions |
| --- | --- |
| submitted | Under review, Approve live, Changes required, Rejected |
| under_review | Approve live, Changes required, Rejected |
| approved | Suspended |
| suspended | Reinstate |
| draft / archived | No review decisions |

What to test:

- Refresh the queue.
- Confirm Manual Test Product is Approved/Live.
- Confirm media count.
- Do not suspend live demo product unless you intentionally want to test removal.

Expected result:

- Approved product appears in Shop and Creator marketplace when promotion-enabled.

Current status: WORKING.

### Buyer KYC test review

Use for demo-only KYC status testing.

Visible statuses:

- submitted
- under review
- verified
- rejected

Important:

- Normal buyers cannot self-verify.
- COD checkout requires verified buyer KYC.
- This is a test control, not a real KYC provider integration.

Current status: WORKING as internal test control; EXTERNAL INTEGRATION PENDING for real provider KYC.

### External checkout test controls

Use for simulating payment provider outcomes.

Important:

- External checkout is test-mode.
- Payment attempts can be moved through captured test state.
- Real Razorpay/payment provider capture is not final.

Current status: WORKING as test harness; EXTERNAL INTEGRATION PENDING for real payment provider.

### Return requests

Use for admin return approval/rejection.

Important behavior:

- Buyer submits return after delivery and evidence.
- Admin approves or rejects return.
- Approved return creates refund request with external integration pending.
- Creator commission can become reversed after approved return.

Current status: WORKING for tested return lifecycle; EXTERNAL INTEGRATION PENDING for real refund rails.

Client talk track:

“Admin is the safety layer. Applications, products, KYC test state, payment test state and returns are intentionally controlled from here.”

---

## 17. Creator Workspace

How to reach:

- Sign in as `naveen.qa24@gmail.com`.
- Open `/commerce`.
- Click Creator tools.
- Direct route: `/commerce/creator`.

What it is for:

- Discover approved promotion-enabled products.
- Create or reuse a creator-product promotion record.
- Copy/use buyer tracking link.
- Track commissions from attributed order items.

Visible areas:

- Creator product marketplace
- Promote / Refresh promotion
- Buyer link: `/commerce/buyer?ref=TRACKING_CODE`
- Add To Cart
- Cart and checkout test surface
- Creator commissions

What to test:

- Find Manual Test Product.
- Click Promote if no link exists, or Refresh promotion if it exists.
- Confirm buyer link appears.
- Copy the buyer link.
- Later, after checkout/return, refresh Creator commissions.

Expected result:

- Promotion is stable and reused.
- Buyer link contains `ref=`.
- Commission row appears after attributed checkout.

Current status: WORKING for current Creator Commerce lifecycle.

Client talk track:

“Creators do not duplicate seller products. They create a tracked relationship to an approved product. The seller still controls product data, price, inventory and media.”

---

## 18. Buyer marketplace, attribution and checkout

How to reach:

- Open the creator buyer link: `/commerce/buyer?ref=TRACKING_CODE`
- Or direct `/commerce/buyer`

What it is for:

- Apply creator referral.
- Browse approved marketplace products.
- Add product to cart.
- Enter delivery address.
- Checkout external or COD.
- Upload unboxing evidence.
- Submit returns.
- See checkouts/order items.

Visible controls:

- Promotion tracking code
- Apply Creator Referral
- Add To Cart
- Add One
- Remove One
- Remove
- Recipient name
- Phone
- Address
- City
- State
- Postal code
- Checkout external
- Checkout COD
- Submit Unboxing Evidence
- Submit Return Request

Critical rules:

- Last click attribution applies to the buyer session.
- External checkout can proceed through test payment flow.
- COD requires verified buyer KYC.
- Buyer unboxing evidence is private evidence.
- Return button is available only when order/item state and return window allow it.

What to test:

- Sign in as `yogesh.qa24@gmail.com`.
- Open the creator link.
- Confirm “Creator attribution recorded for this buyer session.”
- Add Manual Test Product to cart.
- Use External checkout for the safest demo.
- Use COD only after admin verifies buyer KYC.
- After seller marks delivered, upload unboxing evidence.
- Submit return request.

Expected result:

- Cart line says Creator attributed.
- Checkout creates order/checkouts.
- Seller sees order.
- Buyer evidence persists after refresh.
- Return appears in Admin return requests.

Current status: WORKING for internal test lifecycle; EXTERNAL INTEGRATION PENDING for real payment/KYC/refund providers.

Client talk track:

“This is where the commerce loop becomes measurable. The buyer enters through a creator link, attribution is recorded, checkout creates real order records, and evidence/returns affect commission state.”

---

## 19. Fulfilment, evidence, returns and commission

Primary seller fulfilment route: `/commerce/seller` under Seller fulfillment.  
Primary admin review route: `/commerce/admin`.  
Primary buyer evidence route: `/commerce/buyer`.  
Primary creator commission route: `/commerce/creator`.

Typical lifecycle:

```text
Order placed
  -> Seller submits packing evidence
  -> Seller marks packed
  -> Seller marks shipped / out for delivery
  -> Seller marks delivered
  -> Buyer uploads unboxing evidence
  -> Buyer submits return request
  -> Admin approves or rejects return
  -> Commission becomes confirmed, withheld, or reversed depending on state
```

What to test:

- Seller: upload packing evidence.
- Seller: move order through available next status only.
- Buyer: upload unboxing evidence after delivery.
- Buyer: submit return request with reason.
- Admin: approve or reject return.
- Creator: refresh commissions.

Expected result:

- Evidence previews remain attached after refresh.
- Return request persists in Admin.
- Commission status changes according to delivered/return state.

Current status: WORKING for tested lifecycle.

Client talk track:

“The important part is not just checkout. The app stores proof around packing and unboxing, controls returns, and updates creator commission exposure instead of paying blindly.”

---

## 20. Other current features

| Feature | Route | What to show | Status |
| --- | --- | --- | --- |
| Anonymous Chat | `/anonymous-chat` | Feed, channels, guidelines, post box | PARTIAL |
| Nearby People | `/nearby-people` | Discover/Requests/Friends tabs, distance, online-only, safety copy | PARTIAL |
| Support & Feedback | `/support-feedback` | Overview, tickets, features, FAQ, Report Issue, Request Feature | PARTIAL |
| Notes & Tasks | `/notes-tasks` | Notes/tasks tabs, categories, search, create note | PARTIAL |
| Food | `/food` | Restaurant list and add buttons | PARTIAL / EXTERNAL INTEGRATION PENDING |
| Charity | `/charity` | Charities, donors, donate/volunteer buttons | PARTIAL / EXTERNAL INTEGRATION PENDING |
| Missing Persons | `/missing-persons` | Missing report list, emergency copy, contact/share info | PARTIAL |
| Expenses | `/expenses` | Balance, income, expenses, add transaction | PARTIAL |
| Bill Split | `/bill-split` | Groups, activity, friends, create group | PARTIAL |
| Chit Fund | `/chit-fund` | Chit fund group shell | PARTIAL |
| Q&A Community | `/qa-community` | Feed/topics/saved/profile, visible sample question | PARTIAL |
| Business Directory | `/business-directory` | Store search and Message button | PARTIAL |

Client talk track:

“These modules prove the app structure can support multiple daily-use cases. For client demo, I would show them as available surfaces, not as the final production promise.”

---

## 21. Complete end-to-end QA sequence

### A. Basic navigation smoke test

- Open `/social`.
- Visit bottom tabs: Chats, Social, Discover, Shop, Wallet.
- Open Profile.
- Expected: every route loads without blank screen.

### B. Discover and games

- Open Discover.
- Click Games.
- Play Tic-Tac-Toe, Snake & Ladder, Memory Match.
- Expected: quick games are playable.

### C. Seller product readiness

- Sign in as `naveen.qa24@gmail.com`.
- Open `/commerce`.
- Confirm Seller, Creator and Professional are Approved.
- Open Seller tools.
- Confirm Manual Test Product exists.
- Confirm media count and approval state.

### D. Admin product approval

- Sign in as `admin@gmail.com`.
- Open `/commerce/admin`.
- Refresh applications.
- Scroll to Product approval queue.
- Confirm Manual Test Product is Approved.
- Confirm media count is not unexpectedly 0.

### E. Creator promotion and buyer attribution

- Sign in as `naveen.qa24@gmail.com`.
- Open `/commerce/creator`.
- Click Promote or Refresh promotion on Manual Test Product.
- Copy buyer link.
- Sign in as `yogesh.qa24@gmail.com`.
- Open buyer link.
- Expected: creator attribution recorded.

### F. Checkout, fulfilment and evidence

- Buyer adds product to cart.
- Buyer uses Checkout external.
- Admin confirms/captures external test payment if required.
- Seller opens `/commerce/seller`.
- Seller uploads packing evidence.
- Seller moves order through fulfilment statuses until delivered.
- Buyer opens `/commerce/buyer`.
- Buyer uploads unboxing evidence.
- Expected: evidence persists after refresh.

### G. Return and commission

- Buyer submits return reason.
- Admin opens `/commerce/admin`.
- Admin approves return.
- Creator opens `/commerce/creator`.
- Expected: commission state reflects return outcome.

---

## 22. Demo data

Known useful data visible during inspection:

| Data | Value |
| --- | --- |
| Storefront | Social24 Test Store |
| Product | Manual Test Product |
| Product | Social24 Test Sneakers |
| Manual Test Product media | Media attached in current product/admin flow |
| Social24 Test Sneakers media | 0/10 in inspected data |
| Product categories | Wellness, Home, Travel, Everyday |
| Platform fee behavior | ₹5 backend platform fee once per unified checkout |
| Product approval statuses | draft, submitted, under_review, approved, changes_required, rejected, suspended, archived |
| Buyer KYC statuses | not_submitted, submitted, under_review, verified, rejected |

Do not hard-code tracking codes in a presentation. Generate or refresh the promotion link live so the audience sees the relationship being created/reused.

---

## 23. What should not be demonstrated as finished yet

- Wallet stored cards, wallet balance and transaction history.
- Real payment provider capture/settlement.
- Real KYC provider verification.
- Real bank payouts or creator payout settlement.
- Real courier/3PL label generation or tracking webhooks.
- Discover global search.
- Ladder Shuffle.
- Regulated Chit Fund behavior.
- Charity donations as real money movement.
- Food delivery as real restaurant/provider integration.
- Phone/video calls in Business chat.
- Google Business verification as a completed external integration.

---

## 24. Non-obvious questions Mr Chirag may ask

1. Why does Admin not see seller tools? Because capabilities are role-specific; admin review is separate from seller approval.
2. Can a buyer self-verify KYC? No. The demo has admin test controls; real KYC provider is pending.
3. Is COD real? COD is gated by verified buyer KYC in the test lifecycle, but production COD rules still need business approval.
4. Is Razorpay connected? External checkout has test controls; real provider integration is pending.
5. Why does one product show 0/10 media? That means that specific product has no media attached; Manual Test Product was used to verify the media path.
6. Can creators change product price? No. Seller owns product price, stock and media.
7. What does creator promotion create? A creator-product tracking relationship and buyer link, not a duplicate product.
8. What is last-click attribution? The latest valid creator referral applied to the buyer session controls the attributed cart/order item.
9. Where are returns reviewed? `/commerce/admin` -> Return requests.
10. Where is seller fulfilment? `/commerce/seller` for lifecycle fulfilment; `/seller` for advanced Seller Studio order operations.
11. Are evidence files public? Application/evidence flows are intended as private evidence. Product media is public/shop media.
12. Is Shop the same as Creator Commerce Buyer? No. Shop is browsing; `/commerce/buyer` is the attribution/cart/checkout/evidence demo surface.
13. Can product approval be bypassed? No. Product visibility/promotion depends on admin approval.
14. Are mini apps production-ready? Some are shells or partial modules; mark them honestly.
15. What is the next production step? Decide payment, KYC, payout, logistics and moderation providers, then harden those integrations.

---

## 25. Blockers found during final QA

No new application logic was changed during this documentation pass.

Observed limitations to call out before client demo:

| Area | Expected | Actual | Severity |
| --- | --- | --- | --- |
| Supabase direct SQL inspection through MCP | Direct table/query inspection | Supabase SQL helper exposed by tool search was unavailable in this session, so verification used live UI, source, migrations and tests | Low for demo, Medium for audit |
| Discover search | Search all Discover features | Explicit Coming soon alert | Low |
| Ladder Shuffle | Playable feature | Explicit Coming soon alert | Low |
| Wallet | Real saved methods/transactions | Placeholder/payment shell only | Medium |
| KYC | Real provider verification | Admin test controls only | Medium |
| External checkout/refund | Real payment/refund provider | Test lifecycle only | Medium |
| Business phone/video | Real calling | Icons/UI present, not verified as calling | Low/Medium |

Recommended client-safe wording: “This is implemented as the test lifecycle today; the production provider is pending.”

---

## 26. Final demo readiness dashboard

### WORKING

- App opens locally.
- Main bottom navigation loads.
- Discover card routing.
- Quick games logic and routes.
- Shop browsing of live storefront/products.
- Profile -> Creator Commerce navigation.
- Seller/creator/professional onboarding/admin approval flow.
- Seller product draft/save/submit flow.
- Product admin approval state machine.
- Product media path for current Manual Test Product flow.
- Creator promotion and tracking link.
- Buyer attribution, cart, external checkout test flow.
- Seller fulfilment transitions and packing evidence.
- Buyer unboxing evidence and return request.
- Admin return review.
- Creator commission status visibility.

### PARTIAL

- Chats: UI and repository integration exist; full production messaging/calling/moderation not the current demo focus.
- Social: landing/feed/post shell exists; current feed may be empty.
- Shop checkout: browsing is good; full lifecycle checkout should be demonstrated through Creator Commerce Buyer.
- Realtime game rooms: present, but quick games are safer for client demo.
- Mini apps: Expenses, Bill Split, Chit Fund, Notes, Nearby People, Anonymous Chat, Support, Food, Charity, Missing Persons, Q&A, Business Directory.
- Advanced Seller Studio operations, SEO and business chat.

### EXTERNAL INTEGRATION PENDING

- Real payment provider capture and refunds.
- Real buyer KYC provider.
- Wallet saved payment methods and transactions.
- Seller/creator payouts.
- Courier/3PL labels and tracking.
- Charity donation rails.
- Food delivery provider integration.
- Google Business verification.

### NOT WORKING / NOT IMPLEMENTED

- Discover global search is not wired.
- Ladder Shuffle is not wired.
- Real Wallet transaction ledger is not implemented.

### Recommended first manual testing module

Creator Commerce, starting with the approved product path:

`Naveen seller/creator -> Manual Test Product -> Admin Product queue -> Creator promotion -> Yogesh buyer checkout -> Seller fulfilment -> Buyer return -> Admin return -> Creator commission`

This is the most complete and most business-valuable demonstration path.

