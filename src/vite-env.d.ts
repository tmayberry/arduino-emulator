/// <reference types="vite/client" />

interface MonacoEnvironment {
  getWorker(): Worker;
}

interface WindowOrWorkerGlobalScope {
  MonacoEnvironment?: MonacoEnvironment;
}
