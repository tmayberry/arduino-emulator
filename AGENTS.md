# Programming Guide for Agents

## Start here

- Use Node.js 22 and install the locked dependencies with `npm ci`.
- Read `README.md` for the product scope, supported Arduino API, and deployment model.
- Preserve unrelated working-tree changes. Do not discard or rewrite files outside the task.
- Keep the application client-side. The Cloudflare TURN broker is the only server component.

## Repository map

- `src/App.tsx` owns application state, worker lifetime, persistence, and the top-level UI wiring.
- `src/ui/` contains React components. Shared application styling is in `src/styles/main.css`.
- `src/config/` defines hardware types, defaults, persistence, and the starter sketch.
- `src/emulator/` contains the simulation state, Arduino compatibility API, source wrapper, scheduler, error mapping, and UI/worker message types.
- `src/worker/emulator.worker.ts` runs interpreted sketches in cooperative slices.
- `src/phone/` contains WebRTC pairing, TURN broker access, and motion normalization.
- `worker/index.ts` is the Cloudflare Worker used for TURN credentials and pairing mailboxes.
- `tests/` mirrors these subsystems with Vitest and Testing Library coverage.

## Runtime paths

Sketch execution follows this path:

```text
App.tsx
  -> workerProtocol.ts
  -> emulator.worker.ts
  -> sourceWrapper.ts + arduinoApi.ts
  -> SimulationEngine
  -> worker messages
  -> App.tsx and UI components
```

Hardware changes normally touch the config types/defaults, `SimulationEngine`, the worker protocol when a new message is needed, the relevant UI, and tests. New Arduino functions normally touch `arduinoApi.ts` and its tests; change `sourceWrapper.ts` only when the generated C++ compatibility layer must change.

Phone motion follows `PhoneRemote.tsx -> phone/pairing.ts -> phone/webrtc.ts -> App.tsx -> emulator worker`. TURN and signaling requests pass through `phone/turnBroker.ts` and `worker/index.ts`.

## Architectural invariants

- Run student code only inside the disposable Web Worker. Stop and reset must remain able to terminate it immediately.
- Route interpreted Arduino I/O through `SimulationEngine`; it is the observation boundary between interpreted code and the UI.
- Keep `UiToWorkerMessage` and `WorkerToUiMessage` synchronized with both senders and receivers.
- Preserve cooperative scheduling, virtual-time pacing, and runaway-loop detection. Long synchronous execution must not move onto the UI thread.
- Preserve source-line translation so interpreter errors continue to point to the student's sketch rather than generated wrapper code.
- Keep hardware behavior config-driven. Avoid embedding configurable component pins in UI or emulator logic.
- Preserve the serial-output limits in both the worker and UI unless the task explicitly changes that policy.
- Keep sketch and hardware persistence backward compatible, or version/migrate stored data deliberately.
- Do not expose TURN secrets in browser code, URLs, logs, fixtures, or committed environment files.
- `worker/worker-configuration.d.ts` is generated. Do not edit it manually; regenerate it with `npm run worker:types` after changing Worker bindings.

## Coding and testing conventions

- Use strict TypeScript and React function components with hooks.
- Keep protocol and config types explicit. Avoid `any` unless an external library boundary makes it unavoidable.
- Match the existing component and CSS naming patterns; keep accessible names and disabled states on controls.
- Add or update the closest subsystem test for every behavior change. Prefer observable behavior over implementation-detail assertions.
- Add emulator API coverage in `tests/arduinoApi.test.ts`, wrapper coverage in `tests/sourceWrapper.test.ts`, scheduling coverage in `tests/scheduler.test.ts`, and UI coverage in the corresponding `*.test.tsx` file.
- Do not add a runtime dependency when the platform or an existing dependency already provides the needed behavior.
- Run `npm run format` after edits. Formatting and lint rules are repository-wide and should not be bypassed with inline disables without a specific reason.

## Validation

For every code or configuration change, run:

```bash
npm run validate
```

This checks formatting, lint, all tests, TypeScript, and the production bundle. Documentation-only changes may run `npm run format:check` instead.

For changes under `worker/` or to `wrangler.jsonc`, also run:

```bash
npm run worker:validate
```

If Worker bindings changed, run `npm run worker:types` first and commit the regenerated declaration file. For layout or interaction changes, also inspect the affected desktop and narrow/mobile states in a browser when practical.
