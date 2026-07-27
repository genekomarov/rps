import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createLogEntry, trimLogEntries } from "../lib/connectionLog";
import {
  createChatMessage,
  createSignalPayload,
  decodeSignalPayload,
  encodeSignalPayload,
  trimChatHistory,
} from "../lib/protocol";
import { getPhaseMeta, resolvePhase } from "../lib/sessionPhase";
import { loadClientId, loadState, resetClientId, resetSessionState, saveState } from "../lib/storage";
import { WebRtcMesh } from "../lib/webrtc";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import type {
  ChatMessage,
  ConnectionRole,
  ConnectionStatus,
  GameMessagePayload,
  HostAnswerBody,
  HostOfferBody,
  LogEntry,
  LogLevel,
  PeerDiagnostic,
  PeerListItem,
  PhaseMeta,
  SessionPhase,
} from "../types";

const HISTORY_LIMIT = 100;

export interface SessionContextValue {
  clientId: string;
  nickname: string;
  nicknameDraft: string;
  setNicknameDraft: (value: string) => void;
  messages: ChatMessage[];
  peers: PeerListItem[];
  chatDraft: string;
  setChatDraft: (value: string) => void;
  hostOfferCode: string;
  answerCode: string;
  error: string;
  busy: boolean;
  busyLabel: string;
  logEntries: LogEntry[];
  diagnostics: PeerDiagnostic[];
  phase: SessionPhase;
  phaseMeta: PhaseMeta;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  connectionRole: ConnectionRole | null;
  setConnectionRole: (role: ConnectionRole | null) => void;
  saveNickname: () => void;
  becomeHost: () => Promise<void>;
  handleScannedValue: (value: string) => Promise<void>;
  sendMessage: () => void;
  clearHistory: () => void;
  resetSession: () => void;
  clearLog: () => void;
  appendLog: (level: LogLevel, message: string) => void;
  sendGameMessage: (gameId: string, body: unknown) => void;
  subscribeGameMessages: (listener: (message: GameMessagePayload) => void) => () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const stored = useMemo(() => loadState(), []);
  const [clientId, setClientId] = useState(() => loadClientId());
  const [nickname, setNickname] = useState(stored.nickname || "");
  const [nicknameDraft, setNicknameDraft] = useState(
    stored.nicknameDraft || stored.nickname || "",
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    trimChatHistory(stored.messages || [], HISTORY_LIMIT),
  );
  const [peers, setPeers] = useState<PeerListItem[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [hostOfferCode, setHostOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<PeerDiagnostic[]>([]);
  const [connectionRole, setConnectionRole] = useState<ConnectionRole | null>(null);

  const meshRef = useRef<WebRtcMesh | null>(null);
  const resettingRef = useRef(false);
  const messagesRef = useRef(messages);
  const messageIdsRef = useRef(new Set(messages.map((item) => item.id)));
  const gameMessageListenersRef = useRef(new Set<(message: GameMessagePayload) => void>());

  const phase = resolvePhase({ nickname, hostOfferCode, answerCode, peers, busy });
  const phaseMeta = getPhaseMeta(phase);
  const isConnected = phase === "chat";
  const connectionStatus: ConnectionStatus = isConnected
    ? "online"
    : connectionRole || hostOfferCode || answerCode
      ? "connecting"
      : "offline";
  useScreenWakeLock(isConnected);

  const appendLog = useCallback((level: LogLevel, message: string) => {
    setLogEntries((prev) => trimLogEntries([...prev, createLogEntry(level, message)]));
  }, []);

  const runBusy = useCallback(async <T,>(label: string, task: () => Promise<T>) => {
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
    saveState({ nickname });
  }, [nickname]);

  useEffect(() => {
    saveState({ nicknameDraft });
  }, [nicknameDraft]);

  useEffect(() => {
    saveState({ messages: trimChatHistory(messages, HISTORY_LIMIT) });
  }, [messages]);

  const wasConnectedRef = useRef(false);

  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true;
      setHostOfferCode("");
      setAnswerCode("");
      return;
    }

    if (!wasConnectedRef.current) return;

    wasConnectedRef.current = false;
    setConnectionRole(null);
    setHostOfferCode("");
    setAnswerCode("");
    appendLog("info", "Соединение разорвано");
  }, [isConnected, appendLog]);

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
      onGameMessage: (gameMessage) => {
        for (const listener of gameMessageListenersRef.current) {
          listener(gameMessage);
        }
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

  const saveNickname = useCallback(() => {
    const normalized = nicknameDraft.trim();
    if (!normalized) return;
    setNickname(normalized);
    meshRef.current?.setSelfName(normalized);
    appendLog("info", `Ник сохранён: ${normalized}`);
  }, [nicknameDraft, appendLog]);

  const becomeHost = useCallback(async () => {
    const mesh = meshRef.current;
    if (!mesh) return;

    await runBusy("Создаём приглашение (сбор сетевых адресов)...", async () => {
      const offerBody = await mesh.createHostOffer();
      const payload = createSignalPayload("host-offer", offerBody);
      const encoded = await encodeSignalPayload(payload);
      setHostOfferCode(encoded);
      appendLog("info", `Приглашение готово (${encoded.length} символов)`);
    }).catch(() => {
      setError("Не удалось создать приглашение");
      appendLog("error", "Не удалось создать приглашение");
    });
  }, [appendLog, runBusy]);

  const handleScannedValue = useCallback(
    async (value: string) => {
      if (!value?.trim()) return;

      const mesh = meshRef.current;
      if (!mesh) {
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
          const answerBody = await mesh.acceptHostOffer(parsed.body as HostOfferBody);
          const payload = createSignalPayload("host-answer", answerBody);
          const encoded = await encodeSignalPayload(payload);
          setAnswerCode(encoded);
          appendLog("info", `Ответ гостя готов (${encoded.length} символов). Передайте его хосту.`);
          return;
        }

        if (parsed.type === "host-answer") {
          await mesh.completeHostHandshake(parsed.body as HostAnswerBody);
          appendLog("info", "Хост применил ответ. Ожидаем открытие соединения у обоих участников.");
          return;
        }

        throw new Error("Неизвестный тип payload");
      }).catch((caught) => {
        const message = caught instanceof Error ? caught.message : "Некорректный payload";
        appendLog("error", message);
        setError(message.startsWith("Некорректный") ? message : `Ошибка: ${message}`);
      });
    },
    [appendLog, runBusy],
  );

  const sendMessage = useCallback(() => {
    const normalized = chatDraft.trim();
    if (!normalized || !meshRef.current) return;

    const message = createChatMessage(clientId, nickname, normalized);
    messageIdsRef.current.add(message.id);
    setMessages((prev) => trimChatHistory([...prev, message], HISTORY_LIMIT));
    meshRef.current.sendChatMessage(message);
    appendLog("info", "Сообщение отправлено в mesh");
    setChatDraft("");
  }, [chatDraft, clientId, nickname, appendLog]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    messageIdsRef.current = new Set();
    appendLog("info", "История чата очищена локально");
  }, [appendLog]);

  const resetSession = useCallback(() => {
    if (resettingRef.current || busy) return;
    resettingRef.current = true;

    meshRef.current?.dispose();
    meshRef.current = null;
    const preserved = resetSessionState();
    setClientId(resetClientId());
    setNickname(preserved.nickname);
    setNicknameDraft(preserved.nicknameDraft);
    setMessages([]);
    setPeers([]);
    setHostOfferCode("");
    setAnswerCode("");
    setConnectionRole(null);
    setError("");
    setDiagnostics([]);
    messageIdsRef.current = new Set();
    appendLog("info", "Сессия сброшена");

    window.setTimeout(() => {
      resettingRef.current = false;
    }, 800);
  }, [appendLog, busy]);

  const clearLog = useCallback(() => {
    setLogEntries([]);
  }, []);

  const sendGameMessage = useCallback(
    (gameId: string, body: unknown) => {
      meshRef.current?.sendGameMessage({
        gameId,
        senderId: clientId,
        body,
      });
    },
    [clientId],
  );

  const subscribeGameMessages = useCallback((listener: (message: GameMessagePayload) => void) => {
    gameMessageListenersRef.current.add(listener);
    return () => {
      gameMessageListenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      clientId,
      nickname,
      nicknameDraft,
      setNicknameDraft,
      messages,
      peers,
      chatDraft,
      setChatDraft,
      hostOfferCode,
      answerCode,
      error,
      busy,
      busyLabel,
      logEntries,
      diagnostics,
      phase,
      phaseMeta,
      isConnected,
      connectionStatus,
      connectionRole,
      setConnectionRole,
      saveNickname,
      becomeHost,
      handleScannedValue,
      sendMessage,
      clearHistory,
      resetSession,
      clearLog,
      appendLog,
      sendGameMessage,
      subscribeGameMessages,
    }),
    [
      clientId,
      nickname,
      nicknameDraft,
      messages,
      peers,
      chatDraft,
      hostOfferCode,
      answerCode,
      error,
      busy,
      busyLabel,
      logEntries,
      diagnostics,
      phase,
      phaseMeta,
      isConnected,
      connectionStatus,
      connectionRole,
      saveNickname,
      becomeHost,
      handleScannedValue,
      sendMessage,
      clearHistory,
      resetSession,
      clearLog,
      appendLog,
      sendGameMessage,
      subscribeGameMessages,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
