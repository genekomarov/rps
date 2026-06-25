import { useCallback, useEffect, useState } from "react";
import { getLocalIp } from "./getLocalIps.js";

const STATUS = {
  idle: "idle",
  loading: "loading",
  success: "success",
  empty: "empty",
  error: "error",
};

export default function App() {
  const [status, setStatus] = useState(STATUS.loading);
  const [ip, setIp] = useState(null);
  const [error, setError] = useState(null);

  const probe = useCallback(async () => {
    setStatus(STATUS.loading);
    setError(null);
    setIp(null);

    try {
      const found = await getLocalIp();
      setIp(found);
      setStatus(found ? STATUS.success : STATUS.empty);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      setStatus(STATUS.error);
    }
  }, []);

  useEffect(() => {
    probe();
  }, [probe]);

  return (
    <main className="page">
      <h1>Локальный IP через WebRTC</h1>
      <p className="lead">
        Страница создаёт RTCPeerConnection и читает ICE-кандидаты, чтобы
        попытаться узнать адреса в локальной сети.
      </p>

      {status === STATUS.loading && (
        <p className="status status--loading">Ищем адрес…</p>
      )}

      {status === STATUS.success && (
        <section className="result">
          <h2>Локальный адрес</h2>
          <code>{ip}</code>
        </section>
      )}

      {status === STATUS.empty && (
        <p className="status status--empty">
          Адрес не найден. Современные браузеры часто скрывают локальный IP
          из соображений приватности.
        </p>
      )}

      {status === STATUS.error && (
        <p className="status status--error">{error}</p>
      )}

      <button type="button" onClick={probe} disabled={status === STATUS.loading}>
        Повторить
      </button>

      <p className="note">
        Результат зависит от браузера: Chrome, Firefox и Edge могут не
        показывать реальный LAN-адрес или подставлять заглушку.
      </p>
    </main>
  );
}
