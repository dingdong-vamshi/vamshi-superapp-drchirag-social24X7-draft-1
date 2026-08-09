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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
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
  const [lastMove, setLastMove] = useState<number | null>(null);
  const resultPulse = useRef(new Animated.Value(0)).current;
  const winner = getTicTacToeWinner(cells);
  const isDraw = !winner && cells.every(Boolean);
  const winningLine = winner?.line ?? [];

  const resetBoard = useCallback(() => {
    setCells([...TIC_TAC_TOE_EMPTY_CELLS]);
    setTurn("X");
    setRoundOver(false);
    setLastMove(null);
    resultPulse.setValue(0);
  }, [resultPulse]);

  useEffect(() => {
    if (roundOver) return;
    if (winner || isDraw) {
      setRoundOver(true);
      setScore((current) => ({
        you: current.you + (winner?.symbol === "X" ? 1 : 0),
        bot: current.bot + (winner?.symbol === "O" ? 1 : 0),
        draws: current.draws + (isDraw ? 1 : 0),
      }));
      Animated.sequence([
        Animated.timing(resultPulse, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(resultPulse, {
          toValue: 0,
          duration: 180,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isDraw, resultPulse, roundOver, winner]);

  useEffect(() => {
    if (turn !== "O" || winner || isDraw) return undefined;
    const timeout = setTimeout(() => {
      const botMove = pickTicTacToeBotMove(cells);
      if (botMove === null) return;
      const next = applyTicTacToeMove({ cells, cellIndex: botMove, symbol: "O", activeSymbol: "O" });
      if (!next) return;
      setCells(next.cells);
      setLastMove(botMove);
      setTurn("X");
    }, 420);
    return () => clearTimeout(timeout);
  }, [cells, isDraw, turn, winner]);

  const status = winner?.symbol === "X" ? "You won this round" : winner?.symbol === "O" ? "Bot won this round" : isDraw ? "Draw game" : turn === "X" ? "Your move" : "Bot is thinking...";
  const resultScale = resultPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <>
      <View style={[styles.arcadeHero, styles.ticHero]}>
        <View pointerEvents="none" style={[styles.heroGlowOne, styles.ticGlowOne]} />
        <View pointerEvents="none" style={[styles.heroGlowTwo, styles.ticGlowTwo]} />
        <View style={styles.heroCopy}>
          <Text style={styles.arcadeEyebrow}>Quick match</Text>
          <Text style={styles.arcadeTitle}>{status}</Text>
          <Text style={styles.arcadeText}>Play X. The bot blocks wins, takes winning moves, and grabs the center.</Text>
        </View>
        <View style={styles.heroIconOrb}>
          <Sparkles color="#86efac" size={32} />
        </View>
      </View>

      <View style={styles.playerCardRow}>
        <QuickPlayerCard title="You" mark="X" active={turn === "X" && !roundOver} score={score.you} color="#16a34a" />
        <QuickPlayerCard title="Bot" mark="O" active={turn === "O" && !roundOver} score={score.bot} color="#2563eb" />
      </View>

      <View style={styles.quickScoreRow}>
        <MiniScore label="You" value={score.you} color="#16a34a" />
        <MiniScore label="Bot" value={score.bot} color="#2563eb" />
        <MiniScore label="Draws" value={score.draws} color="#64748b" />
      </View>

      <View style={[styles.quickBoardCard, styles.ticBoardCard]}>
        <GameParticleLayer active={roundOver && winner?.symbol === "X"} tone="#22c55e" />
        <View style={styles.ticBoardFrame}>
          <View pointerEvents="none" style={styles.ticBoardAura} />
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
                setLastMove(index);
                setTurn("O");
              }}
              style={({ pressed }) => [
                styles.ticCellLarge,
                value && styles.ticCellOccupied,
                value === "X" && styles.ticCellX,
                value === "O" && styles.ticCellO,
                lastMove === index && styles.ticCellLastMove,
                winningLine.includes(index) && styles.ticCellWinner,
                pressed && styles.pressedCell,
              ]}
            >
              <TicMark value={value as "X" | "O" | null} />
            </Pressable>
          ))}
          </View>
          <TicWinLine line={winningLine} />
        </View>
        {roundOver ? (
          <Animated.View style={[styles.resultCard, { transform: [{ scale: resultScale }] }]}>
            <Trophy color={winner?.symbol === "O" ? "#2563eb" : "#16a34a"} size={22} />
            <View style={styles.resultCopy}>
              <Text style={styles.resultTitle}>{isDraw ? "Clean draw" : winner?.symbol === "X" ? "You took the round" : "Bot took the round"}</Text>
              <Text style={styles.resultText}>{isDraw ? "Nobody broke through. Run it back." : "Winning cells are highlighted. Tap rematch for a fresh board."}</Text>
            </View>
          </Animated.View>
        ) : null}
        <Pressable accessibilityRole="button" onPress={resetBoard} style={styles.secondaryFullButton}>
          <RotateCcw color="#0f172a" size={18} />
          <Text style={styles.secondaryFullText}>{roundOver ? "Rematch" : "Reset board"}</Text>
        </Pressable>
      </View>
    </>
  );
}

function QuickSnakeLadder() {
  const [positions, setPositions] = useState({ you: 1, kai: 1 });
  const [displayPositions, setDisplayPositions] = useState({ you: 1, kai: 1 });
  const [turn, setTurn] = useState<"you" | "kai">("you");
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [log, setLog] = useState("Roll the dice to begin. Exact 100 wins.");
  const [winner, setWinner] = useState<"you" | "kai" | null>(null);
  const [rolling, setRolling] = useState(false);
  const [effectSquare, setEffectSquare] = useState<{ from: number; to: number; type: "snake" | "ladder" } | null>(null);
  const diceAnim = useRef(new Animated.Value(0)).current;
  const moveTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearMoveTimers = useCallback(() => {
    moveTimers.current.forEach(clearTimeout);
    moveTimers.current = [];
  }, []);

  useEffect(() => clearMoveTimers, [clearMoveTimers]);

  const reset = useCallback(() => {
    clearMoveTimers();
    setPositions({ you: 1, kai: 1 });
    setDisplayPositions({ you: 1, kai: 1 });
    setTurn("you");
    setLastRoll(null);
    setLog("Roll the dice to begin. Exact 100 wins.");
    setWinner(null);
    setRolling(false);
    setEffectSquare(null);
    diceAnim.setValue(0);
  }, [clearMoveTimers, diceAnim]);

  const rollFor = useCallback((player: "you" | "kai") => {
    if (winner || rolling) return;
    clearMoveTimers();
    setRolling(true);
    setEffectSquare(null);
    const dice = Math.floor(Math.random() * 6) + 1;
    Animated.sequence([
      Animated.timing(diceAnim, {
        toValue: 1,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(diceAnim, {
        toValue: 0,
        duration: 210,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    setLastRoll(dice);
    const from = positions[player];
    const result = applySnakeLadderRoll(from, dice);
    const nextPosition = result.to;
    const rawDestination = result.rawTo;
    const label = player === "you" ? "You" : "Kai";
    const jumpType = SNAKES[rawDestination] ? "snake" : LADDERS[rawDestination] ? "ladder" : null;
    let detail = `${label} rolled ${dice}: ${from} → ${nextPosition}.`;
    if (result.exactWinBlocked) detail = `${label} needs exact 100 and stays on ${from}.`;
    if (jumpType === "snake") detail = `${label} landed on ${rawDestination}, then slid to ${nextPosition}.`;
    if (jumpType === "ladder") detail = `${label} landed on ${rawDestination}, then climbed to ${nextPosition}.`;
    setLog(detail);
    setPositions((current) => ({ ...current, [player]: nextPosition }));

    if (result.exactWinBlocked || rawDestination === from) {
      const timer = setTimeout(() => {
        setRolling(false);
        setTurn(player === "you" ? "kai" : "you");
      }, 460);
      moveTimers.current.push(timer);
      return;
    }

    const direction = rawDestination > from ? 1 : -1;
    const path = Array.from({ length: Math.abs(rawDestination - from) }, (_, index) => from + direction * (index + 1));
    path.forEach((square, index) => {
      const timer = setTimeout(() => {
        setDisplayPositions((current) => ({ ...current, [player]: square }));
      }, 140 * (index + 1));
      moveTimers.current.push(timer);
    });

    const jumpTimer = setTimeout(() => {
      if (jumpType) setEffectSquare({ from: rawDestination, to: nextPosition, type: jumpType });
      setDisplayPositions((current) => ({ ...current, [player]: nextPosition }));
    }, 140 * path.length + 280);
    const finishTimer = setTimeout(() => {
      if (nextPosition === 100) {
        setWinner(player);
      } else {
        setTurn(player === "you" ? "kai" : "you");
      }
      setRolling(false);
    }, 140 * path.length + 620);
    moveTimers.current.push(jumpTimer, finishTimer);
  }, [clearMoveTimers, diceAnim, positions, rolling, winner]);

  useEffect(() => {
    if (turn !== "kai" || winner || rolling) return undefined;
    const timeout = setTimeout(() => rollFor("kai"), 700);
    return () => clearTimeout(timeout);
  }, [rollFor, rolling, turn, winner]);

  const boardCells = useMemo(() => Array.from({ length: 100 }, (_, index) => 100 - index), []);
  const diceScale = diceAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const diceRotate = diceAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "16deg"] });

  return (
    <>
      <View style={[styles.arcadeHero, styles.orangeHero]}>
        <View pointerEvents="none" style={[styles.heroGlowOne, styles.orangeGlowOne]} />
        <View pointerEvents="none" style={[styles.heroGlowTwo, styles.orangeGlowTwo]} />
        <View style={styles.heroCopy}>
          <Text style={[styles.arcadeEyebrow, styles.orangeText]}>Dice race</Text>
          <Text style={styles.arcadeTitle}>{winner ? `${winner === "you" ? "You win" : "Kai wins"}!` : rolling ? "Dice in motion..." : turn === "you" ? "Your roll" : "Kai is rolling..."}</Text>
          <Text style={styles.arcadeText}>{log}</Text>
        </View>
        <Animated.View style={[styles.diceBadge, { transform: [{ scale: diceScale }, { rotate: diceRotate }] }]}>
          <Text style={styles.diceText}>{lastRoll ?? "🎲"}</Text>
        </Animated.View>
      </View>

      <View style={styles.quickScoreRow}>
        <MiniScore label="You" value={displayPositions.you} color="#16a34a" />
        <MiniScore label="Dice" value={lastRoll ?? "—"} color="#f97316" />
        <MiniScore label="Kai" value={displayPositions.kai} color="#2563eb" />
      </View>

      <View style={[styles.quickBoardCard, styles.snakeBoardCard]}>
        <GameParticleLayer active={Boolean(winner)} tone={winner === "kai" ? "#3b82f6" : "#fb923c"} />
        <View style={styles.snakeBoardShell}>
          <View pointerEvents="none" style={styles.snakeBoardTrackGlow} />
          <View style={styles.snakeBoard}>
          {boardCells.map((cell) => {
            const hasYou = displayPositions.you === cell;
            const hasKai = displayPositions.kai === cell;
            const isSnake = Boolean(SNAKES[cell]);
            const isLadder = Boolean(LADDERS[cell]);
            const isEffectSquare = effectSquare?.from === cell || effectSquare?.to === cell;
            return (
              <View key={cell} style={[styles.snakeCell, cell % 2 === 0 && styles.snakeCellOdd, isSnake && styles.snakeCellTrap, isLadder && styles.snakeCellBoost, isEffectSquare && styles.snakeCellEffect, (hasYou || hasKai) && styles.snakeCellOccupied]}>
                <Text style={styles.snakeCellText}>{cell}</Text>
                <SnakeBoardMarker type={isSnake ? "snake" : isLadder ? "ladder" : undefined} />
                <View style={styles.tokenRow}>
                  {hasYou ? <SnakeToken label="Y" tone="#16a34a" active={turn === "you" && !winner} /> : null}
                  {hasKai ? <SnakeToken label="K" tone="#2563eb" active={turn === "kai" && !winner} /> : null}
                </View>
              </View>
            );
          })}
          </View>
        </View>
        <View style={styles.snakeLegend}>
          <Text style={styles.legendText}>🪜 Ladders boost you</Text>
          <Text style={styles.legendText}>🐍 Snakes pull you down</Text>
        </View>
        {effectSquare ? (
          <View style={[styles.eventStrip, effectSquare.type === "snake" ? styles.snakeEvent : styles.ladderEvent]}>
            <Text style={styles.eventText}>{effectSquare.type === "snake" ? "Snake slide" : "Ladder climb"}: {effectSquare.from} → {effectSquare.to}</Text>
          </View>
        ) : null}
        {winner ? (
          <GameResultCard
            title={winner === "you" ? "You reached 100!" : "Kai reached 100"}
            message="Exact finish complete. Start a rematch when you are ready."
            accent={winner === "you" ? "#16a34a" : "#2563eb"}
          />
        ) : null}
        <View style={styles.actionRow}>
          <ActionButton label={turn === "you" && !winner ? (rolling ? "Rolling..." : "Roll dice") : "Waiting"} icon={Dice6} disabled={turn !== "you" || Boolean(winner) || rolling} onPress={() => rollFor("you")} />
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
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [moves, setMoves] = useState(0);
  const matchedCount = deck.filter((card) => card.matched).length;
  const completed = matchedCount === deck.length;

  const reset = useCallback(() => {
    setDeck(buildMemoryDeck());
    setFlipped([]);
    setMismatchIds([]);
    setLocked(false);
    setMoves(0);
  }, []);

  useEffect(() => {
    if (flipped.length !== 2) return undefined;
    setLocked(true);
    const [firstId, secondId] = flipped;
    const first = deck.find((card) => card.id === firstId);
    const second = deck.find((card) => card.id === secondId);
    const isMatch = Boolean(first && second && first.symbol === second.symbol);
    if (!isMatch) setMismatchIds([firstId, secondId]);
    const timeout = setTimeout(() => {
      if (isMatch && first && second) {
        setDeck((current) => current.map((card) => (card.id === first.id || card.id === second.id ? { ...card, matched: true } : card)));
      }
      setMismatchIds([]);
      setFlipped([]);
      setLocked(false);
    }, isMatch ? 520 : 720);
    return () => clearTimeout(timeout);
  }, [deck, flipped]);

  return (
    <>
      <View style={[styles.arcadeHero, styles.purpleHero]}>
        <View pointerEvents="none" style={[styles.heroGlowOne, styles.purpleGlowOne]} />
        <View pointerEvents="none" style={[styles.heroGlowTwo, styles.purpleGlowTwo]} />
        <View style={styles.heroCopy}>
          <Text style={[styles.arcadeEyebrow, styles.purpleText]}>Memory sprint</Text>
          <Text style={styles.arcadeTitle}>{completed ? "Board cleared!" : "Find every pair"}</Text>
          <Text style={styles.arcadeText}>{completed ? `Finished in ${moves} moves. Try a cleaner run.` : "Flip two cards. Matching pairs stay open."}</Text>
        </View>
        <View style={styles.heroIconOrb}>
          <Brain color="#d8b4fe" size={34} />
        </View>
      </View>

      <View style={styles.quickScoreRow}>
        <MiniScore label="Moves" value={moves} color="#9333ea" />
        <MiniScore label="Pairs" value={`${matchedCount / 2}/6`} color="#16a34a" />
        <MiniScore label="Left" value={(deck.length - matchedCount) / 2} color="#64748b" />
      </View>

      <View style={[styles.quickBoardCard, styles.memoryBoardCard]}>
        <GameParticleLayer active={completed} tone="#c084fc" />
        <View style={styles.memoryTable}>
          <View pointerEvents="none" style={styles.memoryTableGlow} />
          <View style={styles.memoryGrid}>
          {deck.map((card) => {
            const visible = card.matched || flipped.includes(card.id);
            const mismatch = mismatchIds.includes(card.id);
            return (
              <MemoryFlipCard
                key={card.id}
                card={card}
                visible={visible}
                mismatch={mismatch}
                disabled={visible || locked || flipped.length === 2}
                onPress={() => {
                  if (locked || visible || flipped.includes(card.id)) return;
                  setFlipped((current) => [...current, card.id]);
                  if (flipped.length === 1) setMoves((current) => current + 1);
                }}
              />
            );
          })}
          </View>
        </View>
        {completed ? (
          <GameResultCard
            title="Memory board cleared"
            message={`You matched all pairs in ${moves} moves. Shuffle for a faster run.`}
            accent="#9333ea"
          />
        ) : null}
        <Pressable accessibilityRole="button" onPress={reset} style={styles.secondaryFullButton}>
          <RotateCcw color="#0f172a" size={18} />
          <Text style={styles.secondaryFullText}>Shuffle again</Text>
        </Pressable>
      </View>
    </>
  );
}

function QuickPlayerCard({
  title,
  mark,
  score,
  active,
  color,
}: {
  title: string;
  mark: string;
  score: number;
  active: boolean;
  color: string;
}) {
  return (
    <View style={[styles.quickPlayerCard, active && { backgroundColor: `${color}18`, boxShadow: `0px 14px 30px ${color}35` }]}>
      <View style={[styles.playerMark, { backgroundColor: `${color}18` }]}>
        <Text style={[styles.playerMarkText, { color }]}>{mark}</Text>
      </View>
      <View>
        <Text style={styles.playerTitle}>{title}</Text>
        <Text style={styles.playerMeta}>{active ? "turn now" : `${score} wins`}</Text>
      </View>
    </View>
  );
}

function MemoryFlipCard({
  card,
  visible,
  mismatch,
  disabled,
  onPress,
}: {
  card: MemoryCard;
  visible: boolean;
  mismatch: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const flip = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(flip, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [flip, visible]);

  useEffect(() => {
    if (!mismatch) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  }, [mismatch, shake]);

  const scale = flip.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const translateX = shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-6, 0, 6] });
  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <Animated.View style={[styles.memoryCardShell, { transform: [{ scale }, { translateX }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? `Card ${card.symbol}` : "Hidden memory card"}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.memoryCardTapTarget, pressed && styles.pressedCell]}
      >
        <Animated.View style={[styles.memoryCardFace, styles.memoryCardBack, mismatch && styles.memoryCardMismatch, { transform: [{ rotateY: backRotate }] }]}>
          <View pointerEvents="none" style={styles.memoryBackOrb} />
          <Text style={styles.memoryBackGlyph}>?</Text>
        </Animated.View>
        <Animated.View style={[styles.memoryCardFace, styles.memoryCardFront, card.matched && styles.memoryCardMatched, mismatch && styles.memoryCardMismatch, { transform: [{ rotateY: frontRotate }] }]}>
          <Text style={styles.memoryText}>{card.symbol}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function TicMark({ value }: { value: "X" | "O" | null }) {
  if (!value) return <View style={styles.emptyMarkSpark} />;
  if (value === "O") {
    return (
      <View style={styles.oMarkOuter}>
        <View style={styles.oMarkInner} />
        <View style={styles.oMarkShine} />
      </View>
    );
  }
  return (
    <View style={styles.xMarkWrap}>
      <View style={[styles.xStroke, styles.xStrokeLeft]} />
      <View style={[styles.xStroke, styles.xStrokeRight]} />
    </View>
  );
}

function TicWinLine({ line }: { line: number[] }) {
  if (line.length !== 3) return null;
  const key = line.join("-");
  return <View pointerEvents="none" style={[styles.ticWinLine, ticWinLineStyles[key] ?? ticWinLineStyles.mid]} />;
}

const ticWinLineStyles: Record<string, ViewStyle> = {
  mid: { top: "50%", left: "4%", width: "92%" },
  "0-1-2": { top: "16.5%", left: "4%", width: "92%" },
  "3-4-5": { top: "50%", left: "4%", width: "92%" },
  "6-7-8": { top: "83.5%", left: "4%", width: "92%" },
  "0-3-6": { left: "16.5%", top: "4%", height: "92%", width: 8 },
  "1-4-7": { left: "50%", top: "4%", height: "92%", width: 8 },
  "2-5-8": { left: "83.5%", top: "4%", height: "92%", width: 8 },
  "0-4-8": { top: "50%", transform: [{ rotate: "45deg" }], width: "132%", left: "-16%" },
  "2-4-6": { top: "50%", transform: [{ rotate: "-45deg" }], width: "132%", left: "-16%" },
};

function GameParticleLayer({ active, tone }: { active: boolean; tone: string }) {
  if (!active) return null;
  return (
    <View pointerEvents="none" style={styles.particleLayer}>
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <View
          key={item}
          style={[
            styles.particleDot,
            {
              backgroundColor: tone,
              left: `${12 + item * 14}%`,
              top: `${10 + (item % 3) * 26}%`,
              opacity: 0.18 + item * 0.06,
            },
          ]}
        />
      ))}
    </View>
  );
}

function SnakeBoardMarker({ type }: { type?: "snake" | "ladder" }) {
  if (!type) return null;
  return <Text style={[styles.snakeMarker, type === "snake" ? styles.snakeMarkerTrap : styles.snakeMarkerBoost]}>{type === "snake" ? "🐍" : "🪜"}</Text>;
}

function SnakeToken({ label, tone, active }: { label: string; tone: string; active: boolean }) {
  return (
    <View style={[styles.snakeToken, { backgroundColor: tone, boxShadow: active ? `0px 0px 14px ${tone}` : "0px 4px 10px rgba(15,23,42,0.25)" }]}>
      <Text style={styles.snakeTokenText}>{label}</Text>
    </View>
  );
}

function GameResultCard({ title, message, accent }: { title: string; message: string; accent: string }) {
  return (
    <View style={[styles.resultCard, { borderColor: `${accent}55`, backgroundColor: `${accent}0f` }]}>
      <Trophy color={accent} size={22} />
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle}>{title}</Text>
        <Text style={styles.resultText}>{message}</Text>
      </View>
    </View>
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
  safe: { flex: 1, backgroundColor: "#f6f8fb" },
  content: { padding: 20, paddingBottom: 44, width: "100%", maxWidth: 560, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", boxShadow: "0px 10px 22px rgba(15,23,42,0.10)" },
  quickRoomIcon: { width: 46, height: 46, borderRadius: 18, alignItems: "center", justifyContent: "center", boxShadow: "0px 12px 24px rgba(15,23,42,0.10)" },
  headerText: { flex: 1 },
  title: { fontSize: 28, fontWeight: "900", color: "#0f172a" },
  subtitle: { color: "#64748b", fontSize: 14, marginTop: 2, fontWeight: "700" },
  arcadeHero: { minHeight: 168, borderRadius: 34, padding: 22, flexDirection: "row", gap: 16, justifyContent: "space-between", marginBottom: 16, overflow: "hidden", backgroundColor: "#082f1f", boxShadow: "0px 24px 52px rgba(15,23,42,0.18)" },
  ticHero: { backgroundColor: "#061c16" },
  orangeHero: { backgroundColor: "#321407" },
  purpleHero: { backgroundColor: "#22103a" },
  heroGlowOne: { position: "absolute", width: 190, height: 190, borderRadius: 95, top: -72, right: -42, opacity: 0.58 },
  heroGlowTwo: { position: "absolute", width: 150, height: 150, borderRadius: 75, bottom: -68, left: -36, opacity: 0.38 },
  ticGlowOne: { backgroundColor: "#22c55e" },
  ticGlowTwo: { backgroundColor: "#064e3b" },
  orangeGlowOne: { backgroundColor: "#fb923c" },
  orangeGlowTwo: { backgroundColor: "#7c2d12" },
  purpleGlowOne: { backgroundColor: "#a855f7" },
  purpleGlowTwo: { backgroundColor: "#4c1d95" },
  heroCopy: { flex: 1, zIndex: 2 },
  heroIconOrb: { zIndex: 2, width: 72, height: 72, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.13)", boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.35), 0px 18px 34px rgba(0,0,0,0.18)" },
  arcadeEyebrow: { color: "#bbf7d0", fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  orangeText: { color: "#fed7aa" },
  purpleText: { color: "#e9d5ff" },
  arcadeTitle: { color: "#ffffff", fontSize: 27, fontWeight: "900", marginTop: 6, letterSpacing: -0.4 },
  arcadeText: { color: "rgba(255,255,255,0.76)", fontSize: 15, lineHeight: 22, fontWeight: "700", marginTop: 8, maxWidth: 390 },
  quickScoreRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  playerCardRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  quickPlayerCard: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 24, backgroundColor: "#ffffff", padding: 13, boxShadow: "0px 14px 30px rgba(15,23,42,0.08)" },
  playerMark: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  playerMarkText: { fontSize: 23, fontWeight: "900" },
  playerTitle: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  playerMeta: { color: "#64748b", fontSize: 12, fontWeight: "800", marginTop: 2 },
  miniScore: { flex: 1, backgroundColor: "#ffffff", borderRadius: 24, paddingVertical: 17, alignItems: "center", boxShadow: "0px 12px 28px rgba(15,23,42,0.07)" },
  miniScoreValue: { fontSize: 26, fontWeight: "900" },
  miniScoreLabel: { color: "#64748b", fontSize: 13, fontWeight: "900", marginTop: 2 },
  quickBoardCard: { position: "relative", backgroundColor: "#ffffff", borderRadius: 32, padding: 16, marginBottom: 16, overflow: "hidden", boxShadow: "0px 24px 50px rgba(15,23,42,0.11)" },
  ticBoardCard: { backgroundColor: "#051f17", padding: 18 },
  ticBoardFrame: { position: "relative", borderRadius: 30, padding: 13, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden", marginBottom: 14 },
  ticBoardAura: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "#22c55e", opacity: 0.16, top: -46, right: -56 },
  ticBoardLarge: { zIndex: 2, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ticCellLarge: { width: "30.8%", aspectRatio: 1, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.18), 0px 10px 18px rgba(0,0,0,0.18)" },
  ticCellOccupied: { backgroundColor: "rgba(255,255,255,0.18)" },
  ticCellX: { backgroundColor: "rgba(34,197,94,0.22)" },
  ticCellO: { backgroundColor: "rgba(59,130,246,0.20)" },
  ticCellLastMove: { boxShadow: "0px 0px 24px rgba(34,197,94,0.45)" },
  ticCellWinner: { backgroundColor: "rgba(250,204,21,0.25)", boxShadow: "0px 0px 26px rgba(250,204,21,0.55)" },
  pressedCell: { transform: [{ scale: 0.96 }], opacity: 0.88 },
  ticTextLarge: { color: "#ffffff", fontSize: 48, fontWeight: "900" },
  emptyMarkSpark: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)" },
  oMarkOuter: { width: 50, height: 50, borderRadius: 25, borderWidth: 8, borderColor: "#60a5fa", alignItems: "center", justifyContent: "center", boxShadow: "0px 0px 18px rgba(96,165,250,0.75)" },
  oMarkInner: { width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" },
  oMarkShine: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "#dbeafe", top: 4, right: 8 },
  xMarkWrap: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  xStroke: { position: "absolute", width: 10, height: 58, borderRadius: 999, backgroundColor: "#86efac", boxShadow: "0px 0px 18px rgba(134,239,172,0.8)" },
  xStrokeLeft: { transform: [{ rotate: "45deg" }] },
  xStrokeRight: { transform: [{ rotate: "-45deg" }] },
  ticWinLine: { position: "absolute", height: 8, borderRadius: 999, backgroundColor: "#facc15", zIndex: 4, boxShadow: "0px 0px 22px rgba(250,204,21,0.8)" },
  secondaryFullButton: { minHeight: 54, borderRadius: 20, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0px 14px 28px rgba(15,23,42,0.10)" },
  secondaryFullText: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  resultCard: { borderRadius: 22, backgroundColor: "rgba(255,255,255,0.90)", padding: 14, marginBottom: 14, flexDirection: "row", gap: 10, alignItems: "center", boxShadow: "0px 14px 30px rgba(15,23,42,0.08)" },
  resultCopy: { flex: 1 },
  resultTitle: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  resultText: { color: "#64748b", fontSize: 13, fontWeight: "800", marginTop: 2, lineHeight: 18 },
  diceBadge: { zIndex: 2, width: 66, height: 66, borderRadius: 24, backgroundColor: "#fff7ed", alignItems: "center", justifyContent: "center", boxShadow: "0px 18px 30px rgba(251,146,60,0.28)" },
  diceText: { color: "#f97316", fontSize: 26, fontWeight: "900" },
  snakeBoardCard: { backgroundColor: "#fff7ed", padding: 14 },
  snakeBoardShell: { position: "relative", borderRadius: 30, padding: 10, backgroundColor: "#7c2d12", overflow: "hidden", marginBottom: 12 },
  snakeBoardTrackGlow: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "#facc15", opacity: 0.16, top: -70, left: -60 },
  snakeBoard: { zIndex: 2, flexDirection: "row", flexWrap: "wrap", gap: 3, borderRadius: 22, padding: 8 },
  snakeCell: { width: "9.1%", aspectRatio: 1, borderRadius: 9, backgroundColor: "#fffbeb", alignItems: "center", justifyContent: "center", boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.65)" },
  snakeCellOdd: { backgroundColor: "#fed7aa" },
  snakeCellTrap: { backgroundColor: "#fee2e2" },
  snakeCellBoost: { backgroundColor: "#dcfce7" },
  snakeCellEffect: { boxShadow: "0px 0px 18px rgba(245,158,11,0.9)" },
  snakeCellOccupied: { transform: [{ scale: 1.04 }] },
  snakeCellText: { color: "#7c2d12", fontSize: 9, fontWeight: "900" },
  snakeMarker: { position: "absolute", top: -4, right: -3, fontSize: 12 },
  snakeMarkerTrap: { color: "#dc2626" },
  snakeMarkerBoost: { color: "#16a34a" },
  tokenRow: { position: "absolute", bottom: 1, flexDirection: "row", gap: 1 },
  snakeToken: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  snakeTokenText: { color: "#ffffff", fontSize: 9, fontWeight: "900" },
  youToken: { overflow: "hidden", backgroundColor: "#16a34a", color: "#ffffff", borderRadius: 999, fontSize: 8, fontWeight: "900", paddingHorizontal: 3 },
  botToken: { overflow: "hidden", backgroundColor: "#2563eb", color: "#ffffff", borderRadius: 999, fontSize: 8, fontWeight: "900", paddingHorizontal: 3 },
  snakeLegend: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  legendText: { color: "#7c2d12", fontSize: 12, fontWeight: "900" },
  eventStrip: { borderRadius: 16, padding: 12, marginBottom: 12 },
  snakeEvent: { backgroundColor: "#fee2e2" },
  ladderEvent: { backgroundColor: "#dcfce7" },
  eventText: { color: "#0f172a", fontSize: 13, fontWeight: "900" },
  particleLayer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 1 },
  particleDot: { position: "absolute", width: 14, height: 14, borderRadius: 7 },
  memoryBoardCard: { backgroundColor: "#f5f3ff", padding: 14 },
  memoryTable: { position: "relative", borderRadius: 32, padding: 14, backgroundColor: "#2e1065", overflow: "hidden", marginBottom: 14 },
  memoryTableGlow: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "#a855f7", opacity: 0.22, top: -80, right: -60 },
  memoryGrid: { zIndex: 2, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  memoryCardShell: { width: "30.8%", aspectRatio: 1 },
  memoryCardTapTarget: { width: "100%", height: "100%" },
  memoryCardFace: { position: "absolute", width: "100%", height: "100%", borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden", backfaceVisibility: "hidden", boxShadow: "0px 14px 26px rgba(46,16,101,0.25)" },
  memoryCardBack: { backgroundColor: "#7c3aed" },
  memoryBackOrb: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  memoryBackGlyph: { color: "#f5f3ff", fontSize: 25, fontWeight: "900" },
  memoryCardFront: { backgroundColor: "#ffffff" },
  memoryCardMatched: { backgroundColor: "#dcfce7" },
  memoryCardMismatch: { backgroundColor: "#ffe4e6" },
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
