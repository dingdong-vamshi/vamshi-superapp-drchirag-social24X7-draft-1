import type {
  BillSplitExpense,
  BillSplitExpenseParticipant,
  BillSplitSettlement,
  ChitContribution,
  ChitLoan,
  ChitRepayment,
  ExpenseTransaction,
  MinorUnit,
} from "./types";

export const zeroMinor = 0n;

export function toMinorUnits(input: string): MinorUnit {
  const normalized = input.replace(/[^0-9.]/g, "").trim();
  if (!normalized) return zeroMinor;
  const [wholeRaw, fractionRaw = ""] = normalized.split(".");
  const whole = BigInt(wholeRaw || "0");
  const fraction = BigInt((fractionRaw + "00").slice(0, 2) || "0");
  return whole * 100n + fraction;
}

export function minorToNumber(input: MinorUnit): number {
  return Number(input) / 100;
}

export function formatMinor(input: MinorUnit): string {
  const negative = input < 0;
  const absolute = negative ? input * -1n : input;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₹${wholeText}${fraction > 0n ? `.${fraction.toString().padStart(2, "0")}` : ""}`;
}

export function currentMonthKey(dateText: string): string {
  const [year, month] = dateText.split("-");
  return `${year}-${month}`;
}

export function sumMinor(values: MinorUnit[]): MinorUnit {
  return values.reduce((total, value) => total + value, 0n);
}

export function calculateExpenseSummary(
  transactions: ExpenseTransaction[],
  monthKey: string,
) {
  const monthTransactions = transactions.filter(
    (item) => currentMonthKey(item.entryDate) === monthKey,
  );
  const incomeTotal = sumMinor(
    monthTransactions
      .filter((item) => item.transactionType === "income")
      .map((item) => item.amountMinor),
  );
  const expenseTotal = sumMinor(
    monthTransactions
      .filter((item) => item.transactionType === "expense")
      .map((item) => item.amountMinor),
  );
  const balance = incomeTotal - expenseTotal;
  const categoryTotals = new Map<string, MinorUnit>();
  monthTransactions
    .filter((item) => item.transactionType === "expense")
    .forEach((item) => {
      categoryTotals.set(
        item.category,
        (categoryTotals.get(item.category) ?? 0n) + item.amountMinor,
      );
    });
  const topCategories = [...categoryTotals.entries()]
    .sort((left, right) => Number(right[1] - left[1]))
    .map(([label, amount]) => ({ label, amount }));
  return {
    monthTransactions,
    incomeTotal,
    expenseTotal,
    balance,
    topCategories,
  };
}

export function calculateChitTotals(params: {
  contributions: ChitContribution[];
  loans: ChitLoan[];
  repayments: ChitRepayment[];
  memberCount: number;
  durationCycles: number;
}) {
  const totalContributions = sumMinor(
    params.contributions
      .filter((item) => item.status === "completed")
      .map((item) => item.amountMinor),
  );
  const outstandingLoans = params.loans
    .filter((item) => item.status === "approved" || item.status === "repaid")
    .reduce((total, loan) => {
      const repaid = sumMinor(
        params.repayments
          .filter((repayment) => repayment.loanId === loan.id)
          .map((repayment) => repayment.amountMinor),
      );
      const outstanding = loan.amountMinor - repaid;
      return total + (outstanding > 0n ? outstanding : 0n);
    }, 0n);
  const availableFunds = totalContributions - outstandingLoans;
  const totalContributionEvents = params.contributions.length;
  const plannedEvents = Math.max(params.memberCount * params.durationCycles, 1);
  return {
    totalContributions,
    outstandingLoans,
    availableFunds,
    currentCycle: Math.max(
      params.contributions.reduce(
        (max, item) => Math.max(max, item.cycleNumber),
        1,
      ),
      1,
    ),
    progressRatio: Math.min(totalContributionEvents / plannedEvents, 1),
  };
}

export function calculateBillBalances(params: {
  expenses: BillSplitExpense[];
  shares: BillSplitExpenseParticipant[];
  settlements: BillSplitSettlement[];
}) {
  const balances = new Map<string, MinorUnit>();
  const sharesByExpense = new Map<string, BillSplitExpenseParticipant[]>();
  params.shares.forEach((share) => {
    const existing = sharesByExpense.get(share.expenseId) ?? [];
    existing.push(share);
    sharesByExpense.set(share.expenseId, existing);
  });

  params.expenses
    .filter((expense) => !expense.deletedAt)
    .forEach((expense) => {
      balances.set(
        expense.paidByUserId,
        (balances.get(expense.paidByUserId) ?? 0n) + expense.totalMinor,
      );
      (sharesByExpense.get(expense.id) ?? []).forEach((share) => {
        balances.set(
          share.participantUserId,
          (balances.get(share.participantUserId) ?? 0n) - share.shareMinor,
        );
      });
    });

  params.settlements.forEach((settlement) => {
    balances.set(
      settlement.payerId,
      (balances.get(settlement.payerId) ?? 0n) + settlement.amountMinor,
    );
    balances.set(
      settlement.payeeId,
      (balances.get(settlement.payeeId) ?? 0n) - settlement.amountMinor,
    );
  });

  return balances;
}

export function exactSplitTotal(
  shares: Array<{ amountInput?: string; shareInput?: string }>,
) {
  return sumMinor(
    shares.map((item) => toMinorUnits(item.amountInput ?? item.shareInput ?? "0")),
  );
}
