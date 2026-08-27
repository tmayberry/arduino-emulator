import type { HardwareConfig } from "../config/types";

export interface WrappedSource {
  code: string;
  prefixLineCount: number;
}

function withoutComments(source: string): string {
  let result = "";
  let index = 0;
  let quote: '"' | "'" | null = null;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (quote) {
      result += current;
      if (current === "\\" && next !== undefined) {
        result += next;
        index += 2;
        continue;
      }
      if (current === quote) quote = null;
      index += 1;
      continue;
    }

    if (current === '"' || current === "'") {
      quote = current;
      result += current;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      result += "  ";
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        result += " ";
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      result += "  ";
      index += 2;
      while (index < source.length) {
        if (source[index] === "*" && source[index + 1] === "/") {
          result += "  ";
          index += 2;
          break;
        }
        result += source[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    result += current;
    index += 1;
  }

  return result;
}

export function hasEmptyLoop(source: string): boolean {
  return /\bvoid\s+loop\s*\(\s*(?:void\s*)?\)\s*\{\s*\}/.test(
    withoutComments(source),
  );
}

export function wrapArduinoSource(
  source: string,
  config: HardwareConfig,
): WrappedSource {
  const prefix = [
    "#define LOW 0",
    "#define HIGH 1",
    "#define INPUT 0",
    "#define OUTPUT 1",
    "#define INPUT_PULLUP 2",
    "#define min(a,b) ((a)<(b)?(a):(b))",
    "#define max(a,b) ((a)>(b)?(a):(b))",
    "#define constrain(value,low,high) ((value)<(low)?(low):((value)>(high)?(high):(value)))",
    ...Array.from({ length: 14 }, (_, index) => `#define D${index} ${index}`),
    ...Array.from(
      { length: 8 },
      (_, index) => `#define A${index} ${14 + index}`,
    ),
    `#define TEST_LED_PIN ${config.testLedPin}`,
    `#define LED_BUILTIN ${config.builtInLedPin}`,
    '#include "Arduino.h"',
    "",
  ];

  const main = hasEmptyLoop(source)
    ? "int main() {\n  setup();\n  return 0;\n}\n"
    : "int main() {\n  setup();\n  while (true) {\n    loop();\n  }\n  return 0;\n}\n";

  return {
    // The trailing empty entry creates a newline but not a full prefix line.
    prefixLineCount: prefix.length - 1,
    code: `${prefix.join("\n")}${source}\n\n${main}`,
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
