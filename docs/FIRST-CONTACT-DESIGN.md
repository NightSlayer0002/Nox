# NOX / First Contact

The owner found the editorial landing page boring and asked for an experience
like Why Zero (https://why.zero.university/). Its live entry is a fullscreen
interactive world with a gesture prompt and a stage map. We take that interaction
idea; we do not copy its hand model, textures, branding, audio or proprietary code.

## Experience

Four short scroll scenes share one large, live NOX and one source-based 3D world:
meet him, discover his physical reactions, change his material, enter the studio.
The page has a small scene map, a local discovery counter and a hold-to-liquify
control. Chat remains directly accessible; no puzzle or loading gate blocks it.
Scene controls work without an AI key and are clearly local experiments. Real
model conversation, knowledge, voice and history remain in the existing workspace.

Keep dark default, always-on character motion, the legless blob, cursor attention,
pickup/shaking/annoyance/sleep acting and persistent gravity. Keep all workspace
routes and the homepage anchors `#features`, `#inside`, `#about`.

## Sources and ownership

- ShaderGradient Mint/Pensive presets and R3F render the world. No new model,
  bitmap, decorative SVG or shader is created.
- liquid-logo applies Chrome to the established NOX silhouette.
- Liquid Glass supplies control surfaces; private DOM capture remains excluded.
- Codrops OnScrollTypographyAnimations supplies perspective typography and its
  effect-26 pinned timeline pattern, adapted to the scene progression.
- Lenis keeps a single GSAP-driven scroll clock. Native touch scroll is retained.
- Stage owns character physics/material blending. GSAP owns scroll pose targets
  and scene layers; Spring owns the source 3D mesh's pointer rotation.
- React owns controls and status. Discoveries stay in memory for this visit;
  they are not model learning, analytics, saved chat or account XP.

## Implementation stages / real commits

1. Local interaction state, hold/cancel rules and safe Stage lifecycle/gesture
   hooks. Test interrupted holds, duplicate discoveries and cleanup.
2. Fullscreen scene composition, large draggable NOX, responsive scene map,
   direct workspace links and source-renderer integration.
3. Sourced scroll choreography, playful controls, keyboard equivalents, loading
   and fallback states; browser QA, full verification and independent review.

Push finished stages separately. Preserve unrelated `docs/research/` files.
No contribution timestamp changes or empty commits.
