import Accordion from "../components/Accordion";
import { GAME_CATALOG } from "../games/catalog";
import { buildHash } from "../lib/hashRouter";

interface WelcomePageProps {
  connected: boolean;
}

export default function WelcomePage({ connected }: WelcomePageProps) {
  const accordionItems = GAME_CATALOG.map((game) => ({
    id: game.id,
    title: game.title,
    description: game.description,
    content: connected ? (
      <a className="game-launch-link" href={buildHash({ name: "game", gameId: game.id })}>
        Запустить «{game.title}»
      </a>
    ) : (
      <p className="muted">Сначала установите P2P-подключение на странице «Подключение».</p>
    ),
  }));

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
        <Accordion items={accordionItems} defaultOpenId={GAME_CATALOG[0]?.id} />
      </div>
    </section>
  );
}
