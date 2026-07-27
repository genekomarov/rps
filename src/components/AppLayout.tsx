import type { ReactNode } from "react";
import { buildHash } from "../lib/hashRouter";
import { useFeedbackPrefs } from "../hooks/useFeedbackPrefs";
import { useTheme } from "../hooks/useTheme";
import type { ConnectionStatus } from "../types";

interface AppLayoutProps {
  children: ReactNode;
  connectionStatus: ConnectionStatus;
  nickname: string;
}

export default function AppLayout({ children, connectionStatus, nickname }: AppLayoutProps) {
  const { prefs, setSoundEnabled, setVibrationEnabled } = useFeedbackPrefs();
  const { isDark, toggleTheme } = useTheme();

  const statusBadge =
    connectionStatus === "online" ? (
      <p className="connection-badge" title={nickname}>
        Онлайн · {nickname}
      </p>
    ) : connectionStatus === "connecting" ? (
      <p className="connection-badge connection-badge-connecting" title={nickname}>
        Подключение · {nickname}
      </p>
    ) : (
      <p className="connection-badge connection-badge-offline">Не подключен</p>
    );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <a href={buildHash({ name: "welcome" })} className="app-title-link">
            P2P Игры
          </a>
          <p className="muted app-tagline">Локальные игры без сервера</p>
        </div>
        <nav className="app-nav" aria-label="Основная навигация">
          <a href={buildHash({ name: "welcome" })}>Главная</a>
          <a href={buildHash({ name: "connection" })}>Подключение</a>
        </nav>
        <div className="app-feedback-toggles" role="group" aria-label="Настройки интерфейса">
          <button
            type="button"
            className={`feedback-toggle${isDark ? " feedback-toggle-on" : ""}`}
            aria-pressed={isDark}
            title={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
            onClick={toggleTheme}
          >
            Тема: {isDark ? "тёмная" : "светлая"}
          </button>
          <button
            type="button"
            className={`feedback-toggle${prefs.soundEnabled ? " feedback-toggle-on" : ""}`}
            aria-pressed={prefs.soundEnabled}
            title={prefs.soundEnabled ? "Выключить звук" : "Включить звук"}
            onClick={() => setSoundEnabled(!prefs.soundEnabled)}
          >
            Звук {prefs.soundEnabled ? "вкл" : "выкл"}
          </button>
          <button
            type="button"
            className={`feedback-toggle${prefs.vibrationEnabled ? " feedback-toggle-on" : ""}`}
            aria-pressed={prefs.vibrationEnabled}
            title={prefs.vibrationEnabled ? "Выключить вибрацию" : "Включить вибрацию"}
            onClick={() => setVibrationEnabled(!prefs.vibrationEnabled)}
          >
            Вибрация {prefs.vibrationEnabled ? "вкл" : "выкл"}
          </button>
        </div>
        {statusBadge}
      </header>
      <main className="layout">{children}</main>
    </div>
  );
}
