import type {
  HardwareConfig,
  PinReference,
  PotentiometerComponentConfig,
  ToggleSwitchComponentConfig,
} from "../config/types";
import type {
  AccelerometerInput,
  AccelerometerReading,
} from "./workerProtocol";

export const INPUT = 0;
export const OUTPUT = 1;
export const INPUT_PULLUP = 2;
export const LOW = 0;
export const HIGH = 1;

export type NormalizedPin = `D${number}` | `A${number}`;

export interface PinState {
  mode: number;
  outputValue: number;
  outputKind: "digital" | "pwm";
}

export interface SimulationState {
  running: boolean;
  virtualTimeMs: number;
  pins: Record<string, PinState>;
  inputs: {
    potentiometer: number;
    toggleSwitch: boolean;
    accelerometer: AccelerometerInput;
  };
}

export const NEUTRAL_ACCELERATION: AccelerometerReading = { x: 0, y: 0, z: 1 };
export const ACCELEROMETER_STALE_MS = 1_000;

export type SimulationEvent =
  | { type: "pin-change"; pin: NormalizedPin; value: 0 | 1 }
  | { type: "pwm-change"; pin: NormalizedPin; value: number }
  | { type: "time-change"; virtualTimeMs: number };

export function normalizePin(pin: PinReference | number | string): NormalizedPin {
  if (typeof pin === "number") {
    if (!Number.isInteger(pin) || pin < 0) {
      throw new Error(`Invalid pin: ${pin}`);
    }
    return pin >= 14 && pin <= 21 ? `A${pin - 14}` : `D${pin}`;
  }

  const normalized = pin.trim().toUpperCase();
  if (/^D\d+$/.test(normalized) || /^A\d+$/.test(normalized)) {
    return normalized as NormalizedPin;
  }
  if (/^\d+$/.test(normalized)) {
    return normalizePin(Number(normalized));
  }
  throw new Error(`Invalid pin: ${pin}`);
}

export function createInitialSimulationState(config: HardwareConfig): SimulationState {
  const potentiometer = config.components.find(
    (component): component is PotentiometerComponentConfig =>
      component.type === "potentiometer",
  );
  const toggle = config.components.find(
    (component): component is ToggleSwitchComponentConfig =>
      component.type === "toggle-switch",
  );

  return {
    running: false,
    virtualTimeMs: 0,
    pins: {},
    inputs: {
      potentiometer: potentiometer?.defaultValue ?? 0,
      toggleSwitch: toggle?.defaultPosition === "on",
      accelerometer: {
        ...NEUTRAL_ACCELERATION,
        connected: false,
        updatedAtMs: 0,
      },
    },
  };
}

export class SimulationEngine {
  readonly state: SimulationState;
  private accelerometerVersion = 1;
  private accelerometerReadVersion = 0;
  private serialInput: number[] = [];
  private serialReadIndex = 0;
  private randomState = SimulationEngine.initialRandomSeed();

  private static initialRandomSeed(): number {
    const randomValues = new Uint32Array(1);
    globalThis.crypto?.getRandomValues(randomValues);
    const seed = randomValues[0] || Math.floor(Math.random() * 0x1_0000_0000);
    return seed || 0x6d2b79f5;
  }

  constructor(
    private readonly config: HardwareConfig,
    initialInputs?: Partial<SimulationState["inputs"]>,
    private readonly emit: (event: SimulationEvent) => void = () => undefined,
  ) {
    this.state = createInitialSimulationState(config);
    Object.assign(this.state.inputs, initialInputs);
  }

  private pin(pin: PinReference | number | string): PinState {
    const id = normalizePin(pin);
    return (this.state.pins[id] ??= {
      mode: INPUT,
      outputValue: LOW,
      outputKind: "digital",
    });
  }

  pinMode(pin: PinReference | number | string, mode: number): void {
    this.pin(pin).mode = mode;
  }

  digitalWrite(pin: PinReference | number | string, value: number): void {
    const id = normalizePin(pin);
    const next = value === LOW ? LOW : HIGH;
    const state = this.pin(pin);
    state.outputValue = next;
    state.outputKind = "digital";
    this.emit({ type: "pin-change", pin: id, value: next });
  }

  analogWrite(pin: PinReference | number | string, value: number): void {
    const id = normalizePin(pin);
    const next = Math.max(0, Math.min(255, Math.round(value)));
    const state = this.pin(pin);
    state.outputValue = next;
    state.outputKind = "pwm";
    this.emit({ type: "pwm-change", pin: id, value: next });
  }

  digitalRead(pin: PinReference | number | string): number {
    const id = normalizePin(pin);
    const toggle = this.config.components.find(
      (component): component is ToggleSwitchComponentConfig =>
        component.type === "toggle-switch" && normalizePin(component.pin) === id,
    );
    if (toggle) {
      return this.state.inputs.toggleSwitch ? toggle.onValue : toggle.offValue;
    }

    const pinState = this.pin(pin);
    if (pinState.mode === INPUT_PULLUP) return HIGH;
    if (pinState.mode === OUTPUT) return pinState.outputValue === LOW ? LOW : HIGH;
    return LOW;
  }

  analogRead(pin: PinReference | number | string): number {
    const id = normalizePin(pin);
    const potentiometer = this.config.components.find(
      (component): component is PotentiometerComponentConfig =>
        component.type === "potentiometer" && normalizePin(component.pin) === id,
    );
    if (!potentiometer) return 0;
    return Math.max(
      potentiometer.min,
      Math.min(potentiometer.max, Math.round(this.state.inputs.potentiometer)),
    );
  }

  setInput(component: "potentiometer" | "toggleSwitch", value: number | boolean): void {
    if (component === "potentiometer") {
      const potentiometer = this.config.components.find(
        (item): item is PotentiometerComponentConfig => item.type === "potentiometer",
      );
      const min = potentiometer?.min ?? 0;
      const max = potentiometer?.max ?? 1023;
      this.state.inputs.potentiometer = Math.max(
        min,
        Math.min(max, Math.round(Number(value))),
      );
      return;
    }
    this.state.inputs.toggleSwitch = Boolean(value);
  }

  setAccelerometer(
    reading: AccelerometerReading,
    connected: boolean,
    updatedAtMs: number,
  ): void {
    const clamp = (value: number, fallback: number) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      return Math.max(-4, Math.min(4, numeric));
    };
    this.state.inputs.accelerometer = {
      x: clamp(reading.x, 0),
      y: clamp(reading.y, 0),
      z: clamp(reading.z, 1),
      connected,
      updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
    };
    this.accelerometerVersion += 1;
  }

  accelerationAvailable(): number {
    return this.accelerometerVersion > this.accelerometerReadVersion ? 1 : 0;
  }

  readAcceleration(nowMs = Date.now()): AccelerometerReading {
    this.accelerometerReadVersion = this.accelerometerVersion;
    const acceleration = this.state.inputs.accelerometer;
    if (
      !acceleration.connected ||
      nowMs - acceleration.updatedAtMs > ACCELEROMETER_STALE_MS
    ) {
      return { ...NEUTRAL_ACCELERATION };
    }
    return { x: acceleration.x, y: acceleration.y, z: acceleration.z };
  }

  enqueueSerialInput(text: string): void {
    this.serialInput.push(...new TextEncoder().encode(text));
  }

  serialAvailable(): number {
    return this.serialInput.length - this.serialReadIndex;
  }

  serialPeek(): number {
    return this.serialAvailable() > 0 ? this.serialInput[this.serialReadIndex] : -1;
  }

  serialRead(): number {
    if (this.serialAvailable() === 0) return -1;
    const value = this.serialInput[this.serialReadIndex];
    this.serialReadIndex += 1;

    if (
      this.serialReadIndex >= 1_024 &&
      this.serialReadIndex * 2 >= this.serialInput.length
    ) {
      this.serialInput = this.serialInput.slice(this.serialReadIndex);
      this.serialReadIndex = 0;
    }
    return value;
  }

  randomSeed(seed: number): void {
    const normalized = Math.trunc(seed) >>> 0;
    if (normalized !== 0) this.randomState = normalized;
  }

  private nextRandom(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState;
  }

  random(maximum: number): number;
  random(minimum: number, maximum: number): number;
  random(first: number, second?: number): number {
    if (second === undefined) {
      const maximum = Math.trunc(first);
      if (maximum <= 0) return 0;
      return this.nextRandom() % maximum;
    }

    const minimum = Math.trunc(first);
    const maximum = Math.trunc(second);
    if (minimum >= maximum) return minimum;
    return minimum + (this.nextRandom() % (maximum - minimum));
  }

  delay(milliseconds: number): void {
    this.state.virtualTimeMs += Math.max(0, Math.trunc(milliseconds));
    this.emit({ type: "time-change", virtualTimeMs: this.state.virtualTimeMs });
  }

  millis(): number {
    return this.state.virtualTimeMs;
  }

  micros(): number {
    return this.state.virtualTimeMs * 1_000;
  }

  map(
    value: number,
    fromLow: number,
    fromHigh: number,
    toLow: number,
    toHigh: number,
  ): number {
    if (fromHigh === fromLow) return toLow;
    return Math.trunc(
      ((value - fromLow) * (toHigh - toLow)) / (fromHigh - fromLow) + toLow,
    );
  }
}
