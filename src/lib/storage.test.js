import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadState, resetSessionState, resetState, saveState } from "./storage";

const STORAGE_KEY = "rpschat.state.v1";

function createStorage() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe("storage", () => {
  beforeEach(() => {
    globalThis.window = { localStorage: createStorage() };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("returns defaults when storage is empty", () => {
    expect(loadState()).toEqual({
      version: 1,
      clientId: "",
      nickname: "",
      nicknameDraft: "",
      messages: [],
      peers: [],
      extendedRelayGather: false,
    });
  });

  it("persists and reloads state", () => {
    saveState({
      clientId: "client-1",
      nickname: "Alice",
      messages: [{ id: "m1" }],
      peers: [{ id: "p1" }],
      extendedRelayGather: true,
    });

    expect(loadState()).toMatchObject({
      clientId: "client-1",
      nickname: "Alice",
      messages: [{ id: "m1" }],
      peers: [{ id: "p1" }],
      extendedRelayGather: true,
    });
  });

  it("resets storage completely", () => {
    saveState({ nickname: "Alice" });
    resetState();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadState().nickname).toBe("");
  });

  it("resetSessionState keeps nickname and clears session data", () => {
    saveState({
      nickname: "Alice",
      nicknameDraft: "Alice",
      messages: [{ id: "m1" }],
      peers: [{ id: "p1" }],
      clientId: "client-1",
    });

    const result = resetSessionState();

    expect(result).toEqual({ nickname: "Alice", nicknameDraft: "Alice" });
    expect(loadState()).toMatchObject({
      nickname: "Alice",
      nicknameDraft: "Alice",
      messages: [],
      peers: [],
      clientId: "",
    });
  });

  it("returns defaults when stored version mismatches", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, nickname: "Old" }));

    expect(loadState().nickname).toBe("");
  });

  it("returns defaults when JSON is invalid", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not-json");

    expect(loadState().nickname).toBe("");
  });

  it("no-ops when window is unavailable", () => {
    delete globalThis.window;

    expect(loadState().nickname).toBe("");
    expect(() => saveState({ nickname: "X" })).not.toThrow();
    expect(() => resetState()).not.toThrow();
    expect(resetSessionState()).toEqual({ nickname: "", nicknameDraft: "" });
  });
});
