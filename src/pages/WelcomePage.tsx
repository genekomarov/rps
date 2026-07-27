import { GAME_CATALOG } from "../games/catalog";
import { buildHash } from "../lib/hashRouter";

interface WelcomePageProps {
  connected: boolean;
}

export default function WelcomePage({ connected }: WelcomePageProps) {
  return (
    <section className="card welcome-page">
      <h1>Добро пожаловать</h1>
      <p className="welcome-lead">
        Каталог простых игр для локальной сети. Подключитесь к другому устройству через WebRTC —
        без сервера и интернета.
      </p>

      {connected ? (
        <p className="welcome-status welcome-status-online">Соединение установлено. Выберите игру:</p>
      ) : (
        <div className="welcome-offline">
          <p className="welcome-status">Для начала нужно подключиться к другому участнику.</p>
          <a className="button-link" href={buildHash({ name: "connection" })}>
            Перейти к подключению
          </a>
        </div>
      )}

      <div>
        <h2>Игры</h2>
        <div className="game-catalog">
          {GAME_CATALOG.map((game) => (
            <article key={game.id} className="game-card">
              <h3>{game.title}</h3>
              {connected ? (
                <a className="game-launch-link" href={buildHash({ name: "game", gameId: game.id })}>
                  Запустить
                </a>
              ) : (
                <p className="muted game-card-hint">Нужно подключение</p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
