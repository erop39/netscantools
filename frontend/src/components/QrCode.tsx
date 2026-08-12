import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  value: string;
  size?: number;
  className?: string;
};

/** Offline QR as data-URL (qrcode package). */
export function QrCode({ value, size = 160, className = "" }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value.trim()) {
      setSrc(null);
      return;
    }
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: "#0b1a2e", light: "#e8f4ff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) {
          setSrc(url);
          setErr(null);
        }
      })
      .catch(() => {
        if (!cancelled) setErr("QR failed");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (err) {
    return <p className="text-xs text-red-300/80">{err}</p>;
  }
  if (!src) {
    return (
      <div
        className={`animate-pulse rounded-lg bg-white/10 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={`QR code for ${value}`}
      className={`rounded-lg border border-white/15 ${className}`}
    />
  );
}
