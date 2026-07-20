import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTheme, loadTheme, normalizeTheme, saveTheme } from "./theme";

const THEME_KEY = "rpschat.theme.v1";

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

describe("theme", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    const localStorage = createStorage();
    globalThis.window = { localStorage } as Window & typeof globalThis;
    globalThis.document = {
      documentElement: { dataset: {} as DOMStringMap },
      querySelector: () => null,
    } as unknown as Document;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });

  it("normalizes unknown values to light", () => {
    expect(normalizeTheme("nope")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
  });

  it("persists and applies theme", () => {
    expect(loadTheme()).toBe("light");
    expect(saveTheme("dark")).toBe("dark");
    expect(loadTheme()).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies light theme explicitly", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
