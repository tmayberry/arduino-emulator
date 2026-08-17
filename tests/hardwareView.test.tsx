import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { hardwareConfig } from "../src/config/defaultHardware";
import { HardwareView } from "../src/ui/HardwareView";

describe("HardwareView", () => {
  const renderHardware = (onReset = () => undefined) => render(
    <HardwareView
      config={hardwareConfig}
      pinOutputs={{}}
      potentiometer={512}
      toggleSwitch={false}
      accelerometer={{ x: 0, y: 0, z: 1 }}
      accelerometerConnected={false}
      onPotentiometerChange={() => undefined}
      onToggleChange={() => undefined}
      onAccelerometerChange={() => undefined}
      onReset={onReset}
    />,
  );

  it("starts each input widget collapsed and expands them independently", () => {
    const { container } = renderHardware();
    const widgets = Array.from(container.querySelectorAll("details"));

    expect(widgets).toHaveLength(3);
    expect(widgets.every((widget) => !widget.open)).toBe(true);

    fireEvent.click(screen.getByText("Potentiometer").closest("summary")!);

    expect(widgets[0]).toHaveAttribute("open");
    expect(widgets[1]).not.toHaveAttribute("open");
    expect(widgets[2]).not.toHaveAttribute("open");
  });

  it("renders both configured LEDs in their correct locations", () => {
    render(
      <HardwareView
        config={hardwareConfig}
        pinOutputs={{
          D13: { kind: "digital", value: 1 },
          D4: { kind: "pwm", value: 128 },
          D6: { kind: "digital", value: 1 },
        }}
        potentiometer={512}
        toggleSwitch={false}
        accelerometer={{ x: 0, y: 0, z: 1 }}
        accelerometerConnected={false}
        onPotentiometerChange={() => undefined}
        onToggleChange={() => undefined}
        onAccelerometerChange={() => undefined}
        onReset={() => undefined}
      />,
    );

    expect(screen.getByLabelText(/Built-in Yellow LED on D13: 100%/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Green LED: 50%/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Red LED: 100%/)).toBeInTheDocument();
  });

  it("makes the physical Nano reset button clickable", () => {
    const onReset = vi.fn();
    renderHardware(onReset);

    fireEvent.click(screen.getByRole("button", { name: "Press the Nano reset button" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
