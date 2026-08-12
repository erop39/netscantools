import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { ApiError, apiFetch } from "../api/client";
import { DarkSelect } from "../components/DarkSelect";
import { DeviceLink } from "../components/DeviceLink";
import { DeviceIcon } from "../lib/deviceIcons";
import {
  btnDangerClassName,
  btnPrimaryClassName,
  btnSecondaryClassName,
  EmptyState,
  ErrorBanner,
  fieldClassName,
  GlassCard,
  LoadingState,
  PageHeader,
} from "../components/ui";
import type { Device, InventoryItem, InventoryLocation } from "../types";

const UNASSIGNED = "__none__";

type LocGroup = {
  key: string;
  name: string;
  sortOrder: number;
  locationId: number | null;
  items: InventoryItem[];
};

export function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [serial, setSerial] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const [newLocName, setNewLocName] = useState("");
  const [newLocOrder, setNewLocOrder] = useState("10");
  const [locBusy, setLocBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
      const [list, locs, devs] = await Promise.all([
        apiFetch<InventoryItem[]>(`/api/inventory${params}`),
        apiFetch<InventoryLocation[]>("/api/inventory/locations"),
        apiFetch<Device[]>("/api/devices"),
      ]);
      setItems(list);
      setLocations(locs);
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

  const deviceOptions = useMemo(
    () => [
      { value: "", label: "— none —" },
      ...devices.map((d) => ({
        value: String(d.id),
        label: d.name || d.hostname || d.ip || d.mac,
        hint: d.ip && (d.name || d.hostname) ? d.ip : undefined,
      })),
    ],
    [devices],
  );

  const devicesById = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices],
  );

  const locationOptions = useMemo(
    () => [
      { value: "", label: "— no location —" },
      ...[...locations]
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((l) => ({
          value: l.name,
          label: l.name,
          hint: `priority ${l.sort_order}`,
        })),
    ],
    [locations],
  );

  const groups = useMemo((): LocGroup[] => {
    const byName = new Map(locations.map((l) => [l.name.toLowerCase(), l]));
    const buckets = new Map<string, LocGroup>();

    const ensure = (raw: string | null | undefined): LocGroup => {
      const name = (raw || "").trim();
      if (!name) {
        const key = UNASSIGNED;
        if (!buckets.has(key)) {
          buckets.set(key, {
            key,
            name: "No location",
            sortOrder: 1_000_000,
            locationId: null,
            items: [],
          });
        }
        return buckets.get(key)!;
      }
      const key = name.toLowerCase();
      if (!buckets.has(key)) {
        const cat = byName.get(key);
        buckets.set(key, {
          key,
          name: cat?.name ?? name,
          sortOrder: cat?.sort_order ?? 900_000,
          locationId: cat?.id ?? null,
          items: [],
        });
      }
      return buckets.get(key)!;
    };

    // Empty sections for every catalog location (drop targets even if empty)
    for (const l of locations) {
      ensure(l.name);
    }
    ensure(null);

    for (const item of items) {
      ensure(item.location).items.push(item);
    }

    return [...buckets.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }, [items, locations]);

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

  async function moveItem(itemId: number, locationName: string | null) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const next = locationName?.trim() || null;
    const prev = item.location?.trim() || null;
    if (prev === next) return;

    // Optimistic UI
    setItems((list) =>
      list.map((i) => (i.id === itemId ? { ...i, location: next } : i)),
    );
    try {
      const updated = await apiFetch<InventoryItem>(`/api/inventory/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ location: next }),
      });
      setItems((list) => list.map((i) => (i.id === itemId ? updated : i)));
      // Refresh locations in case a new catalog entry was created
      const locs = await apiFetch<InventoryLocation[]>("/api/inventory/locations");
      setLocations(locs);
    } catch (err) {
      setItems((list) =>
        list.map((i) => (i.id === itemId ? { ...i, location: prev } : i)),
      );
      setError(
        err instanceof ApiError ? `Move failed (${err.status})` : "Move failed",
      );
    }
  }

  function onCardDragStart(e: DragEvent, id: number) {
    setDragId(id);
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.effectAllowed = "move";
  }

  function onCardDragEnd() {
    setDragId(null);
    setDropKey(null);
  }

  function onZoneDragOver(e: DragEvent, key: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropKey(key);
  }

  function onZoneDrop(e: DragEvent, group: LocGroup) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain") || String(dragId ?? "");
    const id = Number(raw);
    setDropKey(null);
    setDragId(null);
    if (!Number.isFinite(id) || id <= 0) return;
    const loc = group.key === UNASSIGNED ? null : group.name;
    void moveItem(id, loc);
  }

  async function createLocation(e: FormEvent) {
    e.preventDefault();
    const name = newLocName.trim();
    if (!name) return;
    setLocBusy(true);
    setError(null);
    try {
      const order = Number(newLocOrder);
      await apiFetch<InventoryLocation>("/api/inventory/locations", {
        method: "POST",
        body: JSON.stringify({
          name,
          sort_order: Number.isFinite(order) ? order : undefined,
        }),
      });
      setNewLocName("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not create location (${err.status})`
          : "Could not create location",
      );
    } finally {
      setLocBusy(false);
    }
  }

  async function patchLocationOrder(loc: InventoryLocation, sortOrder: number) {
    if (!Number.isFinite(sortOrder)) return;
    setLocBusy(true);
    try {
      const updated = await apiFetch<InventoryLocation>(
        `/api/inventory/locations/${loc.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ sort_order: sortOrder }),
        },
      );
      setLocations((list) =>
        list
          .map((l) => (l.id === loc.id ? updated : l))
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not update priority (${err.status})`
          : "Could not update priority",
      );
    } finally {
      setLocBusy(false);
    }
  }

  async function renameLocation(loc: InventoryLocation, name: string) {
    const next = name.trim();
    if (!next || next === loc.name) return;
    setLocBusy(true);
    try {
      await apiFetch<InventoryLocation>(`/api/inventory/locations/${loc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: next }),
      });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Rename failed (${err.status})`
          : "Rename failed",
      );
    } finally {
      setLocBusy(false);
    }
  }

  async function deleteLocation(loc: InventoryLocation) {
    if (
      !window.confirm(
        `Remove location “${loc.name}” from the list? Items keep their location text.`,
      )
    ) {
      return;
    }
    setLocBusy(true);
    try {
      await apiFetch(`/api/inventory/locations/${loc.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Delete location failed (${err.status})`
          : "Delete location failed",
      );
    } finally {
      setLocBusy(false);
    }
  }

  const deviceLabel = (id: number | null) => {
    if (id == null) return null;
    const d = devices.find((x) => x.id === id);
    if (!d) return null;
    return d.name || d.hostname || d.ip || d.mac;
  };

  return (
    <div className="inventory-page">
      <PageHeader
        title="Inventory"
        description="Gear journal by location — drag cards between places. Priority 1 shows first."
      />

      {error && <ErrorBanner message={error} />}

      <div className="inventory-layout">
        {/* ── Side: form + locations ── */}
        <div className="inventory-side">
          <GlassCard className="!p-4">
            <h2 className="mb-2 text-sm font-semibold text-white/95">
              {editId != null ? "Edit item" : "Add item"}
            </h2>
            <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
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
                    placeholder="router…"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-white/70">
                Location
                <DarkSelect
                  value={location}
                  onChange={setLocation}
                  options={locationOptions}
                  aria-label="Location"
                  placeholder="— no location —"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-white/70">
                Linked device
                <DarkSelect
                  value={deviceId}
                  onChange={setDeviceId}
                  options={deviceOptions}
                  aria-label="Linked device"
                  placeholder="— none —"
                />
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
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2 pt-0.5">
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

          <GlassCard className="!p-4">
            <h2 className="mb-1 text-sm font-semibold text-white/95">Locations</h2>
            <p className="mb-3 text-[11px] text-white/45">
              Priority = display order (1 first). Create here, then pick in the form or drag cards.
            </p>
            <form onSubmit={createLocation} className="mb-3 flex flex-wrap gap-2">
              <input
                className={`${fieldClassName} min-w-[8rem] flex-1`}
                value={newLocName}
                onChange={(e) => setNewLocName(e.target.value)}
                placeholder="New location name"
                aria-label="New location name"
              />
              <input
                className={`${fieldClassName} w-16`}
                type="number"
                min={1}
                step={1}
                value={newLocOrder}
                onChange={(e) => setNewLocOrder(e.target.value)}
                title="Priority"
                aria-label="Location priority"
              />
              <button
                type="submit"
                disabled={locBusy || !newLocName.trim()}
                className={btnSecondaryClassName}
              >
                Add
              </button>
            </form>
            {locations.length === 0 ? (
              <p className="text-xs text-white/40">No locations yet.</p>
            ) : (
              <ul className="inventory-loc-admin">
                {[...locations]
                  .sort(
                    (a, b) =>
                      a.sort_order - b.sort_order || a.name.localeCompare(b.name),
                  )
                  .map((loc) => (
                    <li key={loc.id} className="inventory-loc-admin-row">
                      <input
                        type="number"
                        className="inventory-loc-priority"
                        min={1}
                        step={1}
                        defaultValue={loc.sort_order}
                        title="Priority"
                        aria-label={`Priority for ${loc.name}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== loc.sort_order) void patchLocationOrder(loc, v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      <input
                        className="inventory-loc-name"
                        defaultValue={loc.name}
                        aria-label={`Name for ${loc.name}`}
                        onBlur={(e) => void renameLocation(loc, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                      <button
                        type="button"
                        className={btnDangerClassName}
                        disabled={locBusy}
                        onClick={() => void deleteLocation(loc)}
                        title="Remove from catalog"
                      >
                        ×
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </GlassCard>
        </div>

        {/* ── Board ── */}
        <div className="inventory-board">
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
          {!loading && items.length === 0 && locations.length === 0 && (
            <EmptyState
              title="No inventory items"
              hint="Add a location, then gear — or create an item first."
            />
          )}

          {!loading && (
            <div className="inventory-zones">
              {groups.map((g) => (
                <section
                  key={g.key}
                  className={`inventory-zone ${dropKey === g.key ? "is-drop-target" : ""} ${
                    g.key === UNASSIGNED ? "is-unassigned" : ""
                  }`}
                  onDragOver={(e) => onZoneDragOver(e, g.key)}
                  onDragLeave={() => setDropKey((k) => (k === g.key ? null : k))}
                  onDrop={(e) => onZoneDrop(e, g)}
                >
                  <header className="inventory-zone-head">
                    <div className="min-w-0">
                      <h3 className="inventory-zone-title">{g.name}</h3>
                      {g.key !== UNASSIGNED && (
                        <p className="inventory-zone-meta">
                          priority {g.sortOrder}
                          {g.locationId == null ? " · unlisted" : ""}
                        </p>
                      )}
                    </div>
                    <span className="inventory-zone-count">{g.items.length}</span>
                  </header>
                  <div className="inventory-zone-cards">
                    {g.items.length === 0 ? (
                      <p className="inventory-zone-empty">Drop items here</p>
                    ) : (
                      g.items.map((item) => {
                        const device =
                          item.device_id == null
                            ? undefined
                            : devicesById.get(item.device_id);
                        return (
                          <article
                            key={item.id}
                            className={`inventory-card ${dragId === item.id ? "is-dragging" : ""}`}
                            draggable
                            onDragStart={(e) => onCardDragStart(e, item.id)}
                            onDragEnd={onCardDragEnd}
                          >
                            <div className="inventory-card-grip" title="Drag to another location" aria-hidden>
                              ⋮⋮
                            </div>
                            <div className="inventory-card-device-icon" aria-hidden="true">
                              <DeviceIcon name={device?.icon} size={22} />
                            </div>
                            <div className="inventory-card-body">
                              <p className="inventory-card-title">{item.title}</p>
                              <div className="inventory-card-linked">
                                <span className="inventory-card-label">Linked</span>
                                {device ? (
                                  <DeviceLink
                                    id={device.id}
                                    name={deviceLabel(device.id)}
                                    className="device-link inventory-card-link"
                                  />
                                ) : (
                                  <span className="inventory-card-muted">Not linked</span>
                                )}
                              </div>
                              <p className="inventory-card-category">
                                <span>{item.category?.trim() || "Uncategorized"}</span>
                                {item.serial_number && (
                                  <span className="inventory-card-serial">
                                    S/N {item.serial_number}
                                  </span>
                                )}
                              </p>
                              <div className="inventory-card-network">
                                {device?.ip && (
                                  <p className="inventory-card-ip">{device.ip}</p>
                                )}
                                <p className="inventory-card-vendor">
                                  {device?.vendor?.trim() || "Unidentified"}
                                </p>
                              </div>
                              {(item.location || item.purchase_date) && (
                                <dl className="inventory-card-facts">
                                  {item.location && (
                                    <div>
                                      <dt>Location</dt>
                                      <dd>{item.location}</dd>
                                    </div>
                                  )}
                                  {item.purchase_date && (
                                    <div>
                                      <dt>Purchased</dt>
                                      <dd>{item.purchase_date}</dd>
                                    </div>
                                  )}
                                </dl>
                              )}
                              {item.notes && (
                                <div className="inventory-card-notes">
                                  <span className="inventory-card-label">Notes</span>
                                  <p>{item.notes}</p>
                                </div>
                              )}
                            </div>
                            <div className="inventory-card-actions">
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
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
