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

The phone and laptop both open the HTTPS deployment. Click **Connect phone** on the laptop, scan its QR code with the phone camera, and allow motion access. The phone then displays an optimized answer QR code for the laptop webcam to scan. Tap the answer code to enlarge it when using a low-resolution webcam.

The WebRTC configuration uses Cloudflare TURN as a fallback when a direct peer-to-peer path is blocked. The laptop asks for a course access code, then a small Cloudflare Worker exchanges it for one-hour ICE credentials. The phone receives a signed, ten-minute pairing grant in the QR fragment, so students enter the course code only on the laptop. The long-lived TURN token and course code never enter the static site or QR code.

Direct host candidates are still permitted, but the only configured server candidate is Cloudflare TURN-over-TLS on TCP 443. Avoiding the UDP, TCP/3478, TCP/80, and TLS/5349 probes keeps non-trickle QR pairing responsive on managed devices where those ports are silently filtered. TURN relays only the WebRTC data channel when the direct candidate cannot connect.

### TURN broker deployment

The broker is configured by [`wrangler.jsonc`](wrangler.jsonc) and implemented in [`worker/index.ts`](worker/index.ts). Before its first deployment:

1. In Cloudflare, create a TURN key and retain its **TURN Token ID** and **API token**.
2. Register a `workers.dev` subdomain under **Workers & Pages → Account details → workers.dev subdomain**.
3. Deploy the Worker with the four required secrets. For an existing Worker, set them interactively so values do not enter shell history:

   ```bash
   npx wrangler secret put TURN_KEY_ID
   npx wrangler secret put TURN_API_TOKEN
   npx wrangler secret put COURSE_ACCESS_CODE
   npx wrangler secret put PAIR_GRANT_SIGNING_KEY
   ```

   Use a random value of at least 32 bytes for `PAIR_GRANT_SIGNING_KEY`. On the first deployment, Wrangler requires all four values together via an ignored secrets file:

   ```bash
   npx wrangler deploy --secrets-file .env.production
   ```

   The file uses `NAME=value` lines and is covered by this repository's `.env*` ignore rule. Delete it after deployment or keep it only in an appropriately protected password store.
4. The checked-in default broker URL is `https://arduino-turn-auth.arduino-emulator.workers.dev`. To target another Worker, set the optional GitHub Actions repository variable `VITE_TURN_BROKER_URL`, or export it for a local or USNA build:

   ```bash
   VITE_TURN_BROKER_URL=https://arduino-turn-auth.<subdomain>.workers.dev npm run build
   ```

The Worker accepts browser requests only from the origins listed in `ALLOWED_ORIGINS`. Update that non-secret setting when adding another deployment domain, regenerate bindings with `npm run worker:types`, and redeploy.

Worker validation commands are:

```bash
npm run worker:types
npm run worker:check
npx wrangler deploy --dry-run
```

## Architecture

- `src/config/` — swappable hardware definitions
- `src/emulator/` — simulation state, Arduino API, source wrapper, scheduler, and worker protocol
- `src/worker/` — JSCPP execution and cooperative scheduling
- `src/ui/` — editor and config-driven hardware controls
- `tests/` — simulation, compatibility-layer, source-wrapper, and scheduler tests

All interpreted Arduino I/O passes through `SimulationEngine`, leaving one observation point for future tracing, debugging, and alternate hardware configurations.
