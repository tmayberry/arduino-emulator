import type { HardwareConfig } from "./types";

/** The starter sketch blinks the external green LED. */
export const TEST_LED_PIN = 4;

export const hardwareConfig = {
  id: "default-hardware",
  name: "Default Hardware",
  board: {
    type: "arduino-nano-33-ble",
    label: "Arduino Nano 33 BLE Sense Rev2",
  },
  testLedPin: TEST_LED_PIN,
  builtInLedPin: 13,
  components: [
    {
      id: "builtInYellowLed",
      type: "led",
      label: "Built-in Yellow LED",
      pin: 13,
      activeHigh: true,
      color: "#ffd84d",
      placement: "board",
    },
    {
      id: "externalGreenLed",
      type: "led",
      label: "Green LED",
      pin: 4,
      activeHigh: true,
      color: "#35df8d",
      placement: "breadboard",
    },
    {
      id: "externalRedLed",
      type: "led",
      label: "Red LED",
      pin: 6,
      activeHigh: true,
      color: "#ff4f5e",
      placement: "breadboard",
    },
    {
      id: "potentiometer",
      type: "potentiometer",
      label: "Potentiometer",
      pin: "A7",
      min: 0,
      max: 1023,
      defaultValue: 512,
    },
    {
      id: "toggleSwitch",
      type: "toggle-switch",
      label: "Toggle Switch",
      pin: 2,
      onValue: 1,
      offValue: 0,
      defaultPosition: "off",
    },
    {
      id: "boardReset",
      type: "reset-button",
      label: "Board Reset",
      placement: "board",
    },
  ],
} satisfies HardwareConfig;
