# NOX connection and expression repair

**Goal:** Real conversation should be the clear default; touch and speech should feel like a playful boyish character.
**Architecture:** Preserve the private owner gate using a signed, HttpOnly, SameSite=Strict session cookie, valid for twelve hours and bound to the current host/key. Explicit demo selection stays available for offline experiments. Face remains one simulation; transient held/poke reactions never overwrite dialogue emotion. Voice supplies an audio amplitude or browser utterance envelope to the Stage clock.
**Stack:** Native Node/Canvas/JavaScript, existing Vercel functions, no new runtime dependencies.
**Constraints:** Free provider plans; no keys in client storage; preserve history and existing scene toggles. Respect explicit motion/voice preferences. Keep deployed changes on the established main → GitHub → Vercel workflow.

## Connection repair
- [ ] Test signed sessions: unlock, reload-cookie authorization, expiration, tampering, host/key rotation, foreign origin and logout-cookie clearing.
- [ ] Add server/session.mjs and /api/session; include its Vercel function.
- [ ] Distinguish loading/locked/unconfigured/live/explicit demo in public/js/connection.js and app.js. Block unsent cloud turns while locked. Add a visible Unlock AI action and retain typed text.
- [ ] Scene buttons run effects immediately without repetitive scripted dialogue. Explicit takeover text executes the effect and still obtains a model reply when live.

## Touch expressions
- [ ] Test held gaze, spam annoyance, temporary squeeze eyes, release/cancel, and restoration of underlying emotion.
- [ ] Extend Face transient reactions and Stage drag handling; add annoyed/surprised/shy model emotions.
- [ ] Make takeover visibly occupy the stage, including a static composition with motion off.

## Voice and mouth
- [ ] Test male automatic voice selection, sentence gaps, stale boundaries, natural audio silence and interruption cleanup.
- [ ] Add pure speech envelope helpers: PCM WAV amplitude windows and text timing fallback.
- [ ] Use the existing Stage frame to sample Voice.mouthLevel; close the mouth during silence, pauses and audio loading.
- [ ] Default to a male browser voice with modest boyish pitch; retain manual voice choices. Orpheus defaults to male Troy; label choices clearly.

## Release
- [ ] Full verify and targeted independent review.
- [ ] Browser QA: locked flow, local fixture conversation, clicks/drag/takeover, speech pauses, mobile and home peek.
- [ ] Update founder/deployment notes, push verified update, inspect Vercel Ready, test live status and UI. Hand off private-token entry for a production listening/model check.
- [ ] Stop the temporary local preview after QA.
