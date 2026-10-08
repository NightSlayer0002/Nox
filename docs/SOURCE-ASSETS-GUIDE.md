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
| GSAP | Hero entrance, chapter reveals, scroll wrapper scale/position |
| Lenis | Desktop wheel scrolling; one GSAP ticker drives its clock |
| Motion | React mobile menu and existing workbench/dialog transitions |
| React Spring | Selected pointer tilt on a separate source-scene wrapper |
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
