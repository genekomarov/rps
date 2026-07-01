import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const SCANNER_STATE = {
  NOT_STARTED: 1,
  SCANNING: 2,
  PAUSED: 3,
};

async function stopScanner(scanner) {
  if (!scanner) return;

  try {
    const state = scanner.getState();
    if (state === SCANNER_STATE.SCANNING || state === SCANNER_STATE.PAUSED) {
      await scanner.stop();
    }
  } catch {
    // Scanner may still be starting when React tears the effect down.
  }

  try {
    scanner.clear();
  } catch {
    // Ignore cleanup errors.
  }
}

async function startWithFallback(scanner, config, onSuccess) {
  const attempts = [
    { facingMode: "environment" },
    { facingMode: "user" },
  ];

  let lastError;

  for (const cameraConfig of attempts) {
    try {
      await scanner.start(cameraConfig, config, onSuccess, () => {});
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const cameras = await Html5Qrcode.getCameras();
  if (cameras?.length) {
    const preferred = cameras.find((camera) => /back|rear|environment/i.test(camera.label));
    const cameraId = (preferred || cameras[cameras.length - 1]).id;

    try {
      await scanner.start(cameraId, config, onSuccess, () => {});
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Не удалось открыть камеру");
}

export default function QrScanner({ onScan }) {
  const [manualValue, setManualValue] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [error, setError] = useState("");
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const regionId = useId().replace(/:/g, "");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!cameraEnabled) return undefined;

    if (!window.isSecureContext) {
      setError("Камера работает только по HTTPS или на localhost");
      setCameraEnabled(false);
      return undefined;
    }

    let disposed = false;
    let scanner;

    async function run() {
      setError("");

      try {
        scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;

        const config = {
          fps: 10,
          aspectRatio: 1,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.75);
            return { width: edge, height: edge };
          },
        };

        await startWithFallback(scanner, config, (decodedText) => {
          if (disposed) return;
          onScanRef.current(decodedText);
          setCameraEnabled(false);
        });

        if (disposed) {
          await stopScanner(scanner);
        }
      } catch {
        if (!disposed) {
          setError("Не удалось запустить камеру. Разрешите доступ к камере в браузере.");
          setCameraEnabled(false);
        } else if (scanner) {
          await stopScanner(scanner);
        }
      }
    }

    run();

    return () => {
      disposed = true;
      const activeScanner = scanner;
      stopScanner(activeScanner).finally(() => {
        if (scannerRef.current === activeScanner) {
          scannerRef.current = null;
        }
      });
    };
  }, [cameraEnabled, regionId]);

  return (
    <section className="card">
      <h3>Сканировать QR</h3>
      <div className="actions">
        <button type="button" onClick={() => setCameraEnabled((prev) => !prev)}>
          {cameraEnabled ? "Остановить камеру" : "Запустить камеру"}
        </button>
      </div>
      <div id={regionId} className="scanner" />
      {error ? <p className="error">{error}</p> : null}

      <label className="field">
        <span>Или вставьте payload вручную</span>
        <textarea
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          rows={4}
          placeholder="rps://..."
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
