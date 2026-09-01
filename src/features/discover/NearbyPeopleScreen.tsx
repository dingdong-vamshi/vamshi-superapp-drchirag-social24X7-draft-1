import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ArrowLeft,
  Check,
  Edit3,
  Filter,
  MapPin,
  Minus,
  Plus,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import * as Location from "expo-location";

import { useAuth } from "../../lib/AuthContext";
import {
  getNearbyWorkspace,
  listNearbyInterestOptions,
  respondNearbyRequest,
  saveNearbyPreference,
  saveNearbyProfile,
  sendNearbyRequest,
  touchNearbyPresence,
  type MyNearbyProfile,
  type NearbyPerson,
  type NearbyRequest,
} from "./nearbyPeopleRepository";

const tabs = ["Discover", "Requests", "Friends"] as const;
const brand = "#07934a";

export default function NearbyPeopleScreen() {
  const { user, initialized } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Discover");
  const [radiusKm, setRadiusKm] = useState(5);
  const [committedRadiusKm, setCommittedRadiusKm] = useState(5);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [passedIds, setPassedIds] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: [
      "nearby-people",
      user && "id" in user ? user.id : "guest",
      committedRadiusKm,
      onlineOnly,
    ],
    queryFn: () => getNearbyWorkspace(user, committedRadiusKm, onlineOnly),
    enabled: initialized && Boolean(user && "id" in user),
    refetchInterval: 60_000,
  });
  const interestOptionsQuery = useQuery({
    queryKey: ["nearby-interest-options"],
    queryFn: () => listNearbyInterestOptions(user),
    enabled: initialized && Boolean(user && "id" in user),
    staleTime: 10 * 60_000,
  });
  const refresh = async () =>
    queryClient.invalidateQueries({ queryKey: ["nearby-people"] });
  const preference = workspaceQuery.data?.preference;
  const enabled = Boolean(preference?.enabled);

  useEffect(() => {
    if (preference?.radiusKm) {
      setRadiusKm(preference.radiusKm);
      setCommittedRadiusKm(preference.radiusKm);
    }
  }, [preference?.radiusKm]);
  useEffect(() => {
    if (!enabled || !user || !("id" in user)) return;
    const touch = () => void touchNearbyPresence(user).catch(() => undefined);
    touch();
    const heartbeat = setInterval(touch, 60_000);
    return () => clearInterval(heartbeat);
  }, [enabled, user]);

  const toggleMutation = useMutation({
    mutationFn: async (nextEnabled: boolean) => {
      if (!nextEnabled)
        return saveNearbyPreference({
          user,
          enabled: false,
          radiusKm,
          interests: workspaceQuery.data?.myProfile.interests,
        });
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Location permission is needed to enable Nearby People.",
        );
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return saveNearbyPreference({
        user,
        enabled: true,
        radiusKm,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        interests: workspaceQuery.data?.myProfile.interests,
      });
    },
    onSuccess: refresh,
    onError: (error) =>
      Alert.alert(
        "Could not update Nearby People",
        error instanceof Error ? error.message : "Please try again.",
      ),
  });
  const requestMutation = useMutation({
    mutationFn: (recipientId: string) => sendNearbyRequest(user, recipientId),
    onSuccess: refresh,
    onError: (error) =>
      Alert.alert(
        "Could not send request",
        error instanceof Error ? error.message : "Please try again.",
      ),
  });
  const responseMutation = useMutation({
    mutationFn: ({ id, accepted }: { id: string; accepted: boolean }) =>
      respondNearbyRequest(user, id, accepted ? "accepted" : "declined"),
    onSuccess: refresh,
    onError: (error) =>
      Alert.alert(
        "Could not update request",
        error instanceof Error ? error.message : "Please try again.",
      ),
  });
  const radiusMutation = useMutation({
    mutationFn: async (nextRadiusKm: number) => {
      if (!enabled) return;
      await saveNearbyPreference({
        user,
        enabled: true,
        radiusKm: nextRadiusKm,
        interests: workspaceQuery.data?.myProfile.interests,
      });
    },
    onSuccess: refresh,
    onError: (error) =>
      Alert.alert(
        "Could not update radius",
        error instanceof Error ? error.message : "Please try again.",
      ),
  });
  const profileMutation = useMutation({
    mutationFn: ({ bio, interests }: { bio: string; interests: string[] }) =>
      saveNearbyProfile({ user, bio, interests }),
    onSuccess: async () => {
      await refresh();
      setEditorOpen(false);
    },
    onError: (error) =>
      Alert.alert(
        "Nearby profile not saved",
        error instanceof Error ? error.message : "Please try again.",
      ),
  });
  const commitRadius = (nextRadiusKm: number) => {
    setRadiusKm(nextRadiusKm);
    setCommittedRadiusKm(nextRadiusKm);
    if (enabled) radiusMutation.mutate(nextRadiusKm);
  };

  const people = (workspaceQuery.data?.people ?? []).filter(
    (person) => !passedIds.includes(person.id),
  );
  const requests = workspaceQuery.data?.requests ?? [];
  const friends = workspaceQuery.data?.friends ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={10}
        >
          <ArrowLeft size={24} color="#111827" />
        </Pressable>
        <Text style={styles.title}>Nearby People</Text>
        <Filter size={21} color="#111827" />
        <Shield size={21} color="#111827" />
      </View>

      <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled>
        <View style={styles.notice}>
          <Shield size={21} color="#1746d6" />
          <View style={styles.grow}>
            <Text style={styles.noticeTitle}>Stay Safe</Text>
            <Text style={styles.noticeText}>
              Meet in public places and use explicit Connect or Pass controls.
            </Text>
          </View>
        </View>
        <Segmented tabs={tabs} active={tab} onPick={setTab} />

        {!user || !("id" in user) ? (
          <Empty
            title="Sign in required"
            text="Nearby People needs a real Supabase test user."
            icon={<Users color="#98a2b3" size={56} />}
          />
        ) : null}

        {user && "id" in user && tab === "Discover" ? (
          <>
            <View style={styles.controlCard}>
              <View style={styles.controlTop}>
                <View>
                  <Text style={styles.distance}>
                    Discovery radius · {radiusKm.toFixed(0)} km
                  </Text>
                  <Text style={styles.hint}>
                    Only approximate distance is shown to other people.
                  </Text>
                </View>
              </View>
              <RadiusSlider
                value={radiusKm}
                onChange={setRadiusKm}
                onCommit={commitRadius}
              />
              <View style={styles.switchRow}>
                <View style={styles.grow}>
                  <Text style={styles.switchLabel}>Nearby visibility</Text>
                  <Text style={styles.hint}>
                    Your rounded location powers discovery but is never shown as
                    coordinates.
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  disabled={toggleMutation.isPending}
                  onValueChange={(value) => toggleMutation.mutate(value)}
                />
              </View>
              <View style={styles.switchRow}>
                <View style={styles.grow}>
                  <Text style={styles.switchLabel}>Online only</Text>
                  <Text style={styles.hint}>
                    People active in Nearby during the last three minutes.
                  </Text>
                </View>
                <Switch
                  value={onlineOnly}
                  disabled={!enabled}
                  onValueChange={setOnlineOnly}
                />
              </View>
            </View>
            {workspaceQuery.isLoading ? (
              <Empty
                title="Loading nearby people"
                text="Checking discoverable profiles…"
                icon={<Users color="#98a2b3" size={56} />}
              />
            ) : null}
            {!workspaceQuery.isLoading && !enabled ? (
              <Empty
                title="Nearby is off"
                text="Turn on Nearby People to see discoverable profiles."
                icon={<MapPin color="#98a2b3" size={56} />}
              />
            ) : null}
            {enabled && workspaceQuery.data?.myProfile ? (
              <MyProfileCard
                profile={workspaceQuery.data.myProfile}
                onEdit={() => setEditorOpen(true)}
              />
            ) : null}
            {!workspaceQuery.isLoading && enabled && people.length === 0 ? (
              <Empty
                title="No people found"
                text="No discoverable profiles are available inside this radius yet."
                icon={<Users color="#98a2b3" size={56} />}
              />
            ) : null}
            {enabled
              ? people.map((person) => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    onConnect={() => requestMutation.mutate(person.id)}
                    onPass={() =>
                      setPassedIds((current) =>
                        current.includes(person.id)
                          ? current
                          : [...current, person.id],
                      )
                    }
                  />
                ))
              : null}
          </>
        ) : null}

        {user && "id" in user && tab === "Requests" ? (
          requests.length === 0 ? (
            <Empty
              title="No friend requests"
              text="Connect with people to see requests here."
              icon={<UserPlus color="#98a2b3" size={56} />}
            />
          ) : (
            requests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onAccept={() =>
                  responseMutation.mutate({ id: request.id, accepted: true })
                }
                onDecline={() =>
                  responseMutation.mutate({ id: request.id, accepted: false })
                }
              />
            ))
          )
        ) : null}
        {user && "id" in user && tab === "Friends" ? (
          friends.length === 0 ? (
            <Empty
              title="No friends yet"
              text="Start connecting with people nearby."
              icon={<Users color="#98a2b3" size={56} />}
            />
          ) : (
            friends.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))
          )
        ) : null}
      </ScrollView>

      <NearbyProfileEditor
        visible={editorOpen}
        profile={workspaceQuery.data?.myProfile}
        options={interestOptionsQuery.data ?? []}
        saving={profileMutation.isPending}
        close={() => !profileMutation.isPending && setEditorOpen(false)}
        save={(bio, interests) => profileMutation.mutate({ bio, interests })}
      />
    </SafeAreaView>
  );
}

function MyProfileCard({
  profile,
  onEdit,
}: {
  profile: MyNearbyProfile;
  onEdit: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit My Nearby Profile"
      onPress={onEdit}
      style={styles.myProfile}
    >
      <Avatar name={profile.name} url={profile.avatarUrl} size={54} />
      <View style={styles.grow}>
        <Text style={styles.myProfileTitle}>My Nearby Profile</Text>
        <Text style={styles.myProfileText}>
          {profile.name} · @{profile.username}
        </Text>
        <Text numberOfLines={2} style={styles.myProfileText}>
          {profile.bio || "Add a Nearby-specific bio"}
        </Text>
        {profile.interests.length ? (
          <Text numberOfLines={1} style={styles.myProfileInterests}>
            {profile.interests.join(" · ")}
          </Text>
        ) : null}
      </View>
      <View style={styles.editIcon}>
        <Edit3 color={brand} size={17} />
      </View>
    </Pressable>
  );
}

function PersonCard({
  person,
  onConnect,
  onPass,
}: {
  person: NearbyPerson;
  onConnect?: () => void;
  onPass?: () => void;
}) {
  const { width } = useWindowDimensions();
  const viewportWidth = Math.min(720, Math.max(280, width - 40));
  const panelWidth = Math.min(430, Math.max(236, viewportWidth - 74));
  const gap = 10;
  const stride = panelWidth + gap;
  const rail = useRef<ScrollView>(null);
  const centered = useRef(false);
  const label =
    person.requestStatus === "accepted"
      ? "Friend"
      : person.requestStatus === "outgoing"
        ? "Pending"
        : person.requestStatus === "incoming"
          ? "Respond in Requests"
          : "Connect";
  const canConnect = Boolean(onConnect && label === "Connect");
  const centerProfile = () => {
    if (centered.current) return;
    centered.current = true;
    requestAnimationFrame(() =>
      rail.current?.scrollTo({ x: stride, animated: false }),
    );
  };
  return (
    <View style={styles.personShell}>
      <ScrollView
        ref={rail}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={stride}
        snapToAlignment="start"
        disableIntervalMomentum
        onLayout={centerProfile}
        contentContainerStyle={{
          gap,
          paddingHorizontal: Math.max(0, (viewportWidth - panelWidth) / 2),
        }}
        style={{ width: viewportWidth, alignSelf: "center" }}
      >
        <View
          style={[
            styles.infoPanel,
            styles.interestsPanel,
            { width: panelWidth },
          ]}
        >
          <Text style={styles.panelEyebrow}>INTERESTS</Text>
          <Text style={styles.panelTitle}>
            What {person.name.split(" ")[0]} enjoys
          </Text>
          <View style={styles.interestWrap}>
            {person.interests.length ? (
              person.interests.map((interest) => (
                <View key={interest} style={styles.interestChip}>
                  <Text style={styles.interestChipText}>{interest}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.panelBodyMuted}>
                No Nearby interests added yet.
              </Text>
            )}
          </View>
        </View>
        <View
          style={[styles.infoPanel, styles.profilePanel, { width: panelWidth }]}
        >
          <View style={styles.avatarFrame}>
            <Avatar name={person.name} url={person.avatarUrl} size={116} />
            {person.isOnline ? <View style={styles.onlineDot} /> : null}
          </View>
          <Text style={styles.profileName}>{person.name}</Text>
          <Text style={styles.profileMeta}>@{person.username}</Text>
          <Text style={styles.profileMeta}>
            {person.distanceKm === null
              ? "Approximate distance unavailable"
              : `${person.distanceKm.toFixed(1)} km away`}{" "}
            · {person.isOnline ? "Online" : "Recently seen"}
          </Text>
          {onConnect ? (
            <View style={styles.cardActions}>
              <Pressable
                disabled={!canConnect}
                onPress={onConnect}
                style={[
                  styles.connectButton,
                  styles.grow,
                  !canConnect && styles.disabled,
                ]}
              >
                <Text style={styles.connectButtonText}>{label}</Text>
              </Pressable>
              {canConnect ? (
                <Pressable onPress={onPass} style={styles.passButton}>
                  <Text style={styles.passButtonText}>Pass</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.friendBadge}>
              <Text style={styles.friendBadgeText}>Friend</Text>
            </View>
          )}
        </View>
        <View
          style={[styles.infoPanel, styles.bioPanel, { width: panelWidth }]}
        >
          <Text style={styles.panelEyebrow}>BIO</Text>
          <Text style={styles.panelTitle}>
            A little about {person.name.split(" ")[0]}
          </Text>
          <Text style={styles.panelBody}>
            {person.bio || "No Nearby bio added yet."}
          </Text>
        </View>
      </ScrollView>
      <View style={styles.panelHint}>
        <Text style={styles.panelHintText}>Interests ← Profile → Bio</Text>
      </View>
    </View>
  );
}

function NearbyProfileEditor({
  visible,
  profile,
  options,
  saving,
  close,
  save,
}: {
  visible: boolean;
  profile?: MyNearbyProfile;
  options: string[];
  saving: boolean;
  close: () => void;
  save: (bio: string, interests: string[]) => void;
}) {
  const [bio, setBio] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  useEffect(() => {
    if (visible && profile) {
      setBio(profile.bio);
      setSelected(profile.interests);
      setCustom("");
    }
  }, [profile, visible]);
  const toggle = (interest: string) =>
    setSelected((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : current.length < 12
          ? [...current, interest]
          : current,
    );
  const addCustom = () => {
    const clean = custom.trim().slice(0, 40);
    if (
      !clean ||
      selected.some(
        (item) => item.toLocaleLowerCase() === clean.toLocaleLowerCase(),
      ) ||
      selected.length >= 12
    )
      return;
    setSelected((current) => [...current, clean]);
    setCustom("");
  };
  const allOptions = [...new Set([...options, ...selected])];
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.editorHeader}>
          <View>
            <Text style={styles.editorTitle}>Edit Nearby Profile</Text>
            <Text style={styles.editorSubtitle}>
              Separate from your Social Profile
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Nearby Profile editor"
            onPress={close}
            style={styles.editorClose}
          >
            <X color="#172235" size={21} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.editorContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.fieldLabel}>Nearby bio</Text>
          <TextInput
            accessibilityLabel="Nearby bio"
            value={bio}
            onChangeText={setBio}
            maxLength={500}
            multiline
            placeholder="What would you like nearby people to know?"
            placeholderTextColor="#98a2b3"
            style={styles.bioInput}
          />
          <Text style={styles.counter}>{bio.length}/500</Text>
          <Text style={styles.fieldLabel}>Interests</Text>
          <Text style={styles.editorHelp}>
            Choose up to 12. These are visible only when Nearby discovery is
            enabled.
          </Text>
          <View style={styles.interestWrap}>
            {allOptions.map((interest) => {
              const active = selected.includes(interest);
              return (
                <Pressable
                  key={interest}
                  onPress={() => toggle(interest)}
                  style={[styles.editorChip, active && styles.editorChipActive]}
                >
                  <Text
                    style={[
                      styles.editorChipText,
                      active && styles.editorChipTextActive,
                    ]}
                  >
                    {interest}
                  </Text>
                  {active ? <Check size={14} color="#fff" /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.customRow}>
            <TextInput
              accessibilityLabel="Add a custom Nearby interest"
              value={custom}
              onChangeText={setCustom}
              maxLength={40}
              placeholder="Add another interest"
              placeholderTextColor="#98a2b3"
              style={styles.customInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add custom interest"
              disabled={!custom.trim() || selected.length >= 12}
              onPress={addCustom}
              style={[
                styles.addInterest,
                (!custom.trim() || selected.length >= 12) && styles.disabled,
              ]}
            >
              <Plus color="#fff" size={18} />
            </Pressable>
          </View>
        </ScrollView>
        <View style={styles.editorFooter}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save Nearby Profile"
            disabled={saving}
            onPress={() => save(bio, selected)}
            style={[styles.saveButton, saving && styles.disabled]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? "Saving…" : "Save Nearby Profile"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Avatar({
  name,
  url,
  size,
}: {
  name: string;
  url?: string | null;
  size: number;
}) {
  return url ? (
    <Image
      accessibilityLabel={`${name} profile image`}
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.3 }]}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}
function RadiusSlider({
  value,
  onChange,
  onCommit,
}: {
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const widthRef = useRef(1);
  const updateFromPosition = (position: number) => {
    const next = Math.max(
      1,
      Math.min(
        50,
        Math.round(
          1 +
            (Math.max(0, Math.min(widthRef.current, position)) /
              widthRef.current) *
              49,
        ),
      ),
    );
    onChange(next);
    onCommit(next);
  };
  const step = (delta: number) => {
    const next = Math.max(1, Math.min(50, value + delta));
    onChange(next);
    onCommit(next);
  };
  const percent = ((value - 1) / 49) * 100;
  return (
    <View style={styles.sliderControl}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease Nearby distance"
        disabled={value <= 1}
        onPress={() => step(-1)}
        style={styles.sliderStep}
      >
        <Minus size={17} color={brand} />
      </Pressable>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Nearby distance radius"
        accessibilityValue={{
          min: 1,
          max: 50,
          now: value,
          text: `${value} kilometres`,
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) =>
          step(event.nativeEvent.actionName === "increment" ? 1 : -1)
        }
        onPress={(event) => updateFromPosition(event.nativeEvent.locationX)}
        onLayout={(event) => {
          widthRef.current = Math.max(1, event.nativeEvent.layout.width);
        }}
        style={styles.sliderTrack}
      >
        <View style={[styles.sliderFill, { width: `${percent}%` }]} />
        <View
          style={[
            styles.sliderKnob,
            { left: `${Math.max(0, Math.min(94, percent - 2))}%` },
          ]}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase Nearby distance"
        disabled={value >= 50}
        onPress={() => step(1)}
        style={styles.sliderStep}
      >
        <Plus size={17} color={brand} />
      </Pressable>
    </View>
  );
}
function RequestCard({
  request,
  onAccept,
  onDecline,
}: {
  request: NearbyRequest;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.requestCard}>
      <Avatar name={request.name} size={56} />
      <View style={styles.grow}>
        <Text style={styles.cardTitle}>{request.name}</Text>
        <Text style={styles.meta}>
          @{request.username} ·{" "}
          {request.status === "incoming" ? "wants to connect" : "request sent"}
        </Text>
      </View>
      {request.status === "incoming" ? (
        <View style={styles.requestActions}>
          <Pressable
            accessibilityLabel={`Accept ${request.name}`}
            onPress={onAccept}
            style={styles.iconButton}
          >
            <Check size={18} color="#fff" />
          </Pressable>
          <Pressable
            accessibilityLabel={`Decline ${request.name}`}
            onPress={onDecline}
            style={styles.lightIcon}
          >
            <X size={18} color="#111827" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
function Segmented<T extends string>({
  tabs: values,
  active,
  onPick,
}: {
  tabs: readonly T[];
  active: T;
  onPick: (tab: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {values.map((item) => (
        <Pressable
          key={item}
          onPress={() => onPick(item)}
          style={[styles.segment, active === item && styles.segmentActive]}
        >
          <Text style={styles.segmentText}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function Empty({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f9f8" },
  grow: { flex: 1, minWidth: 0 },
  header: {
    minHeight: 66,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: { flex: 1, color: "#111827", fontSize: 23, fontWeight: "700" },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    gap: 16,
    paddingBottom: 44,
  },
  notice: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 15,
    flexDirection: "row",
    gap: 12,
  },
  noticeTitle: {
    color: "#1746d6",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  noticeText: { color: "#1746d6", fontSize: 13, lineHeight: 19 },
  segmented: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#e9e9ee",
    padding: 5,
    flexDirection: "row",
  },
  segment: {
    flex: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: "#fff" },
  segmentText: { fontSize: 14, fontWeight: "800", color: "#111827" },
  controlCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e1e7e3",
    backgroundColor: "#fff",
    padding: 16,
    gap: 16,
  },
  controlTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  distance: { color: "#344054", fontSize: 17, fontWeight: "800" },
  hint: { marginTop: 3, color: "#667085", fontSize: 11, lineHeight: 16 },
  sliderControl: { flexDirection: "row", alignItems: "center", gap: 10 },
  sliderStep: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#cfe7da",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  sliderTrack: {
    flex: 1,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
  },
  sliderFill: { height: 10, backgroundColor: brand, borderRadius: 7 },
  sliderKnob: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: brand,
    backgroundColor: "#fff",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  switchLabel: { color: "#344054", fontSize: 15, fontWeight: "700" },
  myProfile: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#b7ebce",
    backgroundColor: "#f0fdf4",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  myProfileTitle: { color: "#166534", fontSize: 16, fontWeight: "900" },
  myProfileText: {
    marginTop: 2,
    color: "#31734a",
    fontSize: 12,
    lineHeight: 17,
  },
  myProfileInterests: {
    marginTop: 4,
    color: "#08713d",
    fontSize: 11,
    fontWeight: "700",
  },
  editIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  personShell: {
    marginHorizontal: -20,
    paddingVertical: 2,
    overflow: "hidden",
  },
  infoPanel: {
    minHeight: 390,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    overflow: "hidden",
  },
  interestsPanel: { borderColor: "#cbdff4", backgroundColor: "#eef6ff" },
  profilePanel: {
    borderColor: "#dbe3de",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  bioPanel: { borderColor: "#ead7cb", backgroundColor: "#fff5ee" },
  panelEyebrow: {
    color: "#52645b",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  panelTitle: {
    marginTop: 7,
    color: "#172235",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  panelBody: { marginTop: 18, color: "#344054", fontSize: 16, lineHeight: 25 },
  panelBodyMuted: { color: "#7c8982", fontSize: 14, lineHeight: 21 },
  interestWrap: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  interestChip: {
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c9dbea",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  interestChipText: { color: "#334c63", fontSize: 13, fontWeight: "700" },
  avatarFrame: { position: "relative" },
  avatar: {
    backgroundColor: "#dff4e8",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { color: brand, fontWeight: "900" },
  onlineDot: {
    position: "absolute",
    right: 5,
    bottom: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "#22c55e",
  },
  profileName: {
    marginTop: 14,
    color: "#111827",
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center",
  },
  profileMeta: {
    marginTop: 4,
    color: "#667085",
    fontSize: 13,
    textAlign: "center",
  },
  cardActions: { width: "100%", marginTop: 20, flexDirection: "row", gap: 9 },
  connectButton: {
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  passButton: {
    minHeight: 46,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  passButtonText: { color: "#344054", fontSize: 14, fontWeight: "900" },
  friendBadge: {
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: "#e9f8ef",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  friendBadgeText: { color: brand, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  panelHint: {
    alignSelf: "center",
    marginTop: 9,
    borderRadius: 999,
    backgroundColor: "#edf2ef",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  panelHintText: { color: "#68766f", fontSize: 11, fontWeight: "700" },
  requestCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e1e5eb",
    backgroundColor: "#fff",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  requestActions: { flexDirection: "row", gap: 8 },
  cardTitle: { color: "#111827", fontSize: 18, fontWeight: "900" },
  meta: { marginTop: 3, color: "#475467", fontSize: 13, lineHeight: 19 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  lightIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#eef0f4",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    padding: 24,
  },
  emptyTitle: {
    color: "#475467",
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: "#98a2b3",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  editorHeader: {
    minHeight: 68,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  editorTitle: { color: "#172235", fontSize: 20, fontWeight: "900" },
  editorSubtitle: { marginTop: 3, color: "#667085", fontSize: 12 },
  editorClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eef2ef",
    alignItems: "center",
    justifyContent: "center",
  },
  editorContent: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 36,
  },
  fieldLabel: {
    marginTop: 8,
    color: "#172235",
    fontSize: 16,
    fontWeight: "800",
  },
  editorHelp: { marginTop: 5, color: "#667085", fontSize: 12, lineHeight: 18 },
  bioInput: {
    marginTop: 10,
    minHeight: 130,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d8e1dc",
    backgroundColor: "#fff",
    padding: 14,
    color: "#172235",
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  counter: { marginTop: 5, color: "#98a2b3", fontSize: 11, textAlign: "right" },
  editorChip: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d6dfda",
    backgroundColor: "#fff",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  editorChipActive: { borderColor: brand, backgroundColor: brand },
  editorChipText: { color: "#475467", fontSize: 13, fontWeight: "700" },
  editorChipTextActive: { color: "#fff" },
  customRow: { marginTop: 16, flexDirection: "row", gap: 9 },
  customInput: {
    flex: 1,
    height: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#d8e1dc",
    backgroundColor: "#fff",
    paddingHorizontal: 13,
    color: "#172235",
  },
  addInterest: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: brand,
    alignItems: "center",
    justifyContent: "center",
  },
  editorFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  saveButton: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    minHeight: 50,
    borderRadius: 17,
    backgroundColor: brand,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { color: "#fff", fontSize: 15, fontWeight: "900" },
});
