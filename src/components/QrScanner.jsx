import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function QrScanner({ onScan }) {
  const [manualValue, setManualValue] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef(null);
  const mountId = "qr-scanner-region";

  useEffect(() => {
    if (!cameraEnabled) return undefined;

    const scanner = new Html5Qrcode(mountId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          onScan(decodedText);
          setCameraEnabled(false);
        },
        () => {},
      )
      .catch(() => {
        setError("Не удалось запустить камеру");
        setCameraEnabled(false);
      });

    return () => {
      if (!scannerRef.current) return;
      scannerRef.current
        .stop()
        .catch(() => {})
        .finally(() => {
          scannerRef.current = null;
        });
    };
  }, [cameraEnabled, onScan]);

  return (
    <section className="card">
      <h3>Сканировать QR</h3>
      <div className="actions">
        <button type="button" onClick={() => setCameraEnabled((prev) => !prev)}>
          {cameraEnabled ? "Остановить камеру" : "Запустить камеру"}
        </button>
      </div>
      <div id={mountId} className="scanner" />
      {error ? <p className="error">{error}</p> : null}

      <label className="field">
        <span>Или вставьте payload вручную</span>
        <textarea
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          rows={4}
          placeholder="rpschat://signal/..."
        />
      </label>
      <div className="actions">
        <button type="button" onClick={() => onScan(manualValue)} disabled={!manualValue.trim()}>
          Применить payload
        </button>
      </div>
    </section>
  );
}
