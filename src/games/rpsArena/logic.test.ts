import { describe, expect, it } from "vitest";
import {
  applyMove,
  assignPlayers,
  assignSpecial,
  compareWeapons,
  createInitialState,
  getLegalMoves,
  markSetupReady,
  startNextRound,
  submitTiebreakChoice,
} from "./logic";

function readyBothPlayers(state: ReturnType<typeof createInitialState>) {
  const playerA = state.playerAId;
  const playerB = state.playerBId;

  const withFlagA = assignSpecial(state, playerA, `${playerA}-p12`, "flag");
  const withTrapA = assignSpecial(withFlagA!, playerA, `${playerA}-p13`, "trap");
  const aliceReady = markSetupReady(withTrapA!, playerA);
  const withFlagB = assignSpecial(aliceReady!, playerB, `${playerB}-p12`, "flag");
  const withTrapB = assignSpecial(withFlagB!, playerB, `${playerB}-p13`, "trap");
  return markSetupReady(withTrapB!, playerB)!;
}

describe("compareWeapons", () => {
  it("resolves classic RPS outcomes", () => {
    expect(compareWeapons("rock", "scissors")).toBe("left");
    expect(compareWeapons("scissors", "paper")).toBe("left");
    expect(compareWeapons("paper", "rock")).toBe("left");
    expect(compareWeapons("scissors", "rock")).toBe("right");
    expect(compareWeapons("rock", "rock")).toBe("tie");
  });
});

describe("assignSpecial", () => {
  it("assigns flag and trap on separate pieces", () => {
    const state = createInitialState("alice", "bob", () => 0.1);
    const flagPiece = state.pieces.find((piece) => piece.ownerId === "alice" && piece.id === "alice-p12");
    const trapPiece = state.pieces.find((piece) => piece.ownerId === "alice" && piece.id === "alice-p13");
    expect(flagPiece).toBeTruthy();
    expect(trapPiece).toBeTruthy();

    const withFlag = assignSpecial(state, "alice", "alice-p12", "flag");
    expect(withFlag).not.toBeNull();
    const withTrap = assignSpecial(withFlag!, "alice", "alice-p13", "trap");
    expect(withTrap).not.toBeNull();
    expect(markSetupReady(withTrap!, "alice")).not.toBeNull();
  });

  it("restores soldier weapon after unsetting special", () => {
    const state = createInitialState("alice", "bob", () => 0.1);
    const soldier = state.pieces.find(
      (piece) => piece.ownerId === "alice" && piece.kind === "soldier" && piece.weapon !== null,
    )!;

    const originalWeapon = soldier.weapon;
    const asFlag = assignSpecial(state, "alice", soldier.id, "flag");
    const backToSoldier = assignSpecial(asFlag!, "alice", soldier.id, "soldier");
    const updated = backToSoldier!.pieces.find((piece) => piece.id === soldier.id)!;

    expect(updated.kind).toBe("soldier");
    expect(updated.weapon).toBe(originalWeapon);
  });
});

describe("createInitialState", () => {
  it("assigns weapon to every piece", () => {
    const state = createInitialState("alice", "bob", () => 0.1);
    expect(state.pieces.every((piece) => piece.weapon !== null)).toBe(true);
  });
});

describe("setup", () => {
  it("starts in setup with 28 pieces", () => {
    const state = createInitialState("alice", "bob", () => 0.1);
    expect(state.phase).toBe("setup");
    expect(state.pieces).toHaveLength(28);
  });

  it("requires flag and trap before ready", () => {
    const state = createInitialState("alice", "bob", () => 0.1);
    expect(markSetupReady(state, "alice")).toBeNull();
  });

  it("ready flow step by step", () => {
    const state = createInitialState("alice", "bob", () => 0.1);
    const withFlag = assignSpecial(state, "alice", "alice-p12", "flag");
    const withTrap = assignSpecial(withFlag!, "alice", "alice-p13", "trap");
    const aliceReady = markSetupReady(withTrap!, "alice");
    const bobFlag = assignSpecial(aliceReady!, "bob", "bob-p12", "flag");
    const bobTrap = assignSpecial(bobFlag!, "bob", "bob-p13", "trap");
    const playing = markSetupReady(bobTrap!, "bob");

    expect(withFlag).not.toBeNull();
    expect(withTrap).not.toBeNull();
    expect(aliceReady).not.toBeNull();
    expect(bobFlag).not.toBeNull();
    expect(bobTrap).not.toBeNull();
    expect(playing?.phase).toBe("playing");
  });

  it("starts playing when both players are ready", () => {
    const state = readyBothPlayers(createInitialState("alice", "bob", () => 0.1));
    expect(state.phase).toBe("playing");
    expect(state.currentTurn).toBe("alice");
  });
});

describe("applyMove", () => {
  it("moves soldier orthogonally on empty cell", () => {
    const state = readyBothPlayers(createInitialState("alice", "bob", () => 0.1));
    const soldier = state.pieces.find(
      (piece) => piece.ownerId === "alice" && piece.kind === "soldier" && piece.row === 4 && piece.col === 0,
    )!;

    const next = applyMove(state, "alice", soldier.id, 3, 0);
    expect(next?.currentTurn).toBe("bob");
    expect(next?.pieces.find((piece) => piece.id === soldier.id)).toMatchObject({ row: 3, col: 0 });
  });

  it("captures enemy flag and finishes match", () => {
    let state = readyBothPlayers(createInitialState("alice", "bob", () => 0.1));
    const attacker = state.pieces.find((piece) => piece.ownerId === "alice" && piece.kind === "soldier")!;
    const enemyFlag = state.pieces.find((piece) => piece.ownerId === "bob" && piece.kind === "flag")!;

    state = {
      ...state,
      pieces: state.pieces.map((piece) => {
        if (piece.id === attacker.id) return { ...piece, row: enemyFlag.row + 1, col: enemyFlag.col };
        return piece;
      }),
    };

    const next = applyMove(state, "alice", attacker.id, enemyFlag.row, enemyFlag.col);
    expect(next?.phase).toBe("finished");
    expect(next?.winnerId).toBe("alice");
    expect(next?.score.wins.alice).toBe(1);
  });

  it("removes attacker on trap", () => {
    let state = readyBothPlayers(createInitialState("alice", "bob", () => 0.1));
    const attacker = state.pieces.find((piece) => piece.ownerId === "alice" && piece.kind === "soldier")!;
    const enemyTrap = state.pieces.find((piece) => piece.ownerId === "bob" && piece.kind === "trap")!;

    state = {
      ...state,
      pieces: state.pieces.map((piece) => {
        if (piece.id === attacker.id) return { ...piece, row: enemyTrap.row + 1, col: enemyTrap.col };
        return piece;
      }),
    };

    const next = applyMove(state, "alice", attacker.id, enemyTrap.row, enemyTrap.col);
    expect(next?.pieces.some((piece) => piece.id === attacker.id)).toBe(false);
    expect(next?.pieces.some((piece) => piece.id === enemyTrap.id)).toBe(false);
    expect(next?.phase).toBe("playing");
  });
});

describe("tiebreak", () => {
  it("resolves equal weapon clash via duel choices", () => {
    let state = readyBothPlayers(createInitialState("alice", "bob", () => 0.1));
    const attacker = state.pieces.find((piece) => piece.ownerId === "alice" && piece.kind === "soldier")!;
    const defender = state.pieces.find((piece) => piece.ownerId === "bob" && piece.kind === "soldier")!;

    state = {
      ...state,
      pieces: state.pieces.map((piece) => {
        if (piece.id === attacker.id) return { ...piece, weapon: "rock", row: defender.row + 1, col: defender.col };
        if (piece.id === defender.id) return { ...piece, weapon: "rock" };
        return piece;
      }),
    };

    state = applyMove(state, "alice", attacker.id, defender.row, defender.col)!;
    expect(state.phase).toBe("tiebreak");
    expect(state.pieces.find((piece) => piece.id === attacker.id)?.revealed).toBe(true);
    expect(state.pieces.find((piece) => piece.id === defender.id)?.revealed).toBe(true);

    state = submitTiebreakChoice(state, "alice", "paper")!;
    state = submitTiebreakChoice(state, "bob", "rock")!;
    expect(state.phase).toBe("playing");
    expect(state.pieces.some((piece) => piece.id === defender.id)).toBe(false);
    expect(state.pieces.find((piece) => piece.id === attacker.id)?.revealed).toBe(true);
  });

  it("reveals defender after winning battle", () => {
    let state = readyBothPlayers(createInitialState("alice", "bob", () => 0.1));
    const attacker = state.pieces.find((piece) => piece.ownerId === "alice" && piece.kind === "soldier")!;
    const defender = state.pieces.find((piece) => piece.ownerId === "bob" && piece.kind === "soldier")!;

    state = {
      ...state,
      pieces: state.pieces.map((piece) => {
        if (piece.id === attacker.id) return { ...piece, weapon: "rock", row: defender.row + 1, col: defender.col };
        if (piece.id === defender.id) return { ...piece, weapon: "paper" };
        return piece;
      }),
    };

    state = applyMove(state, "alice", attacker.id, defender.row, defender.col)!;
    expect(state.pieces.some((piece) => piece.id === attacker.id)).toBe(false);
    expect(state.pieces.find((piece) => piece.id === defender.id)?.revealed).toBe(true);
  });
});

describe("startNextRound", () => {
  it("keeps score but resets board", () => {
    let state = readyBothPlayers(createInitialState("alice", "bob", () => 0.1));
    state = { ...state, phase: "finished", winnerId: "alice", score: { wins: { alice: 2, bob: 0 } } };

    const next = startNextRound(state, () => 0.2);
    expect(next.phase).toBe("setup");
    expect(next.score.wins.alice).toBe(2);
    expect(next.pieces).toHaveLength(28);
  });
});

describe("getLegalMoves", () => {
  it("returns only orthogonal moves", () => {
    const state = readyBothPlayers(createInitialState("alice", "bob", () => 0.1));
    const soldier = state.pieces.find((piece) => piece.ownerId === "alice" && piece.row === 4 && piece.col === 3)!;
    const moves = getLegalMoves(state, "alice", soldier.id);
    expect(moves).toContainEqual({ row: 3, col: 3 });
    expect(moves).not.toContainEqual({ row: 3, col: 4 });
  });
});

describe("assignPlayers", () => {
  it("uses lexicographically smaller id as player A", () => {
    expect(assignPlayers("alice", "bob")).toEqual({ playerAId: "alice", playerBId: "bob" });
  });
});
