import { ChevronDown } from "lucide-react";
import type { SensorComponentConfig } from "../config/types";

interface SensorProps {
  component: SensorComponentConfig;
  value: number;
  onChange(value: number): void;
  onConfigure(): void;
}

function formatValue(value: number): string {
  return Number.isInteger(value)
    ? value.toString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function Sensor({
  component,
  value,
  onChange,
  onConfigure,
}: SensorProps) {
  const clamped = Math.max(
    component.rangeStart,
    Math.min(component.rangeEnd, value),
  );
  const adcValue = Math.round(
    ((clamped - component.rangeStart) /
      (component.rangeEnd - component.rangeStart)) *
      1023,
  );

  return (
    <details className="control-card sensor-card">
      <summary className="control-card-heading">
        <div>
          <span className="eyebrow">Sensor</span>
          <h3>{component.label}</h3>
        </div>
        <span className="collapsible-heading-end">
          <span className="input-summary-value">
            {formatValue(clamped)} {component.units}
          </span>
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
          <ChevronDown
            className="collapse-chevron"
            size={17}
            aria-hidden="true"
          />
        </span>
      </summary>

      <div className="sensor-readouts" aria-live="polite">
        <span>
          <small>Sensor value</small>
          <strong>
            {formatValue(clamped)} <b>{component.units}</b>
          </strong>
        </span>
        <span>
          <small>analogRead()</small>
          <strong>
            {adcValue} <b>ADC</b>
          </strong>
        </span>
      </div>

      <label className="sr-only" htmlFor={`${component.id}-range`}>
        {component.label} value in {component.units}
      </label>
      <input
        id={`${component.id}-range`}
        className="range-control"
        type="range"
        min={component.rangeStart}
        max={component.rangeEnd}
        step="any"
        value={clamped}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <div className="range-labels">
        <span>
          {formatValue(component.rangeStart)} {component.units}
        </span>
        <span>
          {formatValue(component.rangeEnd)} {component.units}
        </span>
      </div>
    </details>
  );
}
