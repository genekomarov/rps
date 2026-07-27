import ConnectionLog from "../components/ConnectionLog";
import QrPanel from "../components/QrPanel";
import QrScanner from "../components/QrScanner";
import { useSession } from "../context/SessionContext";

export default function ConnectionPage() {
  const {
    clientId,
    nicknameDraft,
    setNicknameDraft,
    hostOfferCode,
    answerCode,
    error,
    busy,
    busyLabel,
    logEntries,
    diagnostics,
    isConnected,
    connectionStatus,
    connectionRole,
    setConnectionRole,
    saveNickname,
    becomeHost,
    handleScannedValue,
    resetSession,
    clearLog,
    appendLog,
  } = useSession();

  const showQrOutput = Boolean(hostOfferCode || answerCode) && !isConnected;
  const isHostWaiting = Boolean(hostOfferCode) && !answerCode;
  const mode = answerCode ? "guest" : hostOfferCode ? "host" : connectionRole;
  const showNicknameField = connectionStatus === "offline";
  const canChooseRole = Boolean(nicknameDraft.trim()) && connectionStatus === "offline" && !busy;
  const canCreateInvite = canChooseRole;
  const canAcceptInvite = canChooseRole;

  function handleCreateInvite() {
    saveNickname();
    if (!nicknameDraft.trim()) return;
    setConnectionRole("host");
    void becomeHost();
  }

  function handleAcceptInvite() {
    saveNickname();
    if (!nicknameDraft.trim()) return;
    setConnectionRole("guest");
  }

  return (
    <>
      <section className="card">
        <h1>{isConnected ? "Подключено" : "Подключение"}</h1>
        {showNicknameField ? (
          <label className="field">
            <span>Ник</span>
            <input
              value={nicknameDraft}
              onChange={(event) => setNicknameDraft(event.target.value)}
              placeholder="Введите ник"
              disabled={busy}
            />
          </label>
        ) : null}
        {connectionStatus === "offline" ? (
          <div className="actions actions-equal">
            <button type="button" onClick={handleCreateInvite} disabled={!canCreateInvite}>
              Создать приглашение
            </button>
            <button type="button" onClick={handleAcceptInvite} disabled={!canAcceptInvite}>
              Принять приглашение
            </button>
          </div>
        ) : (
          <div className="actions">
            <button type="button" onClick={resetSession} disabled={busy}>
              Сбросить сессию
            </button>
          </div>
        )}
        {error ? <p className="error">{error}</p> : null}
        {busyLabel ? <p className="busy-label">{busyLabel}</p> : null}
      </section>

      {!isConnected && mode ? (
        <div className="grid">
          {showQrOutput ? (
            <QrPanel
              title={
                answerCode
                  ? "Ваш ответ — отдайте хосту"
                  : "Ваше приглашение — отдайте гостю"
              }
              value={answerCode || hostOfferCode}
              fallbackLabel={answerCode ? "Ответ" : "Приглашение"}
            />
          ) : null}
          {mode === "host" && isHostWaiting ? (
            <QrScanner
              key={`${clientId}-answer`}
              onScan={handleScannedValue}
              onLog={appendLog}
              disabled={busy}
              inputLabel="Вставить ответ"
            />
          ) : null}
          {mode === "guest" && !answerCode ? (
            <QrScanner
              key={`${clientId}-invite`}
              onScan={handleScannedValue}
              onLog={appendLog}
              disabled={busy}
              inputLabel="Вставить приглашение"
            />
          ) : null}
        </div>
      ) : null}

      <ConnectionLog entries={logEntries} diagnostics={diagnostics} onClear={clearLog} />
    </>
  );
}
