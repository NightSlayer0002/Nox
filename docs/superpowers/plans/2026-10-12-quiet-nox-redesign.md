# Quiet NOX redesign implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent tasks; the controller integrates, reviews and commits each deliverable.

**Goal:** Make NOX a legible, quiet creative workspace with rectangular controls, a sourced brain Signal form and a minimal landing page.

**Architecture:** Keep native controller IDs, APIs, guest/owner storage boundaries and routes. Source assets are local and licensed; adapt their presentation through shared tokens and task-specific layouts. The existing animated character and scroll-linked logo remain NOX's identity.

**Tech stack:** Existing React, Three.js/R3F, Motion, GSAP, native canvas/HTML, Node test runner and Vercel.

**Spec:** User's screenshots, current chat request, and attached `Pasted text.txt` (October 12, 2026).

## Global constraints

- Deep charcoal, warm off-white and cream actions; Source Sans 3 with system fallback.
- 16px body/forms, 17–18px messages, 14–16px controls; normal tracking and sentence case.
- Rectangular controls with small corner radii, no decorative chevrons or arrow suffixes.
- Source real assets/code, preserve licenses; no AI-created decorative art or paid-media circumvention.
- Preserve authentication, quota checks, provider integrations and owner archive isolation.
- Guest storage is temporary; no public registration is invented.
- Brain visualization is a theme for the existing AI, not a claim of superintelligence or consciousness.
- Preserve the established scroll-linked face positions and explicit NOX motion preference; calm interface transitions respect system reduced motion.
- Existing `docs/research/` is unrelated and must not be staged.

## Review focus

- Input stays reachable without page scrolling at 1366×768 and preserves drafts across internal routes.
- Mobile navigation, composer and overlays fit the viewport and keyboard focus remains usable.
- Guest Afterimage offers the authored sample before requesting unavailable generation.
- Brain asset loading, failure/disposal and recording work without leaking resources or substituting a circle.
- Rectangular styling covers secondary screens, dialogs and loading/disabled states, not just primary CTAs.

## Task: shared visual language and landing (controller)

Files: `public/source-ui.css`, `public/source-buttons.css`, `public/home.css`, `client/home.jsx`, local Source Sans 3/font notices, vendor source ledger.

- [x] Inspect computed fonts and reference sites; source the official font and reusable licensed assets.
- [x] Replace pill/shimmer controls with flat rectangular primary/secondary actions without chevrons.
- [x] Simplify landing copy/navigation, remove ornamental numbering/status, retain face choreography and peeking.
- [x] Verify landing anchors, pointer/material interactions and responsive geometry.
- [x] Commit this independently with fresh build verification.

## Task: workspace layouts and guest journey

Files: `public/app.html`, `public/js/app.js`, `public/js/navigation.js`, new `public/product-workspace.css`, related UI tests.

- [x] Inspect current permissions/controller IDs; retain functional controls and routes.
- [x] Create compact shell/mobile menu and task-specific layouts.
- [x] Put conversation/history/composer first with a collapsible supporting NOX panel; keep input in the first viewport.
- [x] Prioritize stage and adjacent controls in studio; move advanced help/glow into disclosure.
- [x] Consolidate guest copy and Settings/Preferences; move model/appearance/effects to relevant secondary surfaces.
- [x] Verify route/draft preservation and available/blocked controls.
- [x] Controller reviews and commits workspace separately.

## Task: sourced brain Signal form

Files: `public/js/orb.js`, a brain renderer/adapter and source assets, `public/js/stage.js` only for required integration, brain tests/build entry if needed.

- [x] Find and verify an openly licensed anatomical mesh or brain vector/code asset; pin source and notice.
- [x] Add focused failing tests for load/failure/lifecycle and stage-compatible geometry/state.
- [x] Replace Signal's circle with the source-backed brain, reusing existing speech/activity/drag/effect state.
- [x] Keep GPU/render work bounded and draw output into captured stage canvas.
- [x] Verify tests, asset bounds, fallback and independent source documentation.
- [x] Controller reviews and commits brain separately.

## Task: Afterimage and secondary experience

Files: `client/afterimage.jsx`, `public/afterimage.css`, focused Afterimage tests if behavior changes.

- [x] Separate authored example from owner-only generation before input effort.
- [x] Simplify labels, actions, cue tape and exports; use rectangular controls without suffixes.
- [x] Keep existing receiver/store/performer APIs and truthful error/saving states.
- [x] Verify sample play, owner restriction, cancellation and draft retention.
- [x] Controller reviews and commits Afterimage separately.

## Completion

- [x] Full regression suite, syntax and production build.
- [x] Browser QA: desktop 1366×768, tablet, phone, keyboard, guest navigation/chat, studio, authored Afterimage, unavailable/error states.
- [x] Review final changes and source licenses; fix material findings.
- [ ] Finish pushing separate commits and verify Vercel Ready; local proof screens are captured.

## Verification record

- 284 automated tests pass; syntax checks cover 132 JavaScript modules; production Vercel build passes.
- Local browser QA covers 1366x768, 768x1024, 390x844 and the short 390x420 composer viewport, guest refresh isolation, draft recovery, navigation Escape, Signal brain, Orbit, film mode and Afterimage playback/owner gating.
- The local provider is an explicit fixture; this run does not claim live Groq or Orpheus verification. Live NOX browser access was blocked by an automatic approval service retry-limit error.
- Source assets include official Adobe Source Sans 3, Vercel AI Elements Button and BodyParts3D anatomy with their licenses and notices.
- The final review resolved saved Light contrast and keyboard visibility. Tablet QA also found an inherited horizontal sidebar breakpoint; explicit vertical sidebar layout removes its page-height offset.
