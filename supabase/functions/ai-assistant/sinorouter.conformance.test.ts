import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@1";

import { composeAssistantContext } from "../_shared/ai-assistant/context.ts";
import {
  SinoRouterProviderError,
  SinoRouterQwenProvider,
} from "../_shared/ai-assistant/provider.ts";
import type {
  AssistantContext,
  AssistantInput,
} from "../_shared/ai-assistant/types.ts";

const apiKey = Deno.env.get("SINOROUTER_API_KEY")?.trim();
const baseUrl = Deno.env.get("SINOROUTER_BASE_URL")?.trim();
const model = Deno.env.get("SINOROUTER_MODEL")?.trim();
const liveConfigured = Boolean(apiKey && baseUrl && model);

const context: AssistantContext = {
  currentUserId: "qa-requester",
  currentUserName: "Naveen",
  conversationId: "qa-personal-conversation",
  counterpartName: "Yogesh",
  summary: null,
  recentMessages: [{
    id: "qa-message-1",
    senderId: "qa-yogesh",
    senderName: "Yogesh",
    body: "Can you send the report tomorrow?",
    createdAt: "2026-09-01T10:00:00.000Z",
    isMine: false,
  }],
  olderMessages: [],
  pendingAction: null,
};

const input = (request: string): AssistantInput => ({
  request,
  now: "2026-09-01T10:00:00.000Z",
  timezone: "Asia/Kolkata",
  context,
  serializedContext: composeAssistantContext(context, request).serialized,
});

const liveProvider = () => new SinoRouterQwenProvider({ apiKey, baseUrl, model });

const liveTest = (name: string, fn: () => Promise<void>) =>
  Deno.test({
    name: `SinoRouter conformance: ${name}`,
    ignore: !liveConfigured,
    fn,
  });

liveTest("authentication", async () => {
  const provider = new SinoRouterQwenProvider({
    apiKey: "invalid-conformance-key",
    baseUrl,
    model,
    maxRetries: 0,
  });
  await assertRejects(
    () => provider.discoverModels(),
    SinoRouterProviderError,
    "temporarily unavailable",
  );
  try {
    await provider.discoverModels();
  } catch (error) {
    assert(error instanceof SinoRouterProviderError);
    assertEquals(error.kind, "authentication");
    assertEquals(error.status, 401);
  }
});

liveTest("model discovery", async () => {
  const models = await liveProvider().discoverModels();
  assert(model);
  assert(models.includes(model));
});

liveTest("simple response", async () => {
  const response = await liveProvider().respond(
    input("What did Yogesh ask me to do?"),
    { kind: "context_question", recipientQuery: "Yogesh" },
  );
  assertStringIncludes(response.text.toLocaleLowerCase(), "report");
  assert(!response.text.includes("TRUSTED_"));
});

liveTest("strict JSON parsing", async () => {
  const plan = await liveProvider().planAction(
    input("Tell Yogesh I'll join in 10 minutes."),
  );
  assertEquals(plan.kind, "send_message_now");
  assertEquals(plan.recipientQuery?.toLocaleLowerCase(), "yogesh");
  assertStringIncludes(plan.draft?.toLocaleLowerCase() ?? "", "10 minutes");
});

liveTest("exact message preservation", async () => {
  const exactMessage = "S24-EXACT-MESSAGE-73 delivery confirmed";
  const plan = await liveProvider().planAction(
    input(`Tell Yogesh exactly: "${exactMessage}"`),
  );
  assertEquals(plan.kind, "send_message_now");
  assertEquals(plan.recipientQuery, "Yogesh");
  assertEquals(plan.draft, exactMessage);
});

liveTest("ambiguous time planning", async () => {
  const plan = await liveProvider().planAction(
    input("Message Yogesh tomorrow evening."),
  );
  assertEquals(plan.kind, "clarification");
  assert(/what time|exact time/i.test(plan.clarification ?? ""));
});

liveTest("structured summary", async () => {
  const summary = await liveProvider().summarize(
    input("Summarize my recent conversation with Yogesh."),
  );
  assertStringIncludes(summary.text.toLocaleLowerCase(), "report");
  assertEquals(summary.messageCount, 1);
  assertEquals(summary.lastMessageId, "qa-message-1");
  assertEquals(summary.modelVersion, `sinorouter:${model}`);
});

liveTest("tool calling", async () => {
  assert(apiKey && baseUrl && model);
  const apiBase = baseUrl.replace(/\/+$/, "").endsWith("/v1")
    ? baseUrl.replace(/\/+$/, "")
    : `${baseUrl.replace(/\/+$/, "")}/v1`;
  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: "Call the echo tool once with value SOCIAL24_TOOL_OK.",
      }],
      tools: [{
        type: "function",
        function: {
          name: "echo",
          description: "Echo one validation value.",
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["value"],
            properties: { value: { type: "string" } },
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "echo" } },
      enable_thinking: false,
      temperature: 0,
      max_completion_tokens: 512,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  assertEquals(response.status, 200);
  const payload = await response.json();
  const call = payload?.choices?.[0]?.message?.tool_calls?.[0];
  assertEquals(call?.function?.name, "echo");
  const argumentsObject = JSON.parse(call?.function?.arguments ?? "{}");
  assertEquals(argumentsObject.value, "SOCIAL24_TOOL_OK");
});

Deno.test("SinoRouter conformance: timeout and retry behavior", async () => {
  let attempts = 0;
  const provider = new SinoRouterQwenProvider({
    apiKey: "server-only",
    baseUrl: "https://api.sinorouter.ai",
    model: "qwen3.8-flash",
    timeoutMs: 100,
    maxRetries: 1,
    retryDelayMs: 0,
    sleep: async () => {},
    fetcher: async (_url, init) => {
      attempts += 1;
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
      return new Response();
    },
  });
  await assertRejects(() => provider.discoverModels(), SinoRouterProviderError);
  assertEquals(attempts, 2);
});

liveTest("multilingual response", async () => {
  const response = await liveProvider().respond(
    input("हिंदी में बताइए: योगेश ने मुझसे क्या भेजने को कहा?"),
    { kind: "context_question", recipientQuery: "Yogesh" },
  );
  assert(/[\u0900-\u097F]/u.test(response.text));
  assert(/report|रिपोर्ट/iu.test(response.text));
});

Deno.test("SinoRouter conformance: malformed response handling", async () => {
  const provider = new SinoRouterQwenProvider({
    apiKey: "server-only",
    baseUrl: "https://api.sinorouter.ai",
    model: "qwen3.8-flash",
    maxRetries: 0,
    fetcher: async () => Response.json({ choices: [{ message: { content: "not-json" } }] }),
  });
  await assertRejects(
    () => provider.planAction(input("hello")),
    SinoRouterProviderError,
    "temporarily unavailable",
  );
});
