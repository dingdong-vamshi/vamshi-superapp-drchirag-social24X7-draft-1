import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};
export const supabase = url && key ? createClient(url, key, {
  auth: {
    storage: Platform.OS === 'web' && typeof window === 'undefined' ? noopStorage : AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // Supabase email confirmations return tokens in the web URL. Native does
    // not parse browser redirects, while web must exchange them for a session.
    detectSessionInUrl: Platform.OS === 'web',
    lock: processLock,
  },
}) : null;
export const supabaseConfigured = Boolean(supabase);

// Native JavaScript can be suspended in the background. Refresh only while the
// app is active so expired access tokens are renewed promptly after resume.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
