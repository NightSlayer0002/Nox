# Visual sources

The four repositories requested by the NOX owner were cloned, inspected, and
pinned in `sources.json`. Clones live in ignored `artifacts/upstream/`; only
required source files and license notices ship with NOX.

| Source | Used in NOX | Adaptations |
| --- | --- | --- |
| collidingScopes/liquid-logo | Original vertex/fragment shaders; Chrome preset | Existing NOX silhouette / logo texture, reusable renderer lifecycle, bounded resolution |
| ruucm/shadergradient | Published React renderer; Mint water-plane preset and Vite example | Charcoal/teal palette, orientation, no external environment map |
| dashersw/liquid-glass-js | Original Container shader, glass/demo/controls CSS | Native accessible HTML controls; public gradient texture instead of body screenshots |
| pmndrs/react-three-fiber | Published renderer; Page and DemoPanel example layout | NOX content, responsive page chapters, scroll integration |

Shader source files are unmodified. Adaptation modules and CSS explicitly identify
their upstream source. No upstream sample company logo is represented as NOX's
brand. NOX's established face/body remain the character asset the owner asked to
adapt. No new bitmap, shader, sculpture, or decorative shape is generated.

The original demos do not provide chat/history/authentication pages. Integration
code maps their components to NOX's existing semantic HTML and controller IDs.
No private DOM screenshot library, external script CDN or analytics was added.

The owner subsequently authorized another repository for actual scroll effects.
Codrops OnScrollTypographyAnimations effects 6 and 26 supply perspective letter
reveals and the shorter pinned material chapter. Original source files and MIT
license are retained in `scroll-typography`. The NOX adaptation explicitly adds
pin spacing for its layout and retains readable letters at anchor entry.
The official Lenis repo was also cloned for its GSAP ticker integration and
scrolling CSS. Both commits are recorded in `sources.json`. No stock photos or
external Typekit fonts from the demos are loaded.
