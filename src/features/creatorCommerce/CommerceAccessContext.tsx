import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { getCreatorCommerceAccess, type CreatorCommerceAccess } from './accessRepository';

type CommerceAccessContextValue = {
  access: CreatorCommerceAccess | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const CommerceAccessContext = createContext<CommerceAccessContextValue | null>(null);

export function CommerceAccessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [access, setAccess] = useState<CreatorCommerceAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedForUserRef = useRef<string | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const userKey = user?.id ?? null;
    const initialLoad = loadedForUserRef.current !== userKey;
    if (initialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      if (!supabase || !user || user.app_metadata?.provider === 'demo') {
        setAccess(null);
        return;
      }
      setAccess(await getCreatorCommerceAccess(supabase));
    } catch (cause) {
      setAccess(null);
      setError(cause instanceof Error ? cause.message : 'Unable to verify commerce access.');
    } finally {
      loadedForUserRef.current = userKey;
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ access, loading, refreshing, error, refresh }), [access, loading, refreshing, error, refresh]);
  return <CommerceAccessContext.Provider value={value}>{children}</CommerceAccessContext.Provider>;
}

export function useCommerceAccess() {
  const value = useContext(CommerceAccessContext);
  if (!value) throw new Error('useCommerceAccess must be used inside CommerceAccessProvider');
  return value;
}
