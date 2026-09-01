import { useMemo } from "react";
import { useRouter } from "expo-router";
import { ProfileScreen } from "../../src/features/profile/ProfileScreen";
import {
  createLocalProfileRepository,
  createSupabaseProfileRepository,
  localProfileRepository,
} from "../../src/features/profile/profileRepository";
import { useAuth } from "../../src/lib/AuthContext";
import { supabaseConfigured } from "../../src/lib/supabase";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const isDemoUser = Boolean(
    user && "app_metadata" in user && user.app_metadata?.provider === "demo",
  );
  const repository = useMemo(() => {
    if (!user) {
      return localProfileRepository;
    }

    // Demo sessions intentionally have no Supabase JWT. They are persisted on
    // the device so the profile must stay on the local repository even when a
    // remote project is configured for real accounts.
    if (!supabaseConfigured || isDemoUser) {
      return createLocalProfileRepository(user);
    }

    return createSupabaseProfileRepository(user);
  }, [isDemoUser, user]);

  return (
    <ProfileScreen
      repository={repository}
      onOpenOrders={() => router.push("/orders")}
      onOpenSaved={() => router.push("/wishlist")}
      onOpenCreatorCommerce={() => router.push("/commerce")}
      onOpenNotifications={() =>
        router.push({ pathname: "/social", params: { notifications: "1" } })
      }
      onOpenPrivacy={() =>
        router.push({
          pathname: "/account-settings",
          params: { section: "privacy" },
        })
      }
      onOpenLocation={() =>
        router.push({
          pathname: "/account-settings",
          params: { section: "location" },
        })
      }
      onOpenPayments={() =>
        router.push({
          pathname: "/account-settings",
          params: { section: "payments" },
        })
      }
      onOpenSecurity={() =>
        router.push({
          pathname: "/account-settings",
          params: { section: "security" },
        })
      }
      onOpenHelp={() => router.push("/support-feedback")}
      onSignOut={async () => {
        await signOut();
        router.replace("/login");
      }}
    />
  );
}
