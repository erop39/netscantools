import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { iconLabel, type DeviceIconKey } from "../lib/deviceIcons";
import { DeviceIcon } from "../lib/deviceIcons";
import { IconPicker } from "./IconPicker";

type Props = {
  value: string | null;
  disabled?: boolean;
  /** Called when user picks or clears icon */
  onChange: (icon: DeviceIconKey | null) => void | Promise<void>;
  className?: string;
  size?: number;
};

/**
 * Device avatar button that opens a compact icon picker popover (portaled).
 */
export function DeviceIconTrigger({
  value,
  disabled,
  onChange,
  className = "",
  size = 18,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  function updatePos() {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(320, Math.max(260, window.innerWidth - 24));
    let left = r.left;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12);
    }
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const openUp = spaceBelow < 280 && r.top > spaceBelow;
    setPos({
      top: openUp ? r.top - 8 : r.bottom + 6,
      left,
      width,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    /** Keep open while scrolling inside the popover; only re-pin or close on outer scroll */
    function onScroll(e: Event) {
      const t = e.target;
      if (t instanceof Node && panelRef.current?.contains(t)) {
        return; // user scrolling the icon list
      }
      // table/page scroll: keep picker open, follow the trigger
      updatePos();
    }
    function onResize() {
      updatePos();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  async function pick(icon: DeviceIconKey | null) {
    setSaving(true);
    try {
      await onChange(icon);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const panel =
    open &&
    pos &&
    createPortal(
      <div
        ref={panelRef}
        id={listId}
        className="device-icon-popover"
        role="dialog"
        aria-label="Choose device icon"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: pos.width,
          zIndex: 10060,
          maxHeight: Math.min(360, window.innerHeight - 24),
          transform: pos.top < (btnRef.current?.getBoundingClientRect().top ?? 0) ? "translateY(-100%)" : undefined,
        }}
      >
        <div className="device-icon-popover-head">
          <span className="device-icon-popover-title">
            {value ? iconLabel(value) : "Choose icon"}
          </span>
          <div className="device-icon-popover-actions">
            {value && (
              <button
                type="button"
                className="device-icon-popover-clear"
                disabled={saving}
                onClick={() => void pick(null)}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="device-icon-popover-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="device-icon-popover-body">
          <IconPicker
            value={value}
            onChange={(k) => void pick(k)}
            compact
            hideHeader
          />
        </div>
      </div>,
      document.body,
    );

  return (
    <div className={`device-icon-trigger ${className}`.trim()} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={`device-avatar device-avatar--btn ${open ? "is-open" : ""} ${saving ? "is-busy" : ""}`}
        title={value ? `Icon: ${iconLabel(value)} — click to change` : "Click to set icon"}
        aria-label={value ? `Device icon ${iconLabel(value)}. Change icon` : "Set device icon"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled || saving}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <DeviceIcon name={value} size={size} />
      </button>
      {panel}
    </div>
  );
}
