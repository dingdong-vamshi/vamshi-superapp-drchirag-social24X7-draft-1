export type MinorUnit = bigint;

export type FinancialAccess = {
  userId: string;
  ready: boolean;
  reason?: string;
};

export type AcceptedConnection = {
  id: string;
  name: string;
  username: string;
  avatarLabel: string;
};

export type ExpenseTransaction = {
  id: string;
  ownerId: string;
  transactionType: "income" | "expense";
  amountMinor: MinorUnit;
  title: string;
  category: string;
  subcategory: string;
  entryDate: string;
  notes: string;
  paymentMethod: string;
  sourceLabel: string;
  recurringEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseFormInput = {
  transactionType: "income" | "expense";
  amountInput: string;
  title: string;
  category: string;
  subcategory: string;
  entryDate: string;
  notes: string;
  paymentMethod: string;
  sourceLabel: string;
  recurringEnabled: boolean;
};

export type ChitGroup = {
  id: string;
  createdBy: string;
  managerId: string;
  name: string;
  description: string;
  durationCycles: number;
  contributionFrequency: string;
  contributionAmountMinor: MinorUnit;
  interestBps: number;
  startDate: string | null;
  memberLimit: number;
  status: "upcoming" | "active" | "completed";
  createdAt: string;
  updatedAt: string;
};

export type ChitInvitation = {
  id: string;
  groupId: string;
  inviteeId: string;
  invitedBy: string;
  proposedRole: "accountant" | "member";
  status: "pending" | "accepted" | "rejected";
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChitMember = {
  groupId: string;
  userId: string;
  role: "manager" | "accountant" | "member";
  contributionStatus: "pending" | "paid" | "partial";
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  username: string;
  avatarLabel: string;
};

export type ChitContribution = {
  id: string;
  groupId: string;
  memberId: string;
  recordedBy: string;
  amountMinor: MinorUnit;
  cycleNumber: number;
  contributionDate: string;
  status: "pending" | "completed";
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ChitLoan = {
  id: string;
  groupId: string;
  requesterId: string;
  approvedBy: string | null;
  amountMinor: MinorUnit;
  purpose: string;
  status: "pending" | "approved" | "rejected" | "repaid";
  interestBps: number;
  requestedAt: string;
  decisionAt: string | null;
  nextPaymentDate: string | null;
  dueDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  requesterName: string;
};

export type ChitRepayment = {
  id: string;
  loanId: string;
  groupId: string;
  payerId: string;
  recordedBy: string;
  amountMinor: MinorUnit;
  paymentDate: string;
  notes: string;
  createdAt: string;
};

export type ChitActivity = {
  id: string;
  groupId: string;
  actorId: string | null;
  activityType: string;
  entityType: string;
  entityId: string | null;
  amountMinor: MinorUnit;
  status: string;
  detail: string;
  createdAt: string;
};

export type BillSplitGroup = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  category: string;
  avatarLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type BillSplitInvitation = {
  id: string;
  groupId: string;
  inviteeId: string;
  invitedBy: string;
  status: "pending" | "accepted" | "rejected";
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillSplitMember = {
  groupId: string;
  userId: string;
  joinedAt: string;
  name: string;
  username: string;
  avatarLabel: string;
};

export type BillSplitExpense = {
  id: string;
  groupId: string;
  createdBy: string;
  paidByUserId: string;
  title: string;
  totalMinor: MinorUnit;
  expenseDate: string;
  category: string;
  notes: string;
  splitType: "equal" | "exact";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type BillSplitExpenseParticipant = {
  expenseId: string;
  participantUserId: string;
  shareMinor: MinorUnit;
};

export type BillSplitSettlement = {
  id: string;
  groupId: string;
  payerId: string;
  payeeId: string;
  recordedBy: string;
  amountMinor: MinorUnit;
  settlementDate: string;
  notes: string;
  createdAt: string;
};

export type BillSplitActivity = {
  id: string;
  groupId: string;
  actorId: string | null;
  activityType: string;
  entityType: string;
  entityId: string | null;
  amountMinor: MinorUnit;
  detail: string;
  createdAt: string;
};

export type QaTopic = {
  id: string;
  slug: string;
  label: string;
  description: string;
  iconEmoji: string;
  followersCount: number;
  questionsCount: number;
  following: boolean;
};

export type QaQuestion = {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  topics: QaTopic[];
  answerCount: number;
  viewCount: number;
  voteCount: number;
  saved: boolean;
  voted: boolean;
};

export type QaAnswer = {
  id: string;
  questionId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};
