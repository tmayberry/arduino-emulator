import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SerialMonitor } from "../src/ui/SerialMonitor";

describe("SerialMonitor", () => {
  it("renders output verbatim and supports clearing it", () => {
    const onClear = vi.fn();
    render(<SerialMonitor output={"value=42\ndone\n"} onClear={onClear} />);

    expect(screen.getByText(/value=42/)).toHaveTextContent("value=42 done");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("shows an empty-state hint", () => {
    render(<SerialMonitor output="" onClear={() => undefined} />);
    expect(
      screen.getByText("Output from Serial.print() will appear here."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });
});
