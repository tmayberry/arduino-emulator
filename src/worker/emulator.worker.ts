/// <reference lib="webworker" />

import { hardwareConfig } from "../config/defaultHardware";
import { createArduinoInclude, createImuInclude } from "../emulator/arduinoApi";
import { normalizeDiagnosticMessage } from "../emulator/errorFormatting";
import { runRestrictedJscpp } from "../emulator/jscppRuntime";
import {
  isRunaway,
  MAX_SLICE_MS,
  nextSchedulerDelay,
  realTimeWaitMs,
} from "../emulator/scheduler";
import { SimulationEngine } from "../emulator/simulationState";
import { toStudentLine, wrapArduinoSource } from "../emulator/sourceWrapper";
import type {
  WorkerInputs,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from "../emulator/workerProtocol";

interface DebuggerInstance {
  done: boolean;
  next(): false | { v: number };
}

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
let engine: SimulationEngine | null = null;
let interpreter: DebuggerInstance | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let wallStartTime = 0;
let instructionsWithoutActivity = 0;
let activityVersion = 0;
let currentRun = 0;
let currentPrefixLineCount = 0;
let currentSourceLineCount = 0;
let serialBuffer = "";
let serialOutputLength = 0;

const MAX_SERIAL_OUTPUT_LENGTH = 100_000;

function post(message: WorkerToUiMessage): void {
  workerScope.postMessage(message);
}

function queueSerialOutput(text: string): void {
  if (serialOutputLength + text.length > MAX_SERIAL_OUTPUT_LENGTH) {
    throw new Error(
      "Program stopped: Serial output exceeded 100,000 characters. Add a delay or print less often.",
    );
  }
  serialBuffer += text;
  serialOutputLength += text.length;
}

function flushSerialOutput(): void {
  if (!serialBuffer) return;
  post({ type: "serial-output", text: serialBuffer });
  serialBuffer = "";
}

function clearScheduledSlice(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function formatError(
  error: unknown,
  prefixLineCount: number,
  sourceLineCount: number,
): { message: string; line?: number } {
  const technical = normalizeDiagnosticMessage(
    error instanceof Error ? error.message : String(error),
  );
  const lineMatch = technical.match(/(?:line|Line)\s*(?:=|:)?\s*(\d+)/);
  const wrappedLine = lineMatch ? Number(lineMatch[1]) : undefined;
  const line = toStudentLine(wrappedLine, prefixLineCount, sourceLineCount);

  let message = technical
    .replace(/^ERROR:\s*/i, "")
    .replace(/^Parsing Failure:\s*/i, "")
    .replace(/\s+at\s+.*$/s, "")
    .trim();

  if (/not implemented|not supported|unknown type|unknown specifier/i.test(message)) {
    message =
      "This emulator supports the Arduino/C++ features currently implemented, but this particular C++ feature is not yet supported.";
  } else if (message.length > 2_000) {
    message = message.slice(0, 1_997) + "…";
  }

  return { message: message || "The sketch could not be run.", line };
}

function stopRun(reason?: string): void {
  clearScheduledSlice();
  flushSerialOutput();
  interpreter = null;
  if (engine) engine.state.running = false;
  post({ type: "stopped", reason });
}

function scheduleSlice(runId: number): void {
  if (!engine || !interpreter || runId !== currentRun) return;
  const elapsed = performance.now() - wallStartTime;
  const wait = realTimeWaitMs(engine.state.virtualTimeMs, elapsed);
  timer = setTimeout(() => runSlice(runId), nextSchedulerDelay(wait));
}

function runSlice(runId: number): void {
  timer = null;
  if (!engine || !interpreter || runId !== currentRun) return;

  const wallElapsed = performance.now() - wallStartTime;
  if (engine.state.virtualTimeMs > wallElapsed) {
    scheduleSlice(runId);
    return;
  }

  const sliceStart = performance.now();

  try {
    while (!interpreter.done) {
      const activityBefore = activityVersion;
      const virtualTimeBefore = engine.state.virtualTimeMs;
      interpreter.next();
      instructionsWithoutActivity += 1;

      if (
        activityVersion !== activityBefore ||
        engine.state.virtualTimeMs !== virtualTimeBefore
      ) {
        instructionsWithoutActivity = 0;
      }

      if (isRunaway(instructionsWithoutActivity)) {
        flushSerialOutput();
        post({
          type: "error",
          message: "Program stopped: your code appears to be stuck in a loop.",
        });
        stopRun("Runaway loop detected");
        return;
      }

      if (
        engine.state.virtualTimeMs > performance.now() - wallStartTime ||
        performance.now() - sliceStart >= MAX_SLICE_MS
      ) {
        break;
      }
    }

    if (interpreter.done) {
      stopRun("Program finished");
      return;
    }

    flushSerialOutput();
    scheduleSlice(runId);
  } catch (error) {
    flushSerialOutput();
    console.error("JSCPP execution error", error);
    const formatted = formatError(error, currentPrefixLineCount, currentSourceLineCount);
    post({ type: "error", ...formatted });
    stopRun("Execution error");
  }
}

function start(source: string, inputs: WorkerInputs): void {
  clearScheduledSlice();
  currentRun += 1;
  const runId = currentRun;
  instructionsWithoutActivity = 0;
  activityVersion = 0;
  serialBuffer = "";
  serialOutputLength = 0;

  engine = new SimulationEngine(hardwareConfig, inputs, (event) => post(event));
  engine.state.running = true;
  const wrapped = wrapArduinoSource(source, hardwareConfig);
  currentPrefixLineCount = wrapped.prefixLineCount;
  currentSourceLineCount = source.split("\n").length;

  try {
    const arduinoInclude = createArduinoInclude(
      engine,
      () => {
        activityVersion += 1;
      },
      queueSerialOutput,
    );
    const imuInclude = createImuInclude(engine, () => {
      activityVersion += 1;
    });
    const result = runRestrictedJscpp(
      wrapped.code,
      arduinoInclude,
      { debug: true },
      { "Arduino_BMI270_BMM150.h": imuInclude },
    );
    interpreter = result as DebuggerInstance;
    wallStartTime = performance.now();
    post({ type: "running" });
    scheduleSlice(runId);
  } catch (error) {
    console.error("JSCPP startup error", error);
    const formatted = formatError(
      error,
      wrapped.prefixLineCount,
      currentSourceLineCount,
    );
    post({ type: "error", ...formatted });
    stopRun("Unable to start");
  }
}

workerScope.onmessage = (event: MessageEvent<UiToWorkerMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "start":
      start(message.source, message.inputs);
      break;
    case "input-change":
      engine?.setInput(message.component, message.value);
      break;
    case "accelerometer-change":
      engine?.setAccelerometer(
        message.reading,
        message.connected,
        message.updatedAtMs,
      );
      break;
    case "serial-input":
      engine?.enqueueSerialInput(message.text);
      break;
    case "stop":
      currentRun += 1;
      stopRun("Stopped by user");
      break;
    case "reset":
      currentRun += 1;
      clearScheduledSlice();
      engine = null;
      interpreter = null;
      instructionsWithoutActivity = 0;
      post({ type: "stopped", reason: "Reset" });
      break;
  }
};

export {};
