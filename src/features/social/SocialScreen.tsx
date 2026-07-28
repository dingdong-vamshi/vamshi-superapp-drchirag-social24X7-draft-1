import { useCallback, useEffect, useMemo, useState } from "react";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Camera,
  Heart,
  ImagePlus,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  UserPlus,
  X,
} from "lucide-react-native";
import type {
  MediaPicker,
  MediaUploader,
  ShareToChat,
  SocialComment,
  SocialPost,
  SocialRepository,
  SocialStory,
  SocialUser,
  UploadedMedia,
} from "./types";

const brand = "#00A859";
const ink = "#182334";
const DAY_MS = 24 * 60 * 60 * 1000;
const INTEREST_KEYWORDS: Record<string, string[]> = {
  art: ["art", "design", "drawing", "painting"],
  business: ["business", "startup", "founder", "work"],
  community: ["community", "friends", "family", "local"],
  education: ["education", "learn", "study", "school"],
  entertainment: ["movie", "show", "entertainment", "celebrity"],
  fashion: ["fashion", "style", "outfit"],
  fitness: ["fitness", "gym", "workout", "running"],
  food: ["food", "recipe", "restaurant", "cooking"],
  gaming: ["game", "gaming", "esports"],
  music: ["music", "song", "concert"],
  sports: ["sport", "cricket", "football", "tennis"],
  technology: ["tech", "technology", "software", "ai"],
  travel: ["travel", "trip", "vacation", "journey"],
  wellness: ["wellness", "health", "mindfulness", "yoga"],
};

function inferTopics(caption: string) {
  const normalized = caption.toLocaleLowerCase();
  const hashtags = [...normalized.matchAll(/#([a-z0-9-]+)/g)].map((match) => match[1]);
  return Object.entries(INTEREST_KEYWORDS)
    .filter(([slug, words]) => hashtags.includes(slug) || words.some((word) => normalized.includes(word)))
    .map(([slug]) => slug)
    .slice(0, 8);
}

type Props = {
  repository: SocialRepository;
  viewer: SocialUser;
  pickMedia?: MediaPicker;
  uploadMedia?: MediaUploader;
  onOpenComments?: (post: SocialPost) => void;
  onOpenProfile?: (user: SocialUser) => void;
  onOpenOwnProfile?: () => void;
  onShareToChat?: ShareToChat;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ago(iso: string) {
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  return minutes < 60
    ? `${minutes}m`
    : minutes < 1440
      ? `${Math.round(minutes / 60)}h`
      : `${Math.round(minutes / 1440)}d`;
}

function Avatar({ user, size = 44 }: { user: SocialUser; size?: number }) {
  return user.avatarUrl ? (
    <Image
      accessibilityLabel={`${user.displayName} profile image`}
      source={{ uri: user.avatarUrl }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      accessibilityLabel={`${user.displayName} avatar`}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={styles.avatarText}>{initials(user.displayName)}</Text>
    </View>
  );
}

export function SocialScreen({
  repository,
  viewer,
  pickMedia,
  uploadMedia,
  onOpenComments,
  onOpenProfile,
  onOpenOwnProfile,
  onShareToChat,
}: Props) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [stories, setStories] = useState<SocialStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [picked, setPicked] = useState<{
    uri: string;
    uploadUrl?: string;
    mediaPath?: string;
    mediaType?: "image" | "video";
    thumbnailUrl?: string | null;
    thumbnailPath?: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [commentsFor, setCommentsFor] = useState<SocialPost | null>(null);
  const [storyIndex, setStoryIndex] = useState<number | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const data = await repository.getFeed();
        setPosts(data.posts);
        setStories(data.stories);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to load your feed.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [repository],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const mediaEnabled = Boolean(pickMedia && uploadMedia);
  const selectAndUpload = async (
    target: "post" | "story",
  ): Promise<UploadedMedia | null> => {
    if (!pickMedia || !uploadMedia) {
      Alert.alert(
        "Media upload needs setup",
        "Install expo-image-picker and pass pickMedia plus uploadMedia to SocialScreen.",
      );
      return null;
    }
    try {
      const file = await pickMedia();
      if (!file) return null;
      return await uploadMedia(file, target);
    } catch {
      Alert.alert(
        "Upload failed",
        "Your photo or video was not posted. Check your connection and try again.",
      );
      return null;
    }
  };

  const choosePostMedia = async () => {
    if (!pickMedia || !uploadMedia) {
      void selectAndUpload("post");
      return;
    }
    try {
      const file = await pickMedia();
      if (!file) return;
      setPicked({ uri: file.uri });
      const uploaded = await uploadMedia(file, "post");
      setPicked({
        uri: file.uri,
        uploadUrl: uploaded.url,
        mediaPath: uploaded.path,
        mediaType: uploaded.mediaType,
        thumbnailUrl: uploaded.thumbnailUrl,
        thumbnailPath: uploaded.thumbnailPath,
      });
    } catch {
      setPicked(null);
      Alert.alert(
        "Upload failed",
        "Your photo or video was not posted. Check your connection and try again.",
      );
    }
  };

  const createStory = async () => {
    const uploaded = await selectAndUpload("story");
    if (!uploaded) return;
    const createdAt = new Date().toISOString();
    const temporary: SocialStory = {
      id: `pending-story-${Date.now()}`,
      author: viewer,
      mediaUrl: uploaded.url,
      mediaPath: uploaded.path,
      mediaType: uploaded.mediaType,
      thumbnailUrl: uploaded.thumbnailUrl || uploaded.url,
      thumbnailPath: uploaded.thumbnailPath,
      createdAt,
      expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
      seen: false,
    };
    setStories((current) => [temporary, ...current]);
    try {
      const saved = await repository.createStory({
        mediaUrl: uploaded.url,
        mediaPath: uploaded.path,
        mediaType: uploaded.mediaType,
        thumbnailUrl: uploaded.thumbnailUrl,
        thumbnailPath: uploaded.thumbnailPath,
      });
      setStories((current) =>
        current.map((story) => (story.id === temporary.id ? saved : story)),
      );
    } catch {
      setStories((current) =>
        current.filter((story) => story.id !== temporary.id),
      );
      Alert.alert(
        "Story not published",
        "Nothing was shared. Please try again.",
      );
    }
  };

  const publish = async () => {
    const cleanCaption = caption.trim();
    if (!cleanCaption && !picked?.uploadUrl) return;
    setSubmitting(true);
    const optimistic: SocialPost = {
      id: `pending-${Date.now()}`,
      author: viewer,
      caption: cleanCaption,
      mediaUrl: picked?.uploadUrl,
      mediaPath: picked?.mediaPath,
      mediaType: picked?.mediaType,
      thumbnailUrl: picked?.thumbnailUrl,
      thumbnailPath: picked?.thumbnailPath,
      topicSlugs: inferTopics(cleanCaption),
      createdAt: new Date().toISOString(),
      likeCount: 0,
      commentCount: 0,
      likedByViewer: false,
    };
    setPosts((current) => [optimistic, ...current]);
    setComposerOpen(false);
    setCaption("");
    setPicked(null);
    try {
      const saved = await repository.createPost({
        caption: cleanCaption,
        mediaUrl: optimistic.mediaUrl,
        mediaPath: optimistic.mediaPath,
        mediaType: optimistic.mediaType,
        thumbnailUrl: optimistic.thumbnailUrl,
        thumbnailPath: optimistic.thumbnailPath,
        topicSlugs: optimistic.topicSlugs,
      });
      setPosts((current) =>
        current.map((post) => (post.id === optimistic.id ? saved : post)),
      );
    } catch {
      setPosts((current) =>
        current.filter((post) => post.id !== optimistic.id),
      );
      Alert.alert(
        "Post not published",
        "Nothing was posted. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLike = async (post: SocialPost) => {
    const before = post;
    const nextLiked = !post.likedByViewer;
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
              ...item,
              likedByViewer: nextLiked,
              likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)),
            }
          : item,
      ),
    );
    try {
      const result = await repository.setPostLike(post.id, nextLiked);
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id ? { ...item, likeCount: result.likeCount } : item,
        ),
      );
    } catch {
      setPosts((current) =>
        current.map((item) => (item.id === post.id ? before : item)),
      );
      Alert.alert("Could not update like", "Please try again.");
    }
  };

  const toggleFollow = async (post: SocialPost) => {
    const following = !post.author.following;
    setPosts((current) =>
      current.map((item) =>
        item.author.id === post.author.id
          ? { ...item, author: { ...item.author, following } }
          : item,
      ),
    );
    try {
      await repository.setFollowing(post.author.id, following);
    } catch {
      setPosts((current) =>
        current.map((item) =>
          item.author.id === post.author.id
            ? { ...item, author: { ...item.author, following: !following } }
            : item,
        ),
      );
      Alert.alert("Could not update follow", "Please try again.");
    }
  };

  const storyStrip = useMemo(
    () => (
      <Stories
        stories={stories}
        viewer={viewer}
        onCreate={() => void createStory()}
        onCreatePost={() => setComposerOpen(true)}
        onOpen={(index) => setStoryIndex(index)}
        onOpenOwnProfile={onOpenOwnProfile}
      />
    ),
    [stories, viewer, onOpenOwnProfile],
  );

  if (loading) return <Centered label="Loading social" />;
  if (error && posts.length === 0)
    return <ErrorState message={error} retry={() => void load()} />;

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={posts}
        keyExtractor={(post) => post.id}
        contentContainerStyle={posts.length ? styles.feed : styles.emptyFeed}
        ListHeaderComponent={
          <>
            {storyStrip}
            {error ? <InlineError retry={() => void load()} /> : null}
          </>
        }
        ListEmptyComponent={
          <EmptyState
            onCreate={() => setComposerOpen(true)}
            onCreateStory={() => void createStory()}
          />
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            viewerId={viewer.id}
            onLike={() => void toggleLike(item)}
            onFollow={() => void toggleFollow(item)}
            onProfile={onOpenProfile}
            onComments={(post) => {
              setCommentsFor(post);
              onOpenComments?.(post);
            }}
            onShareToChat={onShareToChat}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={brand}
          />
        }
        showsVerticalScrollIndicator={false}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create a new post"
        style={styles.fab}
        onPress={() => setComposerOpen(true)}
      >
        <Plus color="#fff" size={26} />
      </Pressable>
      <Composer
        visible={composerOpen}
        caption={caption}
        setCaption={setCaption}
        picked={picked}
        chooseMedia={choosePostMedia}
        mediaEnabled={mediaEnabled}
        close={() => {
          if (!submitting) setComposerOpen(false);
        }}
        submit={() => void publish()}
        submitting={submitting}
      />
      <CommentsSheet
        post={commentsFor}
        viewer={viewer}
        repository={repository}
        close={() => setCommentsFor(null)}
      />
      <StoryViewer
        stories={stories}
        initialIndex={storyIndex}
        close={() => setStoryIndex(null)}
      />
    </SafeAreaView>
  );
}

function Stories({
  stories,
  viewer,
  onCreate,
  onCreatePost,
  onOpen,
  onOpenOwnProfile,
}: {
  stories: SocialStory[];
  viewer: SocialUser;
  onCreate: () => void;
  onCreatePost: () => void;
  onOpen: (index: number) => void;
  onOpenOwnProfile?: () => void;
}) {
  return (
    <View style={styles.storyBlock}>
      <View style={styles.socialHeader}>
        <View>
          <Text accessibilityRole="header" style={styles.socialTitle}>
            Social 24x7
          </Text>
          <Text style={styles.socialSubtitle}>Moments from your circle</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add to your story"
          onPress={onCreate}
          style={styles.headerAction}
        >
          <Camera size={20} color="#111111" />
        </Pressable>
      </View>
      <View style={styles.composerCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open my social profile"
          onPress={onOpenOwnProfile}
        >
          <Avatar user={viewer} size={42} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a post"
          onPress={onCreatePost}
          style={styles.composerPrompt}
        >
          <Text style={styles.composerPromptText}>Share a moment…</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a photo post"
          onPress={onCreatePost}
          style={styles.composerPhoto}
        >
          <ImagePlus size={20} color={brand} />
        </Pressable>
      </View>
      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={styles.heading}>
          Stories
        </Text>
        <Text style={styles.sectionMeta}>
          {stories.length ? `${stories.length} new` : "Add yours"}
        </Text>
      </View>
      <FlatList
        horizontal
        data={stories}
        keyExtractor={(story) => story.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stories}
        ListHeaderComponent={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add to your story"
            onPress={onCreate}
            style={styles.story}
          >
            <View style={[styles.storyRing, styles.newStory]}>
              <Avatar user={viewer} size={58} />
              <View style={styles.plusBadge}>
                <Plus size={13} color="#fff" />
              </View>
            </View>
            <Text numberOfLines={1} style={styles.storyName}>
              Your story
            </Text>
          </Pressable>
        }
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${item.author.displayName}'s story`}
            style={styles.story}
            onPress={() => onOpen(index)}
          >
            <View style={[styles.storyRing, item.seen && styles.seenStory]}>
              <StoryThumbnail story={item} />
            </View>
            <Text numberOfLines={1} style={styles.storyName}>
              {item.author.handle}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function SocialVideo({
  uri,
  style,
  autoplay = false,
  controls = true,
  muted = false,
}: {
  uri: string;
  style: object;
  autoplay?: boolean;
  controls?: boolean;
  muted?: boolean;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = autoplay;
    instance.muted = muted;
    if (autoplay) instance.play();
  });
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={controls}
      surfaceType="textureView"
    />
  );
}

function StoryThumbnail({ story }: { story: SocialStory }) {
  const source = story.thumbnailUrl || story.mediaUrl;
  if (!source)
    return (
      <View style={styles.storyPlaceholder}>
        <Camera color="#07934a" size={22} />
      </View>
    );
  return story.mediaType === "video" ? (
    <View style={styles.storyThumbnailClip}>
      <SocialVideo
        uri={source}
        style={styles.storyThumbnail}
        controls={false}
        muted
      />
      <View style={styles.videoBadge}>
        <Text style={styles.videoBadgeText}>▶</Text>
      </View>
    </View>
  ) : (
    <Image
      accessibilityLabel={`${story.author.displayName}'s story thumbnail`}
      source={{ uri: source }}
      style={styles.storyThumbnail}
      resizeMode="cover"
    />
  );
}

function StoryViewer({
  stories,
  initialIndex,
  close,
}: {
  stories: SocialStory[];
  initialIndex: number | null;
  close: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const visible = initialIndex !== null && stories.length > 0;
  const story = visible ? stories[Math.min(activeIndex, stories.length - 1)] : null;
  const duration = story?.mediaType === "video" ? 15000 : 7000;

  useEffect(() => {
    if (initialIndex === null) return;
    setActiveIndex(Math.min(initialIndex, Math.max(0, stories.length - 1)));
    setElapsed(0);
  }, [initialIndex, stories.length]);

  useEffect(() => {
    if (!visible || !story) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const nextElapsed = Date.now() - startedAt;
      if (nextElapsed >= duration) {
        if (activeIndex < stories.length - 1) {
          setActiveIndex((current) => current + 1);
          setElapsed(0);
        } else {
          close();
        }
      } else {
        setElapsed(nextElapsed);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [activeIndex, close, duration, stories.length, story, visible]);

  const move = (direction: -1 | 1) => {
    const next = activeIndex + direction;
    if (next < 0 || next >= stories.length) {
      close();
      return;
    }
    setActiveIndex(next);
    setElapsed(0);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.storyViewer}>
        {story && (
          <>
            <View style={styles.storyProgressRow}>
              {stories.map((item, index) => (
                <View key={item.id} style={styles.storyProgressTrack}>
                  <View
                    style={[
                      styles.storyProgressFill,
                      {
                        width:
                          index < activeIndex
                            ? "100%"
                            : index > activeIndex
                              ? "0%"
                              : `${Math.min(100, (elapsed / duration) * 100)}%`,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.storyViewerHeader}>
              <Avatar user={story.author} size={38} />
              <View style={styles.storyViewerHeaderCopy}>
                <Text style={styles.storyViewerName}>
                  {story.author.displayName}
                </Text>
                <Text style={styles.storyViewerTime}>
                  {ago(story.createdAt)} · expires in{" "}
                  {Math.max(
                    1,
                    Math.ceil(
                      (new Date(story.expiresAt).getTime() - Date.now()) /
                        3600000,
                    ),
                  )}
                  h
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close story"
                onPress={close}
                style={styles.storyViewerClose}
              >
                <X color="#ffffff" size={25} />
              </Pressable>
            </View>
            <View style={styles.storyMedia}>
              {story.mediaUrl ? (
                story.mediaType === "video" ? (
                  <SocialVideo
                    key={story.id}
                    uri={story.mediaUrl}
                    style={styles.storyMediaAsset}
                    autoplay
                    controls={false}
                  />
                ) : (
                  <Image
                    source={{ uri: story.mediaUrl }}
                    style={styles.storyMediaAsset}
                    resizeMode="contain"
                  />
                )
              ) : (
                <View style={styles.storyMediaMissing}>
                  <Camera color="#ffffff" size={34} />
                  <Text style={styles.storyMediaMissingText}>
                    Story media is unavailable
                  </Text>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous story"
                onPress={() => move(-1)}
                style={[styles.storyTapZone, styles.storyTapLeft]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next story"
                onPress={() => move(1)}
                style={[styles.storyTapZone, styles.storyTapRight]}
              />
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function PostCard({
  post,
  viewerId,
  onLike,
  onFollow,
  onProfile,
  onComments,
  onShareToChat,
}: {
  post: SocialPost;
  viewerId: string;
  onLike: () => void;
  onFollow: () => void;
  onProfile?: (u: SocialUser) => void;
  onComments?: (post: SocialPost) => void;
  onShareToChat?: ShareToChat;
}) {
  const ownPost = post.author.id === viewerId;
  return (
    <View
      style={styles.post}
      accessibilityLabel={`Post by ${post.author.displayName}`}
    >
      <View style={styles.postHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${post.author.displayName}'s profile`}
          onPress={() => onProfile?.(post.author)}
        >
          <Avatar user={post.author} />
        </Pressable>
        <Pressable
          style={styles.author}
          accessibilityRole="button"
          onPress={() => onProfile?.(post.author)}
        >
          <Text style={styles.authorName}>{post.author.displayName}</Text>
          <Text style={styles.meta}>
            @{post.author.handle} · {ago(post.createdAt)}
          </Text>
        </Pressable>
        {!ownPost && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${post.author.following ? "Unfollow" : "Follow"} ${post.author.displayName}`}
            onPress={onFollow}
            style={[styles.follow, post.author.following && styles.following]}
          >
            <UserPlus size={15} color={post.author.following ? ink : "#fff"} />
            <Text
              style={[
                styles.followText,
                post.author.following && styles.followingText,
              ]}
            >
              {post.author.following ? "Following" : "Follow"}
            </Text>
          </Pressable>
        )}
      </View>
      {post.mediaUrl ? (
        post.mediaType === "video" ? (
          <SocialVideo uri={post.mediaUrl} style={styles.postImage} />
        ) : (
          <Image
            accessibilityLabel="Post image"
            source={{ uri: post.mediaUrl }}
            style={styles.postImage}
            resizeMode="cover"
          />
        )
      ) : null}
      {post.caption ? (
        <Text style={styles.caption}>
          <Text style={styles.captionAuthor}>{post.author.handle} </Text>
          {post.caption}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.likedByViewer ? "Unlike post" : "Like post"}
          accessibilityState={{ selected: post.likedByViewer }}
          onPress={onLike}
          style={styles.action}
        >
          <Heart
            size={23}
            color={post.likedByViewer ? "#E7374F" : ink}
            fill={post.likedByViewer ? "#E7374F" : "none"}
          />
          <Text style={styles.actionText}>{post.likeCount}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open comments"
          onPress={() => onComments?.(post)}
          style={styles.action}
        >
          <MessageCircle size={23} color={ink} />
          <Text style={styles.actionText}>{post.commentCount}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share post to a chat"
          onPress={() => {
            if (onShareToChat) void onShareToChat(post);
            else
              Alert.alert(
                "Share to chat",
                "Connect onShareToChat to the native Chats feature.",
              );
          }}
          style={styles.action}
        >
          <Send size={21} color={ink} />
        </Pressable>
      </View>
    </View>
  );
}

function CommentsSheet({
  post,
  viewer,
  repository,
  close,
}: {
  post: SocialPost | null;
  viewer: SocialUser;
  repository: SocialRepository;
  close: () => void;
}) {
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!post) return;
    setLoading(true);
    setDraft("");
    repository
      .getComments(post.id)
      .then(setComments)
      .catch(() =>
        Alert.alert("Comments unavailable", "Please try again shortly."),
      )
      .finally(() => setLoading(false));
  }, [post, repository]);
  const send = async () => {
    if (!post || !draft.trim() || sending) return;
    const body = draft.trim();
    const pending: SocialComment = {
      id: `pending-comment-${Date.now()}`,
      postId: post.id,
      author: viewer,
      body,
      createdAt: new Date().toISOString(),
    };
    setComments((current) => [...current, pending]);
    setDraft("");
    setSending(true);
    try {
      const saved = await repository.createComment(post.id, body);
      setComments((current) =>
        current.map((comment) => (comment.id === pending.id ? saved : comment)),
      );
    } catch {
      setComments((current) =>
        current.filter((comment) => comment.id !== pending.id),
      );
      Alert.alert("Comment not sent", "Please try again.");
    } finally {
      setSending(false);
    }
  };
  return (
    <Modal
      visible={Boolean(post)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.composerScreen}>
        <View style={styles.composerHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close comments"
            onPress={close}
          >
            <X color={ink} size={27} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.composerTitle}>
            Comments
          </Text>
          <View style={{ width: 27 }} />
        </View>
        {loading ? (
          <Centered label="Loading comments" />
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(comment) => comment.id}
            contentContainerStyle={styles.comments}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Be the first to comment.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.comment}>
                <Avatar user={item.author} size={34} />
                <View style={styles.commentBody}>
                  <Text style={styles.commentAuthor}>
                    {item.author.displayName}{" "}
                    <Text style={styles.meta}>{ago(item.createdAt)}</Text>
                  </Text>
                  <Text style={styles.commentText}>{item.body}</Text>
                </View>
              </View>
            )}
          />
        )}
        <View style={styles.commentComposer}>
          <TextInput
            accessibilityLabel="Write a comment"
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment…"
            style={styles.commentInput}
            onSubmitEditing={() => void send()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
          >
            <Send
              color={draft.trim() && !sending ? brand : "#A7AFBA"}
              size={23}
            />
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Composer({
  visible,
  caption,
  setCaption,
  picked,
  chooseMedia,
  mediaEnabled,
  close,
  submit,
  submitting,
}: {
  visible: boolean;
  caption: string;
  setCaption: (value: string) => void;
  picked: {
    uri: string;
    uploadUrl?: string;
    mediaPath?: string;
    mediaType?: "image" | "video";
    thumbnailUrl?: string | null;
    thumbnailPath?: string | null;
  } | null;
  chooseMedia: () => void;
  mediaEnabled: boolean;
  close: () => void;
  submit: () => void;
  submitting: boolean;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.composerScreen}>
        <View style={styles.composerHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close post composer"
            disabled={submitting}
            onPress={close}
          >
            <X color={ink} size={27} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.composerTitle}>
            New post
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Publish post"
            disabled={submitting || (!caption.trim() && !picked?.uploadUrl)}
            onPress={submit}
          >
            <Text
              style={[
                styles.publish,
                (submitting || (!caption.trim() && !picked?.uploadUrl)) &&
                  styles.disabled,
              ]}
            >
              {submitting ? "Posting…" : "Post"}
            </Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="Post caption"
          placeholder="What do you want to share?"
          placeholderTextColor="#778292"
          value={caption}
          onChangeText={setCaption}
          multiline
          autoFocus
          style={styles.captionInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a photo or video for this post"
          onPress={chooseMedia}
          style={styles.mediaButton}
        >
          <ImagePlus color={brand} size={22} />
          <Text style={styles.mediaText}>
            {picked
              ? picked.uploadUrl
                ? picked.mediaType === "video"
                  ? "Video attached"
                  : "Photo attached"
                : "Uploading media…"
              : mediaEnabled
                ? "Add photo or video"
                : "Add media (setup required)"}
          </Text>
        </Pressable>
        {picked ? (
          picked.mediaType === "video" ? (
            <SocialVideo uri={picked.uri} style={styles.preview} />
          ) : (
            <Image source={{ uri: picked.uri }} style={styles.preview} />
          )
        ) : null}
        <View style={styles.composerHint}>
          <Camera size={17} color="#687386" />
          <Text style={styles.hintText}>
            Only share media you have permission to post.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Centered({ label }: { label: string }) {
  return (
    <SafeAreaView style={styles.center}>
      <ActivityIndicator
        color={brand}
        size="large"
        accessibilityLabel={label}
      />
      <Text style={styles.muted}>{label}…</Text>
    </SafeAreaView>
  );
}
function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <SafeAreaView style={styles.center}>
      <Text accessibilityRole="header" style={styles.errorTitle}>
        Social is unavailable
      </Text>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        style={styles.retry}
        onPress={retry}
      >
        <RefreshCw color="#fff" size={18} />
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </SafeAreaView>
  );
}
function InlineError({ retry }: { retry: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Retry loading feed"
      onPress={retry}
      style={styles.inlineError}
    >
      <Text style={styles.errorText}>Some updates could not load.</Text>
      <Text style={styles.retryLink}>Retry</Text>
    </Pressable>
  );
}
function EmptyState({
  onCreate,
  onCreateStory,
}: {
  onCreate: () => void;
  onCreateStory: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <ImagePlus size={30} color={brand} />
        </View>
        <Text accessibilityRole="header" style={styles.emptyTitle}>
          Make this space yours
        </Text>
        <Text style={styles.emptyText}>
          Share your first moment or add a story. Updates from people you
          connect with will appear here.
        </Text>
        <View style={styles.emptyActions}>
          <Pressable
            accessibilityRole="button"
            onPress={onCreate}
            style={styles.emptyPrimary}
          >
            <Plus size={18} color="#ffffff" />
            <Text style={styles.retryText}>Create post</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onCreateStory}
            style={styles.emptySecondary}
          >
            <Camera size={18} color={brand} />
            <Text style={styles.emptySecondaryText}>Add story</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  feed: { paddingBottom: 112, backgroundColor: "#f6f8f7" },
  emptyFeed: { flexGrow: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 28,
    backgroundColor: "#ffffff",
  },
  storyBlock: {
    paddingTop: 4,
    paddingBottom: 18,
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    boxShadow: "0 8px 24px rgba(20, 35, 27, 0.06)",
  },
  socialHeader: {
    minHeight: 64,
    paddingHorizontal: 20,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: { display: "none" },
  socialTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: "#111111",
  },
  socialSubtitle: {
    marginTop: 2,
    color: "#7c8781",
    fontSize: 12,
    fontWeight: "500",
  },
  headerAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#eef8f1",
    alignItems: "center",
    justifyContent: "center",
  },
  livePill: { display: "none" },
  liveDot: { display: "none" },
  liveText: { display: "none" },
  composerCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    padding: 10,
    borderRadius: 18,
    backgroundColor: "#f7f9f8",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#edf1ee",
  },
  composerPrompt: { flex: 1, minHeight: 42, justifyContent: "center" },
  composerPromptText: { color: "#8b9590", fontSize: 15 },
  composerPhoto: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#e8f7ed",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeading: {
    paddingHorizontal: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { fontSize: 16, fontWeight: "700", color: "#111111" },
  sectionMeta: { color: "#8a948f", fontSize: 12, fontWeight: "600" },
  stories: { paddingHorizontal: 18, gap: 14 },
  story: { width: 68, alignItems: "center", gap: 6 },
  storyRing: {
    width: 64,
    height: 64,
    padding: 2,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "#07c160",
  },
  storyPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 30,
    backgroundColor: "#e8f7ed",
    alignItems: "center",
    justifyContent: "center",
  },
  storyThumbnailClip: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#e8f7ed",
  },
  storyThumbnail: { width: "100%", height: "100%" },
  videoBadge: {
    position: "absolute",
    right: 3,
    bottom: 3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBadgeText: { color: "#ffffff", fontSize: 9, fontWeight: "800" },
  seenStory: { borderColor: "#cccccc" },
  newStory: { position: "relative", borderColor: "#cccccc" },
  plusBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "#07c160",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  storyName: { maxWidth: 68, fontSize: 11, color: "#555555" },
  avatar: {
    backgroundColor: "#dff4e7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "700", color: "#07934a" },
  post: {
    marginHorizontal: 12,
    marginTop: 12,
    paddingVertical: 15,
    backgroundColor: "#ffffff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#edf0ee",
    overflow: "hidden",
    boxShadow: "0 6px 18px rgba(20, 35, 27, 0.05)",
  },
  postHeader: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  author: { flex: 1 },
  authorName: { color: "#111111", fontWeight: "600", fontSize: 15 },
  meta: { color: "#999999", marginTop: 2, fontSize: 12 },
  follow: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: "#07c160",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
  },
  following: {
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#dddddd",
  },
  followText: { color: "#fff", fontWeight: "600", fontSize: 12 },
  followingText: { color: "#333333" },
  postImage: { width: "100%", height: 360, backgroundColor: "#eeeeee" },
  storyViewer: { flex: 1, backgroundColor: "#090b0a" },
  storyProgressRow: {
    position: "absolute",
    zIndex: 4,
    top: 12,
    left: 10,
    right: 10,
    flexDirection: "row",
    gap: 4,
  },
  storyProgressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  storyProgressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#ffffff",
  },
  storyViewerHeader: {
    position: "absolute",
    zIndex: 4,
    top: 26,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  storyViewerHeaderCopy: { flex: 1 },
  storyViewerName: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  storyViewerTime: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 11,
    marginTop: 2,
  },
  storyViewerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
  },
  storyMedia: { flex: 1, alignItems: "center", justifyContent: "center" },
  storyMediaAsset: { width: "100%", height: "100%" },
  storyMediaMissing: { alignItems: "center", gap: 10 },
  storyMediaMissingText: { color: "#ffffff", fontWeight: "700" },
  storyTapZone: { position: "absolute", top: 88, bottom: 0, width: "36%" },
  storyTapLeft: { left: 0 },
  storyTapRight: { right: 0 },
  caption: {
    color: "#222222",
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  captionAuthor: { fontWeight: "600", color: "#576b95" },
  actions: {
    paddingHorizontal: 16,
    paddingTop: 11,
    flexDirection: "row",
    gap: 24,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34 },
  actionText: { color: "#333333", fontWeight: "500" },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#07c160",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 3px 10px rgba(0, 0, 0, 0.18)",
  },
  composerScreen: { flex: 1, backgroundColor: "#fff" },
  composerHeader: {
    height: 60,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#DDE2E7",
  },
  composerTitle: { color: ink, fontSize: 17, fontWeight: "700" },
  publish: { color: brand, fontWeight: "800", fontSize: 16 },
  disabled: { color: "#A7AFBA" },
  captionInput: {
    minHeight: 150,
    padding: 18,
    color: ink,
    fontSize: 17,
    textAlignVertical: "top",
  },
  mediaButton: {
    marginHorizontal: 16,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#EFFFF5",
  },
  mediaText: { color: "#087A42", fontWeight: "700" },
  preview: { margin: 16, width: 180, height: 180, borderRadius: 18 },
  composerHint: {
    margin: 16,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  hintText: { color: "#687386", flex: 1, fontSize: 12 },
  muted: { color: "#687386" },
  errorTitle: { color: ink, fontWeight: "700", fontSize: 20 },
  errorText: { color: "#687386", textAlign: "center", lineHeight: 20 },
  retry: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: brand,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  inlineError: {
    margin: 16,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#FFF6E8",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  retryLink: { color: "#9A5B00", fontWeight: "700" },
  empty: { paddingHorizontal: 16, paddingTop: 18 },
  emptyCard: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: "#f0faf3",
    borderWidth: 2,
    borderColor: "#cfead7",
    borderBottomWidth: 7,
    borderBottomColor: "#b9dec5",
    alignItems: "center",
    boxShadow: "0 12px 24px rgba(7, 122, 62, 0.12)",
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#dcefe2",
    borderBottomWidth: 4,
    borderBottomColor: "#c5e4cf",
    boxShadow: "0 6px 12px rgba(7, 122, 62, 0.10)",
  },
  emptyTitle: {
    color: ink,
    fontWeight: "800",
    fontSize: 21,
    textAlign: "center",
  },
  emptyText: {
    color: "#68736d",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
  },
  emptyActions: { width: "100%", marginTop: 20, flexDirection: "row", gap: 10 },
  emptyPrimary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: brand,
    borderWidth: 1,
    borderColor: "#21b76b",
    borderBottomWidth: 5,
    borderBottomColor: "#06783d",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 7px 12px rgba(5, 120, 61, 0.18)",
  },
  emptySecondary: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#cfe8d7",
    borderBottomWidth: 5,
    borderBottomColor: "#acd6b9",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 7px 12px rgba(7, 122, 62, 0.10)",
  },
  emptySecondaryText: { color: brand, fontWeight: "700" },
  comments: { padding: 16, gap: 15 },
  comment: { flexDirection: "row", gap: 9 },
  commentBody: {
    flex: 1,
    backgroundColor: "#F4F6F8",
    borderRadius: 16,
    padding: 10,
  },
  commentAuthor: { color: ink, fontWeight: "700", fontSize: 13 },
  commentText: { color: ink, marginTop: 4, lineHeight: 19 },
  commentComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#DDE2E7",
  },
  commentInput: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#F2F4F6",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: ink,
  },
});
