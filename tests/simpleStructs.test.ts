import { describe, expect, it } from "vitest";
import { hardwareConfig } from "../src/config/defaultHardware";
import {
  createArduinoInclude,
  createImuInclude,
} from "../src/emulator/arduinoApi";
import { runRestrictedJscpp } from "../src/emulator/jscppRuntime";
import {
  prepareSimpleStructs,
  SIMPLE_STRUCT_INCLUDE,
  SimpleStructCompatibilityError,
} from "../src/emulator/simpleStructs";
import { wrapArduinoSource } from "../src/emulator/sourceWrapper";
import { toStudentLine } from "../src/emulator/sourceWrapper";
import { SimulationEngine } from "../src/emulator/simulationState";

function runSketch(source: string): string {
  const prepared = prepareSimpleStructs(source);
  const includes = prepared.include ? [SIMPLE_STRUCT_INCLUDE] : [];
  const wrapped = wrapArduinoSource(prepared.source, hardwareConfig, includes);
  const engine = new SimulationEngine(hardwareConfig);
  engine.setAccelerometer({ x: 1.25, y: -2.5, z: 0.75 }, true, Date.now());
  let output = "";

  runRestrictedJscpp(
    wrapped.code,
    createArduinoInclude(
      engine,
      () => undefined,
      (text) => {
        output += text;
      },
    ),
    {},
    {
      "Arduino_BMI270_BMM150.h": createImuInclude(engine, () => undefined),
      ...(prepared.include
        ? { [SIMPLE_STRUCT_INCLUDE]: prepared.include }
        : {}),
    },
  );

  return output;
}

describe("plain struct compatibility", () => {
  it("runs the class-notes accelerometer pattern without source changes", () => {
    const source = `#include "Arduino_BMI270_BMM150.h"
struct accel {
  int time[200];
  float x[200];
  float y[200];
  float z[200];
};

accel data;
int k = 0, time_now = 10;

void setup() {
  IMU.begin();
  data.time[k] = time_now;
  IMU.readAcceleration(data.x[k], data.y[k], data.z[k]);
  Serial.print(data.time[k]);
  Serial.print(",");
  Serial.print(data.x[k]);
  Serial.print(",");
  Serial.print(data.y[k]);
  Serial.print(",");
  Serial.println(data.z[k]);
}

void loop() {}`;

    expect(runSketch(source)).toBe("10,1.25,-2.50,0.75\n");
  });

  it("supports both type spellings, local variables, and comma-separated fields", () => {
    const source = `struct Sample {
  int first, values[2];
  unsigned long count;
};

Sample globalSample;

void setup() {
  struct Sample localSample;
  globalSample.first = 3;
  localSample.values[1] = 4;
  localSample.count = 5;
  Serial.println(globalSample.first + localSample.values[1] + localSample.count);
}

void loop() {}`;

    expect(runSketch(source)).toBe("12\n");
  });

  it("preserves source length and line breaks when removing definitions", () => {
    const source = `struct Reading {
  float x[3];
};
void setup() {
  missingFunction();
}`;
    const prepared = prepareSimpleStructs(source);

    expect(prepared.include).toBeDefined();
    expect(prepared.source).toHaveLength(source.length);
    expect(prepared.source.split("\n")).toHaveLength(source.split("\n").length);
    expect(prepared.source.split("\n")[4]).toBe("  missingFunction();");

    const wrapped = wrapArduinoSource(prepared.source, hardwareConfig, [
      SIMPLE_STRUCT_INCLUDE,
    ]);
    expect(
      toStudentLine(wrapped.prefixLineCount + 5, wrapped.prefixLineCount, 6),
    ).toBe(5);
  });

  it("ignores struct-like text in comments and literals", () => {
    const source = `// struct Fake { int value; };
const char *text = "struct AlsoFake { float x[2]; };";
void setup() {}
void loop() {}`;

    expect(prepareSimpleStructs(source)).toEqual({ source });
  });

  it.each([
    ["pointers", "struct Bad { int *value; };", 1],
    ["references", "struct Bad { float &value; };", 1],
    ["methods", "struct Bad { int value(); };", 1],
    ["nested fields", "struct Bad { struct Inner value; };", 1],
    ["member initializers", "struct Bad { int value = 1; };", 1],
    ["symbolic array sizes", "struct Bad { int value[SIZE]; };", 1],
    ["inline variables", "struct Bad { int value; } data;", 1],
    ["anonymous typedefs", "typedef struct { int value; } Bad;", 1],
    ["named typedefs", "typedef struct Bad { int value; };", 1],
    ["forward declarations", "struct Bad;", 1],
    ["inheritance", "struct Bad : Base { int value; };", 1],
    [
      "aggregate initialization",
      "struct Bad { int value; };\nBad data = {};",
      2,
    ],
    ["local definitions", "void setup() {\nstruct Bad { int value; };\n}", 2],
  ])("rejects unsupported %s with a source line", (_name, source, line) => {
    try {
      prepareSimpleStructs(source);
      throw new Error("Expected struct preparation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SimpleStructCompatibilityError);
      expect((error as SimpleStructCompatibilityError).line).toBe(line);
      expect((error as Error).message).toMatch(
        /^Unsupported struct declaration:/,
      );
    }
  });
});
