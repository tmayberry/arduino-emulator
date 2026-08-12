import { useEffect, useRef } from "react";
import { Eraser, TerminalSquare } from "lucide-react";

interface SerialMonitorProps {
  output: string;
  onClear(): void;
}

export function SerialMonitor({ output, onClear }: SerialMonitorProps) {
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const element = outputRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [output]);

  return (
    <section className="serial-monitor" aria-label="Serial Monitor">
      <div className="serial-heading">
        <div>
          <TerminalSquare size={15} aria-hidden="true" />
          <strong>Serial Monitor</strong>
        </div>
        <button type="button" onClick={onClear} disabled={!output}>
          <Eraser size={14} aria-hidden="true" />
          Clear
        </button>
      </div>
      <pre ref={outputRef} aria-live="polite">
        {output || <span>Output from Serial.print() will appear here.</span>}
      </pre>
    </section>
  );
}
