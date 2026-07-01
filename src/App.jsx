import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QrPanel from "./components/QrPanel";
import QrScanner from "./components/QrScanner";
import {
  createChatMessage,
  createSignalPayload,
  decodeSignalPayload,
  encodeSignalPayload,
  trimChatHistory,
} from "./lib/protocol";
import { loadState, resetSessionState, saveState } from "./lib/storage";
import { WebRtcMesh } from "./lib/webrtc";

const HISTORY_LIMIT = 100;

export default function App() {
  const stored = useMemo(() => loadState(), []);
  const [clientId, setClientId] = useState(stored.clientId || crypto.randomUUID());
  const [nickname, setNickname] = useState(stored.nickname || "");
  const [nicknameDraft, setNicknameDraft] = useState(
    stored.nicknameDraft || stored.nickname || "",
  );
  const [messages, setMessages] = useState(trimChatHistory(stored.messages || [], HISTORY_LIMIT));
  const [peers, setPeers] = useState([]);
  const [status, setStatus] = useState("offline");
  const [chatDraft, setChatDraft] = useState("");
  const [hostOfferCode, setHostOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [error, setError] = useState("");

  const meshRef = useRef(null);
  const messagesRef = useRef(messages);
  const messageIdsRef = useRef(new Set(messages.map((item) => item.id)));

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    saveState({ clientId });
  }, [clientId]);

  useEffect(() => {
    saveState({ nickname });
  }, [nickname]);

  useEffect(() => {
    saveState({ nicknameDraft });
  }, [nicknameDraft]);

  useEffect(() => {
    saveState({ messages: trimChatHistory(messages, HISTORY_LIMIT) });
  }, [messages]);

  useEffect(() => {
    saveState({ peers });
  }, [peers]);

  const isChatReady = peers.length > 0;

  useEffect(() => {
    if (!isChatReady) return;
    setHostOfferCode("");
    setAnswerCode("");
  }, [isChatReady]);

  useEffect(() => {
    if (!answerCode || isChatReady) return undefined;

    const timer = window.setTimeout(() => {
      setError((current) =>
        current ||
        "Соединение ещё устанавливается. Убедитесь, что хост вставил ответный код. На телефоне не сворачивайте вкладку.",
      );
    }, 25000);

    return () => window.clearTimeout(timer);
  }, [answerCode, isChatReady]);

  useEffect(() => {
    if (!nickname.trim()) return undefined;

    const mesh = new WebRtcMesh({
      selfId: clientId,
      selfName: nickname,
      onPeerListChange: setPeers,
      onMessage: (nextMessage) => {
        if (messageIdsRef.current.has(nextMessage.id)) return;
        messageIdsRef.current.add(nextMessage.id);
        setMessages((prev) => trimChatHistory([...prev, nextMessage], HISTORY_LIMIT));
      },
      onStatus: (nextStatus) => setStatus(nextStatus),
      onError: (message) => setError(message),
      getHistory: () => messagesRef.current,
    });

    meshRef.current = mesh;

    return () => {
      mesh.dispose();
      meshRef.current = null;
    };
  }, [clientId, nickname]);

  function saveNickname() {
    const normalized = nicknameDraft.trim();
    if (!normalized) return;
    setNickname(normalized);
    meshRef.current?.setSelfName(normalized);
  }

  async function becomeHost() {
    if (!meshRef.current) return;
    try {
      setError("");
      const offerBody = await meshRef.current.createHostOffer();
      const payload = createSignalPayload("host-offer", offerBody);
      setHostOfferCode(await encodeSignalPayload(payload));
      setStatus("waitingAnswer");
    } catch {
      setError("Не удалось создать приглашение");
    }
  }

  const handleScannedValue = useCallback(async (value) => {
    if (!value?.trim()) return;

    if (!meshRef.current) {
      setError("Сначала сохраните ник");
      return;
    }

    try {
      setError("");
      const parsed = await decodeSignalPayload(value);

      if (parsed.type === "host-offer") {
        const answerBody = await meshRef.current.acceptHostOffer(parsed.body);
        const payload = createSignalPayload("host-answer", answerBody);
        setAnswerCode(await encodeSignalPayload(payload));
        setStatus("waitingHost");
        return;
      }

      if (parsed.type === "host-answer") {
        await meshRef.current.completeHostHandshake(parsed.body);
        return;
      }

      setError("Неизвестный тип payload");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Некорректный payload";
      setError(message.startsWith("Некорректный") ? message : `Ошибка: ${message}`);
    }
  }, []);

  function sendMessage() {
    const normalized = chatDraft.trim();
    if (!normalized || !meshRef.current) return;

    const message = createChatMessage(clientId, nickname, normalized);
    messageIdsRef.current.add(message.id);
    setMessages((prev) => trimChatHistory([...prev, message], HISTORY_LIMIT));
    meshRef.current.sendChatMessage(message);
    setChatDraft("");
  }

  function clearHistory() {
    setMessages([]);
    messageIdsRef.current = new Set();
  }

  function resetSession() {
    meshRef.current?.dispose();
    const preserved = resetSessionState();
    setClientId(crypto.randomUUID());
    setNickname(preserved.nickname);
    setNicknameDraft(preserved.nicknameDraft);
    setMessages([]);
    setPeers([]);
    setHostOfferCode("");
    setAnswerCode("");
    setStatus("offline");
    setError("");
    messageIdsRef.current = new Set();
  }

  const connectedCount = peers.length;
  const statusLabel = isChatReady
    ? `connected(${connectedCount})`
    : answerCode
      ? "waitingHost"
      : hostOfferCode
        ? "waitingAnswer"
        : status;

  return (
    <main className="layout">
      <section className="card">
        <h1>P2P WebRTC Chat</h1>
        <p className="muted">Ваш ID: {clientId}</p>
        <label className="field">
          <span>Ник</span>
          <input
            value={nicknameDraft}
            onChange={(event) => setNicknameDraft(event.target.value)}
            placeholder="Введите ник"
            disabled={isChatReady}
          />
        </label>
        <div className="actions">
          <button type="button" onClick={saveNickname} disabled={!nicknameDraft.trim() || isChatReady}>
            Сохранить ник
          </button>
          {!isChatReady ? (
            <button type="button" onClick={becomeHost} disabled={!nickname}>
              Сгенерировать приглашение
            </button>
          ) : null}
          <button type="button" onClick={resetSession}>
            Сбросить сессию
          </button>
        </div>
        <p className="muted">Статус: {statusLabel}</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

      {!isChatReady ? (
        <div className="grid">
          <QrPanel
            title={
              answerCode
                ? "Ваш QR-ответ (отдайте хосту)"
                : "Ваш QR (отдайте другому пользователю)"
            }
            value={answerCode || hostOfferCode}
          />
          <QrScanner onScan={handleScannedValue} />
        </div>
      ) : null}

      {isChatReady ? (
        <>
          <section className="card">
            <h2>Подключенные пользователи</h2>
            <ul className="peer-list">
              <li>
                <strong>{nickname || "Без ника"}</strong> (вы)
              </li>
              {peers.map((peer) => (
                <li key={peer.id}>{peer.name || peer.id}</li>
              ))}
            </ul>
          </section>

          <section className="card chat">
            <h2>Чат</h2>
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
      ) : null}
    </main>
  );
}
