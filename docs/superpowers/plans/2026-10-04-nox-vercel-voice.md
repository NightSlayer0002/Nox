# NOX Vercel and Voice Implementation Plan

> Execute inline with superpowers:executing-plans. Use meaningful failing tests before behavior changes, and requesting-code-review before completion.

**Goal:** Prepare NOX for Vercel, explain Git-based updates, fix scene toggles, and add an optional natural voice.

**Architecture:** Keep the native frontend and local Node server. A build script emits Vercel's Build Output API: static public assets plus three small Node function entrypoints that reuse the existing validated server handler. Cloud paid endpoints require an owner access token; browser speech remains available without credentials. Natural speech is generated server-side, played as an audio blob, and canceled with generation guards.

**Tech stack:** Native JS, Node 24, Canvas/WebGL, Vercel Build Output API v3, optional OpenAI speech API.

**Constraints:** No passwords/keys in chat, Git, or public assets. No account creation or Terms acceptance on behalf of the user. No live paid API calls during verification. Keep webcam preview local and existing exports silent. Preserve local startup. Deployment ownership and paid/public access depend on user account setup.

- [x] Scene programs: clicking the active program resets it, updates pressed state, and stops speech without adding another reply.
- [x] Browser voice: prefer natural/neural voices when present and stop artificially lowering normal pitch. Test voice selection and stale callback protection.
- [x] Optional natural speech: bounded text, fixed server-selected model/voice/instructions, bounded audio response, cancel-safe blob playback, explicit AI-generated voice disclosure.
- [x] Cloud boundaries: trusted host/origin allowlist, protected paid chat/speech, unchanged local demo, Vercel request compatibility, no secrets in status.
- [x] Deployment output: copy only public/shared static assets; package backend code into Node functions; exclude .env, artifacts, and docs; verify emitted output with tests.
- [x] Deployment teaching: accounts, Git repo, exact Vercel settings, environment variables, production vs preview, commit/push steps, and honest live verification status.
- [ ] Run full tests/check/build, browser-check scene toggles and voice controls, independent review, then publish only once account access is available.

Superseded by the 0.4 cinematic/provider expansion in 2026-10-05-nox-cinematic-brains.md. Natural speech now supports Groq Orpheus first; OpenAI remains optional legacy. Account/key setup and actual online verification remain pending.
