import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import type { ChatContact } from '../chat/types';

type IdentityLike = User & {
  user_metadata?: {
    name?: string | null;
    preferred_username?: string | null;
  } | null;
};

export type UserProfile = {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  email: string;
  phone: string;
  avatarInitials: string;
  avatarPath?: string | null;
  avatarUrl?: string | null;
  /** Allow the account to appear in Nearby People. */
  discoverable: boolean;
  /** Let other people find this account by @username. Never exposes email or phone. */
  usernameDiscoverable: boolean;
  /** Explicit opt-in only. A production API must rate limit and audit phone lookup. */
  phoneDiscoverable: boolean;
};

export interface ProfileRepository {
  getProfile(): Promise<UserProfile>;
  updateProfile(profile: UserProfile): Promise<UserProfile>;
  updateAvatar(input: {
    uri: string;
    bytes?: ArrayBuffer;
    mimeType?: string | null;
    extension?: string | null;
  }): Promise<UserProfile>;
}

type ProfileAuthHints = {
  id?: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: {
    name?: string | null;
    preferred_username?: string | null;
  } | null;
};

const storageKey = 'kora-mobile:profile:v1';
export const profileDirectoryKey = 'kora-mobile:profiles:v1';
type DirectoryProfile = ChatContact & {
  discoverable?: boolean;
  usernameDiscoverable?: boolean;
  phoneDiscoverable?: boolean;
  email?: string;
};

const normalizePhone = (value?: string | null) => (value || '').replace(/\D+/g, '').trim();
const initialsFor = (name: string) => {
  const value = name.trim();
  return value ? value[0].toUpperCase() : '?';
};

const localDefaultProfile: UserProfile = {
  id: 'local-user',
  displayName: 'Social 24x7 User',
  handle: 'user',
  bio: 'Welcome to Social 24x7.',
  email: '',
  phone: '',
  avatarInitials: 'K',
  avatarPath: null,
  avatarUrl: null,
  discoverable: true,
  usernameDiscoverable: true,
  phoneDiscoverable: false,
};

const toHandle = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30) || 'user';

const toProfileDefaultsFromHints = (hints?: ProfileAuthHints | null): UserProfile => {
  const displayName = hints?.user_metadata?.name?.trim() || 'Social 24x7 User';
  const preferred =
    hints?.user_metadata?.preferred_username?.trim() || hints?.email?.split('@')[0] || hints?.phone?.slice(-4) || 'user';
  const handle = toHandle(preferred);
  const email = hints?.email ?? '';
  const phone = hints?.phone ?? '';

  return {
    ...localDefaultProfile,
    id: hints?.id || localDefaultProfile.id,
    displayName,
    handle,
    email,
    phone,
    avatarInitials: initialsFor(displayName),
  };
};

const toDirectoryEntry = (profile: UserProfile): DirectoryProfile => ({
  id: profile.id,
  name: profile.displayName,
  avatarLabel: profile.avatarInitials,
  avatarUrl: profile.avatarUrl,
  username: profile.handle,
  phone: normalizePhone(profile.phone),
  discoverable: profile.discoverable,
  usernameDiscoverable: profile.usernameDiscoverable,
  phoneDiscoverable: profile.phoneDiscoverable,
  isOnline: false,
  email: profile.email,
});

const readDirectory = async (): Promise<DirectoryProfile[]> => {
  const raw = await AsyncStorage.getItem(profileDirectoryKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (candidate): candidate is DirectoryProfile =>
            typeof candidate === 'object' &&
            candidate !== null &&
            typeof (candidate as { id?: unknown }).id === 'string' &&
            typeof (candidate as { name?: unknown }).name === 'string' &&
            typeof (candidate as { avatarLabel?: unknown }).avatarLabel === 'string' &&
            typeof (candidate as { username?: unknown }).username === 'string',
        )
      : [];
  } catch {
    return [];
  }
};

const writeDirectory = async (entries: DirectoryProfile[]) => {
  await AsyncStorage.setItem(profileDirectoryKey, JSON.stringify(entries));
};

export const syncProfileDirectory = async (profile: UserProfile) => {
  const entries = await readDirectory();
  const entry = toDirectoryEntry(profile);
  const existing = entries.filter((item) => item.id !== profile.id);
  const next = [entry, ...existing];
  await writeDirectory(next);
};

export const rebuildDirectoryFromProfile = async () => {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const profile = toProfileDefaultsFromHints(JSON.parse(raw) as UserProfile);
    await syncProfileDirectory(profile);
  } catch {
    // no-op
  }
};

export const clearProfileDirectory = async () => {
  await AsyncStorage.removeItem(profileDirectoryKey);
};

export const createLocalProfileRepository = (hints?: ProfileAuthHints): ProfileRepository => {
  const defaults = toProfileDefaultsFromHints(hints);

  return {
    async getProfile() {
      const raw = await AsyncStorage.getItem(storageKey);
      try {
        return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<UserProfile>) } : defaults;
      } catch {
        return defaults;
      }
    },
    async updateProfile(profile) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(profile));
      await syncProfileDirectory(profile);
      return profile;
    },
    async updateAvatar(input) {
      const current = await this.getProfile();
      const updated = { ...current, avatarPath: input.uri, avatarUrl: input.uri };
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      await syncProfileDirectory(updated);
      return updated;
    },
  };
};

export const localProfileRepository = createLocalProfileRepository();

type SupabaseProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  phone?: string | null;
  phone_discoverable?: boolean | null;
  username_discoverable?: boolean | null;
  is_private: boolean;
  avatar_path: string | null;
};

const remoteToProfile = (
  row: SupabaseProfileRow,
  authUser: IdentityLike,
  avatarUrl?: string | null,
): UserProfile => ({
  id: row.id,
  displayName: row.display_name?.trim() || authUser.user_metadata?.name || 'User',
  handle: row.username?.trim() || authUser.user_metadata?.preferred_username || authUser.email?.split('@')[0] || 'user',
  bio: row.bio ?? '',
  email: authUser.email ?? '',
  phone: row.phone ?? authUser.phone ?? '',
  avatarInitials: initialsFor(row.display_name?.trim() || authUser.user_metadata?.name || (authUser.email?.slice(0, 1) ?? '?')),
  avatarPath: row.avatar_path,
  avatarUrl: avatarUrl || null,
  discoverable: !row.is_private,
  usernameDiscoverable: row.username_discoverable ?? true,
  phoneDiscoverable: row.phone_discoverable ?? false,
});

export const createSupabaseProfileRepository = (authUser: User | null): ProfileRepository => {
  const client = supabase;
  if (!supabaseConfigured || !client || !authUser) {
    return createLocalProfileRepository(authUser ?? undefined);
  }

  return {
    async getProfile() {
      const { data, error } = await client
        .from('profiles')
        .select('id,username,display_name,bio,phone,phone_discoverable,username_discoverable,is_private,avatar_path')
        .eq('id', authUser.id)
        .maybeSingle();
      if (error) {
        if (error.code === 'PGRST116') {
          const created: SupabaseProfileRow = {
            id: authUser.id,
            display_name: (authUser.user_metadata?.name as string) || authUser.email?.split('@')[0] || 'User',
            username: toHandle((authUser.user_metadata?.preferred_username as string) || authUser.email?.split('@')[0] || 'user'),
            bio: '',
            is_private: false,
            avatar_path: null,
          };
          const { error: createError } = await client.from('profiles').insert({ ...created, id: authUser.id });
          if (createError) {
            throw new Error(createError.message);
          }
          return remoteToProfile(created, authUser as IdentityLike);
        }
        throw new Error(error.message);
      }
      if (!data) {
        return remoteToProfile(
          {
            id: authUser.id,
            display_name: (authUser.user_metadata?.name as string) || authUser.email?.split('@')[0] || 'User',
            username: toHandle((authUser.user_metadata?.preferred_username as string) || authUser.email?.split('@')[0] || 'user'),
            bio: '',
            is_private: false,
            avatar_path: null,
          },
          authUser as IdentityLike,
        );
      }
      const row = data as SupabaseProfileRow;
      const signed = row.avatar_path
        ? await client.storage.from('profile-media').createSignedUrl(row.avatar_path, 3600)
        : { data: null };
      return remoteToProfile(row, authUser as IdentityLike, signed.data?.signedUrl || null);
    },
    async updateProfile(profile) {
      const payload = {
        id: authUser.id,
        username: toHandle(profile.handle),
        display_name: profile.displayName,
        bio: profile.bio || '',
        phone: normalizePhone(profile.phone),
        phone_discoverable: profile.phoneDiscoverable,
        username_discoverable: profile.usernameDiscoverable,
        is_private: !profile.discoverable,
      };
      const { error } = await client.from('profiles').upsert(payload, { onConflict: 'id' });
      if (error) {
        throw new Error(error.message);
      }
      const updated: UserProfile = {
        ...profile,
        id: authUser.id,
        displayName: profile.displayName.trim(),
        handle: toHandle(profile.handle),
        avatarInitials: initialsFor(profile.displayName),
      };
      await syncProfileDirectory(updated);
      return updated;
    },
    async updateAvatar(input) {
      if (!input.bytes) throw new Error('The selected profile image could not be read.');
      const safeExtension = input.extension?.match(/^[a-z0-9]{2,5}$/i)?.[0].toLowerCase() || 'jpg';
      const path = `${authUser.id}/avatar-${Date.now()}.${safeExtension}`;
      const { error: uploadError } = await client.storage.from('profile-media').upload(path, input.bytes, {
        contentType: input.mimeType || 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { error: updateError } = await client
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', authUser.id);
      if (updateError) {
        await client.storage.from('profile-media').remove([path]);
        throw new Error(updateError.message);
      }
      const current = await this.getProfile();
      return { ...current, avatarPath: path, avatarUrl: input.uri };
    },
  };
};
