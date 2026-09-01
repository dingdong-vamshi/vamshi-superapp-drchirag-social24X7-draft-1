import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider } from "../src/lib/AuthContext";
import { useAuth } from "../src/lib/AuthContext";
import { CallProvider } from "../src/features/chat/CallProvider";
import AssistantLauncher from "../src/features/assistant/AssistantLauncher";

function RootNavigator() {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f7f9f8",
        }}
      >
        <ActivityIndicator color="#0f9f5f" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
      <Stack.Protected guard={Boolean(session?.user)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(creator-commerce)" />
        <Stack.Screen name="seller/index" />
        <Stack.Screen name="business-directory" />
        <Stack.Screen name="business-chat/[id]" />
        <Stack.Screen name="creator-chat/[id]" />
        <Stack.Screen name="seller/creator-chat/[id]" />
        <Stack.Screen name="chat-details/[id]" />
        <Stack.Screen
          name="assistant"
          options={{ presentation: "transparentModal", animation: "fade" }}
        />
        <Stack.Screen name="social-profile" />
        <Stack.Screen name="cart" />
        <Stack.Screen name="checkout/index" />
        <Stack.Screen name="checkout/success" />
        <Stack.Screen name="profile-qr" />
        <Stack.Screen name="account-settings" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="wishlist" />
        <Stack.Screen name="support-feedback" />
        <Stack.Screen name="games/index" />
        <Stack.Screen name="games/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={!session?.user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Screen name="store/[slug]" />
      <Stack.Screen name="store/[slug]/product/[productSlug]" />
    </Stack>
  );
}

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 2, staleTime: 15_000 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <CallProvider>
          <View style={{ flex: 1 }}>
            <RootNavigator />
            <AssistantLauncher />
          </View>
        </CallProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
