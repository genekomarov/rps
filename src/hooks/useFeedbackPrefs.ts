import { useCallback, useState } from "react";
import { isVibrationSupported, playOpponentSound, vibrateOpponentAlert } from "../lib/feedback";
import {
  loadFeedbackPrefs,
  saveFeedbackPrefs,
  type FeedbackPrefs,
} from "../lib/feedbackPrefs";

export function useFeedbackPrefs() {
  const [prefs, setPrefs] = useState<FeedbackPrefs>(() => loadFeedbackPrefs());

  const setSoundEnabled = useCallback((soundEnabled: boolean) => {
    const next = saveFeedbackPrefs({ soundEnabled });
    setPrefs(next);
    if (soundEnabled) {
      playOpponentSound();
    }
  }, []);

  const setVibrationEnabled = useCallback((vibrationEnabled: boolean) => {
    const next = saveFeedbackPrefs({ vibrationEnabled });
    setPrefs(next);
    if (vibrationEnabled) {
      // Must run in the same user-gesture turn as the toggle (Chrome sticky activation).
      vibrateOpponentAlert();
    }
  }, []);

  return {
    prefs,
    vibrationSupported: isVibrationSupported(),
    setSoundEnabled,
    setVibrationEnabled,
  };
}
