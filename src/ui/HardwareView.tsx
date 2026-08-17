import { Cpu } from "lucide-react";
import type {
  HardwareConfig,
  LedComponentConfig,
  PotentiometerComponentConfig,
  ResetButtonComponentConfig,
  ToggleSwitchComponentConfig,
} from "../config/types";
import { normalizePin } from "../emulator/simulationState";
import type { AccelerometerReading } from "../emulator/workerProtocol";
import { AccelerometerPanel } from "./AccelerometerPanel";
import { Led } from "./Led";
import { Potentiometer } from "./Potentiometer";
import { ToggleSwitch } from "./ToggleSwitch";

export interface PinOutput {
  kind: "digital" | "pwm";
  value: number;
}

interface HardwareViewProps {
  config: HardwareConfig;
  pinOutputs: Record<string, PinOutput>;
  potentiometer: number;
  toggleSwitch: boolean;
  accelerometer: AccelerometerReading;
  accelerometerConnected: boolean;
  onPotentiometerChange(value: number): void;
  onToggleChange(value: boolean): void;
  onAccelerometerChange(
    reading: AccelerometerReading,
    connected: boolean,
    updatedAtMs: number,
  ): void;
  onReset(): void;
}

function ledBrightness(
  component: LedComponentConfig,
  pinOutputs: Record<string, PinOutput>,
): number {
  const output = pinOutputs[normalizePin(component.pin)];
  if (!output) return 0;
  const level = output.kind === "pwm" ? output.value / 255 : output.value === 0 ? 0 : 1;
  return component.activeHigh ? level : 1 - level;
}

export function HardwareView({
  config,
  pinOutputs,
  potentiometer,
  toggleSwitch,
  accelerometer,
  accelerometerConnected,
  onPotentiometerChange,
  onToggleChange,
  onAccelerometerChange,
  onReset,
}: HardwareViewProps) {
  const leds = config.components.filter(
    (component): component is LedComponentConfig => component.type === "led",
  );
  const pot = config.components.find(
    (component): component is PotentiometerComponentConfig =>
      component.type === "potentiometer",
  );
  const toggle = config.components.find(
    (component): component is ToggleSwitchComponentConfig =>
      component.type === "toggle-switch",
  );
  const resetButton = config.components.find(
    (component): component is ResetButtonComponentConfig =>
      component.type === "reset-button",
  );
  const boardLeds = leds.filter((component) => component.placement === "board");
  const breadboardLeds = leds.filter(
    (component) => component.placement === "breadboard",
  );

  return (
    <section className="workspace-panel hardware-panel" aria-label="Virtual hardware">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Virtual hardware</span>
          <h2>{config.board.label}</h2>
        </div>
        <span className="config-chip">{config.name}</span>
      </div>

      <div className="hardware-canvas">
        <div className="breadboard">
          <div className="rail rail-top" />
          <div className="rail rail-bottom" />
          <div className="board-module">
            <div className="usb-port" />
            <div className="nano-board">
              <div className="nano-pins left-pins">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
              <div className="nano-content">
                <Cpu size={27} strokeWidth={1.5} aria-hidden="true" />
                <strong>NANO 33 BLE</strong>
                <span>nRF52840</span>
                <div className="nano-controls">
                  {boardLeds.map((led) => {
                    const brightness = ledBrightness(led, pinOutputs);
                    return (
                      <div className="board-led-group" key={led.id}>
                        <span
                          className="board-led"
                          style={{
                            "--board-led-color": led.color,
                            "--board-led-level": brightness,
                          } as React.CSSProperties}
                          aria-label={`${led.label} on D${led.pin}: ${Math.round(brightness * 100)}%`}
                        />
                        <small>L · D{led.pin}</small>
                      </div>
                    );
                  })}
                  {resetButton && (
                    <button
                      className="board-reset-button"
                      type="button"
                      onClick={onReset}
                      aria-label="Press the Nano reset button"
                      title="Reset the board"
                    >
                      <span aria-hidden="true" />
                      <small>RESET</small>
                    </button>
                  )}
                </div>
              </div>
              <div className="nano-pins right-pins">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
            </div>
          </div>
          <div className="wire wire-red" />
          <div className="wire wire-blue" />
          <div className="led-bank">
            {breadboardLeds.map((led) => (
              <Led key={led.id} component={led} brightness={ledBrightness(led, pinOutputs)} />
            ))}
          </div>
          <span className="breadboard-label">Configured circuit · fixed layout</span>
        </div>
      </div>

      <div className="input-grid">
        {pot && (
          <Potentiometer
            component={pot}
            value={potentiometer}
            onChange={onPotentiometerChange}
          />
        )}
        {toggle && (
          <ToggleSwitch
            component={toggle}
            checked={toggleSwitch}
            onChange={onToggleChange}
          />
        )}
      </div>
      <AccelerometerPanel
        reading={accelerometer}
        dataConnected={accelerometerConnected}
        onInput={onAccelerometerChange}
      />
    </section>
  );
}
