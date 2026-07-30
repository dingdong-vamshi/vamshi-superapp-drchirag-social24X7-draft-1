import type { User } from "@supabase/supabase-js";
import { Platform } from "react-native";

import { supabase } from "../../lib/supabase";

export type SupportTicket = {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "new" | "in_progress" | "waiting_for_user" | "resolved" | "closed";
  module: string;
  createdAt: string;
  responseCount: number;
};

export type FeatureRequest = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: "under_review" | "planned" | "in_progress" | "released" | "rejected";
  createdAt: string;
  voteCount: number;
  voted: boolean;
};

export type SupportFaq = {
  id: string;
  question: string;
  answer: string;
  category: string;
  helpful: number;
  notHelpful: number;
  viewerHelpful: boolean | null;
};

const requireUser = (user: unknown) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!user || typeof user !== "object" || !("id" in user)) throw new Error("Sign in with a real Supabase account first.");
  return user as User;
};

export async function getSupportWorkspace(user: unknown) {
  const active = requireUser(user);
  const [ticketRes, featureRes, faqRes] = await Promise.all([
    supabase!.from("support_tickets").select("*,support_ticket_responses(id)").order("created_at", { ascending: false }),
    supabase!.from("support_feature_requests").select("*,support_feature_votes(voter_id)").order("created_at", { ascending: false }),
    supabase!.from("support_faqs").select("*,support_faq_feedback(user_id,helpful)").order("sort_order", { ascending: true }),
  ]);
  if (ticketRes.error) throw new Error(ticketRes.error.message);
  if (featureRes.error) throw new Error(featureRes.error.message);
  if (faqRes.error) throw new Error(faqRes.error.message);

  const tickets: SupportTicket[] = (ticketRes.data ?? []).map((row: any) => ({
    id: row.id,
    ticketNumber: Number(row.ticket_number ?? 0),
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    module: row.module,
    createdAt: row.created_at,
    responseCount: (row.support_ticket_responses ?? []).length,
  }));
  const features: FeatureRequest[] = (featureRes.data ?? []).map((row: any) => {
    const votes = row.support_feature_votes ?? [];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      status: row.status,
      createdAt: row.created_at,
      voteCount: votes.length,
      voted: votes.some((vote: any) => vote.voter_id === active.id),
    };
  });
  const faqs: SupportFaq[] = (faqRes.data ?? []).map((row: any) => {
    const feedback = row.support_faq_feedback ?? [];
    const viewer = feedback.find((item: any) => item.user_id === active.id);
    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      category: row.category,
      helpful: feedback.filter((item: any) => item.helpful).length,
      notHelpful: feedback.filter((item: any) => !item.helpful).length,
      viewerHelpful: viewer ? Boolean(viewer.helpful) : null,
    };
  });
  return { tickets, features, faqs };
}

export async function createSupportTicket(user: unknown, input: { title: string; description: string; category: string; priority: string; module: string }) {
  const active = requireUser(user);
  if (!input.title.trim()) throw new Error("Ticket title is required.");
  if (!input.description.trim()) throw new Error("Ticket description is required.");
  const { error } = await supabase!.from("support_tickets").insert({
    requester_id: active.id,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category.trim() || "General",
    priority: input.priority,
    module: input.module.trim() || "Social 24x7",
    platform: Platform.OS,
  });
  if (error) throw new Error(error.message);
}

export async function createFeatureRequest(user: unknown, input: { title: string; description: string; category: string }) {
  const active = requireUser(user);
  if (!input.title.trim()) throw new Error("Feature title is required.");
  if (!input.description.trim()) throw new Error("Feature description is required.");
  const { error } = await supabase!.from("support_feature_requests").insert({
    requester_id: active.id,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category.trim() || "General",
  });
  if (error) throw new Error(error.message);
}

export async function setFeatureVote(user: unknown, featureId: string, voted: boolean) {
  const active = requireUser(user);
  const query = voted
    ? supabase!.from("support_feature_votes").upsert({ feature_id: featureId, voter_id: active.id }, { onConflict: "feature_id,voter_id" })
    : supabase!.from("support_feature_votes").delete().eq("feature_id", featureId).eq("voter_id", active.id);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function setFaqFeedback(user: unknown, faqId: string, helpful: boolean) {
  const active = requireUser(user);
  const { error } = await supabase!.from("support_faq_feedback").upsert(
    { faq_id: faqId, user_id: active.id, helpful },
    { onConflict: "faq_id,user_id" },
  );
  if (error) throw new Error(error.message);
}
