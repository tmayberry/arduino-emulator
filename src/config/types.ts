export type PinReference = number | `D${number}` | `A${number}`;

export interface BoardConfig {
  type: "arduino-nano-33-ble";
  label: string;
}

export interface LedComponentConfig {
  id: string;
  type: "led";
  label: string;
  pin: PinReference;
  activeHigh: boolean;
  color: string;
  placement: "board" | "breadboard";
}

export interface PotentiometerComponentConfig {
  id: string;
  type: "potentiometer";
  label: string;
  pin: PinReference;
  min: number;
  max: number;
  defaultValue: number;
}

export interface ToggleSwitchComponentConfig {
  id: string;
  type: "toggle-switch";
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
