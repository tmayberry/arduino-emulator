import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SerialMonitor } from "../src/ui/SerialMonitor";

describe("SerialMonitor", () => {
  it("copies the entire output buffer to the clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const output = "value=42\r\ndone\n";
    render(
      <SerialMonitor
        output={output}
        inputEnabled
        onClear={() => undefined}
        onSend={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(output);
  });

  it("renders output verbatim and supports clearing it", () => {
    const onClear = vi.fn();
    render(
      <SerialMonitor
        output={"value=42\ndone\n"}
        inputEnabled
        onClear={onClear}
        onSend={() => undefined}
      />,
    );

    expect(screen.getByText("done")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Serial Monitor/ }));
    expect(screen.getByText(/value=42/)).toHaveTextContent("value=42 done");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("shows an empty-state hint", () => {
    render(
      <SerialMonitor
        output=""
        inputEnabled={false}
        onClear={() => undefined}
        onSend={() => undefined}
      />,
    );
    expect(screen.getByText("No serial output")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Serial Monitor/ }));
    expect(
      screen.getByText("Output from Serial.print() will appear here."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "Serial input" }),
    ).toBeDisabled();
  });

  it("sends text with the selected line ending and clears the field", () => {
    const onSend = vi.fn();
    render(
      <SerialMonitor
        output=""
        inputEnabled
        onClear={() => undefined}
        onSend={onSend}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Serial Monitor/ }));
    const input = screen.getByRole("textbox", { name: "Serial input" });
    fireEvent.change(input, { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenLastCalledWith("123\n");
    expect(input).toHaveValue("");

    fireEvent.change(screen.getByRole("combobox", { name: "Line ending" }), {
      target: { value: "both" },
    });
    fireEvent.change(input, { target: { value: "go" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSend).toHaveBeenLastCalledWith("go\r\n");

    fireEvent.change(screen.getByRole("combobox", { name: "Line ending" }), {
      target: { value: "none" },
    });
    fireEvent.change(input, { target: { value: "raw" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSend).toHaveBeenLastCalledWith("raw");

    fireEvent.change(screen.getByRole("combobox", { name: "Line ending" }), {
      target: { value: "carriageReturn" },
    });
    fireEvent.change(input, { target: { value: "cr" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSend).toHaveBeenLastCalledWith("cr\r");
  });
});
