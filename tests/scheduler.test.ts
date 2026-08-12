import { describe, expect, it } from "vitest";
import {
  isRunaway,
  MAX_INSTRUCTIONS_WITHOUT_ACTIVITY,
  nextSchedulerDelay,
  realTimeWaitMs,
} from "../src/emulator/scheduler";

describe("cooperative scheduler helpers", () => {
  it("waits for wall time to catch up with virtual time in short chunks", () => {
    expect(realTimeWaitMs(1000, 5)).toBe(995);
    expect(nextSchedulerDelay(995)).toBe(100);
    expect(realTimeWaitMs(1000, 1005)).toBe(0);
  });

  it("flags sketches that execute too long without time or I/O activity", () => {
    expect(isRunaway(MAX_INSTRUCTIONS_WITHOUT_ACTIVITY - 1)).toBe(false);
    expect(isRunaway(MAX_INSTRUCTIONS_WITHOUT_ACTIVITY)).toBe(true);
  });
});
