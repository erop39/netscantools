import {
  DEVICE_ICONS,
  DeviceIcon,
  ICON_GROUPS,
  iconLabel,
  type DeviceIconKey,
} from "../lib/deviceIcons";

type Props = {
  value: string | null;
  onChange: (icon: DeviceIconKey | null) => void;
};

export function IconPicker({ value, onChange }: Props) {
  const selectedLabel = value ? iconLabel(value) : null;

  return (
    <div className="icon-picker">
      <div className="icon-picker-head">
        <span className="icon-picker-title">Icon</span>
        <div className="icon-picker-head-actions">
          {selectedLabel && (
            <span className="icon-picker-selected" title={value ?? undefined}>
              <DeviceIcon name={value} size={14} />
              {selectedLabel}
            </span>
          )}
          {value && (
            <button type="button" className="icon-picker-clear" onClick={() => onChange(null)}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="icon-picker-body">
        {ICON_GROUPS.map((group) => (
          <section key={group.id} className="icon-picker-group">
            <h4 className="icon-picker-group-label">{group.label}</h4>
            <div className="icon-picker-grid" role="listbox" aria-label={group.label}>
              {group.keys.map((key) => {
                const meta = DEVICE_ICONS.find((i) => i.key === key);
                const selected = value === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    title={meta?.label ?? key}
                    aria-label={meta?.label ?? key}
                    aria-selected={selected}
                    className={`icon-picker-item ${selected ? "is-selected" : ""}`}
                    onClick={() => onChange(key)}
                  >
                    <DeviceIcon name={key} size={18} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
