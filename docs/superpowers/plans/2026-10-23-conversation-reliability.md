# Conversation Reliability Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with independent agents for state grounding and voice lifecycle. Steps use checkbox syntax for tracking.

**Goal:** Make NOX's words consistent with his actual actions, improve the default free model and synchronize spoken replies without hiding text indefinitely.

**Architecture:** A shared bounded interface-state contract reaches all provider prompts; Stage records applied/no-op/stopped results. A presentation gate connects per-turn playback events to chat rendering. Provider selection stays server-owned with one bounded, reported fallback.

**Tech Stack:** Existing JavaScript/Node, structured provider replies, browser audio, Node tests and browser verification. No dependencies.

**Spec:** ../specs/2026-10-23-conversation-reliability-design.md

**Status:** Implementation committed and deployed. Full verification passes 848 tests, 260 syntax checks and the production build. Browser checks, bounded live scenario probes and exact code CI/deployment checks are recorded in the verification report, including provider failures and latency limits. Physical mobile hardware is unavailable and remains an explicit verification limit.

## Global constraints

- No per-phrase canned replies or extra quality-repair requests per chat.
- No paid provider or account/billing changes. Keep existing allowances and complete transcripts.
- Four seconds maximum additional wait for synchronized text; immediate user override.
- Stale or canceled turns must never reveal a late reply or consume avoidable speech requests.
- Separate commits by behavior; keep private docs/research untracked.

## Review focus

- Correction/negation vs command; already active effects cannot restart accidentally.
- Untrusted interface fields must not enter instruction text unsanitized.
- Audio `play()` acceptance is not evidence that playback started.
- Cancel, route changes, replay and calls must not reveal old content or trigger a scene twice.
- Quota fallback must be bounded, visible in metrics and never retry arbitrary provider failures.

## Tasks

### 1. Interface observations and coherent actions

Files: shared/interface-state.js, shared/character.js, server/ai.mjs, shared/product-capabilities.js, public/js/stage.js, public/js/app.js, focused interface/context tests.

- [x] Test bounded state sanitation, provider transport, last execution receipts and idempotent model actions.
- [x] Implement enum/boolean-only sanitizeInterfaceState and Stage applied/already-active/stopped/unavailable receipts; keep manual toggles.
- [x] Connect current client state at send time and update capability instructions.
- [x] Add chat-only stop without changing authored Afterimage action vocabulary.
- [x] Add generic correction/refusal/no-op scenario fixtures without canned phrase responses.
- [x] Evaluate scenario semantics against the updated live model and prompt; record the extra provider-invalid case without claiming semantic success.

### 2. Voice readiness and text presentation

Files: public/js/voice.js, server/speech.mjs, server/wav.mjs, public/js/reply-presentation.js, public/js/conversation-controls.js, public/js/app.js, public/app.html, focused speech/presentation/call tests.

- [x] Test actual playback vs play acceptance, failure/cancellation, unnecessary MP3 reads and already aborted synthesis.
- [x] Add per-turn playback callbacks and measurable latency while preserving legacy voice callers.
- [x] Test/implement a four-second presentation bound, Show text now, audio failure release, full transcript retention and stale-turn protection.
- [x] Keep voice-off streaming immediate, add concise preparing feedback and inspector preparation/playback timing.
- [x] Rebalance the first normal Groq speech clip without extra provider requests; preserve four-cue Afterimage planning.
- [x] Preserve completed written replies after call audio failure; release pending text and pause preparing calls when voice settings change.

### 3. Free model selection and evaluation

Files: server/providers.mjs, server.mjs, shared/product-capabilities.js, .env.example, scripts/evaluate-conversation.mjs, tests, research note.

- [x] Document official model/free-tier terms and quota facts in the model-selection specification.
- [x] Test/implement the production 120B default and one public guest 20B fallback only for quota/model-access failures before output; retain actual model metrics.
- [x] Add fictional scenario fixtures for correction, refusals, already-done actions, unsupported powers, attribution and ordinary reasoning, plus an explicit opt-in probe script.
- [x] Run bounded live probes against the updated release and record results/limits honestly.

### 4. Companion interface refinements

Files: public/js/floating-dynamics.js, public/js/floating-follower.js, public/js/floating-layout.js, public/js/floating-presence.js, public/js/message-companion.js, public/js/face-art.js, public/floating-presence.css, public/message-companion.css, focused companion tests.

- [x] Use larger viewport-bounded artwork and welcome-area initial placement; retain explicit Park and manually placed positions.
- [x] Add a damped spring follower and single landing rebound, sharing Stage's effective motion setting across gravity, follower and trail.
- [x] Add message dwell progress, target highlighting, excerpt/action descriptions, keyboard navigation and reachable hover action controls.
- [x] Enlarge and reposition sleep marks within the canvas, with clean fade through animation wrap.
- [x] Add focused movement, layout, message-menu, effective-motion and sleep-mark regression coverage.
- [x] Keep the short-phone empty welcome below NOX and scroll its content above the composer; remove the extra inset as soon as the conversation starts.

### 5. Verification and release

- [x] Run focused regression checks, review the combined change and fix material findings.
- [x] Run final full tests, syntax checks and production build for the release revision.
- [x] Exercise voice-off, synchronized voice, show-text override, error fallback, call dialog and mobile layouts in browser; exercise live action context with fictional API probes.
- [x] Record physical mobile verification limits separately from browser emulation (no Android or iOS device attached).
- [x] Commit and publish focused changes; verify exact code CI/deployment and save proof.
