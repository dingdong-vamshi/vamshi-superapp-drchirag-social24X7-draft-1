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
  Bell,
  Bookmark,
  Camera,
  Heart,
  ImagePlus,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
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
  SocialSearchResult,
  SocialStory,
  SocialUser,
  UploadedMedia,
} from "./types";
import { flattenStoryGroups, groupStoriesByAuthor } from "./socialUtils";
import type {
  AppNotification,
  NotificationRepository,
} from "../notifications/notificationRepository";

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
  const hashtags = [...normalized.matchAll(/#([a-z0-9-]+)/g)].map(
    (match) => match[1],
  );
  return Object.entries(INTEREST_KEYWORDS)
    .filter(
      ([slug, words]) =>
        hashtags.includes(slug) ||
        words.some((word) => normalized.includes(word)),
    )
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
  notificationRepository?: NotificationRepository;
  onOpenNotification?: (notification: AppNotification) => void;
  initialNotificationsOpen?: boolean;
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
  notificationRepository,
  onOpenNotification,
  initialNotificationsOpen = false,
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
  const [storyQueue, setStoryQueue] = useState<SocialStory[]>([]);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  useEffect(() => {
    if (initialNotificationsOpen) setNotificationsOpen(true);
  }, [initialNotificationsOpen]);

  const loadNotifications = useCallback(async () => {
    if (!notificationRepository) return;
    setNotificationsLoading(true);
    try {
      setNotifications(await notificationRepository.list());
    } catch (cause) {
      Alert.alert(
        "Notifications unavailable",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    } finally {
      setNotificationsLoading(false);
    }
  }, [notificationRepository]);

  useEffect(() => {
    if (!notificationRepository) return undefined;
    void loadNotifications();
    return notificationRepository.subscribe(() => void loadNotifications());
  }, [loadNotifications, notificationRepository]);

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
      contentType: "media",
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
        contentType: "media",
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

  const createTextStory = async (
    textContent: string,
    backgroundStyle: NonNullable<SocialStory["backgroundStyle"]>,
  ) => {
    const clean = textContent.trim();
    if (!clean) return;
    const createdAt = new Date().toISOString();
    const temporary: SocialStory = {
      id: `pending-story-${Date.now()}`,
      author: viewer,
      contentType: "text",
      mediaType: null,
      textContent: clean,
      backgroundStyle,
      createdAt,
      expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
      seen: false,
    };
    setStories((current) => [temporary, ...current]);
    setStoryComposerOpen(false);
    try {
      const saved = await repository.createStory({
        contentType: "text",
        mediaType: null,
        textContent: clean,
        backgroundStyle,
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

  const storyGroups = useMemo(() => groupStoriesByAuthor(stories), [stories]);
  const openStoryGroup = useCallback(
    (authorId: string) => {
      setStoryQueue(flattenStoryGroups(storyGroups, authorId));
      setStoryIndex(0);
    },
    [storyGroups],
  );
  const storyStrip = useMemo(
    () => (
      <Stories
        groups={storyGroups}
        viewer={viewer}
        onCreate={() => setStoryComposerOpen(true)}
        onOpen={openStoryGroup}
        onOpenOwnProfile={onOpenOwnProfile}
        onSearch={() => setSearchOpen(true)}
        notificationCount={notifications.filter((item) => !item.readAt).length}
        onNotifications={() => setNotificationsOpen(true)}
      />
    ),
    [notifications, storyGroups, viewer, onOpenOwnProfile, openStoryGroup],
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
            onCreateStory={() => setStoryComposerOpen(true)}
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
        stories={storyQueue}
        initialIndex={storyIndex}
        close={() => setStoryIndex(null)}
      />
      <StoryComposer
        visible={storyComposerOpen}
        close={() => setStoryComposerOpen(false)}
        createMedia={() => {
          setStoryComposerOpen(false);
          void createStory();
        }}
        createText={(text, background) =>
          void createTextStory(text, background)
        }
      />
      <SocialSearch
        visible={searchOpen}
        repository={repository}
        close={() => setSearchOpen(false)}
        openProfile={(user) => {
          setSearchOpen(false);
          onOpenProfile?.(user);
        }}
      />
      <NotificationCenter
        visible={notificationsOpen}
        items={notifications}
        loading={notificationsLoading}
        close={() => setNotificationsOpen(false)}
        markAll={async () => {
          await notificationRepository?.markAllRead();
          await loadNotifications();
        }}
        open={async (item) => {
          await notificationRepository?.markRead(item);
          setNotifications((current) =>
            current.map((candidate) =>
              candidate.id === item.id && candidate.source === item.source
                ? { ...candidate, readAt: new Date().toISOString() }
                : candidate,
            ),
          );
          setNotificationsOpen(false);
          onOpenNotification?.(item);
        }}
      />
    </SafeAreaView>
  );
}

function NotificationCenter({
  visible,
  items,
  loading,
  close,
  markAll,
  open,
}: {
  visible: boolean;
  items: AppNotification[];
  loading: boolean;
  close: () => void;
  markAll: () => Promise<void>;
  open: (item: AppNotification) => Promise<void>;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.notificationModalBackdrop}>
        <SafeAreaView style={styles.notificationModalCard}>
          <View style={styles.notificationModalHeader}>
            <View>
              <Text
                accessibilityRole="header"
                style={styles.notificationModalTitle}
              >
                Notifications
              </Text>
              <Text style={styles.notificationModalSubtitle}>
                Messages, commerce and social activity
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close notifications"
              onPress={close}
              style={styles.notificationClose}
            >
              <X color={ink} size={23} />
            </Pressable>
          </View>
          {items.some((item) => !item.readAt) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void markAll()}
              style={styles.markAllButton}
            >
              <Text style={styles.markAllText}>Mark all as read</Text>
            </Pressable>
          ) : null}
          {loading && !items.length ? (
            <ActivityIndicator
              color={brand}
              size="large"
              style={styles.notificationLoading}
            />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => `${item.source}:${item.id}`}
              contentContainerStyle={styles.notificationList}
              ListEmptyComponent={
                <Text style={styles.notificationEmpty}>
                  You’re all caught up.
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void open(item)}
                  style={[
                    styles.notificationRow,
                    !item.readAt && styles.notificationRowUnread,
                  ]}
                >
                  <View
                    style={[
                      styles.notificationDot,
                      item.readAt && styles.notificationDotRead,
                    ]}
                  />
                  <View style={styles.notificationCopy}>
                    <View style={styles.notificationTitleRow}>
                      <Text style={styles.notificationTitle}>{item.title}</Text>
                      <Text style={styles.notificationSource}>
                        {item.source}
                      </Text>
                    </View>
                    <Text style={styles.notificationBody}>{item.body}</Text>
                    <Text style={styles.notificationTime}>
                      {ago(item.createdAt)}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Stories({
  groups,
  viewer,
  onCreate,
  onOpen,
  onOpenOwnProfile,
  onSearch,
  notificationCount,
  onNotifications,
}: {
  groups: ReturnType<typeof groupStoriesByAuthor>;
  viewer: SocialUser;
  onCreate: () => void;
  onOpen: (authorId: string) => void;
  onOpenOwnProfile?: () => void;
  onSearch: () => void;
  notificationCount: number;
  onNotifications: () => void;
}) {
  return (
    <View style={styles.storyBlock}>
      <View style={styles.socialHeader}>
        <Text accessibilityRole="header" style={styles.socialTitle}>
          social
        </Text>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search social"
          style={styles.topSearch}
          onPress={onSearch}
        >
          <Search size={18} color="#8f98a8" />
          <Text style={styles.topSearchText}>Search</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open notifications"
          onPress={onNotifications}
          style={styles.notificationButton}
        >
          <Bell size={24} color="#111111" />
          {notificationCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {notificationCount > 99 ? "99+" : notificationCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open my social profile"
          onPress={onOpenOwnProfile}
        >
          <Avatar user={viewer} size={38} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={groups}
        keyExtractor={(group) => group.author.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stories}
        ListHeaderComponent={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add to your story"
            onPress={onCreate}
            style={styles.story}
          >
            <View style={[styles.storyRing, styles.addStoryRing]}>
              <Plus size={31} color="#5f6673" />
              <View style={styles.plusBadge}>
                <Plus size={13} color="#fff" />
              </View>
            </View>
            <Text numberOfLines={1} style={styles.storyName}>
              Add story
            </Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${item.author.displayName}'s stories`}
            style={styles.story}
            onPress={() => onOpen(item.author.id)}
          >
            <View
              style={[
                styles.storyRing,
                item.stories.every((story) => story.seen) && styles.seenStory,
              ]}
            >
              <StoryThumbnail story={item.stories[0]} />
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

const STORY_BACKGROUNDS = [
  "forest",
  "sunset",
  "ocean",
  "berry",
  "midnight",
] as const;

function storyBackground(value: SocialStory["backgroundStyle"]) {
  switch (value) {
    case "sunset":
      return { backgroundColor: "#DB6B45" };
    case "ocean":
      return { backgroundColor: "#176B87" };
    case "berry":
      return { backgroundColor: "#8B3A62" };
    case "midnight":
      return { backgroundColor: "#1D2740" };
    default:
      return { backgroundColor: "#087A4B" };
  }
}

function StoryComposer({
  visible,
  close,
  createMedia,
  createText,
}: {
  visible: boolean;
  close: () => void;
  createMedia: () => void;
  createText: (
    text: string,
    background: (typeof STORY_BACKGROUNDS)[number],
  ) => void;
}) {
  const [mode, setMode] = useState<"choose" | "text">("choose");
  const [draft, setDraft] = useState("");
  const [background, setBackground] =
    useState<(typeof STORY_BACKGROUNDS)[number]>("forest");
  useEffect(() => {
    if (visible) return;
    setMode("choose");
    setDraft("");
    setBackground("forest");
  }, [visible]);
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
            accessibilityLabel="Close story composer"
            onPress={close}
          >
            <X color={ink} size={27} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.composerTitle}>
            New story
          </Text>
          <View style={{ width: 27 }} />
        </View>
        {mode === "choose" ? (
          <View style={styles.storyComposerChoices}>
            <Pressable style={styles.storyComposerChoice} onPress={createMedia}>
              <ImagePlus color={brand} size={28} />
              <Text style={styles.storyComposerChoiceTitle}>
                Photo or video
              </Text>
              <Text style={styles.storyComposerChoiceCopy}>
                Choose media from your device.
              </Text>
            </Pressable>
            <Pressable
              style={styles.storyComposerChoice}
              onPress={() => setMode("text")}
            >
              <Text style={styles.storyComposerTextIcon}>Aa</Text>
              <Text style={styles.storyComposerChoiceTitle}>Text story</Text>
              <Text style={styles.storyComposerChoiceCopy}>
                Share a short update for 24 hours.
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.textStoryComposer}>
            <View
              style={[styles.textStoryPreview, storyBackground(background)]}
            >
              <TextInput
                accessibilityLabel="Text story content"
                autoFocus
                multiline
                maxLength={240}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type your story…"
                placeholderTextColor="#DCEBE4"
                style={styles.textStoryInput}
              />
            </View>
            <View style={styles.storyPalette}>
              {STORY_BACKGROUNDS.map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`${value} story background`}
                  accessibilityState={{ selected: background === value }}
                  onPress={() => setBackground(value)}
                  style={[
                    styles.storySwatch,
                    storyBackground(value),
                    background === value && styles.storySwatchSelected,
                  ]}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Publish text story"
              disabled={!draft.trim()}
              style={[
                styles.publishStoryButton,
                !draft.trim() && styles.disabledButton,
              ]}
              onPress={() => createText(draft, background)}
            >
              <Text style={styles.publishStoryButtonText}>Share story</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function SocialSearch({
  visible,
  repository,
  close,
  openProfile,
}: {
  visible: boolean;
  repository: SocialRepository;
  close: () => void;
  openProfile: (user: SocialUser) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocialSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setSearchError(null);
      return;
    }
    const clean = query.trim();
    if (!clean) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      repository
        .search(clean)
        .then((next) => {
          if (active) setResults(next);
        })
        .catch(() => {
          if (active)
            setSearchError("Search is unavailable. Please try again.");
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, repository, visible]);
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
            accessibilityLabel="Close social search"
            onPress={close}
          >
            <X color={ink} size={27} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.composerTitle}>
            Search social
          </Text>
          <View style={{ width: 27 }} />
        </View>
        <View style={styles.socialSearchInputRow}>
          <Search size={19} color="#738092" />
          <TextInput
            accessibilityLabel="Search people and posts"
            autoFocus
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            placeholder="Search people and posts"
            style={styles.socialSearchInput}
          />
          {searching ? <ActivityIndicator color={brand} /> : null}
        </View>
        {searchError ? (
          <Text style={styles.searchError}>{searchError}</Text>
        ) : null}
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.socialSearchResults}
          ListEmptyComponent={
            query.trim() && !searching ? (
              <Text style={styles.emptyText}>No matching people or posts.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.socialSearchResult}
              onPress={() => openProfile(item.author)}
            >
              <Avatar user={item.author} size={42} />
              <View style={styles.socialSearchResultCopy}>
                <View style={styles.authorNameRow}>
                  <Text style={styles.socialSearchResultTitle}>
                    {item.author.displayName}
                  </Text>
                  {item.author.verifiedProfessional ? (
                    <Text style={styles.verifiedDot}>✓</Text>
                  ) : null}
                </View>
                <Text style={styles.meta}>
                  @{item.author.handle}
                  {item.kind === "post" ? " · post" : ""}
                </Text>
                {item.body ? (
                  <Text numberOfLines={2} style={styles.socialSearchBody}>
                    {item.body}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
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
  if (story.contentType === "text")
    return (
      <View style={styles.storyThumbnailClip}>
        <View
          style={[
            styles.storyThumbnail,
            styles.textStory,
            storyBackground(story.backgroundStyle),
          ]}
        >
          <Text numberOfLines={3} style={styles.textStoryThumbnailCopy}>
            {story.textContent}
          </Text>
        </View>
      </View>
    );
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
    <View style={styles.storyThumbnailClip}>
      <Image
        accessibilityLabel={`${story.author.displayName}'s story thumbnail`}
        source={{ uri: source }}
        style={styles.storyThumbnail}
        resizeMode="cover"
      />
    </View>
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
  const story = visible
    ? stories[Math.min(activeIndex, stories.length - 1)]
    : null;
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
              {story.contentType === "text" ? (
                <View
                  style={[
                    styles.storyMediaAsset,
                    styles.textStory,
                    storyBackground(story.backgroundStyle),
                  ]}
                >
                  <Text style={styles.textStoryViewerCopy}>
                    {story.textContent}
                  </Text>
                </View>
              ) : story.mediaUrl ? (
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
          <View style={styles.authorNameRow}>
            <Text style={styles.authorName}>{post.author.handle}</Text>
            {post.author.verifiedProfessional ? (
              <Text style={styles.verifiedDot}>✓</Text>
            ) : null}
          </View>
          <Text style={styles.meta}>{post.author.displayName}</Text>
        </Pressable>
        {!ownPost ? (
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
        ) : null}
        <MoreHorizontal size={25} color={ink} />
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
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.likedByViewer ? "Unlike post" : "Like post"}
          accessibilityState={{ selected: post.likedByViewer }}
          onPress={onLike}
          style={styles.action}
        >
          <Heart
            size={28}
            color={post.likedByViewer ? "#E7374F" : ink}
            fill={post.likedByViewer ? "#E7374F" : "none"}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open comments"
          onPress={() => onComments?.(post)}
          style={styles.action}
        >
          <MessageCircle size={28} color={ink} />
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
          <Send size={27} color={ink} />
        </Pressable>
        <View style={styles.actionSpacer} />
        <Bookmark size={27} color={ink} />
      </View>
      <Text style={styles.likesText}>{post.likeCount} likes</Text>
      {post.caption ? (
        <Text style={styles.caption}>
          <Text style={styles.captionAuthor}>{post.author.handle} </Text>
          {post.caption}
        </Text>
      ) : null}
      <Pressable onPress={() => onComments?.(post)}>
        <Text style={styles.commentsPreview}>
          View all {post.commentCount} comments
        </Text>
      </Pressable>
      <Text style={styles.timestamp}>
        {ago(post.createdAt).toUpperCase()} AGO
      </Text>
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
  feed: { paddingBottom: 112, backgroundColor: "#ffffff" },
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
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#edf0f2",
  },
  socialHeader: {
    minHeight: 54,
    paddingHorizontal: 18,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  kicker: { display: "none" },
  socialTitle: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "500",
    color: "#111111",
    textTransform: "lowercase",
    borderBottomWidth: 3,
    borderBottomColor: brand,
    paddingBottom: 2,
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
  topSearch: {
    flex: 1,
    minHeight: 44,
    borderRadius: 18,
    backgroundColor: "#f1f3f6",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 15,
  },
  topSearchText: { color: "#7d8594", fontSize: 16 },
  notificationButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#ff314b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  notificationBadgeText: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
  notificationModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16,24,40,0.48)",
    justifyContent: "flex-end",
  },
  notificationModalCard: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "86%",
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  notificationModalHeader: {
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e4e7ec",
  },
  notificationModalTitle: { color: ink, fontSize: 24, fontWeight: "900" },
  notificationModalSubtitle: { color: "#667085", fontSize: 13, marginTop: 3 },
  notificationClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f2f4f7",
    alignItems: "center",
    justifyContent: "center",
  },
  markAllButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  markAllText: { color: brand, fontSize: 14, fontWeight: "800" },
  notificationLoading: { padding: 48 },
  notificationList: { paddingHorizontal: 14, paddingBottom: 28 },
  notificationEmpty: { color: "#667085", textAlign: "center", padding: 42 },
  notificationRow: {
    minHeight: 88,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e4e7ec",
    flexDirection: "row",
    gap: 11,
    borderRadius: 16,
  },
  notificationRowUnread: { backgroundColor: "#eefbf3" },
  notificationDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: brand,
    marginTop: 7,
  },
  notificationDotRead: { backgroundColor: "#d0d5dd" },
  notificationCopy: { flex: 1, minWidth: 0 },
  notificationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  notificationTitle: { flex: 1, color: ink, fontSize: 16, fontWeight: "800" },
  notificationSource: {
    color: "#087c43",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  notificationBody: {
    color: "#475467",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  notificationTime: { color: "#98a2b3", fontSize: 11, marginTop: 6 },
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
  stories: { paddingHorizontal: 18, gap: 16 },
  story: { width: 74, alignItems: "center", gap: 7 },
  storyRing: {
    width: 70,
    height: 70,
    padding: 3,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: "#07c160",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  addStoryRing: {
    borderColor: "#d7dbe1",
    backgroundColor: "#f2f3f5",
    boxShadow: "0 7px 16px rgba(15, 23, 42, 0.10)",
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
  storyThumbnail: { width: "100%", height: "100%", borderRadius: 28 },
  textStory: { alignItems: "center", justifyContent: "center" },
  textStoryThumbnailCopy: {
    color: "#ffffff",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    textAlign: "center",
    padding: 5,
  },
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
  storyName: {
    maxWidth: 74,
    fontSize: 13,
    color: "#111111",
    textAlign: "center",
  },
  avatar: {
    backgroundColor: "#dff4e7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "700", color: "#07934a" },
  post: {
    marginTop: 10,
    paddingVertical: 0,
    backgroundColor: "#ffffff",
    borderRadius: 0,
    borderTopWidth: 8,
    borderTopColor: "#f0f2f4",
    overflow: "hidden",
  },
  postHeader: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  author: { flex: 1 },
  authorNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  authorName: { color: "#111111", fontWeight: "800", fontSize: 16 },
  verifiedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#2f80ed",
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    fontWeight: "900",
  },
  meta: { color: "#747b87", marginTop: 2, fontSize: 13 },
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
  postImage: { width: "100%", height: 430, backgroundColor: "#eeeeee" },
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
  textStoryViewerCopy: {
    color: "#ffffff",
    fontSize: 32,
    lineHeight: 42,
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: 34,
  },
  storyMediaMissing: { alignItems: "center", gap: 10 },
  storyMediaMissingText: { color: "#ffffff", fontWeight: "700" },
  storyTapZone: { position: "absolute", top: 88, bottom: 0, width: "36%" },
  storyTapLeft: { left: 0 },
  storyTapRight: { right: 0 },
  caption: {
    color: "#111111",
    paddingHorizontal: 18,
    paddingTop: 4,
    fontSize: 15,
    lineHeight: 22,
  },
  captionAuthor: { fontWeight: "800", color: "#111111" },
  actions: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  action: { alignItems: "center", justifyContent: "center", minHeight: 34 },
  actionSpacer: { flex: 1 },
  actionText: { color: "#333333", fontWeight: "500" },
  likesText: {
    paddingHorizontal: 18,
    color: "#111111",
    fontSize: 15,
    fontWeight: "800",
  },
  commentsPreview: {
    paddingHorizontal: 18,
    paddingTop: 8,
    color: "#8a8f98",
    fontSize: 15,
  },
  timestamp: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
    color: "#a1a6af",
    fontSize: 12,
    letterSpacing: 0.3,
  },
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
  storyComposerChoices: { padding: 18, gap: 14 },
  storyComposerChoice: {
    minHeight: 150,
    padding: 20,
    borderRadius: 22,
    backgroundColor: "#F2FAF5",
    borderWidth: 1,
    borderColor: "#CFE9D8",
    justifyContent: "center",
    gap: 7,
  },
  storyComposerTextIcon: { color: brand, fontSize: 30, fontWeight: "900" },
  storyComposerChoiceTitle: { color: ink, fontSize: 20, fontWeight: "800" },
  storyComposerChoiceCopy: { color: "#687386", lineHeight: 20 },
  textStoryComposer: { flex: 1, padding: 18 },
  textStoryPreview: { minHeight: 360, borderRadius: 24, overflow: "hidden" },
  textStoryInput: {
    width: "100%",
    minHeight: 360,
    padding: 28,
    color: "#ffffff",
    fontSize: 29,
    lineHeight: 38,
    fontWeight: "800",
    textAlign: "center",
    textAlignVertical: "center",
  },
  storyPalette: {
    flexDirection: "row",
    gap: 13,
    paddingVertical: 18,
    justifyContent: "center",
  },
  storySwatch: { width: 38, height: 38, borderRadius: 19 },
  storySwatchSelected: {
    borderWidth: 4,
    borderColor: "#ffffff",
    outlineWidth: 2,
    outlineColor: brand,
  },
  publishStoryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: brand,
    alignItems: "center",
    justifyContent: "center",
  },
  publishStoryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  disabledButton: { opacity: 0.42 },
  socialSearchInputRow: {
    margin: 16,
    paddingHorizontal: 14,
    minHeight: 50,
    borderRadius: 17,
    backgroundColor: "#F1F4F2",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  socialSearchInput: { flex: 1, color: ink, fontSize: 16 },
  socialSearchResults: { paddingHorizontal: 16, paddingBottom: 30 },
  socialSearchResult: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DDE5E0",
    flexDirection: "row",
    gap: 12,
  },
  socialSearchResultCopy: { flex: 1 },
  socialSearchResultTitle: { color: ink, fontSize: 15, fontWeight: "800" },
  socialSearchBody: { color: "#465247", marginTop: 6, lineHeight: 19 },
  searchError: { color: "#B42318", marginHorizontal: 18, marginBottom: 8 },
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
