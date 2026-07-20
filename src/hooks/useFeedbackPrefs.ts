import { useCallback, useState } from "react";
import { playOpponentSound, vibrateOpponentAlert } from "../lib/feedback";
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
      vibrateOpponentAlert();
    }
  }, []);

  return {
    prefs,
    setSoundEnabled,
    setVibrationEnabled,
  };
}
