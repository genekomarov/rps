const PREFS_KEY = "rpschat.feedback.prefs.v1";

export interface FeedbackPrefs {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export const DEFAULT_FEEDBACK_PREFS: FeedbackPrefs = {
  soundEnabled: false,
  vibrationEnabled: false,
};

function hasWindow(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function normalizeFeedbackPrefs(value?: Partial<FeedbackPrefs> | null): FeedbackPrefs {
  return {
    soundEnabled: Boolean(value?.soundEnabled),
    vibrationEnabled: Boolean(value?.vibrationEnabled),
  };
}

export function loadFeedbackPrefs(): FeedbackPrefs {
  if (!hasWindow()) {
    return { ...DEFAULT_FEEDBACK_PREFS };
  }

  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_FEEDBACK_PREFS };
    return normalizeFeedbackPrefs(JSON.parse(raw) as Partial<FeedbackPrefs>);
  } catch {
    return { ...DEFAULT_FEEDBACK_PREFS };
  }
}

export function saveFeedbackPrefs(patch: Partial<FeedbackPrefs>): FeedbackPrefs {
  const next = normalizeFeedbackPrefs({ ...loadFeedbackPrefs(), ...patch });
  if (hasWindow()) {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }
  return next;
}
