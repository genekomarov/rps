import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConnectionLog from "./components/ConnectionLog";
import HandshakeSteps from "./components/HandshakeSteps";
import QrPanel from "./components/QrPanel";
import QrScanner from "./components/QrScanner";
import { createLogEntry, trimLogEntries } from "./lib/connectionLog";
import {
  createChatMessage,
  createSignalPayload,
  decodeSignalPayload,
  encodeSignalPayload,
  trimChatHistory,
} from "./lib/protocol";
import { getPhaseMeta, resolvePhase } from "./lib/sessionPhase";
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
  const [chatDraft, setChatDraft] = useState("");
  const [hostOfferCode, setHostOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [logEntries, setLogEntries] = useState([]);
  const [diagnostics, setDiagnostics] = useState([]);

  const meshRef = useRef(null);
  const resettingRef = useRef(false);
  const messagesRef = useRef(messages);
  const messageIdsRef = useRef(new Set(messages.map((item) => item.id)));

  const phase = resolvePhase({ nickname, hostOfferCode, answerCode, peers, busy });
  const phaseMeta = getPhaseMeta(phase);
  const isChatReady = phase === "chat";

  const appendLog = useCallback((level, message) => {
    setLogEntries((prev) => trimLogEntries([...prev, createLogEntry(level, message)]));
  }, []);

  const runBusy = useCallback(async (label, task) => {
    setBusy(true);
    setBusyLabel(label);
    setError("");
    try {
      return await task();
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, []);

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
    if (!isChatReady) return;
    setHostOfferCode("");
    setAnswerCode("");
  }, [isChatReady]);

  useEffect(() => {
    if (!nickname.trim()) return undefined;

    appendLog("info", `Инициализация mesh для «${nickname}»`);

    const mesh = new WebRtcMesh({
      selfId: clientId,
      selfName: nickname,
      onPeerListChange: setPeers,
      onMessage: (nextMessage) => {
        if (messageIdsRef.current.has(nextMessage.id)) return;
        messageIdsRef.current.add(nextMessage.id);
        setMessages((prev) => trimChatHistory([...prev, nextMessage], HISTORY_LIMIT));
      },
      onStatus: (nextStatus) => {
        appendLog("info", `Статус mesh: ${nextStatus}`);
      },
      onError: (message) => {
        appendLog("error", message);
        setError(message);
      },
      onLog: appendLog,
      onDiagnostics: setDiagnostics,
      onHandshakeOfferRefresh: async (offerBody) => {
        const payload = createSignalPayload("host-offer", offerBody);
        const encoded = await encodeSignalPayload(payload);
        setHostOfferCode(encoded);
        appendLog(
          "warn",
          `Приглашение обновлено (ICE restart, ${encoded.length} символов). Передайте новый код гостю.`,
        );
      },
      getHistory: () => messagesRef.current,
    });

    meshRef.current = mesh;
    mesh.publishDiagnostics();

    return () => {
      mesh.dispose();
      meshRef.current = null;
    };
  }, [clientId, nickname, appendLog]);

  function saveNickname() {
    const normalized = nicknameDraft.trim();
    if (!normalized) return;
    setNickname(normalized);
    meshRef.current?.setSelfName(normalized);
    appendLog("info", `Ник сохранён: ${normalized}`);
  }

  async function becomeHost() {
    if (!meshRef.current) return;

    await runBusy("Создаём приглашение (сбор сетевых адресов)...", async () => {
      const offerBody = await meshRef.current.createHostOffer();
      const payload = createSignalPayload("host-offer", offerBody);
      const encoded = await encodeSignalPayload(payload);
      setHostOfferCode(encoded);
      appendLog("info", `Приглашение готово (${encoded.length} символов)`);
    }).catch(() => {
      setError("Не удалось создать приглашение");
      appendLog("error", "Не удалось создать приглашение");
    });
  }

  const handleScannedValue = useCallback(async (value) => {
    if (!value?.trim()) return;

    if (!meshRef.current) {
      const message = "Сначала сохраните ник";
      setError(message);
      appendLog("warn", message);
      return;
    }

    await runBusy("Обработка кода...", async () => {
      appendLog("info", "Декодирование payload...");
      const parsed = await decodeSignalPayload(value);
      appendLog("info", `Тип сигнала: ${parsed.type}`);

      if (parsed.type === "host-offer") {
        const answerBody = await meshRef.current.acceptHostOffer(parsed.body);
        const payload = createSignalPayload("host-answer", answerBody);
        const encoded = await encodeSignalPayload(payload);
        setAnswerCode(encoded);
        appendLog("info", `Ответ гостя готов (${encoded.length} символов). Передайте его хосту.`);
        return;
      }

      if (parsed.type === "host-answer") {
        await meshRef.current.completeHostHandshake(parsed.body);
        appendLog("info", "Хост применил ответ. Ожидаем открытие чата у обоих участников.");
        return;
      }

      throw new Error("Неизвестный тип payload");
    }).catch((caught) => {
      const message = caught instanceof Error ? caught.message : "Некорректный payload";
      appendLog("error", message);
      setError(message.startsWith("Некорректный") ? message : `Ошибка: ${message}`);
    });
  }, [appendLog, runBusy]);

  function sendMessage() {
    const normalized = chatDraft.trim();
    if (!normalized || !meshRef.current) return;

    const message = createChatMessage(clientId, nickname, normalized);
    messageIdsRef.current.add(message.id);
    setMessages((prev) => trimChatHistory([...prev, message], HISTORY_LIMIT));
    meshRef.current.sendChatMessage(message);
    appendLog("info", "Сообщение отправлено в mesh");
    setChatDraft("");
  }

  function clearHistory() {
    setMessages([]);
    messageIdsRef.current = new Set();
    appendLog("info", "История чата очищена локально");
  }

  function resetSession() {
    if (resettingRef.current || busy) return;
    resettingRef.current = true;

    meshRef.current?.dispose();
    meshRef.current = null;
    const preserved = resetSessionState();
    setClientId(crypto.randomUUID());
    setNickname(preserved.nickname);
    setNicknameDraft(preserved.nicknameDraft);
    setMessages([]);
    setPeers([]);
    setHostOfferCode("");
    setAnswerCode("");
    setError("");
    setDiagnostics([]);
    messageIdsRef.current = new Set();
    appendLog("info", "Сессия сброшена");

    window.setTimeout(() => {
      resettingRef.current = false;
    }, 800);
  }

  const showHostActions = !isChatReady && !answerCode;
  const showQrOutput = Boolean(hostOfferCode || answerCode) && !isChatReady;

  return (
    <main className="layout">
      <section className="card">
        <h1>P2P WebRTC Chat</h1>
        <p className="muted">ID: {clientId}</p>
        <label className="field">
          <span>Ник</span>
          <input
            value={nicknameDraft}
            onChange={(event) => setNicknameDraft(event.target.value)}
            placeholder="Введите ник"
            disabled={isChatReady || busy}
          />
        </label>
        <div className="actions">
          <button type="button" onClick={saveNickname} disabled={!nicknameDraft.trim() || isChatReady || busy}>
            Сохранить ник
          </button>
          {showHostActions ? (
            <button type="button" onClick={becomeHost} disabled={!nickname || busy}>
              Создать приглашение (я хост)
            </button>
          ) : null}
          <button type="button" onClick={resetSession} disabled={busy}>
            Сбросить сессию
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <HandshakeSteps
        phase={phase}
        title={phaseMeta.title}
        hint={phaseMeta.hint}
        busyLabel={busyLabel}
      />

      <ConnectionLog
        entries={logEntries}
        diagnostics={diagnostics}
        onClear={() => setLogEntries([])}
      />

      {!isChatReady ? (
        <div className="grid">
          {showQrOutput ? (
            <QrPanel
              title={
                answerCode
                  ? "Ваш ответ — отдайте хосту"
                  : "Ваше приглашение — отдайте гостю"
              }
              value={answerCode || hostOfferCode}
            />
          ) : null}
          <QrScanner onScan={handleScannedValue} onLog={appendLog} disabled={busy} />
        </div>
      ) : null}

      {isChatReady ? (
        <>
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
