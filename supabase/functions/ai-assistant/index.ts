import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";

import { composeAssistantContext, shouldRefreshSummary } from "../_shared/ai-assistant/context.ts";
import { FakeAiAssistantProvider } from "../_shared/ai-assistant/fake-provider.ts";
import {
  SinoRouterProviderError,
  SinoRouterQwenProvider,
} from "../_shared/ai-assistant/provider.ts";
import {
  mergePendingTimeReply,
  parseDeterministicScheduleIntent,
  type ParsedScheduleIntent,
} from "../_shared/ai-assistant/schedule-intent.ts";
import { canonicalizeTimeZone, resolveScheduleTime } from "../_shared/ai-assistant/time.ts";
import type {
  AiAssistantProvider,
  AssistantContext,
  AssistantInput,
  AssistantMessageContext,
  AssistantPlan,
} from "../_shared/ai-assistant/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type ThreadRow = {
  id: string;
  owner_user_id: string;
  scoped_conversation_id: string | null;
  title: string;
};

type ContactRow = {
  user_id: string;
  conversation_id: string;
  display_name: string;
  username: string;
};

type MessageRow = {
  message_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type SummaryRow = {
  owner_user_id: string;
  conversation_id: string;
  summary: string;
  last_summarized_message_id: string | null;
  summarized_message_count: number;
  model_version: string;
  summary_version: number;
} | null;

type ScheduleRow = {
  schedule_id: string;
  conversation_id: string;
  target_user_id: string;
  target_display_name: string;
  target_username: string;
  body: string;
  send_at: string;
  timezone: string;
  status: string;
  source: string;
  assistant_action_id: string | null;
};

type RequestBody = {
  operation?: "bootstrap" | "command" | "confirm" | "cancel_action" | "edit_action" | "propose_cancel_schedule" | "resolve_pending_intent";
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

type PendingScheduleIntent = ParsedScheduleIntent & {
  version: 1;
  timezone: string;
  recipientLabel: string;
  recipientUsername: string;
  targetUserId: string;
  conversationId: string;
  missingFields: string[];
  clockLabel?: string;
  tomorrowSendAt?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parsePendingScheduleIntent = (value: unknown): PendingScheduleIntent | null => {
  if (!isRecord(value) || value.version !== 1 || value.kind !== undefined) return null;
  const required = [
    "recipientQuery",
    "draft",
    "timeExpression",
    "timezone",
    "recipientLabel",
    "recipientUsername",
    "targetUserId",
    "conversationId",
  ];
  if (required.some((key) => typeof value[key] !== "string" || !String(value[key]).trim())) return null;
  if (!Array.isArray(value.missingFields) || value.missingFields.some((field) => typeof field !== "string")) return null;
  return value as unknown as PendingScheduleIntent;
};

const rpcOne = async <T>(
  client: SupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data as T;
};

const rpcMany = async <T>(
  client: SupabaseClient,
  name: string,
  parameters: Record<string, unknown>,
): Promise<T[]> => {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
};

const getProvider = (): AiAssistantProvider => {
  const selected = (Deno.env.get("AI_ASSISTANT_PROVIDER") ?? "fake").toLocaleLowerCase();
  if (selected === "sinorouter") {
    return new SinoRouterQwenProvider({
      apiKey: Deno.env.get("SINOROUTER_API_KEY"),
      baseUrl: Deno.env.get("SINOROUTER_BASE_URL"),
      model: Deno.env.get("SINOROUTER_MODEL"),
    });
  }
  return new FakeAiAssistantProvider();
};

const getOrCreateThread = (client: SupabaseClient, conversationId?: string | null) =>
  rpcOne<ThreadRow>(client, "ai_get_or_create_thread", {
    target_conversation: conversationId ?? null,
  });

const appendEntry = (
  client: SupabaseClient,
  input: {
    threadId: string;
    role: "user" | "assistant" | "system";
    entryType: string;
    displayText: string;
    conversationId?: string | null;
    actionId?: string | null;
    metadata?: Record<string, unknown>;
  },
) =>
  rpcOne(client, "ai_append_entry", {
    target_thread: input.threadId,
    target_role: input.role,
    target_entry_type: input.entryType,
    target_display_text: input.displayText,
    target_conversation: input.conversationId ?? null,
    target_action: input.actionId ?? null,
    target_metadata: input.metadata ?? {},
  });

const searchContacts = (client: SupabaseClient, query: string) =>
  rpcMany<ContactRow>(client, "ai_search_personal_contacts", {
    target_query: query,
    target_limit: 8,
  });

const listSchedules = (client: SupabaseClient, status: string | null = "pending") =>
  rpcMany<ScheduleRow>(client, "ai_list_scheduled_messages", {
    target_status: status,
    target_from: null,
    target_to: null,
    target_limit: 100,
  });

const getState = async (client: SupabaseClient, thread: ThreadRow) => {
  const [entriesResult, actionsResult, schedules] = await Promise.all([
    client
      .from("ai_assistant_entries")
      .select("id,thread_id,conversation_id,role,entry_type,display_text,action_id,metadata,created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("ai_assistant_actions")
      .select("id,thread_id,action_type,target_user_id,conversation_id,validated_arguments,confirmation_status,status,result,error,created_at,confirmed_at,executed_at,updated_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .limit(60),
    listSchedules(client),
  ]);
  if (entriesResult.error) throw new Error(entriesResult.error.message);
  if (actionsResult.error) throw new Error(actionsResult.error.message);
  return {
    thread,
    entries: [...(entriesResult.data ?? [])].reverse(),
    actions: [...(actionsResult.data ?? [])].reverse(),
    schedules,
    provider: getProvider().id,
  };
};

const resolveScopedContact = async (
  client: SupabaseClient,
  conversationId: string,
) => {
  const contacts = await searchContacts(client, "");
  return contacts.find((contact) => contact.conversation_id === conversationId) ?? null;
};

const resolveContact = async (
  client: SupabaseClient,
  plan: AssistantPlan,
  scopedConversationId?: string | null,
) => {
  const scoped = scopedConversationId
    ? await resolveScopedContact(client, scopedConversationId)
    : null;
  if (scopedConversationId && !scoped) {
    return { kind: "denied" as const, message: "This Assistant scope is not an authorized Personal Chat." };
  }
  if (scoped && !plan.recipientQuery) return { kind: "resolved" as const, contact: scoped };
  if (scoped && plan.recipientQuery) {
    const requested = plan.recipientQuery.toLocaleLowerCase().replace(/^@/, "");
    const scopedNames = [scoped.display_name, scoped.username].map((value) => value.toLocaleLowerCase());
    const requestedTokens = requested.split(/[^a-z0-9_]+/).filter((value) => value.length >= 3);
    if (scopedNames.some((value) =>
      value.includes(requested) ||
      requested.includes(value) ||
      requestedTokens.some((token) => value.includes(token) || token.includes(value))
    )) {
      return { kind: "resolved" as const, contact: scoped };
    }
    const matchingContacts = await searchContacts(client, plan.recipientQuery);
    if (matchingContacts.some((contact) =>
      contact.user_id === scoped.user_id &&
      contact.conversation_id === scoped.conversation_id
    )) {
      return { kind: "resolved" as const, contact: scoped };
    }
    return {
      kind: "denied" as const,
      message: `This Assistant is scoped to ${scoped.display_name}. Open the global Assistant to choose another recipient.`,
    };
  }
  if (!plan.recipientQuery) {
    return { kind: "denied" as const, message: "Who should I help you message?" };
  }
  const contacts = await searchContacts(client, plan.recipientQuery);
  if (!contacts.length) {
    return { kind: "denied" as const, message: `I could not find an accepted Personal Chat contact matching “${plan.recipientQuery}”.` };
  }
  if (contacts.length > 1) {
    return { kind: "ambiguous" as const, contacts };
  }
  return { kind: "resolved" as const, contact: contacts[0] };
};

const toContextMessages = (
  rows: MessageRow[],
  currentUserId: string,
  currentUserName: string,
  counterpartName: string,
): AssistantMessageContext[] =>
  rows.map((row) => ({
    id: row.message_id,
    senderId: row.sender_id,
    senderName: row.sender_id === currentUserId ? currentUserName : counterpartName,
    body: row.body,
    createdAt: row.created_at,
    isMine: row.sender_id === currentUserId,
  }));

const buildContext = async (input: {
  client: SupabaseClient;
  userId: string;
  userName: string;
  contact: ContactRow;
  searchQuery?: string;
  pendingAction?: Record<string, unknown> | null;
}) => {
  const [recentRows, summary, olderRows] = await Promise.all([
    rpcMany<MessageRow>(input.client, "ai_get_recent_chat_context", {
      target_conversation: input.contact.conversation_id,
      target_limit: 30,
      target_character_limit: 16_000,
    }),
    rpcOne<SummaryRow>(input.client, "ai_get_conversation_summary", {
      target_conversation: input.contact.conversation_id,
    }),
    input.searchQuery
      ? rpcMany<MessageRow>(input.client, "ai_search_older_chat_messages", {
          target_conversation: input.contact.conversation_id,
          target_query: input.searchQuery,
          target_limit: 8,
          target_character_limit: 4_800,
        })
      : Promise.resolve([]),
  ]);
  const context: AssistantContext = {
    currentUserId: input.userId,
    currentUserName: input.userName,
    conversationId: input.contact.conversation_id,
    counterpartName: input.contact.display_name,
    summary: summary?.summary ?? null,
    recentMessages: toContextMessages(
      recentRows,
      input.userId,
      input.userName,
      input.contact.display_name,
    ),
    olderMessages: toContextMessages(
      olderRows,
      input.userId,
      input.userName,
      input.contact.display_name,
    ),
    pendingAction: input.pendingAction ?? null,
  };
  return { context, summary };
};

const storeSummary = async (
  client: SupabaseClient,
  conversationId: string,
  summary: { text: string; messageCount: number; lastMessageId: string | null; modelVersion: string },
  previousVersion = 0,
) =>
  rpcOne(client, "ai_upsert_conversation_summary", {
    target_conversation: conversationId,
    target_summary: summary.text,
    target_last_message: summary.lastMessageId,
    target_message_count: summary.messageCount,
    target_model_version: summary.modelVersion,
    target_summary_version: Math.max(previousVersion + 1, 1),
  });

const createAction = async (
  client: SupabaseClient,
  input: {
    thread: ThreadRow;
    actionType: "send_message_now" | "schedule_message" | "cancel_scheduled_message";
    contact: ContactRow;
    arguments: Record<string, unknown>;
  },
) => {
  const action = await rpcOne<Record<string, unknown>>(client, "ai_create_action", {
    target_thread: input.thread.id,
    target_action_type: input.actionType,
    target_user: input.contact.user_id,
    target_conversation: input.contact.conversation_id,
    target_arguments: input.arguments,
    target_idempotency_key: crypto.randomUUID(),
  });
  const actionId = String(action.id);
  const verb = input.actionType === "schedule_message" ? "Schedule for" : input.actionType === "cancel_scheduled_message" ? "Cancel schedule for" : "Send to";
  await appendEntry(client, {
    threadId: input.thread.id,
    role: "assistant",
    entryType: "action",
    displayText: `${verb} ${input.contact.display_name}`,
    conversationId: input.contact.conversation_id,
    actionId,
    metadata: { action_type: input.actionType },
  });
  return action;
};

const pendingContact = (pending: PendingScheduleIntent): ContactRow => ({
  user_id: pending.targetUserId,
  conversation_id: pending.conversationId,
  display_name: pending.recipientLabel,
  username: pending.recipientUsername,
});

const appendScheduleClarification = (
  client: SupabaseClient,
  thread: ThreadRow,
  contact: ContactRow,
  intent: ParsedScheduleIntent,
  timezone: string,
  resolution: Extract<ReturnType<typeof resolveScheduleTime>, { status: "clarification" }>,
) => {
  const pending: PendingScheduleIntent = {
    ...intent,
    version: 1,
    timezone,
    recipientQuery: contact.username,
    recipientLabel: contact.display_name,
    recipientUsername: contact.username,
    targetUserId: contact.user_id,
    conversationId: contact.conversation_id,
    missingFields: resolution.reason === "ambiguous_time" ? ["meridiem"] : ["scheduledLocalTime"],
    clockLabel: resolution.clockLabel,
    tomorrowSendAt: resolution.tomorrowSendAt,
  };
  return appendEntry(client, {
    threadId: thread.id,
    role: "assistant",
    entryType: "clarification",
    displayText: resolution.message,
    conversationId: contact.conversation_id,
    metadata: {
      pending_intent: pending,
      past_time_offer: resolution.reason === "past_time",
    },
  });
};

const latestPendingScheduleIntent = async (
  client: SupabaseClient,
  threadId: string,
) => {
  const { data, error } = await client
    .from("ai_assistant_entries")
    .select("id,metadata")
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const pending = parsePendingScheduleIntent(data?.metadata?.pending_intent);
  return pending ? { entryId: String(data.id), pending } : null;
};

const filterCancellationCandidates = (
  schedules: ScheduleRow[],
  contact: ContactRow | null,
  expression: string,
) => {
  let candidates = contact
    ? schedules.filter((schedule) => schedule.conversation_id === contact.conversation_id)
    : schedules;
  const clock = expression.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (clock) {
    let hour = Number(clock[1]) % 12;
    if (clock[3].toLocaleLowerCase().startsWith("p")) hour += 12;
    const minute = Number(clock[2] ?? 0);
    candidates = candidates.filter((schedule) => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: schedule.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(schedule.send_at));
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return Number(values.hour) === hour && Number(values.minute) === minute;
    });
  }
  return candidates;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!url || !key) return json({ error: "Assistant server configuration is unavailable." }, 503);
    const client = createClient(url, key, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice("Bearer ".length);
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Authentication required." }, 401);
    const user = authData.user;
    const body = (await request.json()) as RequestBody;
    const operation = body.operation ?? "bootstrap";
    let timezone: string;
    try {
      timezone = canonicalizeTimeZone(body.timezone);
    } catch {
      return json({ error: "Choose a valid city timezone." }, 400);
    }
    const provider = getProvider();

    const thread = body.threadId
      ? await rpcOne<ThreadRow>(client, "ai_get_or_create_thread", {
          target_conversation: body.conversationId ?? null,
        }).then((resolved) => {
          if (resolved.id !== body.threadId) throw new Error("Assistant thread scope changed. Please reopen the Assistant.");
          return resolved;
        })
      : await getOrCreateThread(client, body.conversationId ?? null);

    if (operation === "bootstrap") return json(await getState(client, thread));

    if (operation === "confirm") {
      if (!body.actionId) throw new Error("Choose an Assistant action to confirm.");
      await rpcOne<Record<string, unknown>>(client, "ai_execute_action", { target_action: body.actionId });
      return json(await getState(client, thread));
    }

    if (operation === "cancel_action") {
      if (!body.actionId) throw new Error("Choose an Assistant action to cancel.");
      await rpcOne<Record<string, unknown>>(client, "ai_cancel_action", { target_action: body.actionId });
      return json(await getState(client, thread));
    }

    if (operation === "edit_action") {
      if (!body.actionId) throw new Error("Choose an Assistant action to edit.");
      await rpcOne(client, "ai_edit_action", {
        target_action: body.actionId,
        target_body: body.editedBody ?? null,
        target_send_at: body.editedSendAt ?? null,
        target_timezone: body.timezone ?? null,
      });
      return json(await getState(client, thread));
    }

    if (operation === "propose_cancel_schedule") {
      if (!body.scheduleId) throw new Error("Choose a scheduled message to cancel.");
      const schedules = await listSchedules(client);
      const schedule = schedules.find((candidate) => candidate.schedule_id === body.scheduleId);
      if (!schedule) throw new Error("Pending scheduled message was not found.");
      const contact: ContactRow = {
        user_id: schedule.target_user_id,
        conversation_id: schedule.conversation_id,
        display_name: schedule.target_display_name,
        username: schedule.target_username,
      };
      await createAction(client, {
        thread,
        actionType: "cancel_scheduled_message",
        contact,
        arguments: { schedule_id: schedule.schedule_id, body: schedule.body, send_at: schedule.send_at, timezone: schedule.timezone },
      });
      return json(await getState(client, thread));
    }

    if (operation === "resolve_pending_intent") {
      if (!body.entryId || !body.pendingChoice) throw new Error("Choose a pending scheduling option.");
      const currentPending = await latestPendingScheduleIntent(client, thread.id);
      if (!currentPending || currentPending.entryId !== body.entryId) {
        throw new Error("Pending scheduling request was not found.");
      }
      const pending = currentPending.pending;
      if (body.pendingChoice === "cancel") {
        await appendEntry(client, {
          threadId: thread.id,
          role: "assistant",
          entryType: "status",
          displayText: "Scheduling cancelled. Nothing was scheduled.",
          conversationId: pending.conversationId,
        });
      } else if (body.pendingChoice === "choose_another") {
        await appendEntry(client, {
          threadId: thread.id,
          role: "assistant",
          entryType: "clarification",
          displayText: "What new date and time should I use?",
          conversationId: pending.conversationId,
          metadata: { pending_intent: { ...pending, missingFields: ["scheduledLocalTime"], tomorrowSendAt: undefined }, past_time_offer: false },
        });
      } else {
        if (!pending.tomorrowSendAt) throw new Error("Tomorrow suggestion is no longer available.");
        await createAction(client, {
          thread,
          actionType: "schedule_message",
          contact: pendingContact(pending),
          arguments: {
            body: pending.draft,
            send_at: pending.tomorrowSendAt,
            timezone: pending.timezone,
            local_label: pending.clockLabel,
            recipient_label: pending.recipientLabel,
          },
        });
      }
      return json(await getState(client, thread));
    }

    const command = body.message?.trim() ?? "";
    if (!command || command.length > 2_000) throw new Error("Enter an Assistant request up to 2000 characters.");
    const requestLimit = Math.min(Math.max(Number(Deno.env.get("AI_ASSISTANT_REQUESTS_PER_MINUTE") ?? 12), 3), 60);
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error: countError } = await client
      .from("ai_assistant_entries")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id)
      .eq("role", "user")
      .gte("created_at", since);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= requestLimit) return json({ error: "Assistant rate limit reached. Please wait a minute." }, 429);

    const existingPending = await latestPendingScheduleIntent(client, thread.id);
    await appendEntry(client, {
      threadId: thread.id,
      role: "user",
      entryType: "message",
      displayText: command,
      conversationId: thread.scoped_conversation_id,
    });

    const processScheduleIntent = async (intent: ParsedScheduleIntent, knownContact?: ContactRow) => {
      const resolution = knownContact
        ? { kind: "resolved" as const, contact: knownContact }
        : await resolveContact(client, {
            kind: "schedule_message",
            recipientQuery: intent.recipientQuery,
            draft: intent.draft,
            timeExpression: intent.timeExpression,
          }, thread.scoped_conversation_id);
      if (resolution.kind === "denied") {
        await appendEntry(client, { threadId: thread.id, role: "assistant", entryType: "clarification", displayText: resolution.message, conversationId: thread.scoped_conversation_id });
        return;
      }
      if (resolution.kind === "ambiguous") {
        await appendEntry(client, {
          threadId: thread.id,
          role: "assistant",
          entryType: "clarification",
          displayText: "I found more than one matching Personal Chat contact. Please use the exact username.",
          metadata: { contacts: resolution.contacts },
        });
        return;
      }
      const schedule = resolveScheduleTime({ expression: intent.timeExpression, now: new Date().toISOString(), timezone });
      if (schedule.status === "clarification") {
        await appendScheduleClarification(client, thread, resolution.contact, intent, timezone, schedule);
        return;
      }
      await createAction(client, {
        thread,
        actionType: "schedule_message",
        contact: resolution.contact,
        arguments: {
          body: intent.draft,
          send_at: schedule.sendAt,
          timezone: schedule.timezone,
          local_label: schedule.localLabel,
          recipient_label: resolution.contact.display_name,
        },
      });
    };

    const deterministicSchedule = parseDeterministicScheduleIntent(command);
    if (deterministicSchedule) {
      await processScheduleIntent(deterministicSchedule);
      return json(await getState(client, thread));
    }

    if (existingPending) {
      const mergedTime = mergePendingTimeReply(existingPending.pending.timeExpression, command);
      if (!mergedTime) {
        await appendEntry(client, {
          threadId: thread.id,
          role: "assistant",
          entryType: "clarification",
          displayText: existingPending.pending.missingFields.includes("meridiem")
            ? `Please answer AM or PM for ${existingPending.pending.clockLabel ?? existingPending.pending.timeExpression}.`
            : "Please provide a new date and time.",
          conversationId: existingPending.pending.conversationId,
          metadata: { pending_intent: existingPending.pending },
        });
      } else {
        await processScheduleIntent(
          { ...existingPending.pending, timeExpression: mergedTime },
          pendingContact(existingPending.pending),
        );
      }
      return json(await getState(client, thread));
    }
    const emptyContext: AssistantContext = {
      currentUserId: user.id,
      currentUserName: String(user.user_metadata?.name ?? user.user_metadata?.display_name ?? "You"),
      conversationId: thread.scoped_conversation_id,
      counterpartName: null,
      summary: null,
      recentMessages: [],
      olderMessages: [],
      pendingAction: null,
    };
    const baseInput: AssistantInput = {
      request: command,
      now: new Date().toISOString(),
      timezone,
      context: emptyContext,
      serializedContext: composeAssistantContext(emptyContext, command).serialized,
    };
    const plan = await provider.planAction(baseInput);

    if (plan.kind === "clarification") {
      const response = await provider.respond(baseInput, plan);
      await appendEntry(client, { threadId: thread.id, role: "assistant", entryType: "clarification", displayText: response.text, conversationId: thread.scoped_conversation_id });
      return json(await getState(client, thread));
    }

    if (plan.kind === "list_scheduled_messages") {
      let schedules = await listSchedules(client);
      if (/\btoday\b/i.test(command)) {
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        schedules = schedules.filter((schedule) =>
          new Intl.DateTimeFormat("en-CA", { timeZone: schedule.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(schedule.send_at)) === today
        );
      }
      await appendEntry(client, {
        threadId: thread.id,
        role: "assistant",
        entryType: "schedule_list",
        displayText: schedules.length ? `${schedules.length} upcoming scheduled message${schedules.length === 1 ? "" : "s"}.` : "You have no matching pending scheduled messages.",
        metadata: { schedules },
      });
      return json(await getState(client, thread));
    }

    const needsContact = plan.kind !== "respond";
    const resolution = needsContact
      ? await resolveContact(client, plan, thread.scoped_conversation_id)
      : null;
    if (resolution?.kind === "denied") {
      await appendEntry(client, { threadId: thread.id, role: "assistant", entryType: "clarification", displayText: resolution.message, conversationId: thread.scoped_conversation_id });
      return json(await getState(client, thread));
    }
    if (resolution?.kind === "ambiguous") {
      await appendEntry(client, {
        threadId: thread.id,
        role: "assistant",
        entryType: "clarification",
        displayText: "I found more than one matching Personal Chat contact. Please use the exact username.",
        metadata: { contacts: resolution.contacts },
      });
      return json(await getState(client, thread));
    }
    const contact = resolution?.kind === "resolved" ? resolution.contact : null;

    if (plan.kind === "cancel_scheduled_message") {
      const schedules = await listSchedules(client);
      const candidates = filterCancellationCandidates(schedules, contact, plan.timeExpression ?? command);
      if (!candidates.length) {
        await appendEntry(client, { threadId: thread.id, role: "assistant", entryType: "answer", displayText: "I could not find a matching pending scheduled message.", conversationId: contact?.conversation_id ?? null });
      } else if (candidates.length > 1) {
        await appendEntry(client, { threadId: thread.id, role: "assistant", entryType: "clarification", displayText: "I found multiple matching schedules. Choose the one you want to cancel.", conversationId: contact?.conversation_id ?? null, metadata: { schedules: candidates } });
      } else {
        const schedule = candidates[0];
        const resolvedContact: ContactRow = contact ?? {
          user_id: schedule.target_user_id,
          conversation_id: schedule.conversation_id,
          display_name: schedule.target_display_name,
          username: schedule.target_username,
        };
        await createAction(client, { thread, actionType: "cancel_scheduled_message", contact: resolvedContact, arguments: { schedule_id: schedule.schedule_id, body: schedule.body, send_at: schedule.send_at, timezone: schedule.timezone } });
      }
      return json(await getState(client, thread));
    }

    if (!contact && plan.kind !== "respond") throw new Error("A Personal Chat contact is required.");
    let context = emptyContext;
    let serializedContext = baseInput.serializedContext;
    let storedSummary: SummaryRow = null;
    if (contact) {
      const loaded = await buildContext({ client, userId: user.id, userName: emptyContext.currentUserName, contact, searchQuery: plan.searchQuery });
      context = loaded.context;
      storedSummary = loaded.summary;
      const composed = composeAssistantContext(context, command);
      context = { ...context, recentMessages: composed.recentMessages, olderMessages: composed.olderMessages, summary: composed.summary };
      serializedContext = composed.serialized;
    }
    const providerInput: AssistantInput = { ...baseInput, context, serializedContext };

    if (plan.kind === "context_question" || plan.kind === "respond") {
      const response = await provider.respond(providerInput, plan);
      await appendEntry(client, { threadId: thread.id, role: "assistant", entryType: "answer", displayText: response.text, conversationId: contact?.conversation_id ?? null, metadata: { context_message_ids: [...context.recentMessages, ...context.olderMessages].map((message) => message.id) } });
    } else if (plan.kind === "summarize_conversation") {
      const summary = await provider.summarize(providerInput);
      await storeSummary(client, contact!.conversation_id, summary, storedSummary?.summary_version ?? 0);
      await appendEntry(client, { threadId: thread.id, role: "assistant", entryType: "summary", displayText: summary.text, conversationId: contact!.conversation_id, metadata: { context_message_ids: context.recentMessages.map((message) => message.id) } });
    } else {
      const draft = plan.draft?.trim();
      if (!draft) throw new Error("The provider did not return a message draft.");
      if (plan.kind === "schedule_message") {
        const schedule = resolveScheduleTime({ expression: plan.timeExpression ?? command, now: baseInput.now, timezone });
        if (schedule.status === "clarification") {
          await appendScheduleClarification(client, thread, contact!, {
            recipientQuery: contact!.username,
            draft,
            timeExpression: plan.timeExpression ?? command,
          }, timezone, schedule);
        } else {
          await createAction(client, { thread, actionType: "schedule_message", contact: contact!, arguments: { body: draft, send_at: schedule.sendAt, timezone: schedule.timezone, local_label: schedule.localLabel, recipient_label: contact!.display_name } });
        }
      } else {
        await createAction(client, { thread, actionType: "send_message_now", contact: contact!, arguments: { body: draft, recipient_label: contact!.display_name, draft_only: plan.kind === "draft_message" } });
      }
    }

    if (contact && shouldRefreshSummary(storedSummary ? { lastMessageId: storedSummary.last_summarized_message_id } : null, context.recentMessages)) {
      const summary = await provider.summarize(providerInput);
      await storeSummary(client, contact.conversation_id, summary, storedSummary?.summary_version ?? 0);
    }
    return json(await getState(client, thread));
  } catch (error) {
    if (error instanceof SinoRouterProviderError) {
      return json({ error: error.message }, 503);
    }
    const message = error instanceof Error ? error.message : "Assistant request failed.";
    const status = /Authentication required/i.test(message) ? 401 : /access denied|not authorized/i.test(message) ? 403 : 400;
    return json({ error: message }, status);
  }
});
