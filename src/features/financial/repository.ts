import type { User } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";
import type {
  AcceptedConnection,
  BillSplitActivity,
  BillSplitExpense,
  BillSplitExpenseParticipant,
  BillSplitGroup,
  BillSplitInvitation,
  BillSplitMember,
  BillSplitSettlement,
  ChitActivity,
  ChitContribution,
  ChitGroup,
  ChitInvitation,
  ChitLoan,
  ChitMember,
  ChitRepayment,
  ExpenseFormInput,
  ExpenseTransaction,
  FinancialAccess,
  MinorUnit,
  QaAnswer,
  QaQuestion,
  QaTopic,
} from "./types";
import { toMinorUnits, zeroMinor } from "./utils";

const initialsFor = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "?";

const FINANCIAL_QUERY_TIMEOUT_MS = 12000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toMinor = (value: unknown): MinorUnit => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.round(value));
  if (typeof value === "string") return BigInt(value);
  return zeroMinor;
};

function requireSupabaseUser(user: unknown): FinancialAccess {
  if (!supabase) {
    return { ready: false, userId: "", reason: "Supabase is not configured." };
  }
  if (!user || typeof user !== "object" || !("id" in user)) {
    return { ready: false, userId: "", reason: "You need to sign in first." };
  }
  if (
    "app_metadata" in user &&
    user.app_metadata &&
    typeof user.app_metadata === "object" &&
    "provider" in user.app_metadata &&
    user.app_metadata.provider === "demo"
  ) {
    return {
      ready: false,
      userId: "",
      reason:
        "Financial Services require a real Supabase account. Please use the email sign-up flow instead of demo mode.",
    };
  }
  return { ready: true, userId: (user as User).id };
}

async function ensureNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function withTimeout<T>(operation: string, run: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${operation} timed out. Please retry.`));
        }, FINANCIAL_QUERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function logFinancialError(operation: string, error: unknown, recordId?: string | null) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.warn("[financial]", operation, {
    message,
    recordId: recordId ?? null,
  });
}

function requireTrimmed(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function requirePositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return value;
}

function requireValidDate(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!ISO_DATE_PATTERN.test(trimmed) || Number.isNaN(Date.parse(`${trimmed}T00:00:00.000Z`))) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }
  return trimmed;
}

function requirePositiveMinor(value: string, label: string) {
  const amount = toMinorUnits(value);
  if (amount <= 0n) throw new Error(`${label} must be greater than ₹0.`);
  return amount;
}

function parseInterestBps(value: string) {
  const normalized = value.trim() || "0";
  const rate = Number(normalized);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error("Interest rate must be a number between 0 and 100.");
  }
  return Math.round(rate * 100);
}

async function loadProfiles(ids: string[]) {
  if (!supabase || ids.length === 0) return new Map<string, AcceptedConnection>();
  const uniqueIds = [...new Set(ids)];
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name")
    .in("id", uniqueIds);
  await ensureNoError(error);
  const profiles = new Map<string, AcceptedConnection>();
  (data ?? []).forEach((row: any) => {
    const name = row.display_name?.trim() || row.username || "Social 24x7 user";
    profiles.set(row.id, {
      id: row.id,
      name,
      username: row.username || row.id.slice(0, 8),
      avatarLabel: initialsFor(name),
    });
  });
  return profiles;
}

function mapExpense(row: any): ExpenseTransaction {
  return {
    id: row.id,
    ownerId: row.owner_id,
    transactionType: row.transaction_type,
    amountMinor: toMinor(row.amount_minor),
    title: row.title,
    category: row.category,
    subcategory: row.subcategory ?? "",
    entryDate: row.entry_date,
    notes: row.notes ?? "",
    paymentMethod: row.payment_method ?? "other",
    sourceLabel: row.source_label ?? "",
    recurringEnabled: Boolean(row.recurring_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChitGroup(row: any): ChitGroup {
  return {
    id: row.id,
    createdBy: row.created_by,
    managerId: row.manager_id,
    name: row.name,
    description: row.description ?? "",
    durationCycles: row.duration_cycles,
    contributionFrequency: row.contribution_frequency,
    contributionAmountMinor: toMinor(row.contribution_amount_minor),
    interestBps: row.interest_bps,
    startDate: row.start_date,
    memberLimit: row.member_limit,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChitInvitation(row: any): ChitInvitation {
  return {
    id: row.id,
    groupId: row.group_id,
    inviteeId: row.invitee_id,
    invitedBy: row.invited_by,
    proposedRole: row.proposed_role,
    status: row.status,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChitContribution(row: any): ChitContribution {
  return {
    id: row.id,
    groupId: row.group_id,
    memberId: row.member_id,
    recordedBy: row.recorded_by,
    amountMinor: toMinor(row.amount_minor),
    cycleNumber: row.cycle_number,
    contributionDate: row.contribution_date,
    status: row.status,
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChitRepayment(row: any): ChitRepayment {
  return {
    id: row.id,
    loanId: row.loan_id,
    groupId: row.group_id,
    payerId: row.payer_id,
    recordedBy: row.recorded_by,
    amountMinor: toMinor(row.amount_minor),
    paymentDate: row.payment_date,
    notes: row.notes ?? "",
    createdAt: row.created_at,
  };
}

function mapChitActivity(row: any): ChitActivity {
  return {
    id: String(row.id),
    groupId: row.group_id,
    actorId: row.actor_id,
    activityType: row.activity_type,
    entityType: row.entity_type ?? "",
    entityId: row.entity_id ?? null,
    amountMinor: toMinor(row.amount_minor),
    status: row.status ?? "",
    detail: row.detail ?? "",
    createdAt: row.created_at,
  };
}

function mapBillGroup(row: any): BillSplitGroup {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description ?? "",
    category: row.category ?? "",
    avatarLabel: row.avatar_label ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBillInvitation(row: any): BillSplitInvitation {
  return {
    id: row.id,
    groupId: row.group_id,
    inviteeId: row.invitee_id,
    invitedBy: row.invited_by,
    status: row.status,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBillExpense(row: any): BillSplitExpense {
  return {
    id: row.id,
    groupId: row.group_id,
    createdBy: row.created_by,
    paidByUserId: row.paid_by_user_id,
    title: row.title,
    totalMinor: toMinor(row.total_minor),
    expenseDate: row.expense_date,
    category: row.category ?? "Other",
    notes: row.notes ?? "",
    splitType: row.split_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapBillShare(row: any): BillSplitExpenseParticipant {
  return {
    expenseId: row.expense_id,
    participantUserId: row.participant_user_id,
    shareMinor: toMinor(row.share_minor),
  };
}

function mapBillSettlement(row: any): BillSplitSettlement {
  return {
    id: row.id,
    groupId: row.group_id,
    payerId: row.payer_id,
    payeeId: row.payee_id,
    recordedBy: row.recorded_by,
    amountMinor: toMinor(row.amount_minor),
    settlementDate: row.settlement_date,
    notes: row.notes ?? "",
    createdAt: row.created_at,
  };
}

function mapBillActivity(row: any): BillSplitActivity {
  return {
    id: String(row.id),
    groupId: row.group_id,
    actorId: row.actor_id,
    activityType: row.activity_type,
    entityType: row.entity_type ?? "",
    entityId: row.entity_id ?? null,
    amountMinor: toMinor(row.amount_minor),
    detail: row.detail ?? "",
    createdAt: row.created_at,
  };
}

export async function listAcceptedConnections(user: unknown) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  const { data, error } = await supabase!
    .from("connection_requests")
    .select("requester_id,recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${access.userId},recipient_id.eq.${access.userId}`);
  await ensureNoError(error);
  const ids = (data ?? []).map((row: any) =>
    row.requester_id === access.userId ? row.recipient_id : row.requester_id,
  );
  return [...(await loadProfiles(ids)).values()];
}

export async function listExpenseTransactions(user: unknown) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  const { data, error } = await supabase!
    .from("expense_transactions")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  await ensureNoError(error);
  return (data ?? []).map(mapExpense);
}

export async function createExpenseTransaction(
  user: unknown,
  input: ExpenseFormInput,
) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  const payload = {
    owner_id: access.userId,
    transaction_type: input.transactionType,
    amount_minor: toMinorUnits(input.amountInput).toString(),
    title: input.title.trim(),
    category: input.category.trim(),
    subcategory: input.subcategory.trim() || null,
    entry_date: input.entryDate,
    notes: input.notes.trim(),
    payment_method: input.paymentMethod.trim() || "other",
    source_label: input.sourceLabel.trim(),
    recurring_enabled: input.recurringEnabled,
  };
  const { data, error } = await supabase!
    .from("expense_transactions")
    .insert(payload)
    .select("*")
    .single();
  await ensureNoError(error);
  return mapExpense(data);
}

export async function updateExpenseTransaction(
  id: string,
  input: ExpenseFormInput,
) {
  const payload = {
    transaction_type: input.transactionType,
    amount_minor: toMinorUnits(input.amountInput).toString(),
    title: input.title.trim(),
    category: input.category.trim(),
    subcategory: input.subcategory.trim() || null,
    entry_date: input.entryDate,
    notes: input.notes.trim(),
    payment_method: input.paymentMethod.trim() || "other",
    source_label: input.sourceLabel.trim(),
    recurring_enabled: input.recurringEnabled,
  };
  const { data, error } = await supabase!
    .from("expense_transactions")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  await ensureNoError(error);
  return mapExpense(data);
}

export async function deleteExpenseTransaction(id: string) {
  const { error } = await supabase!.from("expense_transactions").delete().eq("id", id);
  await ensureNoError(error);
}

export async function listChitWorkspace(user: unknown) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  try {
    const [groupRes, invitationRes, memberRes] = await withTimeout(
      "listChitWorkspace",
      Promise.all([
        supabase!.from("chit_groups").select("*").order("updated_at", { ascending: false }),
        supabase!.from("chit_group_invitations").select("*").order("created_at", { ascending: false }),
        supabase!.from("chit_group_members").select("*"),
      ]),
    );
    await ensureNoError(groupRes.error);
    await ensureNoError(invitationRes.error);
    await ensureNoError(memberRes.error);

    const groups = (groupRes.data ?? []).map(mapChitGroup);
    const invitations = (invitationRes.data ?? []).map(mapChitInvitation);
    const memberRows = memberRes.data ?? [];
    const profiles = await loadProfiles(memberRows.map((row: any) => row.user_id));
    const members: ChitMember[] = memberRows.map((row: any) => {
      const profile = profiles.get(row.user_id);
      return {
        groupId: row.group_id,
        userId: row.user_id,
        role: row.role,
        contributionStatus: row.contribution_status,
        joinedAt: row.joined_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        name: profile?.name || "User",
        username: profile?.username || "",
        avatarLabel: profile?.avatarLabel || "U",
      };
    });
    return { groups, invitations, members };
  } catch (error) {
    logFinancialError("listChitWorkspace", error, access.userId);
    throw error;
  }
}

export async function createChitGroup(
  user: unknown,
  input: {
    name: string;
    description: string;
    durationCycles: number;
    contributionFrequency: string;
    contributionAmountInput: string;
    interestRatePercent: string;
    startDate: string;
    memberLimit: number;
    status: "upcoming" | "active" | "completed";
  },
) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  const name = requireTrimmed(input.name, "Group name");
  const durationCycles = requirePositiveInteger(input.durationCycles, "Duration / cycles");
  const contributionAmountMinor = requirePositiveMinor(
    input.contributionAmountInput,
    "Contribution amount",
  );
  const interestBps = parseInterestBps(input.interestRatePercent);
  const startDate = requireValidDate(input.startDate, "Start date");
  const memberLimit = requirePositiveInteger(input.memberLimit, "Member limit");
  const { data, error } = await supabase!
    .rpc("create_chit_group_atomic", {
      p_name: name,
      p_description: input.description.trim(),
      p_duration_cycles: durationCycles,
      p_contribution_frequency: input.contributionFrequency,
      p_contribution_amount_minor: contributionAmountMinor.toString(),
      p_interest_bps: interestBps,
      p_start_date: startDate,
      p_member_limit: memberLimit,
      p_status: input.status,
    });
  await ensureNoError(error);
  return mapChitGroup(data);
}

export async function inviteToChitGroup(
  groupId: string,
  inviteeId: string,
  proposedRole: "accountant" | "member",
) {
  const { data, error } = await supabase!
    .rpc("add_chit_group_member_atomic", {
      p_group_id: groupId,
      p_invitee_id: inviteeId,
      p_role: proposedRole,
    });
  await ensureNoError(error);
  return mapChitInvitation(data);
}

export async function respondToChitInvitation(
  user: unknown,
  invitation: ChitInvitation,
  response: "accepted" | "rejected",
) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  const { error } = await supabase!
    .from("chit_group_invitations")
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq("id", invitation.id);
  await ensureNoError(error);
  if (response === "accepted") {
    const { error: memberError } = await supabase!.from("chit_group_members").upsert(
      {
        group_id: invitation.groupId,
        user_id: access.userId,
        role: invitation.proposedRole,
        contribution_status: "pending",
      },
      { onConflict: "group_id,user_id" },
    );
    await ensureNoError(memberError);
  }
}

export async function listChitGroupDetails(groupId: string) {
  try {
    const [contribRes, loanRes, repaymentRes, activityRes] = await withTimeout(
      "listChitGroupDetails",
      Promise.all([
        supabase!.from("chit_group_contributions").select("*").eq("group_id", groupId).order("contribution_date", { ascending: false }),
        supabase!.from("chit_group_loans").select("*").eq("group_id", groupId).order("requested_at", { ascending: false }),
        supabase!.from("chit_group_loan_repayments").select("*").eq("group_id", groupId).order("payment_date", { ascending: false }),
        supabase!.from("chit_group_activities").select("*").eq("group_id", groupId).order("created_at", { ascending: false }),
      ]),
    );
    await ensureNoError(contribRes.error);
    await ensureNoError(loanRes.error);
    await ensureNoError(repaymentRes.error);
    await ensureNoError(activityRes.error);
    const loansRaw = loanRes.data ?? [];
    const requesterProfiles = await loadProfiles(loansRaw.map((row: any) => row.requester_id));
    const loans: ChitLoan[] = loansRaw.map((row: any) => ({
      id: row.id,
      groupId: row.group_id,
      requesterId: row.requester_id,
      approvedBy: row.approved_by,
      amountMinor: toMinor(row.amount_minor),
      purpose: row.purpose,
      status: row.status,
      interestBps: row.interest_bps,
      requestedAt: row.requested_at,
      decisionAt: row.decision_at,
      nextPaymentDate: row.next_payment_date,
      dueDate: row.due_date,
      notes: row.notes ?? "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requesterName: requesterProfiles.get(row.requester_id)?.name || "User",
    }));
    return {
      contributions: (contribRes.data ?? []).map(mapChitContribution),
      loans,
      repayments: (repaymentRes.data ?? []).map(mapChitRepayment),
      activities: (activityRes.data ?? []).map(mapChitActivity),
    };
  } catch (error) {
    logFinancialError("listChitGroupDetails", error, groupId);
    throw error;
  }
}

export async function recordChitContribution(input: {
  groupId: string;
  memberId: string;
  amountInput: string;
  cycleNumber: number;
  contributionDate: string;
  notes: string;
}) {
  const actorId = (await supabase!.auth.getUser()).data.user?.id;
  const { data, error } = await supabase!
    .from("chit_group_contributions")
    .insert({
      group_id: input.groupId,
      member_id: input.memberId,
      recorded_by: actorId,
      amount_minor: toMinorUnits(input.amountInput).toString(),
      cycle_number: input.cycleNumber,
      contribution_date: input.contributionDate,
      notes: input.notes.trim(),
      status: "completed",
    })
    .select("*")
    .single();
  await ensureNoError(error);
  await addChitActivity(input.groupId, actorId ?? null, {
    activityType: "contribution_recorded",
    amountMinor: toMinorUnits(input.amountInput),
    detail: "Recorded a contribution.",
  });
  return mapChitContribution(data);
}

export async function requestChitLoan(input: {
  groupId: string;
  amountInput: string;
  purpose: string;
  interestBps: number;
  nextPaymentDate: string;
}) {
  const userId = (await supabase!.auth.getUser()).data.user?.id;
  const { data, error } = await supabase!
    .from("chit_group_loans")
    .insert({
      group_id: input.groupId,
      requester_id: userId,
      amount_minor: toMinorUnits(input.amountInput).toString(),
      purpose: input.purpose.trim(),
      interest_bps: input.interestBps,
      next_payment_date: input.nextPaymentDate || null,
    })
    .select("*")
    .single();
  await ensureNoError(error);
  await addChitActivity(input.groupId, userId ?? null, {
    activityType: "loan_requested",
    amountMinor: toMinorUnits(input.amountInput),
    detail: input.purpose.trim(),
  });
  const profiles = await loadProfiles([data.requester_id]);
  return {
    ...mapChitLoanBase(data),
    requesterName: profiles.get(data.requester_id)?.name || "User",
  };
}

function mapChitLoanBase(row: any) {
  return {
    id: row.id,
    groupId: row.group_id,
    requesterId: row.requester_id,
    approvedBy: row.approved_by,
    amountMinor: toMinor(row.amount_minor),
    purpose: row.purpose,
    status: row.status,
    interestBps: row.interest_bps,
    requestedAt: row.requested_at,
    decisionAt: row.decision_at,
    nextPaymentDate: row.next_payment_date,
    dueDate: row.due_date,
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function reviewChitLoan(
  loanId: string,
  groupId: string,
  status: "approved" | "rejected",
) {
  const actorId = (await supabase!.auth.getUser()).data.user?.id;
  const { error } = await supabase!
    .from("chit_group_loans")
    .update({
      status,
      approved_by: actorId,
      decision_at: new Date().toISOString(),
    })
    .eq("id", loanId);
  await ensureNoError(error);
  await addChitActivity(groupId, actorId ?? null, {
    activityType: `loan_${status}`,
    detail: `Loan ${status}.`,
  });
}

export async function recordChitRepayment(input: {
  groupId: string;
  loanId: string;
  payerId: string;
  amountInput: string;
  paymentDate: string;
  notes: string;
}) {
  const actorId = (await supabase!.auth.getUser()).data.user?.id;
  const amountMinor = toMinorUnits(input.amountInput);
  const { data, error } = await supabase!
    .from("chit_group_loan_repayments")
    .insert({
      group_id: input.groupId,
      loan_id: input.loanId,
      payer_id: input.payerId,
      recorded_by: actorId,
      amount_minor: amountMinor.toString(),
      payment_date: input.paymentDate,
      notes: input.notes.trim(),
    })
    .select("*")
    .single();
  await ensureNoError(error);
  await addChitActivity(input.groupId, actorId ?? null, {
    activityType: "loan_repayment_recorded",
    amountMinor,
    detail: "Recorded a repayment.",
  });
  return mapChitRepayment(data);
}

export async function updateChitMemberRole(
  groupId: string,
  userId: string,
  role: "manager" | "accountant" | "member",
) {
  const { error } = await supabase!
    .from("chit_group_members")
    .update({ role })
    .eq("group_id", groupId)
    .eq("user_id", userId);
  await ensureNoError(error);
}

export async function updateChitGroupStatus(
  groupId: string,
  status: "upcoming" | "active" | "completed",
) {
  const { error } = await supabase!.from("chit_groups").update({ status }).eq("id", groupId);
  await ensureNoError(error);
}

async function addChitActivity(
  groupId: string,
  actorId: string | null,
  input: { activityType: string; detail: string; amountMinor?: MinorUnit },
) {
  const { error } = await supabase!.from("chit_group_activities").insert({
    group_id: groupId,
    actor_id: actorId,
    activity_type: input.activityType,
    entity_type: "",
    amount_minor: input.amountMinor ? input.amountMinor.toString() : null,
    detail: input.detail,
    status: "",
  });
  await ensureNoError(error);
}

export async function listBillWorkspace(user: unknown) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  try {
    const [groupRes, invitationRes, memberRes, expenseRes, shareRes, settlementRes, activityRes] =
      await withTimeout(
        "listBillWorkspace",
        Promise.all([
          supabase!.from("bill_split_groups").select("*").order("updated_at", { ascending: false }),
          supabase!.from("bill_split_invitations").select("*").order("created_at", { ascending: false }),
          supabase!.from("bill_split_members").select("*"),
          supabase!.from("bill_split_expenses").select("*").order("expense_date", { ascending: false }),
          supabase!.from("bill_split_expense_participants").select("*"),
          supabase!.from("bill_split_settlements").select("*").order("settlement_date", { ascending: false }),
          supabase!.from("bill_split_activities").select("*").order("created_at", { ascending: false }),
        ]),
      );
    await ensureNoError(groupRes.error);
    await ensureNoError(invitationRes.error);
    await ensureNoError(memberRes.error);
    await ensureNoError(expenseRes.error);
    await ensureNoError(shareRes.error);
    await ensureNoError(settlementRes.error);
    await ensureNoError(activityRes.error);
    const profiles = await loadProfiles((memberRes.data ?? []).map((row: any) => row.user_id));
    const members: BillSplitMember[] = (memberRes.data ?? []).map((row: any) => {
      const profile = profiles.get(row.user_id);
      return {
        groupId: row.group_id,
        userId: row.user_id,
        joinedAt: row.joined_at,
        name: profile?.name || "User",
        username: profile?.username || "",
        avatarLabel: profile?.avatarLabel || "U",
      };
    });
    return {
      groups: (groupRes.data ?? []).map(mapBillGroup),
      invitations: (invitationRes.data ?? []).map(mapBillInvitation),
      members,
      expenses: (expenseRes.data ?? []).map(mapBillExpense),
      shares: (shareRes.data ?? []).map(mapBillShare),
      settlements: (settlementRes.data ?? []).map(mapBillSettlement),
      activities: (activityRes.data ?? []).map(mapBillActivity),
    };
  } catch (error) {
    logFinancialError("listBillWorkspace", error, access.userId);
    throw error;
  }
}

export async function createBillGroup(
  user: unknown,
  input: { name: string; description: string; category: string },
) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  const name = requireTrimmed(input.name, "Group name");
  const category = input.category.trim() || "General";
  const { data, error } = await supabase!
    .rpc("create_bill_split_group_atomic", {
      p_name: name,
      p_description: input.description.trim(),
      p_category: category,
      p_avatar_label: initialsFor(name).slice(0, 2),
    });
  await ensureNoError(error);
  return mapBillGroup(data);
}

export async function inviteToBillGroup(groupId: string, inviteeId: string) {
  const { data, error } = await supabase!
    .rpc("add_bill_split_member_atomic", {
      p_group_id: groupId,
      p_invitee_id: inviteeId,
    });
  await ensureNoError(error);
  return mapBillInvitation(data);
}

export async function respondToBillInvitation(
  user: unknown,
  invitation: BillSplitInvitation,
  response: "accepted" | "rejected",
) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  const { error } = await supabase!
    .from("bill_split_invitations")
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq("id", invitation.id);
  await ensureNoError(error);
  if (response === "accepted") {
    const { error: memberError } = await supabase!.from("bill_split_members").upsert(
      { group_id: invitation.groupId, user_id: access.userId },
      { onConflict: "group_id,user_id" },
    );
    await ensureNoError(memberError);
  }
}

export async function addBillExpense(input: {
  groupId: string;
  title: string;
  totalInput: string;
  paidByUserId: string;
  expenseDate: string;
  category: string;
  notes: string;
  splitType: "equal" | "exact";
  shares: Array<{ participantUserId: string; shareInput: string }>;
}) {
  const actorId = (await supabase!.auth.getUser()).data.user?.id;
  if (!actorId) throw new Error("You need to sign in first.");
  const totalMinor = toMinorUnits(input.totalInput);
  const sharesPayload = input.shares.map((share) => ({
    participant_user_id: share.participantUserId,
    share_minor: toMinorUnits(share.shareInput).toString(),
  }));
  const { data, error } = await supabase!
    .rpc("add_bill_split_expense_atomic", {
      p_group_id: input.groupId,
      p_title: input.title.trim(),
      p_total_minor: totalMinor.toString(),
      p_paid_by_user_id: input.paidByUserId,
      p_expense_date: input.expenseDate,
      p_category: input.category.trim() || "Other",
      p_notes: input.notes.trim(),
      p_split_type: input.splitType,
      p_shares: sharesPayload,
    });
  await ensureNoError(error);
  return mapBillExpense(data);
}

export async function recordBillSettlement(input: {
  groupId: string;
  payerId: string;
  payeeId: string;
  amountInput: string;
  settlementDate: string;
  notes: string;
}) {
  const actorId = (await supabase!.auth.getUser()).data.user?.id;
  const amountMinor = toMinorUnits(input.amountInput);
  const { data, error } = await supabase!
    .from("bill_split_settlements")
    .insert({
      group_id: input.groupId,
      payer_id: input.payerId,
      payee_id: input.payeeId,
      recorded_by: actorId,
      amount_minor: amountMinor.toString(),
      settlement_date: input.settlementDate,
      notes: input.notes.trim(),
    })
    .select("*")
    .single();
  await ensureNoError(error);
  await addBillActivity(input.groupId, actorId ?? null, {
    activityType: "settlement_recorded",
    detail: input.notes.trim() || "Recorded a settlement.",
    amountMinor,
  });
  return mapBillSettlement(data);
}

async function addBillActivity(
  groupId: string,
  actorId: string | null,
  input: { activityType: string; detail: string; amountMinor?: MinorUnit },
) {
  const { error } = await supabase!.from("bill_split_activities").insert({
    group_id: groupId,
    actor_id: actorId,
    activity_type: input.activityType,
    entity_type: "",
    amount_minor: input.amountMinor ? input.amountMinor.toString() : null,
    detail: input.detail,
  });
  await ensureNoError(error);
}

export async function listQaWorkspace(user: unknown, params?: { search?: string; sort?: string }) {
  const access = requireSupabaseUser(user);
  if (!access.ready) throw new Error(access.reason);
  const search = params?.search?.trim().toLowerCase() || "";
  const [topicsRes, followsRes, questionRes, topicJoinRes, answersRes, votesRes, bookmarksRes, viewsRes] =
    await Promise.all([
      supabase!.from("qa_topics").select("*").order("label"),
      supabase!.from("qa_topic_follows").select("*"),
      supabase!.from("qa_questions").select("*").is("deleted_at", null),
      supabase!.from("qa_question_topics").select("*"),
      supabase!.from("qa_answers").select("*").is("deleted_at", null),
      supabase!.from("qa_question_votes").select("*"),
      supabase!.from("qa_question_bookmarks").select("*"),
      supabase!.from("qa_question_views").select("*"),
    ]);
  await ensureNoError(topicsRes.error);
  await ensureNoError(followsRes.error);
  await ensureNoError(questionRes.error);
  await ensureNoError(topicJoinRes.error);
  await ensureNoError(answersRes.error);
  await ensureNoError(votesRes.error);
  await ensureNoError(bookmarksRes.error);
  await ensureNoError(viewsRes.error);
  const questionsRaw = (questionRes.data ?? []).filter((row: any) =>
    !search ||
    row.title.toLowerCase().includes(search) ||
    row.body.toLowerCase().includes(search),
  );
  const authorProfiles = await loadProfiles(questionsRaw.map((row: any) => row.author_id));
  const topicMap = new Map((topicsRes.data ?? []).map((row: any) => [row.id, row]));
  const topicLinks = topicJoinRes.data ?? [];
  const answers = answersRes.data ?? [];
  const votes = votesRes.data ?? [];
  const bookmarks = bookmarksRes.data ?? [];
  const views = viewsRes.data ?? [];
  const follows = followsRes.data ?? [];
  const topics: QaTopic[] = (topicsRes.data ?? []).map((row: any) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description ?? "",
    iconEmoji: row.icon_emoji ?? "💬",
    followersCount: follows.filter((follow: any) => follow.topic_id === row.id).length,
    questionsCount: topicLinks.filter((link: any) => link.topic_id === row.id).length,
    following: follows.some(
      (follow: any) => follow.topic_id === row.id && follow.user_id === access.userId,
    ),
  }));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const questions: QaQuestion[] = questionsRaw
    .map((row: any) => {
      const profile = authorProfiles.get(row.author_id);
      return {
        id: row.id,
        authorId: row.author_id,
        authorName: profile?.name || "User",
        authorUsername: profile?.username || "",
        title: row.title,
        body: row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        topics: topicLinks
          .filter((link: any) => link.question_id === row.id)
          .map((link: any) => topicById.get(link.topic_id))
          .filter(Boolean) as QaTopic[],
        answerCount: answers.filter((answer: any) => answer.question_id === row.id).length,
        viewCount: views.filter((view: any) => view.question_id === row.id).length,
        voteCount: votes.filter((vote: any) => vote.question_id === row.id).length,
        saved: bookmarks.some(
          (bookmark: any) =>
            bookmark.question_id === row.id && bookmark.user_id === access.userId,
        ),
        voted: votes.some(
          (vote: any) => vote.question_id === row.id && vote.user_id === access.userId,
        ),
      };
    })
    .sort((left, right) => {
      const sort = params?.sort || "recent";
      if (sort === "most_viewed") return right.viewCount - left.viewCount;
      if (sort === "most_answered") return right.answerCount - left.answerCount;
      return right.createdAt.localeCompare(left.createdAt);
    });
  return { topics, questions };
}

export async function createQaQuestion(input: {
  title: string;
  body: string;
  topicIds: string[];
}) {
  const userId = (await supabase!.auth.getUser()).data.user?.id;
  const { data, error } = await supabase!
    .from("qa_questions")
    .insert({
      author_id: userId,
      title: input.title.trim(),
      body: input.body.trim(),
    })
    .select("*")
    .single();
  await ensureNoError(error);
  if (input.topicIds.length) {
    const { error: topicError } = await supabase!
      .from("qa_question_topics")
      .insert(input.topicIds.map((topicId) => ({ question_id: data.id, topic_id: topicId })));
    await ensureNoError(topicError);
  }
  return data.id as string;
}

export async function createQaAnswer(questionId: string, body: string) {
  const userId = (await supabase!.auth.getUser()).data.user?.id;
  const { data, error } = await supabase!
    .from("qa_answers")
    .insert({ question_id: questionId, author_id: userId, body: body.trim() })
    .select("*")
    .single();
  await ensureNoError(error);
  const profiles = await loadProfiles([data.author_id]);
  return {
    id: data.id,
    questionId: data.question_id,
    authorId: data.author_id,
    authorName: profiles.get(data.author_id)?.name || "User",
    body: data.body,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  } satisfies QaAnswer;
}

export async function listQaAnswers(questionId: string) {
  const { data, error } = await supabase!
    .from("qa_answers")
    .select("*")
    .eq("question_id", questionId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  await ensureNoError(error);
  const profiles = await loadProfiles((data ?? []).map((row: any) => row.author_id));
  return (data ?? []).map((row: any) => ({
    id: row.id,
    questionId: row.question_id,
    authorId: row.author_id,
    authorName: profiles.get(row.author_id)?.name || "User",
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) satisfies QaAnswer[];
}

export async function toggleQaBookmark(questionId: string, saved: boolean) {
  const userId = (await supabase!.auth.getUser()).data.user?.id;
  if (saved) {
    const { error } = await supabase!
      .from("qa_question_bookmarks")
      .delete()
      .eq("question_id", questionId)
      .eq("user_id", userId);
    await ensureNoError(error);
    return;
  }
  const { error } = await supabase!
    .from("qa_question_bookmarks")
    .insert({ question_id: questionId, user_id: userId });
  await ensureNoError(error);
}

export async function toggleQaVote(questionId: string, voted: boolean) {
  const userId = (await supabase!.auth.getUser()).data.user?.id;
  if (voted) {
    const { error } = await supabase!
      .from("qa_question_votes")
      .delete()
      .eq("question_id", questionId)
      .eq("user_id", userId);
    await ensureNoError(error);
    return;
  }
  const { error } = await supabase!
    .from("qa_question_votes")
    .insert({ question_id: questionId, user_id: userId });
  await ensureNoError(error);
}

export async function toggleQaTopicFollow(topicId: string, following: boolean) {
  const userId = (await supabase!.auth.getUser()).data.user?.id;
  if (following) {
    const { error } = await supabase!
      .from("qa_topic_follows")
      .delete()
      .eq("topic_id", topicId)
      .eq("user_id", userId);
    await ensureNoError(error);
    return;
  }
  const { error } = await supabase!
    .from("qa_topic_follows")
    .insert({ topic_id: topicId, user_id: userId });
  await ensureNoError(error);
}

export async function deleteQaQuestion(questionId: string) {
  const { error } = await supabase!
    .from("qa_questions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", questionId);
  await ensureNoError(error);
}

export async function deleteQaAnswer(answerId: string) {
  const { error } = await supabase!
    .from("qa_answers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", answerId);
  await ensureNoError(error);
}

export async function recordQaView(questionId: string) {
  const userId = (await supabase!.auth.getUser()).data.user?.id;
  const { error } = await supabase!
    .from("qa_question_views")
    .upsert({ question_id: questionId, viewer_id: userId }, { onConflict: "question_id,viewer_id" });
  await ensureNoError(error);
}
