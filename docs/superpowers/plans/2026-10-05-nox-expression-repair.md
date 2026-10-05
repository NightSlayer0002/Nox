# NOX connection and expression repair

**Goal:** Real conversation should be the clear default; touch and speech should feel like a playful boyish character.
**Architecture:** Preserve the private owner gate using a signed, HttpOnly, SameSite=Strict session cookie, valid for twelve hours and bound to the current host/key. Explicit demo selection stays available for offline experiments. Face remains one simulation; transient held/poke reactions never overwrite dialogue emotion. Voice supplies an audio amplitude or browser utterance envelope to the Stage clock.
**Stack:** Native Node/Canvas/JavaScript, existing Vercel functions, no new runtime dependencies.
**Constraints:** Free provider plans; no keys in client storage; preserve history and existing scene toggles. Respect explicit motion/voice preferences. Keep deployed changes on the established main → GitHub → Vercel workflow.

## Connection repair
- [x] Test signed sessions: unlock, reload-cookie authorization, expiration, tampering, host/key rotation, foreign origin and logout-cookie clearing.
- [x] Add server/session.mjs and /api/session; include its Vercel function.
- [x] Distinguish loading/locked/unconfigured/live/explicit demo in public/js/connection.js and app.js. Block unsent cloud turns while locked. Add a visible Unlock AI action and retain typed text.
- [x] Scene buttons run effects immediately without repetitive scripted dialogue. Explicit takeover text executes the effect and still obtains a model reply when live.

## Touch expressions
- [x] Test held gaze, spam annoyance, temporary squeeze eyes, release/cancel, and restoration of underlying emotion.
- [x] Extend Face transient reactions and Stage drag handling; add annoyed/surprised/shy model emotions.
- [x] Make takeover visibly occupy the stage, including a static composition with motion off.

## Voice and mouth
- [x] Test male automatic voice selection, sentence gaps, stale boundaries, natural audio silence and interruption cleanup.
- [x] Add pure speech envelope helpers: PCM WAV amplitude windows and text timing fallback.
- [x] Use the existing Stage frame to sample Voice.mouthLevel; close the mouth during silence, pauses and audio loading.
- [x] Default to a male browser voice with modest boyish pitch; retain manual voice choices. Orpheus defaults to male Troy; label choices clearly.

## Release
- [x] Full verify and targeted independent review.
- [x] Browser QA: locked flow, local fixture conversation, clicks/drag/takeover, speech pauses, mobile and home peek.
- [x] Update founder/deployment notes, push verified update, inspect Vercel Ready, test live status and UI. Hand off private-token entry for a production listening/model check.
- [x] Stop the temporary local preview after QA.

## Follow-up: persistent gravity and identity
- [x] Preserve gravity across pickup, cancellation, release and the ten-second scene timeout; pause velocity while held, then fall and settle on release.
- [x] Add a transient falling expression and downward gaze; reset/toggle-off clears it and reduced motion remains static.
- [x] Clarify NOX's identity independently of its inference provider, then check a real Groq identity reply in production.
- [x] Verify the drag/release loop, update the founder guide, review, push and confirm the automatic production deployment.
