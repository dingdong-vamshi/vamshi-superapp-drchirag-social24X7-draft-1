export type GameKind = "tic_tac_toe" | "snake_ladder";

export type GameRoomStatus = "open" | "full" | "starting" | "in_game" | "completed" | "cancelled";

export type GameMatchStatus = "waiting" | "in_game" | "completed" | "draw" | "cancelled";

export type GameProfile = {
  id: string;
  name: string;
  username: string;
  avatarLabel: string;
};

export type GameRoom = {
  id: string;
  gameKind: GameKind;
  game_kind?: GameKind;
  hostId: string;
  host_id?: string;
  name: string;
  playerLimit: number;
  player_limit?: number;
  entryPoints: number;
  entry_points?: number;
  prizePoints: number;
  prize_points?: number;
  status: GameRoomStatus;
  isPrivate: boolean;
  is_private?: boolean;
  roomCode: string | null;
  room_code?: string | null;
  memberCount: number;
  member_count?: number;
  host?: GameProfile | null;
  createdAt: string;
  created_at?: string;
};

export type GameRoomMember = {
  id: string;
  roomId: string;
  room_id?: string;
  userId: string;
  user_id?: string;
  seatIndex: number;
  seat_index?: number;
  status: "active" | "left";
  symbol: "X" | "O" | null;
  position: number;
  profile?: GameProfile | null;
};

export type GameMatch = {
  id: string;
  roomId: string;
  room_id?: string;
  gameKind: GameKind;
  game_kind?: GameKind;
  status: GameMatchStatus;
  board: Record<string, unknown>;
  currentTurnUserId: string | null;
  current_turn_user_id?: string | null;
  winnerId: string | null;
  winner_id?: string | null;
  result: string | null;
  createdAt: string;
  created_at?: string;
};

export type GameMove = {
  id: string;
  matchId: string;
  match_id?: string;
  userId: string;
  user_id?: string;
  moveNumber: number;
  move_number?: number;
  moveType: string;
  move_type?: string;
  cellIndex?: number | null;
  cell_index?: number | null;
  dice?: number | null;
  fromPosition?: number | null;
  from_position?: number | null;
  toPosition?: number | null;
  to_position?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  created_at?: string;
  profile?: GameProfile | null;
};

export type GameAccount = {
  balance: number;
};

export type GameStats = {
  gamesPlayed: number;
  games_played?: number;
  gamesWon: number;
  games_won?: number;
  gamesLost: number;
  games_lost?: number;
  gamesDrawn: number;
  games_drawn?: number;
  pointsWon: number;
  points_won?: number;
};

export type GamesDashboard = {
  account: GameAccount;
  stats: GameStats;
  openRooms: GameRoom[];
  open_rooms?: GameRoom[];
  myRooms: GameRoom[];
  my_rooms?: GameRoom[];
  recentMatches: GameMatch[];
  recent_matches?: GameMatch[];
};

export type GameRoomDetail = {
  room: GameRoom;
  members: GameRoomMember[];
  match: GameMatch | null;
  moves: GameMove[];
  account?: GameAccount;
};

export type CreateGameRoomInput = {
  gameKind: GameKind;
  name: string;
  playerLimit: number;
  entryPoints: number;
  isPrivate?: boolean;
};
