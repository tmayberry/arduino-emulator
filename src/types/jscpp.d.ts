declare module "JSCPP" {
  interface JscppDebugger {
    done: boolean;
    next(): false | { v: number };
  }

  interface JscppConfig {
    debug?: boolean;
    includes?: Record<string, { load(runtime: unknown): void }>;
    stdio?: { write(value: string): void; drain?(): string };
    unsigned_overflow?: "error" | "warn" | "ignore";
  }

  const JSCPP: {
    run(source: string, input: string, config?: JscppConfig): JscppDebugger | number;
  };

  export default JSCPP;
}
