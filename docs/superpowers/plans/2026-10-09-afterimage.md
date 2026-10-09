# AFTERIMAGE implementation plan

**Goal:** Turn one creative seed into six locally playable NOX short-film cuts.

**Architecture:** One protected generation produces a validated packet. A local
reception store and timed controller replay it through the existing Stage,
voice and recorder. A lazy React receiver presents the real branches.

**Tech stack:** Existing Node, React, Motion, Three/R3F, Groq/Gemini/NVIDIA;
React Flow 12.12.0 for the source-backed branch lattice.

**Spec:** `docs/AFTERIMAGE-DESIGN.md`.

**Constraints:** Existing routes/chat contracts remain. No paid service,
provider key in client code, camera vision, forecast claim or unlimited quota
claim. Owner, origin, 16KiB input, allowlist and rate gates apply. Store at most
12 receptions. Four 7-second cues; one bounded speech request for the cut.

**Review focus:** Cancelled requests must not publish stale results; route/tab
changes stop performances; malformed model output never acts; unavailable or
corrupt browser storage stays usable; recording ownership never affects an
unrelated existing clip.

## 1. Server contract and provider task

- [x] Add shared schema/sanitizer/normalizer and failing structural tests.
- [x] Add a separate provider task and authenticated `/api/afterimage` handler.
- [x] Verify origin/body/provider/cancellation/error/cache protections.
- [x] Add exact static shared module and Vercel function to the build.

## 2. Local reception and performer bridge

- [x] Test and implement bounded versioned reception storage.
- [x] Test and implement a four-cue timer with stale-generation protection.
- [x] Connect through private app closures to Stage, voice and recorder.
- [x] Verify stop, route change, hidden tab, export and recording cleanup.

## 3. Receiver and discovery

- [x] Add a lazy `/app#afterimage` view, sidebar and command-palette entry.
- [x] Add a labeled authored tutorial, seed/tone form and cancellable receive.
- [x] Adapt official React Flow nodes/edges to the real three-by-two branches.
- [x] Add script edits, selection, playback/capture, archive and exports.
- [x] Add a homepage invitation without replacing the loved choreography.
- [x] Verify focus, keyboard, mobile, empty/loading/error/live/example states.

## 4. Teach, review and release

- [x] Align the detailed manual with final code and real limitations.
- [x] Run full tests, syntax and production build; obtain focused code review.
- [x] Commit meaningful backend/performer/interface steps and push GitHub.
- [x] Verify Vercel, live example and connected generation if unlocked.
- [ ] Stop temporary preview helpers and provide a live screenshot/manual.
