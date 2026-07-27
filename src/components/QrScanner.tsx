import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Html5Qrcode } from "html5-qrcode";
import type { LogLevel } from "../types";

const SCANNER_STATE = {
  NOT_STARTED: 1,
  SCANNING: 2,
  PAUSED: 3,
} as const;

const SCANNER_CREATE_CONFIG = {
  verbose: false,
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true,
  },
};

function isLikelyMobile(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function buildScanConfig() {
  return {
    fps: 10,
    disableFlip: false,
  };
}

async function stopScanner(scanner: Html5Qrcode | null | undefined): Promise<void> {
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

async function startWithFallback(
  scanner: Html5Qrcode,
  onSuccess: (decodedText: string) => void,
  onLog?: (level: LogLevel, message: string) => void,
): Promise<void> {
  const facingModes = isLikelyMobile()
    ? (["environment", "user"] as const)
    : (["user", "environment"] as const);

  let lastError: unknown;

  for (const facingMode of facingModes) {
    try {
      onLog?.("info", `Камера: пробуем ${facingMode}`);
      await scanner.start({ facingMode }, buildScanConfig(), onSuccess, () => {});
      onLog?.("info", "Камера запущена");
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
    onLog?.("info", `Камера: используем устройство ${cameraId}`);

    try {
      await scanner.start(cameraId, buildScanConfig(), onSuccess, () => {});
      onLog?.("info", "Камера запущена");
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Не удалось открыть камеру");
}

interface QrScannerProps {
  onScan: (value: string) => void | Promise<void>;
  onLog?: (level: LogLevel, message: string) => void;
  disabled?: boolean;
  inputLabel: string;
  partnerFieldLabel: string;
}

export default function QrScanner({
  onScan,
  onLog,
  disabled = false,
  inputLabel,
  partnerFieldLabel,
}: QrScannerProps) {
  const [manualValue, setManualValue] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [error, setError] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const onLogRef = useRef(onLog);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const regionId = useId().replace(/:/g, "");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  useEffect(() => {
    if (!cameraEnabled || disabled) return undefined;

    if (!window.isSecureContext) {
      setError("Камера работает только по HTTPS или на localhost");
      setCameraEnabled(false);
      return undefined;
    }

    let disposed = false;
    let scanner: Html5Qrcode | undefined;

    async function run() {
      setError("");

      try {
        scanner = new Html5Qrcode(regionId, SCANNER_CREATE_CONFIG);
        scannerRef.current = scanner;

        await startWithFallback(
          scanner,
          (decodedText) => {
            if (disposed) return;
            onLogRef.current?.("info", "QR распознан камерой");
            void onScanRef.current(decodedText);
            setManualValue(decodedText);
            setCameraEnabled(false);
          },
          onLogRef.current,
        );

        if (disposed) {
          await stopScanner(scanner);
        }
      } catch {
        if (!disposed) {
          setError("Не удалось запустить камеру");
          onLogRef.current?.("error", "Не удалось запустить камеру");
          setCameraEnabled(false);
        } else if (scanner) {
          await stopScanner(scanner);
        }
      }
    }

    void run();

    return () => {
      disposed = true;
      const activeScanner = scanner;
      stopScanner(activeScanner).finally(() => {
        if (scannerRef.current === activeScanner) {
          scannerRef.current = null;
        }
      });
    };
  }, [cameraEnabled, disabled, regionId]);

  async function handleImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || cameraEnabled || disabled) return;

    setFileBusy(true);
    setError("");
    onLogRef.current?.("info", "Сканирование QR из файла...");

    const scanner = new Html5Qrcode(regionId, SCANNER_CREATE_CONFIG);

    try {
      const decodedText = await scanner.scanFile(file, true);
      setManualValue(decodedText);
      onLogRef.current?.("info", "QR распознан из файла");
      void onScanRef.current(decodedText);
    } catch {
      setError("QR на изображении не найден");
      onLogRef.current?.("warn", "QR на изображении не найден");
    } finally {
      await stopScanner(scanner);
      setFileBusy(false);
    }
  }

  function applyManual() {
    if (!manualValue.trim() || disabled) return;
    onLogRef.current?.("info", "Применение payload из поля ввода");
    void onScan(manualValue);
  }

  return (
    <section className="card">
      <h3>Принять код</h3>
      <p className="muted scanner-hint">
        Быстрее всего — вставить текст из «{partnerFieldLabel}». Камера подходит для коротких QR.
      </p>
      <label className="field">
        <span>{inputLabel}</span>
        <textarea
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          rows={4}
          placeholder="rps://..."
          disabled={disabled || fileBusy}
        />
      </label>
      <div className="actions">
        <button type="button" onClick={applyManual} disabled={!manualValue.trim() || disabled || fileBusy}>
          Применить
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={cameraEnabled || fileBusy || disabled}
        >
          {fileBusy ? "Читаю файл..." : "Загрузить фото QR"}
        </button>
        <button
          type="button"
          onClick={() => setCameraEnabled((prev) => !prev)}
          disabled={fileBusy || disabled}
        >
          {cameraEnabled ? "Остановить камеру" : "Сканировать камерой"}
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
    </section>
  );
}
