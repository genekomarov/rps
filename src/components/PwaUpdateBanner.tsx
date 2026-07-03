import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export default function PwaUpdateBanner() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      window.setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
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
