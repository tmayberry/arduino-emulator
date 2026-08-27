import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { hardwareConfig } from "../src/config/defaultHardware";
import {
  HARDWARE_STORAGE_KEY,
  loadHardwareConfig,
  parseHardwareConfig,
} from "../src/config/hardwareSetup";
import { BoardSetupDialog } from "../src/ui/BoardSetupDialog";

describe("hardware setup", () => {
  it("loads a valid saved setup and rejects pin conflicts", () => {
    const custom = structuredClone(hardwareConfig);
    const green = custom.components.find(
      (component) => component.id === "externalGreenLed",
    )!;
    if (green.type === "led") green.pin = 5;
    custom.testLedPin = 5;
    custom.name = "Custom Hardware";

    const storage = {
      getItem: vi.fn((key: string) =>
        key === HARDWARE_STORAGE_KEY ? JSON.stringify(custom) : null,
      ),
    };
    expect(loadHardwareConfig(storage).testLedPin).toBe(5);

    const red = custom.components.find(
      (component) => component.id === "externalRedLed",
    )!;
    if (red.type === "led") red.pin = 5;
    expect(parseHardwareConfig(custom)).toBeNull();
  });

  it("edits external pins, adds removable inputs, and applies a valid draft", () => {
    const onApply = vi.fn();
    render(
      <BoardSetupDialog
        config={hardwareConfig}
        onApply={onApply}
        onClose={() => undefined}
      />,
    );

    const builtInName = screen.getByDisplayValue("Built-in Yellow LED");
    expect(builtInName).toBeDisabled();
    const builtInPin = screen.getByLabelText("Built-in Yellow LED pin");
    expect(builtInPin).toBeDisabled();
    expect(builtInPin).toHaveValue("13");

    fireEvent.change(screen.getByLabelText("Green LED pin"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add switch" }));
    expect(screen.getByDisplayValue("Toggle Switch 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Toggle Switch 2" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply setup" }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0]).toMatchObject({
      name: "Custom Hardware",
      testLedPin: 5,
    });
    expect(onApply.mock.calls[0][0].components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Toggle Switch 2", origin: "custom" }),
      ]),
    );
  });

  it("requires non-empty device names", () => {
    render(
      <BoardSetupDialog
        config={hardwareConfig}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("Green LED"), {
      target: { value: "" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Every device needs a name.",
    );
    expect(screen.getByRole("button", { name: "Apply setup" })).toBeDisabled();
  });

  it("requires and saves a sensor range and units", () => {
    const onApply = vi.fn();
    render(
      <BoardSetupDialog
        config={hardwareConfig}
        onApply={onApply}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add sensor" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Each sensor needs a min below its max and a unit.",
    );
    expect(screen.getByRole("button", { name: "Apply setup" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Sensor 1 range min"), {
      target: { value: "-20" },
    });
    fireEvent.change(screen.getByLabelText("Sensor 1 range max"), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByLabelText("Sensor 1 units"), {
      target: { value: "°C" },
    });
    fireEvent.change(screen.getByDisplayValue("Sensor 1"), {
      target: { value: "Thermometer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply setup" }));

    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0].components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "sensor",
          label: "Thermometer",
          pin: "A0",
          rangeStart: -20,
          rangeEnd: 120,
          units: "°C",
          defaultValue: 50,
        }),
      ]),
    );
    expect(parseHardwareConfig(onApply.mock.calls[0][0])).not.toBeNull();
  });
});
