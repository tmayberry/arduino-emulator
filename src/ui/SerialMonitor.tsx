import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Eraser, TerminalSquare } from "lucide-react";

interface SerialMonitorProps {
  output: string;
  inputEnabled: boolean;
  forceExpanded?: boolean;
  onClear(): void;
  onSend(text: string): void;
}

const LINE_ENDINGS = {
  none: "",
  newline: "\n",
  carriageReturn: "\r",
  both: "\r\n",
} as const;

type LineEnding = keyof typeof LINE_ENDINGS;

export function SerialMonitor({
  output,
  inputEnabled,
  forceExpanded = false,
  onClear,
  onSend,
}: SerialMonitorProps) {
  const outputRef = useRef<HTMLPreElement>(null);
  const [input, setInput] = useState("");
  const [lineEnding, setLineEnding] = useState<LineEnding>("newline");
  const [expanded, setExpanded] = useState(false);
  const isExpanded = expanded || forceExpanded;

  const latestLine = output
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1) ?? "No serial output";

  useEffect(() => {
    const element = outputRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [output]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inputEnabled || (!input && lineEnding === "none")) return;
    onSend(input + LINE_ENDINGS[lineEnding]);
    setInput("");
  };

  return (
    <section className={`serial-monitor${isExpanded ? " serial-expanded" : ""}`} aria-label="Serial Monitor">
      <div className="serial-heading">
        <button
          className="serial-toggle"
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <TerminalSquare size={15} aria-hidden="true" />
          <strong>Serial Monitor</strong>
          {!isExpanded && <span className="serial-latest">{latestLine}</span>}
          <ChevronDown className="serial-chevron" size={16} aria-hidden="true" />
        </button>
        <button className="serial-clear" type="button" onClick={onClear} disabled={!output}>
          <Eraser size={14} aria-hidden="true" />
          Clear
        </button>
      </div>
      {isExpanded && (
        <div className="serial-body">
          <pre ref={outputRef} aria-live="polite">
            {output || <span>Output from Serial.print() will appear here.</span>}
          </pre>
          <form className="serial-input" onSubmit={submit}>
            <input
              aria-label="Serial input"
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Message to send"
              disabled={!inputEnabled}
            />
            <select
              aria-label="Line ending"
              value={lineEnding}
              onChange={(event) => setLineEnding(event.target.value as LineEnding)}
              disabled={!inputEnabled}
            >
              <option value="none">No line ending</option>
              <option value="newline">New line</option>
              <option value="carriageReturn">Carriage return</option>
              <option value="both">Both NL &amp; CR</option>
            </select>
            <button
              type="submit"
              disabled={!inputEnabled || (!input && lineEnding === "none")}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
