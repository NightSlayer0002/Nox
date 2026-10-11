# NOX: sculpture and open workspace — October 11, 2026

The landing page now leads with the existing NOX icon as a real, interactive
Three.js sculpture. The reference is Terafab's spacious, visual-led hierarchy:
https://terafab.ai/. No Terafab media, logos, copy, or proprietary source was
imported. NOX continues to use the pinned liquid-logo, ShaderGradient, R3F,
Liquid Glass, Codrops, Lenis and Magic UI sources described in
`public/vendor/README.md`, with their license notices intact.

## How the sculpture works

`client/source-logo.jsx` loads `/icon.svg`. SVGLoader extracts its two eyes and
smile. ExtrudeGeometry gives the eyes depth; TubeGeometry gives the smile a
rounded cross-section. Physical/standard materials and hemisphere/directional
lights make those surfaces react to their angle. The original liquid-logo
shader supplies their animated texture. This is rendered geometry, not a
pre-rendered image or a video.

An HTML button follows the sculpture's screen position and provides pointer
capture and keyboard access outside the decorative canvas. Dragging uses
`createLogoGesture()` in `public/js/logo-interaction.js`: one pointer at a time,
bounded pitch/yaw, cancellation-safe release. Tap or Enter greets the little
NOX and briefly squeezes the sculpture's eyes; it blinks periodically. Left and
Right turn it, Escape clears the turn. A fast React Spring owns only the inner
pointer rotation; GSAP owns the outer scroll pose. WebGL fallback releases
pointer ownership and centers the spring before removing the target, so a
restored context accepts a new touch pointer and keyboard control.

`public/js/home-choreography.js` still places the sculpture opposite the active
paragraph. `client/home-scroll.js` measures visible copy centers, including the
pinned material chapter. The smaller legless NOX retains his existing reactions
and corner peeking. The hero's size, copy, lighting and spacing change; routes,
provider integrations and the local character remain compatible.

## Why movement was slow

The old frame limiter saved the display timestamp after every accepted frame.
If a requested 33.33ms interval was encountered on 16ms display ticks, it waited
48ms, then repeated that overshoot. A synthetic one-second regression produced
21 frames rather than about 30. The new limiter advances a fixed phase and
discards missed frames after pauses. The same test produces the requested
cadence; epoch resets and hidden intervals are covered separately.

The sculpture's geometry/pointer render budget is now up to 60fps. Its expensive
liquid texture updates at 24fps and 256×256, independently from the pointer
rotation. Previously the texture was 512×512 and regenerated with each 30fps
render. That bounds texture work without forcing gaze to wait for it. The
ambient ShaderGradient is capped at 24fps with pixel density .65. Renderers
still pause in hidden/invisible states. Actual frame rate depends on the device,
browser and GPU; these budgets are not a measured device performance guarantee.

`public/js/face.js` separates the gaze smoothing rate (30) from the body's
existing softer smoothing (9). Thus looking reacts quickly without making
gravity, breathing or movement abrupt. The homepage spring also has less mass
and higher tension. Lenis duration is .68s and the hero entrance is .55s.
Language-model and speech API timings are unchanged by these visual changes.

## Why the workspace has fewer boxes

`public/editorial-workspace.css` adapts the existing layout/control styles:
open columns, thin dividers, a compact scene toolbar, flatter navigation, and
an open AFTERIMAGE cue tape. Inputs, selected states, focus rings, progress and
errors remain distinct. The last stylesheet owns presentation; existing HTML
IDs, event handlers and React views retain functionality.

The shared Magic UI recipe now uses `:where()` for its selector list. Previously
the list included IDs inside `:is()`, giving every matched button ID-level
specificity and preventing normal page styling from replacing the pill look.
The source recipe remains available for primary actions while ordinary controls
can use the quieter layout.

On mobile the navigation row scrolls natively; no controls or routes are
deleted. A route change returns to the heading and focuses the main region.
The stage's edge mask is presentation-only and disabled in film mode. Captured
video continues to use the full canvas with its existing Orpheus audio track.
Guest/owner authentication, temporary guest storage, owner archive isolation,
provider quotas, and private server keys are unchanged.

## Verification

Before final deployment: full regression suite and production build; browser
checks at desktop and a 375px content viewport. Checks cover hero keyboard/tap,
copy-aligned scrolling, mobile overflow/navigation, local guest chat and voice,
gravity on/off, open AFTERIMAGE, and portrait film mode without a canvas mask.
The independent review found one context-loss drag recovery issue; its fix and
detached-target regression passed review. No security-sensitive endpoint changed.
