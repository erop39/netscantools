import { DeviceLink } from "./DeviceLink";

type DeviceBits = {
  device_id?: number | null;
  device_name?: string | null;
  device_ip?: string | null;
  device_mac?: string | null;
  device_hostname?: string | null;
};

/** Prefer assigned name / hostname / IP / MAC — never "Device #id". */
export function notificationDeviceLabel(n: DeviceBits): string {
  const name = n.device_name?.trim();
  if (name) return name;
  const host = n.device_hostname?.trim();
  if (host) return host;
  if (n.device_ip?.trim()) return n.device_ip.trim();
  if (n.device_mac?.trim()) return n.device_mac.trim();
  return "Unknown device";
}

/** Facts under the device link: IP · MAC · hostname (skip if already the title). */
export function NotificationDeviceMeta({ n }: { n: DeviceBits }) {
  if (n.device_id == null) return null;

  const title = notificationDeviceLabel(n);
  const titleKey = title.toLowerCase();
  const bits: { key: string; label: string; value: string }[] = [];

  const push = (key: string, label: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (!v) return;
    if (v.toLowerCase() === titleKey) return;
    bits.push({ key, label, value: v });
  };

  // If title is the friendly name, still show network facts
  push("ip", "IP", n.device_ip);
  push("mac", "MAC", n.device_mac);
  push("host", "Hostname", n.device_hostname);
  // If title is IP, still show MAC/hostname; name already shown as link title via device_name

  return (
    <div className="notification-device-meta">
      <DeviceLink
        id={n.device_id}
        name={title}
        fallback="Unknown device"
        className="device-link text-sm font-semibold"
      />
      {bits.length > 0 && (
        <p className="notification-device-facts">
          {bits.map((b, i) => (
            <span key={b.key}>
              {i > 0 && <span className="notification-device-sep"> · </span>}
              <span className="notification-fact-label">{b.label}</span>{" "}
              <span className="notification-fact-value">{b.value}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
