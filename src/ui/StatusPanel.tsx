import { AlertTriangle, CheckCircle2, Clock3, Terminal } from "lucide-react";

export type RunStatus = "ready" | "starting" | "running" | "stopped" | "error";

interface StatusPanelProps {
  status: RunStatus;
  message: string;
  line?: number;
  virtualTimeMs: number;
}

const labels: Record<RunStatus, string> = {
  ready: "Ready",
  starting: "Starting",
  running: "Running",
  stopped: "Stopped",
  error: "Needs attention",
};

export function StatusPanel({ status, message, line, virtualTimeMs }: StatusPanelProps) {
  const Icon = status === "error" ? AlertTriangle : status === "running" ? CheckCircle2 : Terminal;

  return (
    <section className={`status-panel status-${status}`} aria-live="polite" aria-label="Program status">
      <div className="status-main">
        <Icon size={17} aria-hidden="true" />
        <div>
          <span>{labels[status]}</span>
          <pre className="status-message">{line ? `Line ${line}:\n${message}` : message}</pre>
        </div>
      </div>
      <div className="time-display" title="Simulated Arduino time">
        <Clock3 size={15} aria-hidden="true" />
        <span>millis()</span>
        <strong>{Math.round(virtualTimeMs).toLocaleString()} ms</strong>
      </div>
    </section>
  );
}
