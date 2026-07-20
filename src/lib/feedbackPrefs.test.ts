import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDBACK_PREFS,
  loadFeedbackPrefs,
  saveFeedbackPrefs,
} from "./feedbackPrefs";
import { isVisibleOpponentArenaAction, isVisibleOpponentTicTacToeAction } from "./opponentAction";
import { createInitialState, type RpsArenaState } from "../games/rpsArena/logic";
import { createInitialState as createTttState } from "../games/ticTacToe/logic";

const PREFS_KEY = "rpschat.feedback.prefs.v1";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe("feedbackPrefs", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    globalThis.window = {
      localStorage: createStorage(),
    } as Window & typeof globalThis;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("returns defaults when empty", () => {
    expect(loadFeedbackPrefs()).toEqual(DEFAULT_FEEDBACK_PREFS);
  });

  it("persists sound and vibration separately", () => {
    saveFeedbackPrefs({ soundEnabled: true });
    expect(loadFeedbackPrefs()).toEqual({ soundEnabled: true, vibrationEnabled: false });

    saveFeedbackPrefs({ vibrationEnabled: true });
    expect(loadFeedbackPrefs()).toEqual({ soundEnabled: true, vibrationEnabled: true });
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY)!)).toEqual({
      soundEnabled: true,
      vibrationEnabled: true,
    });
  });
});

describe("isVisibleOpponentArenaAction", () => {
  it("detects opponent move highlight", () => {
    const prev = createInitialState("alice", "bob", () => 0.1, { firstPlayerId: "bob" });
    const next: RpsArenaState = {
      ...prev,
      lastMove: {
        fromRow: 1,
        fromCol: 2,
        toRow: 2,
        toCol: 2,
        playerId: "bob",
      },
    };

    expect(isVisibleOpponentArenaAction(prev, next, "alice")).toBe(true);
    expect(isVisibleOpponentArenaAction(prev, next, "bob")).toBe(false);
  });

  it("ignores initial sync without previous state", () => {
    const next = createInitialState("alice", "bob", () => 0.1, { firstPlayerId: "alice" });
    expect(isVisibleOpponentArenaAction(null, next, "alice")).toBe(false);
  });

  it("detects opponent setup ready", () => {
    const prev = createInitialState("alice", "bob", () => 0.1, { firstPlayerId: "alice" });
    const next: RpsArenaState = {
      ...prev,
      setupReady: { ...prev.setupReady, bob: true },
    };
    expect(isVisibleOpponentArenaAction(prev, next, "alice")).toBe(true);
  });
});

describe("isVisibleOpponentTicTacToeAction", () => {
  it("detects opponent board mark", () => {
    const prev = createTttState("alice", "bob");
    const next = {
      ...prev,
      board: [...prev.board],
      currentTurn: "O" as const,
    };
    next.board[0] = "X";

    expect(isVisibleOpponentTicTacToeAction(prev, next, "bob")).toBe(true);
    expect(isVisibleOpponentTicTacToeAction(prev, next, "alice")).toBe(false);
  });
});
