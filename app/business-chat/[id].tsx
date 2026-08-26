import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import ChatScreen from "../../src/features/chat/ChatScreen";
import { createSupabaseChatRepository } from "../../src/features/chat/supabaseChatRepository";
import { useCall } from "../../src/features/chat/CallProvider";
import { useAuth } from "../../src/lib/AuthContext";
import { supabase } from "../../src/lib/supabase";

export default function BusinessConversationPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { adapter: callAdapter } = useCall();
  const repository = useMemo(() => {
    const isDemoUser = Boolean(
      user
      && "app_metadata" in user
      && user.app_metadata?.provider === "demo",
    );
    if (!supabase || !user || isDemoUser) return undefined;
    return createSupabaseChatRepository({ client: supabase, user });
  }, [user]);

  return (
    <ChatScreen
      dataSource={repository}
      callAdapter={callAdapter}
      initialConversationId={id}
      onBack={() => router.replace("/(tabs)/chats")}
      onBusinessSearch={() => router.push("/business-directory")}
      onViewStore={(slug) =>
        router.push({ pathname: "/store/[slug]", params: { slug } })
      }
      onViewOrder={(orderId) => router.push({ pathname: "/commerce/order/[id]", params: { id: orderId, from: "chats" } })}
      onViewProfile={(userId) =>
        router.push({ pathname: "/social-profile", params: { userId } })
      }
    />
  );
}
