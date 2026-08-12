export interface User {
  id: number;
  username: string;
}

export interface Device {
  id: number;
  mac: string;
  ip: string | null;
  vendor: string | null;
  hostname: string | null;
  name: string | null;
  location?: string | null;
  is_person?: boolean;
  type: string | null;
  icon: string | null;
  status: string;
  last_seen: string | null;
  web_ui_local: string | null;
  web_ui_external: string | null;
  notes: string | null;
  first_seen: string;
  updated_at: string;
  latency_ms?: number | null;
  open_ports?: { port: number; service?: string | null; source?: string }[] | null;
  ports_scanned_at?: string | null;
  security_score?: number | null;
  is_new?: boolean;
  score_breakdown?: { code: string; label: string; delta: number }[] | null;
  smb_shares?: {
    name: string;
    share_type: "disk" | "print" | "ipc" | "unknown" | string;
    comment?: string | null;
    hidden?: boolean;
  }[] | null;
  smb_scanned_at?: string | null;
  smb_scan_status?: string | null;
  tls_status?: string | null;
  tls_expires_at?: string | null;
  tls_issuer?: string | null;
  tls_checked_at?: string | null;
  tls_error?: string | null;
}

export interface DeviceEvent {
  id: number;
  type: string;
  details: Record<string, unknown> | null;
  created_at: string;
  device_id?: number | null;
}

export interface HygieneSummary {
  network_score: number | null;
  counts: { online: number; offline: number; new_24h: number; risky_devices: number };
  top_risks: {
    device_id: number;
    mac: string;
    name: string | null;
    security_score: number | null;
    ip: string | null;
  }[];
  recent_events: DeviceEvent[];
}

export interface ChecklistItem {
  id: number;
  key: string;
  label: string;
  checked: boolean;
  checked_at: string | null;
  sort_order: number;
}

export interface DeviceUpdate {
  type?: string | null;
  icon?: string | null;
  name?: string | null;
  location?: string | null;
  is_person?: boolean | null;
  notes?: string | null;
  web_ui_local?: string | null;
  web_ui_external?: string | null;
}

export interface LatencySample {
  id: number;
  rtt_ms: number;
  recorded_at: string;
}

export interface InventoryItem {
  id: number;
  title: string;
  serial_number: string | null;
  category: string | null;
  location: string | null;
  notes: string | null;
  device_id: number | null;
  purchase_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PresencePerson {
  id: number;
  name: string | null;
  mac: string;
  ip: string | null;
  status: string;
  last_seen: string | null;
}

export interface PingResult {
  ok: boolean;
  ip: string;
  rtt_ms: number | null;
  message: string;
}

export interface WolResult {
  ok: boolean;
  mac: string;
  message: string;
}

export interface ResolveResult {
  hostname: string | null;
  device: Device;
}

export interface ResolveAllResult {
  total: number;
  resolved: number;
  failed: number;
  devices: Device[];
}

export interface LastScan {
  id: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  devices_found: number;
  new_devices: number;
  subnet: string;
}

export interface RecentNotification {
  id: number;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface Dashboard {
  online_count: number;
  total_count: number;
  last_scan: LastScan | null;
  recent_notifications: RecentNotification[];
  people_home?: PresencePerson[];
  people_away?: PresencePerson[];
}

export interface Scan {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  mode?: "quick" | "full" | string;
  subnet: string;
  devices_found: number;
  new_devices: number;
  error_message: string | null;
}

export interface Notification {
  id: number;
  type: string;
  device_id: number | null;
  message: string;
  read: boolean;
  created_at: string;
}

export type UiBackground = "default" | "solid" | "gradient" | "custom";

export interface Settings {
  scan_subnet: string;
  scan_interval_minutes: number;
  scan_ports: string;
  quick_ports: string;
  ui_background: UiBackground;
  ui_background_url: string | null;
  has_custom_background: boolean;
  backup_interval_hours?: number;
  backup_keep?: number;
  backup_last_path?: string | null;
  backup_count?: number;
  share_scan_auto?: boolean;
}

export type PlanMatch = "match" | "mismatch" | "linked-no-ip" | "reserve";

export interface PlanPort {
  id: number;
  port: number;
  label: string;
  sort_order: number;
}

export interface PlanSlot {
  id: number;
  sort_order: number;
  planned_ip: string | null;
  hostname_hint: string | null;
  role_label: string | null;
  device_mac: string | null;
  notes: string | null;
  live_ip: string | null;
  live_status: string | null;
  device_id: number | null;
  /** Icon key from bound inventory device (null if reserve / unbound) */
  device_icon: string | null;
  match: PlanMatch;
  ports: PlanPort[];
}

export interface NetworkPlan {
  id: number;
  name: string;
  cidr: string | null;
  notes: string | null;
  updated_at: string | null;
  slots: PlanSlot[];
}

export interface PlanCandidate {
  id: number;
  mac: string;
  ip: string | null;
  name: string | null;
  hostname: string | null;
  status: string;
}
