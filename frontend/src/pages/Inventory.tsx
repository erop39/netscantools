import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
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
} from "../components/ui";
import type { Device, InventoryItem } from "../types";

export function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [serial, setSerial] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      const [list, devs] = await Promise.all([
        apiFetch<InventoryItem[]>(`/api/inventory${params}`),
        apiFetch<Device[]>("/api/devices"),
      ]);
      setItems(list);
      setDevices(devs);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Failed to load inventory (${err.status})`
          : "Failed to load inventory",
      );
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditId(null);
    setTitle("");
    setSerial("");
    setCategory("");
    setLocation("");
    setNotes("");
    setDeviceId("");
    setPurchaseDate("");
  }

  function startEdit(item: InventoryItem) {
    setEditId(item.id);
    setTitle(item.title);
    setSerial(item.serial_number ?? "");
    setCategory(item.category ?? "");
    setLocation(item.location ?? "");
    setNotes(item.notes ?? "");
    setDeviceId(item.device_id != null ? String(item.device_id) : "");
    setPurchaseDate(item.purchase_date ?? "");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(),
      serial_number: serial.trim() || null,
      category: category.trim() || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      device_id: deviceId ? Number(deviceId) : null,
      purchase_date: purchaseDate.trim() || null,
    };
    try {
      if (editId != null) {
        await apiFetch<InventoryItem>(`/api/inventory/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch<InventoryItem>("/api/inventory", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? `Save failed (${err.status})` : "Save failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    if (!window.confirm("Delete this inventory item?")) return;
    setBusy(true);
    try {
      await apiFetch(`/api/inventory/${id}`, { method: "DELETE" });
      if (editId === id) resetForm();
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? `Delete failed (${err.status})` : "Delete failed",
      );
    } finally {
      setBusy(false);
    }
  }

  const deviceLabel = (id: number | null) => {
    if (id == null) return null;
    const d = devices.find((x) => x.id === id);
    if (!d) return `#${id}`;
    return d.name || d.hostname || d.ip || d.mac;
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Manual journal: serials, location, link to network devices"
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid gap-4 lg:grid-cols-5">
        <GlassCard className="lg:col-span-2 !p-5">
          <h2 className="mb-3 text-sm font-semibold text-white/95">
            {editId != null ? "Edit item" : "Add item"}
          </h2>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-white/70">
              Title *
              <input
                className={fieldClassName}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Living room AP"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-white/70">
                Serial
                <input
                  className={fieldClassName}
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-white/70">
                Category
                <input
                  className={fieldClassName}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="router, camera…"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-white/70">
              Location
              <input
                className={fieldClassName}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Garage rack"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-white/70">
              Linked device
              <select
                className={fieldClassName}
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                <option value="">— none —</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || d.hostname || d.ip || d.mac}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-white/70">
              Purchase date
              <input
                type="date"
                className={fieldClassName}
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-white/70">
              Notes
              <textarea
                className={fieldClassName}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={busy} className={btnPrimaryClassName}>
                {busy ? "Saving…" : editId != null ? "Update" : "Add"}
              </button>
              {editId != null && (
                <button
                  type="button"
                  className={btnSecondaryClassName}
                  onClick={resetForm}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </GlassCard>

        <div className="lg:col-span-3">
          <form
            className="mb-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q);
            }}
          >
            <input
              type="search"
              className={`${fieldClassName} min-w-[12rem] flex-1`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, serial, location…"
              aria-label="Search inventory"
            />
            <button type="submit" className={btnSecondaryClassName}>
              Search
            </button>
          </form>

          {loading && <LoadingState label="Loading inventory…" />}
          {!loading && items.length === 0 && (
            <EmptyState
              title="No inventory items"
              hint="Add gear that is not (only) discovered by scan — serials, warranty, rack notes."
            />
          )}
          {!loading && items.length > 0 && (
            <GlassCard className="!p-0 overflow-hidden">
              <ul className="divide-y divide-white/8">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white/95">{item.title}</p>
                      <p className="mt-0.5 text-xs text-white/50">
                        {[
                          item.category,
                          item.location,
                          item.serial_number
                            ? `S/N ${item.serial_number}`
                            : null,
                          item.purchase_date,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {item.device_id != null && (
                        <Link
                          to={`/devices/${item.device_id}`}
                          className="mt-1 inline-block text-xs text-sky-300/90 hover:text-sky-200"
                        >
                          Device: {deviceLabel(item.device_id)} →
                        </Link>
                      )}
                      {item.notes && (
                        <p className="mt-1 text-xs text-white/45 line-clamp-2">
                          {item.notes}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-white/30">
                        updated {formatDateTime(item.updated_at)}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className={btnSecondaryClassName}
                        onClick={() => startEdit(item)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={btnDangerClassName}
                        disabled={busy}
                        onClick={() => void onDelete(item.id)}
                      >
                        Del
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
