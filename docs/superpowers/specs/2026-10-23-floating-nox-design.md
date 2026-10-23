# Floating NOX

Approved direction: the user's October 23 request approves the prior interaction proposal, with no automatic relocation while typing and a controls bot visibly smaller than NOX on mobile.

## Experience

- Conversation uses a small transparent character overlay, without a reserved row or side column. Only the character and its controls intercept input; the rest of the chat scrolls normally.
- Dragging places NOX anywhere within the visible workspace. Release has no lateral velocity or autonomous drift. Gravity off preserves placement while typing; a viewport reduction only clamps an otherwise offscreen character into view.
- Optional gravity pulls NOX vertically onto the message composer's top. Open keyboard: a single 8px hop when resting there. Close keyboard: follow the lowering floor with a small drop and landing squash. No hop while dragging, no repeat on suggestion-bar resizing, and reduced motion suppresses flourishes.
- One smaller flying bot follows placement changes with a short fading trail and then settles. Its control menu stays still and within the viewport. Include Park, Hide, existing appearance/expression/effect controls, and a clear way to show NOX again on mobile.
- Holding NOX over a completed message reveals deliberate Explain / Read aloud / Quiz me actions. These never send merely because he falls or rests on a message. Read-opening wording is used if the existing bounded voice preview applies.
- The same Stage, expressions, voice clock, and renderer are retained. Call, Scene studio, Afterimage, film and recordings keep their existing surfaces and restore the floating placement on return.

## Approaches

The reserved-row layout prevents occlusion but consumes mobile space. Autonomous roaming was rejected by the user. Selected: a manually positioned DOM overlay using the current Stage, with optional vertical gravity; no extra full-screen WebGL renderer or second character.

## Constraints

No new dependencies, account/storage work, model changes, or landing-page motion changes. Default placement is near the right edge above the composer. Position lasts for this page visit. Normal page dialogs, message scrolling and composer buttons remain usable. Park is an explicit action, never triggered by typing.
