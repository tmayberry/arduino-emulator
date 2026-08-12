# Arduino Emulator

A general-purpose, completely client-side Arduino programming emulator for the configured Arduino Nano 33 BLE hardware. Sketches run in a Web Worker through JSCPP and interact with a config-driven simulation API—there is no CPU emulation, API server, or remote compilation service.

## Version 1 features

- Monaco C++ editor with versioned `localStorage` persistence
- `setup()` / `loop()` Arduino source wrapper
- `HIGH`, `LOW`, `INPUT`, `OUTPUT`, `INPUT_PULLUP`, `A0`–`A7`, `TEST_LED_PIN`, and `LED_BUILTIN`
- `pinMode`, `digitalWrite`, `digitalRead`, `analogRead`, `analogWrite`, `delay`, `millis`, and `map`
- `Serial.begin`, `Serial.print`, and `Serial.println` with a live, clearable Serial Monitor
- Cooperative, short-slice JSCPP execution in a disposable Web Worker
- Real-time-paced virtual clock and runaway-loop watchdog
- Built-in yellow LED (`LED_BUILTIN`) on D13, external green LED on D4, external red LED on D6, A7 potentiometer, and D2 toggle switch
- Clickable onboard reset button that stops the sketch and restores default hardware state
- Hard-stop worker termination and full hardware reset
- Student-friendly interpreter error display

The starter sketch uses `TEST_LED_PIN` as an alias for the external green LED on D4. Hardware relationships and placement metadata live in [`src/config/defaultHardware.ts`](src/config/defaultHardware.ts).

## Local development

Requires a current Node.js release.

```bash
npm install
npm run dev
```

Then open the local address printed by Vite.

## Validation

```bash
npm test
npm run build
```

The production build is written to `dist/` and contains only static browser assets.

## Static deployment

`vite.config.ts` uses a relative asset base, so the contents of `dist/` can be published at a domain root or a subpath such as GitHub Pages.

To create a ZIP for a conventional Apache web directory, run:

```bash
npm run deploy:package
```

This performs a fresh production build and writes `deployment/arduino-emulator.zip`. Upload the ZIP to the desired web directory and extract it there. Its root contains `index.html` and `assets/`; no Node.js, PHP, or CGI process is needed on the server.

To build and deploy the package to the USNA web server in one step, run:

```bash
./scripts/deploy-to-usna.sh
```

The script uploads the ZIP to `mayberry@ssh.cs.usna.edu` and installs it in `~/public_html/arduino_emulator`, published at <https://courses.cs.usna.edu/~mayberry/arduino_emulator/>. It stages the extracted files before replacing the existing deployment, so a build, transfer, or extraction failure leaves the current site intact.

For GitHub Pages, configure Pages to use GitHub Actions, then push to the default branch. The included workflow builds and publishes `dist/`.

## Architecture

- `src/config/` — swappable hardware definitions
- `src/emulator/` — simulation state, Arduino API, source wrapper, scheduler, and worker protocol
- `src/worker/` — JSCPP execution and cooperative scheduling
- `src/ui/` — editor and config-driven hardware controls
- `tests/` — simulation, compatibility-layer, source-wrapper, and scheduler tests

All interpreted Arduino I/O passes through `SimulationEngine`, leaving one observation point for future tracing, debugging, and alternate hardware configurations.
