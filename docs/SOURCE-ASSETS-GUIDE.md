# How the sourced NOX visuals work

## What comes from where

All four requested repositories were cloned locally into ignored
`artifacts/upstream/`. Their exact commits are recorded in
`public/vendor/sources.json`. We vendor required shader/example files and license
notices, not their nested Git repositories or build/test toolchains.

- **ShaderGradient:** the actual React Vite example and Mint water-plane preset.
  Colors/orientation are adapted to NOX. The published `@shadergradient/react`
  runtime is pinned separately at 2.4.20; the inspected main clone is newer.
- **React Three Fiber:** the actual React renderer (9.8.1) and example
  Page/DemoPanel composition. It connects React components to Three.js objects.
- **Liquid Glass JS:** the original Container vertex/fragment shader, plus its
  glass/demo/control styles. Buttons are native HTML for accessibility. The
  effect samples a public gradient canvas instead of screenshotting the page.
- **Liquid Logo:** its original vertex/fragment shaders and Chrome preset,
  tuned by existing shader parameters for NOX's material. The input is NOX's
  established silhouette, replacing the upstream sample corporate logos.

No newly generated bitmap, decorative SVG, shader or panel sculpture is used.
The old room image and custom sphere shader are removed. Native system typography
comes from Liquid Glass's system-font approach. NOX's existing icon, legless body,
eyes and reaction vocabulary remain his brand and are adapted as requested.
HTML content, routing and lifecycle adapters are NOX code: none of these four
libraries provides a complete AI chat, library, auth or recording template.

## The rendering chain

`client/home.jsx` mounts semantic page chapters. It lazy-loads
`client/source-scene.jsx`, which mounts ShaderGradient inside its Canvas backed
by React Three Fiber. ShaderGradient supplies geometry, material, lighting and
shader time. The `Budget` component takes over the final render pass, drawing
at most 30 times per second. A public `data-frame` marker permits browser checks.

The source gradient is a real animated WebGL scene, not a background image.
`lightType="3d"` uses ambient lighting, so no environment HDR needs to leave the
site's self-only resource policy. Pixel density is capped at one. The large
scene bundle loads separately from the primary interface; it still has a real
download and GPU cost. Hiding the page stops its frame loop.

`client/liquid-button.jsx` draws the original Liquid Glass shader into a small
canvas behind an accessible button/link. It compiles only after the public
gradient canvas exists, limits drawing to about 12 FPS and releases program,
buffer and texture resources on cleanup. Shader failures leave a CSS surface.
There is no html2canvas dependency and no capture of messages, camera or tokens.

In the workspace, the public gradient canvas is passed to Stage through
`source-background.js`, a retained public-canvas channel. A late Stage subscriber receives the current canvas immediately, avoiding an
initialization race. Stage copies that canvas before drawing NOX,
camera preview and captions. This ordering matters: recording captures one
Canvas stream, so the visible source background is also in the exported WebM.
Clips remain silent, as before.

## Liquid Metal, without a second personality

`face-art.js` exposes the existing blob outline as `blobPath`. A 512-pixel mask
uses that outline with a transparent exterior. `source-effects.js` compiles the
unchanged upstream liquid-logo GLSL, uploads the mask once, and advances its
time uniform. It uses the Chrome preset with neutral silver colors and adjusted
contrast; the shader's own grain and fluid mathematics remain upstream code.

Stage blends the new material over the soft body. Face then draws eyes, brows,
mouth and expression marks above it. Both appearances use the same Face object,
so material changes preserve annoyance cadence, dizzy reactions, gaze,
conversation emotion and active gravity. The mouth still uses voice playback
amplitude; the material shader does not decide when NOX speaks.

Signal keeps its existing faceless drag/pulse controls and bounded state, but
uses this same sourced shader with the circular input supported by the upstream
Liquid Glass demo geometry. The old generated sphere shader is removed. Glow changes the sourced core’s
composition opacity. Lost GPU contexts use a visible fallback and restoration
recreates material resources. An outer boundary preserves the homepage if its
heavy scene chunk fails to download.

## Animation ownership

| Owner | Responsibility |
| --- | --- |
| GSAP | Hero entrance, sourced letter reveals, pinned chapter and outer emblem rotation |
| Lenis | Desktop wheel scrolling; one GSAP ticker drives its clock |
| Motion | React mobile menu and existing workbench/dialog transitions |
| React Spring | Bounded drag/hover rotation of the inner emblem group |
| ShaderGradient / R3F / Three | Source geometry/material time and GPU rendering |
| Stage / Face | NOX gaze, drag, gravity, expression, material blend and mouth |

There is no website motion toggle. NOX animates even when the browser requests
reduced motion, following the owner's explicit choice. That does not modify
the OS/browser setting. Menus and existing workbench transitions can still
follow the system setting. Touch keeps native page scrolling on the homepage;
the workspace's character canvas reserves dragging for NOX.

## What stayed connected

All existing workspace hashes, model adapters, validated reply packets,
owner cookie sessions, voice controls, chat history, knowledge retrieval,
summary context, export/delete functions, media controls and scene programs
remain. Private keys never enter these effects. The revamp does not turn NOX
into sentient intelligence, add model training, or make free quotas unlimited.
The system manual explains the separate AI and security architecture.

## How to change it

1. Adjust preset props in `client/source-scene.jsx` for gradient colors and
   orientation; keep original shaders in `public/vendor` traceable.
2. Adjust uniforms in `public/js/source-effects.js` for metal appearance. Face
   geometry and behavior live in `face-art.js` / `face.js`.
3. Adjust a specific view stylesheet for layout, using the shared source-derived
   controls and tokens in `source-ui.css`.
4. Run `npm run build:client`, refresh localhost, then `npm run verify` before
   committing. Changes under `client` need rebuilding; no client HMR is configured.
5. Push actual completed commits to GitHub main. Vercel builds and publishes a
   production release; local edits alone do not instantly change the live site.

Licenses remain in `public/vendor`; attribution links also appear on the homepage.

## The additional scroll assets

The owner requested a visible 3D element and repository-sourced scroll effects.
The owner rejected the Pensive background sphere. It is removed from the
homepage. NOX is small again, with original corner peeking. A separate 3D emblem
adapts the existing NOX icon; it does not enlarge the character or bob vertically.

Codrops’ `OnScrollTypographyAnimations` was cloned. `client/codrops-scroll.js`
adapts its effect 6: letters turn forward in perspective and rise into place as
their headings enter the viewport. React creates the expected word/character
wrappers in `scroll-title.jsx`; screen readers receive each complete heading
once. Effect 26 supplies a short pinned material chapter on desktop, with readable letters and explicit pin spacing. Touch uses a perspective entrance without pinning. Demo stock images and external fonts are not loaded. Vendored effect-26 source has only whitespace normalized.

The official Lenis repository was also cloned. Its source CSS and documented
GSAP integration are used: Lenis emits scroll updates, GSAP’s ticker supplies
one clock, and lag smoothing is disabled. Native touch scrolling is retained.
Both new upstream commits and licenses are in `public/vendor/`. The existing
GSAP context owns and disposes the scroll typography effects.


## Small NOX, peeking and the real 3D emblem

The homepage keeps an interactive character and a three-dimensional brand
emblem separate. The emblem is not a second AI character.

| File | Responsibility |
| --- | --- |
| client/home.jsx | Accessible sections, theme, controls and one Lenis/GSAP scroll clock |
| public/js/landing.js | Mount/dispose one Stage; keep NOX small; connect reactions to HTML |
| public/js/peek.js | Draw that same character at the corner after leaving the hero; return when scrolling up |
| client/source-logo.jsx | Existing SVG to real Three geometry; source Chrome texture; rendering and cleanup |
| public/js/logo-interaction.js | Bounded pointer targets; exclusive pointer; keyboard controls; readiness during context loss |
| client/hold-button.jsx | 900ms pointer hold, cancellation and immediate keyboard equivalent |
| public/js/first-contact.js | Pure hold gate and local experiment helpers, not model memory |
| client/codrops-scroll.js | Scoped adaptations of cloned effects 6 and 26 |

### One character, two draw locations

Stage owns one Face instance and animation clock. While the hero is visible,
it draws into the small hero canvas. attachPeek checks the actual character's
bottom edge in viewport pixels, including user-dragged positions. Past the top
edge, a short transition draws him into the corner and stops painting the
hidden hero. Scrolling back reverses the handoff. Different enter/return
thresholds prevent flicker near the edge.

Both drawings share expressions, material and time. Cursor coordinates are
converted relative to the visible corner face, so his gaze points at the
cursor anywhere in the window. Clicking the corner gives a real poke.
Callbacks compose with landing reactions. Stage's AbortController owns the
pointer listeners and dispose releases them. Keyboard relocation now tells
landing that the user moved him, so the home pose cannot undo arrow-key moves.

### What makes the emblem three-dimensional

The model uses /icon.svg, the existing NOX brand. SVGLoader reads its rounded
eye shapes; ExtrudeGeometry gives them physical depth and bevels. The mouth
path becomes a thin tube. The original background square is excluded. This is
brand adaptation, not a new decorative model. No stock model, font, bitmap or
proprietary Why Zero artwork is used.

The icon's 64-unit coordinate system is scaled into Three world coordinates
and its Y direction flipped. R3F's cloned model/gesture demo patterns provide
the scene and interactions. The original liquid-logo Chrome shader renders
into a bounded 512px source canvas; CanvasTexture maps its moving surface onto
the brand geometry. A separate lit side material makes depth visible as it
turns. The emblem has no vertical bobbing loop.

Two nested groups keep animation ownership explicit: GSAP turns the outer
group with scroll; Spring rotates the inner group from drag/hover targets.
The gesture controller clamps rotation, ignores unrelated pointers and invalid
coordinates, and applies the same bounds to keyboard turns. Reset releases
pointer capture and returns the emblem's view without moving NOX.

### Budget, fallbacks and scope

The emblem draws at most 30 FPS at pixel density 1. A monotonic budget survives
R3F clock resets. Intersection/visibility observers pause rendering offscreen
or hidden. Geometry, textures, shader renderer and listeners belong to the
mounted component and are disposed on exit; late async results release too.

Resource readiness and primary GPU context health are independent. If the
context disappears while icon/shader loading is pending, finishing those
requests cannot remove the static preview. Restoration resumes from actual
loading, solid or metal readiness. Missing 3D never gates chat. The fallback
uses the existing icon. Solid 3D remains available if only Chrome fails.

These graphics and gestures call no AI endpoint and receive no owner token,
private chat, notebook or camera texture. Public gradient canvases supply the
glass button textures. Connected chat, voice, auth and quotas remain separate
systems in the system manual. This update changes no authentication or data
storage policy, and adds no sentience, model training or unlimited quotas.