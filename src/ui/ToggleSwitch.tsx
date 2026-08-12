import type { ToggleSwitchComponentConfig } from "../config/types";

interface ToggleSwitchProps {
  component: ToggleSwitchComponentConfig;
  checked: boolean;
  onChange(value: boolean): void;
}

export function ToggleSwitch({ component, checked, onChange }: ToggleSwitchProps) {
  const digitalValue = checked ? component.onValue : component.offValue;

  return (
    <div className="control-card toggle-card">
      <div className="control-card-heading">
        <div>
          <span className="eyebrow">Digital input</span>
          <h3>{component.label}</h3>
        </div>
        <span className="pin-chip">D{component.pin}</span>
      </div>
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
    </div>
  );
}
