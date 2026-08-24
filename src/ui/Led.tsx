import type { LedComponentConfig } from "../config/types";

interface LedProps {
  component: LedComponentConfig;
  brightness: number;
  onConfigure(): void;
}

export function Led({ component, brightness, onConfigure }: LedProps) {
  const level = Math.max(0, Math.min(1, brightness));
  const glow = `0 0 ${8 + level * 24}px ${component.color}`;

  return (
    <div className="led-assembly" aria-label={`${component.label}: ${Math.round(level * 100)}%`}>
      <div
        className="led-bulb"
        style={{
          "--led-color": component.color,
          "--led-level": level,
          "--led-glow": glow,
        } as React.CSSProperties}
      >
        <span className="led-shine" />
      </div>
      <div className="led-legs"><span /><span /></div>
      <strong>{component.label}</strong>
      <button
        className="pin-chip pin-config-button"
        type="button"
        onClick={onConfigure}
        aria-label={`Configure ${component.label} on ${typeof component.pin === "number" ? `D${component.pin}` : component.pin}`}
      >
        {typeof component.pin === "number" ? `D${component.pin}` : component.pin}
      </button>
    </div>
  );
}
