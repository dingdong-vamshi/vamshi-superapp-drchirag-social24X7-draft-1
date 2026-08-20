import type { User } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";

export type NearbyPreference = {
  enabled: boolean;
  radiusKm: number;
  hasApproximateLocation: boolean;
};

export type MyNearbyProfile = {
  name: string;
  username: string;
  bio: string;
  interests: string[];
};

export type NearbyPerson = {
  id: string;
  name: string;
  username: string;
  bio: string;
  interests: string[];
  distanceKm: number | null;
  requestStatus: "none" | "incoming" | "outgoing" | "accepted";
  isOnline: boolean;
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

export async function getNearbyWorkspace(user: unknown, radiusKm = 5, onlineOnly = false) {
  const active = requireUser(user);
  const [prefRes, requestRes, profileRes] = await Promise.all([
    supabase!.from("nearby_people_preferences").select("*").eq("user_id", active.id).maybeSingle(),
    supabase!.from("connection_requests").select("id,requester_id,recipient_id,status,created_at").or(`requester_id.eq.${active.id},recipient_id.eq.${active.id}`),
    supabase!.from("profiles").select("id,username,display_name,bio").eq("id", active.id).maybeSingle(),
  ]);
  if (prefRes.error) throw new Error(prefRes.error.message);
  if (requestRes.error) throw new Error(requestRes.error.message);
  if (profileRes.error) throw new Error(profileRes.error.message);

  const pref = prefRes.data;
  const preference: NearbyPreference = {
    enabled: Boolean(pref?.enabled),
    radiusKm: Number(pref?.radius_km ?? 5),
    hasApproximateLocation: pref?.approximate_lat != null && pref?.approximate_lng != null,
  };
  const requests = requestRes.data ?? [];
  const friendIds = requests
    .filter((request: any) => request.status === "accepted")
    .map((request: any) => request.requester_id === active.id ? request.recipient_id : request.requester_id);
  const [nearbyRes, friendProfilesRes, requestProfilesRes] = await Promise.all([
    preference.enabled && preference.hasApproximateLocation
      ? supabase!.rpc("get_nearby_people", { p_radius_km: radiusKm, p_online_only: onlineOnly })
      : Promise.resolve({ data: [], error: null }),
    friendIds.length
      ? supabase!.from("profiles").select("id,username,display_name,bio").in("id", friendIds)
      : Promise.resolve({ data: [], error: null }),
    requests.length
      ? supabase!.from("profiles").select("id,username,display_name,bio").in("id", requests.map((request: any) => request.requester_id === active.id ? request.recipient_id : request.requester_id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (nearbyRes.error) throw new Error(nearbyRes.error.message);
  if (friendProfilesRes.error) throw new Error(friendProfilesRes.error.message);
  if (requestProfilesRes.error) throw new Error(requestProfilesRes.error.message);
  const people = ((nearbyRes.data as any[] | null) ?? []).map((row): NearbyPerson => ({
    id: row.id,
    name: row.display_name || row.username || "Social 24x7 user",
    username: row.username || row.id.slice(0, 8),
    bio: row.bio || "",
    interests: row.interests ?? [],
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    requestStatus: row.request_status === "accepted" || row.request_status === "incoming" || row.request_status === "outgoing" ? row.request_status : "none",
    isOnline: Boolean(row.is_online),
  }));
  const profileById = new Map([...(friendProfilesRes.data ?? []), ...(requestProfilesRes.data ?? [])].map((profile: any) => [profile.id, profile]));

  const requestCards: NearbyRequest[] = requests
    .filter((request: any) => request.status === "pending")
    .map((request: any) => {
      const otherId = request.requester_id === active.id ? request.recipient_id : request.requester_id;
      const profile = profileById.get(otherId);
      return {
        id: request.id,
        otherUserId: otherId,
        name: profile?.display_name || profile?.username || "Social 24x7 user",
        username: profile?.username ?? otherId.slice(0, 8),
        status: request.requester_id === active.id ? "outgoing" : "incoming",
        createdAt: request.created_at,
      };
    });

  const friends: NearbyPerson[] = friendIds.map((id): NearbyPerson | null => {
    const profile = profileById.get(id);
    return profile ? { ...normalizeProfile(profile), interests: [], distanceKm: null, requestStatus: "accepted" as const, isOnline: false } : null;
  }).filter((person): person is NearbyPerson => person !== null);
  const profile = profileRes.data;
  const myProfile: MyNearbyProfile = {
    name: profile?.display_name || profile?.username || "Social 24x7 user",
    username: profile?.username || active.id.slice(0, 8),
    bio: profile?.bio || "",
    interests: Array.isArray(pref?.interests) ? pref.interests : [],
  };
  return { preference, people: preference.enabled ? people : [], requests: requestCards, friends, myProfile };
}

export async function touchNearbyPresence(user: unknown) {
  requireUser(user);
  const { error } = await supabase!.rpc("touch_my_nearby_presence");
  if (error) throw new Error(error.message);
}

export async function saveNearbyPreference(input: {
  user: unknown;
  enabled: boolean;
  radiusKm: number;
  latitude?: number | null;
  longitude?: number | null;
  interests?: string[];
}) {
  requireUser(input.user);
  const { error } = await supabase!.rpc("save_my_nearby_preference", {
    p_enabled: input.enabled,
    p_radius_km: input.radiusKm,
    p_approximate_lat: input.latitude ?? null,
    p_approximate_lng: input.longitude ?? null,
    p_interests: input.interests ?? [],
  });
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
