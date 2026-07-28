import { loadFeedbackPrefs } from "./feedbackPrefs";

let audioContext: AudioContext | null = null;
let pendingVibrate = false;
let pendingVibrateArmed = false;

/** Noticeable pulse: vibrate / pause / vibrate (ms). Short 40ms bursts are easy to miss. */
const OPPONENT_VIBRATE_PATTERN = [120, 60, 120];

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) {
    audioContext = new Ctx();
  }
  return audioContext;
}

export function playOpponentSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume().then(() => {
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.12);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  });
}

export function isVibrationSupported(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return false;
  }
  // Chrome/Edge on desktop expose vibrate() but there is no motor.
  if (navigator.maxTouchPoints === 0) {
    const coarse =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) return false;
  }
  return true;
}

function flushPendingVibrate(): void {
  if (!pendingVibrate) return;
  pendingVibrate = false;
  if (!loadFeedbackPrefs().vibrationEnabled) return;
  tryVibrate();
}

function armPendingVibrateFlush(): void {
  if (pendingVibrateArmed || typeof document === "undefined") return;
  pendingVibrateArmed = true;
  // Chrome requires sticky user activation; retry on the next real gesture if a
  // network-driven call was blocked.
  document.addEventListener("pointerdown", flushPendingVibrate, true);
}

function tryVibrate(): boolean {
  if (!isVibrationSupported()) return false;
  try {
    // Cancel any in-progress pattern first, then start ours.
    navigator.vibrate(0);
    return Boolean(navigator.vibrate(OPPONENT_VIBRATE_PATTERN));
  } catch {
    return false;
  }
}

/** @returns whether the browser accepted the vibration request */
export function vibrateOpponentAlert(): boolean {
  const ok = tryVibrate();
  if (!ok && isVibrationSupported()) {
    pendingVibrate = true;
    armPendingVibrateFlush();
  }
  return ok;
}

export function notifyOpponentAction(): void {
  const prefs = loadFeedbackPrefs();
  if (prefs.soundEnabled) {
    playOpponentSound();
  }
  if (prefs.vibrationEnabled) {
    vibrateOpponentAlert();
  }
}
