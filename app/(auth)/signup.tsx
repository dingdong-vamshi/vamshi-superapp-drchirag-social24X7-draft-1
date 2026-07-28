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
import { supabase } from "../../src/lib/supabase";

const accent = "#0f9f5f";
const ink = "#14171f";
const muted = "#667085";
const line = "#d9dee7";

function sanitizeHandle(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 24) || "user"
  );
}

export default function SignupScreen() {
  const { signUp, signUpDemo, configured } = useAuth();
  const [mode, setMode] = useState<"demo" | "email">("demo");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBusy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "demo") {
        const cleanUsername = sanitizeHandle(username);
        const cleanName = name.trim() || "You";
        if (!phone.trim() || !cleanName || !cleanUsername) {
          Alert.alert(
            "Incomplete profile",
            "Please add your name, phone and username.",
          );
          return;
        }

        await signUpDemo({
          phone,
          username: cleanUsername,
          displayName: cleanName,
        });
        router.replace("/social");
        return;
      }

      if (!configured || !supabase) {
        Alert.alert(
          "Missing configuration",
          "Set SUPABASE env variables before creating an account.",
        );
        return;
      }
      if (
        !name.trim() ||
        !username.trim() ||
        !email.trim() ||
        !password.trim()
      ) {
        Alert.alert(
          "Incomplete profile",
          "Please add name, username, email and password.",
        );
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert("Password mismatch", "Passwords must match.");
        return;
      }

      const cleanUsername = sanitizeHandle(username);
      const result = await signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (result.error) {
        Alert.alert("Sign up failed", result.error.message);
        return;
      }
      const user = result.data.user;
      if (!user) {
        Alert.alert(
          "Sign up",
          "We could not create your account yet. Please try again.",
        );
        return;
      }

      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          username: cleanUsername,
          display_name: name.trim(),
          bio: "",
          is_private: false,
          avatar_path: null,
        },
        { onConflict: "id" },
      );
      if (profileError) {
        Alert.alert("Profile setup failed", profileError.message);
        return;
      }

      if (result.data.session) {
        router.replace("/social");
      } else {
        router.replace("/login");
      }
    } catch (error) {
      Alert.alert(
        "Sign up failed",
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
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>
              Set up your identity in a few seconds.
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
                  value={name}
                  placeholder="Display name"
                  autoCapitalize="words"
                  onChangeText={setName}
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
                  icon={UserRound}
                  value={name}
                  placeholder="Full name"
                  autoCapitalize="words"
                  onChangeText={setName}
                />
                <Field
                  icon={AtSign}
                  value={username}
                  placeholder="Username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setUsername}
                />
                <Field
                  icon={Mail}
                  value={email}
                  placeholder="Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onChangeText={setEmail}
                />
                <Field
                  icon={LockKeyhole}
                  value={password}
                  placeholder="Password"
                  secureTextEntry
                  autoCapitalize="none"
                  onChangeText={setPassword}
                />
                <Field
                  icon={LockKeyhole}
                  value={confirmPassword}
                  placeholder="Confirm password"
                  secureTextEntry
                  autoCapitalize="none"
                  onChangeText={setConfirmPassword}
                />
              </>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                mode === "demo"
                  ? "Create Social 24x7 account with phone"
                  : "Create Social 24x7 account"
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
                    {mode === "demo" ? "Create account" : "Sign up"}
                  </Text>
                  <ArrowRight size={18} color="#ffffff" />
                </>
              )}
            </Pressable>

            <Link href="/login" style={styles.link}>
              <Text style={styles.linkText}>I already have an account</Text>
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
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#f1f3f0",
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
