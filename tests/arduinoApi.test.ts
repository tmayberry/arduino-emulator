import { describe, expect, it } from "vitest";
import { hardwareConfig, TEST_LED_PIN } from "../src/config/defaultHardware";
import { createArduinoInclude } from "../src/emulator/arduinoApi";
import { runRestrictedJscpp } from "../src/emulator/jscppRuntime";
import { SimulationEngine, type SimulationEvent } from "../src/emulator/simulationState";

describe("JSCPP Arduino compatibility layer", () => {
  it("supports Arduino-style Serial debug output", () => {
    const engine = new SimulationEngine(hardwareConfig);
    let output = "";
    const source = `
#include "Arduino.h"
int main() {
  Serial.begin(9600);
  Serial.print("value=");
  Serial.print(42);
  Serial.print(' ');
  Serial.print(true);
  Serial.print(' ');
  Serial.print(3.5);
  Serial.println();
  Serial.println("done");
  return 0;
}`;

    const result = runRestrictedJscpp(
      source,
      createArduinoInclude(engine, () => undefined, (text) => {
        output += text;
      }),
    );

    expect(result).toBe(0);
    expect(output).toBe("value=42 1 3.50\ndone\n");
  });

  it("supports Arduino String variables", () => {
    const engine = new SimulationEngine(hardwareConfig);
    let output = "";
    const source = `
#include "Arduino.h"
String greeting = "Anchors";
void announce(String message) {
  Serial.println(message);
}
int main() {
  String copy = greeting;
  String status;
  String count = 42;
  status = "Ready";
  greeting += " Aweigh";
  copy = copy + '!' + 2026;
  Serial.println(greeting);
  Serial.println(copy);
  Serial.println(status);
  Serial.println(status.c_str());
  Serial.println(count);
  announce("Passed as an argument");
  Serial.println(greeting.length());
  Serial.println(greeting.charAt(0));
  Serial.println(greeting == "Anchors Aweigh");
  return 0;
}`;

    const result = runRestrictedJscpp(
      source,
      createArduinoInclude(engine, () => undefined, (text) => {
        output += text;
      }),
    );

    expect(result).toBe(0);
    expect(output).toBe(
      "Anchors Aweigh\nAnchors!2026\nReady\nReady\n42\n" +
      "Passed as an argument\n14\nA\n1\n",
    );
  });

  it("runs a blink sequence through the fake Arduino API", () => {
    const transitions: Array<{ event: SimulationEvent; time: number }> = [];
    let engine!: SimulationEngine;
    engine = new SimulationEngine(hardwareConfig, undefined, (event) => {
      transitions.push({ event, time: engine.millis() });
    });

    const source = `
#include "Arduino.h"
int main() {
  pinMode(${TEST_LED_PIN}, 1);
  digitalWrite(${TEST_LED_PIN}, 1);
  delay(1000);
  digitalWrite(${TEST_LED_PIN}, 0);
  delay(1000);
  return 0;
}`;

    const result = runRestrictedJscpp(
      source,
      createArduinoInclude(engine, () => undefined),
    );

    expect(result).toBe(0);
    const pinTransitions = transitions.filter((item) => item.event.type === "pin-change");
    expect(pinTransitions).toEqual([
      { event: { type: "pin-change", pin: "D4", value: 1 }, time: 0 },
      { event: { type: "pin-change", pin: "D4", value: 0 }, time: 1000 },
    ]);
    expect(engine.millis()).toBe(2000);
  });

  it("returns live A7 and D2 values to interpreted code", () => {
    const engine = new SimulationEngine(hardwareConfig, {
      potentiometer: 723,
      toggleSwitch: true,
    });
    const source = `
#include "Arduino.h"
int main() {
  return analogRead(21) + digitalRead(2);
}`;

    const result = runRestrictedJscpp(
      source,
      createArduinoInclude(engine, () => undefined),
    );
    expect(result).toBe(724);
  });

  it("does not expose arbitrary bundled C++ libraries", () => {
    const engine = new SimulationEngine(hardwareConfig);
    expect(() =>
      runRestrictedJscpp(
        "#include <iostream>\nint main() { return 0; }",
        createArduinoInclude(engine, () => undefined),
      ),
    ).toThrow(/cannot find library: iostream/);
  });
});
