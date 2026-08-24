import { ChevronDown } from "lucide-react";
import type { ToggleSwitchComponentConfig } from "../config/types";

interface ToggleSwitchProps {
  component: ToggleSwitchComponentConfig;
  checked: boolean;
  onChange(value: boolean): void;
  onConfigure(): void;
}

export function ToggleSwitch({ component, checked, onChange, onConfigure }: ToggleSwitchProps) {
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
          <button
            className="pin-chip pin-config-button"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onConfigure();
            }}
            aria-label={`Configure ${component.label} on D${component.pin}`}
          >
            D{component.pin}
          </button>
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
