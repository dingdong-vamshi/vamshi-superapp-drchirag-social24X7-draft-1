import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  toAttachment,
  toLocation,
  toOrderEvent,
} from "./chatContractParsers.ts";

const orderId = "11111111-1111-4111-8111-111111111111";
const orderItemId = "22222222-2222-4222-8222-222222222222";

test("accepts a versioned server order event and rejects forged shapes", () => {
  const parsed = toOrderEvent({
    version: 1,
    event_type: "order_confirmed",
    order_id: orderId,
    order_status: "placed",
    storefront_id: "33333333-3333-4333-8333-333333333333",
    storefront_name: "Test Store",
    storefront_slug: "test-store",
    currency: "INR",
    subtotal_minor: 90000,
    total_minor: 90500,
    payment_method: "cod",
    payment_status: "pending",
    placed_at: "2026-08-12T10:00:00.000Z",
    items: [{
      order_item_id: orderItemId,
      title: "Product A",
      slug: "product-a",
      quantity: 1,
      unit_price_minor: 90000,
      subtotal_minor: 90000,
    }],
  });

  assert.equal(parsed?.eventType, "order_confirmed");
  assert.equal(parsed?.items[0]?.orderItemId, orderItemId);
  assert.equal(toOrderEvent({ version: 1, event_type: "paid", order_id: orderId }), undefined);
  assert.equal(toOrderEvent({ version: 2, event_type: "order_confirmed", order_id: orderId }), undefined);
});

test("keeps capture provenance distinct from gallery uploads", () => {
  const attachmentId = "44444444-4444-4444-8444-444444444444";
  assert.equal(toAttachment({
    attachment_id: attachmentId,
    attachment_type: "image",
    source: "camera_capture",
    filename: "camera.jpg",
    mime_type: "image/jpeg",
    bytes: 2048,
  })?.source, "camera_capture");
  assert.equal(toAttachment({
    attachment_id: attachmentId,
    attachment_type: "image",
    source: "gallery",
    filename: "gallery.png",
    mime_type: "image/png",
    bytes: 1024,
  })?.source, "gallery");
  assert.equal(toAttachment({
    attachment_id: attachmentId,
    attachment_type: "image",
    source: "forensic_proof",
  }), undefined);
});

test("validates location bounds", () => {
  assert.deepEqual(toLocation({
    version: 1,
    latitude: 17.385,
    longitude: 78.4867,
    captured_at: "2026-08-12T10:00:00.000Z",
  }), {
    latitude: 17.385,
    longitude: 78.4867,
    accuracy: undefined,
    label: undefined,
    capturedAt: "2026-08-12T10:00:00.000Z",
  });
  assert.equal(toLocation({ version: 1, latitude: 91, longitude: 78 }), undefined);
});

test("migrations keep authoritative events and private media behind RLS", () => {
  const orderMigration = readFileSync(
    new URL("../../../supabase/migrations/20260812144700_business_chat_order_events.sql", import.meta.url),
    "utf8",
  );
  const attachmentMigration = readFileSync(
    new URL("../../../supabase/migrations/20260812152000_private_chat_attachments.sql", import.meta.url),
    "utf8",
  );
  const vanishMigration = readFileSync(
    new URL("../../../supabase/migrations/20260812161000_scheduled_messages_vanish_mode.sql", import.meta.url),
    "utf8",
  );
  const evidenceMigration = readFileSync(
    new URL("../../../supabase/migrations/20260813103148_business_chat_unboxing_evidence_source.sql", import.meta.url),
    "utf8",
  );
  const commerceFinalizationMigration = readFileSync(
    new URL("../../../supabase/migrations/20260817142344_seller_owned_commerce_rearchitecture.sql", import.meta.url),
    "utf8",
  );
  const wallpaperImageMigration = readFileSync(
    new URL("../../../supabase/migrations/20260819103000_chat_wallpaper_images.sql", import.meta.url),
    "utf8",
  );
  const clearWallpaperImageMigration = readFileSync(
    new URL("../../../supabase/migrations/20260819103500_clear_chat_wallpaper_image.sql", import.meta.url),
    "utf8",
  );
  const privateWallpaperMigration = readFileSync(
    new URL("../../../supabase/migrations/20260821143000_private_wallpapers_and_chat_video_limit.sql", import.meta.url),
    "utf8",
  );

  assert.match(orderMigration, /revoke\s+all\s+on\s+table\s+public\.commerce_order_chat_events/i);
  assert.match(orderMigration, /unique\s*\(order_id,\s*event_type\)/i);
  assert.match(attachmentMigration, /on\s+conflict\s*\(id\)\s+do\s+update\s+set[\s\S]*public\s*=\s*false/i);
  assert.match(attachmentMigration, /private\.can_read_chat_media_path/i);
  assert.match(vanishMigration, /messages_authoritative_never_expire_check[\s\S]*kind\s+not\s+in[\s\S]*expires_at\s+is\s+null/i);
  assert.match(vanishMigration, /for\s+update\s+skip\s+locked/i);
  assert.match(evidenceMigration, /evidence_source\s+in\s*\('live_capture',\s*'uploaded_file'\)/i);
  assert.match(evidenceMigration, /evidence_order\.status\s+in\s*\('delivered',\s*'return_requested'/i);
  assert.match(evidenceMigration, /evidence_item\.buyer_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(commerceFinalizationMigration, /commerce_evidence_capture_intents[\s\S]*enable row level security/i);
  assert.match(commerceFinalizationMigration, /revoke insert on public\.commerce_order_evidence from authenticated/i);
  assert.match(commerceFinalizationMigration, /seller_review_creator_commerce_return/i);
  assert.match(commerceFinalizationMigration, /creator_commerce_private_order_participant_read/i);
  assert.match(commerceFinalizationMigration, /get_public_creator_recommendations/i);
  assert.match(wallpaperImageMigration, /wallpaper_image_path/i);
  assert.match(wallpaperImageMigration, /private\.can_read_chat_media_path/i);
  assert.match(wallpaperImageMigration, /public\.is_conversation_member\(target_conversation\)/i);
  assert.match(wallpaperImageMigration, /object\.owner_id\s*=\s*viewer/i);
  assert.match(wallpaperImageMigration, /revoke\s+all\s+on\s+function\s+public\.set_chat_wallpaper_image/i);
  assert.match(clearWallpaperImageMigration, /wallpaper_image_path\s*=\s*null/i);
  assert.match(privateWallpaperMigration, /primary key\s*\(conversation_id,\s*user_id\)/i);
  assert.match(privateWallpaperMigration, /user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(privateWallpaperMigration, /preference\.user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(privateWallpaperMigration, /target_bytes not between 1 and 104857600/i);
  assert.match(privateWallpaperMigration, /object\.owner_id\s*=\s*viewer::text/i);
});

test("background chat sync does not force visible refreshes or reset scroll", () => {
  const chatScreen = readFileSync(
    new URL("./ChatScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(chatScreen, /loadConversations\("silent"\)/);
  assert.doesNotMatch(
    chatScreen,
    /onContentSizeChange=\{\(\)\s*=>\s*list\.current\?\.scrollToEnd/,
  );
});

test("TRUE capture labels remain restricted to business chat", () => {
  const chatScreen = readFileSync(
    new URL("./ChatScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(chatScreen, /showTrustedCapture=\{Boolean\(conversation\.storefront\)\}/);
  assert.match(chatScreen, /attachment\.source === "camera_capture" && showTrustedCapture/);
  assert.match(chatScreen, /showTrustedCapture \? " · TRUE camera capture" : " · Camera capture"/);
});
