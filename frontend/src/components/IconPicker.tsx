import { DEVICE_ICONS, DeviceIcon, type DeviceIconKey } from "../lib/deviceIcons";

type Props = {
  value: string | null;
  onChange: (icon: DeviceIconKey | null) => void;
};

export function IconPicker({ value, onChange }: Props) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-white/45">
          Icon
        </span>
        {value && (
          <button
            type="button"
            className="btn-ghost h-7 text-[11px]"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        )}
      </div>
      <div className="icon-picker-grid">
        {DEVICE_ICONS.map((item) => {
          const selected = value === item.key;
          return (
            <button
              key={item.key}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-pressed={selected}
              className={`icon-picker-item ${selected ? "is-selected" : ""}`}
              onClick={() => onChange(item.key)}
            >
              <DeviceIcon name={item.key} size={18} />
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-white/40">
        Inspired by{" "}
        <a
          href="https://semantic-ui.com/elements/icon.html"
          target="_blank"
          rel="noopener noreferrer"
          className="link-accent"
        >
          Semantic UI icons
        </a>
        {value ? ` · selected: ${value}` : ""}
      </p>
    </div>
  );
}
