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
import { loadState, resetState, saveState } from "./lib/storage";
import { WebRtcMesh } from "./lib/webrtc";

const HISTORY_LIMIT = 100;

export default function App() {
  const stored = useMemo(() => loadState(), []);
  const [clientId, setClientId] = useState(stored.clientId || crypto.randomUUID());
  const [nickname, setNickname] = useState(stored.nickname || "");
  const [nicknameDraft, setNicknameDraft] = useState(stored.nickname || "");
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
    saveState({ messages: trimChatHistory(messages, HISTORY_LIMIT) });
  }, [messages]);

  useEffect(() => {
    saveState({ peers });
  }, [peers]);

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
    if (!value?.trim() || !meshRef.current) return;
    try {
      setError("");
      const parsed = await decodeSignalPayload(value);

      if (parsed.type === "host-offer") {
        const answerBody = await meshRef.current.acceptHostOffer(parsed.body);
        const payload = createSignalPayload("host-answer", answerBody);
        setAnswerCode(await encodeSignalPayload(payload));
        return;
      }

      if (parsed.type === "host-answer") {
        await meshRef.current.completeHostHandshake(parsed.body);
        setHostOfferCode("");
        setAnswerCode("");
        return;
      }

      setError("Неизвестный тип payload");
    } catch {
      setError("Некорректный payload");
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
    resetState();
    setClientId(crypto.randomUUID());
    setNickname("");
    setNicknameDraft("");
    setMessages([]);
    setPeers([]);
    setHostOfferCode("");
    setAnswerCode("");
    setStatus("offline");
    setError("");
    messageIdsRef.current = new Set();
  }

  const connectedCount = peers.length;

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
          />
        </label>
        <div className="actions">
          <button type="button" onClick={saveNickname} disabled={!nicknameDraft.trim()}>
            Сохранить ник
          </button>
          <button type="button" onClick={becomeHost} disabled={!nickname}>
            Сгенерировать приглашение
          </button>
        </div>
        <p className="muted">Статус: {status === "connected" ? `connected(${connectedCount})` : status}</p>
        {error ? <p className="error">{error}</p> : null}
      </section>

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

      <div className="grid">
        <QrPanel title="Ваш QR (отдайте другому пользователю)" value={hostOfferCode || answerCode} />
        <QrScanner onScan={handleScannedValue} />
      </div>

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
          <button type="button" onClick={resetSession}>
            Сбросить сессию
          </button>
        </div>
      </section>
    </main>
  );
}
