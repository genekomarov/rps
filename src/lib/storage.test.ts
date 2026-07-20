import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadClientId,
  loadState,
  resetClientId,
  resetSessionState,
  resetState,
  saveState,
} from "./storage";

const STORAGE_KEY = "rpschat.state.v1";
const CLIENT_ID_KEY = "rpschat.clientId";

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

describe("storage", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    globalThis.window = {
      localStorage: createStorage(),
      sessionStorage: createStorage(),
    } as Window & typeof globalThis;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("returns defaults when storage is empty", () => {
    expect(loadState()).toEqual({
      version: 1,
      clientId: "",
      nickname: "",
      nicknameDraft: "",
      messages: [],
      peers: [],
    });
  });

  it("persists and reloads state", () => {
    saveState({
      clientId: "client-1",
      nickname: "Alice",
      messages: [
        {
          id: "m1",
          authorId: "u1",
          authorName: "Alice",
          text: "hi",
          timestamp: 1,
        },
      ],
      peers: [{ id: "p1", name: "Peer" }],
    });

    expect(loadState()).toMatchObject({
      clientId: "client-1",
      nickname: "Alice",
      messages: [{ id: "m1" }],
      peers: [{ id: "p1", name: "Peer" }],
    });
  });

  it("drops legacy extendedRelayGather on load", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        nickname: "Alice",
        extendedRelayGather: true,
      }),
    );

    expect(loadState()).toMatchObject({ nickname: "Alice" });
    expect(loadState()).not.toHaveProperty("extendedRelayGather");
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
      messages: [
        {
          id: "m1",
          authorId: "u1",
          authorName: "Alice",
          text: "hi",
          timestamp: 1,
        },
      ],
      peers: [{ id: "p1", name: "Peer" }],
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
    Reflect.deleteProperty(globalThis, "window");

    expect(loadState().nickname).toBe("");
    expect(() => saveState({ nickname: "X" })).not.toThrow();
    expect(() => resetState()).not.toThrow();
    expect(resetSessionState()).toEqual({ nickname: "", nicknameDraft: "" });
    expect(loadClientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    globalThis.window = originalWindow;
  });

  it("keeps client id in session storage per tab", () => {
    const first = loadClientId();
    const second = loadClientId();

    expect(first).toBe(second);
    expect(window.sessionStorage.getItem(CLIENT_ID_KEY)).toBe(first);
  });

  it("rotates client id on reset", () => {
    const first = loadClientId();
    const next = resetClientId();

    expect(next).not.toBe(first);
    expect(loadClientId()).toBe(next);
  });
});
