import type {
  AiAssistantProvider,
  AssistantInput,
  AssistantPlan,
  AssistantResponse,
  AssistantSummary,
} from "./types.ts";
import { timeClarificationForRequest } from "./time.ts";

const cleanSentence = (value: string) => {
  const trimmed = value.trim().replace(/^['“”]|['“”]$/g, "");
  if (!trimmed) return "Would you be able to connect with me?";
  const sentence = trimmed[0].toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
};

const extractRecipient = (request: string) => {
  const patterns = [
    /\bwhat did\s+@?([\p{L}\p{N}._-]+)\b/iu,
    /\b(?:message|tell|ask)\s+@?([\p{L}\p{N}._-]+)/iu,
    /\btelling\s+@?([\p{L}\p{N}._-]+)/iu,
    /\b(?:reply\s+to|write\s+(?:a\s+)?reply\s+to)\s+@?([\p{L}\p{N}._-]+)/iu,
    /\bto\s+@?([\p{L}\p{N}._-]+)\b/iu,
  ];
  for (const pattern of patterns) {
    const match = request.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
};

const extractDraft = (request: string) => {
  const ask = request.match(/\band\s+ask(?:\s+(?:him|her|them))?\s+(.+)$/i);
  if (ask?.[1]) {
    const body = ask[1].replace(/\?$/, "").trim();
    if (/can connect|can he connect|can she connect|able to connect/i.test(body)) {
      return "Will you be able to connect with me?";
    }
    return cleanSentence(body.endsWith("?") ? body : `${body}?`);
  }
  const telling = request.match(/\b(?:telling|tell)\s+@?[\p{L}\p{N}._-]+\s+(.+)$/iu);
  if (telling?.[1]) return cleanSentence(telling[1]);
  const reply = request.match(/\b(?:write\s+)?(?:a\s+)?reply(?:\s+to\s+@?[\p{L}\p{N}._-]+)?(?:\s+(?:saying|that))?\s+(.+)$/iu)
    ?? request.match(/\bdraft(?:\s+(?:a\s+)?reply)?(?:\s+to\s+@?[\p{L}\p{N}._-]+)?(?:\s+(?:saying|that))?\s+(.+)$/iu);
  if (reply?.[1]) return cleanSentence(reply[1]);
  return "Would you be able to connect with me?";
};

export class FakeAiAssistantProvider implements AiAssistantProvider {
  readonly id = "fake-v1";

  async planAction(input: AssistantInput): Promise<AssistantPlan> {
    const request = input.request.trim();
    const lower = request.toLocaleLowerCase();
    const recipientQuery = extractRecipient(request);

    if (/\bcancel\b/.test(lower) && /\b(?:scheduled|schedule|message)\b/.test(lower)) {
      return { kind: "cancel_scheduled_message", recipientQuery, timeExpression: request };
    }
    if (/\b(?:what|which|list|show)\b/.test(lower) && /\bscheduled\b/.test(lower)) {
      return { kind: "list_scheduled_messages" };
    }
    if (/\b(?:summari[sz]e|summary)\b/.test(lower)) {
      return { kind: "summarize_conversation", recipientQuery };
    }
    if (/\bwhat did\b/.test(lower) || /\blast ask/.test(lower) || /\bdiscuss(?:ed)?\b/.test(lower)) {
      const about = request.match(/\babout\s+(.+)$/i)?.[1];
      return { kind: "context_question", recipientQuery, searchQuery: about?.trim() };
    }
    const scheduled = /\b(?:at\s+\d|tomorrow|in\s+\d+\s+minutes?|evening|morning|afternoon)\b/i.test(request);
    if (scheduled && /\b(?:message|tell|ask|send)\b/.test(lower)) {
      const clarification = timeClarificationForRequest(request);
      if (clarification) return { kind: "clarification", clarification };
      return {
        kind: "schedule_message",
        recipientQuery,
        draft: extractDraft(request),
        timeExpression: request,
      };
    }
    if (/\b(?:draft|write a reply|write reply)\b/.test(lower)) {
      return { kind: "draft_message", recipientQuery, draft: extractDraft(request) };
    }
    if (/\b(?:message|tell|ask|send)\b/.test(lower)) {
      return { kind: "send_message_now", recipientQuery, draft: extractDraft(request) };
    }
    return { kind: "respond" };
  }

  async respond(input: AssistantInput, plan: AssistantPlan): Promise<AssistantResponse> {
    if (plan.kind === "clarification") {
      return { text: plan.clarification ?? "Could you clarify what you want me to do?" };
    }
    if (plan.kind === "context_question") {
      const messages = plan.searchQuery && input.context.olderMessages.length
        ? input.context.olderMessages
        : [...input.context.olderMessages, ...input.context.recentMessages];
      const counterpartMessage = [...messages].reverse().find((message) => !message.isMine);
      if (!counterpartMessage) return { text: "I could not find an accessible message that answers that yet." };
      const counterpart = input.context.counterpartName ?? counterpartMessage.senderName;
      return { text: `${counterpart} last asked: “${counterpartMessage.body}”` };
    }
    if (plan.kind === "respond") {
      return { text: "I can help with Personal Chat context, drafts, sending, scheduling, and schedule cancellation." };
    }
    return { text: "I prepared this using the authorized Personal Chat context." };
  }

  async summarize(input: AssistantInput): Promise<AssistantSummary> {
    const messages = input.context.recentMessages.slice(-8);
    const lines = messages.map((message) => `${message.senderName}: ${message.body}`);
    return {
      text: lines.length ? `Recent discussion:\n${lines.map((line) => `• ${line}`).join("\n")}` : "No accessible text messages are available to summarize.",
      messageCount: messages.length,
      lastMessageId: messages.at(-1)?.id ?? null,
      modelVersion: this.id,
    };
  }
}
