import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Clock3, History, ShieldCheck, Sparkles, Store, UserRound, WalletCards } from "lucide-react-native";

import { formatCoins, type RewardHistoryItem, type RewardRepository, type RewardSnapshot, unavailableRewardRepository } from "./rewardRepository";

export default function WalletScreen({
  repository = unavailableRewardRepository,
  onEditProfile,
  onOpenCreatorCommerce,
}: {
  repository?: RewardRepository;
  onEditProfile: () => void;
  onOpenCreatorCommerce: () => void;
}) {
  const [snapshot, setSnapshot] = useState<RewardSnapshot | null>(null);
  const [history, setHistory] = useState<RewardHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repository.available) { setLoading(false); return; }
    try {
      setError(null);
      const [next, nextHistory] = await Promise.all([repository.getSnapshot(), repository.getHistory()]);
      setSnapshot(next);
      setHistory(nextHistory);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rewards could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => void load(), 30_000);
    return () => { clearInterval(timer); clearInterval(refresh); };
  }, [load]);

  const active = Boolean(snapshot?.activeSessionId && snapshot.endsAt && new Date(snapshot.endsAt).getTime() > now);
  const remaining = active && snapshot?.endsAt ? Math.max(0, new Date(snapshot.endsAt).getTime() - now) : 0;
  const estimatedPending = useMemo(() => {
    if (!snapshot?.startedAt || !snapshot.endsAt || !snapshot.activeSessionId) return 0;
    const serverAnchor = new Date(snapshot.serverNow).getTime();
    const clientDelta = Math.max(0, now - serverAnchor);
    const elapsedSeconds = Math.max(0, Math.min(new Date(snapshot.endsAt).getTime(), serverAnchor + clientDelta) - new Date(snapshot.startedAt).getTime()) / 1000;
    return Math.floor(snapshot.rateMicrounitsPerHour * elapsedSeconds / 3600);
  }, [now, snapshot]);

  const start = async () => {
    if (starting || active) return;
    setStarting(true);
    try {
      setSnapshot(await repository.startSession());
      setNow(Date.now());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Session could not start.");
    } finally { setStarting(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><Text style={styles.title}>Wallet</Text><Text style={styles.subtitle}>Your in-app rewards and account shortcuts.</Text></View>
        <View style={styles.hero}>
          <View style={styles.coinIcon}><Sparkles color="#ffffff" size={28} /></View>
          <Text style={styles.eyebrow}>SOCIAL24 COINS</Text>
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.balance}>{formatCoins((snapshot?.confirmedBalanceMicrounits || 0) + (active ? estimatedPending : 0))}</Text>}
          <Text style={styles.balanceLabel}>estimated total · confirmed after session completion</Text>
          <View style={styles.ratePill}><WalletCards color="#eafff2" size={17} /><Text style={styles.rateText}>{formatCoins(snapshot?.rateMicrounitsPerHour || 0)} coins / hour</Text></View>
        </View>

        <View style={styles.sessionCard}>
          <View style={styles.sessionHead}><View><Text style={styles.sectionTitle}>24-hour Reward Session</Text><Text style={styles.sessionSub}>{active ? "Session active" : "Return to start your next session"}</Text></View><Clock3 color="#0b9d51" size={25} /></View>
          {active ? (
            <><Text style={styles.countdown}>{formatRemaining(remaining)}</Text><Text style={styles.pending}>Pending this session: {formatCoins(estimatedPending)} coins</Text></>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start earning Social24 Coins"
              disabled={starting || !repository.available}
              onPress={() => void start()}
              style={[styles.startButton, (starting || !repository.available) && styles.disabled]}
            >
              {starting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.startButtonText}>Start Earning</Text>}
            </Pressable>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.metrics}>
          <Metric label="Confirmed balance" value={formatCoins(snapshot?.confirmedBalanceMicrounits || 0)} />
          <Metric label="Today's rewards" value={formatCoins(snapshot?.todayMicrounits || 0)} />
        </View>

        <View style={styles.notice}><ShieldCheck color="#0a8f4b" size={21} /><Text style={styles.noticeText}>Social24 Coins are in-app reward points. They are not cryptocurrency, cash, an investment, or a guaranteed redeemable asset.</Text></View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Reward History</Text>
          {history.length ? history.slice(0, 8).map((item) => (
            <View key={item.id} style={styles.historyRow}><History color="#0a8f4b" size={19} /><View style={styles.grow}><Text style={styles.historyTitle}>{item.description}</Text><Text style={styles.historyDate}>{new Date(item.createdAt).toLocaleString()}</Text></View><Text style={styles.historyAmount}>+{formatCoins(item.amountMicrounits)}</Text></View>
          )) : <Text style={styles.empty}>Completed reward sessions will appear here.</Text>}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Shortcut icon={UserRound} title="Edit Profile" body="Update the same profile used across Social and Chats." onPress={onEditProfile} />
          <Shortcut icon={Store} title="Creator Commerce" body="Seller, creator and professional tools stay separate from profile editing." onPress={onOpenCreatorCommerce} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatRemaining(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function Shortcut({ icon: Icon, title, body, onPress }: { icon: typeof UserRound; title: string; body: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.shortcut}><View style={styles.shortcutIcon}><Icon color="#0a8f4b" size={21} /></View><View style={styles.grow}><Text style={styles.shortcutTitle}>{title}</Text><Text style={styles.shortcutBody}>{body}</Text></View></Pressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7faf8" }, content: { padding: 18, gap: 16, paddingBottom: 42 },
  header: { marginBottom: 2 }, title: { color: "#101b15", fontSize: 34, fontWeight: "900" }, subtitle: { color: "#657169", marginTop: 5 },
  hero: { padding: 24, borderRadius: 28, backgroundColor: "#07934a", alignItems: "center" }, coinIcon: { width: 58, height: 58, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  eyebrow: { color: "#dfffea", fontWeight: "900", letterSpacing: 1.1, marginTop: 14 }, balance: { color: "#ffffff", fontSize: 44, fontWeight: "900", marginTop: 5 }, balanceLabel: { color: "#d8f4e3", fontSize: 12, textAlign: "center" },
  ratePill: { marginTop: 18, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.16)", flexDirection: "row", gap: 8, alignItems: "center" }, rateText: { color: "#ffffff", fontWeight: "800" },
  sessionCard: { padding: 20, borderRadius: 24, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dfe9e3" }, sessionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sectionTitle: { color: "#17231c", fontSize: 18, fontWeight: "900" }, sessionSub: { color: "#657169", marginTop: 4 }, countdown: { color: "#07934a", fontSize: 38, fontWeight: "900", textAlign: "center", marginTop: 22 }, pending: { color: "#526158", fontWeight: "700", textAlign: "center", marginTop: 8 },
  startButton: { minHeight: 54, marginTop: 20, borderRadius: 18, backgroundColor: "#07b85a", alignItems: "center", justifyContent: "center" }, startButtonText: { color: "#ffffff", fontWeight: "900", fontSize: 17 }, disabled: { opacity: 0.45 }, error: { color: "#b42318", marginTop: 12, lineHeight: 20 },
  metrics: { flexDirection: "row", gap: 12 }, metric: { flex: 1, padding: 17, borderRadius: 20, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e0e8e3" }, metricLabel: { color: "#69756e", fontSize: 12, fontWeight: "700" }, metricValue: { color: "#0a8f4b", fontSize: 21, fontWeight: "900", marginTop: 7 },
  notice: { padding: 16, borderRadius: 20, backgroundColor: "#effaf3", flexDirection: "row", gap: 11, alignItems: "flex-start" }, noticeText: { flex: 1, color: "#526158", lineHeight: 20, fontSize: 13 },
  sectionCard: { padding: 18, borderRadius: 24, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e0e8e3", gap: 12 }, historyRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e7e4" }, grow: { flex: 1 }, historyTitle: { color: "#233129", fontWeight: "800" }, historyDate: { color: "#748078", fontSize: 11, marginTop: 3 }, historyAmount: { color: "#07934a", fontWeight: "900" }, empty: { color: "#748078", lineHeight: 20 },
  shortcut: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12 }, shortcutIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#effaf3", alignItems: "center", justifyContent: "center" }, shortcutTitle: { color: "#233129", fontWeight: "900" }, shortcutBody: { color: "#748078", fontSize: 12, lineHeight: 17, marginTop: 3 },
});
