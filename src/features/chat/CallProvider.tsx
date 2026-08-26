import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '../../lib/AuthContext';
import CallOverlay from './CallOverlay';
import { unconfiguredCallAdapter } from './callAdapter';
import type { CallAdapter, CallSession } from './types';
import { createWebRtcCallAdapter } from './webRtcCallAdapter';

type CallContextValue = {
  adapter: CallAdapter;
  session: CallSession | null;
};

const CallContext = createContext<CallContextValue>({ adapter: unconfiguredCallAdapter, session: null });

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isDemoUser = Boolean(user?.app_metadata?.provider === 'demo');
  const adapter = useMemo(
    () => user?.id && !isDemoUser ? createWebRtcCallAdapter() : unconfiguredCallAdapter,
    [isDemoUser, user?.id],
  );
  const [session, setSession] = useState<CallSession | null>(null);

  useEffect(() => {
    setSession(null);
    if (adapter === unconfiguredCallAdapter) return;
    const unsubscribe = adapter.subscribe((next) => {
      setSession(next.phase === 'ended' ? null : next);
    });
    return () => {
      unsubscribe();
      void adapter.destroy?.();
    };
  }, [adapter]);

  const value = useMemo(() => ({ adapter, session }), [adapter, session]);
  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay session={session} adapter={adapter} />
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
