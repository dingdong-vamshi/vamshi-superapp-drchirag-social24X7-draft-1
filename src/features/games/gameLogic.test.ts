import test from "node:test";
import assert from "node:assert/strict";

import {
  applySnakeLadderRoll,
  applyTicTacToeMove,
  calculateWinRate,
  canJoinRoom,
  canStartRoom,
  getTicTacToeWinner,
  pickTicTacToeBotMove,
} from "./gameLogic.ts";
import type { GameRoom, GameRoomMember } from "./types.ts";

test("detects tic-tac-toe wins", () => {
  assert.deepEqual(getTicTacToeWinner(["X", "X", "X", "", "", "", "", "", ""]), {
    symbol: "X",
    line: [0, 1, 2],
  });
  assert.deepEqual(getTicTacToeWinner(["O", "", "", "", "O", "", "", "", "O"]), {
    symbol: "O",
    line: [0, 4, 8],
  });
});

test("applies tic-tac-toe move safely", () => {
  const result = applyTicTacToeMove({
    cells: ["X", "X", "", "O", "O", "", "", "", ""],
    cellIndex: 2,
    symbol: "X",
    activeSymbol: "X",
  });
  assert.equal(result.winner?.symbol, "X");
  assert.throws(
    () => applyTicTacToeMove({ cells: result.cells, cellIndex: 2, symbol: "O", activeSymbol: "O" }),
    /already taken/,
  );
  assert.throws(
    () => applyTicTacToeMove({ cells: result.cells, cellIndex: 3, symbol: "X", activeSymbol: "O" }),
    /not your turn/,
  );
});

test("detects tic-tac-toe draw", () => {
  const result = applyTicTacToeMove({
    cells: ["X", "O", "X", "X", "O", "O", "O", "X", ""],
    cellIndex: 8,
    symbol: "X",
    activeSymbol: "X",
  });
  assert.equal(result.isDraw, true);
  assert.equal(result.winner, null);
});

test("picks smart tic-tac-toe bot moves", () => {
  assert.equal(pickTicTacToeBotMove(["O", "O", "", "X", "X", "", "", "", ""]), 2);
  assert.equal(pickTicTacToeBotMove(["X", "X", "", "", "O", "", "", "", ""]), 2);
  assert.equal(pickTicTacToeBotMove(["X", "", "", "", "", "", "", "", ""]), 4);
  assert.equal(pickTicTacToeBotMove(["X", "O", "X", "O", "X", "O", "O", "X", "O"]), null);
});

test("applies snake and ladder exact-win rules", () => {
  assert.equal(applySnakeLadderRoll(3, 1).to, 14);
  assert.equal(applySnakeLadderRoll(16, 1).to, 7);
  assert.equal(applySnakeLadderRoll(98, 3).to, 98);
  assert.equal(applySnakeLadderRoll(94, 6).to, 100);
});

test("calculates win rate and room gates", () => {
  assert.equal(calculateWinRate(3, 4), 75);
  assert.equal(calculateWinRate(0, 0), 0);

  const room: GameRoom = {
    id: "room",
    gameKind: "snake_ladder",
    hostId: "host",
    name: "Evening game",
    playerLimit: 2,
    entryPoints: 0,
    prizePoints: 0,
    status: "open",
    isPrivate: false,
    roomCode: null,
    memberCount: 1,
    createdAt: new Date().toISOString(),
  };
  const members: GameRoomMember[] = [
    {
      id: "member-1",
      roomId: "room",
      userId: "host",
      seatIndex: 1,
      status: "active",
      symbol: null,
      position: 1,
    },
  ];

  assert.equal(canJoinRoom(room, members, "guest"), null);
  assert.match(canStartRoom(room, members, "guest") ?? "", /Only the host/);
  assert.match(canStartRoom(room, members, "host") ?? "", /At least 2/);
});
