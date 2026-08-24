export type PinReference = number | `D${number}` | `A${number}`;

export interface BoardConfig {
  type: "arduino-nano-33-ble";
  label: string;
}

export interface LedComponentConfig {
  id: string;
  type: "led";
  origin: "default";
  label: string;
  pin: PinReference;
  activeHigh: boolean;
  color: string;
  placement: "board" | "breadboard";
}

export interface PotentiometerComponentConfig {
  id: string;
  type: "potentiometer";
  origin: "default" | "custom";
  label: string;
  pin: PinReference;
  min: number;
  max: number;
  defaultValue: number;
}

export interface SensorComponentConfig {
  id: string;
  type: "sensor";
  origin: "custom";
  label: string;
  pin: PinReference;
  rangeStart: number;
  rangeEnd: number;
  units: string;
  defaultValue: number;
}

export interface ToggleSwitchComponentConfig {
  id: string;
  type: "toggle-switch";
  origin: "default" | "custom";
  label: string;
  pin: PinReference;
  onValue: 0 | 1;
  offValue: 0 | 1;
  defaultPosition: "on" | "off";
}

export interface ResetButtonComponentConfig {
  id: string;
  type: "reset-button";
  label: string;
  placement: "board";
}

export type ComponentConfig =
  | LedComponentConfig
  | PotentiometerComponentConfig
  | SensorComponentConfig
  | ToggleSwitchComponentConfig
  | ResetButtonComponentConfig;

export interface HardwareConfig {
  id: string;
  name: string;
  board: BoardConfig;
  testLedPin: number;
  builtInLedPin: number;
  components: ComponentConfig[];
}
