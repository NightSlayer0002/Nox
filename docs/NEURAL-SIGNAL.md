# NOX neural Signal

Choose **Scene studio → Appearance → Signal**. The same NOX chat connection
now appears as an anatomical light network instead of an opaque brain.

## Controls and reactions

| Action | Reaction |
| --- | --- |
| Move the pointer | The brain turns toward it. |
| Click the brain or press Space while focused | A bright local impulse travels through connections and releases expanding waves. |
| Hold and drag | The network brightens under pressure and lifts subtly. |
| Pull or shake quickly | Additional bursts follow the direction of the movement. |
| Release | A softer release wave settles the network. |
| Drop with Gravity on | A landing impulse appears on impact; Gravity remains enabled. |
| Wait for an AI reply | Thinking impulses move between several regions. |
| Use the existing microphone | Listening has a slower, distinct pulse cadence. |
| Play NOX's voice | Syllables trigger impulses using the existing audio envelope; gaps quiet the active light. |

Presence and Liquid metal retain their existing faces and expressions. Orbit,
Echo, Spotlight, Takeover, film mode and recording continue to use the same
stage. The brain itself is part of that stage's captured canvas.

## How the pieces connect

1. `brain.bin` contains the existing BodyParts3D cortical, cerebellar and
   brainstem mesh. The renderer reorients and uniformly scales it.
2. `brain-network.js` samples anatomical anchors. A fifth are projected inward
   to give the illustration volume. A spatial grid finds nearby neighbours
   once during loading, producing static typed arrays for points and links.
3. `BrainActivity` is a small, pure controller. Existing pointer gestures,
   thinking/listening state and the audio envelope feed its bounded event list.
   It holds at most eight waves and expires them after 2.7 seconds.
4. `brain-network-shaders.js` evaluates those events on the GPU. Light travels
   along links, crosses regions as wavefronts and expands beyond the anatomy.
   A soft radial fade in projected space dissolves rings before the square
   capture buffer can clip them, including during dragging and parallax.
   Thousands of positions are not rebuilt on the CPU every frame.
5. `Orb` joins the activity state to NOX's existing state and focus. `Stage`
   remains the only animation clock and recording canvas. There is no second
   requestAnimationFrame loop or new cloud request.

The graph is an artistic visualization. Its links are not measured biological
connections or the LLM's internal weights. It does not simulate consciousness,
neural computation or superintelligence. NOX's answers still come from the
existing configured language model.

## Limits, cost and fallback

- Desktop: at most 4,200 anchors, 11,000 links, a 512-pixel GPU canvas and
  30 GPU frames per second.
- Phones and low-memory device hints: at most 2,000 anchors, 5,000 links,
  384 pixels and 24 GPU frames per second.
- Four draw calls: faint anatomical silhouette, links, nodes and an instanced
  wave layer. A fixed set of eight wave uniforms bounds shader work.
- Geometry, materials, context listeners and pending loads are disposed using
  the existing lifecycle. Lost contexts show the sourced vector fallback until
  the renderer is rebuilt. Background tabs avoid GPU work.
- Motion remains governed by NOX's existing explicit motion preference. A
  genuine reduced-motion state freezes travel while preserving readable state.
- All assets and rendering run locally. No new paid service, microphone
  processing, authentication scope or stored user data is introduced.

The anatomical asset retains its BodyParts3D CC BY 4.0 attribution. The connected
particle pattern adapts the official MIT-licensed Three.js drawrange example.
Pinned sources and licenses are under `public/vendor/`.
