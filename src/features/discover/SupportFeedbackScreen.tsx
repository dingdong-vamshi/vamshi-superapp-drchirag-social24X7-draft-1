import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowLeft, Bug, ChevronDown, Headphones, Lightbulb, Plus, Search, ThumbsDown, ThumbsUp } from "lucide-react-native";

import { useAuth } from "../../lib/AuthContext";
import {
  createFeatureRequest,
  createSupportTicket,
  getSupportWorkspace,
  setFaqFeedback,
  setFeatureVote,
  type FeatureRequest,
  type SupportFaq,
  type SupportTicket,
} from "./supportFeedbackRepository";

const tabs = ["Overview", "My Tickets", "Features", "FAQ"] as const;

const blankTicket = { title: "", description: "", category: "Bug", priority: "medium", module: "Discover" };
const blankFeature = { title: "", description: "", category: "UI/UX" };

export default function SupportFeedbackScreen() {
  const { user, initialized } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [featureOpen, setFeatureOpen] = useState(false);
  const [ticket, setTicket] = useState(blankTicket);
  const [feature, setFeature] = useState(blankFeature);
  const [query, setQuery] = useState("");
  const [faqCategory, setFaqCategory] = useState("All");

  const workspaceQuery = useQuery({
    queryKey: ["support-feedback", user && "id" in user ? user.id : "guest"],
    queryFn: () => getSupportWorkspace(user),
    enabled: initialized && Boolean(user && "id" in user),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["support-feedback"] });

  const ticketMutation = useMutation({
    mutationFn: () => createSupportTicket(user, ticket),
    onSuccess: async () => { setTicket(blankTicket); setTicketOpen(false); await refresh(); },
    onError: (error) => Alert.alert("Could not create ticket", error instanceof Error ? error.message : "Please try again."),
  });
  const featureMutation = useMutation({
    mutationFn: () => createFeatureRequest(user, feature),
    onSuccess: async () => { setFeature(blankFeature); setFeatureOpen(false); await refresh(); },
    onError: (error) => Alert.alert("Could not create feature request", error instanceof Error ? error.message : "Please try again."),
  });
  const voteMutation = useMutation({
    mutationFn: ({ item, voted }: { item: FeatureRequest; voted: boolean }) => setFeatureVote(user, item.id, voted),
    onSuccess: refresh,
    onError: (error) => Alert.alert("Could not vote", error instanceof Error ? error.message : "Please try again."),
  });
  const faqMutation = useMutation({
    mutationFn: ({ item, helpful }: { item: SupportFaq; helpful: boolean }) => setFaqFeedback(user, item.id, helpful),
    onSuccess: refresh,
    onError: (error) => Alert.alert("Could not save feedback", error instanceof Error ? error.message : "Please try again."),
  });

  const tickets = workspaceQuery.data?.tickets ?? [];
  const features = workspaceQuery.data?.features ?? [];
  const faqs = workspaceQuery.data?.faqs ?? [];
  const filteredFaqs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return faqs.filter((faq) => (faqCategory === "All" || faq.category === faqCategory) && (!needle || `${faq.question} ${faq.answer}`.toLowerCase().includes(needle)));
  }, [faqCategory, faqs, query]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><ArrowLeft size={24} color="#111827" /></Pressable>
        <Headphones size={26} color="#6d28d9" />
        <Text style={styles.title}>Support & Feedback</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented tabs={tabs} active={tab} onPick={setTab} />
        {!user || !("id" in user) ? <Empty title="Sign in required" text="Support uses your real Supabase account for ticket ownership." /> : null}
        {workspaceQuery.isLoading ? <Empty title="Loading support" text="Fetching your tickets and feedback options..." /> : null}

        {user && "id" in user && tab === "Overview" ? (
          <>
            <View style={styles.actionGrid}>
              <Pressable onPress={() => setTicketOpen(true)} style={styles.actionCard}><Bug color="#dc2626" size={32} /><Text style={styles.actionTitle}>Report Issue</Text><Text style={styles.meta}>Bug reports & problems</Text></Pressable>
              <Pressable onPress={() => setFeatureOpen(true)} style={styles.actionCard}><Lightbulb color="#d97706" size={32} /><Text style={styles.actionTitle}>Request Feature</Text><Text style={styles.meta}>Suggest improvements</Text></Pressable>
            </View>
            <View style={styles.statsCard}>
              <Text style={styles.sectionTitle}>Support Statistics</Text>
              <View style={styles.stats}><Stat value={tickets.length} label="My Tickets" color="#2563eb" /><Stat value={tickets.filter((item) => item.status === "resolved").length} label="Resolved" color="#16a34a" /><Stat value="~2h" label="Avg Response" color="#ea580c" /></View>
            </View>
            <Text style={styles.sectionTitle}>Recent Tickets</Text>
            {tickets.slice(0, 3).map((item) => <TicketCard key={item.id} item={item} />)}
          </>
        ) : null}

        {user && "id" in user && tab === "My Tickets" ? (
          <>
            <SearchBox value={query} onChangeText={setQuery} placeholder="Search your tickets..." />
            {tickets.length === 0 ? <Empty title="No tickets yet" text="Report an issue when something breaks." /> : tickets.filter((item) => !query || `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())).map((item) => <TicketCard key={item.id} item={item} />)}
          </>
        ) : null}

        {user && "id" in user && tab === "Features" ? (
          <>
            <View style={styles.rowBetween}><View><Text style={styles.sectionTitle}>Feature Requests</Text><Text style={styles.meta}>Vote on features you'd like to see</Text></View><Pressable onPress={() => setFeatureOpen(true)} style={styles.darkButton}><Plus color="#fff" size={20} /><Text style={styles.darkButtonText}>Request</Text></Pressable></View>
            {features.length === 0 ? <Empty title="No feature requests" text="Create the first improvement idea." /> : features.map((item) => <FeatureCard key={item.id} item={item} onVote={() => voteMutation.mutate({ item, voted: !item.voted })} />)}
          </>
        ) : null}

        {user && "id" in user && tab === "FAQ" ? (
          <>
            <SearchBox value={query} onChangeText={setQuery} placeholder="Search FAQs..." />
            <View style={styles.chips}>{["All", "Payments", "Technical", "Account"].map((item) => <Pressable key={item} onPress={() => setFaqCategory(item)} style={[styles.chip, faqCategory === item && styles.chipActive]}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View>
            {filteredFaqs.length === 0 ? <Empty title="No FAQs found" text="Try another category or search term." /> : filteredFaqs.map((item) => <FaqCard key={item.id} item={item} onFeedback={(helpful) => faqMutation.mutate({ item, helpful })} />)}
          </>
        ) : null}
      </ScrollView>

      <FormModal visible={ticketOpen} title="Report Issue" onClose={() => setTicketOpen(false)} onSubmit={() => ticketMutation.mutate()} submitLabel={ticketMutation.isPending ? "Submitting..." : "Submit ticket"}>
        <Field label="Title" value={ticket.title} onChangeText={(title) => setTicket((current) => ({ ...current, title }))} />
        <Field label="Description" value={ticket.description} onChangeText={(description) => setTicket((current) => ({ ...current, description }))} multiline />
        <Field label="Category" value={ticket.category} onChangeText={(category) => setTicket((current) => ({ ...current, category }))} />
        <Field label="Priority" value={ticket.priority} onChangeText={(priority) => setTicket((current) => ({ ...current, priority }))} />
        <Field label="Module" value={ticket.module} onChangeText={(module) => setTicket((current) => ({ ...current, module }))} />
      </FormModal>

      <FormModal visible={featureOpen} title="Request Feature" onClose={() => setFeatureOpen(false)} onSubmit={() => featureMutation.mutate()} submitLabel={featureMutation.isPending ? "Submitting..." : "Submit request"}>
        <Field label="Title" value={feature.title} onChangeText={(title) => setFeature((current) => ({ ...current, title }))} />
        <Field label="Description" value={feature.description} onChangeText={(description) => setFeature((current) => ({ ...current, description }))} multiline />
        <Field label="Category" value={feature.category} onChangeText={(category) => setFeature((current) => ({ ...current, category }))} />
      </FormModal>
    </SafeAreaView>
  );
}

function TicketCard({ item }: { item: SupportTicket }) {
  return <View style={styles.card}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.status}>{item.status.replaceAll("_", " ")}</Text></View><Text style={styles.meta} numberOfLines={3}>{item.description}</Text><View style={styles.cardFoot}><Text style={styles.meta}>#{item.ticketNumber}</Text><Text style={styles.meta}>{item.responseCount} responses</Text><Text style={styles.meta}>{item.createdAt.slice(0, 10)}</Text></View></View>;
}

function FeatureCard({ item, onVote }: { item: FeatureRequest; onVote: () => void }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.meta}>{item.description}</Text><View style={styles.chips}><Text style={styles.chip}>{item.category}</Text><Text style={styles.planned}>{item.status.replaceAll("_", " ")}</Text></View><View style={styles.cardFoot}><Text style={styles.meta}>{item.createdAt.slice(0, 10)}</Text><Pressable onPress={onVote} style={[styles.voteButton, item.voted && styles.voteActive]}><ThumbsUp size={18} color={item.voted ? "#fff" : "#111827"} /><Text style={[styles.voteText, item.voted && styles.voteTextActive]}>{item.voteCount}</Text></Pressable></View></View>;
}

function FaqCard({ item, onFeedback }: { item: SupportFaq; onFeedback: (helpful: boolean) => void }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{item.question}</Text><Text style={styles.meta}>{item.answer}</Text><View style={styles.divider} /><View style={styles.cardFoot}><Text style={styles.chip}>{item.category}</Text><Text style={styles.meta}>Was this helpful?</Text><Pressable onPress={() => onFeedback(true)} style={styles.iconText}><ThumbsUp size={18} color="#111827" /><Text>{item.helpful}</Text></Pressable><Pressable onPress={() => onFeedback(false)} style={styles.iconText}><ThumbsDown size={18} color="#111827" /><Text>{item.notHelpful}</Text></Pressable></View></View>;
}

function SearchBox({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return <View style={styles.searchBox}><Search color="#98a2b3" size={22} /><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#667085" style={styles.searchInput} /></View>;
}

function Stat({ value, label, color }: { value: string | number; label: string; color: string }) {
  return <View style={{ alignItems: "center", flex: 1 }}><Text style={[styles.statValue, { color }]}>{value}</Text><Text style={styles.meta}>{label}</Text></View>;
}

function Segmented<T extends string>({ tabs, active, onPick }: { tabs: readonly T[]; active: T; onPick: (tab: T) => void }) {
  return <View style={styles.segmented}>{tabs.map((item) => <Pressable key={item} onPress={() => onPick(item)} style={[styles.segment, active === item && styles.segmentActive]}><Text style={styles.segmentText}>{item}</Text></Pressable>)}</View>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;
}

function FormModal({ visible, title, children, onClose, onSubmit, submitLabel }: { visible: boolean; title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void; submitLabel: string }) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.form}><View style={styles.rowBetween}><Text style={styles.modalTitle}>{title}</Text><Pressable onPress={onClose}><Text style={styles.close}>Close</Text></Pressable></View>{children}<Pressable onPress={onSubmit} style={styles.fullDark}><Text style={styles.darkButtonText}>{submitLabel}</Text></Pressable></ScrollView></SafeAreaView></Modal>;
}

function Field({ label, value, onChangeText, multiline }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) {
  return <View style={{ gap: 8 }}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} multiline={multiline} style={[styles.input, multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: { minHeight: 74, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  title: { flex: 1, color: "#111827", fontSize: 23, fontWeight: "500" },
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  segmented: { minHeight: 58, borderRadius: 20, backgroundColor: "#e9e9ee", padding: 6, flexDirection: "row" },
  segment: { flex: 1, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: "#fff" },
  segmentText: { fontSize: 14, fontWeight: "800", color: "#111827" },
  actionGrid: { flexDirection: "row", gap: 16 },
  actionCard: { flex: 1, minHeight: 160, borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 16, gap: 16 },
  actionTitle: { color: "#111827", fontSize: 18, fontWeight: "900", textAlign: "center" },
  statsCard: { borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#fff", padding: 20, gap: 24 },
  stats: { flexDirection: "row" },
  statValue: { fontSize: 22, fontWeight: "900" },
  sectionTitle: { color: "#111827", fontSize: 22, fontWeight: "900" },
  card: { borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#fff", padding: 20, gap: 16 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  cardTitle: { flex: 1, color: "#111827", fontSize: 19, fontWeight: "900" },
  meta: { color: "#475467", fontSize: 15, lineHeight: 23 },
  status: { color: "#92400e", backgroundColor: "#fef3c7", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontWeight: "900", textTransform: "capitalize" },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 18, flexWrap: "wrap" },
  searchBox: { minHeight: 58, borderRadius: 14, backgroundColor: "#eef0f4", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: "#111827", fontSize: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 10, backgroundColor: "#eef0f4", paddingHorizontal: 12, paddingVertical: 8, color: "#111827", fontWeight: "800" },
  chipActive: { backgroundColor: "#fff" },
  chipText: { color: "#111827", fontWeight: "800" },
  planned: { borderRadius: 10, backgroundColor: "#f3e8ff", paddingHorizontal: 12, paddingVertical: 8, color: "#7e22ce", fontWeight: "900", textTransform: "capitalize" },
  darkButton: { minHeight: 48, borderRadius: 14, backgroundColor: "#05051a", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  darkButtonText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  voteButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#d7dbe3", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  voteActive: { backgroundColor: "#05051a", borderColor: "#05051a" },
  voteText: { color: "#111827", fontWeight: "900", fontSize: 16 },
  voteTextActive: { color: "#fff" },
  iconText: { flexDirection: "row", gap: 6, alignItems: "center" },
  divider: { height: 1, backgroundColor: "#eef0f4" },
  empty: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  emptyTitle: { color: "#111827", fontSize: 20, fontWeight: "900" },
  emptyText: { color: "#667085", fontSize: 15, textAlign: "center" },
  form: { padding: 20, gap: 14, paddingBottom: 40 },
  modalTitle: { color: "#111827", fontSize: 28, fontWeight: "900" },
  close: { color: "#667085", fontSize: 16, fontWeight: "800" },
  fieldLabel: { color: "#111827", fontSize: 14, fontWeight: "800" },
  input: { minHeight: 56, borderRadius: 16, backgroundColor: "#eef0f4", paddingHorizontal: 14, color: "#111827", fontSize: 16 },
  multiline: { minHeight: 120, paddingTop: 14 },
  fullDark: { minHeight: 58, borderRadius: 18, backgroundColor: "#05051a", alignItems: "center", justifyContent: "center", marginTop: 8 },
});
