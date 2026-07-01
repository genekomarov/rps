import type { AppState, ChatMessage } from "../types";

const STORAGE_VERSION = 1;
const KEY = "rpschat.state.v1";

const defaultState: AppState = {
  version: STORAGE_VERSION,
  clientId: "",
  nickname: "",
  nicknameDraft: "",
  messages: [],
  peers: [],
  extendedRelayGather: false,
};

function hasWindow(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
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

    return {
      ...defaultState,
      ...parsed,
      messages: Array.isArray(parsed.messages) ? (parsed.messages as ChatMessage[]) : [],
      peers: Array.isArray(parsed.peers) ? parsed.peers : [],
      extendedRelayGather: Boolean(parsed.extendedRelayGather),
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
