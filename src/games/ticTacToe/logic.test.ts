import { describe, expect, it } from "vitest";
import {
  applyMove,
  assignRoles,
  createInitialState,
  getWinner,
  isStateForPlayers,
  startNextRound,
} from "./logic";

describe("assignRoles", () => {
  it("assigns X to lexicographically smaller id", () => {
    expect(assignRoles("a-player", "b-player")).toEqual({
      xPlayerId: "a-player",
      oPlayerId: "b-player",
    });
    expect(assignRoles("z-player", "a-player")).toEqual({
      xPlayerId: "a-player",
      oPlayerId: "z-player",
    });
  });
});

describe("getWinner", () => {
  it("detects row wins", () => {
    expect(getWinner(["X", "X", "X", null, "O", null, null, "O", null])).toBe("X");
  });

  it("detects draw", () => {
    expect(getWinner(["X", "O", "X", "X", "O", "O", "O", "X", "X"])).toBe("draw");
  });

  it("returns null for unfinished board", () => {
    expect(getWinner(["X", null, null, null, "O", null, null, null, null])).toBeNull();
  });
});

describe("applyMove", () => {
  const state = createInitialState("alice", "bob");

  it("rejects move out of turn", () => {
    expect(applyMove(state, "bob", 0)).toBeNull();
  });

  it("applies valid move and switches turn", () => {
    const next = applyMove(state, "alice", 0);
    expect(next?.board[0]).toBe("X");
    expect(next?.currentTurn).toBe("O");
  });

  it("finishes game with winner and updates score", () => {
    let current = createInitialState("alice", "bob");
    const moves: Array<[string, number]> = [
      ["alice", 0],
      ["bob", 3],
      ["alice", 1],
      ["bob", 4],
      ["alice", 2],
    ];

    for (const [playerId, cell] of moves) {
      const next = applyMove(current, playerId, cell);
      expect(next).not.toBeNull();
      current = next!;
    }

    expect(current.status).toBe("finished");
    expect(current.winner).toBe("X");
    expect(current.score.wins.alice).toBe(1);
    expect(current.score.wins.bob).toBe(0);
  });
});

describe("startNextRound", () => {
  it("keeps score but resets board", () => {
    const finished = createInitialState("alice", "bob");
    finished.status = "finished";
    finished.winner = "X";
    finished.score.wins.alice = 2;

    const next = startNextRound(finished);
    expect(next.status).toBe("playing");
    expect(next.winner).toBeNull();
    expect(next.board.every((cell) => cell === null)).toBe(true);
    expect(next.score.wins.alice).toBe(2);
  });
});

describe("isStateForPlayers", () => {
  it("matches only the expected pair", () => {
    const state = createInitialState("alice", "bob");
    expect(isStateForPlayers(state, "alice", "bob")).toBe(true);
    expect(isStateForPlayers(state, "bob", "alice")).toBe(true);
    expect(isStateForPlayers(state, "alice", "carol")).toBe(false);
  });
});
