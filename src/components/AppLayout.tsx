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

function ToggleIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="feedback-toggle-icon"
      viewBox="0 0 24 24"
      width="1.15em"
      height="1.15em"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function SunIcon() {
  return (
    <ToggleIcon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </ToggleIcon>
  );
}

function MoonIcon() {
  return (
    <ToggleIcon>
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z" />
    </ToggleIcon>
  );
}

function SoundOnIcon() {
  return (
    <ToggleIcon>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" />
    </ToggleIcon>
  );
}

function SoundOffIcon() {
  return (
    <ToggleIcon>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M22 9l-6 6M16 9l6 6" />
    </ToggleIcon>
  );
}

function VibrationIcon() {
  return (
    <ToggleIcon>
      <rect x="8" y="4" width="8" height="16" rx="1.5" />
      <path d="M4 9v6M2 10.5v3M20 9v6M22 10.5v3" />
    </ToggleIcon>
  );
}

export default function AppLayout({ children, connectionStatus, nickname }: AppLayoutProps) {
  const { prefs, vibrationSupported, setSoundEnabled, setVibrationEnabled } = useFeedbackPrefs();
  const { isDark, toggleTheme } = useTheme();

  const vibrationLabel = !vibrationSupported
    ? "Вибрация недоступна в этом браузере"
    : prefs.vibrationEnabled
      ? "Выключить вибрацию"
      : "Включить вибрацию";

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
        <div className="app-header-top">
          <div className="app-brand">
            <a href={buildHash({ name: "welcome" })} className="app-title-link">
              P2P Игры
            </a>
            <p className="muted app-tagline">Локальные игры без сервера</p>
          </div>
          {statusBadge}
        </div>
        <div className="app-header-bottom">
          <nav className="app-nav" aria-label="Основная навигация">
            <a href={buildHash({ name: "welcome" })}>Главная</a>
            <a href={buildHash({ name: "connection" })}>Подключение</a>
          </nav>
          <div className="app-feedback-toggles" role="group" aria-label="Настройки интерфейса">
            <button
              type="button"
              className={`feedback-toggle${isDark ? " feedback-toggle-on" : ""}`}
              aria-pressed={isDark}
              aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
              title={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
              onClick={toggleTheme}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              type="button"
              className={`feedback-toggle${prefs.soundEnabled ? " feedback-toggle-on" : ""}`}
              aria-pressed={prefs.soundEnabled}
              aria-label={prefs.soundEnabled ? "Выключить звук" : "Включить звук"}
              title={prefs.soundEnabled ? "Выключить звук" : "Включить звук"}
              onClick={() => setSoundEnabled(!prefs.soundEnabled)}
            >
              {prefs.soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}
            </button>
            <button
              type="button"
              className={`feedback-toggle${prefs.vibrationEnabled ? " feedback-toggle-on" : ""}`}
              aria-pressed={prefs.vibrationEnabled}
              aria-label={vibrationLabel}
              title={vibrationLabel}
              disabled={!vibrationSupported}
              onClick={() => setVibrationEnabled(!prefs.vibrationEnabled)}
            >
              <VibrationIcon />
            </button>
          </div>
        </div>
      </header>
      <main className="layout">{children}</main>
      <footer className="app-footer">
        <p className="muted">v{__APP_VERSION__}</p>
      </footer>
    </div>
  );
}
