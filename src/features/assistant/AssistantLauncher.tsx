import { usePathname, useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/AuthContext";

export default function AssistantLauncher() {
  const { session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chatRoute = pathname === "/chats" || pathname.startsWith("/business-chat/");
  const compact = width < 769;
  if (!session?.user || pathname === "/assistant" || pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    return null;
  }
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.layer,
        {
          bottom: chatRoute
            ? Platform.OS === "web" && width >= 1180
              ? 82
              : Math.max(insets.bottom + 150, 162)
            : Platform.OS === "web"
              ? 24
              : Math.max(insets.bottom + 86, 98),
          right: compact ? 12 : 18,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Social24 Assistant"
        testID="global-assistant-launcher"
        onPress={() => router.push("/assistant")}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Sparkles color="#ffffff" size={19} />
        {!compact ? <Text style={styles.label}>Assistant</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    zIndex: 500,
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 15,
    borderRadius: 23,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#087a4a",
    borderWidth: 1,
    borderColor: "#d9f6e7",
    boxShadow: "0 8px 24px rgba(8, 74, 45, 0.24)",
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  label: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
});
