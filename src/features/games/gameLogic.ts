import type { GameKind, GameRoom, GameRoomMember } from "./types";

export const TIC_TAC_TOE_EMPTY_CELLS = Array.from({ length: 9 }, () => "");

export const SNAKES: Record<number, number> = {
  17: 7,
  54: 34,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  99: 78,
};

export const LADDERS: Record<number, number> = {
  4: 14,
  9: 31,
  20: 38,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
};

export function gameLabel(gameKind: GameKind) {
  return gameKind === "tic_tac_toe" ? "Tic-Tac-Toe" : "Snake & Ladder";
}

export function normalizePlayerLimit(gameKind: GameKind, value: number) {
  if (gameKind === "tic_tac_toe") return 2;
  if (!Number.isFinite(value)) return 2;
  return Math.min(4, Math.max(2, Math.trunc(value)));
}

export function normalizeEntryPoints(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1000, Math.trunc(value));
}

export function calculateWinRate(wins: number, played: number) {
  if (!played) return 0;
  return Math.round((wins / played) * 100);
}

export function getTicTacToeWinner(cells: string[]) {
  if (!Array.isArray(cells) || cells.length !== 9) return null;
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const line of lines) {
    const [a, b, c] = line;
    const symbol = cells[a];
    if (symbol && symbol === cells[b] && symbol === cells[c]) {
      return { symbol, line };
    }
  }
  return null;
}

export function pickTicTacToeBotMove(cells: string[], botSymbol: "X" | "O" = "O") {
  if (!Array.isArray(cells) || cells.length !== 9) return null;
  const emptyCells = cells
    .map((value, index) => (value ? null : index))
    .filter((index): index is number => index !== null);

  if (!emptyCells.length) return null;

  const humanSymbol = botSymbol === "O" ? "X" : "O";
  const winningMove = findTicTacToeMove(cells, emptyCells, botSymbol);
  if (winningMove !== null) return winningMove;

  const blockingMove = findTicTacToeMove(cells, emptyCells, humanSymbol);
  if (blockingMove !== null) return blockingMove;

  if (emptyCells.includes(4)) return 4;

  const corner = [0, 2, 6, 8].find((index) => emptyCells.includes(index));
  if (corner !== undefined) return corner;

  return emptyCells[0];
}

function findTicTacToeMove(cells: string[], emptyCells: number[], symbol: "X" | "O") {
  for (const index of emptyCells) {
    const next = [...cells];
    next[index] = symbol;
    if (getTicTacToeWinner(next)?.symbol === symbol) return index;
  }
  return null;
}

export function applyTicTacToeMove(input: {
  cells: string[];
  cellIndex: number;
  symbol: "X" | "O";
  activeSymbol: "X" | "O";
}) {
  const { cells, cellIndex, symbol, activeSymbol } = input;
  if (symbol !== activeSymbol) throw new Error("It is not your turn.");
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) {
    throw new Error("Choose a valid cell.");
  }
  if (cells[cellIndex]) throw new Error("That cell is already taken.");

  const next = [...cells];
  next[cellIndex] = symbol;
  const winner = getTicTacToeWinner(next);
  return {
    cells: next,
    winner,
    isDraw: !winner && next.every(Boolean),
    nextSymbol: symbol === "X" ? "O" : "X",
  };
}

export function applySnakeLadderRoll(position: number, dice: number) {
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) {
    throw new Error("Dice must be between 1 and 6.");
  }
  const rawTo = position + dice;
  if (rawTo > 100) {
    return { from: position, rawTo, to: position, jumped: false, exactWinBlocked: true };
  }
  const jumpTo = SNAKES[rawTo] ?? LADDERS[rawTo] ?? null;
  return {
    from: position,
    rawTo,
    to: jumpTo ?? rawTo,
    jumped: jumpTo !== null,
    exactWinBlocked: false,
  };
}

export function canJoinRoom(room: GameRoom | null, members: GameRoomMember[], userId: string) {
  if (!room) return "Room not found.";
  if (!userId) return "Sign in first.";
  if (members.some((member) => member.userId === userId || member.user_id === userId)) {
    return "You are already in this room.";
  }
  if (room.status === "completed" || room.status === "cancelled") return "This room is already closed.";
  if (room.status === "starting" || room.status === "in_game") return "This game has already started.";
  const limit = room.playerLimit ?? room.player_limit ?? 2;
  const count = members.filter((member) => member.status === "active").length || room.memberCount || room.member_count || 0;
  if (count >= limit || room.status === "full") return "This room is full.";
  return null;
}

export function canStartRoom(room: GameRoom | null, members: GameRoomMember[], userId: string) {
  if (!room) return "Room not found.";
  if (!userId) return "Sign in first.";
  if ((room.hostId ?? room.host_id) !== userId) return "Only the host can start this game.";
  if (room.status !== "open" && room.status !== "full") return "This game cannot be started now.";
  const activeCount = members.filter((member) => member.status === "active").length;
  if (activeCount < 2) return "At least 2 players are needed.";
  if ((room.gameKind ?? room.game_kind) === "tic_tac_toe" && activeCount !== 2) {
    return "Tic-Tac-Toe needs exactly 2 players.";
  }
  return null;
}
