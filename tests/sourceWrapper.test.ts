import { describe, expect, it } from "vitest";
import { hardwareConfig } from "../src/config/defaultHardware";
import {
  hasEmptyLoop,
  toStudentLine,
  wrapArduinoSource,
} from "../src/emulator/sourceWrapper";

describe("Arduino source wrapper", () => {
  it("injects Arduino constants, the compatibility include, and main", () => {
    const wrapped = wrapArduinoSource(
      "void setup() {}\nvoid loop() { digitalWrite(4, HIGH); }",
      hardwareConfig,
    );
    expect(wrapped.code).toContain("#define A7 21");
    expect(wrapped.code).toContain(`#define TEST_LED_PIN ${hardwareConfig.testLedPin}`);
    expect(wrapped.code).toContain("#define LED_BUILTIN 13");
    expect(wrapped.code).toContain('#include "Arduino.h"');
    expect(wrapped.code).toContain("while (true)");
  });

  it("finishes after setup when loop is empty or contains only comments", () => {
    const emptySource = "void setup() {}\nvoid loop() {}";
    const commentedSource = `void setup() {}
void loop() {
  // Intentionally idle
  /* Nothing to repeat. */
}`;

    expect(hasEmptyLoop(emptySource)).toBe(true);
    expect(hasEmptyLoop(commentedSource)).toBe(true);
    expect(wrapArduinoSource(commentedSource, hardwareConfig).code).not.toContain(
      "while (true)",
    );
  });

  it("does not mistake comments inside a non-empty loop for an empty loop", () => {
    const source = `void setup() {}
void loop() {
  Serial.println("https://example.com/*");
}`;

    expect(hasEmptyLoop(source)).toBe(false);
    expect(wrapArduinoSource(source, hardwareConfig).code).toContain("while (true)");
  });

  it("translates wrapped lines back to editor lines", () => {
    const source = "void setup() {}\nvoid loop() {}";
    const wrapped = wrapArduinoSource(source, hardwareConfig);
    expect(toStudentLine(wrapped.prefixLineCount + 1, wrapped.prefixLineCount, 2)).toBe(1);
    expect(toStudentLine(wrapped.prefixLineCount + 2, wrapped.prefixLineCount, 2)).toBe(2);
  });
});
