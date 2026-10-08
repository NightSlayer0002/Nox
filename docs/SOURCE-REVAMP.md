# NOX source-based frontend revamp

Approved brief: use only visual assets/effects from liquid-logo, shadergradient,
liquid-glass-js, and react-three-fiber, adapting them to the existing NOX brand.
Keep dark mode and character motion on by default, without a motion toggle.
Preserve routes, conversation, owner access, voice, history, notebook, camera,
recording, gestures and scene programs. Keep the legless NOX character.

These repositories contain shaders and effect demonstrations, not complete AI
workspace templates. Semantic HTML, responsive placement, and lifecycle code
are required integration work. We do not claim those adapters are upstream code.
No new image generation, custom decorative shader, or panel sculpture is used.

## Commit plan

1. Source foundation: pin upstream commits, vendor shaders and licenses, install
   ShaderGradient / React Three Fiber, retain dark and always-on defaults.
2. Homepage: replace the custom sculpture with ShaderGradient's actual React
   demo and preset, plus liquid-logo's Chrome effect adapted to NOX's logo.
   Use the R3F Page composition and Liquid Glass demo controls as source layouts.
   Scroll through chapters with the fluid scene staying continuous behind them.
3. Conversation: replace previous workspace styling with an adapted Liquid
   Glass demo/control system, preserving all conversation controls and IDs.
4. Frame / play: replace the generated room with the source gradient, keep
   the recording canvas composited so exported clips include the new background.
5. Explore / library / preferences: carry the same source-derived control
   styles through existing views, notebook, dialogs and history states.
6. Blob: introduce a Liquid Metal form using the actual liquid-logo shader,
   NOX's existing silhouette and expression overlay. Preserve drag and gravity.

## Verification

- Run existing tests and build checks for each meaningful stage.
- Verify shaders really compile in the browser, not only in the bundler.
- Check desktop/mobile navigation, owner-access form, conversation and
  scene controls, history, notebook, recording path and liquid-form switching.
- Confirm default animation runs despite the browser's reduced-motion setting,
  as explicitly requested by the owner; do not change the system setting.
- Keep external scripts, body snapshots and private information out of the
  glass textures. Bundle dependencies locally; retain the existing CSP.
- Pause heavy canvases when offscreen/hidden; cap device pixel density.

## Decisions and progress

- All four public repositories cloned successfully into ignored
  `artifacts/upstream`. GitHub account connection is unnecessary for cloning.
- Sample corporate/game logos are not NOX assets. The liquid-logo renderer is
  adapted to the already-established NOX logo and body instead.
- ShaderGradient uses its `3d` ambient lighting mode; no external HDR or CDN.
- Liquid Glass uses its original shader with a public gradient texture, never
  html2canvas screenshots of conversations, passwords, owner tokens or camera.
- Keep motion preferences overridden only inside NOX, as the owner requested.
- Commit actual finished stages; do not alter timestamps or create empty commits.
