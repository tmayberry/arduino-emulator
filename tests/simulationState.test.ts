import { describe, expect, it } from "vitest";
import { hardwareConfig, TEST_LED_PIN } from "../src/config/defaultHardware";
import {
  HIGH,
  INPUT_PULLUP,
  LOW,
  OUTPUT,
  SimulationEngine,
  normalizePin,
} from "../src/emulator/simulationState";

describe("SimulationEngine", () => {
  it("describes the D13 board LED and configured D4/D6 external LEDs", () => {
    expect(hardwareConfig.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "builtInYellowLed",
          pin: 13,
          color: "#ffd84d",
          placement: "board",
        }),
        expect.objectContaining({
          id: "externalGreenLed",
          pin: 4,
          color: "#35df8d",
          placement: "breadboard",
        }),
        expect.objectContaining({
          id: "externalRedLed",
          pin: 6,
          color: "#ff4f5e",
          placement: "breadboard",
        }),
      ]),
    );
  });

  it("normalizes equivalent digital and analog pin forms", () => {
    expect(normalizePin(2)).toBe("D2");
    expect(normalizePin("D2")).toBe("D2");
    expect(normalizePin(21)).toBe("A7");
    expect(normalizePin("A7")).toBe("A7");
  });

  it("tracks digital writes on the configured external green LED", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.pinMode(TEST_LED_PIN, OUTPUT);
    engine.digitalWrite(TEST_LED_PIN, HIGH);
    expect(engine.state.pins.D4).toMatchObject({ mode: OUTPUT, outputValue: HIGH });
    engine.digitalWrite(TEST_LED_PIN, LOW);
    expect(engine.state.pins.D4.outputValue).toBe(LOW);
  });

  it("reads live potentiometer values from A7", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.setInput("potentiometer", 723);
    expect(engine.analogRead("A7")).toBe(723);
    engine.setInput("potentiometer", 850);
    expect(engine.analogRead(21)).toBe(850);
  });

  it("reads the configured D2 toggle values and pull-up defaults", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.setInput("toggleSwitch", false);
    expect(engine.digitalRead(2)).toBe(LOW);
    engine.setInput("toggleSwitch", true);
    expect(engine.digitalRead("D2")).toBe(HIGH);
    engine.pinMode(7, INPUT_PULLUP);
    expect(engine.digitalRead(7)).toBe(HIGH);
  });

  it("supports PWM, simulated time, millis, and Arduino integer map", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.analogWrite(TEST_LED_PIN, 128);
    expect(engine.state.pins.D4).toMatchObject({ outputKind: "pwm", outputValue: 128 });
    engine.delay(1000);
    expect(engine.millis()).toBe(1000);
    expect(engine.map(512, 0, 1023, 0, 255)).toBe(127);
  });
});
