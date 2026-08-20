import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthResponse, Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';
import { createLocalProfileRepository } from '../features/profile/profileRepository';
import { seededDemoIdentities } from './demoAccounts';

type DemoIdentity = {
  id: string;
  email: string;
  phone: string;
  aud: 'authenticated';
  role: 'authenticated';
  app_metadata: { provider: 'demo'; createdBy: 'local' };
  user_metadata: {
    name: string;
    preferred_username: string;
  };
  created_at: string;
  updated_at: string;
};

type DemoSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: 'bearer';
  user: DemoIdentity;
};

type AppSession = Session | DemoSession;
type AppUser = User | DemoIdentity;
const demoSessionStorageKey = 'kora:demo-session:v1';

type AuthContextValue = {
  initialized: boolean;
  loading: boolean;
  session: AppSession | null;
  user: AppUser | null;
  configured: boolean;
  signIn: (input: { email: string; password: string }) => Promise<AuthResponse>;
  signInDemo: (input: {
    phone: string;
    username: string;
    displayName: string;
  }) => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    name?: string;
    username?: string;
    referralCode?: string;
  }) => Promise<AuthResponse>;
  signUpDemo: (input: {
    phone: string;
    username: string;
    displayName: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const authNotReady = new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in env.');
export const demoUsersStorageKey = 'kora:demo-users:v1';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);

  const toNormalizedPhone = (phone: string) => phone.replace(/\D+/g, '').trim();
  const toDemoUsername = (username: string) => username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || 'user';
  const now = () => Date.now();

  const storeDemoUser = useCallback(async (demoSession: DemoSession) => {
    const raw = await AsyncStorage.getItem(demoUsersStorageKey);
    let parsed: unknown = [];
    try {
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      parsed = [];
    }
    const users = Array.isArray(parsed) ? parsed.filter((item): item is DemoIdentity => Boolean(item && typeof item === 'object' && typeof (item as DemoIdentity).id === 'string')) : [];
    const seededUsers = seededDemoIdentities as readonly DemoIdentity[];
    const next = [
      demoSession.user,
      ...seededUsers,
      ...users,
    ].filter((user, index, all) => all.findIndex((candidate) => candidate.id === user.id) === index);
    await AsyncStorage.setItem(demoUsersStorageKey, JSON.stringify(next));
  }, []);

  const restoreDemoSession = useCallback(async () => {
    const raw = await AsyncStorage.getItem(demoSessionStorageKey);
    if (!raw) {
      return;
    }
    let parsed: AppSession;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await AsyncStorage.removeItem(demoSessionStorageKey);
      return;
    }
    if (
      parsed?.user?.id
      && parsed?.user?.app_metadata?.provider === 'demo'
      && typeof parsed.expires_at === 'number'
      && parsed.expires_at > now() / 1000
    ) {
      setSession(parsed);
      await storeDemoUser(parsed as DemoSession);
    } else {
      await AsyncStorage.removeItem(demoSessionStorageKey);
    }
  }, [storeDemoUser]);

  const storeDemoSession = useCallback(async (demoSession: AppSession) => {
    await AsyncStorage.setItem(demoSessionStorageKey, JSON.stringify(demoSession));
  }, []);

  const createDemoSession = useCallback(
    (input: { phone: string; username: string; displayName: string }, seed?: DemoIdentity): DemoSession => {
      const phone = toNormalizedPhone(input.phone);
      const preferred = toDemoUsername(input.username);
      const displayName = input.displayName.trim() || 'You';
      const id = seed?.id || `demo-${phone || 'anon'}-${preferred}`;
      const nowTs = Math.floor(now() / 1000);

      const user: DemoIdentity = {
        id,
        email: `${preferred}@kora.demo`,
        phone,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'demo', createdBy: 'local' },
        user_metadata: {
          name: displayName,
          preferred_username: preferred,
        },
        created_at: new Date(nowTs * 1000).toISOString(),
        updated_at: new Date(nowTs * 1000).toISOString(),
      };

      return {
        access_token: `demo-${id}`,
        refresh_token: `refresh-${id}`,
        expires_in: 60 * 60 * 24 * 30,
        expires_at: nowTs + 60 * 60 * 24 * 30,
        token_type: 'bearer',
        user,
      };
    },
    [toDemoUsername, toNormalizedPhone],
  );

  const clearDemoSession = useCallback(async () => {
    await AsyncStorage.removeItem(demoSessionStorageKey);
  }, []);

  const seedDemoProfile = useCallback(async (session: DemoSession) => {
    const repo = createLocalProfileRepository({
      id: session.user.id,
      email: session.user.email,
      phone: session.user.phone,
      user_metadata: {
        name: session.user.user_metadata.name,
        preferred_username: session.user.user_metadata.preferred_username,
      },
    });
    const base = await repo.getProfile();
    await repo.updateProfile({
      ...base,
      id: session.user.id,
      email: session.user.email,
      phone: session.user.phone,
      displayName: session.user.user_metadata.name,
      handle: session.user.user_metadata.preferred_username,
      discoverable: true,
      usernameDiscoverable: true,
    });
    await storeDemoUser(session);
  }, [storeDemoUser]);

  const refreshSession = useCallback(async () => {
    await restoreDemoSession();

    if (!supabase) {
      setLoading(false);
      return;
    }

    const {
      data: { session: nextSession },
      error,
    } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }

    setSession(nextSession);
  }, [restoreDemoSession]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      await restoreDemoSession();

      try {
        if (supabase) {
          const {
            data: { session: nextSession },
          } = await supabase.auth.getSession();
          if (mounted && nextSession) {
            setSession(nextSession);
          }
        }
      } catch {
        if (mounted) {
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    if (!supabase) {
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [restoreDemoSession]);

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      if (!supabase) {
        throw authNotReady;
      }
      const result = await supabase.auth.signInWithPassword(input);
      if (result.data.session) {
        setSession(result.data.session);
      }
      return result;
    },
    [],
  );

  const signUp = useCallback(
    async (input: {
      email: string;
      password: string;
      name?: string;
      username?: string;
      referralCode?: string;
    }) => {
      if (!supabase) {
        throw authNotReady;
      }
      const result = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            name: input.name?.trim() || undefined,
            preferred_username: input.username?.trim() || undefined,
            reward_referral_code: /^[A-Z0-9]{12}$/.test(input.referralCode?.trim().toUpperCase() || '')
              ? input.referralCode?.trim().toUpperCase()
              : undefined,
          },
        },
      });
      if (result.data.session) {
        setSession(result.data.session);
      }
      return result;
    },
    [],
  );

  const signInDemo = useCallback(async ({ phone, username, displayName }: { phone: string; username: string; displayName: string }) => {
    const demoSession = createDemoSession({ phone, username, displayName }, undefined);
    await seedDemoProfile(demoSession);
    setSession(demoSession);
    await storeDemoSession(demoSession);
  }, [createDemoSession, seedDemoProfile, storeDemoSession]);

  const signUpDemo = useCallback(async ({ phone, username, displayName }: { phone: string; username: string; displayName: string }) => {
    const demoSession = createDemoSession({ phone, username, displayName }, undefined);
    await seedDemoProfile(demoSession);
    setSession(demoSession);
    await storeDemoSession(demoSession);
  }, [createDemoSession, seedDemoProfile, storeDemoSession]);

  const signOut = useCallback(async () => {
    if (!supabase) {
      await clearDemoSession();
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
    await clearDemoSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      initialized: !loading,
      loading,
      session,
      user: session?.user ?? null,
      configured: supabaseConfigured,
      signIn,
      signInDemo,
      signUp,
      signUpDemo,
      signOut,
      refreshSession,
    }),
    [loading, session, signIn, signInDemo, signUp, signUpDemo, signOut, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
