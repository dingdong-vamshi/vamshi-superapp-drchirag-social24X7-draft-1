import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AuthError,
  type AuthResponse,
  type Session,
  type User,
} from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";
import { businessLoginEmail, type BusinessWorkContext } from "../features/businessWorkspace/businessAuth";

type AuthContextValue = {
  initialized: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  configured: boolean;
  signIn: (input: {
    email: string;
    phone: string;
    password: string;
  }) => Promise<AuthResponse>;
  signInBusiness: (input: { loginId: string; password: string }) => Promise<AuthResponse>;
  signUp: (input: {
    email: string;
    phone: string;
    password: string;
    name?: string;
    username?: string;
    referralCode?: string;
  }) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const legacyDemoSessionStorageKey = "kora:demo-session:v1";
const authNotReady = new Error(
  "Supabase is not configured. Set the public Supabase environment variables.",
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const businessSignInInFlight = useRef(false);

  const refreshSession = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      setLoading(false);
      return;
    }

    const {
      data: { session: nextSession },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    setSession(nextSession);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Demo sessions were part of an earlier local prototype. They must never
    // satisfy production route guards.
    void AsyncStorage.removeItem(legacyDemoSessionStorageKey);

    void (async () => {
      try {
        if (!supabase) {
          if (mounted) setSession(null);
          return;
        }
        const {
          data: { session: nextSession },
        } = await supabase.auth.getSession();
        if (mounted) setSession(nextSession);
      } catch {
        if (mounted) setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (businessSignInInFlight.current && nextSession) return;
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (input: { email: string; phone: string; password: string }) => {
      if (!supabase) throw authNotReady;
      const result = await supabase.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });
      if (result.error || !result.data.session) return result;

      const { data: phoneMatches, error: phoneError } = await supabase.rpc(
        "verify_my_login_phone",
        { p_phone: input.phone },
      );
      if (phoneError || phoneMatches !== true) {
        await supabase.auth.signOut();
        setSession(null);
        return {
          data: { user: null, session: null },
          error: new AuthError(
            "Invalid login credentials",
            400,
            "invalid_credentials",
          ),
        };
      }
      setSession(result.data.session);
      return result;
    },
    [],
  );

  const signUp = useCallback(
    async (input: {
      email: string;
      phone: string;
      password: string;
      name?: string;
      username?: string;
      referralCode?: string;
    }) => {
      if (!supabase) throw authNotReady;
      const referralCode = input.referralCode?.trim().toUpperCase() || "";
      const result = await supabase.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          data: {
            name: input.name?.trim() || undefined,
            preferred_username:
              input.username?.trim().toLowerCase() || undefined,
            phone_e164: input.phone.trim(),
            reward_referral_code: /^[A-Z0-9]{12}$/.test(referralCode)
              ? referralCode
              : undefined,
          },
        },
      });
      if (result.data.session) setSession(result.data.session);
      return result;
    },
    [],
  );

  const signInBusiness = useCallback(async (input: { loginId: string; password: string }) => {
    if (!supabase) throw authNotReady;
    businessSignInInFlight.current = true;
    try {
      const email = businessLoginEmail(input.loginId);
      const result = await supabase.auth.signInWithPassword({ email, password: input.password });
      if (result.error || !result.data.session) return result;
      if (result.data.user.app_metadata?.account_type !== "business_employee") {
        await supabase.auth.signOut();
        setSession(null);
        return { data: { user: null, session: null }, error: new AuthError("This is not a business work login.", 403, "invalid_credentials") };
      }
      const { data: context, error: contextError } = await supabase.rpc("get_my_business_work_context");
      const work = context as BusinessWorkContext | null;
      if (contextError || !work || work.status !== "verified") {
        await supabase.auth.signOut();
        setSession(null);
        const message = work?.status === "awaiting_approval"
          ? "Your password is set. Ask the business owner to approve your work account."
          : work?.status === "suspended" || work?.status === "removed"
            ? "This work account no longer has access. Contact the business owner."
            : "This work account is not ready yet.";
        return { data: { user: null, session: null }, error: new AuthError(message, 403, "work_account_inactive") };
      }
      setSession(result.data.session);
      return result;
    } finally {
      businessSignInInFlight.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
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
      signInBusiness,
      signUp,
      signOut,
      refreshSession,
    }),
    [loading, session, signIn, signInBusiness, signUp, signOut, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
