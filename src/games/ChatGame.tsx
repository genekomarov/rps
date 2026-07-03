import { buildHash } from "../lib/hashRouter";
import { useSession } from "../context/SessionContext";

export default function ChatGame() {
  const {
    clientId,
    nickname,
    messages,
    peers,
    chatDraft,
    setChatDraft,
    sendMessage,
    clearHistory,
  } = useSession();

  return (
    <>
      <section className="card game-header">
        <div className="game-header-row">
          <div>
            <h1>Чат</h1>
            <p className="muted">P2P-обмен сообщениями между участниками.</p>
          </div>
          <a className="button-secondary game-back-link" href={buildHash({ name: "welcome" })}>
            К каталогу
          </a>
        </div>
      </section>

      <section className="card">
        <h2>Участники ({peers.length})</h2>
        <ul className="peer-list">
          <li>
            <strong>{nickname}</strong> (вы)
          </li>
          {peers.map((peer) => (
            <li key={peer.id}>{peer.name || peer.id}</li>
          ))}
        </ul>
      </section>

      <section className="card chat">
        <h2>Сообщения</h2>
        <div className="chat-log">
          {messages.map((message) => (
            <article
              key={message.id}
              className={message.authorId === clientId ? "chat-item own" : "chat-item"}
            >
              <header>
                <strong>{message.authorName}</strong>
              </header>
              <p>{message.text}</p>
            </article>
          ))}
        </div>
        <label className="field">
          <span>Сообщение</span>
          <textarea
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            rows={3}
            placeholder="Введите сообщение"
          />
        </label>
        <div className="actions">
          <button type="button" onClick={sendMessage} disabled={!nickname || !chatDraft.trim()}>
            Отправить
          </button>
          <button type="button" onClick={clearHistory}>
            Очистить историю
          </button>
        </div>
      </section>
    </>
  );
}
