import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPanel } from "../src/ui/StatusPanel";

describe("StatusPanel", () => {
  it("renders compiler errors as multiline preformatted text", () => {
    render(
      <StatusPanel
        status="error"
        message={"expected ';'\nwhile parsing loop()"}
        line={7}
        virtualTimeMs={0}
      />,
    );

    const diagnostic = screen.getByText(/expected ';'/);
    expect(diagnostic.tagName).toBe("PRE");
    expect(diagnostic.textContent).toBe("Line 7:\nexpected ';'\nwhile parsing loop()");
  });
});
