import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
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
import { ArrowLeft, Plus, SplitSquareVertical, UserRound } from "lucide-react-native";

import { useAuth } from "../../lib/AuthContext";
import {
  addBillExpense,
  createBillGroup,
  inviteToBillGroup,
  listAcceptedConnections,
  listBillWorkspace,
  recordBillSettlement,
  respondToBillInvitation,
} from "./repository";
import type { AcceptedConnection, BillSplitExpense, BillSplitInvitation, BillSplitMember } from "./types";
import { calculateBillBalances, exactSplitTotal, formatMinor, toMinorUnits } from "./utils";

type BillTab = "groups" | "activity" | "friends";

const groupDefaults = () => ({
  name: "",
  description: "",
  category: "",
});

export default function BillSplitScreen() {
  const { user, initialized } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<BillTab>("groups");
  const [createOpen, setCreateOpen] = useState(false);
  const [groupForm, setGroupForm] = useState(groupDefaults());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [inviteeId, setInviteeId] = useState("");
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    totalInput: "",
    paidByUserId: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    category: "Other",
    notes: "",
    splitType: "equal" as "equal" | "exact",
  });
  const [exactShares, setExactShares] = useState<Record<string, string>>({});
  const [settlementForm, setSettlementForm] = useState({
    payerId: "",
    payeeId: "",
    amountInput: "",
    settlementDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const workspaceQuery = useQuery({
    queryKey: ["bill-workspace", user && "id" in user ? user.id : "guest"],
    queryFn: () => listBillWorkspace(user),
    enabled: initialized,
    retry: 1,
  });
  const connectionsQuery = useQuery({
    queryKey: ["accepted-connections", user && "id" in user ? user.id : "guest"],
    queryFn: () => listAcceptedConnections(user),
    enabled: initialized,
    retry: 1,
  });

  const groups = workspaceQuery.data?.groups ?? [];
  const invitations = workspaceQuery.data?.invitations ?? [];
  const members = workspaceQuery.data?.members ?? [];
  const expenses = workspaceQuery.data?.expenses ?? [];
  const shares = workspaceQuery.data?.shares ?? [];
  const settlements = workspaceQuery.data?.settlements ?? [];
  const activities = workspaceQuery.data?.activities ?? [];
  const activeUserId = user && "id" in user ? user.id : "";

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;
  const selectedMembers = members.filter((member) => member.groupId === selectedGroup?.id);
  const selectedExpenses = expenses.filter((expense) => expense.groupId === selectedGroup?.id);
  const selectedShares = shares.filter((share) => selectedExpenses.some((expense) => expense.id === share.expenseId));
  const selectedSettlements = settlements.filter((settlement) => settlement.groupId === selectedGroup?.id);
  const selectedActivities = activities.filter((activity) => activity.groupId === selectedGroup?.id);
  const myInvitation = invitations.find((item) => item.inviteeId === activeUserId && item.status === "pending");

  useEffect(() => {
    if (!inviteOpen || inviteeId) return;
    const firstConnection = connectionsQuery.data?.[0];
    if (firstConnection) setInviteeId(firstConnection.id);
  }, [connectionsQuery.data, inviteOpen, inviteeId]);

  const balanceMap = useMemo(
    () => calculateBillBalances({ expenses: selectedExpenses, shares: selectedShares, settlements: selectedSettlements }),
    [selectedExpenses, selectedShares, selectedSettlements],
  );
  const myOverallBalance = balanceMap.get(activeUserId) ?? 0n;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["bill-workspace"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => createBillGroup(user, groupForm),
    onSuccess: async (group) => {
      setCreateOpen(false);
      setSelectedGroupId(group.id);
      setGroupForm(groupDefaults());
      await invalidate();
    },
    onError: (error) =>
      Alert.alert(
        "Could not create group",
        error instanceof Error ? error.message : "Please try again.",
      ),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup?.id || !inviteeId) throw new Error("Choose a connection first.");
      return inviteToBillGroup(selectedGroup.id, inviteeId);
    },
    onSuccess: async () => {
      setInviteOpen(false);
      setInviteeId("");
      await invalidate();
    },
    onError: (error) =>
      Alert.alert("Could not send invite", error instanceof Error ? error.message : "Please try again."),
  });

  const invitationMutation = useMutation({
    mutationFn: async (input: { invitation: BillSplitInvitation; response: "accepted" | "rejected" }) =>
      respondToBillInvitation(user, input.invitation, input.response),
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert("Could not update invite", error instanceof Error ? error.message : "Please try again."),
  });

  const expenseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup?.id || !expenseForm.title.trim() || toMinorUnits(expenseForm.totalInput) <= 0n) {
        throw new Error("Enter a valid expense.");
      }
      if (selectedMembers.length === 0) {
        throw new Error("Add at least one group member before recording expenses.");
      }
      const totalMinor = toMinorUnits(expenseForm.totalInput);
      const sharesPayload =
        expenseForm.splitType === "equal"
          ? buildEqualShares(selectedMembers, totalMinor)
          : selectedMembers.map((member) => ({
              participantUserId: member.userId,
              shareInput: exactShares[member.userId] || "0",
            }));
      if (expenseForm.splitType === "exact" && exactSplitTotal(sharesPayload) !== totalMinor) {
        throw new Error("Exact shares must add up to the total amount.");
      }
      return addBillExpense({
        groupId: selectedGroup.id,
        title: expenseForm.title,
        totalInput: expenseForm.totalInput,
        paidByUserId: expenseForm.paidByUserId || activeUserId,
        expenseDate: expenseForm.expenseDate,
        category: expenseForm.category,
        notes: expenseForm.notes,
        splitType: expenseForm.splitType,
        shares: sharesPayload,
      });
    },
    onSuccess: async () => {
      setExpenseOpen(false);
      setExpenseForm({
        title: "",
        totalInput: "",
        paidByUserId: activeUserId,
        expenseDate: new Date().toISOString().slice(0, 10),
        category: "Other",
        notes: "",
        splitType: "equal",
      });
      setExactShares({});
      await invalidate();
    },
    onError: (error) =>
      Alert.alert("Could not save expense", error instanceof Error ? error.message : "Please try again."),
  });

  const settlementMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup?.id || !settlementForm.payerId || !settlementForm.payeeId || toMinorUnits(settlementForm.amountInput) <= 0n) {
        throw new Error("Enter a valid settlement.");
      }
      return recordBillSettlement({ groupId: selectedGroup.id, ...settlementForm });
    },
    onSuccess: async () => {
      setSettlementOpen(false);
      setSettlementForm({
        payerId: "",
        payeeId: "",
        amountInput: "",
        settlementDate: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      await invalidate();
    },
    onError: (error) =>
      Alert.alert("Could not save settlement", error instanceof Error ? error.message : "Please try again."),
  });

  if (!initialized || workspaceQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Centered title="Loading Bill Split" text="Fetching your groups and balances..." loading />
      </SafeAreaView>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <Centered
          title="Could not load Bill Split"
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
          <SplitSquareVertical color="#2563eb" size={22} />
          <Text style={styles.title}>Bill Split</Text>
        </View>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Your overall balance</Text>
        <Text style={[styles.balanceValue, myOverallBalance >= 0n ? styles.positive : styles.negative]}>
          {myOverallBalance >= 0n ? "+" : ""}
          {formatMinor(myOverallBalance)}
        </Text>
        <Text style={styles.balanceHint}>{myOverallBalance >= 0n ? "You are owed" : "You owe"}</Text>
      </View>

      <View style={styles.tabsRow}>
        {(["groups", "activity", "friends"] as BillTab[]).map((item) => (
          <TabButton key={item} label={capitalize(item)} active={tab === item} onPress={() => setTab(item)} />
        ))}
      </View>

      {myInvitation ? (
        <View style={styles.inviteBanner}>
          <Text style={styles.inviteBannerTitle}>Invitation pending</Text>
          <Text style={styles.inviteBannerText}>Respond to this bill split invite to join the group.</Text>
          <View style={styles.rowGap}>
            <ChipButton label="Accept" active onPress={() => void invitationMutation.mutate({ invitation: myInvitation, response: "accepted" })} />
            <ChipButton label="Reject" onPress={() => void invitationMutation.mutate({ invitation: myInvitation, response: "rejected" })} />
          </View>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "groups" ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Groups</Text>
              <Pressable onPress={() => setCreateOpen(true)} style={styles.darkButton}>
                <Plus color="#ffffff" size={20} />
                <Text style={styles.darkButtonText}>Create</Text>
              </Pressable>
            </View>

            {groups.length === 0 ? (
              <Centered title="No bill split groups yet" text="Create a group, invite accepted connections, then add your first shared expense." actionLabel="Create group" onPress={() => setCreateOpen(true)} />
            ) : (
              groups.map((group) => {
                const groupMembers = members.filter((member) => member.groupId === group.id);
                const groupExpenses = expenses.filter((expense) => expense.groupId === group.id);
                const groupShares = shares.filter((share) => groupExpenses.some((expense) => expense.id === share.expenseId));
                const groupSettlements = settlements.filter((settlement) => settlement.groupId === group.id);
                const groupBalances = calculateBillBalances({ expenses: groupExpenses, shares: groupShares, settlements: groupSettlements });
                const balance = groupBalances.get(activeUserId) ?? 0n;
                const totalSpent = groupExpenses.reduce((total, item) => total + item.totalMinor, 0n);
                const lastActivity = [...groupExpenses].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))[0]?.expenseDate || group.createdAt.slice(0, 10);
                return (
                  <Pressable key={group.id} onPress={() => setSelectedGroupId(group.id)} style={[styles.groupCard, selectedGroup?.id === group.id && styles.groupCardActive]}>
                    <View style={styles.groupCardHeader}>
                      <View style={styles.groupAvatar}>
                        <Text style={styles.groupAvatarText}>{group.avatarLabel || group.name.slice(0, 2).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupTitle}>{group.name}</Text>
                        <Text style={styles.groupMeta}>{group.description || "Shared expenses"}</Text>
                        <Text style={styles.groupMeta}>
                          {groupMembers.length} members · Last activity: {lastActivity}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.groupStats}>
                      <StatBlock label="Total Spent" value={formatMinor(totalSpent)} />
                      <StatBlock label="Your Balance" value={formatMinor(balance)} positive={balance >= 0n} negative={balance < 0n} />
                    </View>
                    {selectedGroup?.id === group.id ? (
                      <View style={styles.rowGap}>
                        <ChipButton label="Invite" onPress={() => setInviteOpen(true)} active />
                        <ChipButton label="Add expense" onPress={() => setExpenseOpen(true)} />
                        <ChipButton label="Settle" onPress={() => setSettlementOpen(true)} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </>
        ) : null}

        {tab === "activity" ? (
          <View style={{ gap: 14 }}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {selectedActivities.length === 0 ? (
              <Centered title="No activity yet" text="Create a group, add an expense, or record a settlement to populate this timeline." />
            ) : (
              selectedActivities.map((activity) => (
                <View key={activity.id} style={styles.activityCard}>
                  <View style={styles.activityIcon}>
                    <Badge />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle}>{activity.detail || activity.activityType.replace(/_/g, " ")}</Text>
                    <Text style={styles.activityMeta}>{activity.createdAt.slice(0, 10)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {tab === "friends" ? (
          <View style={{ gap: 14 }}>
            <Text style={styles.sectionTitle}>Friends</Text>
            {(connectionsQuery.data ?? []).length === 0 ? (
              <Centered title="Add Friends" text="Invite friends to split expenses together" actionLabel="Go to chats" onPress={() => router.push("/chats")} />
            ) : (
              (connectionsQuery.data ?? []).map((connection: AcceptedConnection) => (
                <View key={connection.id} style={styles.friendCard}>
                  <View style={styles.friendIcon}><UserRound color="#98a2b3" size={20} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupTitle}>{connection.name}</Text>
                    <Text style={styles.groupMeta}>@{connection.username}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      <SimpleModal
        visible={createOpen}
        title="Create Bill Split Group"
        onClose={() => setCreateOpen(false)}
        onSubmit={() => void createMutation.mutate()}
        submitLabel={createMutation.isPending ? "Creating..." : "Create group"}
        disabled={createMutation.isPending}
      >
        <Field label="Name" value={groupForm.name} onChangeText={(value) => setGroupForm((current) => ({ ...current, name: value }))} />
        <Field label="Description" value={groupForm.description} onChangeText={(value) => setGroupForm((current) => ({ ...current, description: value }))} />
        <Field label="Category" value={groupForm.category} onChangeText={(value) => setGroupForm((current) => ({ ...current, category: value }))} />
      </SimpleModal>

      <SimpleModal visible={inviteOpen} title="Invite Accepted Connection" onClose={() => setInviteOpen(false)} onSubmit={() => void inviteMutation.mutate()} submitLabel={inviteMutation.isPending ? "Sending..." : "Send invite"} disabled={inviteMutation.isPending}>
        {(connectionsQuery.data ?? []).map((connection: AcceptedConnection) => (
          <Pressable key={connection.id} onPress={() => setInviteeId(connection.id)} style={[styles.selectableRow, inviteeId === connection.id && styles.selectableRowActive]}>
            <Text style={styles.groupTitle}>{connection.name}</Text>
            <Text style={styles.groupMeta}>@{connection.username}</Text>
          </Pressable>
        ))}
      </SimpleModal>

      <SimpleModal visible={expenseOpen} title="Add Expense" onClose={() => setExpenseOpen(false)} onSubmit={() => void expenseMutation.mutate()} submitLabel={expenseMutation.isPending ? "Saving..." : "Save expense"} disabled={expenseMutation.isPending}>
        <Field label="Title" value={expenseForm.title} onChangeText={(value) => setExpenseForm((current) => ({ ...current, title: value }))} />
        <Field label="Total amount" value={expenseForm.totalInput} onChangeText={(value) => setExpenseForm((current) => ({ ...current, totalInput: value }))} keyboardType="decimal-pad" />
        <Text style={styles.fieldLabel}>Paid by</Text>
        <View style={styles.rowGap}>
          {selectedMembers.map((member: BillSplitMember) => (
            <ChipButton
              key={member.userId}
              label={member.name}
              active={(expenseForm.paidByUserId || activeUserId) === member.userId}
              onPress={() => setExpenseForm((current) => ({ ...current, paidByUserId: member.userId }))}
            />
          ))}
        </View>
        <Field label="Date" value={expenseForm.expenseDate} onChangeText={(value) => setExpenseForm((current) => ({ ...current, expenseDate: value }))} />
        <Field label="Category" value={expenseForm.category} onChangeText={(value) => setExpenseForm((current) => ({ ...current, category: value }))} />
        <View style={styles.rowGap}>
          <ChipButton label="Equal split" active={expenseForm.splitType === "equal"} onPress={() => setExpenseForm((current) => ({ ...current, splitType: "equal" }))} />
          <ChipButton label="Exact split" active={expenseForm.splitType === "exact"} onPress={() => setExpenseForm((current) => ({ ...current, splitType: "exact" }))} />
        </View>
        {expenseForm.splitType === "exact"
          ? selectedMembers.map((member: BillSplitMember) => (
              <Field
                key={member.userId}
                label={`Share for ${member.name}`}
                value={exactShares[member.userId] || ""}
                onChangeText={(value) => setExactShares((current) => ({ ...current, [member.userId]: value }))}
                keyboardType="decimal-pad"
              />
            ))
          : null}
      </SimpleModal>

      <SimpleModal visible={settlementOpen} title="Record Settlement" onClose={() => setSettlementOpen(false)} onSubmit={() => void settlementMutation.mutate()} submitLabel={settlementMutation.isPending ? "Saving..." : "Save settlement"} disabled={settlementMutation.isPending}>
        <Text style={styles.fieldLabel}>Payer</Text>
        <View style={styles.rowGap}>
          {selectedMembers.map((member: BillSplitMember) => (
            <ChipButton
              key={`payer-${member.userId}`}
              label={member.name}
              active={settlementForm.payerId === member.userId}
              onPress={() => setSettlementForm((current) => ({ ...current, payerId: member.userId }))}
            />
          ))}
        </View>
        <Text style={styles.fieldLabel}>Payee</Text>
        <View style={styles.rowGap}>
          {selectedMembers.map((member: BillSplitMember) => (
            <ChipButton
              key={`payee-${member.userId}`}
              label={member.name}
              active={settlementForm.payeeId === member.userId}
              onPress={() => setSettlementForm((current) => ({ ...current, payeeId: member.userId }))}
            />
          ))}
        </View>
        <Field label="Amount" value={settlementForm.amountInput} onChangeText={(value) => setSettlementForm((current) => ({ ...current, amountInput: value }))} keyboardType="decimal-pad" />
        <Field label="Date" value={settlementForm.settlementDate} onChangeText={(value) => setSettlementForm((current) => ({ ...current, settlementDate: value }))} />
        <Field label="Notes" value={settlementForm.notes} onChangeText={(value) => setSettlementForm((current) => ({ ...current, notes: value }))} />
      </SimpleModal>
    </SafeAreaView>
  );
}

function Badge() {
  return <SplitSquareVertical color="#2563eb" size={22} />;
}

function minorToInput(value: bigint) {
  const whole = value / 100n;
  const fraction = value % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(2, "0")}`;
}

function buildEqualShares(members: BillSplitMember[], totalMinor: bigint) {
  const memberCount = BigInt(members.length);
  const base = totalMinor / memberCount;
  const remainder = Number(totalMinor % memberCount);
  return members.map((member, index) => ({
    participantUserId: member.userId,
    shareInput: minorToInput(base + (index < remainder ? 1n : 0n)),
  }));
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
      {loading ? <ActivityIndicator color="#2563eb" /> : null}
      <Text style={styles.centerTitle}>{title}</Text>
      <Text style={styles.centerText}>{text}</Text>
      {actionLabel && onPress ? <Pressable onPress={onPress} style={styles.darkButton}><Text style={styles.darkButtonText}>{actionLabel}</Text></Pressable> : null}
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

function ChipButton({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.chipButton, active && styles.chipButtonActive]}>
      <Text style={[styles.chipButtonText, active && styles.chipButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StatBlock({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 6 }}>
      <Text style={[styles.statValue, positive && styles.positive, negative && styles.negative]}>{value}</Text>
      <Text style={styles.groupMeta}>{label}</Text>
    </View>
  );
}

function SimpleModal({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel,
  disabled,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
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
          <Pressable disabled={disabled} onPress={onSubmit} style={[styles.darkButton, disabled && styles.buttonDisabled]}>
            <Text style={styles.darkButtonText}>{submitLabel}</Text>
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
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "decimal-pad";
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.fieldInput} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  headerButton: { width: 32, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: "#111827", fontSize: 26, fontWeight: "500" },
  balanceCard: { margin: 14, borderRadius: 24, backgroundColor: "#eaf1ff", padding: 24, alignItems: "center", gap: 8 },
  balanceLabel: { color: "#475467", fontSize: 16 },
  balanceValue: { fontSize: 38, fontWeight: "800" },
  balanceHint: { color: "#667085", fontSize: 16 },
  tabsRow: { marginHorizontal: 14, borderRadius: 20, backgroundColor: "#e9eaf1", padding: 4, flexDirection: "row", gap: 6 },
  tabButton: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tabButtonActive: { backgroundColor: "#ffffff" },
  tabButtonText: { color: "#111827", fontSize: 15, fontWeight: "700" },
  tabButtonTextActive: { color: "#111827" },
  inviteBanner: { margin: 14, marginBottom: 0, borderRadius: 20, backgroundColor: "#eef2ff", padding: 16, gap: 10 },
  inviteBannerTitle: { color: "#1d4ed8", fontSize: 18, fontWeight: "800" },
  inviteBannerText: { color: "#1d4ed8", fontSize: 14, lineHeight: 20 },
  content: { padding: 14, gap: 16, paddingBottom: 36 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  darkButton: { minHeight: 50, borderRadius: 16, backgroundColor: "#05051a", paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonDisabled: { opacity: 0.55 },
  darkButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  centered: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 30 },
  centerTitle: { color: "#111827", fontSize: 20, fontWeight: "800", textAlign: "center" },
  centerText: { color: "#667085", fontSize: 15, lineHeight: 22, textAlign: "center" },
  groupCard: { borderRadius: 24, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ffffff", padding: 18, gap: 14 },
  groupCardActive: { borderColor: "#111827" },
  groupCardHeader: { flexDirection: "row", gap: 14 },
  groupAvatar: { width: 82, height: 82, borderRadius: 28, backgroundColor: "#eef0f6", alignItems: "center", justifyContent: "center" },
  groupAvatarText: { color: "#111827", fontSize: 24, fontWeight: "800" },
  groupTitle: { color: "#111827", fontSize: 17, fontWeight: "800" },
  groupMeta: { color: "#667085", fontSize: 14, lineHeight: 20, marginTop: 4 },
  divider: { height: 1, backgroundColor: "#e5e7eb" },
  groupStats: { flexDirection: "row", justifyContent: "space-around" },
  statValue: { color: "#111827", fontSize: 18, fontWeight: "800" },
  positive: { color: "#16a34a" },
  negative: { color: "#ef4444" },
  rowGap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chipButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d7dbe3", alignItems: "center", justifyContent: "center" },
  chipButtonActive: { backgroundColor: "#05051a", borderColor: "#05051a" },
  chipButtonText: { color: "#111827", fontSize: 14, fontWeight: "700" },
  chipButtonTextActive: { color: "#ffffff" },
  activityCard: { borderRadius: 22, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ffffff", padding: 16, flexDirection: "row", gap: 14, alignItems: "center" },
  activityIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#dbeafe", alignItems: "center", justifyContent: "center" },
  activityTitle: { color: "#111827", fontSize: 17, fontWeight: "700" },
  activityMeta: { color: "#667085", fontSize: 14, marginTop: 4 },
  friendCard: { borderRadius: 22, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ffffff", padding: 16, flexDirection: "row", gap: 12, alignItems: "center" },
  friendIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#eef2f6", alignItems: "center", justifyContent: "center" },
  modalSafe: { flex: 1, backgroundColor: "#ffffff" },
  modalContent: { padding: 18, gap: 14, paddingBottom: 36 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: "#111827", fontSize: 24, fontWeight: "800" },
  modalClose: { color: "#667085", fontSize: 16, fontWeight: "600" },
  fieldLabel: { color: "#111827", fontSize: 14, fontWeight: "700" },
  fieldInput: { minHeight: 52, borderRadius: 16, backgroundColor: "#f3f4f6", paddingHorizontal: 14, color: "#111827", fontSize: 15 },
  selectableRow: { borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ffffff", padding: 14 },
  selectableRowActive: { borderColor: "#111827" },
});
