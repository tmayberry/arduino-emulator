import type { HardwareConfig } from "../config/types";

export interface WrappedSource {
  code: string;
  prefixLineCount: number;
}

export function wrapArduinoSource(source: string, config: HardwareConfig): WrappedSource {
  const prefix = [
    "#define LOW 0",
    "#define HIGH 1",
    "#define INPUT 0",
    "#define OUTPUT 1",
    "#define INPUT_PULLUP 2",
    ...Array.from({ length: 8 }, (_, index) => `#define A${index} ${14 + index}`),
    `#define TEST_LED_PIN ${config.testLedPin}`,
    `#define LED_BUILTIN ${config.builtInLedPin}`,
    '#include "Arduino.h"',
    "",
  ];

  return {
    // The trailing empty entry creates a newline but not a full prefix line.
    prefixLineCount: prefix.length - 1,
    code: `${prefix.join("\n")}${source}\n\nint main() {\n  setup();\n  while (true) {\n    loop();\n  }\n  return 0;\n}\n`,
  };
}

export function toStudentLine(
  wrappedLine: number | undefined,
  prefixLineCount: number,
  sourceLineCount: number,
): number | undefined {
  if (wrappedLine === undefined) return undefined;
  const line = wrappedLine - prefixLineCount;
  return line >= 1 && line <= sourceLineCount ? line : undefined;
}
