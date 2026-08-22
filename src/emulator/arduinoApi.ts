import { SimulationEngine } from "./simulationState";

interface RuntimeValue {
  t: unknown;
  v: unknown;
  left?: boolean;
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
  isPrimitiveType(type: unknown): boolean;
  isTypeEqualTo(left: unknown, right: unknown): boolean;
  isStringType(value: unknown): boolean;
  getStringFromCharArray(value: RuntimeValue): string;
  makeCharArrayFromString(value: string): RuntimeValue;
  castable(sourceType: unknown, targetType: unknown): boolean;
  cast(targetType: unknown, value: RuntimeValue): RuntimeValue;
  clone(value: RuntimeValue, isInitializing?: boolean): RuntimeValue;
  defaultValue(type: unknown, left?: boolean): RuntimeValue;
  regOperator(
    callback: (
      runtime: JscppRuntime,
      thisValue: RuntimeValue,
      argument: RuntimeValue,
    ) => unknown,
    scope: unknown,
    name: string,
    argumentTypes: unknown[],
    returnType: unknown,
  ): void;
  regFunc(
    callback: (
      runtime: JscppRuntime,
      thisValue: RuntimeValue,
      ...args: RuntimeValue[]
    ) => unknown,
    scope: "global" | unknown,
    name: string,
    argumentTypes: unknown[],
    returnType: unknown,
  ): void;
  val(type: unknown, value: unknown, left?: boolean, isInitializing?: boolean): RuntimeValue;
}

export interface ArduinoIncludeModule {
  load(runtime: JscppRuntime): void;
}

interface ArduinoStringValue {
  members: {
    __data: RuntimeValue;
  };
}

function installGlobalZeroInitialization(rt: JscppRuntime): void {
  const originalDefaultValue = rt.defaultValue.bind(rt);

  rt.defaultValue = (type, left = false) => {
    if (rt.scope.length === 1 && rt.isPrimitiveType(type)) {
      return rt.val(type, 0, left, true);
    }
    return originalDefaultValue(type, left);
  };
}

interface InstalledArduinoString {
  type: unknown;
  create(text: string): RuntimeValue;
}

function installArduinoString(rt: JscppRuntime): InstalledArduinoString {
  const charPointer = rt.normalPointerType(rt.charTypeLiteral);
  const stringType = rt.newClass("String", [
    {
      name: "__data",
      type: charPointer,
      initialize: (runtime: JscppRuntime) => runtime.makeCharArrayFromString(""),
    },
  ]);

  const stringValue = (value: RuntimeValue): ArduinoStringValue =>
    value.v as ArduinoStringValue;
  const textOfString = (value: RuntimeValue): string =>
    rt.getStringFromCharArray(stringValue(value).members.__data);
  const newString = (text: string): RuntimeValue =>
    rt.val(stringType, {
      members: { __data: rt.makeCharArrayFromString(text) },
    } satisfies ArduinoStringValue);
  const setString = (value: RuntimeValue, text: string): void => {
    stringValue(value).members.__data = rt.makeCharArrayFromString(text);
  };

  const numericTypes = [
    rt.intTypeLiteral,
    rt.unsignedintTypeLiteral,
    rt.longTypeLiteral,
    rt.floatTypeLiteral,
    rt.doubleTypeLiteral,
  ];
  const convertibleTypes = [
    stringType,
    charPointer,
    ...numericTypes,
    rt.charTypeLiteral,
    rt.boolTypeLiteral,
  ];
  const isType = (actual: unknown, expected: unknown): boolean =>
    rt.isTypeEqualTo(actual, expected);
  const isConvertibleType = (type: unknown): boolean =>
    convertibleTypes.some((candidate) => isType(type, candidate));
  const textOf = (value: RuntimeValue): string => {
    if (isType(value.t, stringType)) return textOfString(value);
    if (rt.isStringType(value)) return rt.getStringFromCharArray(value);
    if (isType(value.t, rt.charTypeLiteral)) {
      return String.fromCharCode(Number(value.v));
    }
    if (isType(value.t, rt.boolTypeLiteral)) return Number(value.v) === 0 ? "0" : "1";
    if (
      isType(value.t, rt.floatTypeLiteral) ||
      isType(value.t, rt.doubleTypeLiteral)
    ) {
      return Number(value.v).toFixed(2);
    }
    return String(Number(value.v));
  };

  // JSCPP does not implement class conversions. Arduino String relies on them
  // for declarations such as `String message = "ready"`, so add the narrow
  // conversion and copy behavior needed by this compatibility class.
  const originalCastable = rt.castable.bind(rt);
  rt.castable = (sourceType, targetType) =>
    (isType(targetType, stringType) && isConvertibleType(sourceType)) ||
    originalCastable(sourceType, targetType);

  const originalCast = rt.cast.bind(rt);
  rt.cast = (targetType, value) => {
    if (isType(targetType, stringType) && isConvertibleType(value.t)) {
      return isType(value.t, stringType) ? value : newString(textOf(value));
    }
    return originalCast(targetType, value);
  };

  const originalClone = rt.clone.bind(rt);
  rt.clone = (value, isInitializing) =>
    isType(value.t, stringType)
      ? newString(textOfString(value))
      : originalClone(value, isInitializing);

  const requireLeftValue = (value: RuntimeValue): void => {
    if (!value.left) throw new Error("String assignment target is not a variable");
  };
  const registerForConvertibleTypes = (
    operator: string,
    callback: (
      runtime: JscppRuntime,
      left: RuntimeValue,
      right: RuntimeValue,
    ) => RuntimeValue,
    returnType: unknown,
  ) => {
    for (const argumentType of convertibleTypes) {
      rt.regOperator(callback, stringType, operator, [argumentType], returnType);
    }
  };

  registerForConvertibleTypes(
    "+",
    (_runtime, left, right) => newString(textOfString(left) + textOf(right)),
    stringType,
  );
  registerForConvertibleTypes(
    "+=",
    (_runtime, left, right) => {
      requireLeftValue(left);
      setString(left, textOfString(left) + textOf(right));
      return left;
    },
    stringType,
  );
  registerForConvertibleTypes(
    "=",
    (_runtime, left, right) => {
      requireLeftValue(left);
      setString(left, textOf(right));
      return left;
    },
    stringType,
  );

  for (const argumentType of [stringType, charPointer]) {
    rt.regOperator((_runtime, left, right) =>
      rt.val(rt.boolTypeLiteral, textOfString(left) === textOf(right)),
    stringType, "==", [argumentType], rt.boolTypeLiteral);
    rt.regOperator((_runtime, left, right) =>
      rt.val(rt.boolTypeLiteral, textOfString(left) !== textOf(right)),
    stringType, "!=", [argumentType], rt.boolTypeLiteral);
  }

  rt.regFunc((_runtime, value) =>
    rt.val(rt.unsignedintTypeLiteral, textOfString(value).length),
  stringType, "length", [], rt.unsignedintTypeLiteral);
  for (const indexType of [rt.intTypeLiteral, rt.unsignedintTypeLiteral]) {
    rt.regFunc((_runtime, value, index) => {
      const character = textOfString(value).charCodeAt(Number(index.v));
      return rt.val(rt.charTypeLiteral, Number.isNaN(character) ? 0 : character);
    }, stringType, "charAt", [indexType], rt.charTypeLiteral);
  }
  rt.regFunc((_runtime, value) =>
    rt.makeCharArrayFromString(textOfString(value)),
  stringType, "c_str", [], charPointer);

  return { type: stringType, create: newString };
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
      installGlobalZeroInitialization(rt);
      const arduinoString = installArduinoString(rt);
      const stringType = arduinoString.type;

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
      rt.regFunc((runtime) => runtime.val(long, engine.micros()), "global", "micros", [], long);

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

      // JSCPP's global overload resolver crashes when overloads have different
      // arities, so model Arduino's one- and two-argument forms as one vararg.
      rt.regFunc((runtime, _this, first, second) =>
        runtime.val(
          long,
          second === undefined
            ? engine.random(numberValue(first))
            : engine.random(numberValue(first), numberValue(second)),
        ),
      "global", "random", [int, "?"], long);
      rt.regFunc((_runtime, _this, seed) => {
        engine.randomSeed(numberValue(seed));
      }, "global", "randomSeed", [long], voidType);

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

      let serialTimeoutMs = 1_000;
      const serialActivity = (): void => onHardwareActivity();
      const timeoutIfEmpty = (): void => {
        if (engine.serialAvailable() === 0) engine.delay(serialTimeoutMs);
      };

      rt.regFunc((runtime) => {
        serialActivity();
        return runtime.val(int, engine.serialAvailable());
      }, serialType, "available", [], int);
      rt.regFunc((runtime) => {
        serialActivity();
        return runtime.val(int, engine.serialRead());
      }, serialType, "read", [], int);
      rt.regFunc((runtime) => {
        serialActivity();
        return runtime.val(int, engine.serialPeek());
      }, serialType, "peek", [], int);
      rt.regFunc((_runtime, _this, timeout) => {
        serialTimeoutMs = Math.max(0, Math.trunc(numberValue(timeout)));
        serialActivity();
      }, serialType, "setTimeout", [long], voidType);

      const isDigit = (value: number): boolean => value >= 48 && value <= 57;
      const seekNumber = (allowDecimal: boolean): number => {
        while (engine.serialAvailable() > 0) {
          const value = engine.serialPeek();
          if (value === 45 || isDigit(value) || (allowDecimal && value === 46)) {
            return value;
          }
          engine.serialRead();
        }
        return -1;
      };
      const parseNumber = (allowDecimal: boolean): number => {
        let value = 0;
        let negative = false;
        let fraction = 1;
        let inFraction = false;
        let firstCharacter = true;

        if (seekNumber(allowDecimal) < 0) {
          timeoutIfEmpty();
          return 0;
        }

        while (engine.serialAvailable() > 0) {
          const next = engine.serialPeek();
          if (next === 45 && firstCharacter) {
            negative = true;
          } else if (allowDecimal && next === 46 && !inFraction) {
            inFraction = true;
          } else if (isDigit(next)) {
            value = value * 10 + next - 48;
            if (inFraction) fraction *= 0.1;
          } else {
            break;
          }
          engine.serialRead();
          firstCharacter = false;
        }
        timeoutIfEmpty();
        const parsed = inFraction ? value * fraction : value;
        return negative ? -parsed : parsed;
      };

      rt.regFunc((runtime) => {
        serialActivity();
        return runtime.val(long, Math.trunc(parseNumber(false)));
      }, serialType, "parseInt", [], long);
      rt.regFunc((runtime) => {
        serialActivity();
        return runtime.val(rt.floatTypeLiteral, parseNumber(true));
      }, serialType, "parseFloat", [], rt.floatTypeLiteral);

      const readString = (terminator?: number): string => {
        const bytes: number[] = [];
        let foundTerminator = false;
        while (engine.serialAvailable() > 0) {
          const value = engine.serialRead();
          if (terminator !== undefined && value === terminator) {
            foundTerminator = true;
            break;
          }
          bytes.push(value);
        }
        if (!foundTerminator && engine.serialAvailable() === 0) {
          engine.delay(serialTimeoutMs);
        }
        return new TextDecoder().decode(new Uint8Array(bytes));
      };

      rt.regFunc((_runtime) => {
        serialActivity();
        return arduinoString.create(readString());
      }, serialType, "readString", [], stringType);
      rt.regFunc((_runtime, _this, terminator) => {
        serialActivity();
        return arduinoString.create(readString(numberValue(terminator)));
      }, serialType, "readStringUntil", [rt.charTypeLiteral], stringType);

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
      registerSerialOverload(stringType, (value) =>
        rt.getStringFromCharArray(
          (value.v as ArduinoStringValue).members.__data,
        ));

      rt.regFunc(() => writeSerial("", true), serialType, "println", [], int);
    },
  };
}

export function createImuInclude(
  engine: SimulationEngine,
  onHardwareActivity: () => void,
): ArduinoIncludeModule {
  return {
    load(rt) {
      const int = rt.intTypeLiteral;
      const float = rt.floatTypeLiteral;
      const imuType = rt.newClass("BoschSensorClass", []);

      rt.scope[0].variables.IMU = {
        t: imuType,
        v: { members: {} },
        left: false,
      };

      rt.regFunc((runtime) => {
        onHardwareActivity();
        return runtime.val(int, 1);
      }, imuType, "begin", [], int);

      rt.regFunc((runtime) => {
        onHardwareActivity();
        return runtime.val(int, engine.accelerationAvailable());
      }, imuType, "accelerationAvailable", [], int);

      rt.regFunc((runtime, _this, x, y, z) => {
        const reading = engine.readAcceleration();
        x.v = reading.x;
        y.v = reading.y;
        z.v = reading.z;
        onHardwareActivity();
        return runtime.val(int, 1);
      }, imuType, "readAcceleration", [float, float, float], int);
    },
  };
}
