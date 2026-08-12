import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ProfileScreen } from '../../src/features/profile/ProfileScreen';
import { createLocalProfileRepository, createSupabaseProfileRepository, localProfileRepository } from '../../src/features/profile/profileRepository';
import { useAuth } from '../../src/lib/AuthContext';
import { supabaseConfigured } from '../../src/lib/supabase';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const isDemoUser = Boolean(
    user &&
      "app_metadata" in user &&
      user.app_metadata?.provider === "demo",
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
      onOpenCreatorCommerce={() => router.push('/commerce')}
      onSignOut={async () => {
        await signOut();
        router.replace('/login');
      }}
    />
  );
}
