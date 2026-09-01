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
    items: [
      {
        order_item_id: orderItemId,
        title: "Product A",
        slug: "product-a",
        quantity: 1,
        unit_price_minor: 90000,
        subtotal_minor: 90000,
      },
    ],
  });

  assert.equal(parsed?.eventType, "order_confirmed");
  assert.equal(parsed?.items[0]?.orderItemId, orderItemId);
  assert.equal(
    toOrderEvent({ version: 1, event_type: "paid", order_id: orderId }),
    undefined,
  );
  assert.equal(
    toOrderEvent({
      version: 2,
      event_type: "order_confirmed",
      order_id: orderId,
    }),
    undefined,
  );
});

test("keeps capture provenance distinct from gallery uploads", () => {
  const attachmentId = "44444444-4444-4444-8444-444444444444";
  assert.equal(
    toAttachment({
      attachment_id: attachmentId,
      attachment_type: "image",
      source: "camera_capture",
      filename: "camera.jpg",
      mime_type: "image/jpeg",
      bytes: 2048,
    })?.source,
    "camera_capture",
  );
  assert.equal(
    toAttachment({
      attachment_id: attachmentId,
      attachment_type: "image",
      source: "gallery",
      filename: "gallery.png",
      mime_type: "image/png",
      bytes: 1024,
    })?.source,
    "gallery",
  );
  assert.equal(
    toAttachment({
      attachment_id: attachmentId,
      attachment_type: "image",
      source: "forensic_proof",
    }),
    undefined,
  );
});

test("validates location bounds", () => {
  assert.deepEqual(
    toLocation({
      version: 1,
      latitude: 17.385,
      longitude: 78.4867,
      captured_at: "2026-08-12T10:00:00.000Z",
    }),
    {
      latitude: 17.385,
      longitude: 78.4867,
      accuracy: undefined,
      label: undefined,
      capturedAt: "2026-08-12T10:00:00.000Z",
    },
  );
  assert.equal(
    toLocation({ version: 1, latitude: 91, longitude: 78 }),
    undefined,
  );
});

test("migrations keep authoritative events and private media behind RLS", () => {
  const orderMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260812144700_business_chat_order_events.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const attachmentMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260812152000_private_chat_attachments.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const vanishMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260812161000_scheduled_messages_vanish_mode.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const evidenceMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260813103148_business_chat_unboxing_evidence_source.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const commerceFinalizationMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260817142344_seller_owned_commerce_rearchitecture.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const wallpaperImageMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260819103000_chat_wallpaper_images.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const clearWallpaperImageMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260819103500_clear_chat_wallpaper_image.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const privateWallpaperMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260821143000_private_wallpapers_and_chat_video_limit.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const returnEvidenceMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260823153316_complete_return_evidence_flow.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    orderMigration,
    /revoke\s+all\s+on\s+table\s+public\.commerce_order_chat_events/i,
  );
  assert.match(orderMigration, /unique\s*\(order_id,\s*event_type\)/i);
  assert.match(
    attachmentMigration,
    /on\s+conflict\s*\(id\)\s+do\s+update\s+set[\s\S]*public\s*=\s*false/i,
  );
  assert.match(attachmentMigration, /private\.can_read_chat_media_path/i);
  assert.match(
    vanishMigration,
    /messages_authoritative_never_expire_check[\s\S]*kind\s+not\s+in[\s\S]*expires_at\s+is\s+null/i,
  );
  assert.match(vanishMigration, /for\s+update\s+skip\s+locked/i);
  assert.match(
    evidenceMigration,
    /evidence_source\s+in\s*\('live_capture',\s*'uploaded_file'\)/i,
  );
  assert.match(
    evidenceMigration,
    /evidence_order\.status\s+in\s*\('delivered',\s*'return_requested'/i,
  );
  assert.match(
    evidenceMigration,
    /evidence_item\.buyer_id\s*=\s*\(select auth\.uid\(\)\)/i,
  );
  assert.match(
    commerceFinalizationMigration,
    /commerce_evidence_capture_intents[\s\S]*enable row level security/i,
  );
  assert.match(
    commerceFinalizationMigration,
    /revoke insert on public\.commerce_order_evidence from authenticated/i,
  );
  assert.match(
    commerceFinalizationMigration,
    /seller_review_creator_commerce_return/i,
  );
  assert.match(
    commerceFinalizationMigration,
    /creator_commerce_private_order_participant_read/i,
  );
  assert.match(
    commerceFinalizationMigration,
    /get_public_creator_recommendations/i,
  );
  assert.match(wallpaperImageMigration, /wallpaper_image_path/i);
  assert.match(wallpaperImageMigration, /private\.can_read_chat_media_path/i);
  assert.match(
    wallpaperImageMigration,
    /public\.is_conversation_member\(target_conversation\)/i,
  );
  assert.match(wallpaperImageMigration, /object\.owner_id\s*=\s*viewer/i);
  assert.match(
    wallpaperImageMigration,
    /revoke\s+all\s+on\s+function\s+public\.set_chat_wallpaper_image/i,
  );
  assert.match(
    clearWallpaperImageMigration,
    /wallpaper_image_path\s*=\s*null/i,
  );
  assert.match(
    privateWallpaperMigration,
    /primary key\s*\(conversation_id,\s*user_id\)/i,
  );
  assert.match(
    privateWallpaperMigration,
    /user_id\s*=\s*\(select auth\.uid\(\)\)/i,
  );
  assert.match(
    privateWallpaperMigration,
    /preference\.user_id\s*=\s*auth\.uid\(\)/i,
  );
  assert.match(
    privateWallpaperMigration,
    /target_bytes not between 1 and 104857600/i,
  );
  assert.match(
    privateWallpaperMigration,
    /object\.owner_id\s*=\s*viewer::text/i,
  );
  assert.match(
    returnEvidenceMigration,
    /unique index[\s\S]*return_requests\s*\(order_item_id\)/i,
  );
  assert.match(
    returnEvidenceMigration,
    /return_request_id uuid[\s\S]*references public\.return_requests/i,
  );
  assert.match(
    returnEvidenceMigration,
    /captured_at[\s\S]*live_capture[\s\S]*v_intent\.created_at/i,
  );
  assert.match(
    returnEvidenceMigration,
    /begin_trusted_commerce_evidence_capture/i,
  );
  assert.match(
    returnEvidenceMigration,
    /begin_uploaded_commerce_evidence_capture/i,
  );
  assert.match(
    returnEvidenceMigration,
    /revoke execute on function public\.begin_commerce_evidence_capture[\s\S]*from authenticated/i,
  );
  assert.match(
    returnEvidenceMigration,
    /buyer_id = p_owner_id[\s\S]*status in \('submitted', 'under_review'\)/i,
  );
});

test("return evidence and scanner remain explicit UI flows", () => {
  const chatScreen = readFileSync(
    new URL("./ChatScreen.tsx", import.meta.url),
    "utf8",
  );
  const scanner = readFileSync(
    new URL("./DocumentScannerModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(chatScreen, /Add return evidence/i);
  assert.match(chatScreen, /evidence\.capturedAt[\s\S]*trustedCaptureLabel/i);
  assert.match(chatScreen, /Uploaded evidence · not a TRUE capture/i);
  assert.match(scanner, /Capture page/);
  assert.match(scanner, /Import image/);
  assert.match(scanner, /Crop edges/);
  assert.match(scanner, /Rotate/);
  assert.match(scanner, /Retake/);
  assert.match(scanner, /Confirm page/);
  assert.doesNotMatch(scanner, /edge detection[^\n]*enabled/i);
});

test("chat message loader keeps the newest page for busy conversations", () => {
  const repository = readFileSync(
    new URL("./supabaseChatRepository.ts", import.meta.url),
    "utf8",
  );
  const chatScreen = readFileSync(
    new URL("./ChatScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    repository,
    /order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)[\s\S]*\.limit\(200\)/,
  );
  assert.match(
    repository,
    /attachReactions\(\(\(data as MessageRow\[\] \| null\) \?\? \[\]\)\.reverse\(\)\)/,
  );
  assert.match(
    repository,
    /from\('conversations'\)[\s\S]*\.select\(CONVERSATION_SELECT\)[\s\S]*\.eq\('id', conversationId\)[\s\S]*\.maybeSingle\(\)/,
  );
  assert.match(repository, /async getConversation\(conversationId\)/);
  assert.match(
    repository,
    /if \(accessibleConversationId\) return accessibleConversationId/,
  );
  assert.match(
    chatScreen,
    /dataSource\s*\.getConversation\(initialConversationId\)/,
  );
  assert.match(chatScreen, /const sentMessage = await dataSource\.sendMessage/);
  assert.match(chatScreen, /onMessageSent\(sentMessage\)/);
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

  assert.match(
    chatScreen,
    /trusted:\s*Boolean\(conversation\.storefront\)\s*&&\s*attachment\.source === "camera_capture"/,
  );
  assert.match(
    chatScreen,
    /showTrustedCapture\s*\?\s*" · TRUE camera capture"\s*:\s*" · Camera capture"/,
  );
});

test("TRUE media is clean in the timeline and watermarked only inside the viewer", () => {
  const chatScreen = readFileSync(
    new URL("./ChatScreen.tsx", import.meta.url),
    "utf8",
  );
  const timeline = chatScreen.slice(
    chatScreen.indexOf("{message.attachment ? ("),
    chatScreen.indexOf("{message.location ? ("),
  );
  assert.doesNotMatch(timeline, /TrustedMediaOverlay/);
  assert.doesNotMatch(timeline, /trustedCaptureLabel/);
  assert.match(timeline, /onViewAttachment/);
  assert.match(chatScreen, /function ChatMediaViewer/);
  assert.match(
    chatScreen,
    /trustedLabel \? \(\s*<TrustedMediaOverlay\s+label=\{trustedLabel\}/,
  );
  assert.match(
    chatScreen,
    /trustedMediaOverlay:\s*\{\s*position: "absolute",\s*top: 10,\s*right: 10/,
  );
  assert.match(chatScreen, /fullscreenOptions=\{\{ enable: false \}\}/);
  assert.match(chatScreen, /source === "live_capture" && evidence\.capturedAt/);
});

test("message actions use long press and desktop context menu without a permanent reaction trigger", () => {
  const chatScreen = readFileSync(
    new URL("./ChatScreen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(chatScreen, /delayLongPress=\{350\}/);
  assert.match(chatScreen, /onContextMenu:[\s\S]*onLongPress\(\)/);
  assert.match(chatScreen, /<MessageActions[\s\S]*react=\{/);
  assert.doesNotMatch(chatScreen, /messageReactionTrigger/);
  assert.doesNotMatch(chatScreen, /React to received message/);
});

test("personal chat header opens contextual details while group actions stay local", () => {
  const chatScreen = readFileSync(
    new URL("./ChatScreen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    chatScreen,
    /conversation\.kind === "personal"[\s\S]*setContextDetail\(\{ kind: "chat", id: conversation\.id \}\)/,
  );
  assert.match(
    chatScreen,
    /<ChatContextDrawer[\s\S]*onOpenChatDetails\?\.\(detail\.id\)/,
  );
  assert.match(
    chatScreen,
    /conversation\.kind === "group"[\s\S]*setGroupMembersOpen\(true\)/,
  );
});

test("mobile chat keeps the supplied dark wallpaper, readable bubbles, and compact composer", () => {
  const chatScreen = readFileSync(
    new URL("./ChatScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    chatScreen,
    /DEFAULT_CHAT_WALLPAPER = require\("\.\.\/\.\.\/\.\.\/assets\/images\/chat-doodle-wallpaper\.webp"\)/,
  );
  assert.match(
    chatScreen,
    /wallpaperArea:\s*\{\s*flex: 1,\s*backgroundColor: "#050806"\s*\}/,
  );
  assert.match(chatScreen, /defaultWallpaperImage:\s*\{\s*opacity: 1\s*\}/);
  assert.match(chatScreen, /resizeMode=\{wallpaperImageUrl \? "cover" : "repeat"\}/);
  assert.match(chatScreen, /accessibilityLabel=\{segment === "personal" \? "Switch to Business chats" : "Switch to Personal chats"\}/);
  assert.match(chatScreen, /desktopSegmentedControl/);
  assert.match(
    chatScreen,
    /messagePressRow:\s*\{[\s\S]*?width: "100%",[\s\S]*?maxWidth: "100%"/,
  );
  assert.match(
    chatScreen,
    /message:\s*\{[\s\S]*?minWidth: 64,[\s\S]*?maxWidth: "78%",[\s\S]*?flexShrink: 1/,
  );
  assert.match(chatScreen, /mine:\s*\{\s*backgroundColor: "#087a55"\s*\}/);
  assert.match(chatScreen, /theirs:\s*\{\s*backgroundColor: "#222925"\s*\}/);
  assert.match(
    chatScreen,
    /composer:\s*\{[\s\S]*?paddingTop: 6,[\s\S]*?paddingBottom: 6/,
  );
  assert.match(
    chatScreen,
    /inputShell:\s*\{[\s\S]*?minHeight: 44,[\s\S]*?borderRadius: 22/,
  );
  assert.match(chatScreen, /sendButton:\s*\{\s*width: 44,\s*height: 44/);
});
