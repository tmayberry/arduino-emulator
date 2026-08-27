import { hardwareConfig as defaultHardwareConfig } from "./defaultHardware";
import type {
  ComponentConfig,
  HardwareConfig,
  LedComponentConfig,
  PinReference,
  PotentiometerComponentConfig,
  SensorComponentConfig,
  ToggleSwitchComponentConfig,
} from "./types";
import { normalizePin } from "../emulator/simulationState";

export const HARDWARE_STORAGE_KEY = "arduino-emulator.hardware.v1";
export const DIGITAL_DEVICE_PINS = Array.from(
  { length: 13 },
  (_, index) => index,
);
export const ANALOG_DEVICE_PINS = Array.from(
  { length: 8 },
  (_, index) => `A${index}` as const,
);

const REQUIRED_DEFAULT_IDS = new Set(
  defaultHardwareConfig.components.map((component) => component.id),
);

export function cloneHardwareConfig(config: HardwareConfig): HardwareConfig {
  return {
    ...config,
    board: { ...config.board },
    components: config.components.map((component) => ({ ...component })),
  };
}

export function defaultHardware(): HardwareConfig {
  return cloneHardwareConfig(defaultHardwareConfig);
}

export function isDefaultHardware(config: HardwareConfig): boolean {
  return (
    JSON.stringify({ ...config, name: defaultHardwareConfig.name }) ===
    JSON.stringify(defaultHardwareConfig)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 50
  );
}

function validDigitalPin(value: unknown): value is number {
  return typeof value === "number" && DIGITAL_DEVICE_PINS.includes(value);
}

function validAnalogPin(value: unknown): value is `A${number}` {
  return (
    typeof value === "string" &&
    ANALOG_DEVICE_PINS.includes(value as `A${number}`)
  );
}

function validFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validUnits(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 20
  );
}

function validateComponent(value: unknown): ComponentConfig | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    !validLabel(value.label)
  ) {
    return null;
  }

  if (value.type === "led") {
    const original = defaultHardwareConfig.components.find(
      (component): component is LedComponentConfig =>
        component.type === "led" && component.id === value.id,
    );
    if (!original || value.origin !== "default") return null;
    if (original.placement === "board") {
      if (value.pin !== 13 || value.label !== original.label) return null;
    } else if (!validDigitalPin(value.pin)) {
      return null;
    }
    return {
      ...original,
      label: value.label.trim(),
      pin: value.pin as PinReference,
    };
  }

  if (value.type === "potentiometer") {
    const origin =
      value.origin === "custom"
        ? "custom"
        : value.origin === "default"
          ? "default"
          : null;
    if (!origin || !validAnalogPin(value.pin)) return null;
    if (origin === "default" && value.id !== "potentiometer") return null;
    if (origin === "custom" && REQUIRED_DEFAULT_IDS.has(value.id)) return null;
    return {
      id: value.id,
      type: "potentiometer",
      origin,
      label: value.label.trim(),
      pin: value.pin,
      min: 0,
      max: 1023,
      defaultValue: 512,
    } satisfies PotentiometerComponentConfig;
  }

  if (value.type === "sensor") {
    if (
      value.origin !== "custom" ||
      REQUIRED_DEFAULT_IDS.has(value.id) ||
      !validAnalogPin(value.pin) ||
      !validFiniteNumber(value.rangeStart) ||
      !validFiniteNumber(value.rangeEnd) ||
      value.rangeStart >= value.rangeEnd ||
      !validUnits(value.units)
    )
      return null;
    const midpoint = value.rangeStart + (value.rangeEnd - value.rangeStart) / 2;
    const defaultValue = validFiniteNumber(value.defaultValue)
      ? Math.max(value.rangeStart, Math.min(value.rangeEnd, value.defaultValue))
      : midpoint;
    return {
      id: value.id,
      type: "sensor",
      origin: "custom",
      label: value.label.trim(),
      pin: value.pin,
      rangeStart: value.rangeStart,
      rangeEnd: value.rangeEnd,
      units: value.units.trim(),
      defaultValue,
    } satisfies SensorComponentConfig;
  }

  if (value.type === "toggle-switch") {
    const origin =
      value.origin === "custom"
        ? "custom"
        : value.origin === "default"
          ? "default"
          : null;
    if (!origin || !validDigitalPin(value.pin)) return null;
    if (origin === "default" && value.id !== "toggleSwitch") return null;
    if (origin === "custom" && REQUIRED_DEFAULT_IDS.has(value.id)) return null;
    return {
      id: value.id,
      type: "toggle-switch",
      origin,
      label: value.label.trim(),
      pin: value.pin,
      onValue: 1,
      offValue: 0,
      defaultPosition: "off",
    } satisfies ToggleSwitchComponentConfig;
  }

  if (value.type === "reset-button" && value.id === "boardReset") {
    return {
      id: "boardReset",
      type: "reset-button",
      label: "Board Reset",
      placement: "board",
    };
  }
  return null;
}

export function parseHardwareConfig(value: unknown): HardwareConfig | null {
  if (!isRecord(value) || !Array.isArray(value.components)) return null;
  const components = value.components.map(validateComponent);
  if (components.some((component) => component === null)) return null;

  const typedComponents = components as ComponentConfig[];
  const ids = typedComponents.map((component) => component.id);
  if (new Set(ids).size !== ids.length) return null;
  if ([...REQUIRED_DEFAULT_IDS].some((id) => !ids.includes(id))) return null;

  const pinComponents = typedComponents.filter(
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
  const pins = pinComponents.map((component) => normalizePin(component.pin));
  if (new Set(pins).size !== pins.length) return null;

  const greenLed = typedComponents.find(
    (component): component is LedComponentConfig =>
      component.type === "led" && component.id === "externalGreenLed",
  );
  if (!greenLed || typeof greenLed.pin !== "number") return null;

  return {
    ...defaultHardwareConfig,
    name: "Custom Hardware",
    testLedPin: greenLed.pin,
    components: typedComponents,
  };
}

export function loadHardwareConfig(
  storage: Pick<Storage, "getItem">,
): HardwareConfig {
  try {
    const saved = storage.getItem(HARDWARE_STORAGE_KEY);
    if (!saved) return defaultHardware();
    return parseHardwareConfig(JSON.parse(saved)) ?? defaultHardware();
  } catch {
    return defaultHardware();
  }
}
