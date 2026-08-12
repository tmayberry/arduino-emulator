import { describe, expect, it } from "vitest";
import { normalizeDiagnosticMessage } from "../src/emulator/errorFormatting";

describe("normalizeDiagnosticMessage", () => {
  it("expands escaped newlines in the source excerpt", () => {
    const message = "line 3: void loop() {\\n bad();\\n}\n---^";

    expect(normalizeDiagnosticMessage(message)).toBe(
      "line 3: void loop() {\n bad();\n}\n---^",
    );
  });

  it("preserves meaningful escapes in the parser expectation", () => {
    const message = "line 3: int x =\\n return 0;\n---^\nExpected [ \\n\\r\\t]";

    expect(normalizeDiagnosticMessage(message)).toBe(
      "line 3: int x =\n return 0;\n---^\nExpected [ \\n\\r\\t]",
    );
  });

  it("normalizes Windows-style line endings", () => {
    expect(normalizeDiagnosticMessage("first\r\nsecond\rthird")).toBe("first\nsecond\nthird");
  });
});
