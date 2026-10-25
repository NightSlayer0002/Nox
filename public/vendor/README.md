# Visual sources and licenses

`sources.json` records upstream repositories, source paths, revisions and hashes.
Published runtime packages are pinned separately in `package-lock.json`.
Upstream demo and specimen copies are omitted from the public payload; their
source records and all license and attribution files remain available here.

## Runtime assets and adaptations

| Source | Use in NOX | Retained notice |
| --- | --- | --- |
| Adobe Source Sans 3 | Unmodified, self-hosted upright variable WOFF2 font | `source-sans/LICENSE.md` (SIL OFL 1.1) |
| Vercel AI Elements / shadcn | Native HTML/CSS adaptations of Button variants, PromptInput and InputGroup; the React/shadcn demo dependency graph is not installed | `ai-elements/LICENSE` (Apache-2.0) |
| Lucide | Unmodified SVG control icons and the immediate/loading/error brain fallback | `lucide/LICENSE` (ISC, with the included MIT icon notices); `lucide/*-NOTICE.md` |
| collidingScopes/liquid-logo | Original vertex and fragment shaders; Chrome parameters adapted to NOX's existing silhouette, materials and renderer lifecycle | `liquid-logo/LICENSE.txt` (MIT) |
| dashersw/liquid-glass-js | Original Container shaders and `glass.css`; native accessible controls and a public gradient texture | `liquid-glass-js/LICENSE` (MIT) |
| ruucm/shadergradient | Published React renderer and Mint water-plane parameters; adapted palette, orientation and local presentation | `shadergradient/LICENSE` (MIT) |
| pmndrs/react-three-fiber | Published renderer; adapted scene, model and gesture patterns | `react-three-fiber/LICENSE` (MIT) |
| Codrops OnScrollTypographyAnimations | Effects 6 and 26 adapted for perspective typography, readable anchor entry and a short pinned chapter | `scroll-typography/LICENSE` (MIT) |
| darkroomengineering/lenis | GSAP ticker integration and local scrolling CSS | `lenis/LICENSE` (MIT) |
| ARWES | FrameCircle descriptors exported to `arwes/orbit-frame.svg`, with a transparent mint palette and canvas rotation/scaling | `arwes/LICENSE` (MIT) |
| Three.js | Transmission material, PipeSpline control points and connected-particle Points/LineSegments patterns adapted in NOX's local renderers | `three-atmosphere/LICENSE`, `three-cinematic/LICENSE`, `three-neural/LICENSE` (MIT) |
| pmndrs/meshline | MeshLineGeometry, MeshLineMaterial and motion ribbons using the sourced spline contours | `meshline/LICENSE` (MIT) |

The GLSL files remain unmodified; NOX's runtime adapters identify any shader
changes applied while creating materials. The ARWES source generators
`createFrameCircleSettings.ts` and `filterProps.ts` remain available for
`scripts/export-orbit-asset.mjs`. Drawing the exported Orbit asset into the stage
canvas also includes it in recordings.

NOX's face, body, icon and 3D emblem use its existing brand assets. Upstream
sample company logos are not used as NOX branding. Icons, fonts, shaders and
geometry are served locally; no runtime asset CDN is required for these sources.

## BodyParts3D anatomy

BodyParts3D, © The Database Center for Life Science licensed under CC
Attribution 4.0 International.

`bodyparts3d/brain.bin` packs forty original cortical, cerebellar and brainstem
parts from the official BodyParts3D 4.0 OBJ archive. NOX adapts orientation,
lighting, materials and presentation. Archive and per-part checksums, packing
settings, citation and the licensor's current grant are retained in
`bodyparts3d/geometry.json` and `bodyparts3d/NOTICE.md`, alongside
`bodyparts3d/LICENSE-CC-BY-4.0.txt`. The current license page records the change
to CC BY 4.0 on February 27, 2025; the notice also explains legacy OBJ headers.

The connected-particle presentation follows Three.js commit
`9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8` (r186 / 0.186.1),
`examples/webgl_buffergeometry_drawrange.html`. Its static local-neighbour graph
and animated illumination are artistic activity visualizations, not measured
anatomical connections, biological neuron simulation or the model's internal
thoughts or weights.

## Retained historical credits

Magic UI's ShimmerButton was an earlier button reference. Its MIT notice remains
in `magicui/LICENSE`; the source revision is
`cdb348cb4c72a9b54b554d8617801e479fbc8714`,
`apps/www/registry/magicui/shimmer-button.tsx`. Current flat button variants are
the AI Elements adaptation described above.

The React Flow MIT license remains in `react-flow/LICENSE`. The unused Manrope
font is no longer distributed; its original credit and SIL OFL 1.1 notice remain
in `../fonts/OFL.txt`: Copyright 2018 The Manrope Project Authors
(https://github.com/googlefonts/manrope).

Terafab and MotionSites were composition references only. Their footage,
branding, copy and proprietary sources are not distributed. No stock photos,
external Typekit fonts or gallery videos from those references are loaded.
