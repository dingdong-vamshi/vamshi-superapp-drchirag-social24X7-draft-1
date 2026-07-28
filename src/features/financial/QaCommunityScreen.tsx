import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowLeft, Bookmark, CircleHelp, Eye, MessageSquare, Plus, Search, ThumbsUp } from "lucide-react-native";

import { useAuth } from "../../lib/AuthContext";
import {
  createQaAnswer,
  createQaQuestion,
  deleteQaAnswer,
  deleteQaQuestion,
  listQaAnswers,
  listQaWorkspace,
  recordQaView,
  toggleQaBookmark,
  toggleQaTopicFollow,
  toggleQaVote,
} from "./repository";
import type { QaAnswer, QaQuestion, QaTopic } from "./types";

type QaTab = "feed" | "topics" | "saved" | "profile";
type SortKey = "recent" | "most_viewed" | "most_answered";

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "recent", label: "Recent" },
  { key: "most_viewed", label: "Most Viewed" },
  { key: "most_answered", label: "Most Answered" },
];

const questionDefaults = () => ({
  title: "",
  body: "",
  topicIds: [] as string[],
});

export default function QaCommunityScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<QaTab>("feed");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [questionForm, setQuestionForm] = useState(questionDefaults());
  const [selectedQuestion, setSelectedQuestion] = useState<QaQuestion | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");

  const workspaceQuery = useQuery({
    queryKey: ["qa-workspace", user && "id" in user ? user.id : "guest", search, sort],
    queryFn: () => listQaWorkspace(user, { search, sort }),
  });
  const answersQuery = useQuery({
    queryKey: ["qa-answers", selectedQuestion?.id ?? "none"],
    queryFn: () => listQaAnswers(selectedQuestion!.id),
    enabled: Boolean(selectedQuestion?.id),
  });

  const topics = workspaceQuery.data?.topics ?? [];
  const questions = workspaceQuery.data?.questions ?? [];
  const savedQuestions = questions.filter((question) => question.saved);
  const userId = user && "id" in user ? user.id : "";
  const myQuestions = questions.filter((question) => question.authorId === userId);
  const myAnswerCount = useMemo(
    () =>
      (answersQuery.data ?? []).filter((answer) => answer.authorId === userId).length +
      questions.filter((question) => question.authorId === userId).reduce((total, question) => total + question.answerCount, 0),
    [answersQuery.data, questions, userId],
  );
  const myReputation = myQuestions.reduce((total, question) => total + question.voteCount * 10 + question.answerCount * 5, 0);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["qa-workspace"] });
    if (selectedQuestion?.id) {
      await queryClient.invalidateQueries({ queryKey: ["qa-answers", selectedQuestion.id] });
    }
  };

  const createQuestionMutation = useMutation({
    mutationFn: async () => createQaQuestion(questionForm),
    onSuccess: async () => {
      setComposerOpen(false);
      setQuestionForm(questionDefaults());
      await invalidate();
    },
  });

  const answerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedQuestion?.id || !answerDraft.trim()) throw new Error("Write an answer first.");
      return createQaAnswer(selectedQuestion.id, answerDraft);
    },
    onSuccess: async () => {
      setAnswerDraft("");
      await invalidate();
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async (question: QaQuestion) => toggleQaBookmark(question.id, question.saved),
    onSuccess: invalidate,
  });

  const voteMutation = useMutation({
    mutationFn: async (question: QaQuestion) => toggleQaVote(question.id, question.voted),
    onSuccess: invalidate,
  });

  const followMutation = useMutation({
    mutationFn: async (topic: QaTopic) => toggleQaTopicFollow(topic.id, topic.following),
    onSuccess: invalidate,
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => deleteQaQuestion(questionId),
    onSuccess: async () => {
      setSelectedQuestion(null);
      await invalidate();
    },
  });

  const deleteAnswerMutation = useMutation({
    mutationFn: async (answerId: string) => deleteQaAnswer(answerId),
    onSuccess: invalidate,
  });

  const openQuestion = async (question: QaQuestion) => {
    setSelectedQuestion(question);
    await recordQaView(question.id);
    await queryClient.invalidateQueries({ queryKey: ["qa-workspace"] });
  };

  if (workspaceQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Centered title="Loading Community" text="Fetching questions, topics and your saved items..." loading />
      </SafeAreaView>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <Centered
          title="Could not load Q&A Community"
          text={workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "Please try again."}
          actionLabel="Retry"
          onPress={() => void workspaceQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <ArrowLeft color="#111827" size={24} />
        </Pressable>
        <View style={styles.titleRow}>
          <CircleHelp color="#9333ea" size={22} />
          <Text style={styles.title}>Q&A Community</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search color="#98a2b3" size={22} />
        <TextInput
          placeholder="Search questions, topics, or users"
          placeholderTextColor="#98a2b3"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.topActions}>
        <Pressable onPress={() => setComposerOpen(true)} style={styles.askButton}>
          <Plus color="#ffffff" size={18} />
          <Text style={styles.askButtonText}>Ask Question</Text>
        </Pressable>
        <Pressable onPress={() => setSortOpen(true)} style={styles.sortButton}>
          <Text style={styles.sortButtonText}>{sortOptions.find((option) => option.key === sort)?.label ?? "Recent"}</Text>
        </Pressable>
      </View>

      <View style={styles.tabsRow}>
        {(["feed", "topics", "saved", "profile"] as QaTab[]).map((item) => (
          <TabButton key={item} label={capitalize(item)} active={tab === item} onPress={() => setTab(item)} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "feed" ? (
          <View style={styles.section}>
            {questions.length === 0 ? (
              <Centered
                title={search ? "No matching questions" : "No questions yet"}
                text={search ? "Try a different keyword or ask the first question in this topic area." : "Ask the first question to get this community started."}
                actionLabel="Ask question"
                onPress={() => setComposerOpen(true)}
              />
            ) : (
              questions.map((question) => (
                <Pressable key={question.id} onPress={() => void openQuestion(question)} style={styles.questionCard}>
                  <View style={styles.questionTopRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initialsFor(question.authorName)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.authorName}>{question.authorName}</Text>
                      <Text style={styles.authorMeta}>@{question.authorUsername || "member"} · {question.createdAt.slice(0, 10)}</Text>
                    </View>
                  </View>
                  <Text style={styles.questionTitle}>{question.title}</Text>
                  <Text style={styles.questionBody} numberOfLines={3}>{question.body}</Text>
                  <View style={styles.topicWrap}>
                    {question.topics.map((topic) => (
                      <View key={topic.id} style={styles.topicChip}>
                        <Text style={styles.topicChipText}>{topic.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.questionFooter}>
                    <Metric icon={<ThumbsUp color="#667085" size={16} />} value={String(question.voteCount)} />
                    <Metric icon={<MessageSquare color="#667085" size={16} />} value={`${question.answerCount} answers`} />
                    <Metric icon={<Eye color="#667085" size={16} />} value={`${question.viewCount} views`} />
                    <Pressable onPress={() => void bookmarkMutation.mutate(question)} style={[styles.smallAction, question.saved && styles.smallActionActive]}>
                      <Bookmark color={question.saved ? "#2563eb" : "#667085"} size={16} />
                    </Pressable>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {tab === "topics" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Popular Topics</Text>
            {topics.map((topic) => (
              <View key={topic.id} style={styles.topicCard}>
                <View style={styles.topicEmojiWrap}>
                  <Text style={styles.topicEmoji}>{topic.iconEmoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.topicTitle}>{topic.label}</Text>
                  <Text style={styles.topicDescription}>{topic.description}</Text>
                  <Text style={styles.topicMeta}>{topic.followersCount} followers · {topic.questionsCount} questions</Text>
                </View>
                <Pressable onPress={() => void followMutation.mutate(topic)} style={styles.followButton}>
                  <Text style={styles.followButtonText}>{topic.following ? "Following" : "Follow"}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {tab === "saved" ? (
          <View style={styles.section}>
            {savedQuestions.length === 0 ? (
              <Centered title="No bookmarks yet" text="Save interesting questions to read later." />
            ) : (
              savedQuestions.map((question) => (
                <Pressable key={question.id} onPress={() => void openQuestion(question)} style={styles.questionCard}>
                  <Text style={styles.questionTitle}>{question.title}</Text>
                  <Text style={styles.questionBody} numberOfLines={2}>{question.body}</Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {tab === "profile" ? (
          <View style={styles.section}>
            <View style={styles.profileCard}>
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarLargeText}>{initialsFor(user && "email" in user ? user.email || "YU" : "YU")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileTitle}>Your Profile</Text>
                <Text style={styles.profileSubtitle}>Community Member</Text>
                <View style={styles.repBadge}>
                  <Text style={styles.repBadgeText}>{myReputation} rep</Text>
                </View>
              </View>
              <View style={styles.profileStats}>
                <Stat label="Questions" value={String(myQuestions.length)} />
                <Stat label="Answers" value={String(myAnswerCount)} />
                <Stat label="Saved" value={String(savedQuestions.length)} />
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <SimpleModal visible={composerOpen} title="Ask Question" onClose={() => setComposerOpen(false)} onSubmit={() => void createQuestionMutation.mutate()} submitLabel="Post question">
        <Field label="Title" value={questionForm.title} onChangeText={(value) => setQuestionForm((current) => ({ ...current, title: value }))} multiline={false} />
        <Field label="Details" value={questionForm.body} onChangeText={(value) => setQuestionForm((current) => ({ ...current, body: value }))} multiline />
        <Text style={styles.fieldLabel}>Topics</Text>
        <View style={styles.topicWrap}>
          {topics.map((topic) => {
            const selected = questionForm.topicIds.includes(topic.id);
            return (
              <Pressable
                key={topic.id}
                onPress={() =>
                  setQuestionForm((current) => ({
                    ...current,
                    topicIds: selected
                      ? current.topicIds.filter((topicId) => topicId !== topic.id)
                      : [...current.topicIds, topic.id],
                  }))
                }
                style={[styles.topicChip, selected && styles.topicChipActive]}
              >
                <Text style={[styles.topicChipText, selected && styles.topicChipTextActive]}>{topic.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SimpleModal>

      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setSortOpen(false)}>
          <View style={styles.sortModal}>
            {sortOptions.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  setSort(option.key);
                  setSortOpen(false);
                }}
                style={[styles.sortOption, sort === option.key && styles.sortOptionActive]}
              >
                <Text style={styles.sortOptionText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(selectedQuestion)} animationType="slide" onRequestClose={() => setSelectedQuestion(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Question</Text>
              <Pressable onPress={() => setSelectedQuestion(null)}>
                <Text style={styles.modalClose}>Close</Text>
              </Pressable>
            </View>
            {selectedQuestion ? (
              <>
                <Text style={styles.questionTitle}>{selectedQuestion.title}</Text>
                <Text style={styles.authorMeta}>{selectedQuestion.authorName} · @{selectedQuestion.authorUsername || "member"}</Text>
                <Text style={[styles.questionBody, { color: "#344054", marginTop: 10 }]}>{selectedQuestion.body}</Text>
                <View style={styles.rowGap}>
                  <Pressable onPress={() => void voteMutation.mutate(selectedQuestion)} style={[styles.inlineAction, selectedQuestion.voted && styles.inlineActionActive]}>
                    <ThumbsUp color={selectedQuestion.voted ? "#2563eb" : "#667085"} size={16} />
                    <Text style={styles.inlineActionText}>{selectedQuestion.voteCount} votes</Text>
                  </Pressable>
                  <Pressable onPress={() => void bookmarkMutation.mutate(selectedQuestion)} style={[styles.inlineAction, selectedQuestion.saved && styles.inlineActionActive]}>
                    <Bookmark color={selectedQuestion.saved ? "#2563eb" : "#667085"} size={16} />
                    <Text style={styles.inlineActionText}>{selectedQuestion.saved ? "Saved" : "Save"}</Text>
                  </Pressable>
                  {selectedQuestion.authorId === userId ? (
                    <Pressable onPress={() => void deleteQuestionMutation.mutate(selectedQuestion.id)} style={styles.inlineAction}>
                      <Text style={[styles.inlineActionText, { color: "#dc2626" }]}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={{ gap: 12, marginTop: 24 }}>
                  <Text style={styles.sectionTitle}>Answers</Text>
                  {answersQuery.isLoading ? <ActivityIndicator color="#9333ea" /> : null}
                  {(answersQuery.data ?? []).length === 0 && !answersQuery.isLoading ? (
                    <Centered title="No answers yet" text="Be the first to reply to this question." />
                  ) : null}
                  {(answersQuery.data ?? []).map((answer: QaAnswer) => (
                    <View key={answer.id} style={styles.answerCard}>
                      <View style={styles.answerHeader}>
                        <Text style={styles.authorName}>{answer.authorName}</Text>
                        {answer.authorId === userId ? (
                          <Pressable onPress={() => void deleteAnswerMutation.mutate(answer.id)}>
                            <Text style={styles.deleteText}>Delete</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={styles.answerBody}>{answer.body}</Text>
                      <Text style={styles.answerMeta}>{answer.createdAt.slice(0, 10)}</Text>
                    </View>
                  ))}

                  <Field label="Your answer" value={answerDraft} onChangeText={setAnswerDraft} multiline />
                  <Pressable onPress={() => void answerMutation.mutate()} style={styles.askButton}>
                    <Text style={styles.askButtonText}>Post answer</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function initialsFor(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "YU";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Centered({
  title,
  text,
  actionLabel,
  onPress,
  loading,
}: {
  title: string;
  text: string;
  actionLabel?: string;
  onPress?: () => void;
  loading?: boolean;
}) {
  return (
    <View style={styles.centered}>
      {loading ? <ActivityIndicator color="#9333ea" /> : null}
      <Text style={styles.centerTitle}>{title}</Text>
      <Text style={styles.centerText}>{text}</Text>
      {actionLabel && onPress ? (
        <Pressable onPress={onPress} style={styles.askButton}>
          <Text style={styles.askButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Metric({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <View style={styles.metric}>
      {icon}
      <Text style={styles.metricText}>{value}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SimpleModal({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>
          {children}
          <Pressable onPress={onSubmit} style={styles.askButton}>
            <Text style={styles.askButtonText}>{submitLabel}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        numberOfLines={multiline ? 5 : 1}
        style={[styles.fieldInput, multiline && styles.fieldInputLarge]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: "#111827", fontSize: 24, fontWeight: "700" },
  searchWrap: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f3f4f6",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  searchInput: { flex: 1, color: "#344054", fontSize: 18 },
  topActions: { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 16 },
  askButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f1021",
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 15,
  },
  askButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  sortButton: {
    minWidth: 130,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 15,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
  },
  sortButtonText: { color: "#111827", fontSize: 16, fontWeight: "600" },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: "#f1f2f6",
    borderRadius: 18,
    padding: 6,
  },
  tabButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabButtonActive: { backgroundColor: "#ffffff" },
  tabButtonText: { color: "#111827", fontSize: 16, fontWeight: "600" },
  tabButtonTextActive: { color: "#111827" },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  section: { gap: 14 },
  sectionTitle: { color: "#111827", fontSize: 18, fontWeight: "700" },
  questionCard: {
    borderWidth: 1,
    borderColor: "#e4e7ec",
    borderRadius: 24,
    padding: 20,
    gap: 14,
    backgroundColor: "#ffffff",
  },
  questionTopRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f2f4f7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#111827", fontWeight: "700", fontSize: 18 },
  authorName: { color: "#111827", fontSize: 16, fontWeight: "700" },
  authorMeta: { color: "#667085", fontSize: 13 },
  questionTitle: { color: "#111827", fontSize: 19, fontWeight: "700", lineHeight: 28 },
  questionBody: { color: "#667085", fontSize: 16, lineHeight: 24 },
  topicWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topicChip: {
    borderRadius: 14,
    backgroundColor: "#f2f4f7",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  topicChipActive: { backgroundColor: "#ede9fe" },
  topicChipText: { color: "#111827", fontSize: 14, fontWeight: "600" },
  topicChipTextActive: { color: "#6d28d9" },
  questionFooter: { flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" },
  metric: { flexDirection: "row", alignItems: "center", gap: 6 },
  metricText: { color: "#667085", fontSize: 14 },
  smallAction: {
    marginLeft: "auto",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  smallActionActive: { backgroundColor: "#eff6ff" },
  topicCard: {
    borderWidth: 1,
    borderColor: "#e4e7ec",
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  topicEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  topicEmoji: { fontSize: 24 },
  topicTitle: { color: "#111827", fontSize: 18, fontWeight: "700" },
  topicDescription: { color: "#667085", fontSize: 15, marginTop: 4, lineHeight: 22 },
  topicMeta: { color: "#667085", fontSize: 14, marginTop: 10 },
  followButton: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  followButtonText: { color: "#111827", fontSize: 16, fontWeight: "700" },
  profileCard: {
    borderWidth: 1,
    borderColor: "#e4e7ec",
    borderRadius: 24,
    padding: 22,
    gap: 18,
  },
  avatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#f2f4f7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLargeText: { color: "#111827", fontSize: 30, fontWeight: "700" },
  profileTitle: { color: "#111827", fontSize: 24, fontWeight: "700" },
  profileSubtitle: { color: "#667085", fontSize: 16, marginTop: 4 },
  repBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  repBadgeText: { color: "#a16207", fontSize: 16, fontWeight: "700" },
  profileStats: { flexDirection: "row", justifyContent: "space-between" },
  statValue: { color: "#111827", fontSize: 28, fontWeight: "700" },
  statLabel: { color: "#667085", fontSize: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  centerTitle: { color: "#111827", fontSize: 22, fontWeight: "700", textAlign: "center" },
  centerText: { color: "#667085", fontSize: 16, textAlign: "center", lineHeight: 24 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.28)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 170,
    paddingRight: 20,
  },
  sortModal: {
    width: 220,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e4e7ec",
  },
  sortOption: { paddingHorizontal: 18, paddingVertical: 16 },
  sortOptionActive: { backgroundColor: "#f3f4f6" },
  sortOptionText: { color: "#111827", fontSize: 18, fontWeight: "500" },
  modalSafe: { flex: 1, backgroundColor: "#ffffff" },
  modalContent: { padding: 20, gap: 16, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: "#111827", fontSize: 24, fontWeight: "700" },
  modalClose: { color: "#667085", fontSize: 16, fontWeight: "600" },
  fieldLabel: { color: "#344054", fontSize: 15, fontWeight: "600" },
  fieldInput: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#111827",
    fontSize: 16,
  },
  fieldInputLarge: { minHeight: 140, textAlignVertical: "top" },
  rowGap: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  inlineAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineActionActive: { backgroundColor: "#eff6ff" },
  inlineActionText: { color: "#344054", fontSize: 14, fontWeight: "600" },
  answerCard: {
    borderWidth: 1,
    borderColor: "#e4e7ec",
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  answerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  answerBody: { color: "#344054", fontSize: 15, lineHeight: 22 },
  answerMeta: { color: "#667085", fontSize: 13 },
  deleteText: { color: "#dc2626", fontSize: 14, fontWeight: "600" },
});
