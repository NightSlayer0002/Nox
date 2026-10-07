> Historical build record through 0.3. For 0.4 use DEPLOYMENT.md, NOX-VISUAL-DESIGN.md, and the 2026-10-05 implementation record.

# NOX build log

## Face + dark console / 0.3

User steering: restore the expressive face, make interactions obvious, and use dark neumorphism. Face is the default again; Core is an optional appearance. Face and Core share the bounded signal/conversation state; switching clears scene transforms without dropping speech, emotion, activity, or glow. No runtime dependencies added.

Visuals: charcoal housing, ivory typography, amber accents, soft raised media/program controls, inset input wells, glass stage bezel. Live Canvas capsule eyes and mouth, bounded gaze, blink, temporary poke smile, left-eye wink, speech mouth, and persona expressions. The core now has visible parallax, breathing, click swell, and ripple.

Root cause: the preview browser reports reduced motion enabled. The previous orb froze its shader travel; the UI did not explain that state. Animation now has a visible on/off control, with a saved explicit choice under nox.motion.v1. System preferences apply until overridden; notebook clearing does not reset appearance preferences. Motion off retains direct dragging, expressions, a static wink, and fixed pulse acknowledgement.

Review fixes: pointer release cannot overwrite a reset without an active drag; Escape clears a drag; only the pointer owning a drag can move/release it. Face Gravity and Takeover reserve caption clearance. Startup Director expression and version/copy are consistent. Added meaningful interaction and geometry regressions, observed failing reset and pointer-ownership tests, then verified fixes.

Final browser evidence: live gaze tracked left and right (-17.76 / +17.71 design units), poke smile and drag were visible; Core used WebGL with visible parallax. Face Takeover spoke above its caption. Phone layouts at 390 and 320 fit the viewport; the smallest media controls received a layout fix and a fresh visual check. Motion on persisted across reload. A silent portrait Face WebM loaded at 320×569 with readyState 4 and no media error. Browser error/warning logs were empty. Desktop proof saved to artifacts/nox-dark-face.jpg; the temporary viewport override was reset.


Final automated evidence for 0.3: npm test 41/41 passed; npm run check verified 22 JavaScript modules. Independent re-review closed every Important finding. The founder and visual guides explain the revised architecture, pointer ownership, shared state, shadows, and saved animation preference.

## Signal core redesign / 0.2

Authorization: user requested a less generic frontend and a faceless orb with analog / neumorphic material, inspired by ThreeUI, GSAP, ShaderGradient, Motion, Componentry, and Manus. Implemented directly in the existing native app.

Visual implementation: original GLSL smoked-glass sphere with domain-warped contour currents; amber Companion, cool metallic Director, red Uncanny. Real pending requests drive a scanning arc. Listening and speaking have separate activity responses. Luminance control, engraved dial, grain, bevel, recessed / raised controls, original SVG icon system, locally bundled OFL Manrope font. No premium component source copied. No runtime npm dependencies added.

Architecture: orb-state.js is pure state; orb-shader.js owns one offscreen WebGL context; orb.js positions and composites it into the existing Canvas world. Echo reuses one material render per frame. Shader resolution is capped at 768 square. Canvas fallback and lost/restored context behavior are implemented; actual GPU rendering was observed, while fallback appearance was not forced through browser hardware settings.

Review fixes: true 9:16 film dimensions on narrow screens; recording canvas metrics locked through finalization and released afterward; radius-aware gravity floor; generation guard for old speech callbacks; darker functional labels; ArrowKeys and Space equivalents for moving/pulsing the canvas. Added and observed failing regressions before the recording-lock, speech-ownership, and keyboard fixes.

Browser evidence: WebGL data-renderer reported webgl with no error/warning logs. Verified Companion and Uncanny palette, luminance to 100, actual thinking state during a demo request, orbit response, narrow layout at 390 and 320 wide with no horizontal overflow. A shader/orbit/caption WebM preview loaded at 506×900 with readyState 4 and no error. Resize test kept the capture at 390×694 while its CSS display changed to 506.25×900, then backing size caught up to 506×900 after finalization. Export remains silent. Clip file saved to disk is not claimed; the app exposes a preview and Save clip link.

Documentation: founder guide migrated from face geometry to the signal core. NOX-VISUAL-DESIGN.md explains every changed file, state priority, noise/domain warping, sphere reconstruction, lighting, compositing, costs, source attribution, and interview answers.

Final automated evidence: npm test 29/29 passed; npm run check verified 20 JavaScript modules. Final browser logs contained no warnings or errors. Saved the amber studio, red Uncanny view, and an encoded clip preview under artifacts/. Independent review findings were closed, including the final contrast adjustment to #5c694f for Talk and suggestions.

Previous build history follows.

User authorization: "start making him, lets have him first". Implementing directly in the provided empty workspace and teaching the result. No Git repository exists, so there is no branch/worktree or commit flow.

Ruling: deliver a usable local first release with a labelled demo brain and optional server-side model connection; keys and camera access are not assumed. This lets the user meet the character before configuring services.

Ruling: proceed with the requested build in this conversation rather than adding approval round trips for the design and plan. The user's explicit instruction to start takes precedence over the skills' default handoff workflow.

Ruling: native implementation here; no implementer delegation. A final independent review may be used only if required by the selected execution skill.

Pre-flight: the packet contract is shared by demo brain, optional provider, and app. Memory API is used by app and passed as sanitized context to either brain. Stage only consumes actions from the shared allowlist.

Task 1: complete — eight core tests passed after test-first implementation. An initial browser-root import failed in Node; relative shared-module imports now work in both environments.

Task 2: complete — six additional real HTTP/provider tests passed. The model integration follows the fetched official Responses structured-output documentation. No API key was provided or live call made.

Task 3: implemented — canvas character, five authored scenes, three personas, chat/memory, optional voice/camera, portrait mode, and silent WebM export. Browser showed name persistence, remembered fact, gravity performance, and responsive layout.

Final review: fresh reviewer found three P2 issues: stale replies after Reset/Escape, recording-session stop/start ownership, and UTF-8 chunk corruption. All were addressed. Regression tests were observed failing before the corresponding fixes; suite now 19/19, syntax checked 16 modules.

Final review minor: off-centre drag snapping was corrected by applying the existing drag offset. Film mode now has its own recording control. AI status says configured until a successful call rather than assuming account access.

Remaining external verification: actual OpenAI account/model invocation, physical camera, and audible browser voice depend on user configuration/device and were not invoked by the agent.

Final media verification: encoded a real portrait WebM in the in-app browser; its preview loaded at 506×900 pixels with readyState 4 and no media error. The browser automation did not expose a blob-download file event, so final file-download delivery is not claimed. Added an explicit preview and Save clip link, protected by a new lifecycle regression test.

Final context verification: added null-context recovery and byte-budget trimming for long Unicode conversations after identifying that character-count bounds alone could exceed the HTTP byte limit. Observed both tests fail, then pass after the fix.

Task 4: complete — founder guide covers all files and includes architecture, animation mathematics, contracts, persistence, media, tradeoffs, extension exercises, and interview questions. Final automated verification: npm test 22/22 pass; npm run check 16 modules pass. Browser checks covered real rendering, name/fact persistence, scene action, Escape cancellation from the textarea, portrait mode, packet inspector, and encoded video preview. Optional hardware/media voice permissions and live API were left for the user's device/configuration.

## October 7, 2026 — NOX Laboratory 0.8

Implemented the authorized full design brief: shared ivory/charcoal/teal system with a dark-room option, editorial homepage, real lazy Three.js context-panel sculpture, React interface islands, command palette, local text/Markdown knowledge notebook, answer depth, larger Groq Deep model, full written-history retention and independent bounded voice preview. Existing routes, legless blob, reactions, scenes, owner gate and media controllers remain.

The fresh verification log is `artifacts/nox-laboratory-verify.log`: 153 tests passed, 64 modules syntax checked, JSX/client bundle and Vercel output built. npm advisory audit reported zero known vulnerabilities in the pinned dependencies. Independent review found demo memory opt-out and dynamic OS motion preference regressions; failing tests reproduced them, fixes passed, and re-review found no remaining concrete blockers.

Local browser checks covered real WebGL readiness and rotation controls, homepage mobile menu/tabs/scroll peek, desktop/tablet/phone composition, dark theme, command search, notebook add and source preview, owner unlock/reload, depth selection and complete 3,177-character fixture reply surviving reload. Recording produced a 1,664 KB silent WebM whose video loaded with readyState 4 and nonzero video dimensions. The fixture is explicitly a test model; these checks do not establish live Groq answer quality. GPU failure is covered by a static first-paint fallback and cleanup code review, rather than a claimed forced GPU-loss browser test.

The current founder manual is `docs/NOX-SYSTEM-MANUAL.md`, approximately 6,000 words. It distinguishes current capabilities from proposed future tools/accounts, serverless instance-local protections from distributed controls, and free evaluation terms from production entitlements. The earlier untracked `docs/research/` material was left untouched.

Release `5bf41b2` was pushed to `origin/main`; the production domain visibly served the new homepage and workspace, and the Three scene reported ready. The deployed Knowledge dialog loaded correctly. The local preview was stopped and port 3002 had no listener. Real Deep-model quality verification awaits an unlocked owner session; provider integration is verified by the automated fixture contracts. The developer inspector includes exact model/depth/timing metadata for checking real requests.
