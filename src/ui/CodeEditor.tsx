import Editor, { loader } from "@monaco-editor/react";
import { RotateCcw } from "lucide-react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution";

loader.config({ monaco });

interface CodeEditorProps {
  value: string;
  onChange(value: string): void;
  onRestore(): void;
}

export function CodeEditor({ value, onChange, onRestore }: CodeEditorProps) {
  return (
    <section
      className="workspace-panel code-panel"
      aria-label="Arduino code editor"
    >
      <div className="panel-heading code-heading">
        <div>
          <span className="eyebrow">Sketch</span>
          <h2>Sketch.ino</h2>
        </div>
        <button className="text-button" type="button" onClick={onRestore}>
          <RotateCcw size={15} aria-hidden="true" />
          Starter sketch
        </button>
      </div>
      <div className="editor-shell">
        <Editor
          height="100%"
          language="cpp"
          theme="vs-dark"
          value={value}
          onChange={(next) => onChange(next ?? "")}
          loading={<div className="editor-loading">Loading C++ editor…</div>}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            fontFamily:
              '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
            fontSize: 14,
            lineHeight: 23,
            padding: { top: 18, bottom: 18 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            tabSize: 2,
            wordWrap: "on",
            renderLineHighlight: "line",
            overviewRulerBorder: false,
            fixedOverflowWidgets: true,
          }}
        />
      </div>
    </section>
  );
}
