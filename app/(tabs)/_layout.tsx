import { Redirect, Tabs } from "expo-router";
import {
  Compass,
  MessageCircle,
  ShoppingBag,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react-native";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/lib/AuthContext";

const active = "#10b45b";
const inactive = "#98a2b3";

export default function TabLayout() {
  const { session, loading, user } = useAuth();
  const insets = useSafeAreaInsets();

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
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: inactive,
        tabBarShowLabel: false,
        tabBarItemStyle: {
          paddingTop: 6,
          paddingBottom: 6,
        },
        tabBarStyle: {
          height: Math.max(72 + insets.bottom, Platform.select({ ios: 82, default: 72 }) ?? 72),
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 10),
          borderTopWidth: 1,
          borderTopColor: "#e5e7eb",
          backgroundColor: "#ffffff",
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIcon: ({ color: tint, focused }) => {
          const label =
            route.name === "chats"
              ? "Chats"
              : route.name === "social"
                ? "Social"
                : route.name === "discover"
                  ? "Discover"
                  : route.name === "shop"
                    ? "Shop"
                    : route.name === "wallet"
                      ? "Wallet"
                      : "Profile";
          const Icon =
            route.name === "chats"
              ? MessageCircle
              : route.name === "social"
                ? UsersRound
                : route.name === "discover"
                  ? Compass
                  : route.name === "shop"
                    ? ShoppingBag
                    : route.name === "wallet"
                      ? WalletCards
                      : UserRound;
          return (
            <View style={styles.tabVisual}>
              <Icon
                color={tint}
                size={20}
                strokeWidth={focused ? 2.3 : 2}
              />
              <Text style={[styles.tabLabel, { color: tint }]}>
                {label}
              </Text>
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
      <Tabs.Screen name="social" options={{ title: "Social" }} />
      <Tabs.Screen name="discover" options={{ title: "Discover" }} />
      <Tabs.Screen name="shop" options={{ title: "Shop" }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet" }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabVisual: {
    minWidth: 52,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
    textAlign: "center",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
