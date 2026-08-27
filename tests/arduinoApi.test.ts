import { describe, expect, it } from "vitest";
import { hardwareConfig, TEST_LED_PIN } from "../src/config/defaultHardware";
import {
  createArduinoInclude,
  createImuInclude,
} from "../src/emulator/arduinoApi";
import { runRestrictedJscpp } from "../src/emulator/jscppRuntime";
import {
  SimulationEngine,
  type SimulationEvent,
} from "../src/emulator/simulationState";

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
      createArduinoInclude(
        engine,
        () => undefined,
        (text) => {
          output += text;
        },
      ),
    );

    expect(result).toBe(0);
    expect(output).toBe("value=42 1 3.50\ndone\n");
  });

  it("supports buffered Serial reads, parsing, strings, and virtual timeouts", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.enqueueSerialInput("junk-42;3.25;hello world\nremainder");
    let output = "";
    const source = `
#include "Arduino.h"
int main() {
  Serial.setTimeout(25);
  Serial.println(Serial.available());
  Serial.println(Serial.peek());
  Serial.println(Serial.parseInt());
  Serial.println(Serial.parseFloat());
  Serial.println(Serial.readStringUntil('\\n'));
  Serial.println(Serial.readString());
  Serial.println(Serial.available());
  Serial.println(Serial.read());
  return 0;
}`;

    const result = runRestrictedJscpp(
      source,
      createArduinoInclude(
        engine,
        () => undefined,
        (text) => {
          output += text;
        },
      ),
    );

    expect(result).toBe(0);
    expect(output).toBe("34\n106\n-42\n3.25\n;hello world\nremainder\n0\n-1\n");
    expect(engine.millis()).toBe(25);
  });

  it("times out an empty Serial parse using the default timeout", () => {
    const engine = new SimulationEngine(hardwareConfig);
    const result = runRestrictedJscpp(
      `#include "Arduino.h"
int main() { return Serial.parseInt(); }`,
      createArduinoInclude(engine, () => undefined),
    );

    expect(result).toBe(0);
    expect(engine.millis()).toBe(1_000);
  });

  it("supports repeatable Arduino random overloads", () => {
    const engine = new SimulationEngine(hardwareConfig);
    const source = `
#include "Arduino.h"
int main() {
  randomSeed(77);
  long first = random(1000);
  long ranged = random(-20, 20);
  randomSeed(77);
  if (first != random(1000)) return 1;
  if (ranged != random(-20, 20)) return 2;
  if (first < 0 || first >= 1000) return 3;
  if (ranged < -20 || ranged >= 20) return 4;
  return 0;
}`;

    expect(
      runRestrictedJscpp(
        source,
        createArduinoInclude(engine, () => undefined),
      ),
    ).toBe(0);
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
      createArduinoInclude(
        engine,
        () => undefined,
        (text) => {
          output += text;
        },
      ),
    );

    expect(result).toBe(0);
    expect(output).toBe(
      "Anchors Aweigh\nAnchors!2026\nReady\nReady\n42\n" +
        "Passed as an argument\n14\nA\n1\n",
    );
  });

  it("zero-initializes uninitialized global primitives like Arduino C++", () => {
    const engine = new SimulationEngine(hardwareConfig);
    let output = "";
    const source = `
#include "Arduino.h"
float platform_old, platform_new = 60;
int global_int;
bool global_bool;
int main() {
  platform_new = platform_old * 4;
  Serial.println(platform_old);
  Serial.println(platform_new);
  Serial.println(global_int);
  Serial.println(global_bool);
  return 0;
}`;

    const result = runRestrictedJscpp(
      source,
      createArduinoInclude(
        engine,
        () => undefined,
        (text) => {
          output += text;
        },
      ),
    );

    expect(result).toBe(0);
    expect(output).toBe("0.00\n0.00\n0\n0\n");
  });

  it("does not zero-initialize automatic local primitives", () => {
    const engine = new SimulationEngine(hardwareConfig);
    const source = `
#include "Arduino.h"
int main() {
  float local_value;
  float result = local_value * 4;
  return 0;
}`;

    expect(() =>
      runRestrictedJscpp(
        source,
        createArduinoInclude(engine, () => undefined),
      ),
    ).toThrow(/NaN\(float\)/);
  });

  it("runs a blink sequence through the fake Arduino API", () => {
    const transitions: Array<{ event: SimulationEvent; time: number }> = [];
    const engine = new SimulationEngine(hardwareConfig, undefined, (event) => {
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
    const pinTransitions = transitions.filter(
      (item) => item.event.type === "pin-change",
    );
    expect(pinTransitions).toEqual([
      { event: { type: "pin-change", pin: "D4", value: 1 }, time: 0 },
      { event: { type: "pin-change", pin: "D4", value: 0 }, time: 1000 },
    ]);
    expect(engine.millis()).toBe(2000);
  });

  it("exposes micros from the simulated clock", () => {
    const engine = new SimulationEngine(hardwareConfig);
    const source = `
#include "Arduino.h"
int main() {
  delay(123);
  return micros() == 123000 ? 0 : 1;
}`;

    expect(
      runRestrictedJscpp(
        source,
        createArduinoInclude(engine, () => undefined),
      ),
    ).toBe(0);
  });

  it("returns live A7 and D2 values to interpreted code", () => {
    const engine = new SimulationEngine(hardwareConfig, {
      components: {
        potentiometer: 723,
        toggleSwitch: true,
      },
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

  it("supports the Lab 2 BMI270 accelerometer API", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.setAccelerometer({ x: 1.25, y: -2.5, z: 0.75 }, true, Date.now());
    const source = `
#include "Arduino.h"
#include "Arduino_BMI270_BMM150.h"
float x, y, z;
int main() {
  if (!IMU.begin()) return -1;
  if (!IMU.accelerationAvailable()) return -2;
  IMU.readAcceleration(x, y, z);
  return (int)(x * 100 + y * 10 + z);
}`;

    const result = runRestrictedJscpp(
      source,
      createArduinoInclude(engine, () => undefined),
      {},
      {
        "Arduino_BMI270_BMM150.h": createImuInclude(engine, () => undefined),
      },
    );
    expect(result).toBe(100);
    expect(engine.accelerationAvailable()).toBe(0);
  });
});
