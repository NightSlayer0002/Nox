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

### Completed stages and review

- `2248f71`: pinned source foundation and always-on defaults.
- `f714eb6`: sourced homepage, glass CTA and scroll chapters.
- `6d984d0`: conversation and shared workspace control system.
- `76f145b`: frame/play scene and capture composition; generated room removed.
- `bab51f7`: Explore and Library.
- `1ea2a64`: Preferences and Knowledge.
- Liquid Metal: sourced Chrome body and faceless core; previous generated
  Signal shader removed. Existing brand and reactions retained.
- Independent review identified four Important issues. A missing lazy scene
  download was reproduced in the browser (blank page), then protected by an
  outer boundary (navigation and CTA remain). Signal context loss/Glow and
  late background readiness regressions were reproduced with failing tests,
  then fixed. Source shaders match upstream; no private body capture.
- Final minor documentation mismatch for scroll wrapper name corrected.
- Ruling: preserve the established NOX face/silhouette/icon as the owner’s brand
  adaptation; replace generated decorative assets and theme/sculpture/core code.
- Ruling: use native system typography and text glyph controls from the source
  demos’ approach, removing old custom font loading and SVG control artwork.

### Additional sourced 3D stage

The owner requested a visible 3D element beside NOX after the first seven stages
were pushed. The upstream Pensive icosahedron preset now sits in the hero. NOX
remains the same draggable character in front. React Spring controls bounded
rotation of the actual mesh, rather than a flat image. Both source canvases
pause when hidden/offscreen and draw at most 30 FPS.

### Additional sourced scroll stage

- Official Lenis clone: `bc152f90d7c9b04ef372718350e2f616f3c706b2`.
- Codrops OnScrollTypographyAnimations clone:
  `af28d61d1f8d3d117f5d1e9b09d5209e20a1a212`.
- Adapt effect 6 and semantic character wrappers; preserve whole heading labels.
- Reuse the existing single GSAP/Lenis clock, and the official Lenis CSS.
- Commit and push this scroll stage separately from the 3D stage `606a0f2`.
- Additional review found the R3F clock resets on pause/resume. The render budget
  now uses an independent monotonic timestamp; a regression test covers long
  hidden intervals and clock epoch restarts.
- Final verification: 164 NOX tests passed, 71 JavaScript modules syntax checked,
  and the Vercel production output built successfully. Browser checks confirmed
  sourced 3D rendering, actual mesh pointer rotation, complete scroll headings,
  corner peeking, mobile layout bounds and Liquid Metal initialization.
