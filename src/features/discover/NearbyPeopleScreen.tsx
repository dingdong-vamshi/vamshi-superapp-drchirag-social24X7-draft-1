import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, PanResponder, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ArrowLeft, Check, Filter, MapPin, Shield, UserPlus, Users, X } from "lucide-react-native";
import * as Location from "expo-location";

import { useAuth } from "../../lib/AuthContext";
import {
  getNearbyWorkspace,
  respondNearbyRequest,
  sendNearbyRequest,
  saveNearbyPreference,
  type NearbyPerson,
  type NearbyRequest,
} from "./nearbyPeopleRepository";

const tabs = ["Discover", "Requests", "Friends"] as const;

export default function NearbyPeopleScreen() {
  const { user, initialized } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Discover");
  const [radiusKm, setRadiusKm] = useState(5);
  const [passedIds, setPassedIds] = useState<string[]>([]);

  const workspaceQuery = useQuery({
    queryKey: ["nearby-people", user && "id" in user ? user.id : "guest"],
    queryFn: () => getNearbyWorkspace(user, radiusKm),
    enabled: initialized && Boolean(user && "id" in user),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["nearby-people"] });
  const preference = workspaceQuery.data?.preference;
  const enabled = Boolean(preference?.enabled);
  useEffect(() => {
    if (preference?.radiusKm) setRadiusKm(preference.radiusKm);
  }, [preference?.radiusKm]);

  const toggleMutation = useMutation({
    mutationFn: async (nextEnabled: boolean) => {
      if (!nextEnabled) return saveNearbyPreference({ user, enabled: false, radiusKm });
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location permission is needed to enable Nearby People.");
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return saveNearbyPreference({
        user,
        enabled: true,
        radiusKm,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    onSuccess: refresh,
    onError: (error) => Alert.alert("Could not update Nearby People", error instanceof Error ? error.message : "Please try again."),
  });
  const requestMutation = useMutation({
    mutationFn: (recipientId: string) => sendNearbyRequest(user, recipientId),
    onSuccess: refresh,
    onError: (error) => Alert.alert("Could not send request", error instanceof Error ? error.message : "Please try again."),
  });
  const responseMutation = useMutation({
    mutationFn: ({ id, accepted }: { id: string; accepted: boolean }) => respondNearbyRequest(user, id, accepted ? "accepted" : "declined"),
    onSuccess: refresh,
    onError: (error) => Alert.alert("Could not update request", error instanceof Error ? error.message : "Please try again."),
  });
  const radiusMutation = useMutation({
    mutationFn: async (nextRadiusKm: number) => {
      if (!enabled) return;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location permission is needed to update your Nearby radius.");
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await saveNearbyPreference({
        user,
        enabled: true,
        radiusKm: nextRadiusKm,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        interests: workspaceQuery.data?.myProfile.interests,
      });
    },
    onSuccess: refresh,
    onError: (error) => Alert.alert("Could not update radius", error instanceof Error ? error.message : "Please try again."),
  });
  const cycleRadius = () => {
    const options = [1, 5, 10, 25, 50];
    const nextRadiusKm = options[(options.indexOf(radiusKm) + 1) % options.length];
    setRadiusKm(nextRadiusKm);
    if (enabled) radiusMutation.mutate(nextRadiusKm);
  };

  const people = (workspaceQuery.data?.people ?? []).filter((person) => !passedIds.includes(person.id));
  const requests = workspaceQuery.data?.requests ?? [];
  const friends = workspaceQuery.data?.friends ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><ArrowLeft size={24} color="#111827" /></Pressable>
        <Text style={styles.title}>Nearby People</Text>
        <Filter size={22} color="#111827" />
        <Shield size={22} color="#111827" />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <Shield size={22} color="#1746d6" />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Stay Safe</Text>
            <Text style={styles.noticeText}>Always meet in public places. Report inappropriate behavior.</Text>
          </View>
        </View>
        <Segmented tabs={tabs} active={tab} onPick={setTab} />

        {!user || !("id" in user) ? <Empty title="Sign in required" text="Nearby People needs a real Supabase test user." icon={<Users color="#98a2b3" size={56} />} /> : null}

        {user && "id" in user && tab === "Discover" ? (
          <>
            <View style={styles.controlCard}>
              <Text style={styles.distance}>Distance: {radiusKm.toFixed(1)}km</Text>
              <Pressable accessibilityRole="adjustable" accessibilityLabel="Nearby distance radius" onPress={cycleRadius} style={styles.sliderTrack}><View style={[styles.sliderFill, { width: `${Math.min(100, radiusKm * 2)}%` }]} /><View style={[styles.sliderKnob, { left: `${Math.max(0, Math.min(92, radiusKm * 2 - 2))}%` }]} /></Pressable>
              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.switchLabel}>Online only</Text>
                  <Text style={styles.hint}>We save only a rounded location and show other people an approximate distance, never your exact coordinates.</Text>
                </View>
                <Switch value={enabled} onValueChange={(value) => toggleMutation.mutate(value)} />
              </View>
            </View>
            {workspaceQuery.isLoading ? <Empty title="Loading nearby people" text="Checking discoverable profiles..." icon={<Users color="#98a2b3" size={56} />} /> : null}
            {!workspaceQuery.isLoading && !enabled ? <Empty title="Nearby is off" text="Turn on Nearby People to see discoverable profiles." icon={<MapPin color="#98a2b3" size={56} />} /> : null}
            {!workspaceQuery.isLoading && enabled && people.length === 0 ? <Empty title="No people found" text="No discoverable profiles are available yet." icon={<Users color="#98a2b3" size={56} />} /> : null}
            {enabled ? <View style={styles.myProfile}><Text style={styles.myProfileTitle}>My Nearby Profile</Text><Text style={styles.myProfileText}>{workspaceQuery.data?.myProfile.name} · @{workspaceQuery.data?.myProfile.username}</Text><Text style={styles.myProfileText}>{workspaceQuery.data?.myProfile.bio || "Your profile bio will be shown here."}</Text><Text style={styles.myProfileText}>{enabled ? "Visible to people within your selected radius" : "Hidden"}{workspaceQuery.data?.myProfile.interests.length ? ` · ${workspaceQuery.data.myProfile.interests.join(" · ")}` : ""}</Text></View> : null}
            {enabled ? people.map((person) => <PersonCard key={person.id} person={person} onConnect={() => requestMutation.mutate(person.id)} onPass={() => setPassedIds((current) => [...current, person.id])} />) : null}
          </>
        ) : null}

        {user && "id" in user && tab === "Requests" ? (
          requests.length === 0 ? <Empty title="No friend requests" text="Connect with people to see requests here." icon={<UserPlus color="#98a2b3" size={56} />} /> : requests.map((request) => <RequestCard key={request.id} request={request} onAccept={() => responseMutation.mutate({ id: request.id, accepted: true })} onDecline={() => responseMutation.mutate({ id: request.id, accepted: false })} />)
        ) : null}

        {user && "id" in user && tab === "Friends" ? (
          friends.length === 0 ? <Empty title="No friends yet" text="Start connecting with people nearby." icon={<Users color="#98a2b3" size={56} />} /> : friends.map((person) => <PersonCard key={person.id} person={person} />)
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PersonCard({ person, onConnect, onPass }: { person: NearbyPerson; onConnect?: () => void; onPass?: () => void }) {
  const label = person.requestStatus === "accepted" ? "Friend" : person.requestStatus === "outgoing" ? "Pending" : person.requestStatus === "incoming" ? "Respond" : "Connect";
  const canConnect = Boolean(onConnect && label === "Connect");
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => canConnect && Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx >= 72) onConnect?.();
      if (gesture.dx <= -72) onPass?.();
    },
  }), [canConnect, onConnect, onPass]);
  return (
    <View {...(canConnect ? responder.panHandlers : {})} style={styles.card}>
      <View style={styles.imageBox}><Text style={styles.initial}>{person.name.charAt(0).toUpperCase()}</Text></View>
      <View style={styles.cardBody}>
        <View style={styles.verified}><Text style={styles.verifiedText}>✓ Verified</Text></View>
        <Text style={styles.cardTitle}>{person.name}</Text>
        <Text style={styles.meta}>{person.distanceKm ? `${person.distanceKm.toFixed(1)}km away` : "Distance hidden"} · @{person.username}</Text>
        <Text style={styles.meta}>{person.bio || "Social 24x7 member"}</Text>
        <View style={styles.tags}><Text style={styles.tag}>Community</Text><Text style={styles.tag}>Nearby</Text></View>
        {onConnect ? <View style={styles.cardActions}><Pressable disabled={!canConnect} onPress={onConnect} style={[styles.darkButton, styles.cardAction, !canConnect && styles.disabled]}><Text style={styles.darkButtonText}>{label}</Text></Pressable>{canConnect ? <Pressable onPress={onPass} style={styles.passButton}><Text style={styles.passButtonText}>Pass</Text></Pressable> : null}</View> : null}
      </View>
    </View>
  );
}

function RequestCard({ request, onAccept, onDecline }: { request: NearbyRequest; onAccept: () => void; onDecline: () => void }) {
  return (
    <View style={styles.requestCard}>
      <View style={styles.smallAvatar}><Text style={styles.initial}>{request.name.charAt(0).toUpperCase()}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{request.name}</Text>
        <Text style={styles.meta}>@{request.username} · {request.status === "incoming" ? "wants to connect" : "request sent"}</Text>
      </View>
      {request.status === "incoming" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={onAccept} style={styles.iconButton}><Check size={18} color="#fff" /></Pressable>
          <Pressable onPress={onDecline} style={styles.lightIcon}><X size={18} color="#111827" /></Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Segmented<T extends string>({ tabs, active, onPick }: { tabs: readonly T[]; active: T; onPick: (tab: T) => void }) {
  return <View style={styles.segmented}>{tabs.map((item) => <Pressable key={item} onPress={() => onPick(item)} style={[styles.segment, active === item && styles.segmentActive]}><Text style={styles.segmentText}>{item}</Text></Pressable>)}</View>;
}

function Empty({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) {
  return <View style={styles.empty}>{icon}<Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: { minHeight: 74, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 18, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  title: { flex: 1, color: "#111827", fontSize: 24, fontWeight: "600" },
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  notice: { borderRadius: 14, borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", padding: 18, flexDirection: "row", gap: 14 },
  noticeTitle: { color: "#1746d6", fontSize: 16, fontWeight: "900", marginBottom: 8 },
  noticeText: { color: "#1746d6", fontSize: 15, lineHeight: 22 },
  segmented: { minHeight: 58, borderRadius: 20, backgroundColor: "#e9e9ee", padding: 6, flexDirection: "row" },
  segment: { flex: 1, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: "#fff" },
  segmentText: { fontSize: 16, fontWeight: "800", color: "#111827" },
  controlCard: { gap: 18 },
  distance: { color: "#344054", fontSize: 18 },
  sliderTrack: { height: 28, borderRadius: 14, backgroundColor: "#e5e7eb", justifyContent: "center" },
  sliderFill: { height: 12, backgroundColor: "#05051a", borderRadius: 8 },
  sliderKnob: { position: "absolute", width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "#111827", backgroundColor: "#fff" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 },
  switchLabel: { color: "#344054", fontSize: 18 },
  hint: { color: "#667085", fontSize: 12, maxWidth: 280 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#fff", overflow: "hidden" },
  imageBox: { height: 260, alignItems: "center", justifyContent: "center", backgroundColor: "#eef0f4" },
  initial: { color: "#111827", fontSize: 32, fontWeight: "800" },
  cardBody: { padding: 20, gap: 10 },
  cardActions: { flexDirection: "row", gap: 10 },
  cardAction: { flex: 1 },
  passButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: "#d0d5dd", paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  passButtonText: { color: "#344054", fontSize: 16, fontWeight: "900" },
  verified: { alignSelf: "flex-start", borderRadius: 12, backgroundColor: "#dbeafe", paddingHorizontal: 12, paddingVertical: 8 },
  verifiedText: { color: "#1746d6", fontWeight: "900" },
  cardTitle: { color: "#111827", fontSize: 20, fontWeight: "900" },
  meta: { color: "#475467", fontSize: 15, lineHeight: 22 },
  tags: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tag: { borderRadius: 10, backgroundColor: "#eef0f4", paddingHorizontal: 12, paddingVertical: 8, color: "#111827", fontWeight: "800" },
  darkButton: { minHeight: 46, borderRadius: 14, backgroundColor: "#05051a", alignItems: "center", justifyContent: "center" },
  darkButtonText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  requestCard: { borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#fff", padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  smallAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#eef0f4", alignItems: "center", justifyContent: "center" },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center" },
  lightIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#eef0f4", alignItems: "center", justifyContent: "center" },
  myProfile: { borderRadius: 16, borderWidth: 1, borderColor: "#b7ebce", backgroundColor: "#f0fdf4", padding: 16, gap: 5 },
  myProfileTitle: { color: "#166534", fontSize: 17, fontWeight: "900" },
  myProfileText: { color: "#166534", fontSize: 14, lineHeight: 20 },
  empty: { minHeight: 320, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyTitle: { color: "#475467", fontSize: 20, fontWeight: "800", textAlign: "center" },
  emptyText: { color: "#98a2b3", fontSize: 15, textAlign: "center" },
});
