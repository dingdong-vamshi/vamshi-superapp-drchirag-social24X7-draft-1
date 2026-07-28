import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import {
  ArrowRight,
  AtSign,
  LockKeyhole,
  Mail,
  MessageCircle,
  Phone,
  UserRound,
} from "lucide-react-native";
import { useAuth } from "../../src/lib/AuthContext";

const accent = "#0f9f5f";
const ink = "#14171f";
const muted = "#667085";
const line = "#d9dee7";

export default function LoginScreen() {
  const { signIn, signInDemo, configured } = useAuth();
  const [mode, setMode] = useState<"demo" | "email">("demo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isBusy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "demo") {
        const cleanedUsername = username
          .trim()
          .replace(/[^a-zA-Z0-9_]/g, "")
          .toLowerCase()
          .slice(0, 24);
        if (!phone.trim() || !cleanedUsername) {
          Alert.alert(
            "Missing details",
            "Enter your phone number and username.",
          );
          return;
        }
        await signInDemo({
          phone,
          username: cleanedUsername,
          displayName: displayName.trim() || "You",
        });
        router.replace("/social");
        return;
      }

      if (!configured) {
        Alert.alert(
          "Missing configuration",
          "Set SUPABASE env variables before email sign in.",
        );
        return;
      }
      if (!email.trim() || !password.trim()) {
        Alert.alert("Missing details", "Enter your email and password.");
        return;
      }

      const result = await signIn({
        email: email.trim().toLowerCase(),
        password,
      });
      if (result.error) {
        Alert.alert("Sign in failed", result.error.message);
        return;
      }
      if (!result.data.session) {
        Alert.alert("No active session", "Unable to start session right now.");
        return;
      }
      router.replace("/social");
    } catch (error) {
      Alert.alert(
        "Sign in failed",
        error instanceof Error ? error.message : "Try again later.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <MessageCircle size={27} color="#ffffff" fill="#ffffff" />
            </View>
            <View>
              <Text style={styles.appName}>Social 24x7</Text>
              <Text style={styles.appMeta}>Connect. Share. Always.</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.title}>Log in</Text>
            <Text style={styles.subtitle}>
              Use your phone and username to continue.
            </Text>
          </View>

          <View style={styles.panel}>
            <View style={styles.modeWrap}>
              <ModeButton
                label="Phone"
                active={mode === "demo"}
                onPress={() => setMode("demo")}
              />
              <ModeButton
                label="Email"
                active={mode === "email"}
                onPress={() => setMode("email")}
              />
            </View>

            {mode === "demo" ? (
              <>
                <Field
                  icon={UserRound}
                  value={displayName}
                  placeholder="Display name"
                  autoCapitalize="words"
                  onChangeText={setDisplayName}
                />
                <Field
                  icon={Phone}
                  value={phone}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  onChangeText={setPhone}
                />
                <Field
                  icon={AtSign}
                  value={username}
                  placeholder="Username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setUsername}
                />
              </>
            ) : (
              <>
                <Field
                  icon={Mail}
                  value={email}
                  autoCapitalize="none"
                  autoComplete="email"
                  placeholder="Email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                />
                <Field
                  icon={LockKeyhole}
                  value={password}
                  placeholder="Password"
                  secureTextEntry
                  onChangeText={setPassword}
                  autoCapitalize="none"
                />
              </>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                mode === "demo"
                  ? "Enter Social 24x7 as demo user"
                  : "Log in to Social 24x7"
              }
              onPress={() => void submit()}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.pressed,
                isBusy && styles.disabled,
              ]}
            >
              {isBusy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text style={styles.primaryText}>
                    {mode === "demo" ? "Continue" : "Log in"}
                  </Text>
                  <ArrowRight size={18} color="#ffffff" />
                </>
              )}
            </Pressable>

            <Link href="/signup" style={styles.link}>
              <Text style={styles.linkText}>Create account</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeButton, active && styles.modeActive]}
    >
      <Text style={[styles.modeText, active && styles.modeTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  icon: Icon,
  ...props
}: {
  icon: typeof UserRound;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  autoCapitalize?: "none" | "words";
  autoCorrect?: boolean;
  autoComplete?: "email" | "tel";
  keyboardType?: "default" | "email-address" | "phone-pad";
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Icon size={19} color="#7b8494" />
      <TextInput
        {...props}
        placeholderTextColor="#98a2b3"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  fill: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 20 },
  brandRow: { alignItems: "center", gap: 10, marginBottom: 6 },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#07c160",
  },
  appName: { color: "#111111", fontSize: 24, fontWeight: "700" },
  appMeta: { color: "#888888", marginTop: 2, fontSize: 13 },
  hero: { gap: 5, alignItems: "center" },
  eyebrow: { display: "none" },
  title: { color: "#111111", fontSize: 22, lineHeight: 28, fontWeight: "700" },
  subtitle: { color: "#888888", fontSize: 14, textAlign: "center" },
  panel: {
    gap: 13,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dedede",
  },
  modeWrap: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 14,
    backgroundColor: "#f0f0f0",
    marginBottom: 2,
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeActive: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dddddd",
  },
  modeText: { color: "#697386", fontWeight: "800", fontSize: 13 },
  modeTextActive: { color: "#111111" },
  field: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
  },
  input: { flex: 1, color: ink, fontSize: 16, minHeight: 50 },
  primary: {
    marginTop: 4,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#07c160",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  pressed: { opacity: 0.86 },
  primaryText: { color: "#ffffff", fontWeight: "900", fontSize: 16 },
  disabled: { opacity: 0.62 },
  link: { alignSelf: "center", marginTop: 3, padding: 8 },
  linkText: { color: "#576b95", fontWeight: "600", fontSize: 14 },
});
