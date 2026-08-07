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
    storage: isBrowser ? AsyncStorage : noopStorage,
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: false,
  },
}) : null;
export const supabaseConfigured = Boolean(supabase);
