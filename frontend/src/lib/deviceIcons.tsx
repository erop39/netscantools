/**
 * Device type icons — Semantic UI / FA–style names.
 * Grouped for a tidy IconPicker layout.
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
  | "question"
  /* Apple ecosystem */
  | "iphone"
  | "ipad"
  | "mac"
  | "appletv"
  | "applewatch"
  | "airpods"
  /* Android / other mobile */
  | "android"
  | "androidtv"
  /* Kitchen appliances */
  | "fridge"
  | "oven"
  | "microwave"
  | "dishwasher"
  | "kettle"
  | "coffee"
  | "blender"
  | "washing";

export type IconGroup = {
  id: string;
  label: string;
  keys: DeviceIconKey[];
};

/** Ordered groups for the picker */
export const ICON_GROUPS: IconGroup[] = [
  {
    id: "network",
    label: "Network",
    keys: ["wifi", "router", "sitemap", "ethernet", "broadcast", "globe", "cloud", "satellite", "bluetooth"],
  },
  {
    id: "apple",
    label: "Apple",
    keys: ["iphone", "ipad", "mac", "appletv", "applewatch", "airpods"],
  },
  {
    id: "android",
    label: "Android & mobile",
    keys: ["android", "androidtv", "mobile", "phone", "tablet"],
  },
  {
    id: "compute",
    label: "Compute & storage",
    keys: ["desktop", "laptop", "server", "database", "hdd", "folder", "box"],
  },
  {
    id: "media",
    label: "Media & office",
    keys: ["camera", "video", "tv", "print", "headphones", "gamepad", "fax"],
  },
  {
    id: "kitchen",
    label: "Kitchen",
    keys: ["fridge", "oven", "microwave", "dishwasher", "kettle", "coffee", "blender", "washing"],
  },
  {
    id: "home",
    label: "Home & IoT",
    keys: ["microchip", "plug", "power", "lightbulb", "thermometer", "home", "shield", "key", "cogs", "bell", "usb", "car", "question"],
  },
];

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
  { key: "iphone", label: "iPhone" },
  { key: "ipad", label: "iPad" },
  { key: "mac", label: "Mac / macOS" },
  { key: "appletv", label: "Apple TV" },
  { key: "applewatch", label: "Apple Watch" },
  { key: "airpods", label: "AirPods" },
  { key: "android", label: "Android phone" },
  { key: "androidtv", label: "Android TV" },
  { key: "fridge", label: "Fridge" },
  { key: "oven", label: "Oven" },
  { key: "microwave", label: "Microwave" },
  { key: "dishwasher", label: "Dishwasher" },
  { key: "kettle", label: "Kettle" },
  { key: "coffee", label: "Coffee machine" },
  { key: "blender", label: "Blender" },
  { key: "washing", label: "Washing machine" },
];

const LABEL_BY_KEY = Object.fromEntries(DEVICE_ICONS.map((i) => [i.key, i.label])) as Record<
  DeviceIconKey,
  string
>;

export function iconLabel(key: string | null | undefined): string {
  if (!key) return "Unknown";
  return LABEL_BY_KEY[key as DeviceIconKey] ?? key;
}

/** Quick type chips → type label + icon */
export const TYPE_PRESETS: { type: string; icon: DeviceIconKey; label: string }[] = [
  { type: "router", icon: "router", label: "Router" },
  { type: "switch", icon: "sitemap", label: "Switch" },
  { type: "ap", icon: "wifi", label: "AP" },
  { type: "nas", icon: "hdd", label: "NAS" },
  { type: "server", icon: "server", label: "Server" },
  { type: "camera", icon: "camera", label: "Camera" },
  { type: "nvr", icon: "video", label: "NVR" },
  { type: "printer", icon: "print", label: "Printer" },
  { type: "pc", icon: "desktop", label: "PC" },
  { type: "laptop", icon: "laptop", label: "Laptop" },
  { type: "mac", icon: "mac", label: "Mac" },
  { type: "iphone", icon: "iphone", label: "iPhone" },
  { type: "ipad", icon: "ipad", label: "iPad" },
  { type: "android", icon: "android", label: "Android" },
  { type: "phone", icon: "mobile", label: "Phone" },
  { type: "tv", icon: "tv", label: "TV" },
  { type: "appletv", icon: "appletv", label: "Apple TV" },
  { type: "androidtv", icon: "androidtv", label: "Android TV" },
  { type: "watch", icon: "applewatch", label: "Watch" },
  { type: "iot", icon: "microchip", label: "IoT" },
  { type: "kitchen", icon: "fridge", label: "Kitchen" },
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
      <path d="M2 18h20" />
    </>
  ),
  tablet: <rect x="5" y="2" width="14" height="20" rx="2" />,
  mobile: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="3" width="18" height="6" rx="1.5" />
      <rect x="3" y="11" width="18" height="6" rx="1.5" />
      <path d="M7 6h.01M7 14h.01" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  hdd: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 12h.01M12 12h5" />
    </>
  ),
  wifi: (
    <>
      <path d="M5 12.5a9 9 0 0 1 14 0" />
      <path d="M8.5 15.5a4.5 4.5 0 0 1 7 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
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
      <rect x="2" y="17" width="6" height="5" rx="1" />
      <rect x="16" y="17" width="6" height="5" rx="1" />
      <path d="M12 7v4M5 17v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2M12 11H5" />
    </>
  ),
  cloud: <path d="M7.5 18a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.4 1.5A3.5 3.5 0 0 1 18 18H7.5z" />,
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
      <path d="M6 17H4a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
      <rect x="6" y="13" width="12" height="8" rx="1" />
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
      <rect x="2" y="7" width="20" height="11" rx="4" />
      <path d="M7 12h4M9 10v4M16 11h.01M18 13h.01" />
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
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </>
  ),
  plug: (
    <>
      <path d="M9 2v5M15 2v5" />
      <path d="M7 7h10v4a5 5 0 0 1-5 5v4" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M8.5 14a5.5 5.5 0 1 1 7 0c-.7.8-1.5 1.5-1.5 3H10c0-1.5-.8-2.2-1.5-3z" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </>
  ),
  shield: <path d="M12 3 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3z" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12 21 2M17 3l3 3" />
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
      <rect x="3" y="8" width="18" height="10" rx="2" />
      <path d="M7 8V5h2v3M11 8V5h2v3M15 8V5h2v3M8 18v2M12 18v2M16 18v2" />
    </>
  ),
  router: (
    <>
      <rect x="3" y="11" width="18" height="8" rx="2" />
      <path d="M7 11V8M12 11V6M17 11V8M8 15h.01M12 15h.01" />
    </>
  ),
  fax: (
    <>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M8 6V4h8v2M8 12h8M8 15h5" />
    </>
  ),
  usb: (
    <>
      <path d="M12 2v13" />
      <circle cx="12" cy="18" r="3" />
      <path d="M8 7h8M8 7l-2 3M16 7l2 3" />
    </>
  ),
  bluetooth: <path d="m7 7 10 10-5 4V3l5 4L7 17" />,
  satellite: (
    <>
      <path d="m13 7 4 4M8 16l-3 3" />
      <rect x="12" y="4" width="8" height="8" rx="1" transform="rotate(45 16 8)" />
      <path d="M6 12a6 6 0 0 0 6 6" />
    </>
  ),
  power: <path d="M12 3v8M7.5 6.5a7 7 0 1 0 9 0" />,
  thermometer: (
    <>
      <path d="M12 14V4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z" />
      <path d="M14 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="currentColor" stroke="none" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  box: (
    <>
      <path d="M3 8.5 12 4l9 4.5-9 4.5z" />
      <path d="M3 8.5v7L12 20l9-4.5v-7" />
      <path d="M12 13v7" />
    </>
  ),
  car: (
    <>
      <path d="M4 14 6 8h12l2 6" />
      <path d="M3 14h18v4H3z" />
      <circle cx="7.5" cy="18" r="1.5" />
      <circle cx="16.5" cy="18" r="1.5" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.7 2.2c-.7.5-1.2 1-1.2 2V14.5" />
      <path d="M12 17.5h.01" />
    </>
  ),
  /* Apple */
  iphone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2.5" />
      <path d="M11 18h2" />
      <path d="M10 5h4" />
    </>
  ),
  ipad: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  mac: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M9 9h.01M12 9h.01M15 9h.01" />
    </>
  ),
  appletv: (
    <>
      <rect x="2" y="5" width="20" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M9 10.5a3 3 0 0 0 3 3 3 3 0 0 0 3-3" />
    </>
  ),
  applewatch: (
    <>
      <rect x="7" y="6" width="10" height="12" rx="2.5" />
      <path d="M9 6V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V6" />
      <path d="M9 18v2.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V18" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  airpods: (
    <>
      <path d="M7 10a3 3 0 0 1 3-3h0a2 2 0 0 1 2 2v8" />
      <path d="M10 17a1.5 1.5 0 1 1-3 0" />
      <path d="M17 10a3 3 0 0 0-3-3h0a2 2 0 0 0-2 2v8" />
      <path d="M14 17a1.5 1.5 0 1 0 3 0" />
    </>
  ),
  /* Android */
  android: (
    <>
      <path d="M8 9a4 4 0 0 1 8 0v7a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" />
      <path d="M9 4 7.5 6.5M15 4l1.5 2.5" />
      <path d="M6 11v5M18 11v5" />
      <path d="M10 18v2M14 18v2" />
    </>
  ),
  androidtv: (
    <>
      <rect x="2" y="5" width="20" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M9 9h6v4H9z" />
    </>
  ),
  /* Kitchen */
  fridge: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="1.5" />
      <path d="M6 10h12" />
      <path d="M9 6v2M9 13v3" />
    </>
  ),
  oven: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <rect x="7" y="9" width="10" height="8" rx="1" />
      <path d="M7 7h.01M10 7h.01M13 7h.01" />
    </>
  ),
  microwave: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <rect x="5" y="9" width="10" height="6" rx="1" />
      <path d="M17 10h2M17 13h2" />
    </>
  ),
  dishwasher: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M8 7h8" />
    </>
  ),
  kettle: (
    <>
      <path d="M7 10h9a1 1 0 0 1 1 1v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-5a1 1 0 0 1 1-1z" />
      <path d="M17 12h2a2 2 0 0 1 0 4h-2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2" />
    </>
  ),
  coffee: (
    <>
      <path d="M6 9h10v5a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 4c.5 1 .5 2 0 3M11 4c.5 1 .5 2 0 3" />
      <path d="M5 21h12" />
    </>
  ),
  blender: (
    <>
      <path d="M8 4h8l1 7H7z" />
      <rect x="8" y="11" width="8" height="7" rx="1" />
      <path d="M7 21h10M10 18v3M14 18v3" />
    </>
  ),
  washing: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="13" r="4.5" />
      <circle cx="12" cy="13" r="2" />
      <path d="M8 6h.01M11 6h3" />
    </>
  ),
};

export function DeviceIcon({
  name,
  size = 20,
  className,
  ...rest
}: Omit<IconProps, "name"> & { name?: string | null }) {
  const key = (name && name in paths ? name : "question") as DeviceIconKey;
  return (
    <svg {...base({ size, className, ...rest })}>
      {paths[key]}
    </svg>
  );
}

export function isDeviceIconKey(v: string | null | undefined): v is DeviceIconKey {
  return Boolean(v && v in paths);
}
