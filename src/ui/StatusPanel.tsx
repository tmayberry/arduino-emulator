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

export function StatusPanel({
  status,
  message,
  line,
  virtualTimeMs,
}: StatusPanelProps) {
  const Icon =
    status === "error"
      ? AlertTriangle
      : status === "running"
        ? CheckCircle2
        : Terminal;
  const diagnostic = line ? `Line ${line}:\n${message}` : message;

  return (
    <section
      className={`status-panel status-${status}`}
      aria-live="polite"
      aria-label="Program status"
      title={`${labels[status]} — ${diagnostic}`}
    >
      <div className="status-main">
        <Icon size={16} aria-hidden="true" />
        <div>
          <span>{labels[status]}</span>
          <pre className="status-message">{diagnostic}</pre>
        </div>
      </div>
      <div className="time-display" title="Simulated Arduino time">
        <Clock3 size={14} aria-hidden="true" />
        <span className="sr-only">millis()</span>
        <strong>{Math.round(virtualTimeMs).toLocaleString()} ms</strong>
      </div>
    </section>
  );
}
