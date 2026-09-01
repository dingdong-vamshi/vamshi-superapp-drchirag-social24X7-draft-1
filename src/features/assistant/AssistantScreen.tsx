import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CalendarClock,
  Check,
  Clock3,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";

import type { AssistantRepository } from "./assistantRepository";
import type {
  AssistantAction,
  AssistantEntry,
  AssistantSchedule,
  AssistantState,
} from "./types";

type Props = {
  repository: AssistantRepository;
  conversationId?: string;
  counterpart?: string;
  close: () => void;
};

const canonicalTimeZone = (timezone: string) =>
  timezone === "Asia/Calcutta" ? "Asia/Kolkata" : timezone;

const formatSchedule = (value: string, timezone: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: canonicalTimeZone(timezone),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const actionForEntry = (entry: AssistantEntry, actions: AssistantAction[]) =>
  entry.action_id ? actions.find((action) => action.id === entry.action_id) ?? null : null;

type ContactChoice = {
  user_id: string;
  display_name: string;
  username: string;
};

export default function AssistantScreen({ repository, conversationId, counterpart, close }: Props) {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 900;
  const timezone = useMemo(
    () => canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    [],
  );
  const [state, setState] = useState<AssistantState | null>(null);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<AssistantEntry>>(null);
  const bootstrapAttempt = useRef(0);
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canonicalActionEntries = useMemo(() => {
    const entries = state?.entries ?? [];
    const ids = new Map<string, string>();
    const entryTypes = new Map<string, AssistantEntry["entry_type"]>();
    for (const entry of entries) {
      if (!entry.action_id) continue;
      const previousType = entryTypes.get(entry.action_id);
      if (!previousType || entry.entry_type === "action") {
        ids.set(entry.action_id, entry.id);
        entryTypes.set(entry.action_id, entry.entry_type);
      }
    }
    return ids;
  }, [state?.entries]);
  const visibleEntries = useMemo(
    () => (state?.entries ?? []).filter(
      (entry) => !entry.action_id || canonicalActionEntries.get(entry.action_id) === entry.id,
    ),
    [canonicalActionEntries, state?.entries],
  );
  const activePendingEntryId = useMemo(() => {
    const latest = visibleEntries.at(-1);
    return latest?.metadata?.pending_intent ? latest.id : null;
  }, [visibleEntries]);

  const invoke = useCallback(
    async (request: Parameters<AssistantRepository["request"]>[0]) => {
      const attempt = ++bootstrapAttempt.current;
      const next = await repository.request({
        ...request,
        threadId: state?.thread.id ?? request.threadId,
        conversationId,
        timezone,
      });
      if (attempt === bootstrapAttempt.current) {
        setState(next);
        setError(null);
      }
      return next;
    },
    [conversationId, repository, state?.thread.id, timezone],
  );

  const bootstrap = useCallback(async () => {
    const attempt = ++bootstrapAttempt.current;
    setLoading(true);
    setError(null);
    try {
      const next = await repository.request({ operation: "bootstrap", conversationId, timezone });
      if (attempt === bootstrapAttempt.current) setState(next);
    } catch (cause) {
      if (attempt === bootstrapAttempt.current) {
        setError(cause instanceof Error ? cause.message : "Assistant could not be opened.");
      }
    } finally {
      if (attempt === bootstrapAttempt.current) setLoading(false);
    }
  }, [conversationId, repository, timezone]);

  useEffect(() => {
    void bootstrap();
    return () => {
      bootstrapAttempt.current += 1;
    };
  }, [bootstrap]);

  useEffect(() => {
    if (!state?.thread.id) return;
    const refresh = () => {
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = setTimeout(() => {
        const attempt = ++bootstrapAttempt.current;
        repository
          .request({
            operation: "bootstrap",
            threadId: state.thread.id,
            conversationId,
            timezone,
          })
          .then((next) => {
            if (attempt === bootstrapAttempt.current) {
              setState(next);
              setError(null);
            }
          })
          .catch((cause) => {
            if (attempt === bootstrapAttempt.current) {
              setError(cause instanceof Error ? cause.message : "Assistant realtime refresh failed.");
            }
          });
      }, 120);
    };
    const unsubscribe = repository.subscribe(state.thread.id, refresh);
    return () => {
      unsubscribe();
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = null;
    };
  }, [conversationId, repository, state?.thread.id, timezone]);

  useEffect(() => {
    if (!visibleEntries.length) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [visibleEntries.length]);

  const submit = async () => {
    const message = command.trim();
    if (!message || submitting) return;
    setSubmitting(true);
    setCommand("");
    try {
      await invoke({ operation: "command", message });
    } catch (cause) {
      setCommand(message);
      setError(cause instanceof Error ? cause.message : "Assistant request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (
    operation: "confirm" | "cancel_action" | "edit_action" | "propose_cancel_schedule",
    input: { actionId?: string; scheduleId?: string; editedBody?: string; editedSendAt?: string },
  ) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await invoke({ operation, ...input });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assistant action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const resolvePendingIntent = async (
    entryId: string,
    pendingChoice: "tomorrow" | "choose_another" | "cancel",
  ) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await invoke({ operation: "resolve_pending_intent", entryId, pendingChoice });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Scheduling option failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderEntry = ({ item }: { item: AssistantEntry }) => {
    const action = state ? actionForEntry(item, state.actions) : null;
    const pendingIntent = item.metadata?.pending_intent;
    const pendingClockLabel = pendingIntent && typeof pendingIntent === "object" && "clockLabel" in pendingIntent && typeof pendingIntent.clockLabel === "string"
      ? pendingIntent.clockLabel
      : null;
    return (
      <View style={styles.entryWrap}>
        <View
          style={[
            styles.entry,
            item.role === "user" ? styles.userEntry : styles.assistantEntry,
            item.entry_type === "error" && styles.errorEntry,
          ]}
        >
          {item.role !== "user" ? (
            <View style={styles.assistantMeta}>
              <Sparkles color="#087a4a" size={14} />
              <Text style={styles.assistantMetaText}>SOCIAL24 ASSISTANT</Text>
            </View>
          ) : null}
          <Text selectable style={[styles.entryText, item.role === "user" && styles.userEntryText]}>
            {item.display_text}
          </Text>
          {Array.isArray(item.metadata?.contacts) ? (
            <ContactChoices
              contacts={item.metadata.contacts as ContactChoice[]}
              select={(username) => setCommand(`Message @${username} `)}
            />
          ) : null}
          {item.entry_type === "schedule_list" ? (
            <ScheduleList
              schedules={(item.metadata?.schedules as AssistantSchedule[] | undefined) ?? []}
              disabled={submitting}
              cancel={(scheduleId) => void runAction("propose_cancel_schedule", { scheduleId })}
            />
          ) : null}
          {item.id === activePendingEntryId && item.metadata?.past_time_offer === true ? (
            <PastTimeChoices
              disabled={submitting}
              tomorrowLabel={pendingClockLabel ? `Tomorrow ${pendingClockLabel}` : "Tomorrow"}
              tomorrow={() => void resolvePendingIntent(item.id, "tomorrow")}
              chooseAnother={() => void resolvePendingIntent(item.id, "choose_another")}
              cancel={() => void resolvePendingIntent(item.id, "cancel")}
            />
          ) : null}
          {action ? (
            <ActionCard
              action={action}
              disabled={submitting}
              confirm={() => void runAction("confirm", { actionId: action.id })}
              cancel={() => void runAction("cancel_action", { actionId: action.id })}
              save={(editedBody, editedSendAt) =>
                void runAction("edit_action", { actionId: action.id, editedBody, editedSendAt })
              }
            />
          ) : null}
        </View>
      </View>
    );
  };

  const shell = (
    <SafeAreaView style={[styles.panel, desktop && styles.panelDesktop]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.brandIcon}>
          <Sparkles color="#ffffff" size={20} />
        </View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>Social24 Assistant</Text>
          <Text style={styles.subtitle}>
            {counterpart ? `Personal Chat · ${counterpart}` : "Personal Chat assistant"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Assistant"
          onPress={close}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <X color="#344054" size={21} />
        </Pressable>
      </View>
      <View style={styles.privacyBar}>
        <Text style={styles.privacyText}>Only authorized Personal Chat context · actions require confirmation</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#087a4a" size="large" />
          <Text style={styles.centerText}>Preparing your private Assistant…</Text>
        </View>
      ) : error && !state ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Assistant unavailable</Text>
          <Text selectable style={styles.centerText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry opening Assistant"
            onPress={() => void bootstrap()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={visibleEntries}
            extraData={{ activePendingEntryId, actions: state?.actions, submitting }}
            keyExtractor={(entry) => entry.id}
            renderItem={renderEntry}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.welcome}>
                <Text style={styles.welcomeTitle}>How can I help?</Text>
                <Text style={styles.welcomeText}>
                  Ask about recent messages, draft a reply, send after confirmation, or schedule it for later.
                </Text>
                <Text style={styles.providerLabel}>
                  {state?.provider === "fake-v1" ? "QA provider · deterministic" : state?.provider}
                </Text>
              </View>
            }
            ListFooterComponent={submitting ? <ActivityIndicator color="#087a4a" style={styles.thinking} /> : null}
          />
          {error ? (
            <View accessibilityLiveRegion="polite" style={styles.inlineError}>
              <Text selectable style={styles.inlineErrorText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => setError(null)}><X color="#9f1f2c" size={16} /></Pressable>
            </View>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="Ask Social24 Assistant"
              multiline
              maxLength={2000}
              placeholder={counterpart ? `Ask about ${counterpart} or draft a message` : "Ask about a Personal Chat or schedule a message"}
              placeholderTextColor="#98a2b3"
              value={command}
              onChangeText={setCommand}
              onSubmitEditing={Platform.OS === "web" ? undefined : () => void submit()}
              onKeyPress={(event) => {
                if (Platform.OS !== "web") return;
                const nativeEvent = event.nativeEvent as typeof event.nativeEvent & {
                  shiftKey?: boolean;
                  isComposing?: boolean;
                };
                if (
                  nativeEvent.key !== "Enter" ||
                  nativeEvent.shiftKey ||
                  nativeEvent.isComposing
                ) return;
                (event as typeof event & { preventDefault?: () => void }).preventDefault?.();
                void submit();
              }}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send request to Assistant"
              disabled={!command.trim() || submitting}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.sendButton,
                (!command.trim() || submitting) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {submitting ? <ActivityIndicator color="#ffffff" size="small" /> : <Send color="#ffffff" size={19} />}
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", default: undefined })}
      style={[styles.screen, desktop && styles.screenDesktop]}
    >
      {desktop ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Close Assistant" onPress={close} style={styles.backdrop} />
          {shell}
        </>
      ) : shell}
    </KeyboardAvoidingView>
  );
}

function PastTimeChoices({ disabled, tomorrowLabel, tomorrow, chooseAnother, cancel }: {
  disabled: boolean;
  tomorrowLabel: string;
  tomorrow: () => void;
  chooseAnother: () => void;
  cancel: () => void;
}) {
  return (
    <View style={styles.actionButtons}>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={tomorrow} style={[styles.primaryAction, disabled && styles.disabled]}>
        <CalendarClock color="#ffffff" size={16} />
        <Text style={styles.primaryActionText}>{tomorrowLabel}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={chooseAnother} style={styles.secondaryAction}>
        <Clock3 color="#087a4a" size={16} />
        <Text style={styles.secondaryActionText}>Choose another time</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={cancel} style={styles.cancelAction}>
        <Text style={styles.cancelActionText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

function ScheduleList({ schedules, disabled, cancel }: { schedules: AssistantSchedule[]; disabled: boolean; cancel: (id: string) => void }) {
  if (!schedules.length) return null;
  return (
    <View style={styles.scheduleList}>
      <Text style={styles.cardEyebrow}>UPCOMING</Text>
      {schedules.map((schedule) => (
        <View key={schedule.schedule_id} style={styles.scheduleRow}>
          <View style={styles.scheduleIcon}><CalendarClock color="#087a4a" size={18} /></View>
          <View style={styles.grow}>
            <Text style={styles.scheduleName}>{schedule.target_display_name}</Text>
            <Text style={styles.scheduleTime}>{formatSchedule(schedule.send_at, schedule.timezone)} · {schedule.timezone}</Text>
            <Text numberOfLines={2} style={styles.scheduleBody}>{schedule.body}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Cancel scheduled message to ${schedule.target_display_name}`} disabled={disabled} onPress={() => cancel(schedule.schedule_id)} style={styles.cancelIcon}>
            <Trash2 color="#b42318" size={17} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function ContactChoices({ contacts, select }: { contacts: ContactChoice[]; select: (username: string) => void }) {
  return (
    <View style={styles.contactChoices}>
      {contacts.map((contact) => (
        <Pressable
          key={contact.user_id}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${contact.display_name}`}
          onPress={() => select(contact.username)}
          style={styles.contactChoice}
        >
          <Text style={styles.contactChoiceName}>{contact.display_name}</Text>
          <Text style={styles.contactChoiceUsername}>@{contact.username}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ActionCard({ action, disabled, confirm, cancel, save }: { action: AssistantAction; disabled: boolean; confirm: () => void; cancel: () => void; save: (body: string, sendAt?: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(action.validated_arguments.body ?? "");
  const [sendAt, setSendAt] = useState(action.validated_arguments.send_at ?? "");
  useEffect(() => setBody(action.validated_arguments.body ?? ""), [action.validated_arguments.body]);
  useEffect(() => setSendAt(action.validated_arguments.send_at ?? ""), [action.validated_arguments.send_at]);
  const pending = action.status === "proposed" && action.confirmation_status === "pending";
  const isSchedule = action.action_type === "schedule_message";
  const isCancellation = action.action_type === "cancel_scheduled_message";
  const validationError = pending && isSchedule && Boolean(action.error);
  const validEditedTime = !isSchedule || (Boolean(sendAt.trim()) && !Number.isNaN(Date.parse(sendAt)));
  const title = isCancellation
    ? `Cancel schedule for ${action.validated_arguments.recipient_label ?? "contact"}`
    : isSchedule
      ? `Schedule for ${action.validated_arguments.recipient_label ?? "contact"}`
      : `Send to ${action.validated_arguments.recipient_label ?? "contact"}`;
  const resultLabel = action.error
    ? action.error
    : action.result.schedule_status === "failed"
    ? "Scheduled delivery failed"
    : action.result.schedule_status === "cancelled"
      ? "Scheduled delivery cancelled"
      : action.status === "failed"
    ? action.error ?? "Action failed"
    : action.status === "cancelled"
      ? "Cancelled · no side effect"
      : action.result.schedule_status === "sent"
        ? "Sent"
        : action.status === "completed"
          ? isSchedule ? "Scheduled" : isCancellation ? "Schedule cancelled" : "Sent"
          : action.status === "executing" ? "Working…" : "Awaiting confirmation";
  return (
    <View style={styles.actionCard}>
      <View style={styles.actionHeader}>
        <View style={styles.actionIcon}>
          {isSchedule || isCancellation ? <Clock3 color="#087a4a" size={19} /> : <Send color="#087a4a" size={18} />}
        </View>
        <View style={styles.grow}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionStatus}>{resultLabel}</Text>
        </View>
      </View>
      {editing ? (
        <View style={styles.editFields}>
          <TextInput
            accessibilityLabel="Edit Assistant message"
            multiline
            value={body}
            onChangeText={setBody}
            maxLength={2000}
            style={styles.editInput}
          />
          {isSchedule ? (
            <View style={styles.editTimeWrap}>
              <Text style={styles.editLabel}>Date and time · ISO 8601</Text>
              <TextInput
                accessibilityLabel="Edit scheduled date and time"
                autoCapitalize="none"
                autoCorrect={false}
                value={sendAt}
                onChangeText={setSendAt}
                placeholder="2026-09-02T17:30:00+05:30"
                placeholderTextColor="#98a2b3"
                style={[styles.timeInput, !validEditedTime && styles.invalidInput]}
              />
            </View>
          ) : null}
        </View>
      ) : action.validated_arguments.body ? (
        <Text selectable style={styles.actionBody}>{action.validated_arguments.body}</Text>
      ) : null}
      {action.validated_arguments.send_at ? (
        <Text style={styles.actionTime}>
          {formatSchedule(action.validated_arguments.send_at, action.validated_arguments.timezone ?? "UTC")} · {canonicalTimeZone(action.validated_arguments.timezone ?? "UTC")}
        </Text>
      ) : null}
      {validationError ? <Text style={styles.actionValidationError}>⚠ {action.error}</Text> : null}
      {pending ? (
        editing ? (
          <View style={styles.actionButtons}>
            <Pressable accessibilityRole="button" disabled={!body.trim() || !validEditedTime || disabled} onPress={() => { save(body, isSchedule ? new Date(sendAt).toISOString() : undefined); setEditing(false); }} style={[styles.primaryAction, (!body.trim() || !validEditedTime || disabled) && styles.disabled]}>
              <Check color="#ffffff" size={16} /><Text style={styles.primaryActionText}>Save</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setBody(action.validated_arguments.body ?? ""); setSendAt(action.validated_arguments.send_at ?? ""); setEditing(false); }} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Discard</Text></Pressable>
          </View>
        ) : validationError ? (
          <View style={styles.actionButtons}>
            <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setEditing(true)} style={styles.secondaryAction}>
              <Clock3 color="#087a4a" size={15} /><Text style={styles.secondaryActionText}>Choose another time</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={disabled} onPress={cancel} style={styles.cancelAction}><Text style={styles.cancelActionText}>Cancel</Text></Pressable>
          </View>
        ) : (
          <View style={styles.actionButtons}>
            <Pressable accessibilityRole="button" disabled={disabled} onPress={confirm} style={[styles.primaryAction, disabled && styles.disabled]}>
              <Check color="#ffffff" size={16} />
              <Text style={styles.primaryActionText}>{isCancellation ? "Confirm cancel" : isSchedule ? "Schedule" : "Send"}</Text>
            </Pressable>
            {!isCancellation ? (
              <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setEditing(true)} style={styles.secondaryAction}>
                <Pencil color="#087a4a" size={15} /><Text style={styles.secondaryActionText}>Edit</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" disabled={disabled} onPress={cancel} style={styles.cancelAction}><Text style={styles.cancelActionText}>Cancel</Text></Pressable>
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7faf8" },
  screenDesktop: { backgroundColor: "rgba(15,23,42,0.38)", alignItems: "flex-end" },
  backdrop: { position: "absolute", inset: 0 },
  panel: { flex: 1, width: "100%", backgroundColor: "#f7faf8" },
  panelDesktop: { width: 480, maxWidth: "42%", boxShadow: "-12px 0 36px rgba(15,23,42,0.18)" },
  header: { minHeight: 72, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#e2e9e5", backgroundColor: "#ffffff" },
  brandIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#087a4a" },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: "#101828", fontSize: 19, fontWeight: "900" },
  subtitle: { color: "#667085", fontSize: 13, marginTop: 2 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#f2f4f7" },
  privacyBar: { paddingHorizontal: 18, paddingVertical: 9, backgroundColor: "#eaf8f0", borderBottomWidth: 1, borderBottomColor: "#d5eee0" },
  privacyText: { color: "#286148", fontSize: 11, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
  centerText: { color: "#667085", fontSize: 14, lineHeight: 21, textAlign: "center" },
  errorTitle: { color: "#b42318", fontSize: 18, fontWeight: "800" },
  retryButton: { minHeight: 42, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#087a4a" },
  retryButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  list: { padding: 16, paddingBottom: 24, gap: 12 },
  welcome: { padding: 18, borderRadius: 22, borderCurve: "continuous", backgroundColor: "#0b3f2b", gap: 8, marginBottom: 6 },
  welcomeTitle: { color: "#ffffff", fontSize: 22, fontWeight: "900" },
  welcomeText: { color: "#d9f4e6", fontSize: 14, lineHeight: 21 },
  providerLabel: { color: "#8de0b4", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  entryWrap: { width: "100%" },
  entry: { maxWidth: "92%", borderRadius: 18, borderCurve: "continuous", padding: 13, gap: 8 },
  userEntry: { alignSelf: "flex-end", backgroundColor: "#087a4a", borderBottomRightRadius: 6 },
  assistantEntry: { alignSelf: "flex-start", backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e1e8e4", borderBottomLeftRadius: 6 },
  errorEntry: { backgroundColor: "#fff4f3", borderColor: "#fecdca" },
  assistantMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  assistantMetaText: { color: "#087a4a", fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  entryText: { color: "#24342c", fontSize: 15, lineHeight: 21 },
  userEntryText: { color: "#ffffff" },
  actionCard: { marginTop: 4, padding: 13, borderRadius: 16, borderCurve: "continuous", backgroundColor: "#f7faf8", borderWidth: 1, borderColor: "#cfe5d8", gap: 10 },
  actionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#e4f6ec" },
  grow: { flex: 1, minWidth: 0 },
  actionTitle: { color: "#16251d", fontSize: 14, fontWeight: "900" },
  actionStatus: { color: "#667085", fontSize: 11, marginTop: 2 },
  actionBody: { color: "#25372d", fontSize: 15, lineHeight: 21, padding: 10, borderRadius: 12, backgroundColor: "#ffffff" },
  actionTime: { color: "#466052", fontSize: 12, fontWeight: "700" },
  actionValidationError: { color: "#b42318", fontSize: 12, lineHeight: 18, padding: 9, borderRadius: 10, backgroundColor: "#fff1f0" },
  editInput: { minHeight: 76, color: "#25372d", fontSize: 15, lineHeight: 21, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#81c9a2", backgroundColor: "#ffffff", textAlignVertical: "top" },
  editFields: { gap: 10 },
  editTimeWrap: { gap: 5 },
  editLabel: { color: "#466052", fontSize: 11, fontWeight: "800" },
  timeInput: { minHeight: 42, color: "#25372d", fontSize: 13, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: "#81c9a2", backgroundColor: "#ffffff" },
  invalidInput: { borderColor: "#d92d20", backgroundColor: "#fff4f3" },
  actionButtons: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  primaryAction: { minHeight: 38, paddingHorizontal: 13, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#087a4a" },
  primaryActionText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  secondaryAction: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: "#b9d9c7", backgroundColor: "#ffffff" },
  secondaryActionText: { color: "#087a4a", fontSize: 12, fontWeight: "800" },
  cancelAction: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancelActionText: { color: "#b42318", fontSize: 12, fontWeight: "800" },
  scheduleList: { marginTop: 5, gap: 8 },
  contactChoices: { gap: 7, marginTop: 2 },
  contactChoice: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: "#cfe5d8", backgroundColor: "#f5fbf7" },
  contactChoiceName: { color: "#17251e", fontSize: 13, fontWeight: "900" },
  contactChoiceUsername: { color: "#5e7468", fontSize: 11, marginTop: 2 },
  cardEyebrow: { color: "#667085", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  scheduleRow: { flexDirection: "row", gap: 9, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e3e9e6" },
  scheduleIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#e9f8f0" },
  scheduleName: { color: "#17251e", fontSize: 13, fontWeight: "900" },
  scheduleTime: { color: "#5e7468", fontSize: 11, marginTop: 1 },
  scheduleBody: { color: "#344c3f", fontSize: 12, marginTop: 4 },
  cancelIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#fff1f0" },
  inlineError: { marginHorizontal: 14, marginBottom: 8, padding: 10, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff1f0", borderWidth: 1, borderColor: "#fecdca" },
  inlineErrorText: { flex: 1, color: "#9f1f2c", fontSize: 12 },
  composer: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, flexDirection: "row", alignItems: "flex-end", gap: 9, borderTopWidth: 1, borderTopColor: "#dfe7e2", backgroundColor: "#ffffff" },
  input: { flex: 1, minHeight: 46, maxHeight: 120, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 22, borderWidth: 1, borderColor: "#d7e1dc", backgroundColor: "#f5f7f6", color: "#17251e", fontSize: 15, textAlignVertical: "top" },
  sendButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "#087a4a" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  thinking: { paddingVertical: 14 },
});
