import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import type {
  CreateGameRoomInput,
  GameAccount,
  GameKind,
  GameMatch,
  GameMove,
  GameProfile,
  GameRoom,
  GameRoomDetail,
  GameRoomMember,
  GameStats,
  GamesDashboard,
} from "./types";

type GameUser = Pick<User, "id" | "app_metadata"> | null | undefined;
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pick<T = unknown>(source: unknown, ...keys: string[]): T | undefined {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key] as T;
  }
  return undefined;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isDemoUser(user: GameUser) {
  return Boolean(user?.id?.startsWith("demo-") || user?.app_metadata?.provider === "demo");
}

export function getGamesUnavailableReason(user: GameUser) {
  if (!supabaseConfigured || !supabase) {
    return "Supabase is not configured for this build. Add the public project URL and publishable key before testing games.";
  }
  if (!user?.id) {
    return "Sign in with a real Supabase account to create and join game rooms.";
  }
  if (isDemoUser(user)) {
    return "Games need a real Supabase account. Demo mode cannot create realtime rooms.";
  }
  return null;
}

function requireGamesClient(user: GameUser) {
  const reason = getGamesUnavailableReason(user);
  if (reason || !supabase) throw new Error(reason ?? "Games are unavailable.");
  return supabase;
}

export function normalizeProfile(raw: unknown): GameProfile {
  const id = asString(pick(raw, "id"), "unknown");
  const username = asString(pick(raw, "username", "handle"), "player");
  const name = asString(pick(raw, "displayName", "display_name", "name"), username);
  const avatarLabel = asString(pick(raw, "avatarLabel", "avatar_label", "initials"), name.slice(0, 1).toUpperCase() || "P");
  return { id, username, name, avatarLabel };
}

export function normalizeRoom(raw: unknown): GameRoom {
  const gameKind = asString(pick(raw, "gameKind", "game_kind"), "tic_tac_toe") as GameKind;
  return {
    id: asString(pick(raw, "id")),
    gameKind,
    game_kind: gameKind,
    hostId: asString(pick(raw, "hostId", "host_id")),
    host_id: asString(pick(raw, "hostId", "host_id")),
    name: asString(pick(raw, "name"), gameKind === "tic_tac_toe" ? "Tic-Tac-Toe Room" : "Snake & Ladder Room"),
    playerLimit: asNumber(pick(raw, "playerLimit", "player_limit"), 2),
    player_limit: asNumber(pick(raw, "playerLimit", "player_limit"), 2),
    entryPoints: asNumber(pick(raw, "entryPoints", "entry_points"), 0),
    entry_points: asNumber(pick(raw, "entryPoints", "entry_points"), 0),
    prizePoints: asNumber(pick(raw, "prizePoints", "prize_points"), 0),
    prize_points: asNumber(pick(raw, "prizePoints", "prize_points"), 0),
    status: asString(pick(raw, "status"), "open") as GameRoom["status"],
    isPrivate: asBoolean(pick(raw, "isPrivate", "is_private"), false),
    is_private: asBoolean(pick(raw, "isPrivate", "is_private"), false),
    roomCode: asString(pick(raw, "roomCode", "room_code"), "") || null,
    room_code: asString(pick(raw, "roomCode", "room_code"), "") || null,
    memberCount: asNumber(pick(raw, "memberCount", "member_count"), 0),
    member_count: asNumber(pick(raw, "memberCount", "member_count"), 0),
    host: pick(raw, "host") ? normalizeProfile(pick(raw, "host")) : null,
    createdAt: asString(pick(raw, "createdAt", "created_at")),
    created_at: asString(pick(raw, "createdAt", "created_at")),
  };
}

export function normalizeMember(raw: unknown): GameRoomMember {
  const userId = asString(pick(raw, "userId", "user_id"));
  return {
    id: asString(pick(raw, "id")),
    roomId: asString(pick(raw, "roomId", "room_id")),
    room_id: asString(pick(raw, "roomId", "room_id")),
    userId,
    user_id: userId,
    seatIndex: asNumber(pick(raw, "seatIndex", "seat_index"), 0),
    seat_index: asNumber(pick(raw, "seatIndex", "seat_index"), 0),
    status: asString(pick(raw, "status"), "active") as GameRoomMember["status"],
    symbol: (asString(pick(raw, "symbol")) || null) as GameRoomMember["symbol"],
    position: asNumber(pick(raw, "position"), 0),
    profile: pick(raw, "profile") ? normalizeProfile(pick(raw, "profile")) : null,
  };
}

export function normalizeMatch(raw: unknown): GameMatch {
  const gameKind = asString(pick(raw, "gameKind", "game_kind"), "tic_tac_toe") as GameKind;
  const board = pick(raw, "board");
  return {
    id: asString(pick(raw, "id")),
    roomId: asString(pick(raw, "roomId", "room_id")),
    room_id: asString(pick(raw, "roomId", "room_id")),
    gameKind,
    game_kind: gameKind,
    status: asString(pick(raw, "status"), "waiting") as GameMatch["status"],
    board: isRecord(board) ? board : {},
    currentTurnUserId: asString(pick(raw, "currentTurnUserId", "current_turn_user_id"), "") || null,
    current_turn_user_id: asString(pick(raw, "currentTurnUserId", "current_turn_user_id"), "") || null,
    winnerId: asString(pick(raw, "winnerId", "winner_id"), "") || null,
    winner_id: asString(pick(raw, "winnerId", "winner_id"), "") || null,
    result: asString(pick(raw, "result"), "") || null,
    createdAt: asString(pick(raw, "createdAt", "created_at")),
    created_at: asString(pick(raw, "createdAt", "created_at")),
  };
}

export function normalizeMove(raw: unknown): GameMove {
  return {
    id: asString(pick(raw, "id")),
    matchId: asString(pick(raw, "matchId", "match_id")),
    match_id: asString(pick(raw, "matchId", "match_id")),
    userId: asString(pick(raw, "userId", "user_id")),
    user_id: asString(pick(raw, "userId", "user_id")),
    moveNumber: asNumber(pick(raw, "moveNumber", "move_number"), 0),
    move_number: asNumber(pick(raw, "moveNumber", "move_number"), 0),
    moveType: asString(pick(raw, "moveType", "move_type")),
    move_type: asString(pick(raw, "moveType", "move_type")),
    cellIndex: pick(raw, "cellIndex", "cell_index") === undefined ? null : asNumber(pick(raw, "cellIndex", "cell_index")),
    cell_index: pick(raw, "cellIndex", "cell_index") === undefined ? null : asNumber(pick(raw, "cellIndex", "cell_index")),
    dice: pick(raw, "dice") === undefined ? null : asNumber(pick(raw, "dice")),
    fromPosition: pick(raw, "fromPosition", "from_position") === undefined ? null : asNumber(pick(raw, "fromPosition", "from_position")),
    from_position: pick(raw, "fromPosition", "from_position") === undefined ? null : asNumber(pick(raw, "fromPosition", "from_position")),
    toPosition: pick(raw, "toPosition", "to_position") === undefined ? null : asNumber(pick(raw, "toPosition", "to_position")),
    to_position: pick(raw, "toPosition", "to_position") === undefined ? null : asNumber(pick(raw, "toPosition", "to_position")),
    metadata: isRecord(pick(raw, "metadata")) ? pick(raw, "metadata") : null,
    createdAt: asString(pick(raw, "createdAt", "created_at")),
    created_at: asString(pick(raw, "createdAt", "created_at")),
    profile: pick(raw, "profile") ? normalizeProfile(pick(raw, "profile")) : null,
  };
}

function normalizeAccount(raw: unknown): GameAccount {
  return { balance: asNumber(pick(raw, "balance"), 0) };
}

function normalizeStats(raw: unknown): GameStats {
  const gamesPlayed = asNumber(pick(raw, "gamesPlayed", "games_played"), 0);
  const gamesWon = asNumber(pick(raw, "gamesWon", "games_won"), 0);
  const gamesDrawn = asNumber(pick(raw, "gamesDrawn", "games_drawn"), 0);
  const gamesLost = asNumber(pick(raw, "gamesLost", "games_lost"), Math.max(0, gamesPlayed - gamesWon - gamesDrawn));
  const pointsWon = asNumber(pick(raw, "pointsWon", "points_won"), 0);
  return {
    gamesPlayed,
    games_played: gamesPlayed,
    gamesWon,
    games_won: gamesWon,
    gamesLost,
    games_lost: gamesLost,
    gamesDrawn,
    games_drawn: gamesDrawn,
    pointsWon,
    points_won: pointsWon,
  };
}

export function normalizeDashboard(raw: unknown): GamesDashboard {
  return {
    account: normalizeAccount(pick(raw, "account")),
    stats: normalizeStats(pick(raw, "stats")),
    openRooms: asArray(pick(raw, "availableRooms", "openRooms", "open_rooms")).map(normalizeRoom),
    open_rooms: asArray(pick(raw, "availableRooms", "openRooms", "open_rooms")).map(normalizeRoom),
    myRooms: asArray(pick(raw, "activeRooms", "myRooms", "my_rooms")).map(normalizeRoom),
    my_rooms: asArray(pick(raw, "activeRooms", "myRooms", "my_rooms")).map(normalizeRoom),
    recentMatches: asArray(pick(raw, "recentMatches", "recent_matches")).map((item) => normalizeMatch(pick(item, "match") ?? item)),
    recent_matches: asArray(pick(raw, "recentMatches", "recent_matches")).map((item) => normalizeMatch(pick(item, "match") ?? item)),
  };
}

export function normalizeRoomDetail(raw: unknown): GameRoomDetail {
  const matchRaw = pick(raw, "match");
  return {
    room: normalizeRoom(pick(raw, "room")),
    members: asArray(pick(raw, "members")).map(normalizeMember),
    match: matchRaw ? normalizeMatch(matchRaw) : null,
    moves: asArray(pick(raw, "moves")).map(normalizeMove),
    account: normalizeAccount(pick(raw, "account")),
  };
}

export async function getGamesDashboard(user: GameUser) {
  const client = requireGamesClient(user);
  const { data, error } = await client.rpc("get_games_dashboard");
  if (error) throw error;
  return normalizeDashboard(data);
}

export async function getGameRoomDetail(user: GameUser, roomId: string) {
  const client = requireGamesClient(user);
  const { data, error } = await client.rpc("get_game_room_detail", { p_room_id: roomId });
  if (error) throw error;
  return normalizeRoomDetail(data);
}

export async function createGameRoom(user: GameUser, input: CreateGameRoomInput) {
  const client = requireGamesClient(user);
  const { data, error } = await client.rpc("create_game_room", {
    p_game_kind: input.gameKind,
    p_name: input.name,
    p_player_limit: input.playerLimit,
    p_entry_points: input.entryPoints,
    p_is_private: Boolean(input.isPrivate),
  });
  if (error) throw error;
  return String(data);
}

export async function joinGameRoom(user: GameUser, roomId: string) {
  const client = requireGamesClient(user);
  const { data, error } = await client.rpc("join_game_room", { p_room_id: roomId });
  if (error) throw error;
  return normalizeRoomDetail(data);
}

export async function leaveGameRoom(user: GameUser, roomId: string) {
  const client = requireGamesClient(user);
  const { data, error } = await client.rpc("leave_game_room", { p_room_id: roomId });
  if (error) throw error;
  return normalizeRoomDetail(data);
}

export async function startGameRoom(user: GameUser, roomId: string) {
  const client = requireGamesClient(user);
  const { data, error } = await client.rpc("start_game_room", { p_room_id: roomId });
  if (error) throw error;
  return String(data);
}

export async function playTicTacToeMove(user: GameUser, matchId: string, cellIndex: number) {
  const client = requireGamesClient(user);
  const { data, error } = await client.rpc("play_tic_tac_toe_move", { p_match_id: matchId, p_cell_index: cellIndex });
  if (error) throw error;
  return normalizeRoomDetail(data);
}

export async function rollSnakeLadder(user: GameUser, matchId: string) {
  const client = requireGamesClient(user);
  const { data, error } = await client.rpc("roll_snake_ladder", { p_match_id: matchId });
  if (error) throw error;
  return normalizeRoomDetail(data);
}

function subscribeToTables(channelName: string, onChange: () => void, tables: Array<{ table: string; filter?: string }>) {
  const client = supabase;
  if (!client) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 150);
  };
  const channel = client.channel(`${channelName}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  tables.forEach(({ table, filter }) => {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
      trigger,
    );
  });
  channel.subscribe();
  return () => {
    if (timer) clearTimeout(timer);
    void client.removeChannel(channel);
  };
}

export function subscribeGames(onChange: () => void) {
  return subscribeToTables("games-dashboard", onChange, [
    { table: "game_rooms" },
    { table: "game_room_members" },
    { table: "game_matches" },
    { table: "game_statistics" },
    { table: "game_point_accounts" },
  ]);
}

export function subscribeGameRoom(roomId: string, onChange: () => void) {
  return subscribeToTables(`game-room-${roomId}`, onChange, [
    { table: "game_rooms", filter: `id=eq.${roomId}` },
    { table: "game_room_members", filter: `room_id=eq.${roomId}` },
    { table: "game_matches", filter: `room_id=eq.${roomId}` },
    { table: "game_moves" },
    { table: "game_statistics" },
    { table: "game_point_accounts" },
  ]);
}
