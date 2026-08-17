export interface AccelerometerReading {
  x: number;
  y: number;
  z: number;
}

export interface AccelerometerInput extends AccelerometerReading {
  connected: boolean;
  updatedAtMs: number;
}

export interface WorkerInputs {
  potentiometer: number;
  toggleSwitch: boolean;
  accelerometer: AccelerometerInput;
}

export type UiToWorkerMessage =
  | { type: "start"; source: string; inputs: WorkerInputs }
  | {
      type: "input-change";
      component: "potentiometer" | "toggleSwitch";
      value: number | boolean;
    }
  | {
      type: "accelerometer-change";
      reading: AccelerometerReading;
      connected: boolean;
      updatedAtMs: number;
    }
  | { type: "stop" }
  | { type: "reset" };

export type WorkerToUiMessage =
  | { type: "pin-change"; pin: string; value: 0 | 1 }
  | { type: "pwm-change"; pin: string; value: number }
  | { type: "time-change"; virtualTimeMs: number }
  | { type: "serial-output"; text: string }
  | { type: "running" }
  | { type: "stopped"; reason?: string }
  | { type: "error"; message: string; line?: number };

export function isWorkerMessage(value: unknown): value is WorkerToUiMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      typeof (value as { type?: unknown }).type === "string",
  );
}
