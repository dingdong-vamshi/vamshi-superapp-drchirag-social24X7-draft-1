import type { SupabaseClient, User } from '@supabase/supabase-js';

import type {
  NewSocialPost,
  NewSocialStory,
  SocialComment,
  SocialPost,
  SocialRepository,
  SocialStory,
  SocialUser,
} from './types';

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_path?: string | null;
};

type FeedRow = {
  id: string;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_path?: string | null;
  body?: string | null;
  media_paths?: string[] | null;
  media_type?: 'image' | 'video' | null;
  thumbnail_path?: string | null;
  topic_slugs?: string[] | null;
  created_at: string;
  like_count?: number | string | null;
  comment_count?: number | string | null;
  liked_by_viewer?: boolean | null;
  following_author?: boolean | null;
  ranking_score?: number | null;
};

const asCount = (value: number | string | null | undefined) => Number(value || 0);
const absoluteAvatar = (path?: string | null) =>
  path?.startsWith('http://') || path?.startsWith('https://') ? path : null;

export function createSupabaseSocialRepository({
  client,
  user,
}: {
  client: SupabaseClient;
  user: User;
}): SocialRepository {
  const postUrl = (path?: string | null) =>
    path ? client.storage.from('social-posts').getPublicUrl(path).data.publicUrl : null;

  const toPost = (row: FeedRow): SocialPost => ({
    id: row.id,
    author: {
      id: row.author_id,
      handle: row.author_username,
      displayName: row.author_display_name,
      avatarUrl: absoluteAvatar(row.author_avatar_path),
      following: Boolean(row.following_author),
    },
    caption: row.body || '',
    mediaPath: row.media_paths?.[0] || null,
    mediaUrl: postUrl(row.media_paths?.[0]),
    mediaType: row.media_type || null,
    thumbnailUrl: postUrl(row.thumbnail_path),
    thumbnailPath: row.thumbnail_path || null,
    topicSlugs: row.topic_slugs || [],
    createdAt: row.created_at,
    likeCount: asCount(row.like_count),
    commentCount: asCount(row.comment_count),
    likedByViewer: Boolean(row.liked_by_viewer),
    rankingScore: row.ranking_score || 0,
  });

  const profileToUser = (profile: ProfileRow): SocialUser => ({
    id: profile.id,
    handle: profile.username,
    displayName: profile.display_name,
    avatarUrl: absoluteAvatar(profile.avatar_path),
  });

  const signedStoryUrl = async (path: string, expiresAt: string) => {
    const remainingSeconds = Math.max(
      1,
      Math.min(86400, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
    );
    const { data, error } = await client.storage
      .from('social-stories')
      .createSignedUrl(path, remainingSeconds);
    if (error) throw error;
    return data.signedUrl;
  };

  return {
    async getFeed() {
      const [{ data: feed, error: feedError }, { data: storyRows, error: storyError }] =
        await Promise.all([
          client.rpc('get_social_feed', { page_size: 50, page_offset: 0 }),
          client
            .from('stories')
            .select(
              'id,author_id,media_path,media_type,thumbnail_path,created_at,expires_at,story_views(viewer_id),profiles!stories_author_id_fkey(id,username,display_name,avatar_path)',
            )
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(100),
        ]);
      if (feedError) throw feedError;
      if (storyError) throw storyError;

      const stories = await Promise.all(
        (storyRows || []).map(async (row: any): Promise<SocialStory> => {
          const profileValue = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          const profile = profileValue as ProfileRow;
          const mediaUrl = await signedStoryUrl(row.media_path, row.expires_at);
          const thumbnailUrl = row.thumbnail_path
            ? await signedStoryUrl(row.thumbnail_path, row.expires_at)
            : mediaUrl;
          return {
            id: row.id,
            author: profileToUser(profile),
            mediaPath: row.media_path,
            mediaUrl,
            mediaType: row.media_type,
            thumbnailUrl,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            seen: (row.story_views || []).some(
              (view: { viewer_id: string }) => view.viewer_id === user.id,
            ),
          };
        }),
      );
      return { posts: ((feed || []) as FeedRow[]).map(toPost), stories };
    },

    async createPost(input: NewSocialPost) {
      const mediaPaths = input.mediaPath ? [input.mediaPath] : [];
      const { data, error } = await client
        .from('posts')
        .insert({
          author_id: user.id,
          body: input.caption,
          media_paths: mediaPaths,
          media_type: input.mediaType || null,
          thumbnail_path: input.thumbnailPath || null,
          topic_slugs: input.topicSlugs || [],
          visibility: 'public',
        })
        .select('id,author_id,body,media_paths,media_type,thumbnail_path,topic_slugs,created_at')
        .single();
      if (error) throw error;
      return {
        id: data.id,
        author: {
          id: user.id,
          handle:
            user.user_metadata?.preferred_username ||
            user.email?.split('@')[0] ||
            'you',
          displayName:
            user.user_metadata?.name || user.email?.split('@')[0] || 'You',
        },
        caption: data.body || '',
        mediaPath: data.media_paths?.[0] || null,
        mediaUrl: input.mediaUrl || postUrl(data.media_paths?.[0]),
        mediaType: data.media_type,
        thumbnailUrl: input.thumbnailUrl || null,
        thumbnailPath: data.thumbnail_path || null,
        topicSlugs: data.topic_slugs || [],
        createdAt: data.created_at,
        likeCount: 0,
        commentCount: 0,
        likedByViewer: false,
      };
    },

    async createStory(input: NewSocialStory) {
      if (!input.mediaPath) throw new Error('The story upload path is missing.');
      const { data, error } = await client
        .from('stories')
        .insert({
          author_id: user.id,
          media_path: input.mediaPath,
          media_type: input.mediaType,
          thumbnail_path: input.thumbnailPath || null,
          visibility: 'public',
        })
        .select('id,media_path,media_type,thumbnail_path,created_at,expires_at')
        .single();
      if (error) throw error;
      const mediaUrl = await signedStoryUrl(data.media_path, data.expires_at);
      const thumbnailUrl = data.thumbnail_path
        ? await signedStoryUrl(data.thumbnail_path, data.expires_at)
        : mediaUrl;
      return {
        id: data.id,
        author: {
          id: user.id,
          handle:
            user.user_metadata?.preferred_username ||
            user.email?.split('@')[0] ||
            'you',
          displayName:
            user.user_metadata?.name || user.email?.split('@')[0] || 'You',
        },
        mediaPath: data.media_path,
        mediaUrl,
        mediaType: data.media_type,
        thumbnailUrl,
        thumbnailPath: data.thumbnail_path || null,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        seen: false,
      };
    },

    async setPostLike(postId, liked) {
      const mutation = liked
        ? client.from('post_likes').upsert({ post_id: postId, user_id: user.id })
        : client
            .from('post_likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', user.id);
      const { error } = await mutation;
      if (error) throw error;
      const { count, error: countError } = await client
        .from('post_likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);
      if (countError) throw countError;
      return { likeCount: count || 0 };
    },

    async setFollowing(userId, following) {
      const mutation = following
        ? client
            .from('follows')
            .upsert({ follower_id: user.id, following_id: userId })
        : client
            .from('follows')
            .delete()
            .eq('follower_id', user.id)
            .eq('following_id', userId);
      const { error } = await mutation;
      if (error) throw error;
    },

    async getComments(postId) {
      const { data, error } = await client
        .from('post_comments')
        .select(
          'id,post_id,body,created_at,profiles!post_comments_author_id_fkey(id,username,display_name,avatar_path)',
        )
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map((row: any): SocialComment => {
        const profileValue = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          id: row.id,
          postId: row.post_id,
          author: profileToUser(profileValue as ProfileRow),
          body: row.body,
          createdAt: row.created_at,
        };
      });
    },

    async createComment(postId, body) {
      const { data, error } = await client
        .from('post_comments')
        .insert({ post_id: postId, author_id: user.id, body })
        .select('id,post_id,body,created_at')
        .single();
      if (error) throw error;
      return {
        id: data.id,
        postId: data.post_id,
        author: {
          id: user.id,
          handle:
            user.user_metadata?.preferred_username ||
            user.email?.split('@')[0] ||
            'you',
          displayName:
            user.user_metadata?.name || user.email?.split('@')[0] || 'You',
        },
        body: data.body,
        createdAt: data.created_at,
      };
    },
  };
}
