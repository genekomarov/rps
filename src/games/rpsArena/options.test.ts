import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RPS_ARENA_OPTIONS,
  loadArenaOptions,
  normalizeArenaOptions,
  saveArenaOptions,
} from "./options";

const OPTIONS_KEY = "rpschat.rpsArena.options.v1";

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

describe("rps arena options", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    globalThis.window = {
      localStorage: createStorage(),
    } as Window & typeof globalThis;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("returns defaults when storage is empty", () => {
    expect(loadArenaOptions()).toEqual(DEFAULT_RPS_ARENA_OPTIONS);
  });

  it("persists and reloads options", () => {
    expect(saveArenaOptions({ changeWeaponAfterDuel: true })).toEqual({
      changeWeaponAfterDuel: true,
    });
    expect(loadArenaOptions()).toEqual({ changeWeaponAfterDuel: true });
    expect(JSON.parse(window.localStorage.getItem(OPTIONS_KEY)!)).toEqual({
      changeWeaponAfterDuel: true,
    });
  });

  it("merges patches over stored options", () => {
    saveArenaOptions({ changeWeaponAfterDuel: true });
    expect(saveArenaOptions({})).toEqual({ changeWeaponAfterDuel: true });
  });

  it("normalizes invalid stored payloads", () => {
    window.localStorage.setItem(OPTIONS_KEY, JSON.stringify({ changeWeaponAfterDuel: "yes" }));
    expect(loadArenaOptions()).toEqual({ changeWeaponAfterDuel: true });
    expect(normalizeArenaOptions(undefined)).toEqual(DEFAULT_RPS_ARENA_OPTIONS);
  });

  it("returns defaults when JSON is invalid", () => {
    window.localStorage.setItem(OPTIONS_KEY, "{broken");
    expect(loadArenaOptions()).toEqual(DEFAULT_RPS_ARENA_OPTIONS);
  });
});
