export type AssistantMessageContext = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

export type AssistantSummary = {
  text: string;
  messageCount: number;
  lastMessageId: string | null;
  modelVersion: string;
};

export type AssistantContext = {
  currentUserId: string;
  currentUserName: string;
  conversationId: string | null;
  counterpartName: string | null;
  summary: string | null;
  recentMessages: AssistantMessageContext[];
  olderMessages: AssistantMessageContext[];
  pendingAction: Record<string, unknown> | null;
};

export type AssistantPlanKind =
  | "respond"
  | "context_question"
  | "summarize_conversation"
  | "draft_message"
  | "send_message_now"
  | "schedule_message"
  | "list_scheduled_messages"
  | "cancel_scheduled_message"
  | "clarification";

export type AssistantPlan = {
  kind: AssistantPlanKind;
  recipientQuery?: string;
  draft?: string;
  timeExpression?: string;
  searchQuery?: string;
  clarification?: string;
};

export type AssistantInput = {
  request: string;
  now: string;
  timezone: string;
  context: AssistantContext;
  serializedContext: string;
};

export type AssistantResponse = {
  text: string;
};

export interface AiAssistantProvider {
  readonly id: string;
  planAction(input: AssistantInput): Promise<AssistantPlan>;
  respond(input: AssistantInput, plan: AssistantPlan): Promise<AssistantResponse>;
  summarize(input: AssistantInput): Promise<AssistantSummary>;
}

export type ScheduleResolution =
  | { status: "resolved"; sendAt: string; timezone: string; localLabel: string }
  | {
      status: "clarification";
      message: string;
      reason?:
        | "missing_time"
        | "ambiguous_time"
        | "invalid_time"
        | "past_time"
        | "too_soon"
        | "invalid_timezone";
      clockLabel?: string;
      tomorrowSendAt?: string;
      timezone?: string;
    };
