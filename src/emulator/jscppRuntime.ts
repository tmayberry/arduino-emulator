import JSCPP from "JSCPP";
import type { ArduinoIncludeModule } from "./arduinoApi";

export interface RestrictedJscppOptions {
  debug?: boolean;
  unsignedOverflow?: "error" | "warn" | "ignore";
}

/**
 * JSCPP normally exposes its bundled C/C++ headers. Bind its runner to a
 * deliberately small include registry so V1 student code can reach only the
 * lab's Arduino compatibility layer.
 */
export function runRestrictedJscpp(
  source: string,
  arduinoInclude: ArduinoIncludeModule,
  options: RestrictedJscppOptions = {},
): unknown {
  const run = JSCPP.run as unknown as (
    this: { includes: Record<string, ArduinoIncludeModule> },
    source: string,
    input: string,
    config: Record<string, unknown>,
  ) => unknown;

  return run.call(
    { includes: { "Arduino.h": arduinoInclude } },
    source,
    "",
    {
      debug: options.debug ?? false,
      loadedLibraries: [],
      stdio: { write: () => undefined },
      unsigned_overflow: options.unsignedOverflow ?? "ignore",
    },
  );
}
