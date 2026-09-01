import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  KeyRound,
  LocateFixed,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react-native";
import { normalizePhone } from "../auth/authValidation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";

type Section = "privacy" | "location" | "payments" | "security";

const labels: Record<Section, string> = {
  privacy: "Privacy & safety",
  location: "Location preferences",
  payments: "Payments",
  security: "Security",
};

export default function AccountSettingsScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const section = (
    Object.hasOwn(labels, params.section ?? "") ? params.section : "privacy"
  ) as Section;
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [discoverable, setDiscoverable] = useState(false);
  const [locationStatus, setLocationStatus] = useState<
    Location.PermissionStatus | "unavailable"
  >("unavailable");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const [phoneResult, profileResult, permission] = await Promise.all([
      supabase.rpc("get_my_login_phone"),
      supabase
        .from("profiles")
        .select("discoverable")
        .eq("id", user.id)
        .maybeSingle(),
      Location.getForegroundPermissionsAsync().catch(() => null),
    ]);
    if (!phoneResult.error && typeof phoneResult.data === "string")
      setPhone(phoneResult.data);
    if (!profileResult.error && profileResult.data)
      setDiscoverable(Boolean(profileResult.data.discoverable));
    setLocationStatus(permission?.status ?? "unavailable");
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const updatePhone = async () => {
    const normalized = normalizePhone(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setFeedback("Enter a valid phone number.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    setFeedback("");
    try {
      const { data, error } = await supabase.rpc("update_my_login_phone", {
        p_phone: normalized,
      });
      if (error) throw error;
      setPhone(String(data));
      setFeedback(
        "Phone number updated. Use this number the next time you log in.",
      );
    } catch {
      setFeedback(
        "Unable to update the phone number. Check the number and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const updatePassword = async () => {
    if (
      newPassword.length < 8 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      setFeedback("Use at least 8 characters with a letter and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback("Passwords do not match.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    setFeedback("");
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setFeedback("Password updated securely.");
    } catch {
      setFeedback("Unable to update the password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const setNearbyVisibility = async (value: boolean) => {
    if (!supabase || !user) return;
    setDiscoverable(value);
    const { error } = await supabase
      .from("profiles")
      .update({ discoverable: value })
      .eq("id", user.id);
    if (error) {
      setDiscoverable(!value);
      Alert.alert(
        "Setting not saved",
        "Please check your connection and try again.",
      );
    }
  };

  const requestLocation = async () => {
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      setLocationStatus(result.status);
      if (result.status !== Location.PermissionStatus.GRANTED) {
        setFeedback(
          "Location remains off. You can change permission in device or browser settings.",
        );
      } else {
        setFeedback(
          "Approximate Nearby access is available. Exact coordinates are not shown here.",
        );
      }
    } catch {
      setLocationStatus("unavailable");
      setFeedback("Location is unavailable on this device or browser.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <ArrowLeft size={21} color="#102033" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            {labels[section]}
          </Text>
          <Text style={styles.subtitle}>Social24 account settings</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {feedback ? (
          <View accessibilityRole="alert" style={styles.feedback}>
            <CheckCircle2 size={18} color="#087447" />
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        ) : null}

        {section === "privacy" || section === "security" ? (
          <>
            <SettingsCard
              icon={Phone}
              title="Change phone number"
              copy="This is the authoritative phone confirmation used with your email and password at login."
            >
              <TextInput
                accessibilityLabel="New phone number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                placeholderTextColor="#98a2b3"
                style={styles.input}
              />
              <Action
                label="Update phone number"
                disabled={busy}
                onPress={() => void updatePhone()}
              />
            </SettingsCard>
            <SettingsCard
              icon={KeyRound}
              title="Change password"
              copy="Your current authenticated session is required. Passwords are handled only by Supabase Auth."
            >
              <TextInput
                accessibilityLabel="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="New password"
                placeholderTextColor="#98a2b3"
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="Confirm new password"
                placeholderTextColor="#98a2b3"
                style={styles.input}
              />
              <Action
                label="Update password"
                disabled={busy}
                onPress={() => void updatePassword()}
              />
            </SettingsCard>
            {section === "privacy" ? (
              <SettingsCard
                icon={ShieldCheck}
                title="Discovery visibility"
                copy="People can find you in Nearby only when you allow it. Exact coordinates are never displayed."
              >
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>
                    Appear in Nearby People
                  </Text>
                  <Switch
                    accessibilityLabel="Appear in Nearby People"
                    value={discoverable}
                    onValueChange={(value) => void setNearbyVisibility(value)}
                  />
                </View>
              </SettingsCard>
            ) : (
              <SettingsCard
                icon={ShieldCheck}
                title="Current session"
                copy={`Signed in as ${user?.email ?? "your Social24 account"}. Device-session history is not exposed by the current Auth provider, so no invented device list is shown.`}
              />
            )}
          </>
        ) : null}

        {section === "location" ? (
          <SettingsCard
            icon={MapPin}
            title="Nearby location"
            copy="Social24 requests foreground location only for Nearby features and uses approximate distance in discovery."
          >
            <View style={styles.statusRow}>
              <LocateFixed size={18} color="#087447" />
              <Text style={styles.statusText}>
                Permission: {locationStatus}
              </Text>
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Nearby discovery visibility
              </Text>
              <Switch
                accessibilityLabel="Nearby discovery visibility"
                value={discoverable}
                onValueChange={(value) => void setNearbyVisibility(value)}
              />
            </View>
            <Action
              label={
                locationStatus === Location.PermissionStatus.GRANTED
                  ? "Refresh permission"
                  : "Allow location"
              }
              disabled={busy}
              onPress={() => void requestLocation()}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/nearby-people")}
              style={styles.secondaryAction}
            >
              <Text style={styles.secondaryActionText}>
                Open Nearby radius controls
              </Text>
            </Pressable>
          </SettingsCard>
        ) : null}

        {section === "payments" ? (
          <SettingsCard
            icon={CreditCard}
            title="Payment methods"
            copy="Payment methods and provider integration are coming soon. Social24 does not currently claim a connected card, UPI, bank, or payout provider."
          >
            <View style={styles.comingSoon}>
              <Text style={styles.comingSoonText}>Coming Soon</Text>
            </View>
          </SettingsCard>
        ) : null}
        {busy ? <ActivityIndicator color="#0aa766" /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  copy,
  children,
}: {
  icon: typeof Phone;
  title: string;
  copy: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeading}>
        <View style={styles.cardIcon}>
          <Icon size={20} color="#087447" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardCopy}>{copy}</Text>
        </View>
      </View>
      {children ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

function Action({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.disabled]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f8f6" },
  header: {
    minHeight: 72,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#dfe8e3",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#eef4f0",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: "#102033", fontSize: 23, fontWeight: "900" },
  subtitle: { color: "#64748b", fontSize: 12, marginTop: 2 },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 48,
    gap: 14,
  },
  feedback: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#bee4cf",
    backgroundColor: "#ebf8f1",
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  feedbackText: { flex: 1, color: "#245b40", fontSize: 13, lineHeight: 19 },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dfe8e3",
    backgroundColor: "#fff",
    padding: 17,
    gap: 15,
  },
  cardHeading: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#edf8f2",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: "#102033", fontSize: 17, fontWeight: "900" },
  cardCopy: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 4 },
  cardBody: { gap: 11 },
  input: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d5dfda",
    backgroundColor: "#fbfdfc",
    color: "#102033",
    paddingHorizontal: 13,
    fontSize: 15,
  },
  action: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#0aa766",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  secondaryAction: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bcd9c9",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: { color: "#087447", fontSize: 13, fontWeight: "900" },
  switchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchLabel: { flex: 1, color: "#344054", fontSize: 14, fontWeight: "700" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 13,
    backgroundColor: "#edf8f2",
    padding: 12,
  },
  statusText: {
    color: "#275c43",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  comingSoon: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#edf8f2",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  comingSoonText: { color: "#087447", fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.55 },
});
