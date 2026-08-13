# Business Chat Commerce — Final Manual Test

Use the separately provided test passwords. Do not paste passwords into screenshots or reports.

## 1. Seller profile opens the real store

**LOGIN AS:** `yogesh.qa24@gmail.com` (buyer)

**OPEN:** Social → search for the approved Naveen/Social24 seller profile.

**CLICK:** **View Store**.

**EXPECTED:** `/store/social24-test-store` opens and shows only the store's approved live products. A normal non-seller profile has no store CTA.

## 2. Same-store multi-product cart

**LOGIN AS:** `yogesh.qa24@gmail.com`

**OPEN:** Social24 Test Store.

**CLICK:** **Add to bag** on Manual Test Product and Social24 Test Sneakers, then open the bag badge.

**EXPECTED:** Both products appear, quantity controls work, and subtotal is ₹1,800 for one of each.

## 3. Store bag reaches authoritative checkout

**LOGIN AS:** `yogesh.qa24@gmail.com`

**OPEN:** The two-item bag from Test 2.

**CLICK:** **Continue to checkout**.

**EXPECTED:** Buyer Commerce loads from Supabase and both items appear under **Cart and checkout**. Existing items from an earlier test account cart may also appear; no newly selected item disappears.

## 4. Buyer opens a verified Business Chat

**LOGIN AS:** `yogesh.qa24@gmail.com`

**OPEN:** Chats → **Business** → **Search sellers**.

**CLICK:** Search `Social24`, then click **Message** on Social24 Test Store.

**EXPECTED:** One reusable Business conversation opens with the authoritative store name, verified/private subtitle, and **View Store** button. Repeating the action does not create a duplicate chat.

## 5. Message persistence and Realtime

**LOGIN AS:** `yogesh.qa24@gmail.com`, then `naveen.qa24@gmail.com` in a second session/device.

**OPEN:** The same Social24 Test Store Business conversation on both sides.

**CLICK:** Buyer sends `Business chat realtime test`; Seller replies `Seller received it`.

**EXPECTED:** Each message persists after refresh and appears for the other participant without manual refresh. The conversation remains under **Business**, not **Personal**.

## 6. Order cards are authoritative

**LOGIN AS:** `yogesh.qa24@gmail.com`

**OPEN:** Buyer Commerce with a valid cart, complete **Checkout external** test flow, then open Chats → **Business**.

**CLICK:** Open the Seller conversation and then **View order** on the order card.

**EXPECTED:** Exactly one **Order confirmed** card appears for the new order, shows real stored totals/status only, and opens the authorized order detail. Retrying/refreshing must not duplicate the card.

## 7. Fulfilment status reaches Business Chat

**LOGIN AS:** `naveen.qa24@gmail.com`

**OPEN:** Creator Commerce → **Seller tools** → **Seller fulfillment**.

**CLICK:** Advance the test order through its next allowed status; then open Chats → **Business**.

**EXPECTED:** One matching server-owned status card appears. Chat does not offer controls that directly mutate the order.

## 8. Private Gallery and Document attachments

**LOGIN AS:** Either participant in the Business conversation.

**OPEN:** The conversation → paperclip menu.

**CLICK:** **Gallery**, choose a JPEG/PNG/WebP under 25 MiB, preview and send. Repeat with **Document** using a safe PDF/DOC/DOCX/TXT under 25 MiB.

**EXPECTED:** Upload shows progress/disabled state, then a message card appears and opens through a short-lived signed URL. The Gallery item does not show **Captured Live**.

## 9. Camera and Scan Document provenance

**LOGIN AS:** Either participant on a camera-capable device.

**OPEN:** The Business conversation.

**CLICK:** Camera icon → capture/preview/send; then paperclip → **Scan Document** → capture/crop/preview/send.

**EXPECTED:** Camera media shows **Captured Live · app provenance**; scanned media shows **Scanned in app**. Cancel returns without a message. These labels describe in-app source, not forensic authenticity.

## 10. Location and Social contact cards

**LOGIN AS:** Either participant.

**OPEN:** The attachment menu.

**CLICK:** **Location** and allow foreground access; then **Contact**, search a Social 24x7 user, and share.

**EXPECTED:** A single current-location card opens the map link. The contact card opens the shared profile. Permission denial/cancel does not send anything, and the app never uploads the whole address book.

## 11. Poll, Event, and Keep Memo

**LOGIN AS:** Either participant.

**OPEN:** The Business conversation.

**CLICK:** Create a two-option **Poll** and vote; create an **Event** and RSVP; long-press/right-click a useful message and select **Keep Memo**.

**EXPECTED:** Poll counts and RSVP counts update for participants. Keep Memo creates a private entry only in the saving user's existing Notes & Tasks area.

## 12. Schedule Message

**LOGIN AS:** Either participant.

**OPEN:** Attachment menu → **Schedule**.

**CLICK:** Enter a message and a time at least one minute and no more than 30 days ahead, then schedule it.

**EXPECTED:** The server—not an open browser timer—delivers one message at/after the chosen time. A retry does not duplicate it; an unauthorized conversation cannot be targeted.

## 13. Vanish Mode boundary

**LOGIN AS:** Either participant.

**OPEN:** Attachment menu → **Vanish Mode**.

**CLICK:** Select 24 hours, send a normal test message, then turn Vanish Mode off.

**EXPECTED:** Only eligible user messages receive expiry. Order, payment, fulfilment, return, refund, and system cards never receive expiry and are never removed by cleanup.

## 14. Product media moderation boundary

**LOGIN AS:** `naveen.qa24@gmail.com`, then `admin@gmail.com`, then `yogesh.qa24@gmail.com`.

**OPEN:** Seller tools → draft product media; Admin review; approved public storefront.

**CLICK:** Seller uploads/reorders/selects a cover; Admin previews it; Buyer opens the approved product.

**EXPECTED:** Draft/submitted media use private signed previews for Seller/Admin, cross-seller mutation fails, submission requires exactly one cover, and approved storefront delivery loads for the Buyer.

## 15. Cross-user security

**LOGIN AS:** `arjun.qa24@gmail.com` or `kavya.qa24@gmail.com` as an unrelated user.

**OPEN:** A copied Business conversation URL, copied private attachment URL, and copied private order URL from the earlier tests.

**CLICK:** Open each URL directly.

**EXPECTED:** Access is denied or the record is absent. The unrelated user cannot read the conversation/order/attachment, forge an order/system card, schedule into the conversation, or mutate another Seller's product media.
