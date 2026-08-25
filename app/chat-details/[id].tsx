import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import ChatDetailsScreen from "../../src/features/chat/ChatDetailsScreen";
import { createSupabaseChatRepository } from "../../src/features/chat/supabaseChatRepository";
import { useAuth } from "../../src/lib/AuthContext";
import { supabase } from "../../src/lib/supabase";

export default function ChatDetailsPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const repository = useMemo(() => {
    const isDemoUser = Boolean(user && user.app_metadata?.provider === "demo");
    return supabase && user && !isDemoUser
      ? createSupabaseChatRepository({ client: supabase, user })
      : null;
  }, [user]);

  if (!repository || !id) return null;
  return (
    <ChatDetailsScreen
      dataSource={repository}
      conversationId={id}
      onBack={() => router.back()}
      onViewProfile={(userId) => router.push({ pathname: "/social-profile", params: { userId } })}
    />
  );
}
