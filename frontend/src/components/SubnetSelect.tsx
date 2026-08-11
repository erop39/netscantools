import { useEffect, useState } from "react";
import { DarkSelect, type DarkSelectOption } from "./DarkSelect";

export type SubnetPreset = { cidr: string; label: string; hint: string };

type Props = {
  value: string;
  onChange: (cidr: string) => void;
  presets: SubnetPreset[];
};

/**
 * Subnet combobox: presets + custom CIDR in one dark panel (portaled, always on top).
 */
export function SubnetSelect({ value, onChange, presets }: Props) {
  const [customDraft, setCustomDraft] = useState(value);

  const matched = presets.find((p) => p.cidr === value.trim());
  const isCustom = Boolean(value.trim()) && !matched;

  const options: DarkSelectOption[] = presets.map((p) => ({
    value: p.cidr,
    label: p.label,
    hint: p.hint,
  }));

  useEffect(() => {
    setCustomDraft(value);
  }, [value]);

  return (
    <DarkSelect
      value={value.trim()}
      onChange={onChange}
      options={options}
      placeholder="Select subnet…"
      mono
      aria-label="Subnet CIDR"
      footer={({ close }) => (
        <div className={`dark-dd-custom ${isCustom ? "is-active" : ""}`}>
          <div className="dark-dd-custom-head">
            <span className={`dark-dd-radio-ui ${isCustom ? "is-on" : ""}`} aria-hidden />
            <span className="dark-dd-custom-title">Custom range</span>
          </div>
          <div className="dark-dd-custom-row">
            <input
              type="text"
              className="dark-dd-custom-input"
              value={customDraft}
              placeholder="e.g. 192.168.10.0/24"
              spellCheck={false}
              aria-label="Custom CIDR range"
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = customDraft.trim();
                  if (v) {
                    onChange(v);
                    close();
                  }
                }
                e.stopPropagation();
              }}
            />
            <button
              type="button"
              className="dark-dd-apply"
              onClick={() => {
                const v = customDraft.trim();
                if (!v) return;
                onChange(v);
                close();
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    />
  );
}
