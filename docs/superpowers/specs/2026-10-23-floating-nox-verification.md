# Floating NOX verification

23 October 2026. Implementation: `6d9db6de0bba38960fa324df74a0228ed437299e`.

## Automated checks

- `npm run verify`: 783 tests passed, 242 JavaScript modules syntax checked, client and Vercel output built successfully.
- Independent final review found no remaining material findings after the fixes below.
- GitHub Actions run `39900044907` succeeded; Vercel deployment `6Xa9FbMoah9NGD8ASGfZviHReWcY` succeeded.
- The design detector reported existing app.html warnings for old studio spacing, small text and nested cards; it reported no findings in the new floating CSS/adapter/layout files.

## Browser checks

- Responsive layouts checked at 320 × 740, 390 × 844, 768 × 1024 and 1440 × 900. The phone menu fits above bottom navigation; no horizontal page overflow.
- Existing Stage moves to the transparent conversation overlay and returns for calls and Scene studio. Hide, Show, Park, keyboard movement, pointer cancellation, Takeover and its timed return were exercised.
- Scene studio recording started, stopped and opened its clip preview, then returned to floating conversation.
- The mobile bot artwork measures 28 × 21 CSS pixels inside a 44px target. The Stage is 96px square with approximately 76px of visible NOX artwork.
- Simulated touch dragging and visual-viewport keyboard changes used a local-only fixture, with normal motion enabled. NOX remains stationary while typing with gravity off. With gravity on, he lands on the composer, hops once on keyboard open, does not repeat on suggestion-bar resize, and drops to the lowered composer after close. Reduced motion is separately covered by model tests.
- Deliberate drag dwell reveals message actions without sending. Explain and Quiz me append new turns only after explicit choice. Keyboard entry focuses the action menu. Cancellation removes it.
- Read opening sent a 372-character spoken preview for a 3,491-character reply; the full written answer and its final marker remained in chat.
- The live production site completed a real mobile-size chat, preserved placement while typing, landed NOX on the composer, opened the controls and exposed the message actions. Live screenshots are saved in local artifacts/floating-nox-live-*.png.

## Review-driven safeguards

- Explain/Quiz cannot replace an active edit or overwrite an unsent draft; both stay intact and the user gets a clear prompt to finish them.
- Restoring another conversation closes stale message menus before rebuilding the transcript.
- Character size changes preserve a gravity landing or an active drag grip.
- Floating placement skips scene positioning, but keeps the normal Takeover expiry.
- Explicit Park aligns with the actual composer's edge on wide screens, while manual dragging retains the full workspace bounds.
- Properties menu width follows the visual viewport, including zoom, and its panel compensates for the translated bot's containing block.

## Limits

No physical Android or iOS device was attached; keyboard and touch checks used the browser fixture and unit tests. Position lasts for this page visit. Read opening uses the existing 420-character speech endpoint limit. No accounts, storage, model provider or landing-page motion changes are included.
