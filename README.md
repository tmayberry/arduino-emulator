# Arduino Emulator

A general-purpose, completely client-side Arduino programming emulator for the configured Arduino Nano 33 BLE Sense Rev2 hardware. Sketches run in a Web Worker through JSCPP and interact with a config-driven simulation API—there is no CPU emulation, API server, or remote compilation service.

## Version 1 features

- Monaco C++ editor with versioned `localStorage` persistence
- `setup()` / `loop()` Arduino source wrapper
- `HIGH`, `LOW`, `INPUT`, `OUTPUT`, `INPUT_PULLUP`, `A0`–`A7`, `TEST_LED_PIN`, and `LED_BUILTIN`
- `pinMode`, `digitalWrite`, `digitalRead`, `analogRead`, `analogWrite`, `delay`, `millis`, `micros`, `map`, `min`, `max`, `constrain`, `random`, and `randomSeed`
- `Serial.begin`, `Serial.print`, `Serial.println`, `Serial.available`, `Serial.read`, `Serial.peek`, `Serial.parseInt`, `Serial.parseFloat`, `Serial.readString`, `Serial.readStringUntil`, and `Serial.setTimeout`
- Live, clearable Serial Monitor with an Arduino IDE-style input sender and selectable line endings
- Arduino-style `String` variables, assignment, concatenation, comparison, `length()`, `charAt()`, and `c_str()`
- Cooperative, short-slice JSCPP execution in a disposable Web Worker
- Real-time-paced virtual clock and runaway-loop watchdog
- Built-in yellow LED (`LED_BUILTIN`) on D13, external green LED on D4, external red LED on D6, A7 potentiometer, and D2 toggle switch
- Persistent board setup editor for renaming and repinning external devices and adding switches, potentiometers, or ranged analog sensors with physical units
- Arduino BMI270 accelerometer compatibility with `IMU.begin()`, `IMU.accelerationAvailable()`, and `IMU.readAcceleration(x, y, z)`
- Direct phone accelerometer input over WebRTC using serverless two-QR pairing
- Live interactive 3D acceleration vector, magnitude, and Lab 2 ±1.5 g threshold guides
- Clickable onboard reset button that resets the current virtual board while preserving custom setup, plus a separate Reset all control
- Hard-stop worker termination and full hardware reset
- Student-friendly interpreter error display

The starter sketch is unchanged when hardware is reconfigured, so users should update any literal pin numbers in their code to match their selected setup. `LED_BUILTIN` remains on D13, while `TEST_LED_PIN` follows the configured green LED. Hardware relationships and placement metadata live in [`src/config/defaultHardware.ts`](src/config/defaultHardware.ts).

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

### Phone accelerometer pairing

The phone and laptop both open the HTTPS deployment. Click **Connect phone** on the laptop, scan its QR code with the phone camera, and allow motion access. The phone then displays an answer QR code for the laptop webcam to scan.

The initial WebRTC configuration intentionally has no STUN or TURN servers. It therefore tests direct connectivity on the local Wi-Fi network and does not send sensor data through a relay. Networks that isolate wireless clients may prevent pairing; connect the laptop to a phone hotspot as a fallback. ICE servers can later be added in `src/phone/webrtc.ts` without changing the emulator or phone sensor protocol.

## Architecture

- `src/config/` — swappable hardware definitions
- `src/emulator/` — simulation state, Arduino API, source wrapper, scheduler, and worker protocol
- `src/worker/` — JSCPP execution and cooperative scheduling
- `src/ui/` — editor and config-driven hardware controls
- `tests/` — simulation, compatibility-layer, source-wrapper, and scheduler tests

All interpreted Arduino I/O passes through `SimulationEngine`, leaving one observation point for future tracing, debugging, and alternate hardware configurations.
