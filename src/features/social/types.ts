export type SocialUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  following?: boolean;
  verifiedProfessional?: boolean;
};

export type SocialStory = {
  id: string;
  author: SocialUser;
  mediaUrl?: string | null;
  mediaPath?: string | null;
  contentType: 'media' | 'text';
  mediaType: 'image' | 'video' | null;
  textContent?: string | null;
  backgroundStyle?: 'forest' | 'sunset' | 'ocean' | 'berry' | 'midnight' | null;
  thumbnailUrl?: string | null;
  thumbnailPath?: string | null;
  createdAt: string;
  expiresAt: string;
  seen?: boolean;
};

export type SocialPost = {
  id: string;
  author: SocialUser;
  caption: string;
  mediaUrl?: string | null;
  mediaPath?: string | null;
  mediaType?: 'image' | 'video' | null;
  thumbnailUrl?: string | null;
  thumbnailPath?: string | null;
  topicSlugs?: string[];
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  rankingScore?: number;
};

export type NewSocialPost = Pick<
  SocialPost,
  | 'caption'
  | 'mediaUrl'
  | 'mediaPath'
  | 'mediaType'
  | 'thumbnailUrl'
  | 'thumbnailPath'
  | 'topicSlugs'
>;
export type NewSocialStory = Pick<
  SocialStory,
  | 'contentType'
  | 'mediaUrl'
  | 'mediaPath'
  | 'mediaType'
  | 'thumbnailUrl'
  | 'thumbnailPath'
  | 'textContent'
  | 'backgroundStyle'
>;

export type SocialSearchResult = {
  kind: 'profile' | 'post';
  id: string;
  author: SocialUser;
  body?: string | null;
  createdAt?: string | null;
};

export type SocialComment = {
  id: string;
  postId: string;
  author: SocialUser;
  body: string;
  createdAt: string;
};

/**
 * Implement this with Supabase in the composition root. The screen never
 * imports credentials or a service-role key, keeping client authorization at
 * the API/RLS boundary.
 */
export type SocialRepository = {
  getFeed: () => Promise<{ posts: SocialPost[]; stories: SocialStory[] }>;
  createPost: (post: NewSocialPost) => Promise<SocialPost>;
  createStory: (story: NewSocialStory) => Promise<SocialStory>;
  setPostLike: (postId: string, liked: boolean) => Promise<{ likeCount: number }>;
  setFollowing: (userId: string, following: boolean) => Promise<void>;
  search: (query: string) => Promise<SocialSearchResult[]>;
  getComments: (postId: string) => Promise<SocialComment[]>;
  createComment: (postId: string, body: string) => Promise<SocialComment>;
};

export type PickedMedia = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  mediaType: 'image' | 'video';
  durationMs?: number | null;
  width?: number;
  height?: number;
  thumbnailUri?: string | null;
};

export type UploadedMedia = {
  path?: string;
  url: string;
  mediaType: 'image' | 'video';
  thumbnailUrl?: string | null;
  thumbnailPath?: string | null;
};

/**
 * Native composition boundary. Implement with `expo-image-picker` then upload
 * its selected asset to a private/object-authorized Supabase Storage bucket.
 */
export type MediaPicker = () => Promise<PickedMedia | null>;

/** Upload a selected local URI and return a delivery URL (or signed URL). */
export type MediaUploader = (
  file: PickedMedia,
  target: 'post' | 'story',
) => Promise<UploadedMedia>;

/** Pass this to bridge a post into the native Chats feature. */
export type ShareToChat = (post: SocialPost) => void | Promise<void>;
