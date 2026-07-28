import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useMemo } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../../src/lib/AuthContext';
import { SocialScreen } from '../../src/features/social/SocialScreen';
import { createAsyncStorageSocialRepository } from '../../src/features/social/asyncStorageRepository';
import { createSupabaseSocialRepository } from '../../src/features/social/supabaseSocialRepository';
import type { SocialUser } from '../../src/features/social/types';
import { supabase } from '../../src/lib/supabase';

export default function SocialPage() {
  const { user } = useAuth();
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'You';
  const handle = useMemo(
    () => (user?.user_metadata?.preferred_username || user?.email?.split('@')[0] || 'you').toString().replace(/[^a-zA-Z0-9_]/g, ''),
    [user?.email, user?.user_metadata?.preferred_username, user?.user_metadata?.name],
  );

  const viewer = useMemo<SocialUser>(
    () => ({
      id: user?.id || 'local-user',
      handle,
      displayName,
    }),
    [handle, displayName, user?.id],
  );

  const isSupabaseUser = Boolean(supabase && user && 'identities' in user);
  const repository = useMemo(
    () =>
      isSupabaseUser && supabase && user && 'identities' in user
        ? createSupabaseSocialRepository({ client: supabase, user })
        : createAsyncStorageSocialRepository(viewer),
    [isSupabaseUser, user, viewer.id, viewer.handle, viewer.displayName],
  );

  return (
    <SocialScreen
      viewer={viewer}
      repository={repository}
      onOpenOwnProfile={() => router.push('/social-profile')}
      onOpenProfile={(profileUser) =>
        router.push({
          pathname: '/social-profile',
          params: {
            userId: profileUser.id,
            handle: profileUser.handle,
            displayName: profileUser.displayName,
            avatarUrl: profileUser.avatarUrl || '',
          },
        })
      }
      onShareToChat={async (post) =>
        router.push({
          pathname: '/chats',
          params: { sharedId: post.id, sharedAuthor: post.author.handle, sharedCaption: post.caption },
        })
      }
      pickMedia={async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return null;
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.82,
          videoMaxDuration: 60,
          selectionLimit: 1,
        });
        if (result.canceled) return null;
        const asset = result.assets[0];
        let thumbnailUri: string | null = null;
        if (asset.type === 'video') {
          try {
            thumbnailUri = (
              await VideoThumbnails.getThumbnailAsync(asset.uri, {
                time: Math.min(1000, Math.max(0, (asset.duration || 0) / 3)),
                quality: 0.78,
              })
            ).uri;
          } catch {
            // The video remains uploadable if a platform codec cannot extract a frame.
          }
        }
        return {
          uri: asset.uri,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
          mediaType: asset.type === 'video' ? 'video' : 'image',
          durationMs: asset.duration,
          width: asset.width,
          height: asset.height,
          thumbnailUri,
        };
      }}
      uploadMedia={async (file, target) => {
        if (!isSupabaseUser || !supabase) {
          return {
            url: file.uri,
            mediaType: file.mediaType,
            thumbnailUrl: file.thumbnailUri || file.uri,
          };
        }
        const response = await fetch(file.uri);
        const bytes = await response.arrayBuffer();
        const fallbackExtension =
          file.mediaType === 'video'
            ? file.mimeType?.includes('webm') ? 'webm' : file.mimeType?.includes('quicktime') ? 'mov' : 'mp4'
            : file.mimeType?.includes('png') ? 'png' : file.mimeType?.includes('webp') ? 'webp' : 'jpg';
        const rawExtension = file.fileName?.split('.').pop()?.toLowerCase();
        const extension = rawExtension?.match(/^[a-z0-9]{2,5}$/) ? rawExtension : fallbackExtension;
        const path = `${viewer.id}/${target}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
        const bucket = target === 'story' ? 'social-stories' : 'social-posts';
        const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
          contentType: file.mimeType ?? 'image/jpeg',
          upsert: false,
          cacheControl: target === 'story' ? '3600' : '31536000',
        });
        if (error) throw error;
        let thumbnailPath: string | undefined;
        let thumbnailUrl: string | null = file.mediaType === 'image' ? file.uri : null;
        if (file.mediaType === 'video' && file.thumbnailUri) {
          const thumbnailResponse = await fetch(file.thumbnailUri);
          const thumbnailBytes = await thumbnailResponse.arrayBuffer();
          thumbnailPath = `${viewer.id}/${target}/thumbnails/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
          const { error: thumbnailError } = await supabase.storage
            .from(bucket)
            .upload(thumbnailPath, thumbnailBytes, {
              contentType: 'image/jpeg',
              upsert: false,
              cacheControl: target === 'story' ? '3600' : '31536000',
            });
          if (thumbnailError) throw thumbnailError;
          thumbnailUrl =
            target === 'post'
              ? supabase.storage.from(bucket).getPublicUrl(thumbnailPath).data.publicUrl
              : file.thumbnailUri;
        }
        const url =
          target === 'post'
            ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
            : file.uri;
        return {
          path,
          url,
          mediaType: file.mediaType,
          thumbnailUrl,
          thumbnailPath,
        };
      }}
    />
  );
}
