import type { ChatMessage } from "./types";

export type SharedChatLink = {
  messageId: string;
  url: string;
  createdAt: string;
};

const URL_PATTERN = /https?:\/\/[^\s<>()\[\]{}"']+/gi;
const TRAILING_URL_PUNCTUATION = /[.,!?;:“”‘’]+$/;

export type ChatTextSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string };

export function splitChatTextLinks(text: string): ChatTextSegment[] {
  const segments: ChatTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? cursor;
    if (start > cursor) segments.push({ kind: "text", value: text.slice(cursor, start) });

    const raw = match[0];
    const url = raw.replace(TRAILING_URL_PUNCTUATION, "");
    if (url) segments.push({ kind: "link", value: url });

    const punctuation = raw.slice(url.length);
    if (punctuation) segments.push({ kind: "text", value: punctuation });
    cursor = start + raw.length;
  }

  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments.length ? segments : [{ kind: "text", value: text }];
}

export function groupChatDetailsContent(messages: ChatMessage[]) {
  const media = messages.filter((message) =>
    message.attachment?.attachmentType === "image" ||
    message.attachment?.attachmentType === "video",
  );
  const files = messages.filter(
    (message) => message.attachment?.attachmentType === "document",
  );
  const links: SharedChatLink[] = [];
  const seenLinks = new Set<string>();

  messages.forEach((message) => {
    for (const segment of splitChatTextLinks(message.text)) {
      if (segment.kind !== "link") continue;
      const url = segment.value;
      if (seenLinks.has(url)) continue;
      seenLinks.add(url);
      links.push({ messageId: message.id, url, createdAt: message.createdAt });
    }
  });

  return { media, files, links };
}

export function searchConversationMessages(messages: ChatMessage[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return messages.filter((message) =>
    [message.text, message.attachment?.filename]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(normalized)),
  );
}
