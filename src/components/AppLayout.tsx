import type { ReactNode } from "react";
import { buildHash } from "../lib/hashRouter";

interface AppLayoutProps {
  children: ReactNode;
  connected: boolean;
  nickname: string;
}

export default function AppLayout({ children, connected, nickname }: AppLayoutProps) {
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
        {connected ? (
          <p className="connection-badge" title={nickname}>
            Онлайн · {nickname}
          </p>
        ) : (
          <p className="connection-badge connection-badge-offline">Не подключено</p>
        )}
      </header>
      <main className="layout">{children}</main>
    </div>
  );
}
