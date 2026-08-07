import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Bell,
  ChevronRight,
  CircleHelp,
  CreditCard,
  LockKeyhole,
  MapPin,
  Pencil,
  ReceiptText,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react-native";
import {
  localProfileRepository,
  ProfileRepository,
  UserProfile,
} from "./profileRepository";

type Props = {
  repository?: ProfileRepository;
  onOpenOrders?: () => void;
  onOpenSaved?: () => void;
  onSignOut?: () => void;
};
type Status = "loading" | "ready" | "error";

export function ProfileScreen({
  repository = localProfileRepository,
  onOpenOrders,
  onOpenSaved,
  onSignOut,
}: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<UserProfile | null>(null);
  const [isSaving, setSaving] = useState(false);
  const load = async () => {
    setStatus("loading");
    try {
      const next = await repository.getProfile();
      setProfile(next);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };
  useEffect(() => {
    void load();
  }, [repository]);
  const save = async () => {
    if (!draft || !draft.displayName.trim() || !draft.handle.trim()) {
      Alert.alert("Complete your profile", "Name and username are required.");
      return;
    }
    setSaving(true);
    try {
      const updated = await repository.updateProfile({
        ...draft,
        displayName: draft.displayName.trim(),
        handle: draft.handle.trim().replace(/^@/, ""),
        avatarInitials: draft.displayName.trim().slice(0, 1).toUpperCase(),
      });
      setProfile(updated);
      setEditorOpen(false);
    } catch {
      Alert.alert(
        "Changes not saved",
        "Please try again when you have a connection.",
      );
    } finally {
      setSaving(false);
    }
  };
  if (status === "loading")
    return <State loading label="Loading your account…" />;
  if (status === "error" || !profile)
    return (
      <State
        label="We couldn’t load your account."
        actionLabel="Try again"
        onAction={() => void load()}
      />
    );
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      accessibilityLabel="Profile"
    >
      <View style={styles.top}>
        <View>
          <Text style={styles.title}>You</Text>
          <Text style={styles.profileSubtitle}>Your Social 24x7 account</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          onPress={() => {
            setDraft(profile);
            setEditorOpen(true);
          }}
          style={styles.editIcon}
        >
          <Pencil size={19} color="#08713d" />
        </Pressable>
      </View>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.avatarInitials}</Text>
        </View>
        <View style={styles.identity}>
          <Text style={styles.name}>{profile.displayName}</Text>
          <View style={styles.idPill}>
            <Text style={styles.idPillText}>@{profile.handle}</Text>
          </View>
          <Text style={styles.bio}>{profile.bio}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setDraft(profile);
          setEditorOpen(true);
        }}
        style={styles.editButton}
      >
        <Text style={styles.editButtonText}>Edit profile</Text>
      </Pressable>
      <Text style={styles.sectionTitle}>Your activity</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon={ReceiptText}
          title="Orders & purchases"
          subtitle="Track delivery and purchase history"
          onPress={onOpenOrders}
        />
        <SettingsRow
          icon={UserRound}
          title="Saved content"
          subtitle="Posts, products and collections"
          onPress={onOpenSaved}
        />
      </View>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon={Bell}
          title="Notifications"
          subtitle="Messages, orders and activity"
        />
        <SettingsRow
          icon={LockKeyhole}
          title="Privacy & safety"
          subtitle={
            profile.discoverable
              ? "Visible to people you approve"
              : "Not discoverable"
          }
          onPress={() => {
            setDraft(profile);
            setEditorOpen(true);
          }}
        />
        <SettingsRow
          icon={MapPin}
          title="Location preferences"
          subtitle="Control nearby features"
        />
      </View>
      <Text style={styles.sectionTitle}>Payments & support</Text>
      <View style={styles.sectionCard}>
        <SettingsRow
          icon={CreditCard}
          title="Payments"
          subtitle="Payment methods are protected"
        />
        <SettingsRow
          icon={ShieldCheck}
          title="Security"
          subtitle="Password and active sessions"
        />
        <SettingsRow
          icon={CircleHelp}
          title="Help centre"
          subtitle="Get support with your account"
        />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          onSignOut
            ? onSignOut()
            : Alert.alert(
                "Sign out",
                "Connect your authentication provider before enabling account sign out.",
              )
        }
        style={styles.signOut}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      <Modal
        visible={isEditorOpen}
        animationType="slide"
        onRequestClose={() => setEditorOpen(false)}
      >
        <ScrollView
          style={styles.editorScreen}
          contentContainerStyle={styles.editorContent}
        >
          <View style={styles.editorHeader}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditorOpen(false)}
            >
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.editorTitle}>Edit profile</Text>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={() => void save()}
            >
              <Text style={[styles.save, isSaving && styles.dim]}>
                {isSaving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
          {draft && (
            <>
              <View style={styles.editorAvatar}>
                <Text style={styles.avatarText}>
                  {draft.displayName.slice(0, 1).toUpperCase() || "?"}
                </Text>
              </View>
              <Field
                label="Name"
                value={draft.displayName}
                onChangeText={(displayName) =>
                  setDraft({ ...draft, displayName })
                }
                autoCapitalize="words"
              />
              <Field
                label="Username"
                value={draft.handle}
                onChangeText={(handle) => setDraft({ ...draft, handle })}
                autoCapitalize="none"
                prefix="@"
              />
              <Field
                label="Bio"
                value={draft.bio}
                onChangeText={(bio) => setDraft({ ...draft, bio })}
                multiline
              />
              <Field
                label="Email"
                value={draft.email}
                onChangeText={(email) => setDraft({ ...draft, email })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Phone"
                value={draft.phone}
                onChangeText={(phone) => setDraft({ ...draft, phone })}
                keyboardType="phone-pad"
              />
              <Text style={styles.privacyHeading}>Discovery & contact</Text>
              <PrivacySwitch
                title="Appear in Nearby People"
                body="People can only contact you after approval."
                value={draft.discoverable}
                onChange={(discoverable) =>
                  setDraft({ ...draft, discoverable })
                }
              />
              <PrivacySwitch
                title="Find me by username"
                body="Lets people find your public profile with @${draft.handle || 'username'}."
                value={draft.usernameDiscoverable}
                onChange={(usernameDiscoverable) =>
                  setDraft({ ...draft, usernameDiscoverable })
                }
              />
              <PrivacySwitch
                title="Find me by phone number"
                body={
                  draft.phone
                    ? "Only people who already have this number can find you."
                    : "Add a phone number before turning this on."
                }
                value={draft.phoneDiscoverable}
                disabled={!draft.phone.trim()}
                onChange={(phoneDiscoverable) =>
                  setDraft({ ...draft, phoneDiscoverable })
                }
              />
            </>
          )}
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}
function SettingsRow({
  icon: Icon,
  title,
  subtitle,
  onPress,
}: {
  icon: typeof Bell;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon size={19} color="#08713d" />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <ChevronRight size={19} color="#9aa6b2" />
    </Pressable>
  );
}
function Field({
  label,
  prefix,
  ...props
}: {
  label: string;
  prefix?: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  autoCapitalize?: "none" | "words";
  keyboardType?: "default" | "email-address" | "phone-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          {...props}
          placeholderTextColor="#94a3b8"
          style={[styles.input, props.multiline && styles.multiline]}
        />
      </View>
    </View>
  );
}
function PrivacySwitch({
  title,
  body,
  value,
  disabled,
  onChange,
}: {
  title: string;
  body: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.switchRow, disabled && styles.disabledSwitchRow]}>
      <View style={styles.switchCopy}>
        <Text style={[styles.switchTitle, disabled && styles.disabledText]}>
          {title}
        </Text>
        <Text style={styles.switchSub}>{body}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: "#d6ddd9", true: "#9ee9bd" }}
        thumbColor={value ? "#08713d" : "#fff"}
      />
    </View>
  );
}
function State({
  loading,
  label,
  actionLabel,
  onAction,
}: {
  loading?: boolean;
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.state}>
      {loading && <ActivityIndicator color="#009b51" />}
      <Text style={styles.stateText}>{label}</Text>
      {actionLabel && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={styles.try}
        >
          <Text style={styles.tryText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingBottom: 42 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 72,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: "#111111",
  },
  profileSubtitle: { color: "#7c8781", fontSize: 12, marginTop: 1 },
  editIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "#f4f4f4",
  },
  hero: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#eff9f2",
    borderWidth: 1,
    borderColor: "#dcefe2",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 15,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: "#07c160",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 28, fontWeight: "700", color: "#fff" },
  identity: { flex: 1 },
  name: { fontSize: 20, fontWeight: "600", color: "#111111" },
  handle: { fontSize: 14, color: "#576b95", marginTop: 2 },
  idPill: {
    alignSelf: "flex-start",
    marginTop: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
  idPillText: { color: "#08783f", fontSize: 12, fontWeight: "700" },
  bio: { fontSize: 14, lineHeight: 20, color: "#777777", marginTop: 9 },
  editButton: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d8e9dd",
  },
  editButtonText: { fontWeight: "700", color: "#08783f" },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#888888",
    marginTop: 24,
    marginBottom: 9,
    paddingHorizontal: 16,
  },
  sectionCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf0ee",
    overflow: "hidden",
    boxShadow: "0 5px 16px rgba(20, 35, 27, 0.05)",
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#edf0ee",
  },
  rowIcon: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eaf7ee",
  },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "500", color: "#111111" },
  rowSub: { fontSize: 12, color: "#888888", marginTop: 3 },
  signOut: {
    marginTop: 26,
    marginHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#fff4f4",
    borderWidth: 1,
    borderColor: "#f5dede",
    borderRadius: 16,
  },
  signOutText: { fontSize: 15, fontWeight: "800", color: "#c32636" },
  state: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 30,
    backgroundColor: "#ffffff",
  },
  stateText: { color: "#526071", fontSize: 15, textAlign: "center" },
  try: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: "#e5f4eb",
    borderRadius: 14,
  },
  tryText: { fontWeight: "800", color: "#08713d" },
  editorScreen: { flex: 1, backgroundColor: "#ffffff" },
  editorContent: { padding: 20, paddingBottom: 36 },
  editorHeader: {
    height: 45,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  cancel: { fontSize: 15, color: "#526071" },
  editorTitle: { fontSize: 17, fontWeight: "900", color: "#14171f" },
  save: { fontSize: 15, fontWeight: "900", color: "#08713d" },
  dim: { opacity: 0.5 },
  editorAvatar: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: "#07c160",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  field: { marginBottom: 18 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#344054",
    marginBottom: 7,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#deded9",
    borderRadius: 16,
    paddingHorizontal: 13,
    backgroundColor: "#ffffff",
  },
  prefix: { fontSize: 15, color: "#64748b", paddingRight: 2 },
  input: { flex: 1, minHeight: 49, fontSize: 15, color: "#172033" },
  multiline: { height: 92, paddingVertical: 12, textAlignVertical: "top" },
  privacyHeading: {
    fontSize: 15,
    fontWeight: "900",
    color: "#14171f",
    marginTop: 4,
    marginBottom: 8,
  },
  switchRow: {
    padding: 15,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ece6dd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  disabledSwitchRow: { backgroundColor: "#f0f0ed" },
  switchCopy: { flex: 1 },
  switchTitle: { fontSize: 14, fontWeight: "800", color: "#172033" },
  disabledText: { color: "#718096" },
  switchSub: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
    maxWidth: 240,
  },
});
