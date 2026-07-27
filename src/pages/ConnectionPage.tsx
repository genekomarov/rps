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

  const showHostActions = !isConnected && !answerCode;
  const showQrOutput = Boolean(hostOfferCode || answerCode) && !isConnected;
  const isHostWaiting = Boolean(hostOfferCode) && !answerCode;

  return (
    <>
      <section className="card">
        <h1>Подключение</h1>
        <p className="muted">
          Управление P2P-соединением. Здесь можно создать приглашение, принять код партнёра или
          разорвать сессию. Работает только в локальной сети.
        </p>
        <p className="muted">ID: {clientId}</p>
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

      {!isConnected ? (
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
          <QrScanner
            key={clientId}
            onScan={handleScannedValue}
            onLog={appendLog}
            disabled={busy}
            inputLabel={isHostWaiting ? "Вставить ответ" : "Вставить приглашение"}
            partnerFieldLabel={isHostWaiting ? "Ответ" : "Приглашение"}
          />
        </div>
      ) : (
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
      )}

      <ConnectionLog entries={logEntries} diagnostics={diagnostics} onClear={clearLog} />
    </>
  );
}
