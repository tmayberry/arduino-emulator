/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TURN_BROKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface MonacoEnvironment {
  getWorker(): Worker;
}

interface WindowOrWorkerGlobalScope {
  MonacoEnvironment?: MonacoEnvironment;
}
