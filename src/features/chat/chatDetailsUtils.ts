import type { ChatMessage } from "./types";

export type SharedChatLink = {
  messageId: string;
  url: string;
  createdAt: string;
};

const URL_PATTERN = /https?:\/\/[^\s<>()\[\]{}"']+/gi;

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
    for (const raw of message.text.match(URL_PATTERN) ?? []) {
      const url = raw.replace(/[.,!?;:]+$/, "");
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
