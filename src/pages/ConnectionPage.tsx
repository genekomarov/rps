import { useState } from "react";
import ConnectionLog from "../components/ConnectionLog";
import HandshakeSteps from "../components/HandshakeSteps";
import QrPanel from "../components/QrPanel";
import QrScanner from "../components/QrScanner";
import { useSession } from "../context/SessionContext";

export default function ConnectionPage() {
  const {
    clientId,
    nickname,
    nicknameDraft,
    setNicknameDraft,
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
    saveNickname,
    becomeHost,
    handleScannedValue,
    resetSession,
    clearLog,
    appendLog,
  } = useSession();

  const [connectionIntent, setConnectionIntent] = useState<"host" | "guest" | null>(null);

  const showQrOutput = Boolean(hostOfferCode || answerCode) && !isConnected;
  const isHostWaiting = Boolean(hostOfferCode) && !answerCode;
  const mode = answerCode ? "guest" : hostOfferCode ? "host" : connectionIntent;
  const canChooseRole = Boolean(nickname) && !isConnected && !busy;
  const canCreateInvite = canChooseRole && !answerCode;
  const canAcceptInvite = canChooseRole && !hostOfferCode && !answerCode;

  function handleResetSession() {
    setConnectionIntent(null);
    resetSession();
  }

  function handleCreateInvite() {
    setConnectionIntent("host");
    void becomeHost();
  }

  function handleAcceptInvite() {
    setConnectionIntent("guest");
  }

  return (
    <>
      <section className="card">
        <h1>Подключение</h1>
        <label className="field">
          <span>Ник</span>
          <input
            value={nicknameDraft}
            onChange={(event) => setNicknameDraft(event.target.value)}
            placeholder="Введите ник"
            disabled={isConnected || busy}
          />
        </label>
        <div className="actions">
          <button type="button" onClick={saveNickname} disabled={!nicknameDraft.trim() || isConnected || busy}>
            Сохранить ник
          </button>
        </div>
        {!mode && !isConnected ? (
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
            <button type="button" onClick={handleResetSession} disabled={busy}>
              Сбросить сессию
            </button>
          </div>
        )}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <HandshakeSteps
        phase={phase}
        title={phaseMeta.title}
        hint={phaseMeta.hint}
        busyLabel={busyLabel}
      />

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
              partnerFieldLabel="Ответ"
            />
          ) : null}
          {mode === "guest" && !answerCode ? (
            <QrScanner
              key={`${clientId}-invite`}
              onScan={handleScannedValue}
              onLog={appendLog}
              disabled={busy}
              inputLabel="Вставить приглашение"
              partnerFieldLabel="Приглашение"
            />
          ) : null}
        </div>
      ) : null}

      {isConnected ? (
        <section className="card">
          <h2>Соединение активно</h2>
          <p className="muted">
            P2P-канал открыт. Перейдите на главную, чтобы выбрать игру, или нажмите «Сбросить сессию»,
            чтобы разорвать соединение.
          </p>
          <p className="muted">
            Держите вкладку на экране: при сворачивании телефона WebRTC часто обрывается.
          </p>
        </section>
      ) : null}

      <ConnectionLog entries={logEntries} diagnostics={diagnostics} onClear={clearLog} />
    </>
  );
}
