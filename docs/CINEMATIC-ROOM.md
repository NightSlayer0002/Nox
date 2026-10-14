# The zero-gravity finale

The final scene follows the conversation invitation and privacy details, just before the footer. It keeps the landing page’s large 3D eyes and smile visible behind one small NOX.

Grab NOX and release him to throw him through the room. There is no gravity; motion slowly loses speed and gently bounces off the bounds. Throw speed is capped at **2.8 world units per second** (the room is seven world units tall). The initial drift remains 0.13 horizontally and 0.05 vertically, with the same damping as before. His ribbon records his actual movement instead of following a prerecorded path. Click him to greet. Focus him and use **arrow keys** to nudge, **Enter** to greet, **Space** to wink or **Escape** to stop. Touch scrolling remains native outside his drag handle.

## One character, one clock

`createLanding` still owns the existing `Stage` and `Face`. `attachCinematicHandoff` temporarily keeps that Stage drawing while its hero canvas is offscreen, hides the corner peeker, and redirects gaze. The room copies the same Stage canvas to one transparent HTML canvas that follows its projected world position. CSS drop shadows follow its alpha silhouette, so the glow surrounds NOX rather than a rectangle. It creates no second Face, dialogue engine, character clock, or API request. Leaving the room restores the existing peeker and pointer handling.

`client/cinematic-scene.jsx` owns the transparent Three.js camera, contours, portrait, trail and renderer. The original emblem stays behind it: no screenshot, duplicate emblem model or opaque panel replaces it. Its sparse contours use the official Three.js PipeSpline points; the tapered ribbon uses pmndrs **MeshLine 3.3.1**, including its native variable-width strip and in-place `advance()` operation. The ribbon is one translucent strip, without the old bright center line. The dependency is pinned, with MIT notices and source records in `public/vendor`.

`client/cinematic-atmosphere.js` adapts the official Three.js transparent physical sphere example. One shared sphere geometry and a few dim materials form the orb field. It reuses the existing WebGL renderer; at 15 Hz the sphere layer is copied to a smaller canvas and softly blurred by CSS. The main scene then renders sharp lines in the same context. No extra WebGL renderer, external model, environment map or generated bitmap is needed. Sphere rendering stops with the room and disposes its shared geometry and materials.

`public/js/cinematic-dynamics.js` owns the physics. Timestamped pointer samples estimate release velocity, normalized as one vector so diagonal throws cannot exceed the speed cap. Grabbing preserves the offset between the pointer and character center. Stale, invalid or cancelled gestures cannot create a fling. Resize clamps him inside the new bounds. The HTML drag handle follows the rendered portrait and limits touch capture to NOX himself.

## Cost and failure behavior

The renderer initializes when the room first enters the viewport. Its loop stops offscreen and when the document is hidden; hidden wall time is excluded so returning does not jump. Rendering is capped at 60 frames per second on desktop and 30 on small screens, with pixel ratios capped at 1.25 and 1 respectively. Small screens use fewer contours and a shorter ribbon buffer. Ribbon samples use a fixed 30 Hz cadence on both layouts. Geometry is reused rather than rebuilt every frame.

Context loss, failed initialization and unmount release the handoff and dispose the renderer, texture, geometries, materials, listeners and observer. A missing lazy chunk keeps a bounded static section instead of covering the page. Existing chat, voice, storage and authentication are unchanged.

`tests/cinematic-presence.test.mjs` verifies offscreen/hidden suspension, clock continuity, correct time delivery at capped frame rates, idempotent disposal and restoration of the original Stage state. `tests/cinematic-dynamics.test.mjs` covers dragging, velocity limits, damping, bounces, cancellation, timestamps, resizing and invalid input. Choreography tests check that the full background emblem stays positioned relative to the finale’s bounds. Browser checks verify WebGL, pointer capture, keyboard use, the single-character handoff and responsive layouts.
