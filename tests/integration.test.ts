import { describe, expect, it } from "vitest";
import { hardwareConfig } from "../src/config/defaultHardware";
import { createArduinoInclude } from "../src/emulator/arduinoApi";
import { runRestrictedJscpp } from "../src/emulator/jscppRuntime";
import { SimulationEngine, type SimulationEvent } from "../src/emulator/simulationState";
import { wrapArduinoSource } from "../src/emulator/sourceWrapper";

const BLINK_SKETCH = `int red = 6;

void setup() {
  pinMode(red, OUTPUT);
}

void loop() {
  digitalWrite(red, 1);
  delay(1000);
  digitalWrite(red, 0);
  delay(1000);
}`;

describe("wrapped sketch integration", () => {
  it("runs setup and finishes cleanly when loop is empty", () => {
    const transitions: SimulationEvent[] = [];
    const engine = new SimulationEngine(hardwareConfig, undefined, (event) => {
      transitions.push(event);
    });
    const wrapped = wrapArduinoSource(`void setup() {
  pinMode(6, OUTPUT);
  digitalWrite(6, HIGH);
}

void loop() {}`, hardwareConfig);
    const debuggerInstance = runRestrictedJscpp(
      wrapped.code,
      createArduinoInclude(engine, () => undefined),
      { debug: true },
    ) as { done: boolean; next(): unknown };

    for (let steps = 0; !debuggerInstance.done && steps < 1_000; steps += 1) {
      debuggerInstance.next();
    }

    expect(debuggerInstance.done).toBe(true);
    expect(transitions).toContainEqual({
      type: "pin-change",
      pin: "D6",
      value: 1,
    });
  });

  it("steps a blink loop and produces one-second LED transitions", () => {
    const transitions: Array<{ value: number; time: number }> = [];
    let engine!: SimulationEngine;
    engine = new SimulationEngine(hardwareConfig, undefined, (event: SimulationEvent) => {
      if (event.type === "pin-change") {
        transitions.push({ value: event.value, time: engine.millis() });
      }
    });
    const wrapped = wrapArduinoSource(BLINK_SKETCH, hardwareConfig);
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
