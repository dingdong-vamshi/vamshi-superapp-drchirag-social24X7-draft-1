export type AssistantThread = {
  id: string;
  owner_user_id: string;
  scoped_conversation_id: string | null;
  title: string;
};

export type AssistantEntry = {
  id: string;
  thread_id: string;
  conversation_id: string | null;
  role: "user" | "assistant" | "system";
  entry_type: "message" | "answer" | "summary" | "action" | "status" | "clarification" | "error" | "schedule_list";
  display_text: string;
  action_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AssistantAction = {
  id: string;
  thread_id: string;
  action_type: "send_message_now" | "schedule_message" | "cancel_scheduled_message";
  target_user_id: string | null;
  conversation_id: string | null;
  validated_arguments: {
    body?: string;
    recipient_label?: string;
    send_at?: string;
    timezone?: string;
    local_label?: string;
    schedule_id?: string;
    draft_only?: boolean;
  };
  confirmation_status: "pending" | "confirmed" | "cancelled";
  status: "proposed" | "executing" | "completed" | "failed" | "cancelled";
  result: {
    message_id?: string;
    schedule_id?: string;
    status?: string;
    schedule_status?: "sent" | "failed" | "cancelled";
    error?: string;
  };
  error: string | null;
  created_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
  updated_at: string;
};

export type AssistantSchedule = {
  schedule_id: string;
  conversation_id: string;
  target_user_id: string;
  target_display_name: string;
  target_username: string;
  body: string;
  send_at: string;
  timezone: string;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  source: "user" | "ai_assistant";
  assistant_action_id: string | null;
};

export type AssistantState = {
  thread: AssistantThread;
  entries: AssistantEntry[];
  actions: AssistantAction[];
  schedules: AssistantSchedule[];
  provider: string;
};

export type AssistantRequest = {
  operation: "bootstrap" | "command" | "confirm" | "cancel_action" | "edit_action" | "propose_cancel_schedule" | "resolve_pending_intent";
  threadId?: string;
  conversationId?: string;
  message?: string;
  timezone?: string;
  actionId?: string;
  scheduleId?: string;
  editedBody?: string;
  editedSendAt?: string;
  entryId?: string;
  pendingChoice?: "tomorrow" | "choose_another" | "cancel";
};
