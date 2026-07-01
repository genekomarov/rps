import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

const SCANNER_STATE = {
  NOT_STARTED: 1,
  SCANNING: 2,
  PAUSED: 3,
};

const SCANNER_CREATE_CONFIG = {
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true,
  },
};

function isLikelyMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function buildScanConfig(facingMode) {
  return {
    fps: 15,
    disableFlip: false,
    videoConstraints: {
      facingMode: { ideal: facingMode },
      width: { min: 640, ideal: 1280 },
      height: { min: 480, ideal: 720 },
    },
  };
}

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

async function startWithFallback(scanner, onSuccess) {
  const facingModes = isLikelyMobile()
    ? ["environment", "user"]
    : ["user", "environment"];

  let lastError;

  for (const facingMode of facingModes) {
    try {
      await scanner.start(
        { facingMode },
        buildScanConfig(facingMode),
        onSuccess,
        () => {},
      );
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const cameras = await Html5Qrcode.getCameras();
  if (cameras?.length) {
    const preferred = isLikelyMobile()
      ? cameras.find((camera) => /back|rear|environment/i.test(camera.label))
      : cameras.find((camera) => /front|user|facetime|integrated/i.test(camera.label));

    const cameraId = (preferred || cameras[0]).id;

    try {
      await scanner.start(
        cameraId,
        {
          fps: 15,
          disableFlip: false,
        },
        onSuccess,
        () => {},
      );
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
  const [fileBusy, setFileBusy] = useState(false);
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const fileInputRef = useRef(null);
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
        scanner = new Html5Qrcode(regionId, SCANNER_CREATE_CONFIG);
        scannerRef.current = scanner;

        await startWithFallback(scanner, (decodedText) => {
          if (disposed) return;
          onScanRef.current(decodedText);
          setManualValue(decodedText);
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

  async function handleImageFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || cameraEnabled) return;

    setFileBusy(true);
    setError("");

    const scanner = new Html5Qrcode(regionId, SCANNER_CREATE_CONFIG);

    try {
      const decodedText = await scanner.scanFile(file, true);
      setManualValue(decodedText);
      onScanRef.current(decodedText);
    } catch {
      setError("QR на изображении не найден. Попробуйте скриншот крупнее и без бликов.");
    } finally {
      await stopScanner(scanner);
      setFileBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Сканировать QR</h3>
      <p className="muted scanner-hint">
        QR с экрана компьютера лучше читать крупным планом, без бликов. На ПК удобнее загрузить
        скриншот.
      </p>
      <div className="actions">
        <button type="button" onClick={() => setCameraEnabled((prev) => !prev)} disabled={fileBusy}>
          {cameraEnabled ? "Остановить камеру" : "Запустить камеру"}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={cameraEnabled || fileBusy}
        >
          {fileBusy ? "Читаю файл..." : "Загрузить изображение"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleImageFile}
        />
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
