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
import { Link, router, useLocalSearchParams } from "expo-router";
import {
  ArrowRight,
  AtSign,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MessageCircle,
  UserRound,
} from "lucide-react-native";
import {
  isDuplicateSignupResponse,
  normalizeEmail,
  normalizeUsername,
  signupErrorMessage,
  validateSignup,
  type AuthFieldErrors,
} from "../../src/features/auth/authValidation";
import { useAuth } from "../../src/lib/AuthContext";

const ink = "#14171f";
const line = "#d9dee7";

export default function SignupScreen() {
  const { signUp, configured } = useAuth();
  const params = useLocalSearchParams<{ ref?: string | string[] }>();
  const referralCode =
    typeof params.ref === "string" ? params.ref.trim().toUpperCase() : "";
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [isBusy, setBusy] = useState(false);

  const clearFieldError = (field: keyof AuthFieldErrors) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError("");
  };

  const submit = async () => {
    if (isBusy) return;

    const validation = validateSignup({
      displayName,
      username,
      email,
      password,
      confirmPassword,
    });
    setErrors(validation.errors);
    setFormError("");
    if (!validation.valid) return;

    if (!configured) {
      setFormError("Account creation is temporarily unavailable. Please try again later.");
      return;
    }

    setBusy(true);
    try {
      const normalizedEmail = normalizeEmail(email);
      const result = await signUp({
        email: normalizedEmail,
        password,
        name: displayName.trim(),
        username: normalizeUsername(username),
        referralCode,
      });

      if (result.error) {
        setFormError(signupErrorMessage(result.error));
        return;
      }
      if (!result.data.user) {
        setFormError("Unable to create your account right now. Please try again.");
        return;
      }
      if (isDuplicateSignupResponse(result.data.user)) {
        setFormError(
          "An account may already exist for this email. Try logging in instead.",
        );
        return;
      }

      setPassword("");
      setConfirmPassword("");
      if (result.data.session) {
        router.replace("/chats");
        return;
      }
      setConfirmationEmail(normalizedEmail);
    } catch (error) {
      setFormError(
        signupErrorMessage(error instanceof Error ? error : undefined),
      );
    } finally {
      setBusy(false);
    }
  };

  if (confirmationEmail) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successPage}>
          <View style={styles.successIcon}>
            <CheckCircle2 size={38} color="#078d4d" />
          </View>
          <Text style={styles.successTitle}>Check your email</Text>
          <Text style={styles.successText}>
            We sent a confirmation link to {confirmationEmail}. Confirm your
            email, then return to Social 24x7 and log in.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/login")}
            style={({ pressed }) => [
              styles.primary,
              styles.successButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryText}>Go to login</Text>
            <ArrowRight size={18} color="#ffffff" />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Your display name and username can be changed later.
            </Text>
          </View>

          <View style={styles.panel}>
            {formError ? (
              <View accessibilityRole="alert" style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            ) : null}

            <AuthField
              icon={UserRound}
              label="Display name"
              value={displayName}
              autoCapitalize="words"
              autoComplete="name"
              error={errors.displayName}
              editable={!isBusy}
              onChangeText={(value) => {
                setDisplayName(value);
                clearFieldError("displayName");
              }}
            />
            <AuthField
              icon={AtSign}
              label="Username"
              value={username}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username-new"
              error={errors.username}
              editable={!isBusy}
              onChangeText={(value) => {
                setUsername(value);
                clearFieldError("username");
              }}
              helper="3–30 letters, numbers, or underscores"
            />
            <AuthField
              icon={Mail}
              label="Email"
              value={email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={errors.email}
              editable={!isBusy}
              onChangeText={(value) => {
                setEmail(value);
                clearFieldError("email");
              }}
            />
            <AuthField
              icon={LockKeyhole}
              label="Password"
              value={password}
              autoCapitalize="none"
              autoComplete="password-new"
              secureTextEntry={!showPassword}
              error={errors.password}
              editable={!isBusy}
              onChangeText={(value) => {
                setPassword(value);
                clearFieldError("password");
              }}
              helper="At least 8 characters with a letter and a number"
              rightAction={
                <PasswordToggle
                  visible={showPassword}
                  label="password"
                  onPress={() => setShowPassword((current) => !current)}
                />
              }
            />
            <AuthField
              icon={LockKeyhole}
              label="Confirm password"
              value={confirmPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              secureTextEntry={!showConfirmPassword}
              error={errors.confirmPassword}
              editable={!isBusy}
              onChangeText={(value) => {
                setConfirmPassword(value);
                clearFieldError("confirmPassword");
              }}
              onSubmitEditing={() => void submit()}
              rightAction={
                <PasswordToggle
                  visible={showConfirmPassword}
                  label="confirmation password"
                  onPress={() => setShowConfirmPassword((current) => !current)}
                />
              }
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create Social 24x7 account"
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
                  <Text style={styles.primaryText}>Create account</Text>
                  <ArrowRight size={18} color="#ffffff" />
                </>
              )}
            </Pressable>

            <View style={styles.accountRow}>
              <Text style={styles.accountText}>Already have an account?</Text>
              <Link href="/login" style={styles.link}>
                Log in
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
  label,
  onPress,
}: {
  visible: boolean;
  label: string;
  onPress: () => void;
}) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
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
  helper,
  rightAction,
  ...props
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  autoCapitalize?: "none" | "words";
  autoCorrect?: boolean;
  autoComplete?: "name" | "username-new" | "email" | "password-new";
  keyboardType?: "default" | "email-address";
  secureTextEntry?: boolean;
  editable?: boolean;
  error?: string;
  helper?: string;
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
          returnKeyType={label === "Confirm password" ? "done" : "next"}
          style={styles.input}
        />
        {rightAction}
      </View>
      {error ? (
        <Text style={styles.fieldErrorText}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}
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
    paddingVertical: 32,
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
  helperText: { color: "#667085", fontSize: 12, lineHeight: 16 },
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
  successPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 14,
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f8f0",
  },
  successTitle: { color: ink, fontSize: 26, fontWeight: "800" },
  successText: {
    color: "#667085",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  successButton: { width: "100%", marginTop: 8 },
});
