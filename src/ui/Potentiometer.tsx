import { ChevronDown } from "lucide-react";
import type { PotentiometerComponentConfig } from "../config/types";

interface PotentiometerProps {
  component: PotentiometerComponentConfig;
  value: number;
  onChange(value: number): void;
  onConfigure(): void;
}

export function Potentiometer({ component, value, onChange, onConfigure }: PotentiometerProps) {
  const percentage = (value - component.min) / (component.max - component.min);
  const angle = -135 + percentage * 270;

  return (
    <details className="control-card potentiometer-card">
      <summary className="control-card-heading">
        <div>
          <span className="eyebrow">Analog input</span>
          <h3>{component.label}</h3>
        </div>
        <span className="collapsible-heading-end">
          <span className="input-summary-value">{value}</span>
          <button
            className="pin-chip pin-config-button"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onConfigure();
            }}
            aria-label={`Configure ${component.label} on ${component.pin}`}
          >
            {component.pin}
          </button>
          <ChevronDown className="collapse-chevron" size={17} aria-hidden="true" />
        </span>
      </summary>
      <div className="potentiometer-control">
        <div className="pot-knob" aria-hidden="true">
          <span style={{ transform: `rotate(${angle}deg)` }} />
        </div>
        <div className="pot-readout">
          <strong>{value}</strong>
          <span>ADC value</span>
        </div>
      </div>
      <label className="sr-only" htmlFor={`${component.id}-range`}>
        {component.label} value
      </label>
      <input
        id={`${component.id}-range`}
        className="range-control"
        type="range"
        min={component.min}
        max={component.max}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <div className="range-labels"><span>{component.min}</span><span>{component.max}</span></div>
    </details>
  );
}
