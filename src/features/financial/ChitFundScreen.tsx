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
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Crown,
  Plus,
  Users,
} from "lucide-react-native";

import { useAuth } from "../../lib/AuthContext";
import {
  createChitGroup,
  inviteToChitGroup,
  listAcceptedConnections,
  listChitGroupDetails,
  listChitWorkspace,
  recordChitContribution,
  recordChitRepayment,
  requestChitLoan,
  respondToChitInvitation,
  reviewChitLoan,
  updateChitGroupStatus,
  updateChitMemberRole,
} from "./repository";
import type { AcceptedConnection, ChitContribution, ChitGroup, ChitInvitation, ChitLoan } from "./types";
import { calculateChitTotals, formatMinor, toMinorUnits } from "./utils";

type ChitTab = "dashboard" | "members" | "history" | "loans";

const groupDefaults = () => ({
  name: "",
  description: "",
  durationCycles: "24",
  contributionFrequency: "monthly",
  contributionAmountInput: "",
  interestRatePercent: "12",
  startDate: new Date().toISOString().slice(0, 10),
  memberLimit: "12",
  status: "upcoming" as "upcoming" | "active" | "completed",
});

export default function ChitFundScreen() {
  const { user, initialized } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ChitTab>("dashboard");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [contributionOpen, setContributionOpen] = useState(false);
  const [loanOpen, setLoanOpen] = useState(false);
  const [repaymentTarget, setRepaymentTarget] = useState<ChitLoan | null>(null);
  const [groupForm, setGroupForm] = useState(groupDefaults());
  const [inviteeId, setInviteeId] = useState("");
  const [inviteRole, setInviteRole] = useState<"accountant" | "member">("member");
  const [contributionAmount, setContributionAmount] = useState("");
  const [contributionMemberId, setContributionMemberId] = useState("");
  const [contributionCycle, setContributionCycle] = useState("1");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanPurpose, setLoanPurpose] = useState("");
  const [loanNextPaymentDate, setLoanNextPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [repaymentAmount, setRepaymentAmount] = useState("");

  const workspaceQuery = useQuery({
    queryKey: ["chit-workspace", user && "id" in user ? user.id : "guest"],
    queryFn: () => listChitWorkspace(user),
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

  useEffect(() => {
    if (!selectedGroupId && groups.length) setSelectedGroupId(groups[0].id);
  }, [groups, selectedGroupId]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const groupDetailsQuery = useQuery({
    queryKey: ["chit-group-details", selectedGroupId],
    queryFn: () => listChitGroupDetails(selectedGroupId!),
    enabled: Boolean(selectedGroupId),
  });

  const groupMembers = members.filter((member) => member.groupId === selectedGroupId);
  const groupInvitations = invitations.filter(
    (invitation) => invitation.groupId === selectedGroupId,
  );
  const myInvitation = groupInvitations.find(
    (invitation) =>
      invitation.inviteeId === (user && "id" in user ? user.id : "") &&
      invitation.status === "pending",
  );
  const myMember = groupMembers.find(
    (member) => member.userId === (user && "id" in user ? user.id : ""),
  );
  const details = groupDetailsQuery.data;

  useEffect(() => {
    if (!inviteOpen || inviteeId) return;
    const firstConnection = connectionsQuery.data?.[0];
    if (firstConnection) setInviteeId(firstConnection.id);
  }, [connectionsQuery.data, inviteOpen, inviteeId]);

  const totals = useMemo(
    () =>
      calculateChitTotals({
        contributions: details?.contributions ?? [],
        loans: details?.loans ?? [],
        repayments: details?.repayments ?? [],
        memberCount: groupMembers.length,
        durationCycles: selectedGroup?.durationCycles ?? 1,
      }),
    [details, groupMembers.length, selectedGroup?.durationCycles],
  );

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["chit-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["chit-group-details"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      createChitGroup(user, {
        name: groupForm.name,
        description: groupForm.description,
        durationCycles: Number(groupForm.durationCycles),
        contributionFrequency: groupForm.contributionFrequency,
        contributionAmountInput: groupForm.contributionAmountInput,
        interestRatePercent: groupForm.interestRatePercent,
        startDate: groupForm.startDate,
        memberLimit: Number(groupForm.memberLimit),
        status: groupForm.status,
      }),
    onSuccess: async (group) => {
      setCreateOpen(false);
      setGroupForm(groupDefaults());
      setSelectedGroupId(group.id);
      await invalidate();
    },
    onError: (error) =>
      Alert.alert("Could not create group", error instanceof Error ? error.message : "Please try again."),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroupId || !inviteeId) throw new Error("Choose a connection first.");
      return inviteToChitGroup(selectedGroupId, inviteeId, inviteRole);
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
    mutationFn: async (input: { invitation: ChitInvitation; response: "accepted" | "rejected" }) =>
      respondToChitInvitation(user, input.invitation, input.response),
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert("Could not update invitation", error instanceof Error ? error.message : "Please try again."),
  });

  const contributionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroupId || !contributionMemberId || toMinorUnits(contributionAmount) <= 0n) {
        throw new Error("Choose a member and enter a valid amount.");
      }
      return recordChitContribution({
        groupId: selectedGroupId,
        memberId: contributionMemberId,
        amountInput: contributionAmount,
        cycleNumber: Number(contributionCycle || "1"),
        contributionDate: new Date().toISOString().slice(0, 10),
        notes: "",
      });
    },
    onSuccess: async () => {
      setContributionOpen(false);
      setContributionAmount("");
      setContributionMemberId("");
      setContributionCycle("1");
      await invalidate();
    },
    onError: (error) =>
      Alert.alert("Could not record contribution", error instanceof Error ? error.message : "Please try again."),
  });

  const loanMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroupId || toMinorUnits(loanAmount) <= 0n || !loanPurpose.trim()) {
        throw new Error("Enter a valid amount and purpose.");
      }
      const interestBps = selectedGroup?.interestBps ?? Math.round(Number(groupForm.interestRatePercent || "0") * 100);
      return requestChitLoan({
        groupId: selectedGroupId,
        amountInput: loanAmount,
        purpose: loanPurpose,
        interestBps,
        nextPaymentDate: loanNextPaymentDate,
      });
    },
    onSuccess: async () => {
      setLoanOpen(false);
      setLoanAmount("");
      setLoanPurpose("");
      await invalidate();
    },
    onError: (error) =>
      Alert.alert("Could not request loan", error instanceof Error ? error.message : "Please try again."),
  });

  const loanReviewMutation = useMutation({
    mutationFn: async (input: { loanId: string; status: "approved" | "rejected" }) => {
      if (!selectedGroupId) throw new Error("Choose a group first.");
      return reviewChitLoan(input.loanId, selectedGroupId, input.status);
    },
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert("Could not review loan", error instanceof Error ? error.message : "Please try again."),
  });

  const repaymentMutation = useMutation({
    mutationFn: async () => {
      if (!repaymentTarget || !selectedGroupId || toMinorUnits(repaymentAmount) <= 0n) {
        throw new Error("Enter a valid repayment amount.");
      }
      return recordChitRepayment({
        groupId: selectedGroupId,
        loanId: repaymentTarget.id,
        payerId: repaymentTarget.requesterId,
        amountInput: repaymentAmount,
        paymentDate: new Date().toISOString().slice(0, 10),
        notes: "",
      });
    },
    onSuccess: async () => {
      setRepaymentTarget(null);
      setRepaymentAmount("");
      await invalidate();
    },
    onError: (error) =>
      Alert.alert("Could not record repayment", error instanceof Error ? error.message : "Please try again."),
  });

  const roleMutation = useMutation({
    mutationFn: async (input: { userId: string; role: "manager" | "accountant" | "member" }) => {
      if (!selectedGroupId) throw new Error("Choose a group first.");
      return updateChitMemberRole(selectedGroupId, input.userId, input.role);
    },
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert("Could not update role", error instanceof Error ? error.message : "Please try again."),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: "upcoming" | "active" | "completed") => {
      if (!selectedGroupId) throw new Error("Choose a group first.");
      return updateChitGroupStatus(selectedGroupId, status);
    },
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert("Could not update status", error instanceof Error ? error.message : "Please try again."),
  });

  const isManager = myMember?.role === "manager" || myMember?.role === "accountant";

  if (!initialized || workspaceQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <CenteredState title="Loading Chit Fund" text="Fetching your groups and invitations..." loading />
      </SafeAreaView>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <CenteredState
          title="Could not load Chit Fund"
          text={workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "Please try again."}
          actionLabel="Retry"
          onPress={() => void workspaceQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const selectableGroups = [...groups].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <ArrowLeft color="#111827" size={24} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Chit{"\n"}Fund</Text>
        </View>
        <Pressable style={styles.headerButton}>
          <Bell color="#111827" size={22} />
        </Pressable>
        <Pressable onPress={() => setCreateOpen(true)} style={styles.createButton}>
          <Plus color="#111827" size={22} />
          <Text style={styles.createButtonText}>Create Group</Text>
        </Pressable>
      </View>

      {selectableGroups.length === 0 ? (
        <ScrollView contentContainerStyle={styles.content}>
          <CenteredState
            title="No chit groups yet"
            text="Create your first group and then invite accepted connections."
            actionLabel="Create group"
            onPress={() => setCreateOpen(true)}
          />
        </ScrollView>
      ) : (
        <>
          <Pressable onPress={() => setSelectorOpen((current) => !current)} style={styles.selector}>
            <Text style={styles.selectorLabel}>{selectedGroup?.name || "Choose group"}</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{selectedGroup?.status || "upcoming"}</Text>
            </View>
            <ChevronDown color="#98a2b3" size={20} />
          </Pressable>

          {selectorOpen ? (
            <View style={styles.selectorMenu}>
              {selectableGroups.map((group) => (
                <Pressable
                  key={group.id}
                  onPress={() => {
                    setSelectedGroupId(group.id);
                    setSelectorOpen(false);
                  }}
                  style={styles.selectorItem}
                >
                  <Text style={styles.selectorItemText}>{group.name}</Text>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{group.status}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {myInvitation ? (
            <View style={styles.inviteBanner}>
              <Text style={styles.inviteBannerTitle}>Invitation pending</Text>
              <Text style={styles.inviteBannerText}>
                Accept this group invitation to join its dashboard, members, history, and loans.
              </Text>
              <View style={styles.inlineActions}>
                <InlineButton
                  label="Accept"
                  onPress={() =>
                    void invitationMutation.mutate({ invitation: myInvitation, response: "accepted" })
                  }
                  active
                />
                <InlineButton
                  label="Reject"
                  onPress={() =>
                    void invitationMutation.mutate({ invitation: myInvitation, response: "rejected" })
                  }
                />
              </View>
            </View>
          ) : null}

          <View style={styles.tabsRow}>
            {(["dashboard", "members", "history", "loans"] as ChitTab[]).map((item) => (
              <TabPill key={item} label={capitalize(item)} active={tab === item} onPress={() => setTab(item)} />
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {groupDetailsQuery.isLoading ? (
              <CenteredState title="Loading group" text="Fetching the selected group details..." loading />
            ) : groupDetailsQuery.isError ? (
              <CenteredState
                title="Could not load group"
                text={groupDetailsQuery.error instanceof Error ? groupDetailsQuery.error.message : "Please try again."}
                actionLabel="Retry"
                onPress={() => void groupDetailsQuery.refetch()}
              />
            ) : selectedGroup ? (
              <>
                {tab === "dashboard" ? (
                  <>
                    <View style={styles.heroCard}>
                      <View style={styles.heroTop}>
                        <Text style={styles.heroTitle}>{selectedGroup.name}</Text>
                        <View style={styles.rolePill}>
                          <Users color="#ffffff" size={18} />
                          <Text style={styles.rolePillText}>{myMember?.role || "invited"}</Text>
                        </View>
                      </View>
                      <Text style={styles.heroMeta}>
                        {groupMembers.length} members · {selectedGroup.durationCycles} cycle program
                      </Text>

                      <View style={styles.heroStats}>
                        <StatBlock label="Total Fund" value={formatMinor(totals.totalContributions)} light />
                        <StatBlock label="Available" value={formatMinor(totals.availableFunds)} light />
                      </View>

                      <View style={styles.progressRow}>
                        <Text style={styles.progressLabel}>Progress</Text>
                        <Text style={styles.progressLabel}>
                          {totals.currentCycle}/{selectedGroup.durationCycles} cycles
                        </Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.max(totals.progressRatio * 100, 6)}%` }]} />
                      </View>
                    </View>

                    <View style={styles.twoColRow}>
                      <SummaryCard
                        icon={<CalendarDays color="#2563eb" size={20} />}
                        label="Monthly Amount"
                        value={formatMinor(selectedGroup.contributionAmountMinor)}
                      />
                      <SummaryCard
                        icon={<CircleAlert color="#16a34a" size={20} />}
                        label="Interest Rate"
                        value={`${(selectedGroup.interestBps / 100).toFixed(2).replace(/\.00$/, "")}% p.a.`}
                      />
                    </View>

                    <Section title="Recent Activity">
                      {details?.activities.length ? (
                        details.activities.slice(0, 6).map((item) => (
                          <ActivityRow key={item.id} title={item.activityType.replace(/_/g, " ")} detail={item.detail} amount={item.amountMinor > 0n ? formatMinor(item.amountMinor) : ""} />
                        ))
                      ) : (
                        <EmptyInline text="No activity recorded yet." />
                      )}
                    </Section>

                    <View style={styles.inlineActions}>
                      <InlineButton label="Record contribution" onPress={() => setContributionOpen(true)} active />
                      <InlineButton label="Request loan" onPress={() => setLoanOpen(true)} />
                      {isManager ? (
                        <InlineButton label="Invite member" onPress={() => setInviteOpen(true)} />
                      ) : null}
                    </View>
                  </>
                ) : null}

                {tab === "members" ? (
                  <>
                    <Section title={`Group Members (${groupMembers.length})`}>
                      {groupMembers.map((member) => (
                        <View key={member.userId} style={styles.memberCard}>
                          <View style={styles.memberAvatar}>
                            <Text style={styles.memberAvatarText}>{member.avatarLabel}</Text>
                          </View>
                          <View style={styles.memberCopy}>
                            <View style={styles.memberNameRow}>
                              <Text style={styles.memberName}>{member.name}</Text>
                              {member.role === "manager" ? <Crown color="#98a2b3" size={16} /> : null}
                              <View style={styles.roleBadgeBlue}>
                                <Text style={styles.roleBadgeBlueText}>{member.role}</Text>
                              </View>
                            </View>
                            <Text style={styles.memberMeta}>Contribution status: {member.contributionStatus}</Text>
                            {isManager && member.userId !== myMember?.userId ? (
                              <View style={styles.inlineActions}>
                                <InlineButton label="Member" onPress={() => void roleMutation.mutate({ userId: member.userId, role: "member" })} />
                                <InlineButton label="Accountant" onPress={() => void roleMutation.mutate({ userId: member.userId, role: "accountant" })} />
                              </View>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </Section>

                    <Section title="Pending invitations">
                      {groupInvitations.filter((item) => item.status === "pending").length ? (
                        groupInvitations
                          .filter((item) => item.status === "pending")
                          .map((item) => {
                            const profile = connectionsQuery.data?.find((connection) => connection.id === item.inviteeId);
                            return (
                              <View key={item.id} style={styles.invitationRow}>
                                <Text style={styles.memberName}>{profile?.name || item.inviteeId.slice(0, 8)}</Text>
                                <View style={styles.pendingBadge}>
                                  <Text style={styles.pendingBadgeText}>pending</Text>
                                </View>
                              </View>
                            );
                          })
                      ) : (
                        <EmptyInline text="No pending invitations for this group." />
                      )}
                    </Section>
                  </>
                ) : null}

                {tab === "history" ? (
                  <Section title="Transaction History">
                    {details?.activities.length ? (
                      details.activities.map((item) => (
                        <HistoryCard key={item.id} title={item.activityType.replace(/_/g, " ")} date={item.createdAt.slice(0, 10)} detail={item.detail} amount={item.amountMinor > 0n ? formatMinor(item.amountMinor) : ""} status={item.status || "recorded"} />
                      ))
                    ) : (
                      <EmptyInline text="No history items yet." />
                    )}
                  </Section>
                ) : null}

                {tab === "loans" ? (
                  <>
                    <View style={styles.loanSummaryCard}>
                      <View style={styles.loanSummaryHead}>
                        <CircleAlert color="#ea580c" size={24} />
                        <View>
                          <Text style={styles.loanSummaryTitle}>Loan Information</Text>
                          <Text style={styles.loanSummaryText}>
                            Interest rate: {(selectedGroup.interestBps / 100).toFixed(2).replace(/\.00$/, "")}% per annum
                          </Text>
                        </View>
                      </View>
                      <View style={styles.loanStatsRow}>
                        <StatBlock label="Total Loans Outstanding" value={formatMinor(totals.outstandingLoans)} warning />
                        <StatBlock label="Available for Loans" value={formatMinor(totals.availableFunds > 0n ? totals.availableFunds : 0n)} warning />
                      </View>
                    </View>

                    <Section title="Active Loans">
                      {details?.loans.length ? (
                        details.loans.map((loan) => (
                          <View key={loan.id} style={styles.memberCard}>
                            <View style={styles.memberAvatar}>
                              <Text style={styles.memberAvatarText}>{loan.requesterName.slice(0, 2).toUpperCase()}</Text>
                            </View>
                            <View style={styles.memberCopy}>
                              <View style={styles.loanHeaderRow}>
                                <Text style={styles.memberName}>{loan.requesterName}</Text>
                                <Text style={styles.loanAmount}>{formatMinor(loan.amountMinor)}</Text>
                              </View>
                              <Text style={styles.memberMeta}>
                                {loan.purpose} · {loan.requestedAt.slice(0, 10)}
                              </Text>
                              <View style={styles.inlineActions}>
                                <View style={styles.loanStatusBadge}>
                                  <Text style={styles.loanStatusBadgeText}>{loan.status}</Text>
                                </View>
                                {loan.status === "pending" && isManager ? (
                                  <>
                                    <InlineButton label="Approve" onPress={() => void loanReviewMutation.mutate({ loanId: loan.id, status: "approved" })} active />
                                    <InlineButton label="Reject" onPress={() => void loanReviewMutation.mutate({ loanId: loan.id, status: "rejected" })} />
                                  </>
                                ) : null}
                                {loan.status === "approved" ? (
                                  <InlineButton label="Record repayment" onPress={() => setRepaymentTarget(loan)} />
                                ) : null}
                              </View>
                            </View>
                          </View>
                        ))
                      ) : (
                        <EmptyInline text="No loan requests yet." />
                      )}
                    </Section>

                    <PrimaryAction label="Request New Loan" onPress={() => setLoanOpen(true)} />
                  </>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </>
      )}

      <SimpleFormModal
        visible={createOpen}
        title="Create Chit Group"
        onClose={() => setCreateOpen(false)}
        onSubmit={() => void createMutation.mutate()}
        submitLabel={createMutation.isPending ? "Creating..." : "Create group"}
        disabled={createMutation.isPending}
      >
        <Field label="Group name" value={groupForm.name} onChangeText={(value) => setGroupForm((current) => ({ ...current, name: value }))} />
        <Field label="Description" value={groupForm.description} onChangeText={(value) => setGroupForm((current) => ({ ...current, description: value }))} multiline />
        <Field label="Duration / cycles" value={groupForm.durationCycles} onChangeText={(value) => setGroupForm((current) => ({ ...current, durationCycles: value }))} keyboardType="number-pad" />
        <Field label="Contribution frequency" value={groupForm.contributionFrequency} onChangeText={(value) => setGroupForm((current) => ({ ...current, contributionFrequency: value }))} />
        <Field label="Contribution amount" value={groupForm.contributionAmountInput} onChangeText={(value) => setGroupForm((current) => ({ ...current, contributionAmountInput: value }))} keyboardType="decimal-pad" />
        <Field label="Interest rate %" value={groupForm.interestRatePercent} onChangeText={(value) => setGroupForm((current) => ({ ...current, interestRatePercent: value }))} keyboardType="decimal-pad" />
        <Field label="Start date" value={groupForm.startDate} onChangeText={(value) => setGroupForm((current) => ({ ...current, startDate: value }))} />
        <Field label="Member limit" value={groupForm.memberLimit} onChangeText={(value) => setGroupForm((current) => ({ ...current, memberLimit: value }))} keyboardType="number-pad" />
      </SimpleFormModal>

      <SimpleFormModal
        visible={inviteOpen}
        title="Invite accepted connection"
        onClose={() => setInviteOpen(false)}
        onSubmit={() => void inviteMutation.mutate()}
        submitLabel={inviteMutation.isPending ? "Sending..." : "Send invitation"}
        disabled={inviteMutation.isPending}
      >
        {(connectionsQuery.data ?? []).map((connection: AcceptedConnection) => (
          <Pressable key={connection.id} onPress={() => setInviteeId(connection.id)} style={[styles.selectableRow, inviteeId === connection.id && styles.selectableRowActive]}>
            <Text style={styles.memberName}>{connection.name}</Text>
            <Text style={styles.memberMeta}>@{connection.username}</Text>
          </Pressable>
        ))}
        <View style={styles.inlineActions}>
          <InlineButton label="Member" onPress={() => setInviteRole("member")} active={inviteRole === "member"} />
          <InlineButton label="Accountant" onPress={() => setInviteRole("accountant")} active={inviteRole === "accountant"} />
        </View>
      </SimpleFormModal>

      <SimpleFormModal
        visible={contributionOpen}
        title="Record contribution"
        onClose={() => setContributionOpen(false)}
        onSubmit={() => void contributionMutation.mutate()}
        submitLabel={contributionMutation.isPending ? "Saving..." : "Save contribution"}
        disabled={contributionMutation.isPending}
      >
        {groupMembers.map((member) => (
          <Pressable key={member.userId} onPress={() => setContributionMemberId(member.userId)} style={[styles.selectableRow, contributionMemberId === member.userId && styles.selectableRowActive]}>
            <Text style={styles.memberName}>{member.name}</Text>
            <Text style={styles.memberMeta}>{member.role}</Text>
          </Pressable>
        ))}
        <Field label="Amount" value={contributionAmount} onChangeText={setContributionAmount} keyboardType="decimal-pad" />
        <Field label="Cycle number" value={contributionCycle} onChangeText={setContributionCycle} keyboardType="number-pad" />
      </SimpleFormModal>

      <SimpleFormModal
        visible={loanOpen}
        title="Request loan"
        onClose={() => setLoanOpen(false)}
        onSubmit={() => void loanMutation.mutate()}
        submitLabel={loanMutation.isPending ? "Submitting..." : "Submit request"}
        disabled={loanMutation.isPending}
      >
        <Field label="Amount required" value={loanAmount} onChangeText={setLoanAmount} keyboardType="decimal-pad" />
        <Field label="Purpose" value={loanPurpose} onChangeText={setLoanPurpose} multiline />
        <Field label="Next payment date" value={loanNextPaymentDate} onChangeText={setLoanNextPaymentDate} />
      </SimpleFormModal>

      <SimpleFormModal
        visible={Boolean(repaymentTarget)}
        title="Record repayment"
        onClose={() => setRepaymentTarget(null)}
        onSubmit={() => void repaymentMutation.mutate()}
        submitLabel={repaymentMutation.isPending ? "Saving..." : "Save repayment"}
        disabled={repaymentMutation.isPending}
      >
        <Field label="Amount" value={repaymentAmount} onChangeText={setRepaymentAmount} keyboardType="decimal-pad" />
      </SimpleFormModal>
    </SafeAreaView>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function TabPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabPill, active && styles.tabPillActive]}>
      <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function CenteredState({
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
      {loading ? <ActivityIndicator color="#16a34a" /> : null}
      <Text style={styles.centerTitle}>{title}</Text>
      <Text style={styles.centerText}>{text}</Text>
      {actionLabel && onPress ? <PrimaryAction label={actionLabel} onPress={onPress} /> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StatBlock({
  label,
  value,
  light,
  warning,
}: {
  label: string;
  value: string;
  light?: boolean;
  warning?: boolean;
}) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statLabel, light && styles.statLabelLight, warning && styles.warningText]}>{label}</Text>
      <Text style={[styles.statValue, light && styles.statValueLight, warning && styles.warningText]}>{value}</Text>
    </View>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryCard}>
      {icon}
      <Text style={styles.summaryCardLabel}>{label}</Text>
      <Text style={styles.summaryCardValue}>{value}</Text>
    </View>
  );
}

function InlineButton({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.inlineButton, active && styles.inlineButtonActive]}>
      <Text style={[styles.inlineButtonText, active && styles.inlineButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.primaryAction, disabled && styles.buttonDisabled]}>
      <Text style={styles.primaryActionText}>{label}</Text>
    </Pressable>
  );
}

function EmptyInline({ text }: { text: string }) {
  return <Text style={styles.emptyInline}>{text}</Text>;
}

function ActivityRow({
  title,
  detail,
  amount,
}: {
  title: string;
  detail: string;
  amount: string;
}) {
  return (
    <View style={styles.activityRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.memberName}>{title}</Text>
        <Text style={styles.memberMeta}>{detail}</Text>
      </View>
      {amount ? <Text style={styles.loanAmount}>{amount}</Text> : null}
    </View>
  );
}

function HistoryCard({
  title,
  date,
  detail,
  amount,
  status,
}: {
  title: string;
  date: string;
  detail: string;
  amount: string;
  status: string;
}) {
  return (
    <View style={styles.historyCard}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.memberName}>{title}</Text>
        <Text style={styles.memberMeta}>
          {detail} · {date}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 8 }}>
        {amount ? <Text style={styles.loanAmount}>{amount}</Text> : null}
        <View style={styles.roleBadgeBlue}>
          <Text style={styles.roleBadgeBlueText}>{status}</Text>
        </View>
      </View>
    </View>
  );
}

function SimpleFormModal({
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
          <PrimaryAction label={submitLabel} onPress={onSubmit} disabled={disabled} />
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
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  headerButton: { width: 32, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  headerTitle: { color: "#111827", fontSize: 28, fontWeight: "500", lineHeight: 40 },
  createButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d6dbe3",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  createButtonText: { color: "#111827", fontSize: 15, fontWeight: "700" },
  selector: {
    marginHorizontal: 10,
    marginTop: 12,
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: "#f0f2f6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  selectorLabel: { flex: 1, color: "#111827", fontSize: 16 },
  statusPill: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusPillText: { color: "#15803d", fontSize: 13, fontWeight: "800" },
  selectorMenu: {
    marginHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  selectorItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f6",
  },
  selectorItemText: { flex: 1, color: "#111827", fontSize: 16 },
  inviteBanner: {
    marginHorizontal: 10,
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    padding: 16,
    gap: 10,
  },
  inviteBannerTitle: { color: "#9a3412", fontSize: 18, fontWeight: "800" },
  inviteBannerText: { color: "#9a3412", fontSize: 14, lineHeight: 20 },
  tabsRow: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: "#e9eaf1",
    padding: 4,
    marginHorizontal: 10,
    flexDirection: "row",
    gap: 6,
  },
  tabPill: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tabPillActive: { backgroundColor: "#ffffff" },
  tabPillText: { color: "#111827", fontSize: 15, fontWeight: "700" },
  tabPillTextActive: { color: "#111827" },
  content: { padding: 10, gap: 16, paddingBottom: 36 },
  centered: { minHeight: 320, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 28 },
  centerTitle: { color: "#111827", fontSize: 22, fontWeight: "800", textAlign: "center" },
  centerText: { color: "#667085", fontSize: 15, lineHeight: 22, textAlign: "center" },
  heroCard: {
    borderRadius: 26,
    backgroundColor: "#08bf43",
    padding: 22,
    gap: 16,
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  heroTitle: { color: "#ffffff", fontSize: 24, fontWeight: "800", flex: 1 },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rolePillText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  heroMeta: { color: "#ecfdf3", fontSize: 16, lineHeight: 24 },
  heroStats: { flexDirection: "row", gap: 16 },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  progressTrack: { height: 14, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#0f172a" },
  twoColRow: { flexDirection: "row", gap: 14 },
  summaryCard: {
    flex: 1,
    minHeight: 150,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12,
  },
  summaryCardLabel: { color: "#475467", fontSize: 15 },
  summaryCardValue: { color: "#111827", fontSize: 22, fontWeight: "800" },
  section: { gap: 12 },
  sectionTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  inlineButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe3",
    alignItems: "center",
    justifyContent: "center",
  },
  inlineButtonActive: { backgroundColor: "#111827", borderColor: "#111827" },
  inlineButtonText: { color: "#111827", fontSize: 14, fontWeight: "700" },
  inlineButtonTextActive: { color: "#ffffff" },
  statBlock: { flex: 1, gap: 8 },
  statLabel: { color: "#111827", fontSize: 15, fontWeight: "500" },
  statLabelLight: { color: "#ecfdf3" },
  statValue: { color: "#111827", fontSize: 22, fontWeight: "800" },
  statValueLight: { color: "#ffffff" },
  warningText: { color: "#c2410c" },
  activityRow: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  memberCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 14,
    flexDirection: "row",
    gap: 14,
  },
  memberAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: { color: "#111827", fontSize: 20, fontWeight: "800" },
  memberCopy: { flex: 1, gap: 8 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  memberName: { color: "#111827", fontSize: 16, fontWeight: "800" },
  memberMeta: { color: "#667085", fontSize: 14, lineHeight: 21 },
  roleBadgeBlue: {
    backgroundColor: "#dbeafe",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roleBadgeBlueText: { color: "#1d4ed8", fontSize: 13, fontWeight: "800" },
  invitationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 14,
  },
  pendingBadge: {
    backgroundColor: "#fef3c7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pendingBadgeText: { color: "#a16207", fontSize: 13, fontWeight: "800" },
  historyCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  loanSummaryCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#fdba74",
    backgroundColor: "#fff7ed",
    padding: 18,
    gap: 18,
  },
  loanSummaryHead: { flexDirection: "row", gap: 12, alignItems: "center" },
  loanSummaryTitle: { color: "#c2410c", fontSize: 18, fontWeight: "800" },
  loanSummaryText: { color: "#c2410c", fontSize: 16, marginTop: 4 },
  loanStatsRow: { flexDirection: "row", gap: 18 },
  loanHeaderRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  loanAmount: { color: "#111827", fontSize: 16, fontWeight: "800" },
  loanStatusBadge: {
    backgroundColor: "#ffedd5",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  loanStatusBadgeText: { color: "#c2410c", fontSize: 13, fontWeight: "800" },
  primaryAction: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryActionText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  buttonDisabled: { opacity: 0.55 },
  emptyInline: { color: "#667085", fontSize: 14, lineHeight: 20 },
  modalSafe: { flex: 1, backgroundColor: "#ffffff" },
  modalContent: { padding: 18, gap: 14, paddingBottom: 36 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: "#111827", fontSize: 24, fontWeight: "800" },
  modalClose: { color: "#667085", fontSize: 16, fontWeight: "600" },
  fieldWrap: { gap: 8 },
  fieldLabel: { color: "#111827", fontSize: 14, fontWeight: "700" },
  fieldInput: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 14,
    color: "#111827",
    fontSize: 15,
  },
  fieldInputMultiline: { minHeight: 120, paddingTop: 14, textAlignVertical: "top" },
  selectableRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    backgroundColor: "#ffffff",
    gap: 4,
  },
  selectableRowActive: { borderColor: "#111827", backgroundColor: "#f8fafc" },
});
