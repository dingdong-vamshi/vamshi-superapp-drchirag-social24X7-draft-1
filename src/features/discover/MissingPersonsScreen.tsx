import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Alert, Image, Linking, Modal, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowLeft, Camera, Check, ChevronDown, Phone, Plus, Search, ShieldAlert, UserRound } from "lucide-react-native";

import { useAuth } from "../../lib/AuthContext";
import {
  createMissingReport,
  listMissingReports,
  updateMissingStatus,
  type MissingPersonReport,
} from "./communityServicesRepository";

const blankReport = {
  personName: "",
  ageText: "",
  lastSeenCity: "",
  lastSeenLocation: "",
  lastSeenDate: "",
  description: "",
  reporterContact: "",
  status: "missing" as "missing" | "found",
  urgent: false,
  rewardInput: "",
  rewardTerms: "",
  photoUri: "",
  consentConfirmed: false,
};

export default function MissingPersonsScreen() {
  const { user, initialized } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("All Cities");
  const [age, setAge] = useState("All Ages");
  const [cityOpen, setCityOpen] = useState(false);
  const [ageOpen, setAgeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [form, setForm] = useState(blankReport);

  const reportsQuery = useQuery({
    queryKey: ["missing-person-reports", user && "id" in user ? user.id : "guest"],
    queryFn: () => listMissingReports(user),
    enabled: initialized && Boolean(user && "id" in user),
  });

  const reports = reportsQuery.data ?? [];
  const activeUserId = user && "id" in user ? user.id : "";
  const cities = ["All Cities", ...Array.from(new Set(reports.map((item) => item.lastSeenCity).filter(Boolean)))];
  const ageOptions = ["All Ages", "Child", "Adult", "Senior"];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reports.filter((item) => {
      const matchesQuery = !needle || `${item.personName} ${item.lastSeenCity} ${item.lastSeenLocation}`.toLowerCase().includes(needle);
      const matchesCity = city === "All Cities" || item.lastSeenCity === city;
      const ageNumber = Number(item.ageText.match(/\d+/)?.[0] ?? "");
      const matchesAge =
        age === "All Ages" ||
        (age === "Child" && Number.isFinite(ageNumber) && ageNumber < 18) ||
        (age === "Adult" && Number.isFinite(ageNumber) && ageNumber >= 18 && ageNumber < 60) ||
        (age === "Senior" && Number.isFinite(ageNumber) && ageNumber >= 60);
      return matchesQuery && matchesCity && matchesAge;
    });
  }, [age, city, query, reports]);

  const invalidate = async () => queryClient.invalidateQueries({ queryKey: ["missing-person-reports"] });
  const createMutation = useMutation({
    mutationFn: () => createMissingReport(user, form),
    onSuccess: async () => {
      setReportOpen(false);
      setForm(blankReport);
      await invalidate();
    },
    onError: (error) => Alert.alert("Could not create report", error instanceof Error ? error.message : "Please try again."),
  });

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo permission needed", "Allow photo access to attach a missing-person image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.75,
    });
    if (!result.canceled) {
      setForm((current) => ({ ...current, photoUri: result.assets[0]?.uri ?? "" }));
    }
  };
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "missing" | "found" }) => updateMissingStatus(user, id, status),
    onSuccess: invalidate,
    onError: (error) => Alert.alert("Could not update report", error instanceof Error ? error.message : "Please try again."),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><ArrowLeft color="#111827" size={24} /></Pressable>
        <Text style={styles.title}>Missing{"\n"}Persons</Text>
        <Pressable onPress={() => setReportOpen(true)} style={styles.outlineButton}>
          <Plus color="#111827" size={20} />
          <Text style={styles.outlineButtonText}>Report</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.searchBox}>
          <Search color="#98a2b3" size={22} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or location..." placeholderTextColor="#667085" style={styles.searchInput} />
        </View>
        <View style={styles.filters}>
          <Filter label={city} open={cityOpen} setOpen={setCityOpen} options={cities} onPick={setCity} />
          <Filter label={age} open={ageOpen} setOpen={setAgeOpen} options={ageOptions} onPick={setAge} />
        </View>
        <View style={styles.emergency}>
          <ShieldAlert color="#b45309" size={18} />
          <Text style={styles.emergencyText}>Emergency? Call 100 immediately</Text>
        </View>
        <Text style={styles.count}>{filtered.length} results found</Text>

        {!user || !("id" in user) ? <Centered title="Sign in required" text="Use a real Supabase test user to view and create verified reports." /> : null}
        {user && "id" in user && reportsQuery.isLoading ? <Centered title="Loading reports" text="Fetching real missing-person reports..." /> : null}
        {user && "id" in user && !reportsQuery.isLoading && filtered.length === 0 ? (
          <Centered title="No reports yet" text="Create the first verified report. Nothing here is seeded from Figma." />
        ) : (
          filtered.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              owned={report.reporterId === activeUserId}
              onMarkFound={() => statusMutation.mutate({ id: report.id, status: "found" })}
            />
          ))
        )}
      </ScrollView>

      <FormModal
        visible={reportOpen}
        title="Report Missing Person"
        onClose={() => setReportOpen(false)}
        onSubmit={() => createMutation.mutate()}
        submitLabel={createMutation.isPending ? "Submitting..." : "Submit report"}
        disabled={createMutation.isPending}
      >
        <Text style={styles.helpText}>Only submit accurate, consent-backed information. Reporter contact is used for contact routing and is not shown on cards.</Text>
        <Pressable onPress={pickPhoto} style={styles.photoPicker}>
          {form.photoUri ? <Image source={{ uri: form.photoUri }} style={styles.photoPreview} /> : <Camera color="#667085" size={28} />}
          <Text style={styles.photoText}>{form.photoUri ? "Change photo" : "Add photo"}</Text>
        </Pressable>
        <Field label="Person's name" value={form.personName} onChangeText={(personName) => setForm((current) => ({ ...current, personName }))} />
        <Field label="Age or range" value={form.ageText} onChangeText={(ageText) => setForm((current) => ({ ...current, ageText }))} />
        <Field label="Last-seen city" value={form.lastSeenCity} onChangeText={(lastSeenCity) => setForm((current) => ({ ...current, lastSeenCity }))} />
        <Field label="Last-seen location" value={form.lastSeenLocation} onChangeText={(lastSeenLocation) => setForm((current) => ({ ...current, lastSeenLocation }))} />
        <Field label="Last-seen date (YYYY-MM-DD)" value={form.lastSeenDate} onChangeText={(lastSeenDate) => setForm((current) => ({ ...current, lastSeenDate }))} />
        <Field label="Reward amount (optional)" value={form.rewardInput} onChangeText={(rewardInput) => setForm((current) => ({ ...current, rewardInput }))} />
        <Field label="Reward terms (optional)" value={form.rewardTerms} onChangeText={(rewardTerms) => setForm((current) => ({ ...current, rewardTerms }))} multiline />
        <Field label="Reporter contact" value={form.reporterContact} onChangeText={(reporterContact) => setForm((current) => ({ ...current, reporterContact }))} />
        <Field label="Description" value={form.description} onChangeText={(description) => setForm((current) => ({ ...current, description }))} multiline />
        <Pressable onPress={() => setForm((current) => ({ ...current, urgent: !current.urgent }))} style={styles.checkRow}>
          <View style={[styles.checkBox, form.urgent && styles.checked]}>{form.urgent ? <Check color="#fff" size={16} /> : null}</View>
          <Text style={styles.helpText}>Mark this as urgent</Text>
        </Pressable>
        <Pressable onPress={() => setForm((current) => ({ ...current, consentConfirmed: !current.consentConfirmed }))} style={styles.checkRow}>
          <View style={[styles.checkBox, form.consentConfirmed && styles.checked]}>{form.consentConfirmed ? <Check color="#fff" size={16} /> : null}</View>
          <Text style={styles.helpText}>I confirm this is accurate and I have consent/guardian authority to report.</Text>
        </Pressable>
      </FormModal>
    </SafeAreaView>
  );
}

function ReportCard({ report, owned, onMarkFound }: { report: MissingPersonReport; owned: boolean; onMarkFound: () => void }) {
  const shareReport = async () => {
    await Share.share({
      message: [
        `${report.personName} is marked ${report.status} on Social 24x7.`,
        `Age: ${report.ageText || "Not shared"}.`,
        `Last seen: ${report.lastSeenLocation || report.lastSeenCity || "not specified"}.`,
        report.urgent ? "Urgent report." : "",
        report.rewardMinor > 0n ? `Reward: ₹${Number(report.rewardMinor) / 100}.` : "",
        `Report ID: ${report.id}`,
      ].filter(Boolean).join(" "),
    });
  };
  const contact = async () => {
    await Linking.openURL("mailto:support@social24x7.local?subject=Missing%20person%20report%20contact");
  };
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>{report.photoUrl ? <Image source={{ uri: report.photoUrl }} style={styles.cardImage} /> : <UserRound color="#9ca3af" size={36} />}</View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{report.personName}</Text>
          <Text style={[styles.status, report.status === "found" && styles.found]}>{report.status === "found" ? "Found" : "Missing"}</Text>
        </View>
        {report.urgent ? <Text style={styles.urgent}>Urgent</Text> : null}
        <Text style={styles.meta}>Age: {report.ageText || "Not shared"}</Text>
        <Text numberOfLines={1} style={styles.meta}>Last seen: {report.lastSeenLocation || report.lastSeenCity || "Not shared"}</Text>
        <Text style={styles.meta}>Reported: {report.lastSeenDate ?? report.createdAt.slice(0, 10)}</Text>
        {report.rewardMinor > 0n ? <Text style={styles.reward}>Reward: ₹{(Number(report.rewardMinor) / 100).toLocaleString("en-IN")}</Text> : null}
        <Text numberOfLines={2} style={styles.meta}>{report.description || "No description added."}</Text>
        <View style={styles.actions}>
          <Pressable onPress={contact} style={styles.darkButton}><Phone color="#ffffff" size={17} /><Text style={styles.darkButtonText}>Contact</Text></Pressable>
          <Pressable onPress={shareReport} style={styles.lightButton}><Text style={styles.lightButtonText}>Share Info</Text></Pressable>
          {owned && report.status === "missing" ? <Pressable onPress={onMarkFound} style={styles.lightButton}><Text style={styles.lightButtonText}>Mark Found</Text></Pressable> : null}
        </View>
      </View>
    </View>
  );
}

function Filter({ label, open, setOpen, options, onPick }: { label: string; open: boolean; setOpen: (open: boolean) => void; options: string[]; onPick: (value: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Pressable onPress={() => setOpen(!open)} style={styles.filter}><Text style={styles.filterText}>{label}</Text><ChevronDown color="#98a2b3" size={18} /></Pressable>
      {open ? <View style={styles.menu}>{options.map((item) => <Pressable key={item} onPress={() => { onPick(item); setOpen(false); }} style={styles.menuItem}><Text style={styles.menuText}>{item}</Text></Pressable>)}</View> : null}
    </View>
  );
}

function Centered({ title, text }: { title: string; text: string }) {
  return <View style={styles.centered}><Text style={styles.centerTitle}>{title}</Text><Text style={styles.centerText}>{text}</Text></View>;
}

function FormModal({ visible, title, children, onClose, onSubmit, submitLabel, disabled }: { visible: boolean; title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void; submitLabel: string; disabled?: boolean }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.modalContent}>
        <View style={styles.header}><Text style={styles.title}>{title}</Text><Pressable onPress={onClose}><Text style={styles.close}>Close</Text></Pressable></View>
        {children}
        <Pressable disabled={disabled} onPress={onSubmit} style={[styles.darkButton, styles.fullButton, disabled && styles.disabled]}><Text style={styles.darkButtonText}>{submitLabel}</Text></Pressable>
      </ScrollView></SafeAreaView>
    </Modal>
  );
}

function Field({ label, value, onChangeText, multiline }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean }) {
  return <View style={{ gap: 8 }}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} multiline={multiline} style={[styles.input, multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, padding: 16, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  title: { flex: 1, color: "#111827", fontSize: 28, fontWeight: "600", lineHeight: 36 },
  outlineButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#d7dbe3", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  outlineButtonText: { fontSize: 16, fontWeight: "800" },
  content: { paddingVertical: 14, gap: 14, paddingBottom: 36 },
  searchBox: { marginHorizontal: 14, minHeight: 58, borderRadius: 14, backgroundColor: "#eef0f4", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: "#111827", fontSize: 17 },
  filters: { paddingHorizontal: 14, flexDirection: "row", gap: 12, zIndex: 5 },
  filter: { minHeight: 56, borderRadius: 12, backgroundColor: "#eef0f4", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filterText: { color: "#111827", fontSize: 15, fontWeight: "600" },
  menu: { position: "absolute", left: 0, right: 0, top: 60, borderRadius: 12, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d7dbe3", zIndex: 10, overflow: "hidden" },
  menuItem: { padding: 14 },
  menuText: { fontSize: 16, color: "#111827" },
  emergency: { minHeight: 70, backgroundColor: "#fffbeb", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#fde68a", paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  emergencyText: { color: "#9a3412", fontSize: 15, fontWeight: "700" },
  count: { marginHorizontal: 14, color: "#475467", fontSize: 16 },
  card: { marginHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#ffffff", padding: 14, flexDirection: "row", gap: 14 },
  avatar: { width: 88, height: 88, borderRadius: 14, backgroundColor: "#eef0f4", alignItems: "center", justifyContent: "center" },
  cardImage: { width: 88, height: 88, borderRadius: 14 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  cardTitle: { flex: 1, color: "#111827", fontSize: 18, fontWeight: "800" },
  status: { color: "#b91c1c", backgroundColor: "#fee2e2", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, fontWeight: "900" },
  found: { color: "#15803d", backgroundColor: "#dcfce7" },
  urgent: { color: "#b45309", fontWeight: "900", marginTop: 2 },
  reward: { color: "#047857", fontSize: 14, lineHeight: 21, marginTop: 4, fontWeight: "800" },
  meta: { color: "#667085", fontSize: 14, lineHeight: 21, marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  darkButton: { minHeight: 44, borderRadius: 12, backgroundColor: "#05051a", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  darkButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  lightButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#d7dbe3", paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  lightButtonText: { color: "#111827", fontSize: 14, fontWeight: "800" },
  centered: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  centerTitle: { color: "#111827", fontSize: 20, fontWeight: "900", textAlign: "center" },
  centerText: { color: "#667085", fontSize: 15, textAlign: "center", lineHeight: 22 },
  modalContent: { padding: 18, gap: 14, paddingBottom: 36 },
  close: { color: "#667085", fontSize: 16, fontWeight: "700" },
  fieldLabel: { color: "#111827", fontSize: 14, fontWeight: "800" },
  helpText: { color: "#667085", fontSize: 14, lineHeight: 20 },
  photoPicker: { minHeight: 92, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: "#cbd5e1", backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", gap: 8 },
  photoPreview: { width: 84, height: 84, borderRadius: 14 },
  photoText: { color: "#475467", fontSize: 14, fontWeight: "800" },
  input: { minHeight: 56, borderRadius: 16, backgroundColor: "#f3f4f6", paddingHorizontal: 14, color: "#111827", fontSize: 16 },
  multiline: { minHeight: 120, paddingTop: 14 },
  checkRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  checkBox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  fullButton: { marginTop: 6 },
  disabled: { opacity: 0.55 },
});
