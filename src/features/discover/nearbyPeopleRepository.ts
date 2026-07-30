import type { User } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";

export type NearbyPreference = {
  enabled: boolean;
  radiusKm: number;
  hasApproximateLocation: boolean;
};

export type NearbyPerson = {
  id: string;
  name: string;
  username: string;
  bio: string;
  interests: string[];
  distanceKm: number | null;
  requestStatus: "none" | "incoming" | "outgoing" | "accepted";
};

export type NearbyRequest = {
  id: string;
  otherUserId: string;
  name: string;
  username: string;
  status: "incoming" | "outgoing";
  createdAt: string;
};

const requireUser = (user: unknown) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!user || typeof user !== "object" || !("id" in user)) throw new Error("Sign in with a real Supabase account first.");
  return user as User;
};

const normalizeProfile = (profile: any) => ({
  id: profile.id,
  name: profile.display_name || profile.username || "Social 24x7 user",
  username: profile.username || profile.id.slice(0, 8),
  bio: profile.bio || "",
});

const requestState = (requests: any[], viewerId: string, otherId: string): NearbyPerson["requestStatus"] => {
  const pair = requests.find((request) =>
    (request.requester_id === viewerId && request.recipient_id === otherId) ||
    (request.requester_id === otherId && request.recipient_id === viewerId),
  );
  if (!pair) return "none";
  if (pair.status === "accepted") return "accepted";
  return pair.requester_id === viewerId ? "outgoing" : "incoming";
};

export async function getNearbyWorkspace(user: unknown) {
  const active = requireUser(user);
  const [prefRes, profileRes, requestRes] = await Promise.all([
    supabase!.from("nearby_people_preferences").select("*").eq("user_id", active.id).maybeSingle(),
    supabase!.from("profiles").select("id,username,display_name,bio,is_private").neq("id", active.id).limit(50),
    supabase!.from("connection_requests").select("id,requester_id,recipient_id,status,created_at").or(`requester_id.eq.${active.id},recipient_id.eq.${active.id}`),
  ]);
  if (prefRes.error) throw new Error(prefRes.error.message);
  if (profileRes.error) throw new Error(profileRes.error.message);
  if (requestRes.error) throw new Error(requestRes.error.message);

  const pref = prefRes.data;
  const preference: NearbyPreference = {
    enabled: Boolean(pref?.enabled),
    radiusKm: Number(pref?.radius_km ?? 5),
    hasApproximateLocation: Boolean(pref?.approximate_lat && pref?.approximate_lng),
  };
  const requests = requestRes.data ?? [];
  const people = (profileRes.data ?? []).map((profile: any): NearbyPerson => ({
    ...normalizeProfile(profile),
    interests: [],
    distanceKm: null,
    requestStatus: requestState(requests, active.id, profile.id),
  }));

  const requestCards: NearbyRequest[] = requests
    .filter((request: any) => request.status === "pending")
    .map((request: any) => {
      const otherId = request.requester_id === active.id ? request.recipient_id : request.requester_id;
      const profile = people.find((item) => item.id === otherId);
      return {
        id: request.id,
        otherUserId: otherId,
        name: profile?.name ?? "Social 24x7 user",
        username: profile?.username ?? otherId.slice(0, 8),
        status: request.requester_id === active.id ? "outgoing" : "incoming",
        createdAt: request.created_at,
      };
    });

  const friends = people.filter((person) => person.requestStatus === "accepted");
  return { preference, people: preference.enabled ? people : [], requests: requestCards, friends };
}

export async function setNearbyEnabled(user: unknown, enabled: boolean, radiusKm: number) {
  const active = requireUser(user);
  const { error } = await supabase!.from("nearby_people_preferences").upsert(
    {
      user_id: active.id,
      enabled,
      radius_km: radiusKm,
      last_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function sendNearbyRequest(user: unknown, recipientId: string) {
  const active = requireUser(user);
  if (active.id === recipientId) throw new Error("You cannot send yourself a request.");
  const { error } = await supabase!.from("connection_requests").upsert(
    { requester_id: active.id, recipient_id: recipientId, status: "pending" },
    { onConflict: "requester_id,recipient_id" },
  );
  if (error) throw new Error(error.message);
}

export async function respondNearbyRequest(user: unknown, requestId: string, status: "accepted" | "declined") {
  requireUser(user);
  const { error } = await supabase!.from("connection_requests").update({ status }).eq("id", requestId);
  if (error) throw new Error(error.message);
}
