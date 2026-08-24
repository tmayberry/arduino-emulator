import { useState } from "react";
import { Cpu, Gauge, Settings2, Smartphone } from "lucide-react";
import type {
  HardwareConfig,
  LedComponentConfig,
  PotentiometerComponentConfig,
  ResetButtonComponentConfig,
  SensorComponentConfig,
  ToggleSwitchComponentConfig,
} from "../config/types";
import { normalizePin } from "../emulator/simulationState";
import type { AccelerometerReading } from "../emulator/workerProtocol";
import { AccelerometerPanel } from "./AccelerometerPanel";
import { Led } from "./Led";
import { Potentiometer } from "./Potentiometer";
import { Sensor } from "./Sensor";
import { ToggleSwitch } from "./ToggleSwitch";

export interface PinOutput {
  kind: "digital" | "pwm";
  value: number;
}

type HardwareTab = "inputs" | "motion";

interface HardwareViewProps {
  config: HardwareConfig;
  pinOutputs: Record<string, PinOutput>;
  componentInputs: Record<string, number | boolean>;
  accelerometer: AccelerometerReading;
  accelerometerConnected: boolean;
  onInputChange(componentId: string, value: number | boolean): void;
  onAccelerometerChange(
    reading: AccelerometerReading,
    connected: boolean,
    updatedAtMs: number,
  ): void;
  onReset(): void;
  onConfigure(): void;
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
  componentInputs,
  accelerometer,
  accelerometerConnected,
  onInputChange,
  onAccelerometerChange,
  onReset,
  onConfigure,
}: HardwareViewProps) {
  const [activeTab, setActiveTab] = useState<HardwareTab>("inputs");
  const leds = config.components.filter(
    (component): component is LedComponentConfig => component.type === "led",
  );
  const pots = config.components.filter(
    (component): component is PotentiometerComponentConfig =>
      component.type === "potentiometer",
  );
  const toggles = config.components.filter(
    (component): component is ToggleSwitchComponentConfig =>
      component.type === "toggle-switch",
  );
  const sensors = config.components.filter(
    (component): component is SensorComponentConfig => component.type === "sensor",
  );
  const resetButton = config.components.find(
    (component): component is ResetButtonComponentConfig =>
      component.type === "reset-button",
  );
  const boardLeds = leds.filter((component) => component.placement === "board");
  const breadboardLeds = leds.filter(
    (component) => component.placement === "breadboard",
  );
  const inputSummary = [
    ...pots.map((pot) => `${pot.pin} ${Number(componentInputs[pot.id] ?? pot.defaultValue)}`),
    ...sensors.map((sensor) => {
      const value = Number(componentInputs[sensor.id] ?? sensor.defaultValue);
      const formatted = Number.isInteger(value) ? value : Number(value.toFixed(2));
      return `${sensor.pin} ${formatted} ${sensor.units}`;
    }),
    ...toggles.map((toggle) => `D${toggle.pin} ${Boolean(componentInputs[toggle.id]) ? "HIGH" : "LOW"}`),
  ].join(" · ");
  const motionSummary = accelerometerConnected
    ? `${accelerometer.x.toFixed(1)}, ${accelerometer.y.toFixed(1)}, ${accelerometer.z.toFixed(1)} g`
    : "Disconnected";
  const inputColumns = [[], []] as Array<Array<
    PotentiometerComponentConfig | SensorComponentConfig | ToggleSwitchComponentConfig
  >>;
  [...pots, ...sensors, ...toggles].forEach((component, index) => {
    inputColumns[index % inputColumns.length].push(component);
  });

  return (
    <section className="workspace-panel hardware-panel" aria-label="Virtual hardware">
      <div className="panel-heading">
        <div>
          <h2>{config.board.label}</h2>
          <small className="panel-subtitle">Virtual hardware</small>
        </div>
        <button className="config-button" type="button" onClick={onConfigure}>
          <Settings2 size={17} aria-hidden="true" />
          <span>
            <strong>Configure devices &amp; pins</strong>
            <small>{config.name}</small>
          </span>
        </button>
      </div>

      <div className="hardware-canvas" aria-label="Circuit overview">
        <div className="breadboard">
          <div className="rail rail-top" />
          <div className="rail rail-bottom" />
          <div className="board-module">
            <div className="usb-port" />
            <div className="nano-board">
              <div className="nano-pins left-pins">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
              <div className="nano-content">
                <Cpu size={24} strokeWidth={1.5} aria-hidden="true" />
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
                      title="Stop the sketch and reset this board while keeping the configured pins"
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
              <Led key={led.id} component={led} brightness={ledBrightness(led, pinOutputs)} onConfigure={onConfigure} />
            ))}
          </div>
          <span className="breadboard-label">Live circuit</span>
        </div>
      </div>

      <div className="hardware-tabs" role="tablist" aria-label="Hardware controls">
        <button type="button" role="tab" aria-selected={activeTab === "inputs"} onClick={() => setActiveTab("inputs")}>
          <Gauge size={16} aria-hidden="true" />
          <span>Inputs<small>{inputSummary || "No inputs"}</small></span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "motion"} onClick={() => setActiveTab("motion")}>
          <Smartphone size={16} aria-hidden="true" />
          <span>Motion<small>{motionSummary}</small></span>
        </button>
      </div>

      {activeTab === "inputs" && (
        <div className="hardware-tab-panel input-grid" role="tabpanel" aria-label="Inputs">
          {inputColumns.map((column, columnIndex) => (
            <div className="input-column" key={columnIndex}>
              {column.map((component) => component.type === "potentiometer" ? (
                <Potentiometer
                  key={component.id}
                  component={component}
                  value={Number(componentInputs[component.id] ?? component.defaultValue)}
                  onChange={(value) => onInputChange(component.id, value)}
                  onConfigure={onConfigure}
                />
              ) : component.type === "sensor" ? (
                <Sensor
                  key={component.id}
                  component={component}
                  value={Number(componentInputs[component.id] ?? component.defaultValue)}
                  onChange={(value) => onInputChange(component.id, value)}
                  onConfigure={onConfigure}
                />
              ) : (
                <ToggleSwitch
                  key={component.id}
                  component={component}
                  checked={Boolean(componentInputs[component.id])}
                  onChange={(value) => onInputChange(component.id, value)}
                  onConfigure={onConfigure}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {activeTab === "motion" && (
        <div className="hardware-tab-panel motion-panel" role="tabpanel" aria-label="Motion">
          <AccelerometerPanel
            reading={accelerometer}
            dataConnected={accelerometerConnected}
            onInput={onAccelerometerChange}
          />
        </div>
      )}

    </section>
  );
}
