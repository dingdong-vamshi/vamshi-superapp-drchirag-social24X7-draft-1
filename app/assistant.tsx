import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, View } from "react-native";

import AssistantScreen from "../src/features/assistant/AssistantScreen";
import { createAssistantRepository } from "../src/features/assistant/assistantRepository";
import { supabase } from "../src/lib/supabase";

export default function AssistantPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ conversationId?: string; counterpart?: string }>();
  const repository = useMemo(() => (supabase ? createAssistantRepository(supabase) : null), []);
  if (!repository) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f7faf8" }}>
        <ActivityIndicator color="#087a4a" />
      </View>
    );
  }
  return (
    <AssistantScreen
      repository={repository}
      conversationId={params.conversationId}
      counterpart={params.counterpart}
      close={() => router.canGoBack() ? router.back() : router.replace("/chats")}
    />
  );
}
