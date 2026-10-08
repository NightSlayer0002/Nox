# NOX / First Contact

The owner found the editorial landing page boring and asked for an experience
like Why Zero (https://why.zero.university/). Its live entry is a fullscreen
interactive world with a gesture prompt and a stage map. We take that interaction
idea; we do not copy its hand model, textures, branding, audio or proprietary code.

## Experience

The owner corrected the first implementation: preserve the small character and
the original corner peeking, and replace the background floating sculpture with
a separate, purposeful 3D effect. Four short scroll scenes meet NOX, explain his
reactions, change material, then open the workspace. There is a small scene map
and a hold-to-liquify control; the invented discovery counter is removed.
NOX lives in a small hero canvas, peeks from the lower-right edge after leaving
the viewport, tracks the cursor there, and returns when scrolling back up. A
separate three-dimensional NOX emblem adapts the established icon, rather than
enlarging the character or adding a decorative background sphere.
Chat remains directly accessible. Local gestures never stand in for real model
conversation; knowledge, voice and history remain in the existing workspace.

Keep dark default, always-on character motion, the legless blob, cursor attention,
pickup/shaking/annoyance/sleep acting and persistent gravity. Keep all workspace
routes and the homepage anchors `#features`, `#inside`, `#about`.

## Sources and ownership

- ShaderGradient Mint renders the public fluid backdrop. The unwanted Pensive
  background sphere is removed from the homepage. R3F's model/gesture demo
  patterns render an adaptation of the existing NOX icon, with liquid-logo
  supplying the live metal texture. No new decorative artwork or shader.
- liquid-logo applies Chrome to the established NOX silhouette.
- Liquid Glass supplies control surfaces; private DOM capture remains excluded.
- Codrops OnScrollTypographyAnimations supplies perspective typography and its
  effect-26 pinned timeline pattern, adapted to the scene progression.
- Lenis keeps a single GSAP-driven scroll clock. Native touch scroll is retained.
- Stage owns character physics/material blending and both hero/corner drawing.
  GSAP owns scroll rotation of the emblem's outer group; Spring owns pointer
  rotation of its inner group. Neither library moves the character on scroll.
- React owns controls and status. No account XP, telemetry or claim of learning.

## Implementation stages / real commits

1. Local interaction state, hold/cancel rules and safe Stage lifecycle/gesture
   hooks. Test interrupted holds, duplicate discoveries and cleanup.
2. Fullscreen scene composition, large draggable NOX, responsive scene map,
   direct workspace links and source-renderer integration.
3. Sourced scroll choreography, playful controls, keyboard equivalents, loading
   and fallback states; browser QA, full verification and independent review.

Push finished stages separately. Preserve unrelated `docs/research/` files.
No contribution timestamp changes or empty commits.
