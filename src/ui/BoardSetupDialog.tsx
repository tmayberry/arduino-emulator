import { Plus, Settings, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ANALOG_DEVICE_PINS,
  cloneHardwareConfig,
  DIGITAL_DEVICE_PINS,
  isDefaultHardware,
} from "../config/hardwareSetup";
import type {
  HardwareConfig,
  LedComponentConfig,
  PotentiometerComponentConfig,
  SensorComponentConfig,
  ToggleSwitchComponentConfig,
} from "../config/types";
import { normalizePin } from "../emulator/simulationState";

interface BoardSetupDialogProps {
  config: HardwareConfig;
  onApply(config: HardwareConfig): void;
  onClose(): void;
}

let fallbackId = 0;

function newComponentId(
  type: "potentiometer" | "sensor" | "toggle-switch",
): string {
  const unique =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${fallbackId++}`;
  return `custom-${type}-${unique}`;
}

export function BoardSetupDialog({
  config,
  onApply,
  onClose,
}: BoardSetupDialogProps) {
  const [draft, setDraft] = useState(() => cloneHardwareConfig(config));
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const configurable = draft.components.filter(
    (
      component,
    ): component is
      | LedComponentConfig
      | PotentiometerComponentConfig
      | SensorComponentConfig
      | ToggleSwitchComponentConfig =>
      component.type === "led" ||
      component.type === "potentiometer" ||
      component.type === "sensor" ||
      component.type === "toggle-switch",
  );
  const usedPins = new Set(
    configurable.map((component) => normalizePin(component.pin)),
  );
  const hasDuplicatePins = usedPins.size !== configurable.length;
  const hasInvalidLabel = configurable.some(
    (component) =>
      !component.label.trim() || component.label.trim().length > 50,
  );
  const hasInvalidSensor = configurable.some(
    (component) =>
      component.type === "sensor" &&
      (!Number.isFinite(component.rangeStart) ||
        !Number.isFinite(component.rangeEnd) ||
        component.rangeStart >= component.rangeEnd ||
        !component.units.trim() ||
        component.units.trim().length > 20),
  );
  const freeDigitalPins = DIGITAL_DEVICE_PINS.filter(
    (pin) => !usedPins.has(`D${pin}`),
  );
  const freeAnalogPins = ANALOG_DEVICE_PINS.filter((pin) => !usedPins.has(pin));

  const counts = useMemo(
    () => ({
      potentiometers: configurable.filter(
        (item) => item.type === "potentiometer",
      ).length,
      sensors: configurable.filter((item) => item.type === "sensor").length,
      switches: configurable.filter((item) => item.type === "toggle-switch")
        .length,
    }),
    [configurable],
  );

  const update = (
    id: string,
    changes: Partial<
      | LedComponentConfig
      | PotentiometerComponentConfig
      | SensorComponentConfig
      | ToggleSwitchComponentConfig
    >,
  ) => {
    setDraft((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === id
          ? ({ ...component, ...changes } as typeof component)
          : component,
      ),
    }));
  };

  const addSwitch = () => {
    const pin = freeDigitalPins[0];
    if (pin === undefined) return;
    const component: ToggleSwitchComponentConfig = {
      id: newComponentId("toggle-switch"),
      type: "toggle-switch",
      origin: "custom",
      label: `Toggle Switch ${counts.switches + 1}`,
      pin,
      onValue: 1,
      offValue: 0,
      defaultPosition: "off",
    };
    setDraft((current) => ({
      ...current,
      components: [...current.components, component],
    }));
  };

  const addPotentiometer = () => {
    const pin = freeAnalogPins[0];
    if (!pin) return;
    const component: PotentiometerComponentConfig = {
      id: newComponentId("potentiometer"),
      type: "potentiometer",
      origin: "custom",
      label: `Potentiometer ${counts.potentiometers + 1}`,
      pin,
      min: 0,
      max: 1023,
      defaultValue: 512,
    };
    setDraft((current) => ({
      ...current,
      components: [...current.components, component],
    }));
  };

  const addSensor = () => {
    const pin = freeAnalogPins[0];
    if (!pin) return;
    const component: SensorComponentConfig = {
      id: newComponentId("sensor"),
      type: "sensor",
      origin: "custom",
      label: `Sensor ${counts.sensors + 1}`,
      pin,
      rangeStart: 0,
      rangeEnd: 100,
      units: "",
      defaultValue: 50,
    };
    setDraft((current) => ({
      ...current,
      components: [...current.components, component],
    }));
  };

  const remove = (id: string) => {
    setDraft((current) => ({
      ...current,
      components: current.components.filter((component) => component.id !== id),
    }));
  };

  const apply = () => {
    const green = draft.components.find(
      (component): component is LedComponentConfig =>
        component.type === "led" && component.id === "externalGreenLed",
    );
    if (
      !green ||
      typeof green.pin !== "number" ||
      hasDuplicatePins ||
      hasInvalidLabel ||
      hasInvalidSensor
    )
      return;
    const nextConfig: HardwareConfig = {
      ...draft,
      testLedPin: green.pin,
      components: draft.components.map((component) =>
        component.type === "sensor"
          ? {
              ...component,
              label: component.label.trim(),
              units: component.units.trim(),
              defaultValue:
                component.rangeStart +
                (component.rangeEnd - component.rangeStart) / 2,
            }
          : { ...component, label: component.label.trim() },
      ),
    };
    nextConfig.name = isDefaultHardware(nextConfig)
      ? "Default Hardware"
      : "Custom Hardware";
    onApply(nextConfig);
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="setup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
      >
        <header className="setup-dialog-header">
          <div>
            <span className="eyebrow">Virtual hardware</span>
            <h2 id="setup-title">
              <Settings size={19} aria-hidden="true" /> Board setup
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close board setup"
            autoFocus
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="setup-device-list">
          {configurable.map((component) => {
            const isBuiltIn =
              component.type === "led" && component.placement === "board";
            const pinOptions = isBuiltIn
              ? [config.builtInLedPin]
              : component.type === "potentiometer" ||
                  component.type === "sensor"
                ? ANALOG_DEVICE_PINS
                : DIGITAL_DEVICE_PINS;
            return (
              <div className="setup-device-row" key={component.id}>
                <span className="setup-device-type">
                  {isBuiltIn
                    ? "Built-in LED"
                    : component.type === "led"
                      ? "External LED"
                      : component.type === "potentiometer"
                        ? "Potentiometer"
                        : component.type === "sensor"
                          ? "Sensor"
                          : "Switch"}
                </span>
                <label>
                  <span className="sr-only">Device name</span>
                  <input
                    type="text"
                    value={component.label}
                    maxLength={50}
                    disabled={isBuiltIn}
                    onChange={(event) =>
                      update(component.id, { label: event.currentTarget.value })
                    }
                  />
                </label>
                <label>
                  <span className="sr-only">{component.label} pin</span>
                  <select
                    value={String(component.pin)}
                    disabled={isBuiltIn}
                    onChange={(event) =>
                      update(component.id, {
                        pin:
                          component.type === "potentiometer" ||
                          component.type === "sensor"
                            ? (event.currentTarget.value as `A${number}`)
                            : Number(event.currentTarget.value),
                      })
                    }
                  >
                    {pinOptions.map((pin) => {
                      const normalized = normalizePin(pin);
                      const occupied =
                        usedPins.has(normalized) &&
                        normalized !== normalizePin(component.pin);
                      return (
                        <option key={pin} value={pin} disabled={occupied}>
                          {typeof pin === "number" ? `D${pin}` : pin}
                        </option>
                      );
                    })}
                  </select>
                </label>
                {component.origin === "custom" ? (
                  <button
                    className="remove-device-button"
                    type="button"
                    onClick={() => remove(component.id)}
                    aria-label={`Remove ${component.label}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="fixed-device-label">Fixed</span>
                )}
                {component.type === "sensor" && (
                  <div className="sensor-range-fields">
                    <label>
                      <span>Start</span>
                      <input
                        aria-label={`${component.label} range start`}
                        type="number"
                        step="any"
                        value={
                          Number.isFinite(component.rangeStart)
                            ? component.rangeStart
                            : ""
                        }
                        onChange={(event) =>
                          update(component.id, {
                            rangeStart:
                              event.currentTarget.value === ""
                                ? Number.NaN
                                : Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>End</span>
                      <input
                        aria-label={`${component.label} range end`}
                        type="number"
                        step="any"
                        value={
                          Number.isFinite(component.rangeEnd)
                            ? component.rangeEnd
                            : ""
                        }
                        onChange={(event) =>
                          update(component.id, {
                            rangeEnd:
                              event.currentTarget.value === ""
                                ? Number.NaN
                                : Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Units</span>
                      <input
                        aria-label={`${component.label} units`}
                        type="text"
                        maxLength={20}
                        placeholder="e.g. °C"
                        value={component.units}
                        onChange={(event) =>
                          update(component.id, {
                            units: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="setup-add-controls">
          <button
            type="button"
            onClick={addSwitch}
            disabled={freeDigitalPins.length === 0}
          >
            <Plus size={16} aria-hidden="true" /> Add switch
          </button>
          <button
            type="button"
            onClick={addPotentiometer}
            disabled={freeAnalogPins.length === 0}
          >
            <Plus size={16} aria-hidden="true" /> Add potentiometer
          </button>
          <button
            type="button"
            onClick={addSensor}
            disabled={freeAnalogPins.length === 0}
          >
            <Plus size={16} aria-hidden="true" /> Add sensor
          </button>
        </div>

        {(hasInvalidLabel || hasDuplicatePins || hasInvalidSensor) && (
          <p className="setup-error" role="alert">
            {hasInvalidLabel
              ? "Every device needs a name."
              : hasInvalidSensor
                ? "Each sensor needs a start below its end and a unit."
                : "Each device must use a unique pin."}
          </p>
        )}
        <footer className="setup-dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={apply}
            disabled={hasInvalidLabel || hasDuplicatePins || hasInvalidSensor}
          >
            Apply setup
          </button>
        </footer>
      </section>
    </div>
  );
}
