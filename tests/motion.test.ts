import { describe, expect, it } from "vitest";
import {
  GRAVITY_METERS_PER_SECOND_SQUARED,
  phoneMotionToBoardAcceleration,
} from "../src/phone/motion";

describe("phone accelerometer mapping", () => {
  it("maps phone axes to the Lab 2 board axes in g", () => {
    expect(phoneMotionToBoardAcceleration({
      x: GRAVITY_METERS_PER_SECOND_SQUARED,
      y: -GRAVITY_METERS_PER_SECOND_SQUARED * 2,
      z: GRAVITY_METERS_PER_SECOND_SQUARED,
    })).toEqual({ x: -1, y: 2, z: 1 });
  });

  it("clamps readings and rejects unavailable sensor values", () => {
    expect(phoneMotionToBoardAcceleration({
      x: -100,
      y: 100,
      z: 0,
    })).toEqual({ x: 4, y: -4, z: 0 });
    expect(phoneMotionToBoardAcceleration({ x: null, y: 0, z: 0 })).toBeNull();
  });
});
