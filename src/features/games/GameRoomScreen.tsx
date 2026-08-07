import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Brain,
  Copy,
  Dice6,
  Gamepad2,
  LogOut,
  Play,
  RefreshCcw,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "../../lib/AuthContext";
import {
  LADDERS,
  SNAKES,
  TIC_TAC_TOE_EMPTY_CELLS,
  applySnakeLadderRoll,
  applyTicTacToeMove,
  canJoinRoom,
  canStartRoom,
  gameLabel,
  getTicTacToeWinner,
  pickTicTacToeBotMove,
} from "./gameLogic";
import {
  getGameRoomDetail,
  getGamesUnavailableReason,
  joinGameRoom,
  leaveGameRoom,
  playTicTacToeMove,
  rollSnakeLadder,
  startGameRoom,
  subscribeGameRoom,
} from "./gamesRepository";
import type { GameMatch, GameMove, GameRoomDetail, GameRoomMember } from "./types";

type QuickGameId = "quick-tic-tac-toe" | "quick-snake-ladder" | "quick-memory-match";

const quickGameCopy: Record<QuickGameId, { title: string; subtitle: string; icon: LucideIcon; accent: string }> = {
  "quick-tic-tac-toe": {
    title: "Tic‑Tac‑Toe",
    subtitle: "Smart bot match",
    icon: Gamepad2,
    accent: "#16a34a",
  },
  "quick-snake-ladder": {
    title: "Snake & Ladder",
    subtitle: "You vs Kai",
    icon: Dice6,
    accent: "#f97316",
  },
  "quick-memory-match": {
    title: "Memory Match",
    subtitle: "Clear every pair",
    icon: Brain,
    accent: "#9333ea",
  },
};

export default function GameRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = Array.isArray(id) ? id[0] : id;

  if (isQuickGameId(roomId)) {
    return <QuickGameRoom gameId={roomId} />;
  }

  return <RealtimeGameRoom roomId={roomId} />;
}

function isQuickGameId(roomId?: string): roomId is QuickGameId {
  return roomId === "quick-tic-tac-toe" || roomId === "quick-snake-ladder" || roomId === "quick-memory-match";
}

function RealtimeGameRoom({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const unavailableReason = getGamesUnavailableReason(user);

  const detailQuery = useQuery({
    queryKey: ["game-room", roomId, user?.id],
    queryFn: () => getGameRoomDetail(user, roomId),
    enabled: Boolean(roomId) && !unavailableReason,
  });

  useEffect(() => {
    if (!roomId || unavailableReason) return undefined;
    return subscribeGameRoom(roomId, () => {
      void queryClient.invalidateQueries({ queryKey: ["game-room", roomId, user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["games-dashboard", user?.id] });
    });
  }, [queryClient, roomId, unavailableReason, user?.id]);

  const detail = detailQuery.data;
  const room = detail?.room;
  const members = detail?.members ?? [];
  const viewerMember = members.find((member) => member.userId === user?.id);
  const isHost = Boolean(room && room.hostId === user?.id);

  const joinMutation = useGameMutation(() => joinGameRoom(user, roomId), roomId);
  const leaveMutation = useGameMutation(() => leaveGameRoom(user, roomId), roomId, () => router.back());
  const startMutation = useGameMutation(() => startGameRoom(user, roomId), roomId);

  const joinBlockedReason = room ? canJoinRoom(room, members, user?.id ?? "") : "Room unavailable";
  const startBlockedReason = room ? canStartRoom(room, members, user?.id ?? "") : "Room unavailable";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
            <ArrowLeft color="#0f172a" size={26} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>{room?.name ?? "Game Room"}</Text>
            <Text style={styles.subtitle}>{room ? `${gameLabel(room.gameKind)} • ${room.status.replace("_", " ")}` : "Realtime room"}</Text>
          </View>
          {room?.roomCode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy room code"
              onPress={async () => {
                await Clipboard.setStringAsync(room.roomCode ?? room.id);
                Alert.alert("Copied", "Room code copied.");
              }}
              style={styles.iconButton}
            >
              <Copy color="#475569" size={22} />
            </Pressable>
          ) : null}
        </View>

        {unavailableReason ? (
          <StateCard title="Games need real sign-in" message={unavailableReason} />
        ) : detailQuery.isLoading ? (
          <LoadingCard message="Opening game room..." />
        ) : detailQuery.isError ? (
          <StateCard
            title="Could not load room"
            message={detailQuery.error instanceof Error ? detailQuery.error.message : "Please try again."}
            actionLabel="Retry"
            onAction={() => void detailQuery.refetch()}
          />
        ) : detail && room ? (
          <>
            <View style={styles.roomSummary}>
              <View>
                <Text style={styles.summaryLabel}>Room code</Text>
                <Text style={styles.summaryValue}>{room.roomCode ?? "Public"}</Text>
              </View>
              <View style={styles.summaryRight}>
                <Text style={styles.summaryLabel}>Entry</Text>
                <Text style={styles.summaryValue}>{room.entryPoints} pts</Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              {!viewerMember ? (
                <ActionButton label={joinBlockedReason ? joinBlockedReason : "Join room"} icon={Users} disabled={Boolean(joinBlockedReason) || joinMutation.isPending} onPress={() => joinMutation.mutate()} />
              ) : (
                <ActionButton label="Leave" icon={LogOut} variant="light" disabled={leaveMutation.isPending || room.status === "in_game"} onPress={() => leaveMutation.mutate()} />
              )}
              <ActionButton
                label={startBlockedReason ? startBlockedReason : "Start"}
                icon={Play}
                disabled={Boolean(startBlockedReason) || startMutation.isPending}
                onPress={() => startMutation.mutate()}
              />
            </View>

            <MembersList members={detail.members} currentUserId={user?.id} />

            {detail.match ? (
              detail.match.gameKind === "tic_tac_toe" ? (
                <TicTacToeGame detail={detail} currentUserId={user?.id} />
              ) : (
                <SnakeLadderGame detail={detail} currentUserId={user?.id} />
              )
            ) : (
              <StateCard
                title="Waiting to start"
                message={isHost ? "Start the room when enough players have joined." : "Waiting for the host to start this match."}
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickGameRoom({ gameId }: { gameId: QuickGameId }) {
  const copy = quickGameCopy[gameId];
  const Icon = copy.icon;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
            <ArrowLeft color="#0f172a" size={26} />
          </Pressable>
          <View style={[styles.quickRoomIcon, { backgroundColor: `${copy.accent}18` }]}>
            <Icon color={copy.accent} size={24} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.subtitle} • playable offline</Text>
          </View>
        </View>

        {gameId === "quick-tic-tac-toe" ? <QuickTicTacToe /> : null}
        {gameId === "quick-snake-ladder" ? <QuickSnakeLadder /> : null}
        {gameId === "quick-memory-match" ? <QuickMemoryMatch /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickTicTacToe() {
  const [cells, setCells] = useState([...TIC_TAC_TOE_EMPTY_CELLS]);
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [score, setScore] = useState({ you: 0, bot: 0, draws: 0 });
  const [roundOver, setRoundOver] = useState(false);
  const winner = getTicTacToeWinner(cells);
  const isDraw = !winner && cells.every(Boolean);

  const resetBoard = useCallback(() => {
    setCells([...TIC_TAC_TOE_EMPTY_CELLS]);
    setTurn("X");
    setRoundOver(false);
  }, []);

  useEffect(() => {
    if (roundOver) return;
    if (winner || isDraw) {
      setRoundOver(true);
      setScore((current) => ({
        you: current.you + (winner?.symbol === "X" ? 1 : 0),
        bot: current.bot + (winner?.symbol === "O" ? 1 : 0),
        draws: current.draws + (isDraw ? 1 : 0),
      }));
    }
  }, [isDraw, roundOver, winner]);

  useEffect(() => {
    if (turn !== "O" || winner || isDraw) return undefined;
    const timeout = setTimeout(() => {
      const botMove = pickTicTacToeBotMove(cells);
      if (botMove === null) return;
      const next = applyTicTacToeMove({ cells, cellIndex: botMove, symbol: "O", activeSymbol: "O" });
      if (!next) return;
      setCells(next.cells);
      setTurn("X");
    }, 420);
    return () => clearTimeout(timeout);
  }, [cells, isDraw, turn, winner]);

  const status = winner?.symbol === "X" ? "You won this round" : winner?.symbol === "O" ? "Bot won this round" : isDraw ? "Draw game" : turn === "X" ? "Your move" : "Bot is thinking...";

  return (
    <>
      <View style={styles.arcadeHero}>
        <View>
          <Text style={styles.arcadeEyebrow}>Quick match</Text>
          <Text style={styles.arcadeTitle}>{status}</Text>
          <Text style={styles.arcadeText}>Play X. The bot blocks wins, takes winning moves, and grabs the center.</Text>
        </View>
        <Sparkles color="#16a34a" size={32} />
      </View>

      <View style={styles.quickScoreRow}>
        <MiniScore label="You" value={score.you} color="#16a34a" />
        <MiniScore label="Bot" value={score.bot} color="#2563eb" />
        <MiniScore label="Draws" value={score.draws} color="#64748b" />
      </View>

      <View style={styles.quickBoardCard}>
        <View style={styles.ticBoardLarge}>
          {cells.map((value, index) => (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`Quick tic tac toe cell ${index + 1}`}
              disabled={turn !== "X" || Boolean(value) || Boolean(winner) || isDraw}
              onPress={() => {
                const next = applyTicTacToeMove({ cells, cellIndex: index, symbol: "X", activeSymbol: "X" });
                if (!next) return;
                setCells(next.cells);
                setTurn("O");
              }}
              style={[styles.ticCellLarge, value === "X" && styles.ticCellX, value === "O" && styles.ticCellO]}
            >
              <Text style={[styles.ticTextLarge, value === "O" && styles.ticTextO]}>{value}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={resetBoard} style={styles.secondaryFullButton}>
          <RotateCcw color="#0f172a" size={18} />
          <Text style={styles.secondaryFullText}>Reset board</Text>
        </Pressable>
      </View>
    </>
  );
}

function QuickSnakeLadder() {
  const [positions, setPositions] = useState({ you: 1, kai: 1 });
  const [turn, setTurn] = useState<"you" | "kai">("you");
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [log, setLog] = useState("Roll the dice to begin. Exact 100 wins.");
  const [winner, setWinner] = useState<"you" | "kai" | null>(null);

  const reset = useCallback(() => {
    setPositions({ you: 1, kai: 1 });
    setTurn("you");
    setLastRoll(null);
    setLog("Roll the dice to begin. Exact 100 wins.");
    setWinner(null);
  }, []);

  const rollFor = useCallback((player: "you" | "kai") => {
    if (winner) return;
    const dice = Math.floor(Math.random() * 6) + 1;
    setLastRoll(dice);
    setPositions((current) => {
      const from = current[player];
      const result = applySnakeLadderRoll(from, dice);
      const nextPosition = result.to;
      const label = player === "you" ? "You" : "Kai";
      let detail = `${label} rolled ${dice}: ${from} → ${nextPosition}.`;
      if (result.exactWinBlocked) detail = `${label} needs exact 100 and stays on ${from}.`;
      if (SNAKES[from + dice]) detail = `${label} hit a snake. Ouch.`;
      if (LADDERS[from + dice]) detail = `${label} climbed a ladder. Nice.`;
      setLog(detail);
      if (nextPosition === 100) setWinner(player);
      return { ...current, [player]: nextPosition };
    });
    setTurn(player === "you" ? "kai" : "you");
  }, [winner]);

  useEffect(() => {
    if (turn !== "kai" || winner) return undefined;
    const timeout = setTimeout(() => rollFor("kai"), 700);
    return () => clearTimeout(timeout);
  }, [rollFor, turn, winner]);

  const boardCells = useMemo(() => Array.from({ length: 100 }, (_, index) => 100 - index), []);

  return (
    <>
      <View style={[styles.arcadeHero, styles.orangeHero]}>
        <View>
          <Text style={[styles.arcadeEyebrow, styles.orangeText]}>Dice race</Text>
          <Text style={styles.arcadeTitle}>{winner ? `${winner === "you" ? "You win" : "Kai wins"}!` : turn === "you" ? "Your roll" : "Kai is rolling..."}</Text>
          <Text style={styles.arcadeText}>{log}</Text>
        </View>
        <Dice6 color="#f97316" size={34} />
      </View>

      <View style={styles.quickScoreRow}>
        <MiniScore label="You" value={positions.you} color="#16a34a" />
        <MiniScore label="Dice" value={lastRoll ?? "—"} color="#f97316" />
        <MiniScore label="Kai" value={positions.kai} color="#2563eb" />
      </View>

      <View style={styles.quickBoardCard}>
        <View style={styles.snakeBoard}>
          {boardCells.map((cell) => {
            const hasYou = positions.you === cell;
            const hasKai = positions.kai === cell;
            const isSnake = Boolean(SNAKES[cell]);
            const isLadder = Boolean(LADDERS[cell]);
            return (
              <View key={cell} style={[styles.snakeCell, isSnake && styles.snakeCellTrap, isLadder && styles.snakeCellBoost]}>
                <Text style={styles.snakeCellText}>{cell}</Text>
                <View style={styles.tokenRow}>
                  {hasYou ? <Text style={styles.youToken}>Y</Text> : null}
                  {hasKai ? <Text style={styles.botToken}>K</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
        <View style={styles.snakeLegend}>
          <Text style={styles.legendText}>🪜 Ladders boost you</Text>
          <Text style={styles.legendText}>🐍 Snakes pull you down</Text>
        </View>
        <View style={styles.actionRow}>
          <ActionButton label={turn === "you" && !winner ? "Roll dice" : "Waiting"} icon={Dice6} disabled={turn !== "you" || Boolean(winner)} onPress={() => rollFor("you")} />
          <ActionButton label="Reset" icon={RotateCcw} variant="light" onPress={reset} />
        </View>
      </View>
    </>
  );
}

type MemoryCard = {
  id: string;
  symbol: string;
  matched: boolean;
};

const memorySymbols = ["🎮", "🍔", "🎧", "🏆", "💬", "🛍️"];

function buildMemoryDeck() {
  return memorySymbols
    .flatMap((symbol, pairIndex) => [
      { id: `${symbol}-${pairIndex}-a`, symbol, matched: false },
      { id: `${symbol}-${pairIndex}-b`, symbol, matched: false },
    ])
    .sort(() => Math.random() - 0.5);
}

function QuickMemoryMatch() {
  const [deck, setDeck] = useState<MemoryCard[]>(() => buildMemoryDeck());
  const [flipped, setFlipped] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const matchedCount = deck.filter((card) => card.matched).length;
  const completed = matchedCount === deck.length;

  const reset = useCallback(() => {
    setDeck(buildMemoryDeck());
    setFlipped([]);
    setMoves(0);
  }, []);

  useEffect(() => {
    if (flipped.length !== 2) return undefined;
    const [firstId, secondId] = flipped;
    const first = deck.find((card) => card.id === firstId);
    const second = deck.find((card) => card.id === secondId);
    const timeout = setTimeout(() => {
      if (first && second && first.symbol === second.symbol) {
        setDeck((current) => current.map((card) => (card.id === first.id || card.id === second.id ? { ...card, matched: true } : card)));
      }
      setFlipped([]);
    }, 620);
    return () => clearTimeout(timeout);
  }, [deck, flipped]);

  return (
    <>
      <View style={[styles.arcadeHero, styles.purpleHero]}>
        <View>
          <Text style={[styles.arcadeEyebrow, styles.purpleText]}>Memory sprint</Text>
          <Text style={styles.arcadeTitle}>{completed ? "Board cleared!" : "Find every pair"}</Text>
          <Text style={styles.arcadeText}>{completed ? `Finished in ${moves} moves. Try a cleaner run.` : "Flip two cards. Matching pairs stay open."}</Text>
        </View>
        <Brain color="#9333ea" size={34} />
      </View>

      <View style={styles.quickScoreRow}>
        <MiniScore label="Moves" value={moves} color="#9333ea" />
        <MiniScore label="Pairs" value={`${matchedCount / 2}/6`} color="#16a34a" />
        <MiniScore label="Left" value={(deck.length - matchedCount) / 2} color="#64748b" />
      </View>

      <View style={styles.quickBoardCard}>
        <View style={styles.memoryGrid}>
          {deck.map((card) => {
            const visible = card.matched || flipped.includes(card.id);
            return (
              <Pressable
                key={card.id}
                accessibilityRole="button"
                accessibilityLabel={visible ? `Card ${card.symbol}` : "Hidden memory card"}
                disabled={visible || flipped.length === 2}
                onPress={() => {
                  setFlipped((current) => [...current, card.id]);
                  if (flipped.length === 1) setMoves((current) => current + 1);
                }}
                style={[styles.memoryCard, visible && styles.memoryCardVisible, card.matched && styles.memoryCardMatched]}
              >
                <Text style={styles.memoryText}>{visible ? card.symbol : "?"}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable accessibilityRole="button" onPress={reset} style={styles.secondaryFullButton}>
          <RotateCcw color="#0f172a" size={18} />
          <Text style={styles.secondaryFullText}>Shuffle again</Text>
        </Pressable>
      </View>
    </>
  );
}

function MiniScore({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={styles.miniScore}>
      <Text style={[styles.miniScoreValue, { color }]}>{value}</Text>
      <Text style={styles.miniScoreLabel}>{label}</Text>
    </View>
  );
}

function useGameMutation(mutationFn: () => Promise<unknown>, roomId: string, onSuccess?: () => void) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["game-room", roomId, user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["games-dashboard", user?.id] });
      onSuccess?.();
    },
    onError: (error) => Alert.alert("Game action failed", error instanceof Error ? error.message : "Please try again."),
  });
}

function MembersList({ members, currentUserId }: { members: GameRoomMember[]; currentUserId?: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Players</Text>
      {members.map((member) => (
        <View key={member.id || member.userId} style={styles.memberRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{member.profile?.avatarLabel ?? "P"}</Text>
          </View>
          <View style={styles.memberBody}>
            <Text style={styles.memberName}>{member.profile?.name ?? member.profile?.username ?? "Player"}</Text>
            <Text style={styles.memberMeta}>
              Seat {member.seatIndex + 1}
              {member.symbol ? ` • ${member.symbol}` : ""}
              {member.position ? ` • Square ${member.position}` : ""}
            </Text>
          </View>
          {member.userId === currentUserId ? <Text style={styles.youPill}>You</Text> : null}
        </View>
      ))}
    </View>
  );
}

function TicTacToeGame({ detail, currentUserId }: { detail: GameRoomDetail; currentUserId?: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const match = detail.match as GameMatch;
  const cells = Array.isArray(match.board.cells) ? (match.board.cells as string[]) : [...TIC_TAC_TOE_EMPTY_CELLS];
  const viewerMember = detail.members.find((member) => member.userId === currentUserId);
  const isMyTurn = Boolean(viewerMember && match.currentTurnUserId === currentUserId && match.status === "in_game");
  const winner = getTicTacToeWinner(cells);
  const mutation = useMutation({
    mutationFn: (cellIndex: number) => playTicTacToeMove(user, match.id, cellIndex),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["game-room", detail.room.id, user?.id] }),
    onError: (error) => Alert.alert("Move failed", error instanceof Error ? error.message : "Please try again."),
  });

  return (
    <View style={styles.card}>
      <View style={styles.gameHeader}>
        <Text style={styles.cardTitle}>Tic-Tac-Toe</Text>
        <Text style={styles.turnText}>{winner ? `${winner.symbol} wins` : match.status === "draw" ? "Draw" : isMyTurn ? "Your turn" : "Waiting turn"}</Text>
      </View>
      <View style={styles.ticBoard}>
        {cells.map((value, index) => {
          const disabled = !isMyTurn || Boolean(value) || mutation.isPending;
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`Cell ${index + 1}`}
              disabled={disabled}
              onPress={() => mutation.mutate(index)}
              style={[styles.ticCell, disabled && !value && styles.ticCellDisabled]}
            >
              <Text style={[styles.ticText, value === "O" && styles.ticTextO]}>{value}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SnakeLadderGame({ detail, currentUserId }: { detail: GameRoomDetail; currentUserId?: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const match = detail.match as GameMatch;
  const isMyTurn = Boolean(match.currentTurnUserId === currentUserId && match.status === "in_game");
  const mutation = useMutation({
    mutationFn: () => rollSnakeLadder(user, match.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["game-room", detail.room.id, user?.id] }),
    onError: (error) => Alert.alert("Roll failed", error instanceof Error ? error.message : "Please try again."),
  });
  const lastMove = useMemo(() => detail.moves[detail.moves.length - 1], [detail.moves]);

  return (
    <View style={styles.card}>
      <View style={styles.gameHeader}>
        <Text style={styles.cardTitle}>Snake & Ladder</Text>
        <Text style={styles.turnText}>{match.status === "completed" ? "Completed" : isMyTurn ? "Your roll" : "Waiting turn"}</Text>
      </View>
      <View style={styles.positionList}>
        {detail.members.map((member) => (
          <View key={member.id || member.userId} style={styles.positionRow}>
            <Text style={styles.positionName}>{member.profile?.name ?? "Player"}</Text>
            <Text style={styles.positionValue}>Square {member.position}</Text>
          </View>
        ))}
      </View>
      {lastMove ? <MoveSummary move={lastMove} /> : <Text style={styles.helperText}>No rolls yet. The first turn starts after the host starts the match.</Text>}
      <ActionButton
        label={mutation.isPending ? "Rolling..." : "Roll dice"}
        icon={Dice6}
        disabled={!isMyTurn || mutation.isPending}
        onPress={() => mutation.mutate()}
      />
    </View>
  );
}

function MoveSummary({ move }: { move: GameMove }) {
  return (
    <View style={styles.moveSummary}>
      <Send color="#16a34a" size={18} />
      <Text style={styles.moveText}>
        Last roll: {move.profile?.name ?? "Player"} rolled {move.dice ?? "-"} • {move.fromPosition ?? 0} → {move.toPosition ?? 0}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  icon: Icon,
  disabled,
  variant = "dark",
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  variant?: "dark" | "light";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, variant === "light" && styles.actionLight, disabled && styles.disabledAction]}
    >
      <Icon color={variant === "light" ? "#0f172a" : "#ffffff"} size={18} />
      <Text style={[styles.actionText, variant === "light" && styles.actionLightText]} numberOfLines={1}>{label}</Text>
    </Pressable>
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  quickRoomIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  title: { fontSize: 28, fontWeight: "900", color: "#0f172a" },
  subtitle: { color: "#64748b", fontSize: 14, marginTop: 2, fontWeight: "700" },
  arcadeHero: { backgroundColor: "#ecfdf3", borderRadius: 28, borderWidth: 1, borderColor: "#bbf7d0", padding: 20, flexDirection: "row", gap: 14, justifyContent: "space-between", marginBottom: 14 },
  orangeHero: { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
  purpleHero: { backgroundColor: "#faf5ff", borderColor: "#e9d5ff" },
  arcadeEyebrow: { color: "#16a34a", fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  orangeText: { color: "#f97316" },
  purpleText: { color: "#9333ea" },
  arcadeTitle: { color: "#0f172a", fontSize: 26, fontWeight: "900", marginTop: 6 },
  arcadeText: { color: "#475569", fontSize: 15, lineHeight: 22, fontWeight: "700", marginTop: 8, maxWidth: 390 },
  quickScoreRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  miniScore: { flex: 1, backgroundColor: "#ffffff", borderRadius: 22, borderWidth: 1, borderColor: "#e5e7eb", paddingVertical: 16, alignItems: "center" },
  miniScoreValue: { fontSize: 25, fontWeight: "900" },
  miniScoreLabel: { color: "#64748b", fontSize: 13, fontWeight: "900", marginTop: 2 },
  quickBoardCard: { backgroundColor: "#ffffff", borderRadius: 28, borderWidth: 1, borderColor: "#e5e7eb", padding: 16, marginBottom: 16 },
  ticBoardLarge: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  ticCellLarge: { width: "30.8%", aspectRatio: 1, borderRadius: 24, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  ticCellX: { backgroundColor: "#ecfdf3", borderColor: "#86efac" },
  ticCellO: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" },
  ticTextLarge: { color: "#0f172a", fontSize: 48, fontWeight: "900" },
  secondaryFullButton: { minHeight: 52, borderRadius: 18, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryFullText: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  snakeBoard: { flexDirection: "row", flexWrap: "wrap", gap: 3, backgroundColor: "#f1f5f9", borderRadius: 20, padding: 8, marginBottom: 12 },
  snakeCell: { width: "9.1%", aspectRatio: 1, borderRadius: 8, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  snakeCellTrap: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  snakeCellBoost: { backgroundColor: "#ecfdf3", borderColor: "#bbf7d0" },
  snakeCellText: { color: "#64748b", fontSize: 9, fontWeight: "900" },
  tokenRow: { position: "absolute", bottom: 1, flexDirection: "row", gap: 1 },
  youToken: { overflow: "hidden", backgroundColor: "#16a34a", color: "#ffffff", borderRadius: 999, fontSize: 8, fontWeight: "900", paddingHorizontal: 3 },
  botToken: { overflow: "hidden", backgroundColor: "#2563eb", color: "#ffffff", borderRadius: 999, fontSize: 8, fontWeight: "900", paddingHorizontal: 3 },
  snakeLegend: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  legendText: { color: "#64748b", fontSize: 12, fontWeight: "800" },
  memoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  memoryCard: { width: "30.8%", aspectRatio: 1, borderRadius: 24, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center" },
  memoryCardVisible: { backgroundColor: "#faf5ff", borderColor: "#d8b4fe" },
  memoryCardMatched: { backgroundColor: "#ecfdf3", borderColor: "#86efac" },
  memoryText: { color: "#0f172a", fontSize: 36, fontWeight: "900" },
  roomSummary: { backgroundColor: "#ecfdf3", borderRadius: 26, borderWidth: 1, borderColor: "#bbf7d0", padding: 20, flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  summaryLabel: { color: "#15803d", fontSize: 13, fontWeight: "900" },
  summaryValue: { color: "#0f172a", fontSize: 24, fontWeight: "900", marginTop: 4 },
  summaryRight: { alignItems: "flex-end" },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  actionButton: { flex: 1, minHeight: 52, borderRadius: 18, backgroundColor: "#020617", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  actionLight: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0" },
  disabledAction: { opacity: 0.45 },
  actionText: { color: "#ffffff", fontSize: 15, fontWeight: "900", flexShrink: 1 },
  actionLightText: { color: "#0f172a" },
  card: { backgroundColor: "#ffffff", borderRadius: 26, padding: 18, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 16 },
  cardTitle: { color: "#0f172a", fontSize: 22, fontWeight: "900" },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#15803d", fontSize: 18, fontWeight: "900" },
  memberBody: { flex: 1 },
  memberName: { color: "#0f172a", fontSize: 17, fontWeight: "900" },
  memberMeta: { color: "#64748b", fontSize: 13, fontWeight: "700", marginTop: 2 },
  youPill: { color: "#1d4ed8", backgroundColor: "#dbeafe", overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontWeight: "900" },
  gameHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  turnText: { color: "#16a34a", fontSize: 14, fontWeight: "900" },
  ticBoard: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ticCell: { width: "30.9%", aspectRatio: 1, borderRadius: 18, backgroundColor: "#ecfdf3", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#bbf7d0" },
  ticCellDisabled: { backgroundColor: "#f8fafc" },
  ticText: { color: "#0f172a", fontSize: 42, fontWeight: "900" },
  ticTextO: { color: "#2563eb" },
  positionList: { gap: 8, marginBottom: 12 },
  positionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#f8fafc", borderRadius: 16, padding: 12 },
  positionName: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  positionValue: { color: "#16a34a", fontSize: 15, fontWeight: "900" },
  helperText: { color: "#64748b", fontSize: 14, fontWeight: "700", marginBottom: 12 },
  moveSummary: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "#f8fafc", borderRadius: 16, padding: 12, marginBottom: 12 },
  moveText: { flex: 1, color: "#475569", fontSize: 14, fontWeight: "800" },
  stateCard: { minHeight: 240, borderRadius: 28, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center", padding: 24, marginTop: 12 },
  stateTitle: { color: "#0f172a", fontSize: 23, fontWeight: "900", textAlign: "center" },
  stateMessage: { color: "#64748b", fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 10 },
  retryButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#16a34a", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, marginTop: 18 },
  retryText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
});
