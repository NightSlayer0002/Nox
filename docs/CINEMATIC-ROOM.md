# The homepage light room

Scroll past “An idea. An accomplice.” to enter the room. Move the pointer for a subtle camera response. Click NOX or use **Say hello to NOX** to greet him; focus the scene and press **Enter** to greet or **Space** to wink. Touch scrolling remains native.

## One character, one clock

`createLanding` still owns the existing `Stage` and `Face`. `attachCinematicHandoff` temporarily keeps that Stage drawing while its hero canvas is offscreen, hides the corner peeker, and redirects gaze. The room samples the same canvas with a Three.js `CanvasTexture` on one sprite. It creates no second Face, dialogue engine, character clock, or API request. Leaving the room restores the existing peeker and pointer handling.

`client/cinematic-scene.jsx` owns only the Three.js camera, light-room geometry, texture and renderer. Its geometry adapts the official Three.js spline-extrusion example; the unchanged upstream example and MIT license are retained in `public/vendor/three-cinematic`, with the pinned commit and file hash in `public/vendor/sources.json`.

## Cost and failure behavior

The renderer initializes when the room first enters the viewport. Its loop stops offscreen and when the document is hidden; hidden wall time is excluded so returning does not jump along the path. Rendering is capped at 24 frames per second on desktop and 20 on small screens, with pixel ratios capped at 1.25 and 1 respectively. Small screens also use fewer filaments and a narrower character path.

Context loss, failed initialization and unmount release the handoff and dispose the renderer, texture, geometries, materials, listeners and observer. A missing lazy chunk keeps a bounded static section instead of covering the page. Existing chat, voice, storage and authentication are unchanged.

`tests/cinematic-presence.test.mjs` verifies offscreen/hidden suspension, clock continuity, motion behavior, idempotent disposal, and restoration of the original Stage state. The visual layout and interactions also need browser checks because these tests do not render WebGL.
