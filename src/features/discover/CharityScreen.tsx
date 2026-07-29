import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowLeft, ChevronDown, Gift, Heart, Plus, Search, Trophy, Users } from "lucide-react-native";

import { useAuth } from "../../lib/AuthContext";
import { formatMinor } from "../financial/utils";
import {
  listCharityWorkspace,
  pledgeDonation,
  registerCharity,
  volunteerForCharity,
  type CharityOrg,
} from "./communityServicesRepository";

const blankOrg = { name: "", cause: "", city: "", description: "", goalInput: "" };

export default function CharityScreen() {
  const { user, initialized } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"charities" | "donors">("charities");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("All Cities");
  const [cause, setCause] = useState("All Causes");
  const [cityOpen, setCityOpen] = useState(false);
  const [causeOpen, setCauseOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [orgForm, setOrgForm] = useState(blankOrg);
  const [pledgeTarget, setPledgeTarget] = useState<CharityOrg | null>(null);
  const [pledgeAmount, setPledgeAmount] = useState("");

  const workspace = useQuery({
    queryKey: ["charity-workspace", user && "id" in user ? user.id : "guest"],
    queryFn: () => listCharityWorkspace(user),
    enabled: initialized,
  });

  const organizations = workspace.data?.organizations ?? [];
  const cities = ["All Cities", ...Array.from(new Set(organizations.map((item) => item.city).filter(Boolean)))];
  const causes = ["All Causes", ...Array.from(new Set(organizations.map((item) => item.cause).filter(Boolean)))];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return organizations.filter((item) => {
      const matchesQuery = !needle || `${item.name} ${item.city} ${item.cause}`.toLowerCase().includes(needle);
      const matchesCity = city === "All Cities" || item.city === city;
      const matchesCause = cause === "All Causes" || item.cause === cause;
      return matchesQuery && matchesCity && matchesCause;
    });
  }, [cause, city, organizations, query]);

  const invalidate = async () => queryClient.invalidateQueries({ queryKey: ["charity-workspace"] });
  const registerMutation = useMutation({
    mutationFn: () => registerCharity(user, orgForm),
    onSuccess: async () => {
      setRegisterOpen(false);
      setOrgForm(blankOrg);
      await invalidate();
    },
    onError: (error) => Alert.alert("Could not register charity", error instanceof Error ? error.message : "Please try again."),
  });
  const pledgeMutation = useMutation({
    mutationFn: async () => {
      if (!pledgeTarget) throw new Error("Choose an organisation first.");
      await pledgeDonation(user, pledgeTarget.id, pledgeAmount);
    },
    onSuccess: async () => {
      setPledgeTarget(null);
      setPledgeAmount("");
      Alert.alert("Pledge saved", "This is recorded as a pending pledge. It is not counted as donated money until confirmed.");
      await invalidate();
    },
    onError: (error) => Alert.alert("Could not save pledge", error instanceof Error ? error.message : "Please try again."),
  });
  const volunteerMutation = useMutation({
    mutationFn: (orgId: string) => volunteerForCharity(user, orgId),
    onSuccess: () => Alert.alert("Volunteer interest saved", "The organisation owner can now see your interest."),
    onError: (error) => Alert.alert("Could not volunteer", error instanceof Error ? error.message : "Please try again."),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><ArrowLeft color="#111827" size={24} /></Pressable>
        <Text style={styles.title}>Charity</Text>
        <Pressable onPress={() => setRegisterOpen(true)} style={styles.outlineButton}>
          <Plus color="#111827" size={20} />
          <Text style={styles.outlineButtonText}>Register</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.impactCard}>
          <View>
            <Text style={styles.impactLabel}>Your Total Impact</Text>
            <Text style={styles.impactValue}>{formatMinor(workspace.data?.impactMinor ?? 0n)} donated</Text>
            <Text style={styles.impactLabel}>{workspace.data?.helpedCount ?? 0} organizations helped</Text>
          </View>
          <Heart color="#ffffff" size={48} />
        </View>

        <View style={styles.tabs}>
          <Tab label="Charities" active={tab === "charities"} onPress={() => setTab("charities")} />
          <Tab label="Top Donors" active={tab === "donors"} onPress={() => setTab("donors")} />
        </View>

        {tab === "charities" ? (
          <>
            <View style={styles.searchBox}>
              <Search color="#98a2b3" size={22} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search charities..." placeholderTextColor="#667085" style={styles.searchInput} />
            </View>
            <View style={styles.filters}>
              <Filter label={city} open={cityOpen} setOpen={setCityOpen} options={cities} onPick={setCity} />
              <Filter label={cause} open={causeOpen} setOpen={setCauseOpen} options={causes} onPick={setCause} />
            </View>
            <Text style={styles.count}>{filtered.length} organizations found</Text>
            {workspace.isLoading ? <Centered title="Loading charities" text="Fetching real organisations..." /> : null}
            {!workspace.isLoading && filtered.length === 0 ? (
              <Centered title="No charities yet" text="Register a real organisation to start this directory." />
            ) : (
              filtered.map((org) => <CharityCard key={org.id} org={org} onDonate={() => setPledgeTarget(org)} onVolunteer={() => volunteerMutation.mutate(org.id)} />)
            )}
          </>
        ) : (
          <Centered title="No confirmed donors yet" text="Top Donors only appears after donation pledges are confirmed by an approved backend process." icon={<Trophy color="#f59e0b" size={42} />} />
        )}
      </ScrollView>

      <FormModal
        visible={registerOpen}
        title="Register Charity"
        onClose={() => setRegisterOpen(false)}
        onSubmit={() => registerMutation.mutate()}
        submitLabel={registerMutation.isPending ? "Registering..." : "Register"}
        disabled={registerMutation.isPending}
      >
        <Field label="Organisation name" value={orgForm.name} onChangeText={(name) => setOrgForm((current) => ({ ...current, name }))} />
        <Field label="Cause" value={orgForm.cause} onChangeText={(cause) => setOrgForm((current) => ({ ...current, cause }))} />
        <Field label="City" value={orgForm.city} onChangeText={(city) => setOrgForm((current) => ({ ...current, city }))} />
        <Field label="Goal amount" value={orgForm.goalInput} onChangeText={(goalInput) => setOrgForm((current) => ({ ...current, goalInput }))} keyboardType="decimal-pad" />
        <Field label="Description" value={orgForm.description} onChangeText={(description) => setOrgForm((current) => ({ ...current, description }))} multiline />
      </FormModal>

      <FormModal
        visible={Boolean(pledgeTarget)}
        title={`Pledge to ${pledgeTarget?.name ?? ""}`}
        onClose={() => setPledgeTarget(null)}
        onSubmit={() => pledgeMutation.mutate()}
        submitLabel={pledgeMutation.isPending ? "Saving..." : "Save pending pledge"}
        disabled={pledgeMutation.isPending}
      >
        <Text style={styles.helpText}>No payment is collected here. This only records a pending donation intent.</Text>
        <Field label="Pledge amount" value={pledgeAmount} onChangeText={setPledgeAmount} keyboardType="decimal-pad" />
      </FormModal>
    </SafeAreaView>
  );
}

function CharityCard({ org, onDonate, onVolunteer }: { org: CharityOrg; onDonate: () => void; onVolunteer: () => void }) {
  const progress = org.goalMinor > 0n ? Math.min(Number(org.raisedMinor) / Number(org.goalMinor), 1) : 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.orgAvatar}><Heart color="#ec4899" size={24} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{org.name}</Text>
          <Text style={styles.pill}>{org.cause}</Text>
          <Text style={styles.meta}>{org.city || "City not added"}</Text>
          <Text numberOfLines={2} style={styles.meta}>{org.description || "No description added yet."}</Text>
        </View>
        {org.isVerified ? <Text style={styles.verified}>✓</Text> : null}
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(progress * 100, 2)}%` }]} /></View>
      <View style={styles.cardActions}>
        <Pressable onPress={onDonate} style={styles.darkButton}><Gift color="#ffffff" size={18} /><Text style={styles.darkButtonText}>Donate</Text></Pressable>
        <Pressable onPress={onVolunteer} style={styles.lightButton}><Text style={styles.lightButtonText}>Volunteer</Text></Pressable>
      </View>
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={styles.tabText}>{label}</Text></Pressable>;
}

function Filter({ label, open, setOpen, options, onPick }: { label: string; open: boolean; setOpen: (open: boolean) => void; options: string[]; onPick: (value: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Pressable onPress={() => setOpen(!open)} style={styles.filter}><Text style={styles.filterText}>{label}</Text><ChevronDown color="#98a2b3" size={18} /></Pressable>
      {open ? <View style={styles.menu}>{options.map((item) => <Pressable key={item} onPress={() => { onPick(item); setOpen(false); }} style={styles.menuItem}><Text style={styles.menuText}>{item}</Text></Pressable>)}</View> : null}
    </View>
  );
}

function Centered({ title, text, icon }: { title: string; text: string; icon?: React.ReactNode }) {
  return <View style={styles.centered}>{icon}<Text style={styles.centerTitle}>{title}</Text><Text style={styles.centerText}>{text}</Text></View>;
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

function Field({ label, value, onChangeText, keyboardType, multiline }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: "default" | "decimal-pad"; multiline?: boolean }) {
  return <View style={{ gap: 8 }}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} style={[styles.input, multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, padding: 16, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  title: { flex: 1, color: "#111827", fontSize: 28, fontWeight: "600" },
  outlineButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#d7dbe3", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  outlineButtonText: { fontSize: 16, fontWeight: "800" },
  content: { padding: 14, gap: 14, paddingBottom: 36 },
  impactCard: { borderRadius: 16, backgroundColor: "#ff1f70", padding: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  impactLabel: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  impactValue: { color: "#ffffff", fontSize: 28, fontWeight: "900", marginVertical: 4 },
  tabs: { borderRadius: 20, backgroundColor: "#e9eaf1", padding: 4, flexDirection: "row" },
  tab: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: "#ffffff" },
  tabText: { color: "#111827", fontSize: 15, fontWeight: "800" },
  searchBox: { minHeight: 58, borderRadius: 14, backgroundColor: "#eef0f4", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: "#111827", fontSize: 18 },
  filters: { flexDirection: "row", gap: 12, zIndex: 4 },
  filter: { minHeight: 56, borderRadius: 12, backgroundColor: "#eef0f4", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filterText: { color: "#111827", fontSize: 15, fontWeight: "600" },
  menu: { position: "absolute", left: 0, right: 0, top: 60, borderRadius: 12, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d7dbe3", zIndex: 10, overflow: "hidden" },
  menuItem: { padding: 14 },
  menuText: { fontSize: 16, color: "#111827" },
  count: { color: "#475467", fontSize: 16 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: "#e1e5eb", backgroundColor: "#ffffff", padding: 14, gap: 12 },
  cardTop: { flexDirection: "row", gap: 14 },
  orgAvatar: { width: 84, height: 84, borderRadius: 14, backgroundColor: "#ffeef6", alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  pill: { alignSelf: "flex-start", color: "#8a22c2", backgroundColor: "#f2ddff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, fontWeight: "800", marginTop: 8 },
  meta: { color: "#667085", fontSize: 14, lineHeight: 20, marginTop: 6 },
  verified: { color: "#2563eb", backgroundColor: "#dbeafe", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 8, backgroundColor: "#d1d5db", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#05051a" },
  cardActions: { flexDirection: "row", gap: 10 },
  darkButton: { minHeight: 48, borderRadius: 12, backgroundColor: "#05051a", paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  darkButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  lightButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "#d7dbe3", paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  lightButtonText: { color: "#111827", fontSize: 15, fontWeight: "800" },
  centered: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  centerTitle: { color: "#111827", fontSize: 20, fontWeight: "900", textAlign: "center" },
  centerText: { color: "#667085", fontSize: 15, textAlign: "center", lineHeight: 22 },
  modalContent: { padding: 18, gap: 14, paddingBottom: 36 },
  close: { color: "#667085", fontSize: 16, fontWeight: "700" },
  fieldLabel: { color: "#111827", fontSize: 14, fontWeight: "800" },
  input: { minHeight: 56, borderRadius: 16, backgroundColor: "#f3f4f6", paddingHorizontal: 14, color: "#111827", fontSize: 16 },
  multiline: { minHeight: 120, paddingTop: 14 },
  helpText: { color: "#667085", fontSize: 14, lineHeight: 20 },
  fullButton: { marginTop: 6 },
  disabled: { opacity: 0.55 },
});
