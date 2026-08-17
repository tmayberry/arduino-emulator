import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import App from "./App";

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

export default App;
