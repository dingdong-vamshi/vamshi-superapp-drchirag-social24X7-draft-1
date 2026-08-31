import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage } from "./types.ts";
import { groupChatDetailsContent, searchConversationMessages, splitChatTextLinks } from "./chatDetailsUtils.ts";

const message = (input: Partial<ChatMessage> & Pick<ChatMessage, "id" | "text">): ChatMessage => ({
  conversationId: "conversation",
  senderId: "sender",
  createdAt: "2026-08-25T10:00:00.000Z",
  status: "read",
  ...input,
});

test("groups real media, document and unique links from authoritative messages", () => {
  const result = groupChatDetailsContent([
    message({ id: "image", text: "photo", attachment: { id: "a", attachmentType: "image", filename: "photo.jpg", mimeType: "image/jpeg", bytes: 10, source: "gallery" } }),
    message({ id: "file", text: "Read https://social24.example/help.", attachment: { id: "b", attachmentType: "document", filename: "brief.pdf", mimeType: "application/pdf", bytes: 20, source: "document_picker" } }),
    message({ id: "duplicate", text: "Again https://social24.example/help" }),
  ]);

  assert.deepEqual(result.media.map((item) => item.id), ["image"]);
  assert.deepEqual(result.files.map((item) => item.id), ["file"]);
  assert.deepEqual(result.links.map((item) => item.url), ["https://social24.example/help"]);
});

test("searches message body and real attachment filename", () => {
  const messages = [
    message({ id: "one", text: "Hi" }),
    message({ id: "two", text: "Document attached", attachment: { id: "c", attachmentType: "document", filename: "Quarterly-Brief.pdf", mimeType: "application/pdf", bytes: 20, source: "document_picker" } }),
  ];
  assert.deepEqual(searchConversationMessages(messages, "quarterly").map((item) => item.id), ["two"]);
  assert.deepEqual(searchConversationMessages(messages, "hi").map((item) => item.id), ["one"]);
});

test("splits only safe http(s) links and preserves surrounding punctuation", () => {
  assert.deepEqual(splitChatTextLinks("Open https://social24.example/help, then http://localhost:8081/chats. javascript:alert(1)"), [
    { kind: "text", value: "Open " },
    { kind: "link", value: "https://social24.example/help" },
    { kind: "text", value: "," },
    { kind: "text", value: " then " },
    { kind: "link", value: "http://localhost:8081/chats" },
    { kind: "text", value: "." },
    { kind: "text", value: " javascript:alert(1)" },
  ]);
});

test("preserves Affiliate Link query parameters exactly", () => {
  const affiliateUrl = "http://localhost:8081/store/arjun-qa-store/product/arjun-direct-publish-test?ref=5f3cc463e05d4a";
  assert.deepEqual(splitChatTextLinks(`[QA] ${affiliateUrl}`), [
    { kind: "text", value: "[QA] " },
    { kind: "link", value: affiliateUrl },
  ]);
});

test("keeps smart reply quotes outside safe links", () => {
  assert.deepEqual(splitChatTextLinks('↪ “https://social24.example/reply”'), [
    { kind: "text", value: "↪ “" },
    { kind: "link", value: "https://social24.example/reply" },
    { kind: "text", value: "”" },
  ]);
});
