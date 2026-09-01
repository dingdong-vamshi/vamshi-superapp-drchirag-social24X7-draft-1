import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssistantRequest, AssistantState } from "./types";

export type AssistantRepository = {
  request(input: AssistantRequest): Promise<AssistantState>;
  subscribe(threadId: string, onChange: () => void): () => void;
};

export function createAssistantRepository(client: SupabaseClient): AssistantRepository {
  return {
    async request(input) {
      const { data, error } = await client.functions.invoke("ai-assistant", {
        body: input,
      });
      if (error) {
        const context = error.context as Response | undefined;
        const detail = context
          ? await context.clone().json().catch(() => null) as { error?: string } | null
          : null;
        throw new Error(detail?.error || error.message || "Assistant request failed.");
      }
      if (!data || typeof data !== "object" || !("thread" in data)) {
        throw new Error("Assistant returned an invalid response.");
      }
      return data as AssistantState;
    },
    subscribe(threadId, onChange) {
      const channel = client
        .channel(`assistant-thread-${threadId}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "ai_assistant_actions",
            filter: `thread_id=eq.${threadId}`,
          },
          onChange,
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "ai_assistant_entries",
            filter: `thread_id=eq.${threadId}`,
          },
          onChange,
        )
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
