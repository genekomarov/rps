import { useEffect, useRef } from "react";
import { formatLogTime } from "../lib/connectionLog";
import type { LogEntry, PeerDiagnostic } from "../types";

interface ConnectionLogProps {
  entries: LogEntry[];
  diagnostics: PeerDiagnostic[];
  onClear: () => void;
}

export default function ConnectionLog({ entries, diagnostics, onClear }: ConnectionLogProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [entries, diagnostics]);

  return (
    <section className="card connection-log">
      <div className="connection-log-header">
        <h2>Журнал соединения</h2>
        <button type="button" className="button-secondary" onClick={onClear}>
          Очистить
        </button>
      </div>

      {diagnostics?.length ? (
        <div className="connection-diagnostics">
          {diagnostics.map((item) => (
            <div key={item.peerId} className="diag-row">
              <strong>{item.peerName || item.peerId}</strong>
              <span>ICE: {item.ice}</span>
              <span>PC: {item.connection}</span>
              <span>DC: {item.dc}</span>
              <span>{item.ready ? "готов" : "ожидание"}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Нет активных peer-соединений</p>
      )}

      <div ref={bodyRef} className="connection-log-body">
        {entries.length === 0 ? (
          <p className="muted">События появятся здесь при подключении</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={`log-line log-${entry.level}`}>
              <time>{formatLogTime(entry.time)}</time>
              <span>{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
