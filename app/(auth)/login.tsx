import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
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
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MessageCircle,
  Smartphone,
} from "lucide-react-native";
import {
  loginErrorMessage,
  normalizeEmail,
  validateLogin,
  type AuthFieldErrors,
} from "../../src/features/auth/authValidation";
import { useAuth } from "../../src/lib/AuthContext";

const ink = "#14171f";
const line = "#d9dee7";

export default function LoginScreen() {
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isBusy, setBusy] = useState(false);

  const submit = async () => {
    if (isBusy) return;

    const validation = validateLogin({ email, phone, password });
    setErrors(validation.errors);
    setFormError("");
    if (!validation.valid) return;

    if (!configured) {
      setFormError("Login is temporarily unavailable. Please try again later.");
      return;
    }

    setBusy(true);
    try {
      const result = await signIn({
        email: normalizeEmail(email),
        phone,
        password,
      });
      if (result.error) {
        setFormError(loginErrorMessage(result.error));
        return;
      }
      if (!result.data.session) {
        setFormError("Unable to start your session. Please try again.");
        return;
      }

      setPassword("");
      router.replace("/chats");
    } catch (error) {
      setFormError(
        loginErrorMessage(error instanceof Error ? error : undefined),
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
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Log in with the email, phone number and password linked to your
              account.
            </Text>
          </View>

          <View style={styles.panel}>
            {formError ? (
              <View accessibilityRole="alert" style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            ) : null}

            <AuthField
              icon={Mail}
              label="Email"
              value={email}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              error={errors.email}
              editable={!isBusy}
              onChangeText={(value) => {
                setEmail(value);
                setErrors((current) => ({ ...current, email: undefined }));
                setFormError("");
              }}
              onSubmitEditing={() => void submit()}
            />

            <AuthField
              icon={Smartphone}
              label="Phone number"
              value={phone}
              autoCapitalize="none"
              autoComplete="tel"
              keyboardType="phone-pad"
              error={errors.phone}
              editable={!isBusy}
              onChangeText={(value) => {
                setPhone(value);
                setErrors((current) => ({ ...current, phone: undefined }));
                setFormError("");
              }}
            />

            <AuthField
              icon={LockKeyhole}
              label="Password"
              value={password}
              autoCapitalize="none"
              autoComplete="current-password"
              secureTextEntry={!showPassword}
              error={errors.password}
              editable={!isBusy}
              onChangeText={(value) => {
                setPassword(value);
                setErrors((current) => ({ ...current, password: undefined }));
                setFormError("");
              }}
              onSubmitEditing={() => void submit()}
              rightAction={
                <PasswordToggle
                  visible={showPassword}
                  onPress={() => setShowPassword((current) => !current)}
                />
              }
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log in to Social 24x7"
              accessibilityState={{ disabled: isBusy, busy: isBusy }}
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
                  <Text style={styles.primaryText}>Log in</Text>
                  <ArrowRight size={18} color="#ffffff" />
                </>
              )}
            </Pressable>

            <View style={styles.accountRow}>
              <Text style={styles.accountText}>New to Social 24x7?</Text>
              <Link href="/signup" style={styles.link}>
                Create account
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordToggle({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? "Hide password" : "Show password"}
      hitSlop={8}
      onPress={onPress}
      style={styles.iconButton}
    >
      <Icon size={20} color="#667085" />
    </Pressable>
  );
}

function AuthField({
  icon: Icon,
  label,
  error,
  rightAction,
  ...props
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  autoCapitalize?: "none" | "words";
  autoComplete?: "email" | "tel" | "current-password";
  keyboardType?: "default" | "email-address" | "phone-pad";
  secureTextEntry?: boolean;
  editable?: boolean;
  error?: string;
  rightAction?: ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.field, error && styles.fieldError]}>
        <Icon size={19} color={error ? "#c62828" : "#7b8494"} />
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholder={label}
          placeholderTextColor="#98a2b3"
          returnKeyType="done"
          style={styles.input}
        />
        {rightAction}
      </View>
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    gap: 20,
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
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
  title: { color: "#111111", fontSize: 24, lineHeight: 30, fontWeight: "700" },
  subtitle: { color: "#667085", fontSize: 14, textAlign: "center" },
  panel: {
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dedede",
  },
  errorBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f2b8b5",
    backgroundColor: "#fff4f3",
  },
  errorBannerText: { color: "#8a1c1c", fontSize: 14, lineHeight: 20 },
  fieldGroup: { gap: 6 },
  fieldLabel: { color: ink, fontSize: 13, fontWeight: "700" },
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
  fieldError: { borderColor: "#c62828", backgroundColor: "#fffafa" },
  fieldErrorText: { color: "#b42318", fontSize: 12, lineHeight: 16 },
  input: { flex: 1, color: ink, fontSize: 16, minHeight: 50 },
  iconButton: {
    minWidth: 36,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
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
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  accountText: { color: "#667085", fontSize: 14 },
  link: {
    color: "#576b95",
    fontWeight: "700",
    fontSize: 14,
    paddingVertical: 8,
  },
});
