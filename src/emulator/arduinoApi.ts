import { SimulationEngine } from "./simulationState";

interface RuntimeValue {
  t: unknown;
  v: unknown;
}

interface JscppRuntime {
  intTypeLiteral: unknown;
  unsignedintTypeLiteral: unknown;
  longTypeLiteral: unknown;
  floatTypeLiteral: unknown;
  doubleTypeLiteral: unknown;
  charTypeLiteral: unknown;
  boolTypeLiteral: unknown;
  voidTypeLiteral: unknown;
  scope: Array<{ variables: Record<string, unknown> }>;
  newClass(name: string, members: unknown[]): unknown;
  normalPointerType(type: unknown): unknown;
  getStringFromCharArray(value: RuntimeValue): string;
  regFunc(
    callback: (
      runtime: JscppRuntime,
      thisValue: unknown,
      ...args: RuntimeValue[]
    ) => unknown,
    scope: "global" | unknown,
    name: string,
    argumentTypes: unknown[],
    returnType: unknown,
  ): void;
  val(type: unknown, value: number): unknown;
}

export interface ArduinoIncludeModule {
  load(runtime: JscppRuntime): void;
}

export function createArduinoInclude(
  engine: SimulationEngine,
  onHardwareActivity: () => void,
  onSerialOutput: (text: string) => void = () => undefined,
): ArduinoIncludeModule {
  return {
    load(rt) {
      const int = rt.intTypeLiteral;
      const long = rt.longTypeLiteral;
      const voidType = rt.voidTypeLiteral;

      const numberValue = (value: RuntimeValue): number => Number(value.v);

      rt.regFunc((_rt, _this, pin, mode) => {
        engine.pinMode(numberValue(pin), numberValue(mode));
        onHardwareActivity();
      }, "global", "pinMode", [int, int], voidType);

      rt.regFunc((_rt, _this, pin, value) => {
        engine.digitalWrite(numberValue(pin), numberValue(value));
        onHardwareActivity();
      }, "global", "digitalWrite", [int, int], voidType);

      rt.regFunc((runtime, _this, pin) => {
        onHardwareActivity();
        return runtime.val(int, engine.digitalRead(numberValue(pin)));
      }, "global", "digitalRead", [int], int);

      rt.regFunc((runtime, _this, pin) => {
        onHardwareActivity();
        return runtime.val(int, engine.analogRead(numberValue(pin)));
      }, "global", "analogRead", [int], int);

      rt.regFunc((_rt, _this, pin, value) => {
        engine.analogWrite(numberValue(pin), numberValue(value));
        onHardwareActivity();
      }, "global", "analogWrite", [int, int], voidType);

      rt.regFunc((_rt, _this, milliseconds) => {
        engine.delay(numberValue(milliseconds));
        onHardwareActivity();
      }, "global", "delay", [long], voidType);

      rt.regFunc((runtime) => runtime.val(long, engine.millis()), "global", "millis", [], long);

      rt.regFunc((runtime, _this, value, fromLow, fromHigh, toLow, toHigh) =>
        runtime.val(
          long,
          engine.map(
            numberValue(value),
            numberValue(fromLow),
            numberValue(fromHigh),
            numberValue(toLow),
            numberValue(toHigh),
          ),
        ), "global", "map", [long, long, long, long, long], long);

      const serialType = rt.newClass("HardwareSerial", []);
      rt.scope[0].variables.Serial = {
        t: serialType,
        v: { members: {} },
        left: false,
      };

      const begin = () => {
        onHardwareActivity();
      };
      rt.regFunc(begin, serialType, "begin", [long], voidType);

      const writeSerial = (text: string, newline: boolean): unknown => {
        const output = newline ? `${text}\n` : text;
        onSerialOutput(output);
        onHardwareActivity();
        return rt.val(int, output.length);
      };

      const registerSerialOverload = (
        argumentType: unknown,
        format: (value: RuntimeValue) => string,
      ) => {
        rt.regFunc((_runtime, _this, value) => writeSerial(format(value), false),
          serialType, "print", [argumentType], int);
        rt.regFunc((_runtime, _this, value) => writeSerial(format(value), true),
          serialType, "println", [argumentType], int);
      };

      registerSerialOverload(int, (value) => String(numberValue(value)));
      registerSerialOverload(rt.unsignedintTypeLiteral, (value) => String(numberValue(value)));
      registerSerialOverload(long, (value) => String(numberValue(value)));
      registerSerialOverload(rt.floatTypeLiteral, (value) => numberValue(value).toFixed(2));
      registerSerialOverload(rt.doubleTypeLiteral, (value) => numberValue(value).toFixed(2));
      registerSerialOverload(rt.charTypeLiteral, (value) =>
        String.fromCharCode(numberValue(value)));
      registerSerialOverload(rt.boolTypeLiteral, (value) =>
        numberValue(value) === 0 ? "0" : "1");
      registerSerialOverload(rt.normalPointerType(rt.charTypeLiteral), (value) =>
        rt.getStringFromCharArray(value));

      rt.regFunc(() => writeSerial("", true), serialType, "println", [], int);
    },
  };
}
