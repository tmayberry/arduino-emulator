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
  const clamp = (value: number) => {
    const clamped = Math.max(-4, Math.min(4, value));
    return Object.is(clamped, -0) ? 0 : clamped;
  };
  return {
    // In portrait, the phone's Y axis follows the Nano's long edge and its X
    // axis follows the short edge. The browser's gravity sign is opposite the
    // BMI270 readings used by the lab on all three transformed axes.
    x: clamp(-acceleration.y / GRAVITY_METERS_PER_SECOND_SQUARED),
    y: clamp(-acceleration.x / GRAVITY_METERS_PER_SECOND_SQUARED),
    z: clamp(-acceleration.z / GRAVITY_METERS_PER_SECOND_SQUARED),
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
