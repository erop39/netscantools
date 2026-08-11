/**
 * Device type icons — names aligned with Semantic UI / Font Awesome–style sets
 * https://semantic-ui.com/elements/icon.html
 */
import type { ReactNode, SVGProps } from "react";

export type DeviceIconKey =
  | "desktop"
  | "laptop"
  | "tablet"
  | "mobile"
  | "server"
  | "database"
  | "hdd"
  | "wifi"
  | "broadcast"
  | "sitemap"
  | "cloud"
  | "camera"
  | "video"
  | "print"
  | "tv"
  | "gamepad"
  | "headphones"
  | "microchip"
  | "plug"
  | "lightbulb"
  | "home"
  | "shield"
  | "key"
  | "cogs"
  | "globe"
  | "ethernet"
  | "router"
  | "phone"
  | "fax"
  | "usb"
  | "bluetooth"
  | "satellite"
  | "power"
  | "thermometer"
  | "bell"
  | "folder"
  | "box"
  | "car"
  | "question";

export const DEVICE_ICONS: { key: DeviceIconKey; label: string }[] = [
  { key: "wifi", label: "Wi‑Fi" },
  { key: "router", label: "Router" },
  { key: "sitemap", label: "Switch" },
  { key: "ethernet", label: "Ethernet" },
  { key: "server", label: "Server" },
  { key: "database", label: "Database" },
  { key: "hdd", label: "NAS / HDD" },
  { key: "desktop", label: "Desktop" },
  { key: "laptop", label: "Laptop" },
  { key: "tablet", label: "Tablet" },
  { key: "mobile", label: "Mobile" },
  { key: "phone", label: "Phone" },
  { key: "camera", label: "Camera" },
  { key: "video", label: "Video" },
  { key: "tv", label: "TV" },
  { key: "print", label: "Printer" },
  { key: "cloud", label: "Cloud" },
  { key: "globe", label: "Globe" },
  { key: "broadcast", label: "Broadcast" },
  { key: "satellite", label: "Satellite" },
  { key: "bluetooth", label: "Bluetooth" },
  { key: "usb", label: "USB" },
  { key: "microchip", label: "IoT / Chip" },
  { key: "plug", label: "Power plug" },
  { key: "power", label: "Power" },
  { key: "lightbulb", label: "Smart light" },
  { key: "thermometer", label: "Sensor" },
  { key: "home", label: "Home" },
  { key: "shield", label: "Security" },
  { key: "key", label: "Access" },
  { key: "cogs", label: "Settings" },
  { key: "headphones", label: "Audio" },
  { key: "gamepad", label: "Console" },
  { key: "bell", label: "Alert" },
  { key: "folder", label: "Storage" },
  { key: "box", label: "Device" },
  { key: "car", label: "Vehicle" },
  { key: "fax", label: "Fax" },
  { key: "question", label: "Unknown" },
];

/** Quick type chips → suggest type label + icon */
export const TYPE_PRESETS: { type: string; icon: DeviceIconKey; label: string }[] = [
  { type: "router", icon: "router", label: "Router" },
  { type: "switch", icon: "sitemap", label: "Switch" },
  { type: "ap", icon: "wifi", label: "Access Point" },
  { type: "nas", icon: "hdd", label: "NAS" },
  { type: "server", icon: "server", label: "Server" },
  { type: "camera", icon: "camera", label: "Camera" },
  { type: "nvr", icon: "video", label: "NVR / DVR" },
  { type: "printer", icon: "print", label: "Printer" },
  { type: "pc", icon: "desktop", label: "PC" },
  { type: "laptop", icon: "laptop", label: "Laptop" },
  { type: "phone", icon: "mobile", label: "Phone" },
  { type: "tv", icon: "tv", label: "Smart TV" },
  { type: "iot", icon: "microchip", label: "IoT" },
  { type: "ups", icon: "power", label: "UPS" },
  { type: "other", icon: "box", label: "Other" },
];

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, className, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.65,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true as const,
    ...rest,
  };
}

const paths: Record<DeviceIconKey, ReactNode> = {
  desktop: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  laptop: (
    <>
      <rect x="3" y="5" width="18" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </>
  ),
  tablet: (
    <>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M12 18h.01" />
    </>
  ),
  mobile: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M12 18h.01" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="3" width="18" height="6" rx="1.5" />
      <rect x="3" y="11" width="18" height="6" rx="1.5" />
      <path d="M7 6h.01M7 14h.01M12 6h5M12 14h5" />
      <path d="M6 20h12" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  hdd: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 12h.01M12 12h6" />
    </>
  ),
  wifi: (
    <>
      <path d="M5 12.5a9 9 0 0 1 14 0" />
      <path d="M8.5 15.5a5 5 0 0 1 7 0" />
      <path d="M12 19h.01" />
    </>
  ),
  broadcast: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 7.8a6 6 0 0 0 0 8.4" />
      <path d="M19 5a10 10 0 0 1 0 14M5 5a10 10 0 0 0 0 14" />
    </>
  ),
  sitemap: (
    <>
      <rect x="9" y="2" width="6" height="5" rx="1" />
      <path d="M12 7v4M5 15v-4h14v4" />
      <rect x="2" y="15" width="6" height="5" rx="1" />
      <rect x="9" y="15" width="6" height="5" rx="1" />
      <rect x="16" y="15" width="6" height="5" rx="1" />
    </>
  ),
  cloud: (
    <>
      <path d="M18 18H7a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6-1.5A3.5 3.5 0 0 1 18 18z" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3z" />
    </>
  ),
  print: (
    <>
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 17h12v4H6z" />
    </>
  ),
  tv: (
    <>
      <rect x="2" y="5" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </>
  ),
  gamepad: (
    <>
      <rect x="2" y="8" width="20" height="10" rx="4" />
      <path d="M8 12v4M6 14h4M16 12h.01M18 14h.01" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2zM18 12h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-7z" />
    </>
  ),
  microchip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
    </>
  ),
  plug: (
    <>
      <path d="M9 2v5M15 2v5M8 7h8v3a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4V7z" />
      <path d="M12 14v8" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3 11c.5.6 1 1.3 1 2h4c0-.7.5-1.4 1-2A6 6 0 0 0 12 3z" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9.5 4.5-1 8-4.5 8-9.5V6l-8-3z" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="M11.5 12.5 21 3M17 3l2 2M15 5l2 2" />
    </>
  ),
  cogs: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  ethernet: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8v3M12 8v3M16 8v3M8 14h8v3H8z" />
    </>
  ),
  router: (
    <>
      <rect x="3" y="11" width="18" height="8" rx="2" />
      <path d="M7 15h.01M12 15h.01M6 11V8a3 3 0 0 1 6 0v3M15 8a3 3 0 0 1 3 3v0" />
    </>
  ),
  phone: (
    <>
      <path d="M6 3h5l1 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 1v5a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />
    </>
  ),
  fax: (
    <>
      <rect x="4" y="8" width="16" height="11" rx="1.5" />
      <path d="M7 8V5h7l3 3v0M8 13h5M8 16h8" />
    </>
  ),
  usb: (
    <>
      <path d="M12 2v14" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 6h8M9 10h6" />
    </>
  ),
  bluetooth: (
    <>
      <path d="m7 7 10 10-5 5V2l5 5L7 17" />
    </>
  ),
  satellite: (
    <>
      <path d="m13 7 4-4 3 3-4 4" />
      <path d="m13 7-2 2a4 4 0 0 0 0 5.7l5.6 5.6a4 4 0 0 0 5.7 0l2-2" />
      <path d="M4 14a6 6 0 0 0 6 6" />
      <path d="M2 20a10 10 0 0 0 10 0" />
    </>
  ),
  power: (
    <>
      <path d="M12 2v10" />
      <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
    </>
  ),
  thermometer: (
    <>
      <path d="M12 3a3 3 0 0 0-3 3v8a4 4 0 1 0 6 0V6a3 3 0 0 0-3-3z" />
      <path d="M12 14v4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  box: (
    <>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M12 12v9M3 7.5l9 4.5 9-4.5" />
    </>
  ),
  car: (
    <>
      <path d="M4 14h16l-1.5-5H5.5z" />
      <path d="M5 14v4h2v-1h10v1h2v-4" />
      <circle cx="7.5" cy="17.5" r="1.2" />
      <circle cx="16.5" cy="17.5" r="1.2" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3 1-1.3 2" />
      <path d="M12 17h.01" />
    </>
  ),
};

export function DeviceIcon({
  name,
  size = 20,
  className,
}: {
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const key = (name && name in paths ? name : "question") as DeviceIconKey;
  return <svg {...base({ size, className })}>{paths[key]}</svg>;
}

export function isDeviceIconKey(v: string | null | undefined): v is DeviceIconKey {
  return Boolean(v && v in paths);
}
