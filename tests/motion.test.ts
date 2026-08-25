import { describe, expect, it } from "vitest";
import {
  GRAVITY_METERS_PER_SECOND_SQUARED,
  phoneMotionToBoardAcceleration,
} from "../src/phone/motion";

describe("phone accelerometer mapping", () => {
  it("reports positive Z when the phone is resting face-up on a desk", () => {
    expect(phoneMotionToBoardAcceleration({
      x: 0,
      y: 0,
      z: -GRAVITY_METERS_PER_SECOND_SQUARED,
    })).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("maps the phone's long edge to board X and short edge to board Y", () => {
    expect(phoneMotionToBoardAcceleration({
      x: GRAVITY_METERS_PER_SECOND_SQUARED,
      y: -GRAVITY_METERS_PER_SECOND_SQUARED * 2,
      z: GRAVITY_METERS_PER_SECOND_SQUARED,
    })).toEqual({ x: 2, y: -1, z: -1 });
  });

  it("clamps readings and rejects unavailable sensor values", () => {
    expect(phoneMotionToBoardAcceleration({
      x: -100,
      y: 100,
      z: 0,
    })).toEqual({ x: -4, y: 4, z: 0 });
    expect(phoneMotionToBoardAcceleration({ x: null, y: 0, z: 0 })).toBeNull();
  });
});
