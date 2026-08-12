import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "../api/client";
import { btnPrimaryClassName, btnSecondaryClassName, fieldClassName } from "./ui";

export type WellKnownPort = {
  port: number;
  protocol: string;
  name: string;
  category: string;
  default_enabled: boolean;
};

type Catalog = {
  categories: string[];
  ports: WellKnownPort[];
  default_enabled: number[];
  presets: Record<string, number[]>;
};

function parseCsv(s: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const part of s.split(",")) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 1 || n > 65535 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function toCsv(ports: number[]): string {
  return [...new Set(ports.filter((p) => p >= 1 && p <= 65535))].sort((a, b) => a - b).join(",");
}

const PRESET_LABELS: Record<string, string> = {
  minimal: "Minimal",
  home_lan: "Home LAN",
  self_hosted: "Self-hosted",
};

type Props = {
  /** Current CSV (quick_ports or scan_ports) */
  value: string;
  onChange: (csv: string) => void;
  label?: string;
  hint?: string;
};

export function PortSelector({ value, onChange, label = "Ports", hint }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const selected = useMemo(() => parseCsv(value), [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<Catalog>("/api/ports/well-known");
        if (cancelled) return;
        setCatalog(data);
        const init: Record<string, boolean> = {};
        for (const c of data.categories) init[c] = c === "infra" || c === "remote";
        setOpenCats(init);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? `Catalog failed (${err.status})`
              : "Could not load port catalog",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelected = useCallback(
    (ports: number[]) => {
      onChange(toCsv(ports));
    },
    [onChange],
  );

  function toggle(port: number) {
    const next = new Set(selectedSet);
    if (next.has(port)) next.delete(port);
    else next.add(port);
    setSelected([...next]);
  }

  function selectCategory(cat: string, on: boolean) {
    if (!catalog) return;
    const catPorts = catalog.ports.filter((p) => p.category === cat).map((p) => p.port);
    const next = new Set(selectedSet);
    for (const p of catPorts) {
      if (on) next.add(p);
      else next.delete(p);
    }
    setSelected([...next]);
  }

  function applyPreset(key: string) {
    const ports = catalog?.presets?.[key];
    if (ports?.length) setSelected(ports);
  }

  function addCustom() {
    const n = Number(custom.trim());
    if (!Number.isInteger(n) || n < 1 || n > 65535) return;
    const next = new Set(selectedSet);
    next.add(n);
    setSelected([...next]);
    setCustom("");
  }

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const qq = q.trim().toLowerCase();
    if (!qq) return catalog.ports;
    return catalog.ports.filter(
      (p) =>
        String(p.port).includes(qq) ||
        p.name.toLowerCase().includes(qq) ||
        p.category.toLowerCase().includes(qq),
    );
  }, [catalog, q]);

  const byCat = useMemo(() => {
    const m = new Map<string, WellKnownPort[]>();
    for (const p of filtered) {
      const list = m.get(p.category) ?? [];
      list.push(p);
      m.set(p.category, list);
    }
    return m;
  }, [filtered]);

  const unknownSelected = selected.filter(
    (p) => !catalog?.ports.some((w) => w.port === p),
  );

  return (
    <div className="port-selector">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-white/45">
          {label}
        </span>
        <span className="font-mono text-xs text-sky-200/80">
          {selected.length} selected
        </span>
      </div>
      {hint && <p className="mb-2 text-[11px] text-white/40">{hint}</p>}

      <div className="mb-2 flex flex-wrap gap-1.5">
        {selected.length === 0 ? (
          <span className="text-xs text-white/40">None — probe will use fallback</span>
        ) : (
          selected.map((p) => {
            const wk = catalog?.ports.find((w) => w.port === p);
            return (
              <button
                key={p}
                type="button"
                className="port-pill port-pill--selected"
                title={wk?.name ?? "Custom"}
                onClick={() => toggle(p)}
              >
                {p}
                <span className="port-pill-x" aria-hidden>
                  ×
                </span>
              </button>
            );
          })
        )}
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={`${fieldClassName} mb-2 font-mono text-xs`}
        aria-label={`${label} CSV`}
        placeholder="22,80,443,…"
      />

      <button
        type="button"
        className={`${btnSecondaryClassName} mb-2`}
        onClick={() => setShowPicker((v) => !v)}
      >
        {showPicker ? "Hide catalog" : "Choose from catalog…"}
      </button>

      {error && <p className="mb-2 text-xs text-red-300/90">{error}</p>}

      {showPicker && catalog && (
        <div className="port-catalog">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {Object.entries(catalog.presets || {}).map(([key, ports]) => (
              <button
                key={key}
                type="button"
                className={btnSecondaryClassName}
                onClick={() => applyPreset(key)}
                title={ports.join(",")}
              >
                {PRESET_LABELS[key] ?? key}
              </button>
            ))}
            <button
              type="button"
              className={btnSecondaryClassName}
              onClick={() => setSelected(catalog.default_enabled)}
            >
              Defaults
            </button>
            <button
              type="button"
              className={btnSecondaryClassName}
              onClick={() => setSelected([])}
            >
              Clear
            </button>
          </div>

          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search port or name…"
            className={`${fieldClassName} mb-2`}
            aria-label="Search ports"
          />

          <div className="mb-2 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[6rem] flex-1 flex-col gap-1 text-[11px] text-white/55">
              Custom TCP port
              <input
                type="number"
                min={1}
                max={65535}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className={fieldClassName}
                placeholder="9000"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
            </label>
            <button type="button" className={btnPrimaryClassName} onClick={addCustom}>
              Add
            </button>
          </div>

          {unknownSelected.length > 0 && (
            <p className="mb-2 text-[11px] text-white/45">
              Custom / unknown: {unknownSelected.join(", ")}
            </p>
          )}

          <div className="port-cat-list">
            {[...byCat.entries()].map(([cat, ports]) => {
              const open = openCats[cat] ?? false;
              const allOn = ports.every((p) => selectedSet.has(p.port));
              return (
                <div key={cat} className="port-cat">
                  <div className="port-cat-head">
                    <button
                      type="button"
                      className="port-cat-toggle"
                      onClick={() =>
                        setOpenCats((prev) => ({ ...prev, [cat]: !open }))
                      }
                    >
                      <span className="capitalize">{cat}</span>
                      <span className="text-white/40">({ports.length})</span>
                    </button>
                    <button
                      type="button"
                      className="port-cat-all"
                      onClick={() => selectCategory(cat, !allOn)}
                    >
                      {allOn ? "None" : "All"}
                    </button>
                  </div>
                  {open && (
                    <ul className="port-cat-items">
                      {ports.map((p) => (
                        <li key={p.port}>
                          <label className="port-cat-item">
                            <input
                              type="checkbox"
                              checked={selectedSet.has(p.port)}
                              onChange={() => toggle(p.port)}
                            />
                            <span className="font-mono text-sky-100/90">{p.port}</span>
                            <span className="text-white/75">{p.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
