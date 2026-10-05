# NOX 0.4 / The evening room

The 0.4 design replaces the earlier neumorphic console. Your two supplied NOX templates guide the visual language: an almost-black workspace, warm ivory character, cinematic room, editorial type, quiet sidebar and translucent panels. The layout and code are original; the screenshot's fake projects, search tools and library cards were not copied into the app as pretend features.

## Composition and interaction

`public/style.css` uses a deep green-black background, a fixed desktop navigation rail, a serif headline, a live room on the left, and conversation on the right. Borders separate surfaces instead of raised/recessed bevel shadows. Warm controls and a single illuminated face carry the visual hierarchy. At tablet sizes the rail compresses; on phones it becomes a compact top bar and the two columns stack. Film mode removes the app chrome and keeps the recorded 9:16 canvas.

The Presence face remains live code in `face.js`. Capsule eyes change height for expressions and blink/wink independently. Bounded gaze follows pointer position. The small neutral mouth is an ivory oval; happy and skeptical shapes use curves. Speaking uses an authored envelope tied to actual speech playback intervals, not phoneme or audio-amplitude analysis. A poke temporarily smiles without destroying the mood selected by the brain. The optional Signal form retains the original WebGL material.

Motion respects the system's reduced-motion preference until you choose Motion on/off. The explicit choice is saved in this browser. A scene button is a toggle: clicking its active state calls `Stage.stopScene()`, clears scene motion and updates its pressed state. Scenes still expire after ten seconds.

## An original room, not a static character

`public/assets/nox-study.jpg` is an original generated environment asset. Only the stone arch, lake, mountains, books and empty table are in the picture. NOX's eyes and mouth are drawn every frame over it. The source image was generated with the built-in image tool and compressed to a 233 KB JPEG for delivery; compression did not change the composition.

`Stage` loads the same-origin image. Render fits it using `max(canvasWidth/imageWidth, canvasHeight/imageHeight)`, centers the result, then lays a dark color wash and lower caption gradient over it. Face, optional camera, scenes and captions are composited into the same canvas, so the environment is included in a recording. The CSS room note is interface copy outside the canvas and disappears in film mode.

The background is intentionally fixed; the face and scene physics supply interaction. It is not a rendered 3D room, and the image cannot respond to lighting or camera movement. The optional Signal shader is real WebGL. This distinction keeps the image from being mislabeled as an interactive character.

### Final asset prompt

Generated with the built-in image tool:

> Photorealistic cinematic architectural study at dusk, wide landscape. Stone arch window on the right half overlooking a mountain lake and tiny amber village lights. Blue charcoal evening sky and a small faint moon. Hanging climbing leaves and books at the edges, near-black wood foreground desk. Left half nearly black negative space. Centre-right table clear for a live character composited by code. No character, face, orb, device or person. Authentic stone texture, dark forest-green shadows, ivory/amber accents, restrained lighting and subtle grain. No UI, text, logos or decorative geometric shapes.

Original source stays in the Codex generated-image directory; the project consumes only the saved JPEG. The user-provided reference screenshots are not shipped as assets.

## File ownership

| File | Responsibility |
|---|---|
| `public/index.html`, `public/js/landing.js` | Cinematic home page and live character introduction |
| `public/app.html`, `public/js/navigation.js` | Workspace with functional Explore, Conversation, Scene studio and Library destinations |
| `public/style.css` | Cinematic composition, type, responsive layout, states and keyboard focus |
| `public/assets/nox-study.jpg` | Original environment image, with no baked-in character |
| `public/js/face.js` | Shaded body, live eye/mouth geometry, gaze, blinking, touch response and color |
| `public/js/orb-state.js` | Shared activity, emotion, energy and clock |
| `public/js/orb-shader.js` | Optional live GLSL material and WebGL lifecycle |
| `public/js/orb.js` | Shader projection, pointer smoothing and Canvas fallback |
| `public/js/stage.js` | Backdrop composition, character, scene physics, camera, captions and recording size lock |
| `public/js/app.js` | Interaction wiring, provider/voice settings, status and owner access |

Manrope is bundled with its OFL license in `public/fonts/OFL.txt`. Georgia uses the user's available system serif. The eye icon and SVG media symbols are original code. No paid GSAP component, Resident Evil asset or premium template source is copied. The user screenshots are mood/composition references; the implementation uses native Canvas and CSS because those keep this small character engine explainable and free of runtime dependencies.

## 0.5 composition

The landing page uses a continuous room with open space for a sans-serif introduction, quiet navigation, and a cream call to action. The workspace uses a thin left rail and a restrained two-column layout, with a live scene on one side and the selected functional panel on the other. No fabricated projects or recent chats are displayed: resume cards come from saved conversations, and an empty archive has an honest empty state. The character's charcoal body is shaded Canvas geometry, with a rim and contact shadow; eyes and mouth remain live. Pointer tracking covers the whole document without obstructing other controls.

At 390 pixels the rail becomes a compact navigation row, the columns stack, and the scene remains usable. Motion defaults on across the two pages while honoring explicit current or legacy off preferences. Screenshots in ignored artifacts are proof of browser checks, not source assets.
