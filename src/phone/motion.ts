import type { AccelerometerReading } from "../emulator/workerProtocol";

export const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665;

export function phoneMotionToBoardAcceleration(
  acceleration: DeviceMotionEventAcceleration | null,
): AccelerometerReading | null {
  if (
    acceleration?.x == null ||
    acceleration.y == null ||
    acceleration.z == null
  ) {
    return null;
  }
  const clamp = (value: number) => Math.max(-4, Math.min(4, value));
  return {
    x: clamp(-acceleration.x / GRAVITY_METERS_PER_SECOND_SQUARED),
    y: clamp(-acceleration.y / GRAVITY_METERS_PER_SECOND_SQUARED),
    z: clamp(acceleration.z / GRAVITY_METERS_PER_SECOND_SQUARED),
  };
}

export async function requestMotionPermission(): Promise<boolean> {
  const motionEvent = DeviceMotionEvent as typeof DeviceMotionEvent & {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (typeof motionEvent.requestPermission === "function") {
    return (await motionEvent.requestPermission()) === "granted";
  }
  return "DeviceMotionEvent" in window;
}
