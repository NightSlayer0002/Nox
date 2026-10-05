# Understand NOX: a founder and interview guide

This guide is a tour of the actual application in this folder. Read it with the app open. Use the Inside NOX button while trying a scene: the reply packet connects the explanation to what you see.

## 1. Explain the product in one sentence

**NOX is an interactive character whose conversation, expressions, memory, and scene controls create a consistent presence you can perform with.**

NOX defaults to an expressive geometric face. His eyes follow your cursor, he blinks, his mouth moves during speech, and pokes produce a temporary smile. An optional Core form carries the same conversation through smoked glass and moving light. The distinctiveness comes from timing, a recognisable voice, and what he can do inside the frame. His private relationship with you does not need to be his public content premise. The full material walkthrough is in [NOX-VISUAL-DESIGN.md](NOX-VISUAL-DESIGN.md).

The first release has a usable character engine and two conversation options:

1. A **scripted demo brain** that works without an account or key. It recognises specific kinds of messages and selects authored responses.
2. A **language-model brain** using GroqCloud first, with manually switchable Google Gemini and NVIDIA NIM when their server keys are configured. The earlier OpenAI Responses adapter remains optional legacy code; leave its key blank for the free-only setup.

The face, optional core, memory, physics, webcam preview, and video rendering work in either option. Calling the demo a scripted demo is essential: pleasant interaction is different from open-ended language understanding.

NOX's fictional confidence can suggest a mysterious intelligence. The software does not establish sentience or superintelligence. It has the particular abilities we implement.

## 2. The whole architecture

There are three boundaries to understand:

```text
YOU
 │ type or optional browser speech recognition
 ▼
app.js ── reads/writes ── memory.js ── browser localStorage
 │
 ├── demo selected ──► brain.js
 │
 └── live selected ──► HTTP POST /api/chat
                         │
                      server.mjs
                         │ validates input, holds the key
                      server/ai.mjs
                         │ HTTPS request
                      Selected provider API
                         │ structured output
                         ▼
              shared/character.js validates the packet
                         │
                         ▼
app.js receives { speech, emotion, action, memory }
 ├── speech ──► conversation + captions + optional voice.js
 ├── emotion ──► stage.character (face.js or orb.js)
 ├── action ──► stage.js
 └── memory ──► memory.js

stage.js draws the selected character and optional camera.js video into one canvas
recorder.js records that canvas, including visible captions, as silent WebM
```

**Frontend** means code running in your browser. It handles the interface, rendering, local memory, and media permissions.

**Backend** means code running in the Node process. It serves files and talks to the optional model. The backend can hold a secret without placing it in a downloaded JavaScript file.

**Contract** means the exact shape of data one component expects from another. NOX's packet contract prevents the brain and body from becoming entangled.

## 3. Every file and why it exists

| File | Responsibility | What you change it for |
|---|---|---|
| `package.json` | Project metadata, Node version requirement, commands, ES-module setting | Add a development command or dependency deliberately |
| `.gitignore` | Prevents configuration secrets, generated files, and logs from being added to Git | New generated output or secret file |
| `.env.example` | Safe template for optional API/model/port configuration | Explain configurable environment values |
| `.env` | Your optional local configuration; you create this yourself | Enable AI conversation or change the port; keep the key private |
| `start-nox.cmd` | Windows launcher that switches to the project folder and starts Node | Windows convenience |
| `server.mjs` | Local HTTP server, static assets, status and chat routes, validation | New route, serving policy, server lifecycle |
| `server/ai.mjs` | Shared identity prompt and legacy OpenAI request/response translation | Personality |
| `server/providers.mjs` | Groq, Gemini, NVIDIA catalog, fixed adapters, shared context and packet | Model configuration or provider compatibility |
| `server/speech.mjs` | Bounded natural audio generation, voice/model allowlist, timeout | Natural voice |
| `scripts/build-vercel.mjs` | Static output and self-contained API function bundles | Deployment packaging |
| `vercel.json` | Build and installation configuration | Vercel setup |
| `public/assets/nox-study.jpg` | Original cinematic room backdrop drawn into the stage canvas | Art direction |
| `shared/character.js` | Allowed modes/emotions/actions, JSON schema, validation, context sanitisation | Change the shared character contract |
| `public/index.html` | Accessible page structure, controls, canvas, chat, inspector | Add or rearrange interface controls |
| `public/style.css` | Layout, typography, colours, responsive rules, film mode | Change the visual design |
| `public/icon.svg` | Small two-eye browser-tab mark, drawn as vector shapes | Change the tab icon |
| `public/fonts/Manrope.ttf` | Locally served variable font | Typography; no runtime font request to a third party |
| `public/fonts/OFL.txt` | License for the Manrope asset | Preserve when distributing the font |
| `public/js/app.js` | Coordinates the interface, brain choice, memory, body, media, and inspector | Change an end-to-end user flow |
| `public/js/turns.js` | Reply tokens and request cancellation | Prevent old async work from replacing a new interaction |
| `public/js/brain.js` | Authored demo dialogue and message routing | Add a demo response or demonstration command |
| `public/js/memory.js` | Versioned, bounded browser memory with graceful storage fallback | Change what persists or add a migration |
| `public/js/face.js` | Live eye/mouth geometry, gaze, blink, wink, touch reactions | Change NOX’s default face |
| `public/js/orb.js` | Core pose, dial marks, GPU composition, Canvas fallback | Change NOX’s embodiment |
| `public/js/orb-state.js` | Shared activity state, expression envelope, palette, shader clock (used by both forms) | Change how an interaction affects light |
| `public/js/orb-shader.js` | Original GLSL material and offscreen WebGL lifecycle | Change the actual surface and internal currents |
| `public/js/stage.js` | Canvas loop, drawing order, pointer interaction, scene effects, captions | Give him a new visual power |
| `public/js/voice.js` | Browser speech, cancel-safe natural audio, recognition input | Voice selection, speech timing, language |
| `public/js/camera.js` | Webcam stream lifecycle and video element | Camera capture settings or lifecycle |
| `public/js/recorder.js` | Canvas capture, MediaRecorder, export, sixty-second cap | Recording format, bitrate, duration |
| `scripts/check.mjs` | Syntax-checks all JavaScript modules | Development verification |
| `tests/core.test.mjs` | Packet, memory, and demo behaviour tests | Protect new character behaviours |
| `tests/server.test.mjs` | Actual HTTP routes and controlled provider-boundary tests | Protect backend or provider changes |
| `tests/lifecycle.test.mjs` | Reply cancellation and recording-session ownership | Protect reset and media lifecycle changes |
| `tests/face.test.mjs` | Gaze, mouth, expressions, reduced motion, form continuity, clicks vs drags, reset, pointer ownership, caption clearance | Protect the face and its interactions |
| `tests/orb.test.mjs` | State priority, palette, reduced motion, frame limits, recording resize lock, keyboard | Protect embodiment and capture behaviour |
| `tests/voice.test.mjs` | Obsolete speech-event isolation | Protect a new performance from old audio callbacks |
| `docs/NOX-VISUAL-DESIGN.md` | Material, shader math, compositing, references | Learn the rendering implementation in depth |
| `README.md` | Start, use, configure, and verify NOX | Public developer entry point |
| `docs/FOUNDER-GUIDE.md` | This explanation | Keep the explanation accurate as code changes |
| `docs/BUILD-LOG.md` | Build decisions, evidence, known limits | Record why a choice changed |
| `docs/superpowers/specs/2026-10-04-nox-design.md` | First-release requirements | Define intended product behaviour |
| `docs/superpowers/plans/2026-10-04-nox.md` | Implementation task map | Track the build against requirements |

### Why use folders this way?

`public/` is the part a browser may download. `server/` is backend implementation. `shared/` has a small contract used by both. `tests/` contains executable evidence. `docs/` explains intent and decisions.

The server makes exactly one shared file available at `/shared/character.js`. It does not expose the whole repository. A browser request for `/package.json` or `/.env` gets a 404.

## 4. What happens when you start NOX?

`npm.cmd start` reads `package.json` and runs `node server.mjs`. On Windows, `npm.cmd` avoids PowerShell execution-policy problems that can affect the `npm.ps1` wrapper.

The server checks whether it is the program being run directly. This matters because the tests import it as a module. Importing it should not unexpectedly open a port or load your local key.

When launched directly, it loads `.env` if that file exists, validates the port, creates the server, and listens on `127.0.0.1`. That address is the loopback interface on your computer. Local development uses this loopback address. Vercel hosting instead invokes exported request handlers without opening a local port; see [DEPLOYMENT.md](DEPLOYMENT.md).

Opening the address downloads `index.html`, `style.css`, and the `app.js` module. The browser resolves the imports in `app.js` and loads the supporting modules.

`app.js` then:

1. Opens NOX's notebook with storage recovery.
2. Constructs the stage, voice, camera, microphone, and recorder services.
3. Connects buttons, keyboard shortcuts, and the form to handlers.
4. Restores the mode and a short visible conversation history.
5. Reads `/api/status` to discover whether an API key is configured.

The canvas animation loop starts without waiting for the model connection. NOX can exist visually while the backend is slow or unavailable.

## 5. Trace one conversation turn

Type `show me gravity`.

The form prevents the browser's normal page-submission behaviour and calls `send(text)`. The input is trimmed; empty input and overlapping turns are ignored. The UI disables Send while a reply is pending.

The app takes a snapshot of existing context before appending the current turn. That prevents the same current message from appearing twice in a provider request. It then stores and displays the user's message.

In demo mode, `demoReply()` sees the gravity keyword and returns:

```json
{
  "speech": "You gave me gravity. An ambitious way to lower my expectations.",
  "emotion": "skeptical",
  "action": "gravity",
  "memory": ""
}
```

In live mode, the app sends the text and bounded context to `/api/chat`. The backend requests a structured packet from the model.

Both routes arrive at `perform(packet)`. That function validates the packet, appends the reply, updates memory, sets the core’s expression, starts the speech envelope, and asks the stage to run the action. Optional voice reads the same speech. Canvas dimensions are locked while recording, including encoder finalization, then catch up to the current viewport.

**One packet drives all visible and audible reactions.** That is how we avoid a caption saying one thing while an unrelated animation does something else.

### What are async and await doing?

An `async` function can wait for a result without freezing the browser's event loop. `await fetch(...)` pauses that function until the network responds; it does not pause the canvas animation or the entire application.

Promises represent results that may arrive later. The demo's short delay is just presentation timing. The model's delay is a real network/provider dependency.

### Why the request version and AbortController?

Suppose you send a message, then switch to Uncanny before the reply arrives. An old Companion response should not overwrite the new scene. `turns.js` gives each interaction a version token; outdated results are ignored. `AbortController` also cancels the browser's pending fetch when possible. Mode switches, scene buttons, Reset, and Escape cancel obsolete replies. Escape also works while the composer has focus.

Cancellation at the browser does not guarantee that a provider request already started on the server has stopped. That is a future improvement for the live path.

## 6. The packet contract

`shared/character.js` defines three modes, six emotions, and six action values including `none`.

The JSON schema asks the model for exactly four properties. `additionalProperties: false` disallows extra fields in the structured format. `strict: true` requests schema adherence at the provider boundary.

The runtime validator is still needed. A network response can fail, a provider can refuse, tests can use fixtures, and future integrations may not honour the schema.

`normalizePacket()` requires non-empty string speech, bounds it to 420 characters, bounds a memory to 120 characters, and converts unknown actions/emotions to safe defaults. A model cannot introduce a `delete_files` action: it becomes `none`.

`sanitizeContext()` keeps only the mode, name, facts, and allowed conversational roles. It discards unexpected fields and bounds the history sent to the model to twelve turns.

`prepareChatRequest()` also measures the JSON's UTF-8 byte size. If a long conversation in multibyte text would exceed the server's sixteen-kilobyte budget, it drops the oldest context first. It retains the current message. Character count and network byte count are different, which matters for Hindi, emoji, and other Unicode text.

The body never executes model-generated JavaScript. It switches among actions we wrote ourselves. This is a small capability interface: **the model may select a power; the application defines what that power means.**

## 7. How the face and core become one character

### The default face

`face.js` owns the visible features. `Face` extends `OrbSignal`: despite its historical filename, `orb-state.js` is shared by both forms. The base class owns emotion, persona, activity, speech timing, intensity, and a smoothed energy sample. A renderer only interprets that state.

Two rounded rectangles form the eyes, each normally 46 × 100 design units, spaced 114 units apart. A curve or ellipse forms the mouth. Every draw starts with Canvas `save()` and ends with `restore()`; translation, scale, rotation, and glow cannot leak into the camera or captions. The scale unit is `min(width / 580, height / 340)`, so his features keep their proportions in landscape and portrait.

Gaze compares the normalised cursor position with his current position. Horizontal travel is clamped to ±18 design units, vertical travel to ±12, and exponential damping at coefficient 9 softens the response. Thinking temporarily scans his gaze instead. A blink multiplies both eye heights by a short sine dip; a wink affects only the left eye. The mouth uses a curved smile, a slanted skeptical line, or an ellipse during speech. The speaking ellipse changes size with two sine waves; this is authored animation, not phoneme detection or microphone analysis.

`poke()` stores a reaction expiry instead of overwriting `emotion`. That distinction matters: a smile triggered by touch lasts 1.5 seconds, then he returns to the actual dialogue mood. Pointer capture keeps a drag attached to its original finger/mouse; the maximum travel distinguishes a click from a drag. Escape cancels the drag, and unrelated pointer releases cannot undo a reset.

### Switching forms

`Stage.forms` caches both bodies, and `Stage.character` points to the active one. `setForm()` accepts only Face/Core, lazily creates the WebGL core, copies mode, emotion, activity, speech deadline, and intensity, then clears the scene. Chat, voice, microphone events, and recording work through the same active character reference. The renderer cannot secretly create a new conversation when you change his appearance.

### The optional core

There are three focused files. `orb-state.js` answers what state he is in. `orb-shader.js` converts that state into a material. `orb.js` positions the result in the world and supplies a dial and fallback renderer.

| State | Meaning |
|---|---|
| `x`, `y` | Current position, as a fraction of stage width/height |
| `targetX`, `targetY` | Position to approach |
| `focus` | Bounded pointer direction that bends the internal currents |
| `emotion` | Expression preset from the reply packet |
| `mode` | Companion, Director, or Uncanny persona |
| `activity` | Idle, thinking, or listening; follows actual app events |
| `speakingUntil` | Estimated speech interval, or actual browser/natural audio interval |
| `scale`, `rotation` | Scene-driven transform |
| `energy` | Smoothed authored expression amplitude |
| `clock` | Bounded shader travel time; freezes for reduced motion |
| `intensity` | Luminance control from zero to one |

Normalised positions keep the behaviour consistent across screen sizes. `draw()` uses Canvas save/restore around the translation and rotation, so one core cannot accidentally transform the next layer.

### Expressing state

Thinking and listening take priority over speech animation. Otherwise a reply is speaking until its interval expires, then idle. Thinking adds a scanning arc; listening uses a wider arc. Speaking varies the current's energy using an authored envelope. Sleepy reduces energy and shader speed. Companion uses amber, Director uses a cool metallic palette, and Uncanny uses red. The Core form has no eyes or mouth. Skeptical in that form currently shares its persona's basic material: it is a dialogue mood, not a distinct shape deformation.

### Smoothing

We approach pointer and position targets using:

`ease = 1 - exp(-8 × dt)`

`new = current + (target - current) × ease`

Because `dt` is elapsed seconds, this exponential form behaves similarly on different refresh-rate displays. Energy uses the same idea with a coefficient of six. A capped delta prevents a background-tab pause from causing a huge jump.

### The shader

WebGL draws two triangles that cover a small offscreen canvas. A fragment shader executes for each pixel. It reconstructs a sphere normal, samples layered deterministic noise, warps the domain, draws curved light threads, and adds a dark material, rim light, and specular reflection. This is an analytic sphere material, not a physically accurate volume simulation. The full equation walkthrough is in [NOX-VISUAL-DESIGN.md](NOX-VISUAL-DESIGN.md).

The GPU canvas is immediately copied into the main 2D stage. Echo reuses that same material for its second core; it does not render or resize a second GPU surface. If WebGL is missing or the context is lost, Canvas draws a simpler dark sphere with flowing bands until the shader can be restored.

### Speaking and reduced motion

The speech envelope combines sine waves. It is not microphone measurement or audio amplitude analysis. Browser speech or natural audio playing/end events align the interval when voice is enabled. Generation tokens discard obsolete voice callbacks so a stopped utterance cannot end the new one. With captions alone, duration is estimated from text length.

Reduced motion freezes shader travel, gaze travel, breathing, automatic blinks, pulse expansion, and large scene motion. Expressions, captions, dragging, and a static click acknowledgement remain. The Animation switch saves an explicit on/off preference under `nox.motion.v1`; until you choose it, NOX follows the OS preference and responds to changes. Clearing the notebook clears conversation data, not this separate appearance preference. Arrow keys move either focused form; Space winks in Face and pulses in Core.

## 8. The stage and its powers

`stage.js` is the world renderer. `requestAnimationFrame` asks the browser to call the frame function before the next paint. Each frame computes time, updates the current scene, updates the active character, and draws everything in order.

The canvas has a CSS display size and a separate physical pixel size. The renderer uses a device-pixel ratio capped at two so the stage stays sharp without rendering an unnecessarily huge image on very dense displays.

Draw order matters:

1. Background gradient and subtle points.
2. Registration marks.
3. Optional orbit particles.
4. Optional local camera preview.
5. Optional echo character (Core reuses its shader texture).
6. Main character (Face geometry or Core with its dial).
7. Spotlight shade or takeover label.
8. Caption.

Every action has one start time and expires after ten seconds. Reset replaces the scene state immediately. No pile of delayed scene callbacks keeps running after you press Escape.

### Gravity

Gravity changes velocity and position:

```text
velocity = velocity + acceleration × dt
position = position + velocity × dt
```

At the floor, NOX's downward velocity becomes an upward velocity multiplied by `.63`. Losing energy on each impact produces smaller bounces. The stage caps `dt` at `.04` seconds so a delayed frame does not create an enormous physics jump.

These are normalised stage units, not metres. This is theatrical physics tailored to the frame.

### Spotlight

A radial gradient leaves a clear centre around the cursor and darkens the outside. NOX's internal currents respond to the same cursor, connecting the world effect to his behaviour.

### Tiny universe

Eight points move around an ellipse using sine and cosine. Different sizes and colours suggest little bodies in orbit. The core remains the centrepiece.

### The other one

The renderer draws the same core a second time, offset and smaller, with a low opacity that slowly increases. It is authored fiction. It does not detect a real person, access another camera, or infer anything about your room.

### Takeover

NOX grows through a smooth transition. If a camera preview is active, that preview shrinks. A label marks his creative control. His actual permissions remain the bounded scene actions.

### Reduced motion

The stage reads the browser's reduced-motion preference and watches for changes. Large bounces, rotations, zoom transitions, and moving orbits are disabled or made static. The character can still communicate through expression and text.

## 9. Memory: continuity without training a model

`memory.js` stores one JSON document under `nox.memory.v1` in the browser's localStorage. It contains a schema version, name, up to twelve facts, up to twenty-four recent turns, and the selected persona.

The browser may retain this data across visits. It belongs to this origin and browser profile. Moving from `127.0.0.1:3000` to `localhost:3000`, another port, or another browser can give you a different notebook.

Remembering a name is ordinary data persistence. It does not retrain or fine-tune the language model. In live mode, we include a bounded subset of the notebook in the next request.

Duplicates are removed from facts. Old turns are dropped from the front. Those bounds keep browser storage and prompt size predictable.

The module catches malformed JSON and blocked storage. Conversation can continue with in-memory state if persistence is unavailable. The interface reports that the notebook will last only for the current visit.

The Clear button resets NOX's name, facts, conversation, and persona. It affects only NOX's data. It does not clear other applications' browser storage.

### Why not a database yet?

There is one local user and no account system. localStorage meets that need without a database server, login flow, or cloud data model. Cloud sync would require authentication, user isolation, deletion/export controls, and a backend persistence layer. Those are separate product requirements.

## 10. The real AI path

`server/ai.mjs` contains the live identity prompt. The prompt gives NOX a stable tone, describes actual actions, explains the three personas, and prevents false claims of camera access or sentience.

The request uses the Responses endpoint, `store: false`, a maximum output-token allowance, and a strict JSON schema. The server extracts `output_text` content from message output items and parses the JSON. Refusals, incomplete output, provider errors, and unusable replies become connection errors.

The model name is configurable. The default is `gpt-4.1-mini`, which supports Responses and structured outputs. This is a practical starter choice, not a claim that it is the newest or optimal model for every need. Confirm your account access and test your actual model before relying on it.

The `.env` key is read by Node. The browser fetches `/api/status`, `/api/chat`, and optional `/api/speech`; it never receives the provider key. The status says whether a connection is configured. It cannot prove that the key has credit, permission, or a working network path until a real call succeeds.

### What reaches the provider?

Your message, selected persona, name, saved facts, and up to twelve recent text turns. Camera frames are not included. `store: false` asks not to retain a retrievable response object; it is not a blanket statement about all provider processing or retention policies.

### Why no silent fallback after an AI failure?

If a live call fails and a canned line appears labelled as AI output, the product misrepresents what happened and hides a debugging signal. This release shows the error. You can still run authored scene buttons because those do not need the provider.

## 11. Voice, camera, and recording

### Voice output

`voice.js` supports browser SpeechSynthesis and optional server-generated audio. Browser voice selects a natural/neural English voice when available and keeps pitch at 1 instead of artificially deepening it. Natural voice requests a Blob from `/api/speech`, creates a temporary object URL, and plays it through Audio. Every stop invalidates a generation, aborts pending fetches, pauses playback, removes callbacks, and revokes the URL. Obsolete audio cannot begin after you change the scene or persona. Real playing/end events control the mouth interval; its shape remains an authored animation rather than audio analysis. Groq Orpheus is the first natural voice option. It needs model access and has a separate free quota.

Voice starts when you enable the control. Reloading defaults to voice off so the page does not unexpectedly speak.

### Voice input

SpeechRecognition, where supported, turns one spoken utterance into text and passes it through the same `send()` path. Browser implementations can depend on external recognition services. This is not a guaranteed offline microphone transcription engine. Unsupported browsers keep text chat usable.

### Camera

`camera.js` requests a video-only stream after you click Camera. It creates a muted video element and manages its tracks. The stage draws its frames into the canvas; the element itself does not need to be placed visibly in the DOM.

The preview is mirrored for a familiar webcam feel. It is cropped to a 4:3 tile without stretching. Stopping the camera or leaving the page stops its tracks.

NOX currently follows your cursor, not your hands or face. Adding camera tracking is a separate vision task. Keeping that distinction clear matters when demonstrating the build.

### Recording

`recorder.js` calls `canvas.captureStream(30)` to get a thirty-frame-per-second video track. MediaRecorder encodes it into a supported WebM format. Data chunks arrive periodically; stopping combines them into a Blob. The app opens a video preview and a Save clip link. This separates successful encoding from the browser's handling of an actual download.

The evening room, camera preview, face/core, visual actions, and visible captions are pixels inside that canvas, so they are in the export. Both browser speech and the natural Audio player are separate from the captured canvas stream, so neither is included. Export is deliberately labelled silent. Use OBS for a capture with desktop voice, or add audio in an editor. The backing surface stays the same size until the recording finishes; then it catches up to viewport changes.

Recording stops at sixty seconds. Bitrate is set to five megabits per second. Pixel dimensions come from the current canvas size and device-pixel ratio; portrait mode changes the frame to 9:16 but does not promise a fixed 1080×1920 export.

Use Record clip in the studio or the recording control inside film mode. R starts/stops recording when you are not typing. A recording remains owned until its stop event finishes, so a new recording cannot accidentally inherit the previous one's data or cleanup. Each session owns its own stream, chunks, and timer.

Avoid resizing the browser during a recording. A production recorder would render to a separate fixed-resolution canvas to guarantee consistent dimensions regardless of UI resizing.

## 12. What the server is responsible for

`server.mjs` uses Node's built-in HTTP and filesystem modules. It intentionally avoids a framework because the release has three API routes and a small asset surface.

| Route | Behaviour |
|---|---|
| `GET /` | Serves the interface |
| `GET /js/...`, `/style.css`, `/icon.svg` | Serves approved public files |
| `GET /shared/character.js` | Serves that exact shared contract file |
| `GET /api/status` | Reports demo/live configuration and optional model name |
| `POST /api/chat` | Validates input, calls the provider, validates the packet |

Message length is bounded to 1–1200 characters. JSON request size is bounded to sixteen kilobytes. Incoming bytes are collected and decoded once so Unicode characters survive network chunk boundaries. Requests must use JSON, local hostnames, and an appropriate same-origin request. The model route allows thirty turns per minute and uses a twenty-second provider timeout.

Static path resolution prevents escaping the public directory. The server does not expose workspace configuration. Response headers restrict script and resource sources and prevent framing.

Provider exception details are not sent to the browser. A key or upstream body should not become a user-facing error message.

These are sensible local-app boundaries. Before hosting publicly, add authenticated users, per-user limits, production logging, infrastructure-managed secrets, and a deployment design. The current process-wide request limit is sufficient only for this single local application.

## 13. Testing: what evidence means

Run:

```powershell
npm.cmd test
npm.cmd run check
```

`node:test` runs the test files. The core tests catch dangerous packet actions, malformed speech, oversized output, unexpected context fields, failed storage, duplicate facts, persistence, memory bounds, and demo routes.

Server tests start the actual application server on an automatically selected port and make real HTTP requests. They verify file denial, configuration status, absent keys, malformed/large/foreign-origin requests, context sanitisation, and generic provider error responses.

Provider tests replace only the external network boundary with controlled Responses fixtures. This proves that our integration constructs and parses the expected contract. It does not prove your API key works or that a live model follows the desired personality reliably.

The syntax checker passes each JavaScript module to `node --check`. It catches parse errors. It does not prove the UI layout, network availability, camera support, or animation quality.

Browser verification supplies the missing evidence: see the core, use controls, send a message, reload memory, check scenes, test portrait layout, and inspect logs. Permission-dependent features must also be tested on your actual hardware/browser before you rely on them for filming.

## 14. Three exercises that teach you the code

### Exercise A: Change his voice as a character

Start in `brain.js` and rewrite the line for gravity. Reload and click Gravity. Notice that the scene-button line lives in `app.js`'s `experiments` object; updating demo conversation alone does not change a directly clicked authored performance.

Then change the live identity prompt in `server/ai.mjs` and restart the server. The backend is separate from browser reload. The demo script and the live prompt are two ways to implement the same character tone.

This teaches you where authored performance, demo conversation, and generated conversation differ.

### Exercise B: Give Director a new material

In `orb-state.js`, change the Director palette. Reload and switch Director. The palette becomes a `u_color` uniform in the shader. Then change the exponent of `thread` in `orb-shader.js`: a higher exponent narrows the current lines. Reload and compare.

Keep the sphere, timing, and dial stable so NOX remains recognisable. Separate a state decision from a material decision.

### Exercise C: Add a new power called `shrink`

Work through the full contract rather than changing a single switch:

1. Add `shrink` to `ACTIONS` in `shared/character.js`.
2. Add a test showing a valid shrink packet retains the action and a demo shrink request returns it.
3. Add a demo route in `brain.js`.
4. Describe the actual power in the prompt in `server/ai.mjs`.
5. Add a shrink branch in `Stage.animateScene()` to reduce `this.character.scale` over time.
6. Add a scene label and authored line in `app.js`.
7. Add a button with `data-scene="shrink"` in `index.html`.
8. Run tests and the syntax checker; reload and verify it. Confirm Reset restores scale to one and reduced-motion mode leaves the effect static or disabled.

The packet schema uses the shared action list, so updating the list also updates the schema enum. The runtime validator and body still need their own appropriate handling.

## 15. Interview questions and strong answers

**Why did you separate the brain from the body?**

The body requires predictable rendering state, while conversation can come from a script, a remote model, or a future local model. A validated packet lets us change the brain without rewriting the character renderer.

**How do you stop a model from doing something unexpected?**

We define a finite action vocabulary, request structured output, validate again at runtime, and execute only our own implementations. No model-produced code is evaluated. The scene has a reset path and a bounded lifetime.

**How does he remember someone?**

The browser stores a versioned notebook. We recall that data at startup and optionally include a bounded subset in model context. Persistence and prompt context create continuity; they are not model training.

**Why Canvas instead of generated video?**

Canvas lets us render expressions and reactions immediately from state, reuse the same character identity, and combine camera and captions. It does not require a new generated clip for every movement. Language generation remains an optional separate cost.

**Why plain JavaScript rather than a large framework?**

The first release is a canvas and a small set of controls. Native modules and browser APIs make the behaviour easy to trace and remove an installation step. A larger product might justify a component framework; this version does not need one to deliver its core interaction.

**How do you handle latency?**

The core loop runs independently from network requests. We show a pending state, prevent overlapping sends, time out provider calls, cancel obsolete browser requests, and ignore stale replies after persona or scene changes.

**Is the camera part of model vision?**

No. It is a local preview drawn into the scene. The model receives text and bounded notebook context. Vision would require a deliberate new capture/transmission path and its own latency/cost decisions.

**Is the core responding to actual sound?**

Its energy is an authored speech envelope. Voice events align the active interval, but the glow does not analyse sound samples. An AudioContext analyser connected to a real audio stream would be a separate implementation.

**What would you change for production?**

First validate that the interaction is worth returning to. Then introduce a consistent audio voice, measured conversation quality, reliable media capture, persistence suitable for accounts, authentication, cost controls, logs, and deployment operations. Hand tracking or vision should be added only when it creates a worthwhile interaction.

**What is the business's defensible part?**

The character identity, animation/interaction engine, authored powers, repeatable original formats, and audience relationship can become assets. Access to a general language model alone is easy to reproduce. Product and audience evidence would still be needed before claiming a moat or revenue.

## 16. How to prioritise the next release

1. Meet NOX and tune expressions and tone until the character is enjoyable.
2. Enable a real model and evaluate twenty ordinary conversations, including name recall and scene requests.
3. Choose a consistent voice and verify recording it end to end.
4. Add one camera interaction, such as holding him on a tracked palm.
5. Produce three distinct shorts and learn whether viewers care about the character, the technical experiment, or both.

An endless feature list is less useful than one interaction people want to repeat.

## 17. References used for the integration

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): strict schema configuration and structured text format.
- [GPT-4.1 mini model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini): the default model's supported interfaces and structured outputs.
- [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis): browser voice service.
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia): browser media permissions and streams.

This guide describes this release's code. Availability and provider behaviour should be verified again when changing models or deploying the product.

Visual references and asset attribution: see [NOX-VISUAL-DESIGN.md](NOX-VISUAL-DESIGN.md). The GLSL, dial, icons, and console are original code. The locally bundled Manrope font is distributed with its OFL license.

## 0.4: The new brain, voice and cloud boundary

Read this section with [DEPLOYMENT.md](DEPLOYMENT.md). The earlier sections trace the existing character engine; this section explains the added interfaces and how to defend their design in an interview.

### What gives NOX fresh replies?

A model does. `server/ai.mjs` exports IDENTITY, the prompt defining NOX's voice and actual capabilities. `server/providers.mjs` imports that identity and adapts a common input `{message, context}` to each provider. The prompt is behavior guidance, not a hardcoded set of sentences or model training. The same recent conversation and bounded notebook create continuity across requests. Different providers can interpret the character differently.

The browser chooses a provider ID, never a URL, API key or model name. The server looks up the ID in its configured catalog. Keys are read from environment variables only. Groq and NVIDIA use chat-completion messages; Gemini uses system instructions plus user/model contents and a JSON response schema. Responses pass through the same `normalizePacket` contract. Unknown actions become `none`. Invalid JSON or provider failure produces an error, not a concealed demo reply.

The offline demo is intentionally still available. It is labeled as such and chosen only when no brain is configured, access is locked, or you explicitly select it. Scene buttons remain authored repeatable performances in either mode: their predictable choreography is useful for filming. Their existence does not mean the conversation is hardcoded once a model is connected.

### Trace one cloud turn

1. `app.js` obtains the selected provider and a memory snapshot, adds the new user turn, and begins a generation in `turns.js`.
2. `prepareChatRequest` bounds the multibyte JSON request. `app.js` adds the provider ID; the browser includes its protected owner-session cookie on the same-origin request.
3. `server.mjs` checks the trusted host, origin, owner access, JSON type, body size, and text length. It chooses a configured provider and enforces the process-local request limit.
4. `providers.mjs` sends the prompt/context to a fixed external endpoint with a twenty-second timeout. Provider keys exist only at this boundary.
5. The reply is parsed and normalized. The frontend discards it if its generation is obsolete.
6. `perform` writes the caption/history, updates emotion and requested memory, starts the scene, and optionally requests speech from the same text.

### Why is the owner token separate?

A provider key grants broad access to an external API account. Giving that key to every visitor would expose it in browser source and network tools. An owner token grants only access to this app's guarded endpoints. The API verifies the entered token through constant-length SHA-256 digests using `timingSafeEqual`, then issues a signed HttpOnly session cookie (see the connection repair section below). Cloud requests fail closed if neither a valid session nor an accepted bearer is present, or the deployment has no configured owner token. It is prototype authentication, not user accounts, and is not appropriate to distribute to a public audience.

### How does voice cancellation work?

There are two async lifetimes: generating audio and playing it. `voice.stop()` increments a generation, aborts the pending browser fetch, detaches old playback handlers, pauses Audio, and revokes its Blob URL. After awaiting generation, `speak` checks its generation before allocating a player. Old callbacks also check the generation. This prevents an older reply from talking over a newer one or ending its mouth animation. It does not guarantee an upstream model computation already started on the server has stopped.

Text is limited to 420 characters, server audio to 2 MB, and API calls to twenty seconds. Groq's fixed speech model is Orpheus English, returning WAV. Browser voice remains a free fallback. Provider quota exhaustion is shown as an error and leaves the caption readable. Natural speech is disclosed as AI-generated.

### What exactly happens on Vercel?

The build separates static public assets from server modules. `scripts/build-vercel.mjs` creates `.vercel/output/config.json` with version 3, copies public assets and the exact shared browser module, and packages three self-contained Node 24 functions. Each function exports a wrapper around the existing Node request listener. `shouldAddHelpers:false` keeps the raw request stream, so the same JSON size validation works locally and in Vercel.

GitHub holds version history. Vercel deploys a specific commit after a push. A file save updates your working tree, not production. A successful deployment becomes the production website. Keys are Vercel environment settings, so they remain separate from Git and need a redeployment when changed.

### Interview questions for this update

**Why use adapters?** The personality and character contract are product logic. Provider request formats are replaceable infrastructure. Adapters keep a model switch from rewriting the face or UI.

**Can you promise unlimited free content?** No. Each service has quotas and terms. A sustainable product needs measured token/audio usage and a monetization plan. Free experimentation is different from a commercial launch.

**Why no automatic provider fallback?** An explicit switch makes it clear which service receives the notebook and which quota is being used. A failure stays visible; the app does not transmit the same conversation to another provider without the chosen switch.

**Is the rate limit a global cost cap?** No. Vercel can have multiple function processes, each with its own memory. Durable per-user quotas need shared storage and authentication. This version protects the personal cloud endpoints with owner access and relies on provider Free plan enforcement.

**Can NOX see me?** No. Camera preview is local Canvas composition. Vision requires a deliberate image pipeline and consent; nothing in this release sends camera frames to the model.

### A deployment lesson: build success versus runtime success

Our first Vercel build passed while its API invocation failed: the function bundle lacked an explicit module scope. The entrypoint was `.mjs`, but its shared dependency was `.js`. Local Node inferred ESM syntax; the hosted runtime treated that file differently, so named exports were unavailable. We added a minimal `package.json` declaring `type: module` inside every function directory and reproduced the hosted error in a subprocess with automatic module detection disabled. This is why integration tests must model the deployed environment and why a live smoke test follows a green build.

### Why a long reply needs WAV assembly

Orpheus accepts 200 characters; NOX can caption 420. The server splits longer speech near spaces, preserves Unicode surrogate pairs, generates the parts in parallel within the same twenty-second timeout, and joins compatible audio frames into one response. This is an API-contract adaptation, not a reason to truncate the character’s thought. Each part uses another speech request, so long replies consume more quota.

A WAV is a RIFF container, not just raw samples. `server/wav.mjs` scans named chunks, reads the `fmt ` format and `data` frames, rejects incompatible formats or unaligned samples, and handles streaming size markers. It writes a new RIFF header and data size for the combined frames. Float audio also gets a `fact` chunk with its frame count. Merely concatenating whole WAV files would leave repeated headers in the audio data. Tests use known PCM samples and deliberately reversed completion order to verify the assembled output, plus malformed/oversized inputs. [Microsoft RIFF format](https://learn.microsoft.com/en-us/windows/win32/xaudio2/resource-interchange-file-format--riff-) and [WAVEFORMATEX](https://learn.microsoft.com/en-us/windows/win32/api/mmreg/ns-mmreg-waveformatex) describe these container and frame fields.

The first voice failure had two independent boundaries: a provider model-term acceptance and the per-request input limit. Safe error categories distinguish terms, quota, credentials, input length, and format failures without retaining the upstream error message. The owner reviews model agreements personally; the code cannot waive them.

## 0.5 — From a single studio to a product

The home page and workspace now have different responsibilities. `public/index.html` introduces NOX with a full-height room, a live character, and direct entry points. `public/app.html` contains the working product: Explore, Conversation, Scene studio, Library, and Preferences. The server and Vercel routes map `/app` to this static document. There is no framework router or build-time rendering dependency. `public/js/navigation.js` interprets the workspace hash and shows the relevant panel, updates the current navigation item, and builds recent/history lists from real saved data.

The background remains the original image asset. NOX's body, lighting, eyes, mouth, gaze, blinks, and reactions are Canvas geometry. `face.js` draws a shaded charcoal shell behind the existing expression geometry; `landing.js` gives the same Stage a different placement and suppresses captions. `stage.js` observes pointer movement on the whole document, while dragging and pointer capture remain attached to the canvas. That distinction lets him look toward a sidebar or composer without intercepting clicks or covering your page with an input layer.

`preferences.js` reads motion from `nox.motion.v2`, falling back to an explicit old `nox.motion.v1` choice. Missing or inaccessible preference storage defaults to on. Both pages use that reader. Voice defaults on in the workspace but Browser remains the default engine; saved off choices and voice selections are preserved. An enabled setting cannot bypass browser autoplay policy: playback still follows user interaction. Camera and microphone remain optional, deliberate controls.

### The file map for this release

| File | Responsibility | Boundary worth defending |
| --- | --- | --- |
| `public/index.html`, `public/js/landing.js` | Home page and live introduction | Reuse the renderer; avoid a baked-in character image |
| `public/app.html`, `public/style.css` | Workspace panels, controls, and responsive visual system | Every navigation destination has visible, useful content |
| `public/js/navigation.js` | Hash views and real recent/search/export/delete UI | Render chat text with `textContent`, never model HTML |
| `public/js/history.js` | Local thread archive, migration, serialized writes, context, summaries | Keep the transcript separate from the model's context budget |
| `public/js/preferences.js` | Shared default/migration rule for motion | A default does not erase an explicit off choice |
| `public/js/app.js` | Turns, history/UI orchestration, provider/voice choices | Cancel before switching threads; await storage and guard stale callbacks |
| `public/js/stream.js` | Browser SSE reader | Partial text is a draft; final success is required to persist a reply |
| `server/providers.mjs` | Provider formats, stable prompts, stream decoding, summaries | Server owns models, keys, and fixed endpoints |
| `server/stream.mjs` | Bounded provider SSE and partial JSON speech decoding | Never execute a partial mood/action packet |
| `server/cache.mjs` | Expiring LRU cache and identical-work coalescing | Bound both memory and lifetime; never cache failures |
| `server/speech.mjs`, `server/wav.mjs` | Acting directions, bounded segments, compatible WAV assembly | Count directions toward provider limits and preserve text |
| `server.mjs` | Authorization, origin/host validation, API limits, SSE responses | Summary has the same owner gate as chat and speech |
| `scripts/build-vercel.mjs` | Static output plus five isolated Node functions | Explicit ESM package scope must travel with every function |

### A saved conversation is not the same thing as a prompt

The notebook contains the name and explicitly saved facts. The Library contains separate conversations. A thread has an ID, title from its first user message, persona, ordered user/assistant messages, a continuity summary, and the sequence number that summary covers. Retention is bounded to 40 threads and 200 messages per thread. Creating another blank conversation reuses the empty thread; it does not evict meaningful chats just because New conversation was clicked repeatedly.

`createHistory(storage)` is asynchronous because storage writes are serialized. Modern browsers use an origin-scoped Web Lock called `nox.chat-history.write`. Inside that lock, every mutation reloads the latest disk snapshot, applies its operation to a captured thread ID, then saves. Two tabs cannot each overwrite the other's work using stale snapshots. Appending to a thread deleted elsewhere returns false rather than resurrecting it. Storage events refresh other open workspaces. If the active conversation changed externally, its in-flight turn is canceled and the UI restores the updated transcript; changes to other threads only refresh the lists.

Node tests use an injected storage object and a queue shared by instances using that object. This fallback serializes within one JavaScript process. A browser without Web Locks is told to use one workspace tab because that fallback does not promise cross-tab safety. Storage failure leaves a visit-only archive and a visible explanation. Legacy history is cleared from the old notebook only after the new archive was actually persisted, preventing migration from deleting the only surviving copy.

The cloud prompt sends a compact summary plus recent turns, rather than the entire archive. Up to twelve unsummarized messages remain intact. When there are more, eight recent messages travel with bounded excerpts from older unsummarized turns. That bridge prevents a gap while a background summary is delayed, canceled, or fails. It is an excerpt budget, not perfect or unlimited recall. `sanitizeContext()` bounds the summary to 1200 characters, the bridge to 1600, recent message text to 600, and the full encoded HTTP request to 16 KiB by dropping older context when necessary.

After twelve older messages accumulate outside the recent eight, `summaryWork()` selects at most 24 old messages and keeps the encoded batch below its budget. Three seconds after a successful reply, the app requests `/api/summary` if no new turn has started. The selected provider compresses the previous summary and that old batch into an updated continuity note. Applying it verifies that the thread and covered sequence still exist and that it advances coverage. The retained transcript is untouched. A newer foreground send cancels the browser's pending summary request; that cannot guarantee an already-running upstream model used no quota.

### Streaming changes when you see words

A model request starts with the fixed character identity and JSON schema. Dynamic persona/notebook/summary data comes afterward, followed by recent messages and the current user message. Groq and NVIDIA use their fixed OpenAI-compatible chat endpoints; Gemini uses its streaming generation endpoint. Groq requests low reasoning effort for the current GPT-OSS model. Nemotron 3 requests thinking off for short character turns. These settings are workload choices, not a claim that one model is always faster.

The provider adapter receives JSON text gradually. `partialSpeech()` locates the speech string and decodes complete escapes without displaying an unfinished surrogate pair. It emits text only. The complete response must have a successful provider finish reason, valid JSON, and a normalized character packet before any scene action or saved assistant reply is accepted.

The NOX server emits this small SSE protocol:

```text
event: text
data: {"delta":"Oh, "}

event: text
data: {"delta":"you found me."}

event: final
data: {"speech":"Oh, you found me.","emotion":"curious","action":"none","memory":"","metrics":{"firstTextMs":350,"totalMs":700,"provider":"GroqCloud"}}
```

Those numbers are illustrative. The actual UI shows measured server-side first-text and completion times for the request; they exclude work before the server timer begins. An error event or closed stream is a failed draft. The final event replaces the draft and persists one assistant message. Changing thread, persona, provider, or scene cancels the current turn. The turn generation guard prevents a delayed result from animating a different conversation.

Text deltas avoid repeatedly transporting the entire growing reply. The browser still understands the older cumulative speech event format during a deployment transition. Its one-MiB transport limit accommodates a valid 420-character Unicode reply in that older format while bounding invalid responses. Text and final packets remain independently bounded. Captions can appear before completion; spoken audio waits for the validated final packet so NOX does not act on an unfinished answer.

### Three different things people call caching

1. **Provider prompt caching:** Groq can reuse computation for an identical prompt prefix on supported models. Stable identity/schema first improves that opportunity. The provider decides whether a hit occurs; the app neither implements its GPU KV cache nor guarantees a hit. [Groq prompt caching](https://console.groq.com/docs/prompt-caching).
2. **Speech result caching:** `server/cache.mjs` holds at most twelve audio entries / twelve MiB for five minutes in one warm function process. The key hashes credential, provider, voice, mode, emotion, and exact text. Matching in-flight requests share one job. A failure is removed and a later request can retry. Cold starts and other Vercel instances start empty. The API reports hit/miss in a response header; no credential or text is logged in that key.
3. **Conversation context compaction:** A summary reduces repeated old text sent to the model. This is memory management, not cached reply generation. It consumes an extra model request and can lose nuance, so the full local transcript is retained independently.

There is no semantic cache of whole character replies. Reusing a response to a vaguely similar prompt would risk stale answers, wrong context, and the repetition the product is intended to avoid. Self-hosted techniques such as GPU KV-cache scheduling and speculative decoding belong to the provider's serving layer; our Vercel app cannot enable them by adding a browser flag.

### Giving voice a mood

`perform()` passes the packet emotion to `voice.speak()`. Browser speech adjusts rate and pitch modestly and offers installed English voice selection. Orpheus supports a small prefix such as `[warm]`, `[deadpan]`, or `[whisper]`, followed by the same caption text. Mode and emotion choose the direction; voice selection chooses Austin, Troy, Daniel, or Hannah. Each directed segment stays within 200 characters. The body still receives the clean caption, so acting tags never appear as dialogue on screen. Delivery is model-dependent and deserves a listening test on the actual device. [Orpheus vocal directions](https://console.groq.com/docs/text-to-speech/orpheus).

### Explaining this in an interview

**Why native JS instead of adding a framework?** This product already has a small static frontend, a renderer, and isolated server endpoints. Separate documents and focused modules meet the navigation/history requirements without introducing an unrelated migration. A framework becomes worthwhile if routing, account state, and component reuse grow enough to justify it.

**What did you do for latency?** Stream first words, preserve a stable cache-friendly prompt prefix, bound and compact context, disable unnecessary long reasoning for companion turns, coalesce identical speech work, and measure the request timings. There is no credible universal speedup percentage without comparable production measurements.

**How do you prevent a stale result from leaking into another chat?** Capture the conversation/turn identity, cancel on a switch, and check the generation after asynchronous work. Storage mutations also capture thread IDs and run against fresh state under a lock. Deleting a thread cannot change the target of an already-queued append.

**Why retain the transcript after summarization?** Summaries are lossy context aids. The transcript is the user's record, supports search/export/reopen, and is never replaced by generated notes.

**Is NVIDIA enabled just because its option appears?** No. Its adapter and tests are in place, but a private server key and model access are required. The owner deferred setup while NVIDIA's site was unavailable. Credentials never belong in client code. The deployment guide contains the exact activation steps.

### The character who follows you down the page

`public/js/peek.js` adds the home-page corner cameo. It does not create another character. The existing `Stage` updates one Face's gaze, blink, mood and clock; the room canvas and a small transparent corner canvas draw that same state. The corner tilts his body slightly and crops it against the viewport edge so he appears to peek rather than occupy another panel. Its CSS uses `pointer-events:none`, so the links beneath remain clickable.

`createPeekState()` separates the scroll decision from drawing. It docks after the character's original bottom edge passes 12 pixels above the viewport, and returns once that edge reaches 64 pixels inside it. Different enter/return thresholds are hysteresis: tiny scroll changes around a boundary cannot repeatedly flip the state. The transition approaches its target using `1 - exp(-12 * dt)`, making the speed depend on elapsed time instead of frame count. A saved motion-off preference snaps directly to the target.

`attachPeek()` supplies two optional Stage frame hooks. Before the character update it measures the room, selects the presence, and translates the real viewport cursor relative to the corner face. After the frame it projects the same character into the corner canvas. His original position stays intact, including a position changed by dragging. Returning fades the corner away while restoring the body in the room. A pointer entering the corner earns one wink per entry. The room stops drawing while completely off-screen, but the single animation clock keeps the corner alive. `tests/peek.test.mjs` verifies the boundary hysteresis, restored scroll positions, motion-off transitions and gaze direction.

**How would you explain this interaction in an interview?** Character state belongs to the simulation; location belongs to the view. One character can have two temporary projections without two independent animation loops or conflicting eyes. Scroll state selects the view, and pointer coordinates are converted into that view's frame of reference.

### Connection repair and a more expressive character

The repeated replies were coming from `brain.js`, the scripted demonstration, rather than Groq. Previously, reloading removed the visit-only owner token and silently selected that demo. `connection.js` now distinguishes loading, locked, unconfigured, live and explicitly selected demo states. A locked send keeps the typed thought and opens Preferences; it does not archive a fake assistant answer. Unlock chooses the configured model automatically. A failed cloud request stays an error instead of becoming a scripted success. Scene controls remain usable without AI and no longer speak the same fixed line each time.

Live QA also uncovered Groq `json_validate_failed` errors in its older JSON-object streaming mode. GPT-OSS now uses strict JSON-schema output, which constrains generation to the character contract. Groq currently does not support token streaming with strict schemas, so the validated complete speech travels through the app's SSE channel immediately before its final packet. The displayed first-text and completion times are therefore nearly identical for this path. NVIDIA/Gemini continue token streaming. This chooses reliable character packets rather than pretending the API supports both modes together. Supported Groq schema models are explicit; other configured models retain their existing JSON-object path. [Groq structured output documentation](https://console.groq.com/docs/structured-outputs).

`server/session.mjs` mints a twelve-hour session containing an expiry and random nonce, signed using HMAC-SHA256 with the server's owner token. The signature binds the session to its host. `/api/session` POST requires the correct bearer and exact same origin, then returns a host-only HttpOnly cookie, SameSite=Strict and Secure on Vercel. Normal requests use the cookie, whose contents page JavaScript cannot read. DELETE clears it. The server rejects expired, altered, wrong-host and wrong-key sessions. Changing the owner token invalidates all signatures. This stateless prototype cannot revoke one copied session individually; clearing the browser cookie signs out that browser, while key rotation signs out all sessions.

Face touch behavior is a separate temporary layer over dialogue emotion. Four pokes inside 1.2 seconds make him annoyed for two seconds; alternating gentle pokes briefly squeeze his eyes into `><`. A real drag, after six pixels of movement, sets `held`, widens his eyes, looks down and gives a small body tilt. Releasing, canceling or resetting clears it. These gestures never change the model's saved emotion. Annoyed, surprised and shy are also supported structured model emotions. Takeover enlarges NOX to fit the available stage and moves the scene into view; it never takes operating-system permissions. Clicking the active scene again stops it.

`speech-envelope.js` measures 20-millisecond RMS windows from PCM16 WAV audio locally. Quiet windows become zero. `voice.mouthLevel` samples that envelope at the audio player's actual playback time. The existing Stage frame transfers the level to Face, so no second animation clock is needed. During a speaking pause Face draws a closed line; during speech its opening follows amplitude. This is sound-energy animation, not phoneme recognition or exact lip-reading. Unsupported audio formats fall back to estimated text timing.

Browser speech uses separate sentence utterances and a short closed-mouth gap. Where available, word-boundary events correct the mouth pulses; otherwise text length estimates them. Those events are not universally supported, so browser timing is less exact than measured WAV playback. Cancellation clears pending sentence timers, audio blobs and old callbacks. See [MDN boundary events](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event).

Automatic browser voice selection now favors recognized male voice names before natural-voice quality, with modest boyish pitch. Orpheus starts with male Troy and slightly raised playback speed/pitch; Austin and Daniel remain male alternatives. The v2 speaker preferences reset older selections for this requested default, then preserve new manual choices. The result is still generated speech; its subjective character needs a listening check. [Groq's voice and direction documentation](https://console.groq.com/docs/text-to-speech/orpheus).
