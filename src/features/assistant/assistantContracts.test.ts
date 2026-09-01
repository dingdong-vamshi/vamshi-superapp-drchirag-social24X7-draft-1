import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("assistant migration is RLS-protected and keeps private helpers private", () => {
  const migration = read(
    "../../../supabase/migrations/20260901130738_social24_ai_assistant_core.sql",
  );
  for (const table of [
    "ai_assistant_threads",
    "ai_assistant_entries",
    "ai_assistant_actions",
    "conversation_ai_summaries",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /public\.ai_can_access_personal_conversation\(scoped_conversation_id\)/);
  assert.match(
    migration,
    /revoke all on function private\.is_authorized_personal_conversation[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(migration, /grant select on table public\.ai_assistant_actions to authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*ai_assistant_actions.*authenticated/i);
});

test("assistant actions are confirmation gated and share chat delivery permissions", () => {
  const migration = read(
    "../../../supabase/migrations/20260901130738_social24_ai_assistant_core.sql",
  );
  assert.match(migration, /confirmation_status in \('pending', 'confirmed', 'cancelled'\)/i);
  assert.match(
    migration,
    /action\.status <> 'proposed' or action\.confirmation_status <> 'pending'/i,
  );
  assert.match(migration, /confirmation_status = 'confirmed'/i);
  assert.match(migration, /private\.deliver_chat_text_message\(/i);
  assert.match(migration, /source in \('user', 'ai_assistant'\)/i);
  assert.match(migration, /Conversation delivery is no longer permitted/i);
  assert.match(migration, /request\.status = 'blocked'/i);
});

test("orchestrator uses bounded Personal Chat tools and isolates SinoRouter HTTP in one provider", () => {
  const orchestrator = read("../../../supabase/functions/ai-assistant/index.ts");
  const provider = read("../../../supabase/functions/_shared/ai-assistant/provider.ts");
  const context = read("../../../supabase/functions/_shared/ai-assistant/context.ts");

  assert.match(orchestrator, /ai_search_personal_contacts/);
  assert.match(orchestrator, /ai_get_recent_chat_context/);
  assert.match(orchestrator, /ai_search_older_chat_messages/);
  assert.match(orchestrator, /ai_get_conversation_summary/);
  assert.match(orchestrator, /ai_create_action/);
  assert.match(orchestrator, /ai_execute_action/);
  assert.match(context, /TOTAL_CONTEXT_CHARACTER_LIMIT = 40_000/);
  assert.match(orchestrator, /serializedContext: composeAssistantContext/);
  assert.match(provider, /\/chat\/completions/);
  assert.match(provider, /Authorization:\s*`Bearer/);
  assert.match(provider, /response_format:\s*\{ type: ["']json_schema["']/);
  assert.match(provider, /stream:\s*true/);
  assert.match(provider, /SAFE_UNAVAILABLE_MESSAGE/);
  assert.doesNotMatch(orchestrator, /api\.sinorouter\.ai\/v1\/chat\/completions/);
});

test("scheduled terminal states update the authoritative Assistant action result", () => {
  const migration = read(
    "../../../supabase/migrations/20260901192127_assistant_realtime_delivery_history.sql",
  );
  assert.match(migration, /schedule_status', 'sent'/i);
  assert.match(migration, /schedule_status', 'cancelled'/i);
  assert.match(migration, /schedule_status', 'failed'/i);
  assert.match(migration, /private\.chat_send_permitted/i);
  assert.match(migration, /ai_assistant_entries_delivery_event_key/i);
  assert.match(migration, /Scheduled message delivery failed/i);
  assert.match(migration, /on conflict \(\(metadata->>'delivery_event_key'\)\)/i);
  assert.match(migration, /alter publication supabase_realtime add table/i);
});

test("Assistant delivery updates are event driven and render terminal failure state", () => {
  const screen = read("./AssistantScreen.tsx");
  const repository = read("./assistantRepository.ts");

  assert.match(repository, /table: "ai_assistant_actions"/);
  assert.match(repository, /table: "ai_assistant_entries"/);
  assert.match(repository, /filter: `thread_id=eq\.\$\{threadId\}`/);
  assert.match(repository, /removeChannel\(channel\)/);
  assert.match(screen, /repository\.subscribe\(state\.thread\.id, refresh\)/);
  assert.doesNotMatch(screen, /setInterval\(/);
  assert.match(screen, /Scheduled delivery failed/);
});

test("Assistant desktop keyboard sends Enter, preserves Shift+Enter, and ignores IME composition", () => {
  const screen = read("./AssistantScreen.tsx");
  assert.match(screen, /nativeEvent\.key !== "Enter"/);
  assert.match(screen, /nativeEvent\.shiftKey/);
  assert.match(screen, /nativeEvent\.isComposing/);
  assert.match(screen, /preventDefault\?\.\(\)/);
  assert.match(screen, /Platform\.OS === "web" \? undefined/);
});

test("global contact discovery is limited to accepted Personal Chat counterparties", () => {
  const migration = read(
    "../../../supabase/migrations/20260901134854_social24_ai_assistant_accepted_contacts_hardening.sql",
  );
  assert.match(migration, /conversation\.kind = 'personal'/i);
  assert.match(migration, /request\.status = 'accepted'/i);
  assert.match(migration, /request\.requester_id = viewer[\s\S]*request\.recipient_id = profile\.id/i);
  assert.match(migration, /request\.recipient_id = viewer[\s\S]*request\.requester_id = profile\.id/i);
});

test("contextual Assistant accepts an authorized contact display-name alias", () => {
  const orchestrator = read("../../../supabase/functions/ai-assistant/index.ts");
  assert.match(orchestrator, /requestedTokens = requested\.split/);
  assert.match(orchestrator, /requestedTokens\.some\(\(token\) => value\.includes\(token\)/);
  assert.match(orchestrator, /matchingContacts = await searchContacts\(client, plan\.recipientQuery\)/);
  assert.match(orchestrator, /contact\.user_id === scoped\.user_id/);
  assert.match(orchestrator, /contact\.conversation_id === scoped\.conversation_id/);
});

test("global launcher and contextual Personal Chat Ask AI use the existing route shell", () => {
  const layout = read("../../../app/_layout.tsx");
  const chats = read("../../../app/(tabs)/chats.tsx");
  const chatScreen = read("../chat/ChatScreen.tsx");
  const assistant = read("./AssistantScreen.tsx");
  const launcher = read("./AssistantLauncher.tsx");
  const assistantRoute = read("../../../app/assistant.tsx");

  assert.match(layout, /<AssistantLauncher/);
  assert.match(layout, /name="assistant"/);
  assert.match(chats, /pathname:\s*["']\/assistant["']/);
  assert.match(chatScreen, /conversation\.kind === ["']personal["'] && onAskAi/);
  assert.match(chatScreen, /label: ["']Ask AI["']/);
  assert.match(assistant, /Platform\.OS === ["']web["'] && width >= 900/);
  assert.match(assistant, /panelDesktop/);
  assert.match(assistant, /desktop \? \(/);
  assert.match(assistant, /Confirm/);
  assert.match(assistant, /Edit/);
  assert.match(assistant, /Cancel/);
  assert.match(assistant, /Retry opening Assistant/);
  assert.match(assistant, /Edit scheduled date and time/);
  assert.match(assistant, /editedSendAt/);
  assert.match(launcher, /chatRoute/);
  assert.match(launcher, /width < 769/);
  assert.match(launcher, /pathname === "\/assistant"/);
  assert.match(assistantRoute, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\("\/chats"\)/);
});

test("bounded Assistant state returns the newest history window in display order", () => {
  const orchestrator = read("../../../supabase/functions/ai-assistant/index.ts");
  assert.match(orchestrator, /\.order\("created_at", \{ ascending: false \}\)[\s\S]*\.limit\(100\)/);
  assert.match(orchestrator, /entries:\s*\[\.\.\.\(entriesResult\.data \?\? \[\]\)\]\.reverse\(\)/);
  assert.match(orchestrator, /actions:\s*\[\.\.\.\(actionsResult\.data \?\? \[\]\)\]\.reverse\(\)/);
});

test("older-message fallback search uses a valid literal substring match", () => {
  const migration = read(
    "../../../supabase/migrations/20260901161248_fix_ai_older_message_escape.sql",
  );
  assert.match(migration, /position\(lower\(normalized\) in lower\(coalesce\(message\.body, ''\)\)\) > 0/i);
  assert.doesNotMatch(migration, /escape '\\\\'/i);
  assert.match(migration, /Personal conversation access denied/i);
  assert.match(migration, /grant execute[\s\S]*to authenticated/i);
});

test("SinoRouter conformance matrix is executable with server-only environment configuration", () => {
  const matrix = read(
    "../../../supabase/functions/ai-assistant/sinorouter.conformance.test.ts",
  );
  for (const expectation of [
    "authentication",
    "model discovery",
    "simple response",
    "strict JSON",
    "tool calling",
    "timeout and retry",
    "multilingual",
    "malformed response",
  ]) {
    assert.match(matrix, new RegExp(expectation, "i"));
  }
  assert.match(matrix, /SINOROUTER_API_KEY/);
  assert.match(matrix, /SINOROUTER_BASE_URL/);
  assert.match(matrix, /SINOROUTER_MODEL/);
  assert.doesNotMatch(matrix, /PENDING_CLIENT_CONFIGURATION/);
});

test("schedule confirmation keeps one authoritative card and inline validation state", () => {
  const orchestrator = read("../../../supabase/functions/ai-assistant/index.ts");
  const screen = read("./AssistantScreen.tsx");
  const migration = read(
    "../../../supabase/migrations/20260901175200_fix_ai_schedule_confirmation_state.sql",
  );
  assert.doesNotMatch(
    orchestrator,
    /operation === "confirm"[\s\S]{0,700}appendEntry/,
  );
  assert.match(screen, /canonicalActionEntries/);
  assert.match(screen, /actionValidationError/);
  assert.match(screen, /Choose another time/);
  assert.match(migration, /status = 'proposed', confirmation_status = 'pending'/i);
  assert.match(migration, /That time has just passed\. Choose a new time\./i);
  assert.match(migration, /error = null,[\s\S]*result = '\{\}'::jsonb/i);
});

test("pending schedule intent is stored server-side and reused for clarification turns", () => {
  const orchestrator = read("../../../supabase/functions/ai-assistant/index.ts");
  assert.match(orchestrator, /pending_intent/);
  assert.match(orchestrator, /latestPendingScheduleIntent/);
  assert.match(orchestrator, /mergePendingTimeReply/);
  assert.match(orchestrator, /resolve_pending_intent/);
  assert.match(orchestrator, /past_time_offer/);
});
