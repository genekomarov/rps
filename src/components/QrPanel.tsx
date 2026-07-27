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
  fallbackLabel: string;
}

export default function QrPanel({ value, title, fallbackLabel }: QrPanelProps) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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

  useEffect(() => {
    setCopied(false);
  }, [value]);

  async function copyValue() {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="card qr-panel">
      <h3>{title}</h3>
      {src ? (
        <img src={src} alt="QR code" className="qr-image" />
      ) : (
        <p>Нет данных для QR</p>
      )}
      {error ? <p className="error">{error}</p> : null}
      <label className="field">
        <span>
          {fallbackLabel}
          {copied ? " — скопировано" : ""}
        </span>
        <input
          className="copy-field"
          readOnly
          value={value}
          onClick={() => void copyValue()}
          title="Нажмите, чтобы скопировать"
        />
      </label>
    </section>
  );
}
