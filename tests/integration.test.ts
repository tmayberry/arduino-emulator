import { describe, expect, it } from "vitest";
import { hardwareConfig } from "../src/config/defaultHardware";
import { STARTER_SKETCH } from "../src/config/starterSketch";
import { createArduinoInclude } from "../src/emulator/arduinoApi";
import { runRestrictedJscpp } from "../src/emulator/jscppRuntime";
import { SimulationEngine, type SimulationEvent } from "../src/emulator/simulationState";
import { wrapArduinoSource } from "../src/emulator/sourceWrapper";

describe("wrapped sketch integration", () => {
  it("steps the starter loop and produces one-second LED transitions", () => {
    const transitions: Array<{ value: number; time: number }> = [];
    let engine!: SimulationEngine;
    engine = new SimulationEngine(hardwareConfig, undefined, (event: SimulationEvent) => {
      if (event.type === "pin-change") {
        transitions.push({ value: event.value, time: engine.millis() });
      }
    });
    const wrapped = wrapArduinoSource(STARTER_SKETCH, hardwareConfig);
    const debuggerInstance = runRestrictedJscpp(
      wrapped.code,
      createArduinoInclude(engine, () => undefined),
      { debug: true },
    ) as { next(): unknown };

    for (let steps = 0; transitions.length < 3 && steps < 5_000; steps += 1) {
      debuggerInstance.next();
    }

    expect(transitions).toEqual([
      { value: 1, time: 0 },
      { value: 0, time: 1000 },
      { value: 1, time: 2000 },
    ]);
  });
});
