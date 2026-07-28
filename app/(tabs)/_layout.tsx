import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import {
  House,
  LayoutGrid,
  MessageCircle,
  UserRound,
} from "lucide-react-native";
import { useAuth } from "../../src/lib/AuthContext";

const active = "#ffffff";
const inactive = "rgba(255,255,255,0.76)";
const ink = "#14171f";

export default function TabLayout() {
  const { session, loading, user } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={active} size="large" />
      </View>
    );
  }

  if (!session || !user?.id) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: inactive,
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: "700",
          paddingBottom: 6,
          letterSpacing: 0.1,
        },
        tabBarItemStyle: { paddingTop: 6 },
        tabBarStyle: {
          height: 68,
          marginHorizontal: 22,
          marginBottom: 18,
          borderRadius: 24,
          borderTopWidth: 1,
          borderTopColor: "#37d586",
          borderBottomWidth: 5,
          borderBottomColor: "#05743b",
          backgroundColor: "#079f51",
          boxShadow:
            "0 7px 0 rgba(5,116,59,0.20), 0 14px 24px rgba(7,112,58,0.22)",
          overflow: "hidden",
        },
        tabBarIcon: ({ color: tint, focused }) => {
          const Icon =
            route.name === "social"
              ? House
              : route.name === "chats"
                ? MessageCircle
                : route.name === "shop"
                  ? LayoutGrid
                  : route.name === "profile"
                    ? UserRound
                    : House;
          const fill = focused && route.name === "social" ? tint : "none";
          return (
            <View style={[styles.iconShell, focused && styles.iconShellActive]}>
              <Icon
                color={tint}
                fill={fill}
                size={20}
                strokeWidth={focused ? 2.5 : 2.1}
              />
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="social" options={{ title: "Social" }} />
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
      <Tabs.Screen name="shop" options={{ title: "Shop" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconShell: {
    width: 30,
    height: 28,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 3px 0 rgba(4,101,51,0.65)",
  },
  iconShellActive: {
    backgroundColor: "rgba(255,255,255,0.20)",
    borderColor: "rgba(255,255,255,0.34)",
    transform: [{ translateY: -2 }],
    boxShadow: "0 5px 0 rgba(4,101,51,0.72)",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  block: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "#fff",
  },
  blockTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#172033",
    marginBottom: 8,
  },
  blockText: { fontSize: 14, color: "#5b6a7b", textAlign: "center" },
});
