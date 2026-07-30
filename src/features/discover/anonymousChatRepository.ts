import type { User } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";

export type AnonymousChannel = {
  id: string;
  slug: string;
  name: string;
  description: string;
  memberCount: number;
  joined: boolean;
};

export type AnonymousPost = {
  id: string;
  channelId: string;
  channelName: string;
  channelSlug: string;
  body: string;
  tags: string[];
  createdAt: string;
  upvotes: number;
  downvotes: number;
  comments: number;
  viewerVote: -1 | 0 | 1;
};

const requireUser = (user: unknown) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!user || typeof user !== "object" || !("id" in user)) throw new Error("Sign in with a real Supabase account first.");
  return user as User;
};

const asNumber = (value: unknown) => Number(value ?? 0);

export async function listAnonymousChannels(user: unknown): Promise<AnonymousChannel[]> {
  const active = requireUser(user);
  const [{ data: channels, error: channelError }, { data: memberships, error: memberError }] = await Promise.all([
    supabase!.from("anonymous_channels").select("id,slug,name,description").order("created_at", { ascending: true }),
    supabase!.from("anonymous_channel_memberships").select("channel_id,user_id"),
  ]);
  if (channelError) throw new Error(channelError.message);
  if (memberError) throw new Error(memberError.message);
  const memberRows = memberships ?? [];
  return (channels ?? []).map((row: any) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    memberCount: memberRows.filter((member: any) => member.channel_id === row.id).length,
    joined: memberRows.some((member: any) => member.channel_id === row.id && member.user_id === active.id),
  }));
}

export async function setAnonymousChannelJoined(user: unknown, channelId: string, joined: boolean) {
  const active = requireUser(user);
  const query = joined
    ? supabase!.from("anonymous_channel_memberships").upsert({ channel_id: channelId, user_id: active.id }, { onConflict: "channel_id,user_id" })
    : supabase!.from("anonymous_channel_memberships").delete().eq("channel_id", channelId).eq("user_id", active.id);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function listAnonymousPosts(user: unknown, channelId?: string | null): Promise<AnonymousPost[]> {
  const active = requireUser(user);
  let query = supabase!
    .from("anonymous_posts")
    .select("id,channel_id,body,tags,created_at,anonymous_channels!inner(id,slug,name),anonymous_post_votes(user_id,vote),anonymous_post_comments(id)")
    .order("created_at", { ascending: false });
  if (channelId) query = query.eq("channel_id", channelId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => {
    const votes = row.anonymous_post_votes ?? [];
    const channel = Array.isArray(row.anonymous_channels) ? row.anonymous_channels[0] : row.anonymous_channels;
    return {
      id: row.id,
      channelId: row.channel_id,
      channelName: channel?.name ?? "Channel",
      channelSlug: channel?.slug ?? "general",
      body: row.body ?? "",
      tags: row.tags ?? [],
      createdAt: row.created_at,
      upvotes: votes.filter((vote: any) => asNumber(vote.vote) === 1).length,
      downvotes: votes.filter((vote: any) => asNumber(vote.vote) === -1).length,
      comments: (row.anonymous_post_comments ?? []).length,
      viewerVote: asNumber(votes.find((vote: any) => vote.user_id === active.id)?.vote) as -1 | 0 | 1,
    };
  });
}

export async function createAnonymousPost(user: unknown, input: { channelId: string; body: string; tags: string[] }) {
  const active = requireUser(user);
  const body = input.body.trim();
  if (!body) throw new Error("Write something before posting.");
  if (body.length > 500) throw new Error("Anonymous posts are limited to 500 characters.");
  const { error } = await supabase!.from("anonymous_posts").insert({
    channel_id: input.channelId,
    owner_id: active.id,
    body,
    tags: input.tags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean).slice(0, 5),
  });
  if (error) throw new Error(error.message);
}

export async function voteAnonymousPost(user: unknown, postId: string, vote: -1 | 0 | 1) {
  const active = requireUser(user);
  const query = vote === 0
    ? supabase!.from("anonymous_post_votes").delete().eq("post_id", postId).eq("user_id", active.id)
    : supabase!.from("anonymous_post_votes").upsert({ post_id: postId, user_id: active.id, vote }, { onConflict: "post_id,user_id" });
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function reportAnonymousPost(user: unknown, postId: string, reason: string) {
  const active = requireUser(user);
  const { error } = await supabase!.from("anonymous_reports").insert({
    post_id: postId,
    reporter_id: active.id,
    reason: reason.trim() || "Inappropriate content",
  });
  if (error) {
    if (error.code === "23505") throw new Error("You already reported this post.");
    throw new Error(error.message);
  }
}
