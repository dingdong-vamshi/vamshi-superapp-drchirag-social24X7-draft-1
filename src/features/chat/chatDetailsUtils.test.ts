import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage } from "./types.ts";
import { groupChatDetailsContent, searchConversationMessages } from "./chatDetailsUtils.ts";

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
