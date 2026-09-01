import { useMemo, useState } from "react";
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
  BadgeDollarSign,
  Eye,
  Plus,
  Search,
  Trash2,
} from "lucide-react-native";

import { useAuth } from "../../lib/AuthContext";
import {
  createExpenseTransaction,
  deleteExpenseTransaction,
  listExpenseTransactions,
  updateExpenseTransaction,
} from "./repository";
import type { ExpenseFormInput, ExpenseTransaction } from "./types";
import {
  calculateExpenseSummary,
  currentMonthKey,
  formatMinor,
  toMinorUnits,
} from "./utils";

const categories = [
  "Food",
  "Transport",
  "Shopping",
  "Entertainment",
  "Bills",
  "Health",
  "Education",
  "Salary",
  "Other",
] as const;

const defaultForm = (): ExpenseFormInput => ({
  transactionType: "expense",
  amountInput: "",
  title: "",
  category: "Food",
  subcategory: "",
  entryDate: new Date().toISOString().slice(0, 10),
  notes: "",
  paymentMethod: "UPI",
  sourceLabel: "",
  recurringEnabled: false,
});

export default function ExpenseTrackerScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"overview" | "transactions" | "analytics">(
    "overview",
  );
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseTransaction | null>(null);
  const [form, setForm] = useState<ExpenseFormInput>(defaultForm());
  const [balanceVisible, setBalanceVisible] = useState(true);

  const expensesQuery = useQuery({
    queryKey: ["expense-transactions", user && "id" in user ? user.id : "guest"],
    queryFn: () => listExpenseTransactions(user),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required.");
      if (!form.category.trim()) throw new Error("Category is required.");
      if (toMinorUnits(form.amountInput) <= 0n) {
        throw new Error("Amount must be greater than zero.");
      }
      return editing
        ? updateExpenseTransaction(editing.id, form)
        : createExpenseTransaction(user, form);
    },
    onSuccess: async () => {
      setEditorOpen(false);
      setEditing(null);
      setForm(defaultForm());
      await queryClient.invalidateQueries({ queryKey: ["expense-transactions"] });
    },
    onError: (error) =>
      Alert.alert(
        "Could not save transaction",
        error instanceof Error ? error.message : "Please try again.",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: async (transactionId: string) => deleteExpenseTransaction(transactionId),
    onSuccess: async () => {
      setEditorOpen(false);
      setEditing(null);
      setForm(defaultForm());
      await queryClient.invalidateQueries({ queryKey: ["expense-transactions"] });
    },
    onError: (error) =>
      Alert.alert(
        "Could not delete transaction",
        error instanceof Error ? error.message : "Please try again.",
      ),
  });

  const transactions = expensesQuery.data ?? [];
  const monthKey = currentMonthKey(new Date().toISOString().slice(0, 10));
  const summary = useMemo(
    () => calculateExpenseSummary(transactions, monthKey),
    [transactions, monthKey],
  );
  const filteredTransactions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return transactions.filter((item) => {
      const categoryOkay =
        categoryFilter === "All Categories" || item.category === categoryFilter;
      const queryOkay =
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle) ||
        item.paymentMethod.toLowerCase().includes(needle);
      return categoryOkay && queryOkay;
    });
  }, [categoryFilter, query, transactions]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm());
    setEditorOpen(true);
  };

  const openEdit = (transaction: ExpenseTransaction) => {
    setEditing(transaction);
    setForm({
      transactionType: transaction.transactionType,
      amountInput: (Number(transaction.amountMinor) / 100).toString(),
      title: transaction.title,
      category: transaction.category,
      subcategory: transaction.subcategory,
      entryDate: transaction.entryDate,
      notes: transaction.notes,
      paymentMethod: transaction.paymentMethod,
      sourceLabel: transaction.sourceLabel,
      recurringEnabled: transaction.recurringEnabled,
    });
    setEditorOpen(true);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color="#0f172a" size={24} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <BadgeDollarSign color="#ef4444" size={22} />
          <Text style={styles.headerTitle}>Expense Tracker</Text>
        </View>
        <Pressable onPress={openCreate} style={styles.addButton}>
          <Plus color="#ffffff" size={24} />
        </Pressable>
      </View>

      <View style={styles.topTabs}>
        <TopTab label="Overview" active={tab === "overview"} onPress={() => setTab("overview")} />
        <TopTab label="Transactions" active={tab === "transactions"} onPress={() => setTab("transactions")} />
        <TopTab label="Analytics" active={tab === "analytics"} onPress={() => setTab("analytics")} />
      </View>

      {expensesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#1d4ed8" />
          <Text style={styles.centerText}>Loading your expense data…</Text>
        </View>
      ) : expensesQuery.isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load expenses</Text>
          <Text style={styles.centerText}>
            {expensesQuery.error instanceof Error
              ? expensesQuery.error.message
              : "Please try again."}
          </Text>
          <PrimaryButton label="Retry" onPress={() => void expensesQuery.refetch()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {tab === "overview" ? (
            <>
              <View style={styles.balanceCard}>
                <View style={styles.balanceTop}>
                  <Text style={styles.balanceLabel}>Current Balance</Text>
                  <Pressable onPress={() => setBalanceVisible((current) => !current)}>
                    <Eye color="#0f172a" size={22} />
                  </Pressable>
                </View>
                <Text style={styles.balanceValue}>
                  {balanceVisible ? formatMinor(summary.balance) : "₹••••"}
                </Text>
                <Text
                  style={[
                    styles.balanceStatus,
                    summary.balance >= 0n ? styles.positive : styles.negative,
                  ]}
                >
                  {summary.balance >= 0n ? "Positive balance" : "Negative balance"}
                </Text>
              </View>

              <View style={styles.overviewRow}>
                <MiniCard label="Income" value={formatMinor(summary.incomeTotal)} positive />
                <MiniCard label="Expenses" value={formatMinor(summary.expenseTotal)} negative />
              </View>

              <SectionCard title="Top Categories This Month">
                {summary.topCategories.length === 0 ? (
                  <EmptySection
                    title="No expense categories yet"
                    text="Add your first expense to see spending categories here."
                    actionLabel="Add transaction"
                    onPress={openCreate}
                  />
                ) : (
                  summary.topCategories.slice(0, 4).map((item) => (
                    <BarRow
                      key={item.label}
                      label={item.label}
                      value={formatMinor(item.amount)}
                      ratio={
                        Number(item.amount) /
                        Number(summary.topCategories[0]?.amount || 1n)
                      }
                    />
                  ))
                )}
              </SectionCard>

              <SectionCard title="Recent Transactions">
                {summary.monthTransactions.length === 0 ? (
                  <EmptySection
                    title="No transactions yet"
                    text="Start by recording one income or expense."
                    actionLabel="Add transaction"
                    onPress={openCreate}
                  />
                ) : (
                  summary.monthTransactions.slice(0, 5).map((item) => (
                    <TransactionRow key={item.id} item={item} onPress={() => openEdit(item)} />
                  ))
                )}
              </SectionCard>
            </>
          ) : null}

          {tab === "transactions" ? (
            <>
              <View style={styles.searchBox}>
                <Search color="#98a2b3" size={20} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search transactions..."
                  placeholderTextColor="#98a2b3"
                  style={styles.searchInput}
                />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Reset transaction category filter" onPress={() => setCategoryFilter("All Categories")} style={styles.filterBox}>
                <Text style={styles.filterText}>{categoryFilter}</Text>
              </Pressable>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPills}>
                <FilterPill
                  label="All Categories"
                  active={categoryFilter === "All Categories"}
                  onPress={() => setCategoryFilter("All Categories")}
                />
                {categories.map((item) => (
                  <FilterPill
                    key={item}
                    label={item}
                    active={categoryFilter === item}
                    onPress={() => setCategoryFilter(item)}
                  />
                ))}
              </ScrollView>

              {filteredTransactions.length === 0 ? (
                <SectionCard title="Transactions">
                  <EmptySection
                    title={query ? "No matching transactions" : "No transactions yet"}
                    text={
                      query
                        ? "Try a different search or category filter."
                        : "Create your first income or expense entry."
                    }
                    actionLabel="Add transaction"
                    onPress={openCreate}
                  />
                </SectionCard>
              ) : (
                filteredTransactions.map((item) => (
                  <TransactionCard key={item.id} item={item} onPress={() => openEdit(item)} />
                ))
              )}
            </>
          ) : null}

          {tab === "analytics" ? (
            <>
              <SectionCard title="Spending by Category">
                {summary.topCategories.length === 0 ? (
                  <EmptySection
                    title="Nothing to analyse yet"
                    text="Your category bars will appear after you add expenses."
                  />
                ) : (
                  summary.topCategories.map((item) => (
                    <BarRow
                      key={item.label}
                      label={item.label}
                      value={formatMinor(item.amount)}
                      ratio={
                        Number(item.amount) /
                        Number(summary.topCategories[0]?.amount || 1n)
                      }
                    />
                  ))
                )}
              </SectionCard>

              <SectionCard title="Monthly Summary">
                <View style={styles.summaryGrid}>
                  <SummaryMetric label="Total Income" value={formatMinor(summary.incomeTotal)} positive />
                  <SummaryMetric label="Total Expenses" value={formatMinor(summary.expenseTotal)} negative />
                </View>
                <View style={styles.divider} />
                <SummaryMetric
                  label="Net Savings"
                  value={formatMinor(summary.balance)}
                  positive={summary.balance >= 0n}
                  negative={summary.balance < 0n}
                />
              </SectionCard>

              <SectionCard title="Expenses by App">
                {summary.monthTransactions.filter((item) => item.sourceLabel).length === 0 ? (
                  <EmptySection
                    title="No app/source labels yet"
                    text="Add source labels like UPI, credit card app, or cash book to break this down."
                  />
                ) : (
                  [...new Map(
                    summary.monthTransactions
                      .filter((item) => item.sourceLabel)
                      .map((item) => [
                        item.sourceLabel,
                        (summary.monthTransactions
                          .filter((match) => match.sourceLabel === item.sourceLabel)
                          .reduce((total, current) => total + current.amountMinor, 0n)),
                      ]),
                  )].map(([label, amount]) => (
                    <View key={label} style={styles.appRow}>
                      <Text style={styles.appLabel}>{label}</Text>
                      <Text style={styles.appValue}>{formatMinor(amount)}</Text>
                    </View>
                  ))
                )}
              </SectionCard>
            </>
          ) : null}
        </ScrollView>
      )}

      <TransactionEditorModal
        visible={editorOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        busy={saveMutation.isPending || deleteMutation.isPending}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSave={() => void saveMutation.mutate()}
        onDelete={
          editing
            ? () =>
                Alert.alert("Delete transaction", "This cannot be undone.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => void deleteMutation.mutate(editing.id),
                  },
                ])
            : undefined
        }
      />
    </SafeAreaView>
  );
}

function TopTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.topTab, active && styles.topTabActive]}>
      <Text style={[styles.topTabText, active && styles.topTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MiniCard({
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
    <View style={styles.miniCard}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={[styles.miniValue, positive && styles.positive, negative && styles.negative]}>
        {value}
      </Text>
    </View>
  );
}

function SummaryMetric({
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
    <View style={styles.metricBlock}>
      <Text style={[styles.metricValue, positive && styles.positive, negative && styles.negative]}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function BarRow({
  label,
  value,
  ratio,
}: {
  label: string;
  value: string;
  ratio: number;
}) {
  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>{value}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(ratio * 100, 8)}%` }]} />
      </View>
    </View>
  );
}

function EmptySection({
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
    <View style={styles.emptyBlock}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.centerText}>{text}</Text>
      {actionLabel && onPress ? <PrimaryButton label={actionLabel} onPress={onPress} /> : null}
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.primaryButton}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.filterPill, active && styles.filterPillActive]}>
      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TransactionRow({
  item,
  onPress,
}: {
  item: ExpenseTransaction;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.transactionRow}>
      <View style={styles.transactionIcon}>
        <BadgeDollarSign color={item.transactionType === "income" ? "#16a34a" : "#ef4444"} size={20} />
      </View>
      <View style={styles.transactionCopy}>
        <Text style={styles.transactionTitle}>{item.title}</Text>
        <Text style={styles.transactionMeta}>
          {item.category} · {item.entryDate}
        </Text>
      </View>
      <Text
        style={[
          styles.transactionAmount,
          item.transactionType === "income" ? styles.positive : styles.negative,
        ]}
      >
        {item.transactionType === "income" ? "+" : "-"}
        {formatMinor(item.amountMinor).replace("-", "")}
      </Text>
    </Pressable>
  );
}

function TransactionCard({
  item,
  onPress,
}: {
  item: ExpenseTransaction;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.transactionCard}>
      <View style={styles.transactionIconLarge}>
        <BadgeDollarSign color={item.transactionType === "income" ? "#16a34a" : "#ef4444"} size={24} />
      </View>
      <View style={styles.transactionCardCopy}>
        <Text style={styles.transactionCardTitle}>{item.title}</Text>
        <Text style={styles.transactionCardMeta}>
          {item.category}
          {item.subcategory ? ` · ${item.subcategory}` : ""}
          {" · "}
          {item.entryDate}
        </Text>
        <Text style={styles.transactionCardSource}>
          {(item.sourceLabel || item.paymentMethod || "Manual").trim()}
        </Text>
      </View>
      <View style={styles.transactionCardAmountWrap}>
        <Text
          style={[
            styles.transactionCardAmount,
            item.transactionType === "income" ? styles.positive : styles.negative,
          ]}
        >
          {item.transactionType === "income" ? "+" : "-"}
          {formatMinor(item.amountMinor).replace("-", "")}
        </Text>
        <Text style={styles.transactionCardMethod}>{item.paymentMethod}</Text>
      </View>
    </Pressable>
  );
}

function TransactionEditorModal({
  visible,
  editing,
  form,
  setForm,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  editing: ExpenseTransaction | null;
  form: ExpenseFormInput;
  setForm: React.Dispatch<React.SetStateAction<ExpenseFormInput>>;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editing ? "Edit transaction" : "Add transaction"}
            </Text>
            <Pressable onPress={onClose}>
              <Text style={styles.modalClose}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.segmentRow}>
            <FilterPill
              label="Expense"
              active={form.transactionType === "expense"}
              onPress={() => setForm((current) => ({ ...current, transactionType: "expense" }))}
            />
            <FilterPill
              label="Income"
              active={form.transactionType === "income"}
              onPress={() => setForm((current) => ({ ...current, transactionType: "income" }))}
            />
          </View>

          <Field label="Amount" value={form.amountInput} onChangeText={(value) => setForm((current) => ({ ...current, amountInput: value }))} placeholder="0.00" keyboardType="decimal-pad" />
          <Field label="Title" value={form.title} onChangeText={(value) => setForm((current) => ({ ...current, title: value }))} placeholder="Dinner, salary, rent..." />
          <Field label="Category" value={form.category} onChangeText={(value) => setForm((current) => ({ ...current, category: value }))} placeholder="Food" />
          <Field label="Subcategory" value={form.subcategory} onChangeText={(value) => setForm((current) => ({ ...current, subcategory: value }))} placeholder="Optional" />
          <Field label="Date" value={form.entryDate} onChangeText={(value) => setForm((current) => ({ ...current, entryDate: value }))} placeholder="YYYY-MM-DD" />
          <Field label="Payment method" value={form.paymentMethod} onChangeText={(value) => setForm((current) => ({ ...current, paymentMethod: value }))} placeholder="UPI / Cash / Card" />
          <Field label="Source / app" value={form.sourceLabel} onChangeText={(value) => setForm((current) => ({ ...current, sourceLabel: value }))} placeholder="Food App / Credit Card / Wallet" />
          <Field label="Notes" value={form.notes} onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))} placeholder="Optional notes" multiline />

          <View style={styles.modalActions}>
            <PrimaryButton label={busy ? "Saving..." : editing ? "Save changes" : "Create transaction"} onPress={onSave} />
            {onDelete ? (
              <Pressable onPress={onDelete} style={styles.deleteButton}>
                <Trash2 color="#ef4444" size={18} />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "decimal-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98a2b3"
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  backButton: { width: 36, alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: "#111827", fontSize: 22, fontWeight: "500" },
  addButton: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#05051a",
    alignItems: "center",
    justifyContent: "center",
  },
  topTabs: {
    marginHorizontal: 14,
    marginTop: 6,
    borderRadius: 22,
    padding: 4,
    backgroundColor: "#e9eaf1",
    flexDirection: "row",
    gap: 6,
  },
  topTab: { flex: 1, minHeight: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  topTabActive: { backgroundColor: "#ffffff" },
  topTabText: { color: "#111827", fontSize: 15, fontWeight: "600" },
  topTabTextActive: { color: "#111827" },
  content: { padding: 14, gap: 16, paddingBottom: 36 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 28 },
  centerText: { color: "#667085", fontSize: 15, lineHeight: 22, textAlign: "center" },
  balanceCard: {
    backgroundColor: "#eaf1ff",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#bfd4ff",
    padding: 22,
    minHeight: 178,
  },
  balanceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceLabel: { color: "#1d4ed8", fontSize: 16 },
  balanceValue: { color: "#1e3a8a", fontSize: 42, fontWeight: "800", marginTop: 24 },
  balanceStatus: { fontSize: 17, fontWeight: "600", marginTop: 22 },
  positive: { color: "#16a34a" },
  negative: { color: "#ef4444" },
  overviewRow: { flexDirection: "row", gap: 14 },
  miniCard: {
    flex: 1,
    minHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 20,
    justifyContent: "space-between",
  },
  miniLabel: { color: "#475467", fontSize: 15 },
  miniValue: { fontSize: 28, fontWeight: "800" },
  sectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12,
  },
  sectionTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  emptyBlock: { alignItems: "flex-start", gap: 10, paddingVertical: 8 },
  emptyTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  primaryButton: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#05051a",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  barRow: { gap: 8 },
  barHead: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  barLabel: { color: "#111827", fontSize: 14, fontWeight: "600" },
  barValue: { color: "#475467", fontSize: 14, fontWeight: "600" },
  barTrack: { height: 10, borderRadius: 999, backgroundColor: "#eef2ff", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999, backgroundColor: "#2563eb" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f2f4f7",
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  searchInput: { flex: 1, color: "#111827", fontSize: 16 },
  filterBox: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: "#f2f4f7",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  filterText: { color: "#111827", fontSize: 16 },
  filterPills: { gap: 10, paddingBottom: 4 },
  filterPill: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#edf2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  filterPillActive: { backgroundColor: "#111827" },
  filterPillText: { color: "#1d4ed8", fontSize: 14, fontWeight: "700" },
  filterPillTextActive: { color: "#ffffff" },
  transactionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  transactionCopy: { flex: 1 },
  transactionTitle: { color: "#111827", fontSize: 16, fontWeight: "700" },
  transactionMeta: { color: "#667085", fontSize: 13, marginTop: 3 },
  transactionAmount: { fontSize: 16, fontWeight: "800" },
  transactionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 18,
    flexDirection: "row",
    gap: 16,
  },
  transactionIconLarge: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  transactionCardCopy: { flex: 1, gap: 8 },
  transactionCardTitle: { color: "#111827", fontSize: 17, fontWeight: "700", lineHeight: 24 },
  transactionCardMeta: { color: "#667085", fontSize: 14, lineHeight: 20 },
  transactionCardSource: {
    alignSelf: "flex-start",
    backgroundColor: "#eef2f7",
    color: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
    fontSize: 13,
    fontWeight: "700",
  },
  transactionCardAmountWrap: { alignItems: "flex-end", justifyContent: "center", gap: 8 },
  transactionCardAmount: { fontSize: 18, fontWeight: "900" },
  transactionCardMethod: { color: "#667085", fontSize: 13, textAlign: "right" },
  summaryGrid: { flexDirection: "row", justifyContent: "space-around" },
  metricBlock: { alignItems: "center", gap: 6, paddingVertical: 8 },
  metricValue: { fontSize: 22, fontWeight: "900" },
  metricLabel: { color: "#667085", fontSize: 14 },
  divider: { height: 1, backgroundColor: "#e5e7eb", marginVertical: 8 },
  appRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  appLabel: { color: "#111827", fontSize: 16 },
  appValue: { color: "#111827", fontSize: 16, fontWeight: "700" },
  modalSafe: { flex: 1, backgroundColor: "#ffffff" },
  modalContent: { padding: 18, gap: 14, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: "#111827", fontSize: 24, fontWeight: "800" },
  modalClose: { color: "#667085", fontSize: 16, fontWeight: "600" },
  segmentRow: { flexDirection: "row", gap: 10 },
  fieldWrap: { gap: 8 },
  fieldLabel: { color: "#111827", fontSize: 14, fontWeight: "700" },
  fieldInput: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#f2f4f7",
    paddingHorizontal: 14,
    color: "#111827",
    fontSize: 15,
  },
  fieldInputMultiline: { minHeight: 120, paddingTop: 14, textAlignVertical: "top" },
  modalActions: { gap: 12, marginTop: 8 },
  deleteButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteButtonText: { color: "#ef4444", fontSize: 15, fontWeight: "800" },
});
