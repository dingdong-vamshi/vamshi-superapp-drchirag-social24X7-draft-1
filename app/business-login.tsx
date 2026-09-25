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
  BriefcaseBusiness,
  Eye,
  EyeOff,
  LockKeyhole,
  UserRound,
} from "lucide-react-native";
import { useAuth } from "../src/lib/AuthContext";

export default function BusinessLoginPage() {
  const { signInBusiness } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!loginId.trim() || !password) {
      setError("Enter your business login ID and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signInBusiness({ loginId, password });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      router.replace("/business-workspace");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Business login is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <BriefcaseBusiness size={29} color="#ffffff" />
        </View>
        <View>
          <Text style={styles.brandTitle}>Social24 Business</Text>
          <Text style={styles.brandCopy}>Verified employee workspace</Text>
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.heading}>
          <BadgeCheck size={23} color="#087a49" />
          <Text style={styles.title}>Work account login</Text>
        </View>
        <Text style={styles.copy}>
          Use the business login ID created by your company owner. Personal
          email, phone, chats and feeds are not connected to this workspace.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.field}>
          <Text style={styles.label}>Business login ID</Text>
          <View style={styles.inputWrap}>
            <UserRound size={18} color="#738294" />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              value={loginId}
              onChangeText={setLoginId}
              placeholder="kavya.support"
              placeholderTextColor="#91a0ae"
              style={styles.input}
            />
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <LockKeyhole size={18} color="#738294" />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!visible}
              placeholder="Your work password"
              placeholderTextColor="#91a0ae"
              style={styles.input}
              onSubmitEditing={() => void submit()}
            />
            <Pressable
              accessibilityLabel={visible ? "Hide password" : "Show password"}
              onPress={() => setVisible((current) => !current)}
            >
              {visible ? (
                <EyeOff size={18} color="#738294" />
              ) : (
                <Eye size={18} color="#738294" />
              )}
            </Pressable>
          </View>
        </View>
        <Pressable
          disabled={busy}
          onPress={() => void submit()}
          style={[styles.primary, busy && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryText}>Open business workspace</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => router.push("/business-activate")}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>
            First time? Create your password
          </Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/login")}>
          <Text style={styles.personal}>
            Use a personal Social24 account instead
          </Text>
        </Pressable>
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
    gap: 22,
  },
  brand: {
    width: "100%",
    maxWidth: 510,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "#087a49",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: { color: "#102133", fontSize: 22, fontWeight: "900" },
  brandCopy: { color: "#63758b", fontSize: 12, marginTop: 2 },
  card: {
    width: "100%",
    maxWidth: 510,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dce7e1",
    padding: 24,
    gap: 16,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: "#102133", fontSize: 21, fontWeight: "900" },
  copy: { color: "#63758b", fontSize: 13, lineHeight: 20 },
  error: {
    color: "#a52a36",
    backgroundColor: "#fff1f1",
    borderRadius: 12,
    padding: 11,
    fontSize: 12,
    lineHeight: 18,
  },
  field: { gap: 7 },
  label: { color: "#425469", fontSize: 12, fontWeight: "900" },
  inputWrap: {
    minHeight: 50,
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
  primary: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#087a49",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  secondary: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#eef8f3",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: "#087a49", fontSize: 13, fontWeight: "900" },
  personal: {
    color: "#63758b",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  disabled: { opacity: 0.55 },
});
