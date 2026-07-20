import { useEffect, useRef, useState } from "react";

export function isScreenWakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/**
 * Keeps the screen awake while `enabled` and the page is visible.
 * Re-acquires after tab visibility returns (browser releases lock on hide).
 */
export function useScreenWakeLock(enabled: boolean): {
  supported: boolean;
  active: boolean;
} {
  const supported = isScreenWakeLockSupported();
  const [active, setActive] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !supported) {
      void lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
      setActive(false);
      return undefined;
    }

    let cancelled = false;

    async function acquire() {
      if (cancelled || document.visibilityState !== "visible") return;
      if (lockRef.current) return;

      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await lock.release().catch(() => undefined);
          return;
        }

        lockRef.current = lock;
        setActive(true);
        lock.addEventListener("release", () => {
          if (lockRef.current === lock) {
            lockRef.current = null;
          }
          setActive(false);
        });
      } catch {
        setActive(false);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
      setActive(false);
    };
  }, [enabled, supported]);

  return { supported, active };
}
