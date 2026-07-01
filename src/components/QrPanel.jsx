import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrPanel({ value, title }) {
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
        const dataUrl = await QRCode.toDataURL(value, {
          margin: 1,
          width: 240,
        });
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

    generate();
    return () => {
      mounted = false;
    };
  }, [value]);

  return (
    <section className="card qr-panel">
      <h3>{title}</h3>
      {src ? <img src={src} alt="QR code" className="qr-image" /> : <p>Нет данных для QR</p>}
      {error ? <p className="error">{error}</p> : null}
      <label className="field">
        <span>Payload (fallback)</span>
        <textarea readOnly value={value} rows={5} />
      </label>
    </section>
  );
}
