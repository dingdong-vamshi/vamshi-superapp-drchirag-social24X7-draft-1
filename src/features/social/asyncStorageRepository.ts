import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewSocialPost, SocialComment, SocialPost, SocialRepository, SocialStory, SocialUser } from './types';

const storageKey = 'kora-mobile:social:v1';
type StoredSocial = { posts: SocialPost[]; stories: SocialStory[]; comments: SocialComment[] };
const empty: StoredSocial = { posts: [], stories: [], comments: [] };

function id(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
async function read(): Promise<StoredSocial> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return empty;
  try {
    const saved = JSON.parse(raw) as Partial<StoredSocial>;
    return { posts: saved.posts ?? [], stories: saved.stories ?? [], comments: saved.comments ?? [] };
  } catch { return empty; }
}
async function write(state: StoredSocial) { await AsyncStorage.setItem(storageKey, JSON.stringify(state)); }

/**
 * Offline-first repository for Expo Go. Replace this at composition time with
 * the Supabase implementation once auth and Storage are configured; interface
 * semantics stay identical so the native UI does not change.
 */
export function createAsyncStorageSocialRepository(viewer: SocialUser): SocialRepository {
  return {
    async getFeed() {
      const state = await read();
      const now = Date.now();
      const normalizedStories = state.stories.map((story) => ({
        ...story,
        expiresAt:
          story.expiresAt ||
          new Date(new Date(story.createdAt).getTime() + 86400000).toISOString(),
        mediaType: story.mediaType || ("image" as const),
        thumbnailUrl: story.thumbnailUrl || story.mediaUrl || null,
      }));
      const stories = normalizedStories.filter(
        (story) => new Date(story.expiresAt).getTime() > now,
      );
      if (
        stories.length !== state.stories.length ||
        state.stories.some((story) => !story.expiresAt || !story.mediaType)
      )
        await write({ ...state, stories });
      return { posts: state.posts, stories };
    },
    async createPost(input: NewSocialPost) {
      const state = await read();
      const post: SocialPost = {
        id: id('post'), author: viewer, caption: input.caption, mediaUrl: input.mediaUrl,
        mediaPath: input.mediaPath, mediaType: input.mediaType, thumbnailUrl: input.thumbnailUrl,
        thumbnailPath: input.thumbnailPath,
        topicSlugs: input.topicSlugs, createdAt: new Date().toISOString(), likeCount: 0,
        commentCount: 0, likedByViewer: false,
      };
      await write({ ...state, posts: [post, ...state.posts] }); return post;
    },
    async createStory(input) {
      const state = await read();
      const createdAt = new Date().toISOString();
      const story: SocialStory = {
        id: id('story'), author: viewer, mediaUrl: input.mediaUrl,
        mediaPath: input.mediaPath, mediaType: input.mediaType,
        thumbnailUrl: input.thumbnailUrl, thumbnailPath: input.thumbnailPath, createdAt,
        expiresAt: new Date(Date.now() + 86400000).toISOString(), seen: false,
      };
      await write({ ...state, stories: [story, ...state.stories] }); return story;
    },
    async setPostLike(postId, liked) {
      const state = await read();
      let count = 0;
      const posts = state.posts.map((post) => {
        if (post.id !== postId) return post;
        count = Math.max(0, post.likeCount + (liked === post.likedByViewer ? 0 : liked ? 1 : -1));
        return { ...post, likedByViewer: liked, likeCount: count };
      });
      await write({ ...state, posts }); return { likeCount: count };
    },
    async setFollowing(userId, following) {
      const state = await read();
      await write({ ...state, posts: state.posts.map((post) => post.author.id === userId ? { ...post, author: { ...post.author, following } } : post) });
    },
    async getComments(postId) { const state = await read(); return state.comments.filter((comment) => comment.postId === postId); },
    async createComment(postId, body) {
      const state = await read();
      const comment: SocialComment = { id: id('comment'), postId, author: viewer, body, createdAt: new Date().toISOString() };
      const posts = state.posts.map((post) => post.id === postId ? { ...post, commentCount: post.commentCount + 1 } : post);
      await write({ ...state, posts, comments: [...state.comments, comment] }); return comment;
    },
  };
}
