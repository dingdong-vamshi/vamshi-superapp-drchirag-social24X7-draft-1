import type { User } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";

export type NotesTaskEntry = {
  id: string;
  userId: string;
  entryType: "note" | "task";
  title: string;
  body: string;
  category: string;
  tags: string[];
  colorKey: "mint" | "yellow" | "blue" | "lavender" | "peach";
  priority: "low" | "medium" | "high" | null;
  dueDate: string | null;
  isStarred: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotesTaskAccess =
  | { ready: true; userId: string }
  | { ready: false; reason: string };

const QUERY_TIMEOUT_MS = 12000;

function requireSupabaseUser(user: unknown): NotesTaskAccess {
  if (!supabase) return { ready: false, reason: "Supabase is not configured." };
  if (!user || typeof user !== "object" || !("id" in user)) {
    return { ready: false, reason: "You need to sign in first." };
  }
  if (
    "app_metadata" in user &&
    user.app_metadata &&
    typeof user.app_metadata === "object" &&
    "provider" in user.app_metadata &&
    user.app_metadata.provider === "demo"
  ) {
    return {
      ready: false,
      reason: "Notes & Tasks requires a real Supabase account. Please use email sign-in instead of demo mode.",
    };
  }
  return { ready: true, userId: (user as User).id };
}

async function withTimeout<T>(operation: string, run: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${operation} timed out. Please retry.`));
        }, QUERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function logSafe(operation: string, error: unknown, recordId?: string) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.warn("[notes-tasks]", operation, {
    message,
    recordId: recordId ?? null,
  });
}

function mapRow(row: any): NotesTaskEntry {
  return {
    id: row.id,
    userId: row.user_id,
    entryType: row.entry_type,
    title: row.title,
    body: row.body ?? "",
    category: row.category ?? "Personal",
    tags: Array.isArray(row.tags) ? row.tags.filter((tag: unknown): tag is string => typeof tag === "string") : [],
    colorKey: row.color_key ?? "mint",
    priority: row.priority ?? null,
    dueDate: row.due_date ?? null,
    isStarred: Boolean(row.is_starred),
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listNotesTasksEntries(user: unknown) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  try {
    const response: any = await withTimeout(
      "listNotesTasksEntries",
      supabase!
        .from("notes_tasks_entries")
        .select("*")
        .eq("user_id", access.userId)
        .order("updated_at", { ascending: false }),
    );
    if (response.error) throw new Error(response.error.message);
    return (response.data ?? []).map(mapRow);
  } catch (error) {
    logSafe("listNotesTasksEntries", error);
    throw error;
  }
}

export async function saveNotesTasksEntry(
  user: unknown,
  input: {
    id?: string;
    entryType: "note" | "task";
    title: string;
    body: string;
    category: string;
    tags: string[];
    colorKey: NotesTaskEntry["colorKey"];
    priority?: "low" | "medium" | "high" | null;
    dueDate?: string | null;
    isStarred?: boolean;
  },
) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  const payload = {
    user_id: access.userId,
    entry_type: input.entryType,
    title: input.title.trim(),
    body: input.body.trim(),
    category: input.category.trim() || "Personal",
    tags: input.tags,
    color_key: input.colorKey,
    priority: input.entryType === "task" ? input.priority ?? "medium" : null,
    due_date: input.entryType === "task" ? input.dueDate ?? null : null,
    is_starred: Boolean(input.isStarred),
  };
  try {
    const query = input.id
      ? supabase!.from("notes_tasks_entries").update(payload).eq("id", input.id).select("*").single()
      : supabase!.from("notes_tasks_entries").insert(payload).select("*").single();
    const response: any = await withTimeout("saveNotesTasksEntry", query);
    if (response.error) throw new Error(response.error.message);
    return mapRow(response.data);
  } catch (error) {
    logSafe("saveNotesTasksEntry", error, input.id);
    throw error;
  }
}

export async function toggleNotesTaskComplete(user: unknown, entry: NotesTaskEntry) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  try {
    const response: any = await withTimeout(
      "toggleNotesTaskComplete",
      supabase!
        .from("notes_tasks_entries")
        .update({
          completed_at: entry.completedAt ? null : new Date().toISOString(),
        })
        .eq("id", entry.id)
        .eq("user_id", access.userId)
        .select("*")
        .single(),
    );
    if (response.error) throw new Error(response.error.message);
    return mapRow(response.data);
  } catch (error) {
    logSafe("toggleNotesTaskComplete", error, entry.id);
    throw error;
  }
}

export async function toggleNotesTaskStar(user: unknown, entry: NotesTaskEntry) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  try {
    const response: any = await withTimeout(
      "toggleNotesTaskStar",
      supabase!
        .from("notes_tasks_entries")
        .update({
          is_starred: !entry.isStarred,
        })
        .eq("id", entry.id)
        .eq("user_id", access.userId)
        .select("*")
        .single(),
    );
    if (response.error) throw new Error(response.error.message);
    return mapRow(response.data);
  } catch (error) {
    logSafe("toggleNotesTaskStar", error, entry.id);
    throw error;
  }
}

export async function deleteNotesTaskEntry(user: unknown, entryId: string) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  try {
    const response: any = await withTimeout(
      "deleteNotesTaskEntry",
      supabase!.from("notes_tasks_entries").delete().eq("id", entryId).eq("user_id", access.userId),
    );
    if (response.error) throw new Error(response.error.message);
  } catch (error) {
    logSafe("deleteNotesTaskEntry", error, entryId);
    throw error;
  }
}
