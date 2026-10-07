# NOX Laboratory Implementation Plan

**Goal:** Deliver the user's full editorial/science-fiction revamp with useful free AI upgrades and an understandable architecture.

**Architecture:** Preserve vanilla Stage/Face and app controllers, add bundled React islands and a lazy Three.js homepage scene. Keep five existing server endpoints and extend validated context with depth and local knowledge excerpts.

**Tech stack:** React, Three.js, GSAP, Motion, Lenis, React Spring, esbuild; existing Node 24 server and Vercel functions.

**Spec:** ../specs/2026-10-07-nox-laboratory-design.md

## Global constraints

Free tiers only. Preserve `/`, `/app` and workspace hashes. Keep the legless blob, real AI/demo distinction, owner authentication and private keys. No fictitious AGI claims. Each animated property has one owner. Existing untracked `docs/research/` belongs to earlier work and is excluded from this change.

## Tasks

- [ ] Bundle locally pinned dependencies before development/production builds; verify JSX and preserve server function packaging.
- [ ] Build homepage sculpture, responsive editorial sections, menu/demonstrator and scroll peek. Preserve native keyboard/touch, static fallback and reduced motion.
- [ ] Add shared tokens and redesign every workspace panel, preferences, composer, scene controls and recording preview without changing controller IDs.
- [ ] Add React command palette and local knowledge notebook with accessible native dialogs, bounded text import, delete/export/enable controls and retrieval source display.
- [ ] Test retrieval relevance, long-document tail, irrelevant queries, quotas and persistence errors; implement deterministic local retrieval.
- [ ] Test and implement answer-depth sanitization/provider budgets, untrusted knowledge context, explicit memory consent, failed-unlock throttling.
- [ ] Integrate depth and retrieved context into send path, preserve full written answer/history while bounding speech separately; fix reduced-motion and shortcut handling.
- [ ] Write founder manual and update deployment/security documentation with actual limitations and primary sources.
- [ ] Run complete verification, dependency audit, independent review, browser routes/forms/desktop/mobile/3D/keyboard checks; fix findings.
- [ ] Commit and push authorized changes; verify production update and report evidence.

## Review focus

1. No canvas/controller remounts or duplicate handlers during hash navigation.
2. Long answers survive stream, normalization and history rather than truncating at the old 420-character limit.
3. Knowledge delete/disable/storage failure and cross-tab reads are honest; imported text cannot execute HTML or override application privileges.
4. WebGL failure, reduced motion, mobile touch and focus restoration keep the app usable.
5. Same-origin, session, lock, provider failures and quota errors remain explicit; no scripted fallback or leaked secrets.
