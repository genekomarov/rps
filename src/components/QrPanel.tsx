import { useEffect, useState } from "react";
import QRCode, { type QRCodeToDataURLOptions } from "qrcode";

function qrRenderOptions(value: string): QRCodeToDataURLOptions {
  const length = value.length;

  if (length > 1800) {
    return { width: 512, margin: 2, errorCorrectionLevel: "H" };
  }

  if (length > 900) {
    return { width: 420, margin: 3, errorCorrectionLevel: "M" };
  }

  return { width: 360, margin: 4, errorCorrectionLevel: "M" };
}

interface QrPanelProps {
  value: string;
  title: string;
}

export default function QrPanel({ value, title }: QrPanelProps) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function generate() {
      if (!value) {
        setSrc("");
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(value, qrRenderOptions(value));
        if (mounted) {
          setSrc(dataUrl);
          setError("");
        }
      } catch {
        if (mounted) {
          setError("Не удалось сгенерировать QR");
          setSrc("");
        }
      }
    }

    void generate();
    return () => {
      mounted = false;
    };
  }, [value]);

  return (
    <section className="card qr-panel">
      <h3>{title}</h3>
      {src ? (
        <img src={src} alt="QR code" className="qr-image" />
      ) : (
        <p>Нет данных для QR</p>
      )}
      {value ? <p className="muted">Увеличьте QR на весь экран, если камера не читает с монитора.</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <label className="field">
        <span>Payload (fallback)</span>
        <textarea readOnly value={value} rows={5} />
      </label>
    </section>
  );
}
