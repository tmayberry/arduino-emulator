import { ChevronDown } from "lucide-react";
import type { ToggleSwitchComponentConfig } from "../config/types";

interface ToggleSwitchProps {
  component: ToggleSwitchComponentConfig;
  checked: boolean;
  onChange(value: boolean): void;
}

export function ToggleSwitch({ component, checked, onChange }: ToggleSwitchProps) {
  const digitalValue = checked ? component.onValue : component.offValue;

  return (
    <details className="control-card toggle-card">
      <summary className="control-card-heading">
        <div>
          <span className="eyebrow">Digital input</span>
          <h3>{component.label}</h3>
        </div>
        <span className="collapsible-heading-end">
          <span className="input-summary-value">{digitalValue === 1 ? "HIGH" : "LOW"}</span>
          <span className="pin-chip">D{component.pin}</span>
          <ChevronDown className="collapse-chevron" size={17} aria-hidden="true" />
        </span>
      </summary>
      <div className="toggle-control-row">
        <span className={!checked ? "toggle-label active" : "toggle-label"}>OFF</span>
        <label className="switch-control">
          <span className="sr-only">Toggle switch position</span>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
          <span className="switch-track"><span className="switch-thumb" /></span>
        </label>
        <span className={checked ? "toggle-label active" : "toggle-label"}>ON</span>
      </div>
      <div className="logic-readout">
        Reading <strong>{digitalValue === 1 ? "HIGH" : "LOW"}</strong>
      </div>
    </details>
  );
}
