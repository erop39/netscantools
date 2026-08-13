import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../api/client";
import { DarkSelect } from "../components/DarkSelect";
import { DeviceLink } from "../components/DeviceLink";
import {
  btnDangerClassName,
  btnPrimaryClassName,
  btnSecondaryClassName,
  EmptyState,
  ErrorBanner,
  fieldClassName,
  formatDateTime,
  GlassCard,
  LoadingState,
  PageHeader,
  SuccessBanner,
} from "../components/ui";
import { DeviceIcon, iconLabel } from "../lib/deviceIcons";
import { downloadPlanMapHtml } from "../lib/exportPlanHtml";
import type {
  NetworkPlan,
  InventoryPlanCandidate,
  PlanCandidate,
  PlanMatch,
  PlanPort,
  PlanSlot,
} from "../types";

type SlotDraft = {
  planned_ip: string;
  role_label: string;
  hostname_hint: string;
  notes: string;
  device_mac: string;
};

type PortForm = { port: string; label: string };

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  try {
    const parsed = JSON.parse(err.message) as {
      detail?: string | { msg?: string }[];
    };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return parsed.detail.map((d) => d.msg).join("; ");
    }
  } catch {
    /* raw */
  }
  return err.message?.trim() ? err.message : `${fallback} (${err.status})`;
}

function draftsFromPlan(plan: NetworkPlan): Record<number, SlotDraft> {
  return Object.fromEntries(
    plan.slots.map((s) => [
      s.id,
      {
        planned_ip: s.planned_ip ?? "",
        role_label: s.role_label ?? "",
        hostname_hint: s.hostname_hint ?? "",
        notes: s.notes ?? "",
        device_mac: s.device_mac ?? "",
      },
    ]),
  );
}

function matchClass(match: PlanMatch): string {
  switch (match) {
    case "match":
      return "planner-match is-match";
    case "mismatch":
      return "planner-match is-mismatch";
    case "linked-no-ip":
      return "planner-match is-linked-no-ip";
    case "reserve":
    default:
      return "planner-match is-reserve";
  }
}

function matchLabel(match: PlanMatch): string {
  switch (match) {
    case "match":
      return "Match";
    case "mismatch":
      return "Mismatch";
    case "linked-no-ip":
      return "Linked · no IP";
    case "reserve":
    default:
      return "Reserve";
  }
}

function candidateLabel(c: PlanCandidate): string {
  const name = c.name || c.hostname || c.mac;
  const ip = c.ip ? ` · ${c.ip}` : "";
  return `${name}${ip}`;
}

function emptyToNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

export function Planner() {
  const [plan, setPlan] = useState<NetworkPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastOk, setToastOk] = useState(true);

  const [metaName, setMetaName] = useState("");
  const [metaCidr, setMetaCidr] = useState("");
  const [metaNotes, setMetaNotes] = useState("");
  const [metaSaving, setMetaSaving] = useState(false);

  const [drafts, setDrafts] = useState<Record<number, SlotDraft>>({});
  const [portForms, setPortForms] = useState<Record<number, PortForm>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<PlanCandidate[]>([]);
  const [showInventory, setShowInventory] = useState(false);
  const [pickMac, setPickMac] = useState("");
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryPlanCandidate[]>([]);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<number[]>([]);

  const importRef = useRef<HTMLInputElement>(null);

  const applyPlan = useCallback((next: NetworkPlan) => {
    setPlan(next);
    setMetaName(next.name);
    setMetaCidr(next.cidr ?? "");
    setMetaNotes(next.notes ?? "");
    setDrafts(draftsFromPlan(next));
  }, []);

  const refresh = useCallback(async () => {
    const next = await apiFetch<NetworkPlan>("/api/planner");
    applyPlan(next);
    return next;
  }, [applyPlan]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await apiFetch<NetworkPlan>("/api/planner");
        if (cancelled) return;
        applyPlan(next);
        try {
          const list = await apiFetch<PlanCandidate[]>("/api/planner/candidates");
          if (!cancelled) setCandidates(list);
        } catch {
          /* bind picker can refresh later */
        }
      } catch (err) {
        if (!cancelled) setError(parseApiError(err, "Failed to load plan"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPlan]);

  function flash(msg: string, ok = true) {
    setToast(msg);
    setToastOk(ok);
    setError(null);
  }

  function updateDraft(slotId: number, patch: Partial<SlotDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [slotId]: { ...prev[slotId], ...patch },
    }));
  }

  async function onSaveMeta() {
    if (!metaName.trim()) {
      setError("Plan name is required");
      return;
    }
    setMetaSaving(true);
    setError(null);
    try {
      const next = await apiFetch<NetworkPlan>("/api/planner", {
        method: "PUT",
        body: JSON.stringify({
          name: metaName.trim(),
          cidr: emptyToNull(metaCidr),
          notes: emptyToNull(metaNotes),
        }),
      });
      applyPlan(next);
      flash("Plan saved");
    } catch (err) {
      setError(parseApiError(err, "Failed to save plan"));
    } finally {
      setMetaSaving(false);
    }
  }

  async function onReorder(slotId: number, dir: -1 | 1) {
    if (!plan) return;
    const ids = plan.slots.map((s) => s.id);
    const idx = ids.indexOf(slotId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= ids.length) return;
    const nextIds = [...ids];
    [nextIds[idx], nextIds[j]] = [nextIds[j], nextIds[idx]];
    setBusyKey(`reorder-${slotId}`);
    setError(null);
    try {
      const next = await apiFetch<NetworkPlan>("/api/planner/slots/reorder", {
        method: "PUT",
        body: JSON.stringify({ slot_ids: nextIds }),
      });
      applyPlan(next);
    } catch (err) {
      setError(parseApiError(err, "Reorder failed"));
    } finally {
      setBusyKey(null);
    }
  }

  async function onAddReserve() {
    setBusyKey("add-reserve");
    setError(null);
    try {
      await apiFetch<PlanSlot>("/api/planner/slots", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refresh();
      flash("Reserve slot added");
    } catch (err) {
      setError(parseApiError(err, "Failed to add slot"));
    } finally {
      setBusyKey(null);
    }
  }

  async function loadCandidates() {
    const list = await apiFetch<PlanCandidate[]>("/api/planner/candidates");
    setCandidates(list);
    return list;
  }

  async function openInventory() {
    setShowInventory(true);
    setPickMac("");
    setError(null);
    try {
      const [list, items] = await Promise.all([
        loadCandidates(),
        apiFetch<InventoryPlanCandidate[]>("/api/planner/inventory-candidates"),
      ]);
      setInventoryItems(items);
      setSelectedInventoryIds([]);
      if (list.length === 0 && items.length === 0) flash("No import candidates", false);
    } catch (err) {
      setError(parseApiError(err, "Failed to load candidates"));
      setShowInventory(false);
    }
  }

  function toggleInventoryItem(id: number) {
    setSelectedInventoryIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function onImportInventoryItems() {
    if (selectedInventoryIds.length === 0) return;
    setInventoryBusy(true);
    setError(null);
    try {
      const next = await apiFetch<NetworkPlan>("/api/planner/inventory-import", {
        method: "POST",
        body: JSON.stringify({ inventory_item_ids: selectedInventoryIds }),
      });
      applyPlan(next);
      const count = selectedInventoryIds.length;
      setInventoryItems(
        await apiFetch<InventoryPlanCandidate[]>("/api/planner/inventory-candidates"),
      );
      setSelectedInventoryIds([]);
      flash(`${count} inventory item${count === 1 ? "" : "s"} imported`);
    } catch (err) {
      setError(parseApiError(err, "Failed to import inventory"));
    } finally {
      setInventoryBusy(false);
    }
  }

  async function onAddFromInventory() {
    if (!pickMac) {
      setError("Pick a device from inventory");
      return;
    }
    setInventoryBusy(true);
    setError(null);
    try {
      const cand = candidates.find((c) => c.mac === pickMac);
      await apiFetch<PlanSlot>("/api/planner/slots", {
        method: "POST",
        body: JSON.stringify({
          device_mac: pickMac,
          planned_ip: cand?.ip ?? null,
          hostname_hint: cand?.hostname ?? cand?.name ?? null,
        }),
      });
      setShowInventory(false);
      setPickMac("");
      await refresh();
      flash("Slot added from inventory");
    } catch (err) {
      setError(parseApiError(err, "Failed to add from inventory"));
    } finally {
      setInventoryBusy(false);
    }
  }

  async function onSaveSlot(slot: PlanSlot) {
    const d = drafts[slot.id];
    if (!d) return;
    setBusyKey(`slot-${slot.id}`);
    setError(null);
    try {
      await apiFetch<PlanSlot>(`/api/planner/slots/${slot.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          planned_ip: emptyToNull(d.planned_ip),
          role_label: emptyToNull(d.role_label),
          hostname_hint: emptyToNull(d.hostname_hint),
          notes: emptyToNull(d.notes),
          device_mac: emptyToNull(d.device_mac),
        }),
      });
      await refresh();
      void loadCandidates().catch(() => undefined);
      flash("Slot updated");
    } catch (err) {
      setError(parseApiError(err, "Failed to update slot"));
    } finally {
      setBusyKey(null);
    }
  }

  async function onDeleteSlot(slot: PlanSlot) {
    const label = slot.planned_ip || slot.role_label || `slot #${slot.id}`;
    if (!confirm(`Delete ${label}? Ports on this slot will be removed.`)) return;
    setBusyKey(`del-slot-${slot.id}`);
    setError(null);
    try {
      const next = await apiFetch<NetworkPlan>(`/api/planner/slots/${slot.id}`, {
        method: "DELETE",
      });
      applyPlan(next);
      flash("Slot deleted");
    } catch (err) {
      setError(parseApiError(err, "Failed to delete slot"));
    } finally {
      setBusyKey(null);
    }
  }

  async function onAddPort(slotId: number) {
    const form = portForms[slotId] ?? { port: "", label: "" };
    const portNum = Number(form.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setError("Port must be an integer between 1 and 65535");
      return;
    }
    setBusyKey(`port-add-${slotId}`);
    setError(null);
    try {
      await apiFetch<PlanPort>(`/api/planner/slots/${slotId}/ports`, {
        method: "POST",
        body: JSON.stringify({
          port: portNum,
          label: form.label.trim(),
        }),
      });
      setPortForms((prev) => ({ ...prev, [slotId]: { port: "", label: "" } }));
      await refresh();
      flash(`Port ${portNum} added`);
    } catch (err) {
      setError(parseApiError(err, "Failed to add port"));
    } finally {
      setBusyKey(null);
    }
  }

  async function onDeletePort(port: PlanPort) {
    if (!confirm(`Delete port ${port.port}${port.label ? ` (${port.label})` : ""}?`)) {
      return;
    }
    setBusyKey(`port-del-${port.id}`);
    setError(null);
    try {
      await apiFetch(`/api/planner/ports/${port.id}`, { method: "DELETE" });
      await refresh();
      flash(`Port ${port.port} removed`);
    } catch (err) {
      setError(parseApiError(err, "Failed to delete port"));
    } finally {
      setBusyKey(null);
    }
  }

  async function onExportJson() {
    setBusyKey("export");
    setError(null);
    try {
      const data = await apiFetch<unknown>("/api/planner/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "network-plan.json";
      a.click();
      URL.revokeObjectURL(a.href);
      flash("JSON exported (backup / re-import)");
    } catch (err) {
      setError(parseApiError(err, "Export failed"));
    } finally {
      setBusyKey(null);
    }
  }

  function onExportHtml() {
    if (!plan) return;
    try {
      const safe = (plan.name || "network-plan")
        .replace(/[^\w\-]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48);
      downloadPlanMapHtml(plan, `${safe || "network-plan"}-map.html`);
      flash("HTML map exported — open in browser / print");
    } catch (err) {
      setError(err instanceof Error ? err.message : "HTML export failed");
    }
  }

  async function onImportFile(file: File | null) {
    if (!file) return;
    if (!confirm("Replace entire plan with this file?")) {
      if (importRef.current) importRef.current.value = "";
      return;
    }
    setBusyKey("import");
    setError(null);
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        setError("Import file is not valid JSON");
        return;
      }
      const next = await apiFetch<NetworkPlan>("/api/planner/import", {
        method: "POST",
        body: JSON.stringify(json),
      });
      applyPlan(next);
      flash("Plan imported");
    } catch (err) {
      setError(parseApiError(err, "Import failed"));
    } finally {
      setBusyKey(null);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function loadBindOptions(currentMac: string | null) {
    try {
      const list = await loadCandidates();
      if (currentMac && !list.some((c) => c.mac === currentMac)) {
        // keep current bound MAC selectable even if not in candidates
        return list;
      }
      return list;
    } catch {
      return candidates;
    }
  }

  const slots = plan?.slots ?? [];
  const anyBusy = busyKey !== null || metaSaving || inventoryBusy;

  return (
    <div className="planner-page">
      <PageHeader
        title="Planner"
        description="Desired LAN layout — IPs, order, ports"
        actions={
          <div className="planner-header-actions">
            <button
              type="button"
              className={`${btnSecondaryClassName}`}
              disabled={anyBusy || loading || !plan}
              title="Visual network map (print-friendly)"
              onClick={onExportHtml}
            >
              Export HTML
            </button>
            <button
              type="button"
              className={`${btnSecondaryClassName}`}
              disabled={anyBusy || loading}
              title="Machine-readable backup"
              onClick={() => void onExportJson()}
            >
              Export JSON
            </button>
            <button
              type="button"
              className={`${btnSecondaryClassName}`}
              disabled={anyBusy || loading}
              onClick={() => importRef.current?.click()}
            >
              Import
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className={`${btnSecondaryClassName}`}
              disabled={anyBusy || loading}
              onClick={() => void openInventory()}
            >
              From inventory
            </button>
            <button
              type="button"
              className={`${btnPrimaryClassName}`}
              disabled={anyBusy || loading}
              onClick={() => void onAddReserve()}
            >
              + Reserve
            </button>
          </div>
        }
      />

      {loading && <LoadingState label="Loading plan…" />}
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}
      {toast && (
        <div className="mb-4">
          {toastOk ? (
            <SuccessBanner message={toast} />
          ) : (
            <ErrorBanner message={toast} />
          )}
        </div>
      )}

      {!loading && plan && (
        <>
          <GlassCard className="planner-meta mb-4">
            <div className="planner-meta-grid">
              <label className="planner-field">
                <span className="planner-label">Name</span>
                <input
                  className={fieldClassName}
                  value={metaName}
                  onChange={(e) => setMetaName(e.target.value)}
                  maxLength={120}
                  aria-label="Plan name"
                />
              </label>
              <label className="planner-field">
                <span className="planner-label">CIDR</span>
                <input
                  className={fieldClassName + " font-mono"}
                  value={metaCidr}
                  onChange={(e) => setMetaCidr(e.target.value)}
                  placeholder="192.168.1.0/24"
                  aria-label="Plan CIDR"
                />
              </label>
              <label className="planner-field planner-field--wide">
                <span className="planner-label">Notes</span>
                <input
                  className={fieldClassName}
                  value={metaNotes}
                  onChange={(e) => setMetaNotes(e.target.value)}
                  placeholder="Optional plan notes"
                  aria-label="Plan notes"
                />
              </label>
            </div>
            <div className="planner-meta-footer">
              <span className="planner-meta-hint">
                {slots.length} slot{slots.length === 1 ? "" : "s"}
                {plan.updated_at ? ` · updated ${formatDateTime(plan.updated_at)}` : ""}
              </span>
              <button
                type="button"
                className={`${btnPrimaryClassName}`}
                disabled={metaSaving || anyBusy}
                onClick={() => void onSaveMeta()}
              >
                {metaSaving ? "Saving…" : "Save plan"}
              </button>
            </div>
          </GlassCard>

          {showInventory && (
            <GlassCard className="planner-inventory mb-4">
              <div className="planner-inventory-head">
                <div>
                  <p className="planner-section-title">Add from inventory</p>
                  <p className="planner-section-hint">
                    Devices whose MAC is not already on the plan
                  </p>
                </div>
                <button
                  type="button"
                  className={`${btnSecondaryClassName}`}
                  onClick={() => {
                    setShowInventory(false);
                    setPickMac("");
                  }}
                >
                  Cancel
                </button>
              </div>
              {candidates.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] mt-3">
                  No candidates available. Scan the network or unbind a MAC first.
                </p>
              ) : (
                <div className="planner-inventory-row">
                  <DarkSelect
                    value={pickMac}
                    onChange={setPickMac}
                    aria-label="Pick inventory device"
                    placeholder="Select device…"
                    options={candidates.map((c) => ({
                      value: c.mac,
                      label: candidateLabel(c),
                      hint: c.mac,
                    }))}
                  />
                  <button
                    type="button"
                    className={`${btnPrimaryClassName} shrink-0`}
                    disabled={!pickMac || inventoryBusy}
                    onClick={() => void onAddFromInventory()}
                  >
                    {inventoryBusy ? "Adding…" : "Add slot"}
                  </button>
                </div>
              )}
              <div className="planner-inventory-divider" />
              <div className="planner-inventory-head">
                <div>
                  <p className="planner-section-title">Import manual inventory</p>
                  <p className="planner-section-hint">
                    Linked equipment becomes live slots; unlinked equipment becomes reserves
                  </p>
                </div>
                <button
                  type="button"
                  className={btnPrimaryClassName}
                  disabled={selectedInventoryIds.length === 0 || inventoryBusy}
                  onClick={() => void onImportInventoryItems()}
                >
                  {inventoryBusy ? "Importing…" : `Import selected (${selectedInventoryIds.length})`}
                </button>
              </div>
              {inventoryItems.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] mt-3">
                  No manual inventory items available.
                </p>
              ) : (
                <ul className="planner-inventory-items">
                  {inventoryItems.map((item) => (
                    <li key={item.id}>
                      <label className="planner-inventory-item">
                        <input
                          type="checkbox"
                          checked={selectedInventoryIds.includes(item.id)}
                          onChange={() => toggleInventoryItem(item.id)}
                        />
                        <DeviceIcon name={item.device_icon} size={20} />
                        <span className="planner-inventory-item-copy">
                          <strong>{item.title}</strong>
                          <small>
                            {[item.category, item.location, item.device_ip]
                              .filter(Boolean)
                              .join(" · ") || "No details"}
                          </small>
                        </span>
                        <span className={item.is_linked ? "planner-source linked" : "planner-source reserve"}>
                          {item.is_linked ? "Linked" : "Reserve"}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          )}

          {slots.length === 0 ? (
            <EmptyState
              title="No slots yet"
              hint="Add an empty reserve, or pull a device from inventory to start your LAN plan."
            />
          ) : (
            <ul className="planner-slots">
              {slots.map((slot, index) => {
                const draft = drafts[slot.id] ?? {
                  planned_ip: slot.planned_ip ?? "",
                  role_label: slot.role_label ?? "",
                  hostname_hint: slot.hostname_hint ?? "",
                  notes: slot.notes ?? "",
                  device_mac: slot.device_mac ?? "",
                };
                const pf = portForms[slot.id] ?? { port: "", label: "" };
                const busy = busyKey?.includes(String(slot.id)) ?? false;
                const bindOptions = [
                  { value: "", label: "Unbound (reserve)" },
                  ...(draft.device_mac
                    ? [
                        {
                          value: draft.device_mac,
                          label: `Bound · ${draft.device_mac}`,
                          hint: slot.live_ip ? `live ${slot.live_ip}` : undefined,
                        },
                      ]
                    : []),
                  ...candidates
                    .filter((c) => c.mac !== draft.device_mac)
                    .map((c) => ({
                      value: c.mac,
                      label: candidateLabel(c),
                      hint: c.mac,
                    })),
                ];

                return (
                  <li key={slot.id} className="planner-slot glass-card">
                    <div className="planner-slot-top">
                      <div className="planner-slot-order">
                        <button
                          type="button"
                          className="planner-order-btn"
                          title="Move up"
                          aria-label="Move slot up"
                          disabled={index === 0 || anyBusy}
                          onClick={() => void onReorder(slot.id, -1)}
                        >
                          ↑
                        </button>
                        <span className="planner-order-num" title="Sort order">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          className="planner-order-btn"
                          title="Move down"
                          aria-label="Move slot down"
                          disabled={index === slots.length - 1 || anyBusy}
                          onClick={() => void onReorder(slot.id, 1)}
                        >
                          ↓
                        </button>
                      </div>

                      <div
                        className={`device-avatar planner-slot-icon${
                          slot.device_icon ? "" : " is-empty"
                        }`}
                        title={
                          slot.device_icon
                            ? iconLabel(slot.device_icon)
                            : slot.device_mac
                              ? "No icon set on device"
                              : "Reserve · no device"
                        }
                        aria-hidden
                      >
                        <DeviceIcon name={slot.device_icon} size={16} />
                      </div>

                      <div className="planner-slot-badges">
                        <span className={matchClass(slot.match)}>
                          {matchLabel(slot.match)}
                        </span>
                        {slot.live_ip && (
                          <span className="planner-live" title="Live IP from inventory">
                            live {slot.live_ip}
                            {slot.live_status ? ` · ${slot.live_status}` : ""}
                          </span>
                        )}
                        {slot.device_id != null && (
                          <DeviceLink
                            id={slot.device_id}
                            name={
                              draft.role_label ||
                              draft.hostname_hint ||
                              slot.device_mac ||
                              undefined
                            }
                            className="device-link planner-device-link"
                          />
                        )}
                      </div>

                      <button
                        type="button"
                        className={`${btnDangerClassName} shrink-0`}
                        disabled={anyBusy}
                        onClick={() => void onDeleteSlot(slot)}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="planner-slot-fields">
                      <label className="planner-field">
                        <span className="planner-label">Planned IP</span>
                        <input
                          className={fieldClassName + " font-mono"}
                          value={draft.planned_ip}
                          onChange={(e) =>
                            updateDraft(slot.id, { planned_ip: e.target.value })
                          }
                          placeholder="192.168.1.10"
                          aria-label={`Planned IP for slot ${index + 1}`}
                        />
                      </label>
                      <label className="planner-field">
                        <span className="planner-label">Role</span>
                        <input
                          className={fieldClassName}
                          value={draft.role_label}
                          onChange={(e) =>
                            updateDraft(slot.id, { role_label: e.target.value })
                          }
                          placeholder="Router, NAS, PC…"
                          aria-label={`Role for slot ${index + 1}`}
                        />
                      </label>
                      <label className="planner-field">
                        <span className="planner-label">Hostname hint</span>
                        <input
                          className={fieldClassName}
                          value={draft.hostname_hint}
                          onChange={(e) =>
                            updateDraft(slot.id, { hostname_hint: e.target.value })
                          }
                          placeholder="optional"
                          aria-label={`Hostname hint for slot ${index + 1}`}
                        />
                      </label>
                      <div className="planner-field">
                        <span className="planner-label">Device MAC</span>
                        <DarkSelect
                          value={draft.device_mac}
                          onChange={(v) => updateDraft(slot.id, { device_mac: v })}
                          aria-label={`Device MAC for slot ${index + 1}`}
                          placeholder="Unbound"
                          mono
                          options={bindOptions}
                          footer={({ close }) => (
                            <button
                              type="button"
                              className="planner-refresh-cands"
                              onClick={() => {
                                void loadBindOptions(draft.device_mac || null).then(() =>
                                  close(),
                                );
                              }}
                            >
                              Refresh candidates
                            </button>
                          )}
                        />
                      </div>
                      <label className="planner-field planner-field--wide">
                        <span className="planner-label">Notes</span>
                        <input
                          className={fieldClassName}
                          value={draft.notes}
                          onChange={(e) =>
                            updateDraft(slot.id, { notes: e.target.value })
                          }
                          placeholder="optional notes"
                          aria-label={`Notes for slot ${index + 1}`}
                        />
                      </label>
                    </div>

                    <div className="planner-slot-actions">
                      <button
                        type="button"
                        className={`${btnPrimaryClassName}`}
                        disabled={busy || anyBusy}
                        onClick={() => void onSaveSlot(slot)}
                      >
                        {busyKey === `slot-${slot.id}` ? "Saving…" : "Save slot"}
                      </button>
                      {draft.device_mac && (
                        <button
                          type="button"
                          className={`${btnSecondaryClassName}`}
                          disabled={anyBusy}
                          onClick={() => {
                            updateDraft(slot.id, { device_mac: "" });
                          }}
                        >
                          Unbind MAC
                        </button>
                      )}
                    </div>

                    <div className="planner-ports">
                      <div className="planner-ports-head">
                        <span className="planner-label">Ports</span>
                        {slot.ports.length === 0 && (
                          <span className="planner-ports-empty">None</span>
                        )}
                      </div>
                      {slot.ports.length > 0 && (
                        <ul className="planner-port-chips">
                          {slot.ports.map((p) => (
                            <li key={p.id} className="planner-port-chip">
                              <span className="planner-port-num">{p.port}</span>
                              {p.label && (
                                <span className="planner-port-label">{p.label}</span>
                              )}
                              <button
                                type="button"
                                className="planner-port-del"
                                title="Delete port"
                                aria-label={`Delete port ${p.port}`}
                                disabled={anyBusy}
                                onClick={() => void onDeletePort(p)}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="planner-port-form">
                        <input
                          className={fieldClassName + " planner-port-input font-mono"}
                          value={pf.port}
                          onChange={(e) =>
                            setPortForms((prev) => ({
                              ...prev,
                              [slot.id]: { ...pf, port: e.target.value },
                            }))
                          }
                          placeholder="Port"
                          inputMode="numeric"
                          aria-label={`New port number for slot ${index + 1}`}
                        />
                        <input
                          className={fieldClassName + " planner-port-label-input"}
                          value={pf.label}
                          onChange={(e) =>
                            setPortForms((prev) => ({
                              ...prev,
                              [slot.id]: { ...pf, label: e.target.value },
                            }))
                          }
                          placeholder="Label (SSH, SMB…)"
                          aria-label={`New port label for slot ${index + 1}`}
                        />
                        <button
                          type="button"
                          className={`${btnSecondaryClassName} shrink-0`}
                          disabled={anyBusy || !pf.port.trim()}
                          onClick={() => void onAddPort(slot.id)}
                        >
                          Add port
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
