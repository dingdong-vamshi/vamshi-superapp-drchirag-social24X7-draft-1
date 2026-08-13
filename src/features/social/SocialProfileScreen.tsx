import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ArrowLeft,
  Camera,
  Grid3X3,
  Play,
  Repeat2,
  Share2,
  Star,
} from "lucide-react-native";
import { router } from "expo-router";

import type { ProfileRepository } from "../profile/profileRepository";
import type { SocialComment, SocialPost, SocialRepository, SocialStory, SocialUser } from "./types";

const brand = "#08b04f";
const ink = "#162033";
const muted = "#667085";
const card = "#f3fff6";

type Props = {
  viewer: SocialUser;
  selectedUserId?: string | null;
  fallbackUser?: Partial<SocialUser> | null;
  repository: SocialRepository;
  profileRepository: ProfileRepository;
  supabaseClient?: SupabaseClient | null;
};

type TabKey = "posts" | "reels" | "reviews" | "reposts";

type ProfileViewModel = {
  id: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl?: string | null;
};

type ReviewItem = SocialComment & { postMediaUrl?: string | null };

export function SocialProfileScreen({
  viewer,
  selectedUserId,
  fallbackUser,
  repository,
  profileRepository,
  supabaseClient,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("posts");
  const [profile, setProfile] = useState<ProfileViewModel | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [stories, setStories] = useState<SocialStory[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [storefront, setStorefront] = useState<{ name: string; slug: string } | null>(null);

  const profileUserId = selectedUserId || viewer.id;
  const isOwnProfile = profileUserId === viewer.id;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const feed = await repository.getFeed();
        const userPosts = feed.posts.filter((post) => post.author.id === profileUserId);
        const userStories = feed.stories.filter((story) => story.author.id === profileUserId);

        const fallbackAuthor = userPosts[0]?.author || userStories[0]?.author;
        let nextProfile: ProfileViewModel;
        if (isOwnProfile) {
          const own = await profileRepository.getProfile();
          nextProfile = {
            id: own.id,
            displayName: own.displayName,
            handle: own.handle,
            bio: own.bio,
            avatarUrl: viewer.avatarUrl,
          };
        } else if (supabaseClient && isUuid(profileUserId)) {
          const { data } = await supabaseClient
            .from("profiles")
            .select("id,username,display_name,bio,avatar_path")
            .eq("id", profileUserId)
            .maybeSingle();
          nextProfile = {
            id: profileUserId,
            displayName:
              data?.display_name?.trim() ||
              fallbackUser?.displayName ||
              fallbackAuthor?.displayName ||
              "Social 24x7 user",
            handle:
              data?.username?.trim() ||
              fallbackUser?.handle ||
              fallbackAuthor?.handle ||
              "user",
            bio: data?.bio || "",
            avatarUrl:
              absoluteUrl(data?.avatar_path) ||
              fallbackUser?.avatarUrl ||
              fallbackAuthor?.avatarUrl ||
              null,
          };
        } else {
          nextProfile = {
            id: profileUserId,
            displayName:
              fallbackUser?.displayName || fallbackAuthor?.displayName || "Social 24x7 user",
            handle: fallbackUser?.handle || fallbackAuthor?.handle || "user",
            bio: "",
            avatarUrl: fallbackUser?.avatarUrl || fallbackAuthor?.avatarUrl || null,
          };
        }

        let followerCount = 0;
        let followingCount = 0;
        if (supabaseClient && isUuid(profileUserId)) {
          const [
            { count: followerDbCount },
            { count: followingDbCount },
          ] = await Promise.all([
            supabaseClient
              .from("follows")
              .select("*", { count: "exact", head: true })
              .eq("following_id", profileUserId),
            supabaseClient
              .from("follows")
              .select("*", { count: "exact", head: true })
              .eq("follower_id", profileUserId),
          ]);
          followerCount = followerDbCount || 0;
          followingCount = followingDbCount || 0;
        }

        const commentGroups = await Promise.all(
          userPosts.slice(0, 6).map(async (post) => {
            const items = await repository.getComments(post.id);
            return items.map((comment) => ({ ...comment, postMediaUrl: post.thumbnailUrl || post.mediaUrl || null }));
          }),
        );

        let publicStorefront: { name: string; slug: string } | null = null;
        if (supabaseClient && isUuid(profileUserId)) {
          const { data: storefrontRows, error: storefrontError } =
            await supabaseClient.rpc("get_public_storefront_for_profile", {
              target_user: profileUserId,
            });
          if (!storefrontError) {
            const row = Array.isArray(storefrontRows) ? storefrontRows[0] : storefrontRows;
            publicStorefront = row
              ? { name: row.name as string, slug: row.slug as string }
              : null;
          }
        }

        if (!mounted) return;
        setProfile(nextProfile);
        setPosts(userPosts);
        setStories(userStories);
        setFollowers(followerCount);
        setFollowing(followingCount);
        setReviews(commentGroups.flat().slice(0, 8));
        setStorefront(publicStorefront);
      } catch (cause) {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : "Could not load this social profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [fallbackUser?.avatarUrl, fallbackUser?.displayName, fallbackUser?.handle, isOwnProfile, profileRepository, profileUserId, repository, supabaseClient, viewer.avatarUrl, viewer.id]);

  const reels = useMemo(
    () => posts.filter((post) => post.mediaType === "video"),
    [posts],
  );
  const reposts = useMemo(
    () =>
      posts.filter((post) =>
        post.caption.toLocaleLowerCase().includes("repost"),
      ),
    [posts],
  );
  const visibleItems = tab === "posts"
    ? posts
    : tab === "reels"
      ? reels
      : tab === "reposts"
        ? reposts
        : [];

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={brand} />
        <Text style={styles.stateText}>Loading social profile…</Text>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.stateTitle}>Could not load profile</Text>
        <Text style={styles.stateText}>{error || "Please try again."}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerIcon}>
            <ArrowLeft size={22} color={ink} />
          </Pressable>
          <Text style={styles.headerTitle}>{isOwnProfile ? "My Social Profile" : profile.displayName}</Text>
          <Pressable
            onPress={() => (isOwnProfile ? router.push("/profile") : router.push("/chats"))}
            style={styles.headerIcon}
          >
            {isOwnProfile ? <Camera size={20} color={ink} /> : <Share2 size={20} color={ink} />}
          </Pressable>
        </View>

        <View style={styles.topRow}>
          <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} size={108} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{posts.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatCount(followers)}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatCount(following)}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>

        <Text style={styles.name}>{profile.displayName}</Text>
        <Text style={styles.meta}>@{profile.handle}</Text>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => (isOwnProfile ? router.push("/profile") : undefined)}
            style={[styles.primaryButton, isOwnProfile ? styles.primaryButton : styles.primaryButton]}
          >
            <Text style={styles.primaryButtonText}>{isOwnProfile ? "Edit profile" : "Follow"}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/chats")}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>{isOwnProfile ? "Share profile" : "Message"}</Text>
          </Pressable>
          <Pressable style={styles.iconAction}>
            <Share2 size={22} color={ink} />
          </Pressable>
        </View>

        {storefront ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Order from ${storefront.name}`}
            onPress={() =>
              router.push({ pathname: "/store/[slug]", params: { slug: storefront.slug } })
            }
            style={styles.ctaCard}
          >
            <View>
              <Text style={styles.ctaTitle}>Order from Us</Text>
              <Text style={styles.ctaText}>{storefront.name} · Approved Seller storefront</Text>
            </View>
            <View style={styles.ctaIcon}>
              <Camera size={20} color={brand} />
            </View>
          </Pressable>
        ) : null}

        <Text style={styles.sectionTitle}>Highlights</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlights}>
          <HighlightBubble label="New" />
          {stories.slice(0, 4).map((story) => (
            <HighlightBubble
              key={story.id}
              label={story.mediaType === "video" ? "Reel" : "Story"}
              imageUrl={story.thumbnailUrl || story.mediaUrl || null}
            />
          ))}
        </ScrollView>

        <View style={styles.tabBar}>
          <ProfileTab icon={Grid3X3} label="Posts" active={tab === "posts"} onPress={() => setTab("posts")} />
          <ProfileTab icon={Play} label="Reels" active={tab === "reels"} onPress={() => setTab("reels")} />
          <ProfileTab icon={Star} label="Reviews" active={tab === "reviews"} onPress={() => setTab("reviews")} />
          <ProfileTab icon={Repeat2} label="Reposts" active={tab === "reposts"} onPress={() => setTab("reposts")} />
        </View>

        {tab === "reviews" ? (
          reviews.length ? (
            <View style={styles.reviewList}>
              {reviews.map((review) => (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Avatar name={review.author.displayName} avatarUrl={review.author.avatarUrl} size={44} />
                    <View style={styles.reviewCopy}>
                      <Text style={styles.reviewAuthor}>{review.author.displayName}</Text>
                      <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
                    </View>
                  </View>
                  <Text style={styles.reviewBody}>{review.body}</Text>
                </View>
              ))}
            </View>
          ) : (
            <EmptyProfileState
              title="No reviews yet"
              body="Community feedback will appear here once people comment on this profile’s posts."
            />
          )
        ) : visibleItems.length ? (
          <View style={styles.grid}>
            {visibleItems.map((post) => (
              <View key={post.id} style={styles.card}>
                {post.thumbnailUrl || post.mediaUrl ? (
                  <Image
                    source={{ uri: post.thumbnailUrl || post.mediaUrl || "" }}
                    style={styles.cardImage}
                  />
                ) : (
                  <View style={[styles.cardImage, styles.cardPlaceholder]}>
                    <Camera size={32} color="#98a2b3" />
                  </View>
                )}
                <View style={styles.cardOverlay}>
                  {post.mediaType === "video" ? (
                    <View style={styles.metricRow}>
                      <Play size={14} color="#ffffff" />
                      <Text style={styles.metricText}>Reel</Text>
                    </View>
                  ) : null}
                  <View style={styles.metricRow}>
                    <Text style={styles.metricText}>♥ {post.likeCount}</Text>
                    <Text style={styles.metricText}>💬 {post.commentCount}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyProfileState
            title={
              tab === "reels"
                ? "No reels yet"
                : tab === "reposts"
                  ? "No reposts yet"
                    : "No posts yet"
            }
            body="This section will fill in automatically as content is created and connected."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileTab({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: typeof Grid3X3;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Icon size={18} color={ink} />
      <Text style={styles.tabLabel}>{label}</Text>
    </Pressable>
  );
}

function HighlightBubble({
  label,
  imageUrl,
}: {
  label: string;
  imageUrl?: string | null;
}) {
  return (
    <View style={styles.highlightItem}>
      <View style={styles.highlightRing}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.highlightImage} />
        ) : (
          <View style={[styles.highlightImage, styles.highlightEmpty]}>
            <Text style={styles.highlightPlus}>+</Text>
          </View>
        )}
      </View>
      <Text style={styles.highlightLabel}>{label}</Text>
    </View>
  );
}

function Avatar({
  name,
  avatarUrl,
  size,
}: {
  name: string;
  avatarUrl?: string | null;
  size: number;
}) {
  return avatarUrl ? (
    <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarText}>{initials(name)}</Text>
    </View>
  );
}

function EmptyProfileState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";

const absoluteUrl = (value?: string | null) =>
  value?.startsWith("http://") || value?.startsWith("https://") ? value : null;

const isUuid = (value?: string | null) =>
  Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));

const formatCount = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 18, paddingBottom: 120, gap: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", padding: 24 },
  stateTitle: { fontSize: 24, fontWeight: "800", color: ink, marginBottom: 8 },
  stateText: { fontSize: 16, lineHeight: 24, color: muted, textAlign: "center", marginTop: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "800", color: ink },
  headerIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  avatarFallback: { backgroundColor: "#eef0f5", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 34, fontWeight: "700", color: ink },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: ink },
  statLabel: { marginTop: 4, fontSize: 14, color: muted, fontWeight: "600" },
  name: { fontSize: 22, fontWeight: "800", color: ink },
  meta: { fontSize: 16, color: muted, fontWeight: "600" },
  bio: { fontSize: 16, lineHeight: 24, color: muted },
  actionRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  primaryButton: { flex: 1, height: 54, borderRadius: 14, backgroundColor: brand, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 18, fontWeight: "800", color: "#ffffff" },
  secondaryButton: { flex: 1, height: 54, borderRadius: 14, borderWidth: 1, borderColor: "#d0d5dd", alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  secondaryButtonText: { fontSize: 18, fontWeight: "700", color: ink },
  iconAction: { width: 54, height: 54, borderRadius: 14, borderWidth: 1, borderColor: "#d0d5dd", alignItems: "center", justifyContent: "center" },
  ctaCard: { borderRadius: 22, borderWidth: 1, borderColor: "#a7f3c1", backgroundColor: card, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  ctaTitle: { fontSize: 18, fontWeight: "800", color: ink },
  ctaText: { marginTop: 6, fontSize: 15, lineHeight: 22, color: muted },
  ctaIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: ink },
  highlights: { gap: 16, paddingRight: 20 },
  highlightItem: { alignItems: "center", gap: 8 },
  highlightRing: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, borderColor: "#e4e7ec", alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  highlightImage: { width: 68, height: 68, borderRadius: 34 },
  highlightEmpty: { backgroundColor: "#f7f8fa", alignItems: "center", justifyContent: "center" },
  highlightPlus: { fontSize: 34, color: "#98a2b3" },
  highlightLabel: { fontSize: 13, fontWeight: "600", color: ink },
  tabBar: { flexDirection: "row", gap: 6, backgroundColor: "#f2f4f7", borderRadius: 18, padding: 6 },
  tab: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: 14, paddingHorizontal: 6 },
  tabActive: { backgroundColor: "#ffffff" },
  tabLabel: { fontSize: 14, fontWeight: "700", color: ink },
  reviewList: { gap: 14 },
  reviewCard: { borderRadius: 22, borderWidth: 1, borderColor: "#eaecf0", backgroundColor: "#ffffff", padding: 18, gap: 14 },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  reviewCopy: { flex: 1 },
  reviewAuthor: { fontSize: 17, fontWeight: "800", color: ink },
  reviewDate: { marginTop: 4, fontSize: 14, color: muted },
  reviewBody: { fontSize: 16, lineHeight: 26, color: muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { width: "31.8%", aspectRatio: 0.78, borderRadius: 18, overflow: "hidden", backgroundColor: "#eef2f6", position: "relative" },
  cardImage: { width: "100%", height: "100%" },
  cardPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 10, gap: 4, backgroundColor: "rgba(0,0,0,0.18)" },
  metricRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metricText: { fontSize: 12, fontWeight: "700", color: "#ffffff" },
  emptyState: { borderRadius: 22, borderWidth: 1, borderColor: "#eaecf0", backgroundColor: "#ffffff", padding: 24, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: ink },
  emptyBody: { fontSize: 15, lineHeight: 24, color: muted, textAlign: "center" },
});
