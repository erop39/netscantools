import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type DarkSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

export type DarkSelectFooterApi = {
  close: () => void;
};

type PanelPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: DarkSelectOption[];
  placeholder?: string;
  /** mono font for trigger label (CIDR etc.) */
  mono?: boolean;
  className?: string;
  "aria-label"?: string;
  /** optional footer inside the panel (e.g. custom CIDR) */
  footer?: ReactNode | ((api: DarkSelectFooterApi) => ReactNode);
  closeOnSelect?: boolean;
};

const PANEL_GAP = 6;
const PANEL_MAX = 320;
/** Above sidebar (30) and every card stacking context */
const Z = 10050;

function measurePanel(trigger: HTMLElement): PanelPos {
  const r = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - r.bottom - PANEL_GAP - 8;
  const spaceAbove = r.top - PANEL_GAP - 8;
  const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(PANEL_MAX, Math.max(140, openUp ? spaceAbove : spaceBelow));
  return {
    top: openUp ? r.top - PANEL_GAP : r.bottom + PANEL_GAP,
    left: Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8),
    width: Math.max(r.width, 180),
    maxHeight,
    openUp,
  };
}

/**
 * Solid dark dropdown (uiverse-style). Panel is portaled to document.body
 * with position:fixed so it is never clipped by parent overflow / stacked under cards.
 */
export function DarkSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  mono = false,
  className = "",
  "aria-label": ariaLabel,
  footer,
  closeOnSelect = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const groupName = useId();

  const selected = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const display = selected
    ? selected.hint
      ? `${selected.label}  ·  ${selected.hint}`
      : selected.label
    : value || placeholder;
  const isPlaceholder = !selected && !value;

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
  }, []);

  const updatePos = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    setPos(measurePanel(t));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, updatePos, options.length, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    function onScrollOrResize() {
      updatePos();
    }
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  useEffect(() => {
    if (!open || highlight < 0) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-opt-index="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function pick(v: string) {
    onChange(v);
    if (closeOnSelect) {
      close();
      triggerRef.current?.focus();
    }
  }

  function onTriggerKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (e.key === "ArrowDown") {
        setHighlight((i) => Math.min(options.length - 1, (i < 0 ? selectedIndex : i) + 1));
      } else if (e.key === "ArrowUp") {
        setHighlight((i) => Math.max(0, (i < 0 ? selectedIndex : i) - 1));
      } else if (e.key === "Enter" || e.key === " ") {
        if (highlight >= 0 && options[highlight]) pick(options[highlight].value);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setHighlight(options.length - 1);
    }
  }

  const panelStyle: CSSProperties | undefined = pos
    ? {
        position: "fixed",
        left: pos.left,
        width: pos.width,
        zIndex: Z,
        maxHeight: pos.maxHeight,
        ...(pos.openUp
          ? { bottom: window.innerHeight - pos.top, top: "auto" }
          : { top: pos.top, bottom: "auto" }),
      }
    : undefined;

  const footerNode = typeof footer === "function" ? footer({ close }) : footer;

  const listLabel = ariaLabel ? `${ariaLabel} options` : "Options";

  const panel =
    open &&
    pos &&
    createPortal(
      <div
        ref={panelRef}
        className="dark-dd-panel"
        role="dialog"
        aria-label={listLabel}
        style={panelStyle}
      >
        <div
          id={listId}
          className="dark-dd-list"
          role="listbox"
          tabIndex={0}
          aria-label={listLabel}
          aria-activedescendant={
            highlight >= 0 ? `${groupName}-opt-${highlight}` : undefined
          }
          style={{ maxHeight: footerNode ? Math.max(100, pos.maxHeight - 100) : pos.maxHeight }}
          onKeyDown={(e) => {
            // keyboard when focus is inside the scrollable list
            if (e.key === "Escape") {
              e.preventDefault();
              close();
              triggerRef.current?.focus();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((i) => Math.min(options.length - 1, (i < 0 ? 0 : i) + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((i) => Math.max(0, (i < 0 ? 0 : i) - 1));
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (highlight >= 0 && options[highlight]) pick(options[highlight].value);
            } else if (e.key === "Home") {
              e.preventDefault();
              setHighlight(0);
            } else if (e.key === "End") {
              e.preventDefault();
              setHighlight(options.length - 1);
            }
          }}
        >
          {options.map((o, index) => {
            const isSel = value === o.value;
            const isHi = highlight === index;
            const optId = `${groupName}-opt-${index}`;
            return (
              <div
                key={o.value || `__empty_${index}`}
                id={optId}
                data-opt-index={index}
                role="option"
                aria-selected={isSel}
                className={`dark-dd-option ${isSel ? "is-selected" : ""} ${isHi ? "is-highlight" : ""}`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o.value);
                }}
              >
                <span className="dark-dd-radio-ui" aria-hidden />
                <span className="dark-dd-option-text">
                  <span className={`dark-dd-option-label ${mono ? "is-mono" : ""}`}>{o.label}</span>
                  {o.hint ? <span className="dark-dd-option-hint">{o.hint}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
        {footerNode ? <div className="dark-dd-footer">{footerNode}</div> : null}
      </div>,
      document.body,
    );

  return (
    <div className={`dark-dd ${open ? "is-open" : ""} ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dark-dd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <span
          className={`dark-dd-value ${isPlaceholder ? "is-placeholder" : ""} ${mono ? "is-mono" : ""}`}
        >
          {display}
        </span>
        <span className="dark-dd-chevron" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {panel}
    </div>
  );
}
