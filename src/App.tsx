import { useCallback, useEffect, useRef, useState } from "react";
import { CircleStop, Play, RotateCcw, Zap } from "lucide-react";
import { hardwareConfig } from "./config/defaultHardware";
import { STARTER_SKETCH } from "./config/starterSketch";
import { createInitialSimulationState } from "./emulator/simulationState";
import type {
  UiToWorkerMessage,
  WorkerToUiMessage,
} from "./emulator/workerProtocol";
import { isWorkerMessage } from "./emulator/workerProtocol";
import { CodeEditor } from "./ui/CodeEditor";
import { HardwareView, type PinOutput } from "./ui/HardwareView";
import { SerialMonitor } from "./ui/SerialMonitor";
import { StatusPanel, type RunStatus } from "./ui/StatusPanel";

const STORAGE_KEY = "arduino-emulator.code.v1";
const MAX_SERIAL_MONITOR_LENGTH = 100_000;

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
  const initialState = useRef(createInitialSimulationState(hardwareConfig));
  const [source, setSource] = useState(loadSavedSketch);
  const [status, setStatus] = useState<RunStatus>("ready");
  const [statusMessage, setStatusMessage] = useState("Edit the sketch, then press Run.");
  const [errorLine, setErrorLine] = useState<number>();
  const [virtualTimeMs, setVirtualTimeMs] = useState(0);
  const [serialOutput, setSerialOutput] = useState("");
  const [pinOutputs, setPinOutputs] = useState<Record<string, PinOutput>>({});
  const [potentiometer, setPotentiometer] = useState(
    initialState.current.inputs.potentiometer,
  );
  const [toggleSwitch, setToggleSwitch] = useState(
    initialState.current.inputs.toggleSwitch,
  );
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

  const handleWorkerMessage = useCallback((message: WorkerToUiMessage) => {
    switch (message.type) {
      case "running":
        setStatus("running");
        setStatusMessage("Sketch is running. Inputs stay live while it executes.");
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
  }, [terminateWorker]);

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
      setStatusMessage("The emulator worker stopped unexpectedly. Check the sketch and try again.");
      terminateWorker();
    };

    const message: UiToWorkerMessage = {
      type: "start",
      source,
      inputs: { potentiometer, toggleSwitch },
    };
    worker.postMessage(message);
  }, [handleWorkerMessage, potentiometer, source, terminateWorker, toggleSwitch]);

  const stop = useCallback(() => {
    terminateWorker();
    runtimeErrorRef.current = false;
    setStatus("stopped");
    setStatusMessage("Sketch stopped. Hardware state is preserved until Reset.");
    setErrorLine(undefined);
  }, [terminateWorker]);

  const reset = useCallback(() => {
    terminateWorker();
    const fresh = createInitialSimulationState(hardwareConfig);
    runtimeErrorRef.current = false;
    setPinOutputs({});
    setPotentiometer(fresh.inputs.potentiometer);
    setToggleSwitch(fresh.inputs.toggleSwitch);
    setVirtualTimeMs(0);
    setSerialOutput("");
    setStatus("ready");
    setStatusMessage("Hardware reset. Your sketch is unchanged.");
    setErrorLine(undefined);
  }, [terminateWorker]);

  const sendInput = useCallback((message: UiToWorkerMessage) => {
    workerRef.current?.postMessage(message);
  }, []);

  const changePotentiometer = (value: number) => {
    setPotentiometer(value);
    sendInput({ type: "input-change", component: "potentiometer", value });
  };

  const changeToggle = (value: boolean) => {
    setToggleSwitch(value);
    sendInput({ type: "input-change", component: "toggleSwitch", value });
  };

  const restoreStarter = () => {
    if (source === STARTER_SKETCH || window.confirm("Replace the editor contents with the starter sketch?")) {
      setSource(STARTER_SKETCH);
    }
  };

  const isActive = status === "running" || status === "starting";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Zap size={19} fill="currentColor" aria-hidden="true" /></span>
          <div>
            <span>Intro Engineering</span>
            <h1>Arduino Emulator</h1>
          </div>
        </div>
        <div className="run-controls" aria-label="Simulation controls">
          <button className="control-button run-button" type="button" onClick={run} disabled={isActive}>
            <Play size={16} fill="currentColor" aria-hidden="true" />
            Run
          </button>
          <button className="control-button stop-button" type="button" onClick={stop} disabled={!isActive}>
            <CircleStop size={16} aria-hidden="true" />
            Stop
          </button>
          <button className="control-button reset-button" type="button" onClick={reset}>
            <RotateCcw size={16} aria-hidden="true" />
            Reset
          </button>
        </div>
      </header>

      <div className="workspace">
        <div className="editor-column">
          <CodeEditor value={source} onChange={setSource} onRestore={restoreStarter} />
          <StatusPanel
            status={status}
            message={statusMessage}
            line={errorLine}
            virtualTimeMs={virtualTimeMs}
          />
          <SerialMonitor output={serialOutput} onClear={() => setSerialOutput("")} />
        </div>
        <HardwareView
          config={hardwareConfig}
          pinOutputs={pinOutputs}
          potentiometer={potentiometer}
          toggleSwitch={toggleSwitch}
          onPotentiometerChange={changePotentiometer}
          onToggleChange={changeToggle}
          onReset={reset}
        />
      </div>
    </main>
  );
}
