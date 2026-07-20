import type { AppState, ChatMessage } from "../types";

const STORAGE_VERSION = 1;
const KEY = "rpschat.state.v1";
const CLIENT_ID_KEY = "rpschat.clientId";

const defaultState: AppState = {
  version: STORAGE_VERSION,
  clientId: "",
  nickname: "",
  nicknameDraft: "",
  messages: [],
  peers: [],
};

function hasWindow(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && !!window.sessionStorage;
}

export function loadClientId(): string {
  if (!hasSessionStorage()) {
    return crypto.randomUUID();
  }

  const existing = window.sessionStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const nextId = crypto.randomUUID();
  window.sessionStorage.setItem(CLIENT_ID_KEY, nextId);
  return nextId;
}

export function resetClientId(): string {
  const nextId = crypto.randomUUID();
  if (hasSessionStorage()) {
    window.sessionStorage.setItem(CLIENT_ID_KEY, nextId);
  }
  return nextId;
}

export function loadState(): AppState {
  if (!hasWindow()) {
    return { ...defaultState };
  }

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw) as Partial<AppState>;

    if (parsed?.version !== STORAGE_VERSION) {
      return { ...defaultState };
    }

    const { extendedRelayGather: _legacyRelay, ...rest } = parsed as Partial<AppState> & {
      extendedRelayGather?: boolean;
    };

    return {
      ...defaultState,
      ...rest,
      messages: Array.isArray(parsed.messages) ? (parsed.messages as ChatMessage[]) : [],
      peers: Array.isArray(parsed.peers) ? parsed.peers : [],
    };
  } catch {
    return { ...defaultState };
  }
}

export function saveState(patch: Partial<AppState>): void {
  if (!hasWindow()) return;

  const current = loadState();
  const next: AppState = { ...current, ...patch, version: STORAGE_VERSION };
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function resetState(): void {
  if (!hasWindow()) return;
  window.localStorage.removeItem(KEY);
}

export function resetSessionState(): Pick<AppState, "nickname" | "nicknameDraft"> {
  if (!hasWindow()) return { nickname: "", nicknameDraft: "" };

  const current = loadState();
  const nickname = current.nickname || current.nicknameDraft || "";

  window.localStorage.setItem(
    KEY,
    JSON.stringify({
      ...defaultState,
      nickname,
      nicknameDraft: nickname,
      version: STORAGE_VERSION,
    }),
  );

  return { nickname, nicknameDraft: nickname };
}
