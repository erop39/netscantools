import { Link } from "react-router-dom";

type Props = {
  /** Device primary key — no link if missing */
  id?: number | null;
  /** Display name (name / hostname / IP / MAC) */
  name?: string | null;
  /** Fallback when name is empty — never "Device #id" */
  fallback?: string;
  className?: string;
  title?: string;
};

/**
 * Link to device detail (properties). Renders plain text when id is missing.
 * Uses assigned name / hostname / IP — not internal ids.
 */
export function DeviceLink({
  id,
  name,
  fallback = "Unknown device",
  className = "device-link",
  title,
}: Props) {
  const label = (name && name.trim()) || fallback || null;
  if (!label) return null;
  if (id == null) {
    return <span className={className}>{label}</span>;
  }
  return (
    <Link
      to={`/devices/${id}`}
      className={className}
      title={title ?? "Open device properties"}
    >
      {label}
    </Link>
  );
}
