import type { Device } from "../types";

/** Prefer manual name, then DNS hostname, then IP/MAC. */
export function deviceLabel(d: Device): string {
  return d.name?.trim() || d.hostname?.trim() || d.ip || d.mac;
}
