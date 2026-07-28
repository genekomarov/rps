import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function checkForSwUpdate(swUrl: string, registration: ServiceWorkerRegistration) {
  if (registration.installing || !navigator.onLine) return;

  try {
    const response = await fetch(swUrl, {
      cache: "no-store",
      headers: {
        cache: "no-store",
        "cache-control": "no-cache",
      },
    });

    if (response.status === 200) {
      await registration.update();
    }
  } catch {
    // Offline or temporary network error — try again later.
  }
}

function registerUpdateChecks(swUrl: string, registration: ServiceWorkerRegistration) {
  const runCheck = () => {
    void checkForSwUpdate(swUrl, registration);
  };

  window.setInterval(runCheck, UPDATE_CHECK_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") runCheck();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", runCheck);
  runCheck();
}

export default function PwaUpdateBanner() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      registerUpdateChecks(swUrl, registration);
    },
  });

  if (!offlineReady && !needRefresh) {
    return null;
  }

  function dismiss() {
    setOfflineReady(false);
    setNeedRefresh(false);
  }

  return (
    <div className="pwa-banner" role="status" aria-live="polite">
      {needRefresh ? (
        <>
          <p>Доступна новая версия приложения.</p>
          <div className="pwa-banner-actions">
            <button type="button" onClick={() => void updateServiceWorker(true)}>
              Обновить
            </button>
            <button type="button" className="button-secondary" onClick={dismiss}>
              Позже
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Приложение сохранено для работы офлайн.</p>
          <div className="pwa-banner-actions">
            <button type="button" className="button-secondary" onClick={dismiss}>
              Понятно
            </button>
          </div>
        </>
      )}
    </div>
  );
}
