import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ArrowLeft, CheckSquare, FileText, Search, Square, Star, StarOff, StickyNote, Trash2 } from "lucide-react-native";

import { useAuth } from "../../lib/AuthContext";
import {
  deleteNotesTaskEntry,
  listNotesTasksEntries,
  NotesTaskEntry,
  saveNotesTasksEntry,
  toggleNotesTaskComplete,
  toggleNotesTaskStar,
} from "./notesTasksRepository";

type NotesTab = "notes" | "tasks";
type EntryDraft = {
  id?: string;
  entryType: "note" | "task";
  title: string;
  body: string;
  category: string;
  tagsText: string;
  colorKey: NotesTaskEntry["colorKey"];
  priority: "low" | "medium" | "high";
  dueDate: string;
  isStarred: boolean;
};

const categories = ["All Categories", "Personal", "Work", "Shopping", "Travel", "Health", "Finance"];
const noteColors: Record<NotesTaskEntry["colorKey"], string> = {
  mint: "#dff8ea",
  yellow: "#fff2b8",
  blue: "#dfe7ff",
  lavender: "#ece8ff",
  peach: "#ffe8dc",
};

const categoryPillColors: Record<string, string> = {
  Personal: "#dfe7ff",
  Work: "#dff8ea",
  Shopping: "#f4ebff",
  Travel: "#fff1de",
  Health: "#ffe2e2",
  Finance: "#e5f0ff",
};

const emptyDraft = (): EntryDraft => ({
  entryType: "note",
  title: "",
  body: "",
  category: "Personal",
  tagsText: "",
  colorKey: "mint",
  priority: "medium",
  dueDate: new Date().toISOString().slice(0, 10),
  isStarred: false,
});

export default function NotesTasksScreen() {
  const { user, initialized } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<NotesTab>("notes");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft());

  const query = useQuery({
    queryKey: ["notes-tasks", user && "id" in user ? user.id : "guest"],
    queryFn: () => listNotesTasksEntries(user),
    enabled: initialized,
    retry: 1,
  });

  const entries = query.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    return entries.filter((entry: NotesTaskEntry) => {
      const matchesCategory = category === "All Categories" || entry.category === category;
      const haystack = [entry.title, entry.body, entry.category, ...entry.tags].join(" ").toLowerCase();
      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [category, entries, normalizedSearch]);

  const noteEntries = filteredEntries.filter((entry: NotesTaskEntry) => entry.entryType === "note");
  const taskEntries = filteredEntries
    .filter((entry: NotesTaskEntry) => entry.entryType === "task")
    .sort((left: NotesTaskEntry, right: NotesTaskEntry) => {
      if (Boolean(left.completedAt) !== Boolean(right.completedAt)) return left.completedAt ? 1 : -1;
      if ((left.dueDate ?? "") !== (right.dueDate ?? "")) return (left.dueDate ?? "").localeCompare(right.dueDate ?? "");
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  const completedTaskCount = taskEntries.filter((entry: NotesTaskEntry) => entry.completedAt).length;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["notes-tasks"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft.title.trim()) throw new Error("Title is required.");
      const tags = draft.tagsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6);
      return saveNotesTasksEntry(user, {
        id: draft.id,
        entryType: draft.entryType,
        title: draft.title,
        body: draft.body,
        category: draft.category,
        tags,
        colorKey: draft.colorKey,
        priority: draft.entryType === "task" ? draft.priority : null,
        dueDate: draft.entryType === "task" ? draft.dueDate : null,
        isStarred: draft.isStarred,
      });
    },
    onSuccess: async () => {
      setEditorOpen(false);
      setDraft(emptyDraft());
      await invalidate();
    },
    onError: (error) =>
      Alert.alert("Could not save item", error instanceof Error ? error.message : "Please try again."),
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: (entry: NotesTaskEntry) => toggleNotesTaskComplete(user, entry),
    onSuccess: invalidate,
  });

  const toggleStarMutation = useMutation({
    mutationFn: (entry: NotesTaskEntry) => toggleNotesTaskStar(user, entry),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => deleteNotesTaskEntry(user, entryId),
    onSuccess: async () => {
      setEditorOpen(false);
      setDraft(emptyDraft());
      await invalidate();
    },
  });

  const openCreate = (entryType: "note" | "task") => {
    setDraft({ ...emptyDraft(), entryType });
    setEditorOpen(true);
  };

  const openEdit = (entry: NotesTaskEntry) => {
    setDraft({
      id: entry.id,
      entryType: entry.entryType,
      title: entry.title,
      body: entry.body,
      category: entry.category,
      tagsText: entry.tags.join(", "),
      colorKey: entry.colorKey,
      priority: entry.priority ?? "medium",
      dueDate: entry.dueDate ?? new Date().toISOString().slice(0, 10),
      isStarred: entry.isStarred,
    });
    setEditorOpen(true);
  };

  if (!initialized || query.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <CenteredState title="Loading Notes & Tasks" text="Fetching your notes and task list..." />
      </SafeAreaView>
    );
  }

  if (query.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <CenteredState
          title="Could not load Notes & Tasks"
          text={query.error instanceof Error ? query.error.message : "Please try again."}
          actionLabel="Retry"
          onPress={() => void query.refetch()}
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
          <StickyNote color="#d97706" size={22} />
          <Text style={styles.title}>Notes & Tasks</Text>
        </View>
        <Pressable
          onPress={() => openCreate(tab === "notes" ? "note" : "task")}
          style={styles.headerButton}
          accessibilityLabel={`Create ${tab === "notes" ? "note" : "task"}`}
        >
          <FileText color="#111827" size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.searchWrap}>
          <Search color="#98a2b3" size={24} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search notes and tasks..."
            placeholderTextColor="#98a2b3"
            style={styles.searchInput}
          />
        </View>

        <Pressable onPress={() => setCategoryOpen((current) => !current)} style={styles.dropdown}>
          <Text style={styles.dropdownText}>{category}</Text>
          <Text style={styles.dropdownChevron}>⌄</Text>
        </Pressable>

        {categoryOpen ? (
          <View style={styles.dropdownMenu}>
            {categories.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setCategory(item);
                  setCategoryOpen(false);
                }}
                style={styles.dropdownItem}
              >
                <Text style={styles.dropdownItemText}>{item}</Text>
                {item === category ? <Text style={styles.dropdownItemCheck}>✓</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.tabsRow}>
          <TabButton label={`Notes (${noteEntries.length})`} active={tab === "notes"} onPress={() => setTab("notes")} icon={<FileText color="#111827" size={20} />} />
          <TabButton label={`Tasks (${completedTaskCount}/${taskEntries.length})`} active={tab === "tasks"} onPress={() => setTab("tasks")} icon={<CheckSquare color="#111827" size={20} />} />
        </View>

        {tab === "notes" ? (
          noteEntries.length === 0 ? (
            <CenteredState
              title="No notes yet"
              text="Create your first note to collect ideas, reminders, and lists."
              actionLabel="Create note"
              onPress={() => openCreate("note")}
            />
          ) : (
            <View style={styles.notesGrid}>
              {noteEntries.map((entry: NotesTaskEntry) => (
                <Pressable key={entry.id} onPress={() => openEdit(entry)} style={[styles.noteCard, { backgroundColor: noteColors[entry.colorKey] }]}>
                  <View style={styles.noteCardTop}>
                    <Text style={styles.noteTitle} numberOfLines={1}>{entry.title}</Text>
                    <View style={styles.rowInline}>
                      <Pressable onPress={() => void toggleStarMutation.mutate(entry)} hitSlop={8}>
                        {entry.isStarred ? <Star color="#d97706" fill="#facc15" size={18} /> : <StarOff color="#111827" size={18} />}
                      </Pressable>
                      <Text style={styles.noteMenu}>⋮</Text>
                    </View>
                  </View>

                  <Tag text={entry.category} softColor={categoryPillColors[entry.category] ?? "#eef2ff"} textColor="#1d4ed8" />

                  <Text style={styles.noteBody} numberOfLines={4}>{entry.body || "No details added yet."}</Text>

                  <View style={styles.tagsWrap}>
                    {entry.tags.slice(0, 3).map((tag: string) => (
                      <Tag key={tag} text={tag} softColor="#f3f4f6" textColor="#111827" />
                    ))}
                  </View>

                  <Text style={styles.noteDate}>{formatDate(entry.updatedAt)}</Text>
                </Pressable>
              ))}
            </View>
          )
        ) : taskEntries.length === 0 ? (
          <CenteredState
            title="No tasks yet"
            text="Create a task, set a due date, and mark it complete when done."
            actionLabel="Create task"
            onPress={() => openCreate("task")}
          />
        ) : (
          <View style={styles.tasksList}>
            {taskEntries.map((entry: NotesTaskEntry) => {
              const completed = Boolean(entry.completedAt);
              return (
                <Pressable key={entry.id} onPress={() => openEdit(entry)} style={[styles.taskCard, completed && styles.taskCardCompleted]}>
                  <Pressable onPress={() => void toggleCompleteMutation.mutate(entry)} style={styles.taskCheck}>
                    {completed ? <CheckSquare color="#65c283" size={26} /> : <Square color="#98a2b3" size={24} />}
                  </Pressable>

                  <View style={{ flex: 1, gap: 10 }}>
                    <View style={styles.taskTopRow}>
                      <Text style={[styles.taskTitle, completed && styles.completedText]}>{entry.title}</Text>
                      {entry.priority ? (
                        <Tag
                          text={entry.priority}
                          softColor={priorityBackground(entry.priority)}
                          textColor={priorityText(entry.priority)}
                        />
                      ) : null}
                    </View>

                    <Text style={[styles.taskBody, completed && styles.completedText]} numberOfLines={3}>
                      {entry.body || "No task details shared."}
                    </Text>

                    <View style={styles.tagsWrap}>
                      <Tag text={entry.category} softColor={categoryPillColors[entry.category] ?? "#eef2ff"} textColor="#1d4ed8" />
                      {entry.tags.slice(0, 3).map((tag: string) => (
                        <Tag key={tag} text={tag} softColor="#f3f4f6" textColor="#4b5563" />
                      ))}
                    </View>
                  </View>

                  <Text style={styles.taskDate}>{entry.dueDate ? dueDay(entry.dueDate) : "—"}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={editorOpen} animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{draft.id ? "Edit item" : `Create ${draft.entryType}`}</Text>
              {draft.id ? (
                <Pressable onPress={() => void deleteMutation.mutate(draft.id!)} style={styles.deleteButton}>
                  <Trash2 color="#ef4444" size={20} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.editorTabs}>
              <TabButton label="Note" active={draft.entryType === "note"} onPress={() => setDraft((current) => ({ ...current, entryType: "note" }))} />
              <TabButton label="Task" active={draft.entryType === "task"} onPress={() => setDraft((current) => ({ ...current, entryType: "task" }))} />
            </View>

            <Field label="Title" value={draft.title} onChangeText={(value) => setDraft((current) => ({ ...current, title: value }))} />
            <Field label="Details" value={draft.body} onChangeText={(value) => setDraft((current) => ({ ...current, body: value }))} multiline />
            <Field label="Category" value={draft.category} onChangeText={(value) => setDraft((current) => ({ ...current, category: value }))} />
            <Field label="Tags (comma separated)" value={draft.tagsText} onChangeText={(value) => setDraft((current) => ({ ...current, tagsText: value }))} />

            {draft.entryType === "task" ? (
              <>
                <Field label="Due date" value={draft.dueDate} onChangeText={(value) => setDraft((current) => ({ ...current, dueDate: value }))} />
                <View style={styles.priorityRow}>
                  {(["low", "medium", "high"] as const).map((level) => (
                    <Pressable
                      key={level}
                      onPress={() => setDraft((current) => ({ ...current, priority: level }))}
                      style={[styles.priorityButton, draft.priority === level && styles.priorityButtonActive]}
                    >
                      <Text style={[styles.priorityButtonText, draft.priority === level && styles.priorityButtonTextActive]}>{level}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.priorityRow}>
                {(["mint", "yellow", "blue", "lavender", "peach"] as const).map((colorKey) => (
                  <Pressable
                    key={colorKey}
                    onPress={() => setDraft((current) => ({ ...current, colorKey }))}
                    style={[
                      styles.colorButton,
                      { backgroundColor: noteColors[colorKey] },
                      draft.colorKey === colorKey && styles.colorButtonActive,
                    ]}
                  />
                ))}
              </View>
            )}

            <Pressable onPress={() => setDraft((current) => ({ ...current, isStarred: !current.isStarred }))} style={styles.starToggle}>
              <Text style={styles.starToggleText}>{draft.isStarred ? "Remove star" : "Star this item"}</Text>
            </Pressable>

            <Pressable onPress={() => void saveMutation.mutate()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{draft.id ? "Save changes" : `Create ${draft.entryType}`}</Text>
            </Pressable>

            <Pressable onPress={() => setEditorOpen(false)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function CenteredState({
  title,
  text,
  actionLabel,
  onPress,
}: {
  title: string;
  text: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.centerTitle}>{title}</Text>
      <Text style={styles.centerText}>{text}</Text>
      {actionLabel && onPress ? (
        <Pressable onPress={onPress} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      {icon}
      <Text style={styles.tabButtonText}>{label}</Text>
    </Pressable>
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
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
      />
    </View>
  );
}

function Tag({
  text,
  softColor,
  textColor,
}: {
  text: string;
  softColor: string;
  textColor: string;
}) {
  return (
    <View style={[styles.tag, { backgroundColor: softColor }]}>
      <Text style={[styles.tagText, { color: textColor }]}>{text}</Text>
    </View>
  );
}

function formatDate(value: string) {
  return value.slice(0, 10).split("-").reverse().join("/");
}

function dueDay(value: string) {
  return value.slice(-2);
}

function priorityBackground(priority: "low" | "medium" | "high") {
  if (priority === "high") return "#fee2e2";
  if (priority === "medium") return "#fef3c7";
  return "#dcfce7";
}

function priorityText(priority: "low" | "medium" | "high") {
  if (priority === "high") return "#ef4444";
  if (priority === "medium") return "#d97706";
  return "#16a34a";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  headerButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: "#111827", fontSize: 24, fontWeight: "700" },
  content: { padding: 16, gap: 14, paddingBottom: 36 },
  searchWrap: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#f4f5fb",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, color: "#111827", fontSize: 17, paddingVertical: 10 },
  dropdown: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: "#f4f5fb",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: { color: "#111827", fontSize: 17, fontWeight: "500" },
  dropdownChevron: { color: "#98a2b3", fontSize: 24, marginTop: -4 },
  dropdownMenu: {
    marginTop: -6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 3,
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  dropdownItemText: { color: "#111827", fontSize: 16 },
  dropdownItemCheck: { color: "#667085", fontSize: 18 },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 20,
    backgroundColor: "#ececf3",
    padding: 4,
  },
  tabButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  tabButtonActive: { backgroundColor: "#ffffff" },
  tabButtonText: { color: "#111827", fontSize: 16, fontWeight: "600" },
  centered: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  centerTitle: { color: "#111827", fontSize: 20, fontWeight: "800", textAlign: "center" },
  centerText: { color: "#667085", fontSize: 16, lineHeight: 24, textAlign: "center" },
  notesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-start",
  },
  noteCard: {
    width: "48%",
    minHeight: 230,
    borderRadius: 24,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#d7dbe3",
  },
  noteCardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  noteTitle: { color: "#111827", fontSize: 18, fontWeight: "700", flex: 1 },
  rowInline: { flexDirection: "row", alignItems: "center", gap: 10 },
  noteMenu: { color: "#111827", fontSize: 20, lineHeight: 20 },
  noteBody: { color: "#475467", fontSize: 14, lineHeight: 22, minHeight: 88 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingHorizontal: 12, minHeight: 34, borderRadius: 14, justifyContent: "center" },
  tagText: { fontSize: 13, fontWeight: "600" },
  noteDate: { color: "#667085", fontSize: 15, marginTop: "auto" },
  tasksList: { gap: 14 },
  taskCard: {
    flexDirection: "row",
    gap: 14,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  taskCardCompleted: { opacity: 0.65 },
  taskCheck: { paddingTop: 3 },
  taskTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  taskTitle: { color: "#111827", fontSize: 17, fontWeight: "700", flex: 1 },
  taskBody: { color: "#667085", fontSize: 14, lineHeight: 22 },
  completedText: { textDecorationLine: "line-through" },
  taskDate: { color: "#98a2b3", fontSize: 16, alignSelf: "center", paddingLeft: 6 },
  modalSafe: { flex: 1, backgroundColor: "#ffffff" },
  modalContent: { padding: 18, gap: 14, paddingBottom: 36 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: "#111827", fontSize: 24, fontWeight: "800" },
  deleteButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  editorTabs: { flexDirection: "row", gap: 10 },
  fieldLabel: { color: "#111827", fontSize: 14, fontWeight: "700" },
  fieldInput: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#f4f5fb",
    paddingHorizontal: 14,
    color: "#111827",
    fontSize: 16,
  },
  fieldInputMultiline: { minHeight: 128, paddingTop: 14, textAlignVertical: "top" },
  priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  priorityButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#f4f5fb",
    alignItems: "center",
    justifyContent: "center",
  },
  priorityButtonActive: { backgroundColor: "#111827" },
  priorityButtonText: { color: "#111827", fontSize: 14, fontWeight: "700" },
  priorityButtonTextActive: { color: "#ffffff" },
  colorButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d7dbe3",
  },
  colorButtonActive: { borderColor: "#111827", borderWidth: 2 },
  starToggle: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7dbe3",
    alignItems: "center",
    justifyContent: "center",
  },
  starToggleText: { color: "#111827", fontSize: 15, fontWeight: "700" },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d7dbe3",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: "#475467", fontSize: 16, fontWeight: "700" },
});
