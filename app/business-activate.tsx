import { useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  BadgeCheck,
  KeyRound,
  LockKeyhole,
  UserRound,
} from "lucide-react-native";
import {
  isStrongWorkPassword,
  normalizeBusinessLoginId,
} from "../src/features/teamManagement/rules";
import { supabase } from "../src/lib/supabase";

export default function BusinessActivatePage() {
  const [loginId, setLoginId] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (!supabase) {
      setError("The secure activation service is not configured.");
      return;
    }
    if (!isStrongWorkPassword(password)) {
      setError(
        "Use 10–128 characters with uppercase, lowercase, number and symbol.",
      );
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "business-work-auth",
        {
          body: {
            loginId: normalizeBusinessLoginId(loginId),
            activationCode: code.trim(),
            password,
          },
        },
      );
      if (invokeError) throw invokeError;
      if (!data?.activated)
        throw new Error(data?.error ?? "Activation could not be completed.");
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Activation could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <KeyRound size={28} color="#ffffff" />
        </View>
        <Text style={styles.title}>
          {done ? "Password created" : "Activate work account"}
        </Text>
        <Text style={styles.copy}>
          {done
            ? "Your account is awaiting owner approval. You can log in after the owner verifies your role and identity."
            : "Enter the business login ID and one-time activation code shared by your company owner."}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {done ? (
          <>
            <View style={styles.success}>
              <BadgeCheck size={23} color="#087a49" />
              <Text style={styles.successText}>
                Activation code consumed securely. No personal Social24 data is
                linked.
              </Text>
            </View>
            <Pressable
              onPress={() => router.replace("/business-login")}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>Go to work login</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Field
              icon={<UserRound size={18} color="#738294" />}
              label="Business login ID"
              value={loginId}
              onChangeText={setLoginId}
            />
            <Field
              icon={<KeyRound size={18} color="#738294" />}
              label="One-time activation code"
              value={code}
              onChangeText={setCode}
            />
            <Field
              icon={<LockKeyhole size={18} color="#738294" />}
              label="Create password"
              value={password}
              onChangeText={setPassword}
              secure
            />
            <Field
              icon={<LockKeyhole size={18} color="#738294" />}
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              secure
            />
            <Text style={styles.hint}>
              At least 10 characters with uppercase, lowercase, number and
              symbol.
            </Text>
            <Pressable
              disabled={busy}
              onPress={() => void submit()}
              style={[styles.primary, busy && styles.disabled]}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryText}>Create work password</Text>
              )}
            </Pressable>
            <Pressable onPress={() => router.replace("/business-login")}>
              <Text style={styles.back}>Back to work login</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
function Field({
  icon,
  label,
  value,
  onChangeText,
  secure,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secure?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        {icon}
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure}
          value={value}
          onChangeText={onChangeText}
          style={styles.input}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f2f7f4",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dce7e1",
    borderRadius: 24,
    padding: 25,
    gap: 15,
  },
  icon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: "#087a49",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#102133", fontSize: 23, fontWeight: "900" },
  copy: { color: "#63758b", fontSize: 13, lineHeight: 20 },
  error: {
    color: "#a52a36",
    backgroundColor: "#fff1f1",
    borderRadius: 12,
    padding: 11,
    fontSize: 12,
  },
  field: { gap: 6 },
  label: { color: "#425469", fontSize: 12, fontWeight: "900" },
  inputWrap: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: "#dce7e1",
    borderRadius: 14,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  input: {
    flex: 1,
    color: "#102133",
    fontSize: 14,
    outlineStyle: "none",
  } as never,
  hint: { color: "#718296", fontSize: 11 },
  primary: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#087a49",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  back: {
    color: "#63758b",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
  },
  success: {
    backgroundColor: "#eef8f3",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  successText: { color: "#315b47", fontSize: 12, lineHeight: 18, flex: 1 },
});
