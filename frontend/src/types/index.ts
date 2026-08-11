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
  type: string | null;
  icon: string | null;
  status: string;
  last_seen: string | null;
  web_ui_local: string | null;
  web_ui_external: string | null;
  notes: string | null;
  first_seen: string;
  updated_at: string;
}

export interface DeviceUpdate {
  type?: string | null;
  icon?: string | null;
  name?: string | null;
  notes?: string | null;
  web_ui_local?: string | null;
  web_ui_external?: string | null;
}

export interface PingResult {
  ok: boolean;
  ip: string;
  rtt_ms: number | null;
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
}

export interface Scan {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
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
  ui_background: UiBackground;
  ui_background_url: string | null;
  has_custom_background: boolean;
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
