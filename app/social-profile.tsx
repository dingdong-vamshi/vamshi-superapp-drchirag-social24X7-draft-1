import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";

import { SocialProfileScreen } from "../src/features/social/SocialProfileScreen";
import { useAuth } from "../src/lib/AuthContext";
import { supabase } from "../src/lib/supabase";
import { createAsyncStorageSocialRepository } from "../src/features/social/asyncStorageRepository";
import { createSupabaseSocialRepository } from "../src/features/social/supabaseSocialRepository";
import type { SocialUser } from "../src/features/social/types";
import {
  createLocalProfileRepository,
  createSupabaseProfileRepository,
  localProfileRepository,
} from "../src/features/profile/profileRepository";

export default function SocialProfilePage() {
  const params = useLocalSearchParams<{
    userId?: string;
    handle?: string;
    displayName?: string;
    avatarUrl?: string;
  }>();
  const { user } = useAuth();

  const displayName = user?.user_metadata?.name || user?.email?.split("@")[0] || "You";
  const handle = useMemo(
    () =>
      (user?.user_metadata?.preferred_username || user?.email?.split("@")[0] || "you")
        .toString()
        .replace(/[^a-zA-Z0-9_]/g, ""),
    [user?.email, user?.user_metadata?.preferred_username],
  );

  const viewer = useMemo<SocialUser>(
    () => ({ id: user?.id || "local-user", handle, displayName }),
    [displayName, handle, user?.id],
  );

  const isSupabaseUser = Boolean(supabase && user && "identities" in user);
  const socialRepository = useMemo(
    () =>
      isSupabaseUser && supabase && user && "identities" in user
        ? createSupabaseSocialRepository({ client: supabase, user })
        : createAsyncStorageSocialRepository(viewer),
    [isSupabaseUser, user, viewer],
  );

  const profileRepository = useMemo(() => {
    if (!user) return localProfileRepository;
    if (!isSupabaseUser) return createLocalProfileRepository(user);
    return createSupabaseProfileRepository(user);
  }, [isSupabaseUser, user]);

  return (
    <SocialProfileScreen
      viewer={viewer}
      selectedUserId={params.userId}
      fallbackUser={{
        handle: params.handle,
        displayName: params.displayName,
        avatarUrl: params.avatarUrl,
      }}
      repository={socialRepository}
      profileRepository={profileRepository}
      supabaseClient={supabase}
    />
  );
}
