import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { hardwareConfig } from "../src/config/defaultHardware";
import { HardwareView } from "../src/ui/HardwareView";

describe("HardwareView", () => {
  const renderHardware = (
    onReset = () => undefined,
    onConfigure = () => undefined,
  ) =>
    render(
      <HardwareView
        config={hardwareConfig}
        pinOutputs={{}}
        componentInputs={{ potentiometer: 512, toggleSwitch: false }}
        accelerometer={{ x: 0, y: 0, z: 1 }}
        accelerometerConnected={false}
        onInputChange={() => undefined}
        onAccelerometerChange={() => undefined}
        onReset={onReset}
        onConfigure={onConfigure}
      />,
    );

  it("starts each input widget collapsed and expands them independently", () => {
    const { container } = renderHardware();
    const widgets = Array.from(container.querySelectorAll("details"));

    expect(widgets).toHaveLength(2);
    expect(widgets.every((widget) => !widget.open)).toBe(true);

    fireEvent.click(screen.getByText("Potentiometer").closest("summary")!);

    expect(widgets[0]).toHaveAttribute("open");
    expect(widgets[1]).not.toHaveAttribute("open");
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
        componentInputs={{ potentiometer: 512, toggleSwitch: false }}
        accelerometer={{ x: 0, y: 0, z: 1 }}
        accelerometerConnected={false}
        onInputChange={() => undefined}
        onAccelerometerChange={() => undefined}
        onReset={() => undefined}
        onConfigure={() => undefined}
      />,
    );

    expect(
      screen.getByLabelText(/Built-in Yellow LED on D13: 100%/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Green LED: 50%/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Red LED: 100%/)).toBeInTheDocument();
  });

  it("makes the physical Nano reset button clickable", () => {
    const onReset = vi.fn();
    renderHardware(onReset);

    fireEvent.click(
      screen.getByRole("button", { name: "Press the Nano reset button" }),
    );
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("opens board setup from the main control and device pin badges", () => {
    const onConfigure = vi.fn();
    const { container } = renderHardware(() => undefined, onConfigure);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Configure devices & pins Default Hardware",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Configure Potentiometer on A7" }),
    );

    expect(onConfigure).toHaveBeenCalledTimes(2);
    expect(container.querySelector("details")!).not.toHaveAttribute("open");
  });

  it("lets a wide-range sensor reach its maximum ADC reading", () => {
    const onInputChange = vi.fn();
    const config = {
      ...hardwareConfig,
      components: [
        ...hardwareConfig.components,
        {
          id: "pressureSensor",
          type: "sensor" as const,
          origin: "custom" as const,
          label: "Pressure Sensor",
          pin: "A0" as const,
          rangeStart: 0,
          rangeEnd: 5000,
          units: "kPa",
          defaultValue: 2500,
        },
      ],
    };
    function SensorFixture() {
      const [sensorValue, setSensorValue] = useState(2500);
      return (
        <HardwareView
          config={config}
          pinOutputs={{}}
          componentInputs={{
            potentiometer: 512,
            pressureSensor: sensorValue,
            toggleSwitch: false,
          }}
          accelerometer={{ x: 0, y: 0, z: 1 }}
          accelerometerConnected={false}
          onInputChange={(componentId, value) => {
            onInputChange(componentId, value);
            if (componentId === "pressureSensor") setSensorValue(Number(value));
          }}
          onAccelerometerChange={() => undefined}
          onReset={() => undefined}
          onConfigure={() => undefined}
        />
      );
    }
    render(<SensorFixture />);

    expect(screen.getByText("Pressure Sensor")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Pressure Sensor").closest("summary")!);
    expect(screen.getByText("analogRead()")).toBeInTheDocument();
    expect(
      screen.getByText("512", { selector: ".sensor-readouts strong" }),
    ).toBeInTheDocument();
    const slider = screen.getByRole("slider", {
      name: "Pressure Sensor value in kPa",
    });
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "5000");
    expect(slider).toHaveAttribute("step", "any");

    fireEvent.change(slider, { target: { value: "5000" } });
    expect(onInputChange).toHaveBeenCalledWith("pressureSensor", 5000);
    expect(
      screen.getByText("1023", { selector: ".sensor-readouts strong" }),
    ).toBeInTheDocument();
  });
});
