import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleStop,
  Code2,
  Gauge,
  Play,
  RotateCcw,
  TerminalSquare,
  Zap,
} from "lucide-react";
import {
  defaultHardware,
  HARDWARE_STORAGE_KEY,
  isDefaultHardware,
  loadHardwareConfig,
} from "./config/hardwareSetup";
import type { HardwareConfig } from "./config/types";
import { STARTER_SKETCH } from "./config/starterSketch";
import { createInitialSimulationState } from "./emulator/simulationState";
import type {
  AccelerometerReading,
  UiToWorkerMessage,
  WorkerToUiMessage,
} from "./emulator/workerProtocol";
import { isWorkerMessage } from "./emulator/workerProtocol";
import { CodeEditor } from "./ui/CodeEditor";
import { BoardSetupDialog } from "./ui/BoardSetupDialog";
import { HardwareView, type PinOutput } from "./ui/HardwareView";
import { SerialMonitor } from "./ui/SerialMonitor";
import { StatusPanel, type RunStatus } from "./ui/StatusPanel";

const STORAGE_KEY = "arduino-emulator.code.v1";
const MAX_SERIAL_MONITOR_LENGTH = 100_000;
type WorkspaceSection = "code" | "hardware" | "serial";

function loadSavedSketch(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? STARTER_SKETCH;
  } catch {
    return STARTER_SKETCH;
  }
}

function makeWorker(): Worker {
  return new Worker(new URL("./worker/emulator.worker.ts", import.meta.url), {
    type: "module",
    name: "arduino-emulator",
  });
}

export default function App() {
  const [hardwareConfig, setHardwareConfig] = useState(() =>
    loadHardwareConfig(window.localStorage),
  );
  const [initialState] = useState(() =>
    createInitialSimulationState(hardwareConfig),
  );
  const [source, setSource] = useState(loadSavedSketch);
  const [status, setStatus] = useState<RunStatus>("ready");
  const [statusMessage, setStatusMessage] = useState(
    "Edit the sketch, then press Run.",
  );
  const [errorLine, setErrorLine] = useState<number>();
  const [virtualTimeMs, setVirtualTimeMs] = useState(0);
  const [serialOutput, setSerialOutput] = useState("");
  const [pinOutputs, setPinOutputs] = useState<Record<string, PinOutput>>({});
  const [componentInputs, setComponentInputs] = useState(
    initialState.inputs.components,
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("code");
  const [accelerometer, setAccelerometer] = useState<AccelerometerReading>({
    x: initialState.inputs.accelerometer.x,
    y: initialState.inputs.accelerometer.y,
    z: initialState.inputs.accelerometer.z,
  });
  const [accelerometerConnected, setAccelerometerConnected] = useState(false);
  const accelerometerUpdatedAtRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const runtimeErrorRef = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, source);
      } catch {
        // The editor remains fully usable when storage is unavailable.
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [source]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const handleWorkerMessage = useCallback(
    (message: WorkerToUiMessage) => {
      switch (message.type) {
        case "running":
          setStatus("running");
          setStatusMessage(
            "Sketch is running. Inputs stay live while it executes.",
          );
          break;
        case "pin-change":
          setPinOutputs((current) => ({
            ...current,
            [message.pin]: { kind: "digital", value: message.value },
          }));
          break;
        case "pwm-change":
          setPinOutputs((current) => ({
            ...current,
            [message.pin]: { kind: "pwm", value: message.value },
          }));
          break;
        case "time-change":
          setVirtualTimeMs(message.virtualTimeMs);
          break;
        case "serial-output":
          setSerialOutput((current) =>
            `${current}${message.text}`.slice(-MAX_SERIAL_MONITOR_LENGTH),
          );
          break;
        case "error":
          runtimeErrorRef.current = true;
          setStatus("error");
          setStatusMessage(message.message);
          setErrorLine(message.line);
          break;
        case "stopped":
          if (!runtimeErrorRef.current) {
            setStatus("stopped");
            setStatusMessage(message.reason ?? "Sketch stopped.");
          }
          terminateWorker();
          break;
      }
    },
    [terminateWorker],
  );

  const run = useCallback(() => {
    terminateWorker();
    runtimeErrorRef.current = false;
    setErrorLine(undefined);
    setVirtualTimeMs(0);
    setSerialOutput("");
    setStatus("starting");
    setStatusMessage("Preparing your sketch…");

    const worker = makeWorker();
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (isWorkerMessage(event.data)) handleWorkerMessage(event.data);
    };
    worker.onerror = (event) => {
      console.error("Emulator worker error", event);
      runtimeErrorRef.current = true;
      setStatus("error");
      setStatusMessage(
        "The emulator worker stopped unexpectedly. Check the sketch and try again.",
      );
      terminateWorker();
    };

    const message: UiToWorkerMessage = {
      type: "start",
      source,
      config: hardwareConfig,
      inputs: {
        components: componentInputs,
        accelerometer: {
          ...accelerometer,
          connected: accelerometerConnected,
          updatedAtMs: accelerometerUpdatedAtRef.current,
        },
      },
    };
    worker.postMessage(message);
  }, [
    accelerometer,
    accelerometerConnected,
    componentInputs,
    handleWorkerMessage,
    hardwareConfig,
    source,
    terminateWorker,
  ]);

  const stop = useCallback(() => {
    terminateWorker();
    runtimeErrorRef.current = false;
    setStatus("stopped");
    setStatusMessage(
      "Sketch stopped. Hardware state is preserved until Reset.",
    );
    setErrorLine(undefined);
  }, [terminateWorker]);

  const reset = useCallback(() => {
    terminateWorker();
    const defaultConfig = defaultHardware();
    const fresh = createInitialSimulationState(defaultConfig);
    runtimeErrorRef.current = false;
    setHardwareConfig(defaultConfig);
    setPinOutputs({});
    setComponentInputs(fresh.inputs.components);
    setAccelerometer({
      x: fresh.inputs.accelerometer.x,
      y: fresh.inputs.accelerometer.y,
      z: fresh.inputs.accelerometer.z,
    });
    setAccelerometerConnected(false);
    accelerometerUpdatedAtRef.current = 0;
    setVirtualTimeMs(0);
    setSerialOutput("");
    setStatus("ready");
    setStatusMessage(
      "Hardware and board setup reset to defaults. Your sketch is unchanged.",
    );
    setErrorLine(undefined);
    setSetupOpen(false);
    try {
      localStorage.removeItem(HARDWARE_STORAGE_KEY);
    } catch {
      // Reset still succeeds when storage is unavailable.
    }
  }, [terminateWorker]);

  const resetBoard = useCallback(() => {
    terminateWorker();
    const fresh = createInitialSimulationState(hardwareConfig);
    runtimeErrorRef.current = false;
    setPinOutputs({});
    setComponentInputs(fresh.inputs.components);
    setAccelerometer({
      x: fresh.inputs.accelerometer.x,
      y: fresh.inputs.accelerometer.y,
      z: fresh.inputs.accelerometer.z,
    });
    setAccelerometerConnected(false);
    accelerometerUpdatedAtRef.current = 0;
    setVirtualTimeMs(0);
    setSerialOutput("");
    setStatus("ready");
    setStatusMessage(
      "Board reset. Your configured devices and pins were kept.",
    );
    setErrorLine(undefined);
  }, [hardwareConfig, terminateWorker]);

  const sendInput = useCallback((message: UiToWorkerMessage) => {
    workerRef.current?.postMessage(message);
  }, []);

  const changeInput = (componentId: string, value: number | boolean) => {
    setComponentInputs((current) => ({ ...current, [componentId]: value }));
    sendInput({ type: "input-change", componentId, value });
  };

  const applyHardwareSetup = (config: HardwareConfig) => {
    terminateWorker();
    const fresh = createInitialSimulationState(config);
    runtimeErrorRef.current = false;
    setHardwareConfig(config);
    setComponentInputs(fresh.inputs.components);
    setAccelerometer({
      x: fresh.inputs.accelerometer.x,
      y: fresh.inputs.accelerometer.y,
      z: fresh.inputs.accelerometer.z,
    });
    setAccelerometerConnected(false);
    accelerometerUpdatedAtRef.current = 0;
    setPinOutputs({});
    setVirtualTimeMs(0);
    setSerialOutput("");
    setStatus("ready");
    setStatusMessage(
      "Board setup updated. Run the sketch to use the new pins.",
    );
    setErrorLine(undefined);
    setSetupOpen(false);
    try {
      if (isDefaultHardware(config)) {
        localStorage.removeItem(HARDWARE_STORAGE_KEY);
      } else {
        localStorage.setItem(HARDWARE_STORAGE_KEY, JSON.stringify(config));
      }
    } catch {
      // The active setup remains usable when persistence is unavailable.
    }
  };

  const changeAccelerometer = useCallback(
    (
      reading: AccelerometerReading,
      connected: boolean,
      updatedAtMs: number,
    ) => {
      setAccelerometer(reading);
      setAccelerometerConnected(connected);
      accelerometerUpdatedAtRef.current = updatedAtMs;
      sendInput({
        type: "accelerometer-change",
        reading,
        connected,
        updatedAtMs,
      });
    },
    [sendInput],
  );

  const restoreStarter = () => {
    if (
      source === STARTER_SKETCH ||
      window.confirm("Replace the editor contents with the starter sketch?")
    ) {
      setSource(STARTER_SKETCH);
    }
  };

  const isActive = status === "running" || status === "starting";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Zap size={19} fill="currentColor" aria-hidden="true" />
          </span>
          <div>
            <h1>Arduino Emulator</h1>
          </div>
        </div>
        <StatusPanel
          status={status}
          message={statusMessage}
          line={errorLine}
          virtualTimeMs={virtualTimeMs}
        />
        <div className="run-controls" aria-label="Simulation controls">
          <button
            className="control-button run-button"
            type="button"
            onClick={run}
            disabled={isActive}
          >
            <Play size={16} fill="currentColor" aria-hidden="true" />
            Run
          </button>
          <button
            className="control-button stop-button"
            type="button"
            onClick={stop}
            disabled={!isActive}
          >
            <CircleStop size={16} aria-hidden="true" />
            Stop
          </button>
          <button
            className="control-button reset-button"
            type="button"
            onClick={reset}
            title="Stop the sketch, clear hardware state, and restore the default board setup"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reset all
          </button>
        </div>
      </header>

      <nav className="mobile-section-nav" aria-label="Workspace sections">
        <button
          type="button"
          aria-pressed={activeSection === "code"}
          onClick={() => setActiveSection("code")}
        >
          <Code2 size={16} aria-hidden="true" /> Code
        </button>
        <button
          type="button"
          aria-pressed={activeSection === "hardware"}
          onClick={() => setActiveSection("hardware")}
        >
          <Gauge size={16} aria-hidden="true" /> Hardware
        </button>
        <button
          type="button"
          aria-pressed={activeSection === "serial"}
          onClick={() => setActiveSection("serial")}
        >
          <TerminalSquare size={16} aria-hidden="true" /> Serial
        </button>
      </nav>

      <div className="workspace">
        <div className="editor-column">
          <div
            className={`mobile-pane code-pane${activeSection === "code" ? " mobile-pane-active" : ""}`}
          >
            <CodeEditor
              value={source}
              onChange={setSource}
              onRestore={restoreStarter}
            />
          </div>
          <div
            className={`mobile-pane serial-pane${activeSection === "serial" ? " mobile-pane-active" : ""}`}
          >
            <SerialMonitor
              output={serialOutput}
              inputEnabled={isActive}
              forceExpanded={activeSection === "serial"}
              onClear={() => setSerialOutput("")}
              onSend={(text) => sendInput({ type: "serial-input", text })}
            />
          </div>
        </div>
        <div
          className={`mobile-pane hardware-pane${activeSection === "hardware" ? " mobile-pane-active" : ""}`}
        >
          <HardwareView
            config={hardwareConfig}
            pinOutputs={pinOutputs}
            componentInputs={componentInputs}
            accelerometer={accelerometer}
            accelerometerConnected={accelerometerConnected}
            onInputChange={changeInput}
            onAccelerometerChange={changeAccelerometer}
            onReset={resetBoard}
            onConfigure={() => setSetupOpen(true)}
          />
        </div>
      </div>
      {setupOpen && (
        <BoardSetupDialog
          config={hardwareConfig}
          onApply={applyHardwareSetup}
          onClose={() => setSetupOpen(false)}
        />
      )}
    </main>
  );
}
