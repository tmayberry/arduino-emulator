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
    expect(engine.state.pins.D4).toMatchObject({
      mode: OUTPUT,
      outputValue: HIGH,
    });
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

  it("maps physical sensor ranges to the 10-bit analogRead range", () => {
    const config = {
      ...hardwareConfig,
      components: [
        ...hardwareConfig.components,
        {
          id: "thermometer",
          type: "sensor" as const,
          origin: "custom" as const,
          label: "Thermometer",
          pin: "A0" as const,
          rangeStart: -20,
          rangeEnd: 120,
          units: "°C",
          defaultValue: 50,
        },
      ],
    };
    const engine = new SimulationEngine(config);

    expect(engine.analogRead("A0")).toBe(512);
    engine.setInput("thermometer", -20);
    expect(engine.analogRead("A0")).toBe(0);
    engine.setInput("thermometer", 120);
    expect(engine.analogRead("A0")).toBe(1023);
    engine.setInput("thermometer", 190);
    expect(engine.analogRead("A0")).toBe(1023);
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

  it("tracks multiple configured inputs independently by component id", () => {
    const config = {
      ...hardwareConfig,
      components: [
        ...hardwareConfig.components,
        {
          id: "custom-toggle",
          type: "toggle-switch" as const,
          origin: "custom" as const,
          label: "Second Switch",
          pin: 8,
          onValue: 1 as const,
          offValue: 0 as const,
          defaultPosition: "off" as const,
        },
        {
          id: "custom-pot",
          type: "potentiometer" as const,
          origin: "custom" as const,
          label: "Second Potentiometer",
          pin: "A0" as const,
          min: 0,
          max: 1023,
          defaultValue: 512,
        },
      ],
    };
    const engine = new SimulationEngine(config);

    engine.setInput("toggleSwitch", false);
    engine.setInput("custom-toggle", true);
    engine.setInput("potentiometer", 111);
    engine.setInput("custom-pot", 777);

    expect(engine.digitalRead(2)).toBe(LOW);
    expect(engine.digitalRead(8)).toBe(HIGH);
    expect(engine.analogRead("A7")).toBe(111);
    expect(engine.analogRead("A0")).toBe(777);
  });

  it("supports PWM, simulated time, millis, micros, and Arduino integer map", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.analogWrite(TEST_LED_PIN, 128);
    expect(engine.state.pins.D4).toMatchObject({
      outputKind: "pwm",
      outputValue: 128,
    });
    engine.delay(1000);
    expect(engine.millis()).toBe(1000);
    expect(engine.micros()).toBe(1_000_000);
    expect(engine.map(512, 0, 1023, 0, 255)).toBe(127);
  });

  it("buffers UTF-8 serial input and exposes byte-oriented reads", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.enqueueSerialInput("Aé");
    expect(engine.serialAvailable()).toBe(3);
    expect(engine.serialPeek()).toBe(65);
    expect(engine.serialRead()).toBe(65);
    expect([engine.serialRead(), engine.serialRead()]).toEqual([195, 169]);
    expect(engine.serialRead()).toBe(-1);
    expect(engine.serialPeek()).toBe(-1);
  });

  it("provides bounded and reproducible seeded random values", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.randomSeed(12345);
    const first = [
      engine.random(100),
      engine.random(-10, 10),
      engine.random(100),
    ];
    engine.randomSeed(12345);
    expect([
      engine.random(100),
      engine.random(-10, 10),
      engine.random(100),
    ]).toEqual(first);
    expect(first[0]).toBeGreaterThanOrEqual(0);
    expect(first[0]).toBeLessThan(100);
    expect(first[1]).toBeGreaterThanOrEqual(-10);
    expect(first[1]).toBeLessThan(10);
    expect(engine.random(0)).toBe(0);
    expect(engine.random(7, 7)).toBe(7);
  });

  it("returns live accelerometer readings and falls back to neutral when stale", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.setAccelerometer({ x: 1.7, y: -2.2, z: 0.4 }, true, 10_000);
    expect(engine.accelerationAvailable()).toBe(1);
    expect(engine.readAcceleration(10_500)).toEqual({
      x: 1.7,
      y: -2.2,
      z: 0.4,
    });
    expect(engine.accelerationAvailable()).toBe(0);
    expect(engine.readAcceleration(11_001)).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("clamps accelerometer inputs to the Nano range", () => {
    const engine = new SimulationEngine(hardwareConfig);
    engine.setAccelerometer({ x: 7, y: -8, z: 2 }, true, 20_000);
    expect(engine.readAcceleration(20_000)).toEqual({ x: 4, y: -4, z: 2 });
  });
});
