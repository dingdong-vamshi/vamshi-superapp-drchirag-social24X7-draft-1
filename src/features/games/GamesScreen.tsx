import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ArrowLeft,
  Brain,
  Dice6,
  Gamepad2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
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

import { useAuth } from "../../lib/AuthContext";
import { calculateWinRate, gameLabel, normalizeEntryPoints, normalizePlayerLimit } from "./gameLogic";
import {
  createGameRoom,
  getGamesDashboard,
  getGamesUnavailableReason,
  getQuickGameCoinStatus,
  startQuickGameWithMinedCoins,
  subscribeGames,
} from "./gamesRepository";
import type { CreateGameRoomInput, GameKind, GameMatch, GameRoom } from "./types";

const quickGames: Array<{
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  background: string;
  icon: LucideIcon;
  meta: string;
}> = [
  {
    id: "quick-tic-tac-toe",
    title: "Tic‑Tac‑Toe",
    subtitle: "Beat a smart bot on a clean 3×3 board.",
    accent: "#16a34a",
    background: "#ecfdf3",
    icon: Gamepad2,
    meta: "1 player • instant",
  },
  {
    id: "quick-snake-ladder",
    title: "Snake & Ladder",
    subtitle: "Roll to 100, climb ladders, dodge snakes.",
    accent: "#f97316",
    background: "#fff7ed",
    icon: Dice6,
    meta: "You vs bot",
  },
  {
    id: "quick-memory-match",
    title: "Memory Match",
    subtitle: "Flip cards and clear all pairs fast.",
    accent: "#9333ea",
    background: "#faf5ff",
    icon: Brain,
    meta: "12 cards",
  },
];

const gameOptions: Array<{ kind: GameKind; title: string; subtitle: string }> = [
  { kind: "tic_tac_toe", title: "Tic-Tac-Toe", subtitle: "2-player realtime match" },
  { kind: "snake_ladder", title: "Snake & Ladder", subtitle: "2-4 player realtime race" },
];

export default function GamesScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const unavailableReason = getGamesUnavailableReason(user);
  const [createOpen, setCreateOpen] = useState(false);
  const [startingGameId, setStartingGameId] = useState<string | null>(null);

  const coinStatusQuery = useQuery({
    queryKey: ["quick-game-coins", user?.id],
    queryFn: () => getQuickGameCoinStatus(user),
    enabled: !unavailableReason,
  });

  const quickStartMutation = useMutation({
    mutationFn: async (gameId: string) => {
      setStartingGameId(gameId);
      return startQuickGameWithMinedCoins(user, gameId, createIdempotencyKey());
    },
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ["quick-game-coins", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["reward-snapshot", user?.id] });
      router.push({ pathname: "/games/[id]", params: { id: session.gameKey, coinSession: session.id } });
    },
    onError: (cause) => Alert.alert("Could not start game", cause instanceof Error ? cause.message : "Please try again."),
    onSettled: () => setStartingGameId(null),
  });

  const dashboardQuery = useQuery({
    queryKey: ["games-dashboard", user?.id],
    queryFn: () => getGamesDashboard(user),
    enabled: !unavailableReason,
  });

  useEffect(() => {
    if (unavailableReason) return undefined;
    return subscribeGames(() => {
      void queryClient.invalidateQueries({ queryKey: ["games-dashboard", user?.id] });
    });
  }, [queryClient, unavailableReason, user?.id]);

  const stats = dashboardQuery.data?.stats;
  const winRate = useMemo(
    () => calculateWinRate(stats?.gamesWon ?? 0, stats?.gamesPlayed ?? 0),
    [stats?.gamesPlayed, stats?.gamesWon],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
            <ArrowLeft color="#0f172a" size={26} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Games</Text>
            <Text style={styles.subtitle}>Arcade play + realtime rooms</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Realtime rooms status" onPress={() => Alert.alert("Realtime rooms", "Coming Soon. The three mined-coin Quick Play games are available now.")} style={styles.createIcon}>
            <Plus color="#ffffff" size={28} />
          </Pressable>
        </View>

        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>Spendable mined coins</Text>
            <Text style={styles.balanceValue}>{coinStatusQuery.isLoading ? "…" : formatCoins(coinStatusQuery.data?.balanceMicrounits ?? 0)}</Text>
          </View>
          <ShieldCheck color="#16a34a" size={32} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Sparkles color="#16a34a" size={28} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Quick Play Arcade</Text>
            <Text style={styles.heroText}>Each arcade entry uses mined Social24 Coins through an atomic wallet debit.</Text>
          </View>
        </View>

        <View style={styles.quickGrid}>
          {quickGames.map((game) => (
            <QuickGameCard
              key={game.id}
              game={game}
              costMicrounits={coinStatusQuery.data?.costMicrounits ?? 1_000_000}
              loading={startingGameId === game.id}
              onPress={() => quickStartMutation.mutate(game.id)}
            />
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Realtime rooms</Text>
          <Pressable accessibilityRole="button" onPress={() => Alert.alert("Realtime rooms", "Coming Soon. Quick Play games are fully available with mined-coin entry.")} style={styles.smallCreateButton}>
            <Plus color="#ffffff" size={18} />
            <Text style={styles.smallCreateText}>Create</Text>
          </Pressable>
        </View>

        {unavailableReason ? (
          <StateCard
            title="Realtime rooms need real sign-in"
            message={`${unavailableReason} Quick Play still works perfectly for local/manual testing.`}
          />
        ) : dashboardQuery.isLoading ? (
          <LoadingCard message="Loading your game rooms..." />
        ) : dashboardQuery.isError ? (
          <StateCard
            title="Could not load realtime rooms"
            message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Please try again."}
            actionLabel="Retry"
            onAction={() => void dashboardQuery.refetch()}
          />
        ) : (
          <>
            <View style={styles.statGrid}>
              <Stat label="Played" value={stats?.gamesPlayed ?? 0} />
              <Stat label="Won" value={stats?.gamesWon ?? 0} />
              <Stat label="Win Rate" value={`${winRate}%`} />
            </View>

            <RoomSection title="Your active rooms" rooms={dashboardQuery.data?.myRooms ?? []} empty="No active rooms yet." />
            <MatchSection matches={dashboardQuery.data?.recentMatches ?? []} />
            <RoomSection title="Open rooms" rooms={dashboardQuery.data?.openRooms ?? []} empty="No public rooms waiting right now." />
          </>
        )}
      </ScrollView>

      <CreateRoomModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(roomId) => {
          setCreateOpen(false);
          router.push(`/games/${roomId}`);
        }}
      />
    </SafeAreaView>
  );
}

function QuickGameCard({
  game,
  costMicrounits,
  loading,
  onPress,
}: {
  game: (typeof quickGames)[number];
  costMicrounits: number;
  loading: boolean;
  onPress: () => void;
}) {
  const Icon = game.icon;
  return (
    <Pressable accessibilityRole="button" disabled={loading} onPress={onPress} style={styles.quickCard}>
      <View style={[styles.quickIcon, { backgroundColor: game.background }]}>
        <Icon color={game.accent} size={28} />
      </View>
      <View style={styles.quickBody}>
        <Text style={styles.quickTitle}>{game.title}</Text>
        <Text style={styles.quickSubtitle}>{game.subtitle}</Text>
        <Text style={[styles.quickMeta, { color: game.accent }]}>{loading ? "Starting securely…" : `${game.meta} • ${formatCoins(costMicrounits)} coin entry`}</Text>
      </View>
    </Pressable>
  );
}

function formatCoins(microunits: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(microunits / 1_000_000);
}

function createIdempotencyKey() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RoomSection({ title, rooms, empty }: { title: string; rooms: GameRoom[]; empty: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rooms.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{empty}</Text>
        </View>
      ) : (
        rooms.map((room) => <RoomCard key={room.id} room={room} />)
      )}
    </View>
  );
}

function MatchSection({ matches }: { matches: GameMatch[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Recent matches</Text>
      {matches.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No completed matches yet.</Text>
        </View>
      ) : (
        matches.map((match) => {
          const resultLabel = match.result === "draw" ? "Draw" : match.winnerId ? "Winner recorded" : "Completed";
          const playedAt = match.createdAt ? new Date(match.createdAt).toLocaleDateString() : "Recent";

          return (
            <Pressable key={match.id} accessibilityRole="button" onPress={() => router.push(`/games/${match.roomId}`)} style={styles.roomCard}>
              <View style={styles.roomIcon}>
                <Trophy color="#f97316" size={24} />
              </View>
              <View style={styles.roomBody}>
                <View style={styles.roomTitleRow}>
                  <Text style={styles.roomTitle} numberOfLines={1}>{gameLabel(match.gameKind)}</Text>
                  <Text style={styles.statusPill}>{match.status.replace("_", " ")}</Text>
                </View>
                <Text style={styles.roomMeta}>{resultLabel} • {playedAt}</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function RoomCard({ room }: { room: GameRoom }) {
  const Icon = room.gameKind === "tic_tac_toe" ? Gamepad2 : Trophy;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/games/${room.id}`)} style={styles.roomCard}>
      <View style={styles.roomIcon}>
        <Icon color="#16a34a" size={24} />
      </View>
      <View style={styles.roomBody}>
        <View style={styles.roomTitleRow}>
          <Text style={styles.roomTitle} numberOfLines={1}>{room.name}</Text>
          <Text style={styles.statusPill}>{room.status.replace("_", " ")}</Text>
        </View>
        <Text style={styles.roomMeta}>{gameLabel(room.gameKind)} • Host {room.host?.name ?? "Player"}</Text>
        <View style={styles.roomFooter}>
          <Text style={styles.roomFooterText}>{room.memberCount}/{room.playerLimit} players</Text>
          <Text style={styles.roomFooterText}>{room.entryPoints} entry pts</Text>
        </View>
      </View>
    </Pressable>
  );
}

function CreateRoomModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [gameKind, setGameKind] = useState<GameKind>("tic_tac_toe");
  const [name, setName] = useState("");
  const [playerLimit, setPlayerLimit] = useState(2);
  const [entryPoints, setEntryPoints] = useState("0");

  const mutation = useMutation({
    mutationFn: () => {
      const input: CreateGameRoomInput = {
        gameKind,
        name: name.trim(),
        playerLimit: normalizePlayerLimit(gameKind, playerLimit),
        entryPoints: normalizeEntryPoints(Number(entryPoints)),
        isPrivate: false,
      };
      return createGameRoom(user, input);
    },
    onSuccess: (roomId) => {
      void queryClient.invalidateQueries({ queryKey: ["games-dashboard", user?.id] });
      onCreated(roomId);
    },
    onError: (error) => Alert.alert("Could not create room", error instanceof Error ? error.message : "Please try again."),
  });

  useEffect(() => {
    if (gameKind === "tic_tac_toe") setPlayerLimit(2);
  }, [gameKind]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create realtime room</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <X color="#64748b" size={24} />
            </Pressable>
          </View>

          <View style={styles.optionRow}>
            {gameOptions.map((option) => (
              <Pressable
                key={option.kind}
                accessibilityRole="button"
                onPress={() => setGameKind(option.kind)}
                style={[styles.gameOption, gameKind === option.kind && styles.gameOptionActive]}
              >
                <Text style={[styles.gameOptionTitle, gameKind === option.kind && styles.gameOptionTitleActive]}>{option.title}</Text>
                <Text style={styles.gameOptionSubtitle}>{option.subtitle}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.inputLabel}>Room name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={gameKind === "tic_tac_toe" ? "Friday Tic-Tac-Toe" : "Weekend Snake & Ladder"}
            style={styles.input}
          />

          <Text style={styles.inputLabel}>Entry Game Points</Text>
          <TextInput value={entryPoints} onChangeText={setEntryPoints} keyboardType="number-pad" placeholder="0" style={styles.input} />

          {gameKind === "snake_ladder" ? (
            <>
              <Text style={styles.inputLabel}>Player limit</Text>
              <View style={styles.limitRow}>
                {[2, 3, 4].map((limit) => (
                  <Pressable
                    key={limit}
                    accessibilityRole="button"
                    onPress={() => setPlayerLimit(limit)}
                    style={[styles.limitButton, playerLimit === limit && styles.limitButtonActive]}
                  >
                    <Text style={[styles.limitText, playerLimit === limit && styles.limitTextActive]}>{limit}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={mutation.isPending}
            onPress={() => mutation.mutate()}
            style={[styles.submitButton, mutation.isPending && styles.disabledButton]}
          >
            {mutation.isPending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>Create room</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LoadingCard({ message }: { message: string }) {
  return (
    <View style={styles.stateCard}>
      <ActivityIndicator color="#16a34a" />
      <Text style={styles.stateMessage}>{message}</Text>
    </View>
  );
}

function StateCard({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.retryButton}>
          <RefreshCcw color="#ffffff" size={18} />
          <Text style={styles.retryText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, paddingBottom: 44, width: "100%", maxWidth: 560, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  title: { fontSize: 36, fontWeight: "900", color: "#0f172a" },
  subtitle: { color: "#64748b", fontSize: 15, marginTop: 2, fontWeight: "700" },
  createIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#16a34a", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 24px rgba(22, 163, 74, 0.25)" },
  heroCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#ffffff", borderRadius: 28, borderWidth: 1, borderColor: "#e5e7eb", padding: 18, marginBottom: 14, boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)" },
  heroIcon: { width: 58, height: 58, borderRadius: 22, backgroundColor: "#ecfdf3", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  heroTitle: { color: "#0f172a", fontSize: 22, fontWeight: "900" },
  heroText: { color: "#64748b", fontSize: 14, lineHeight: 20, marginTop: 3, fontWeight: "700" },
  quickGrid: { gap: 12, marginBottom: 24 },
  quickCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#ffffff", borderRadius: 26, borderWidth: 1, borderColor: "#e5e7eb", padding: 16, boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)" },
  quickIcon: { width: 64, height: 64, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  quickBody: { flex: 1 },
  quickTitle: { color: "#0f172a", fontSize: 21, fontWeight: "900" },
  quickSubtitle: { color: "#64748b", fontSize: 14, lineHeight: 20, marginTop: 3, fontWeight: "700" },
  quickMeta: { fontSize: 13, fontWeight: "900", marginTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  smallCreateButton: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#020617", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  smallCreateText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  balanceCard: { backgroundColor: "#ecfdf3", borderColor: "#bbf7d0", borderWidth: 1, borderRadius: 28, padding: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  balanceLabel: { color: "#15803d", fontSize: 16, fontWeight: "800" },
  balanceValue: { color: "#0f172a", fontSize: 44, fontWeight: "900", marginTop: 4 },
  statGrid: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: "#ffffff", borderRadius: 22, paddingVertical: 18, alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb" },
  statValue: { color: "#0f172a", fontSize: 23, fontWeight: "900" },
  statLabel: { color: "#64748b", fontSize: 13, fontWeight: "700", marginTop: 4 },
  section: { marginBottom: 26 },
  sectionTitle: { color: "#0f172a", fontSize: 22, fontWeight: "900" },
  emptyBox: { borderRadius: 22, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ffffff", padding: 20, marginTop: 12 },
  emptyText: { color: "#64748b", fontSize: 15, fontWeight: "700" },
  roomCard: { flexDirection: "row", gap: 14, backgroundColor: "#ffffff", borderRadius: 24, padding: 16, borderWidth: 1, borderColor: "#e5e7eb", marginTop: 12 },
  roomIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#ecfdf3", alignItems: "center", justifyContent: "center" },
  roomBody: { flex: 1 },
  roomTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  roomTitle: { flex: 1, color: "#0f172a", fontSize: 18, fontWeight: "900" },
  statusPill: { color: "#15803d", backgroundColor: "#dcfce7", overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: "900" },
  roomMeta: { color: "#64748b", fontSize: 14, marginTop: 4, fontWeight: "700" },
  roomFooter: { flexDirection: "row", gap: 14, marginTop: 12 },
  roomFooterText: { color: "#475569", fontSize: 13, fontWeight: "800" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.35)" },
  modalCard: { backgroundColor: "#ffffff", borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 22, paddingBottom: 34, width: "100%", maxWidth: 560, alignSelf: "center" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  modalTitle: { color: "#0f172a", fontSize: 28, fontWeight: "900" },
  optionRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  gameOption: { flex: 1, borderRadius: 20, borderWidth: 1, borderColor: "#e5e7eb", padding: 14, backgroundColor: "#f8fafc" },
  gameOptionActive: { borderColor: "#86efac", backgroundColor: "#ecfdf3" },
  gameOptionTitle: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  gameOptionTitleActive: { color: "#15803d" },
  gameOptionSubtitle: { color: "#64748b", fontSize: 12, marginTop: 4, fontWeight: "700" },
  inputLabel: { color: "#0f172a", fontSize: 15, fontWeight: "900", marginBottom: 8, marginTop: 8 },
  input: { minHeight: 58, borderRadius: 18, backgroundColor: "#f1f5f9", paddingHorizontal: 16, fontSize: 18, color: "#0f172a", fontWeight: "700" },
  limitRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  limitButton: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", paddingVertical: 14 },
  limitButtonActive: { borderColor: "#16a34a", backgroundColor: "#ecfdf3" },
  limitText: { color: "#64748b", fontSize: 18, fontWeight: "900" },
  limitTextActive: { color: "#16a34a" },
  submitButton: { minHeight: 60, borderRadius: 20, backgroundColor: "#020617", alignItems: "center", justifyContent: "center", marginTop: 18 },
  disabledButton: { opacity: 0.65 },
  submitText: { color: "#ffffff", fontSize: 18, fontWeight: "900" },
  stateCard: { minHeight: 220, borderRadius: 28, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center", padding: 24 },
  stateTitle: { color: "#0f172a", fontSize: 24, fontWeight: "900", textAlign: "center" },
  stateMessage: { color: "#64748b", fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 10 },
  retryButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#16a34a", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, marginTop: 18 },
  retryText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
});
