# NOX: five refinements

Goal: expressive public Troy speech, audible video exports, temporary guest
conversations separated from the owner archive, source-backed buttons, and
homepage motion that follows visible content without overlapping the peeker.

The requested implementation proceeds inline. Existing routes and the loved
homepage remain. The previously verified AFTERIMAGE recovery changes finish
with the first contribution. No private archive is deleted.

## 1. Voice and capture

- Verify Orpheus's supported direction syntax; add meaningful acting changes
  while keeping Troy the default and all provider parts below 200 characters.
- Public Groq speech uses bounded text, origin/host checks and process-local
  public quotas; legacy paid speech remains owner-only.
- Web Audio routes natural voice to speakers and a capture destination. The
  recorder clones its audio track alongside canvas video; stopping a recording
  cannot stop normal playback. Browser TTS cannot be silently captured.
- Test tracks, cleanup, cancellation, expressive input and public API guards;
  verify an exported file contains audible audio, then commit this group.

## 2. Guest and owner sessions

- Default visitors get fresh in-memory chats, memories, notes and receptions;
  refresh discards them. Existing local history is loaded only for owner mode.
- Owner key becomes optional owner/dev sign-in, preserving the 12-hour cookie.
  Unlock/lock/expiry switches scopes through a reload, cancelling active work.
- Guest trial uses the configured free Groq model, bounded context and a narrow
  public quota. No owner notebook, transcript or provider key enters guest work.
- Test isolation and refresh behavior; document local storage boundaries and
  process-local limits honestly; commit this group.

## 3. Buttons

- Adapt Magic UI's MIT shimmer/gradient button recipe to NOX's colors. Keep
  upstream license notices in source, without a promotional credit wall.
- Remove decorative arrow characters; use direct labels and clear disabled,
  pressed, hover, focus and loading states. Preserve accessible form controls.
- Verify responsive buttons and keyboard actions; commit this group.

## 4. Homepage movement

- Base emblem anchors on visible copy, including pinned chapter duration.
  Avoid completing crossovers during blank gaps; remove stacked scroll lag.
- Keep one transform owner and a short physical settling response.
- Test pose continuity and landmarks, desktop/mobile navigation; commit.

## 5. Layout and settings

- Reserve space for the small peeker and the bottom HUD on desktop and mobile.
- Show NVIDIA NIM as To be connected; remove male-preference wording.
- Align factual copy/manuals with public voice, guest privacy and audible
  exports. Verify all routes, final suite/build and live deployment; commit.

Security limits: public inference can exhaust the account's free quota. The
in-memory public limiter is bounded but serverless instances do not share it;
it is not a distributed abuse-proof budget. Keys remain server-side. Owner
archives remain on this browser, not a remotely authenticated database.
