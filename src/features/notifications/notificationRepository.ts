import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type NotificationSource = "chat" | "commerce" | "social";

export type AppNotification = {
  id: string;
  source: NotificationSource;
  title: string;
  body: string;
  kind: string;
  actorId: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationRepository = {
  list: () => Promise<AppNotification[]>;
  markRead: (item: AppNotification) => Promise<void>;
  markAllRead: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
};

const tableFor = (source: NotificationSource) => `${source}_notifications`;

export function createSupabaseNotificationRepository(
  client: SupabaseClient,
  viewerId: string,
): NotificationRepository {
  const listTable = async (source: NotificationSource) => {
    const entityColumn = source === "chat" ? "conversation_id" : source === "commerce" ? "entity_id" : "actor_id";
    const { data, error } = await client
      .from(tableFor(source))
      .select(`id,actor_id,kind,title,body,read_at,created_at,${entityColumn}`)
      .eq("recipient_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      source,
      title: String(row.title || "Notification"),
      body: String(row.body || ""),
      kind: String(row.kind || source),
      actorId: row.actor_id ? String(row.actor_id) : null,
      entityId: row[entityColumn] ? String(row[entityColumn]) : null,
      readAt: row.read_at ? String(row.read_at) : null,
      createdAt: String(row.created_at),
    } satisfies AppNotification));
  };

  return {
    async list() {
      const groups = await Promise.all([
        listTable("chat"),
        listTable("commerce"),
        listTable("social"),
      ]);
      return groups.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    async markRead(item) {
      if (item.readAt) return;
      const { error } = await client
        .from(tableFor(item.source))
        .update({ read_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("recipient_id", viewerId);
      if (error) throw error;
    },
    async markAllRead() {
      const readAt = new Date().toISOString();
      const results = await Promise.all(([
        "chat",
        "commerce",
        "social",
      ] as NotificationSource[]).map((source) => client
        .from(tableFor(source))
        .update({ read_at: readAt })
        .eq("recipient_id", viewerId)
        .is("read_at", null)));
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    },
    subscribe(listener) {
      let channel: RealtimeChannel | null = client.channel(`notifications:${viewerId}:${Date.now()}`);
      (["chat", "commerce", "social"] as NotificationSource[]).forEach((source) => {
        channel?.on(
          "postgres_changes",
          { event: "*", schema: "public", table: tableFor(source), filter: `recipient_id=eq.${viewerId}` },
          listener,
        );
      });
      channel.subscribe();
      return () => {
        if (channel) void client.removeChannel(channel);
        channel = null;
      };
    },
  };
}
