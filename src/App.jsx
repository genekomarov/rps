import { useCallback, useEffect, useState } from "react";
import { getLocalIps } from "./getLocalIps.js";

const STATUS = {
  idle: "idle",
  loading: "loading",
  success: "success",
  mdns: "mdns",
  empty: "empty",
  error: "error",
};

function isDesktopChrome() {
  const ua = navigator.userAgent;
  return /Chrome|Chromium|Edg/i.test(ua) && !/Mobile|Android/i.test(ua);
}

export default function App() {
  const [status, setStatus] = useState(STATUS.loading);
  const [ips, setIps] = useState([]);
  const [error, setError] = useState(null);

  const probe = useCallback(async () => {
    setStatus(STATUS.loading);
    setError(null);
    setIps([]);

    try {
      const { addresses, hasOnlyMdns } = await getLocalIps();
      setIps(addresses);

      if (addresses.length === 0) {
        setStatus(STATUS.empty);
      } else if (hasOnlyMdns) {
        setStatus(STATUS.mdns);
      } else {
        setStatus(STATUS.success);
      }
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
        <p className="status status--loading">Ищем адреса…</p>
      )}

      {status === STATUS.success && (
        <section className="result">
          <h2>Найденные адреса</h2>
          <ul>
            {ips.map((ip) => (
              <li key={ip}>
                <code>{ip}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status === STATUS.mdns && (
        <section className="result">
          <h2>Найдены только mDNS-имена</h2>
          <ul>
            {ips.map((ip) => (
              <li key={ip}>
                <code>{ip}</code>
              </li>
            ))}
          </ul>
          <p className="status status--empty status--inline">
            На этом устройстве браузер скрывает реальный IPv4 и отдаёт
            заглушку вида <code>*.local</code>. Это типично для Chrome и Edge
            на компьютере. На телефоне политика приватности часто мягче, поэтому
            там может показываться настоящий адрес.
          </p>
        </section>
      )}

      {status === STATUS.empty && (
        <div className="status status--empty">
          <p>Адреса не найдены.</p>
          {isDesktopChrome() ? (
            <p>
              Chrome/Edge на ПК по умолчанию скрывают локальный IP через WebRTC.
              Попробуйте открыть сайт в Firefox или на телефоне. В Chrome можно
              отключить флаг{" "}
              <code>Anonymize local IPs exposed by WebRTC</code> на странице{" "}
              <code>chrome://flags</code>.
            </p>
          ) : (
            <p>
              Современные браузеры часто скрывают локальный IP из соображений
              приватности.
            </p>
          )}
        </div>
      )}

      {status === STATUS.error && (
        <p className="status status--error">{error}</p>
      )}

      <button type="button" onClick={probe} disabled={status === STATUS.loading}>
        Повторить
      </button>

      <p className="note">
        Результат зависит от браузера и устройства, а не от Wi‑Fi сети. Один и
        тот же сайт на телефоне и на ПК может вести себя по-разному.
      </p>
    </main>
  );
}
