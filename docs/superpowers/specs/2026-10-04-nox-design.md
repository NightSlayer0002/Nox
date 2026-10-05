# NOX / First contact

The user has asked to start building the previously proposed NOX character and to teach them the architecture in enough depth to explain it as a founder or in an interview. Their personal attachment is private; the public character is a calm, sarcastic intelligence who can perform comedy, authored horror, and solo experiments.

## First release

A dependency-free, locally served browser application. A procedural Canvas 2D character follows the cursor, blinks, breathes, talks, and can be dragged. Modes change his expression and demo dialogue. Five bounded scene actions let him manipulate his own frame: gravity, spotlight, orbit, echo, and takeover. Uncanny scenes are authored fictional effects, not claims about real surveillance or sentience.

Chat works immediately with a clearly labelled scripted demo brain. An optional OpenAI Responses connection uses a server-only API key and strict structured output. Both brains produce the same validated packet: speech, emotion, action, and a short memory. No arbitrary code execution is permitted. The live path does not silently substitute demo replies after a failure.

Memory is stored in browser localStorage with a versioned schema, bounded facts, and bounded conversation history. Camera and browser speech recognition are activated only by explicit controls. Camera is previewed locally and never sent to the model in this release. Browser speech synthesis speaks replies. Canvas recording exports a silent WebM with captions; system voice capture is deferred and explained in the UI and guide.

## Structure and constraints

Node 22 or later. No npm dependencies, no CDN assets, no bundler, no account required for demo. Native ES modules keep each responsibility separate. The server binds to 127.0.0.1, serves only public/ and the exact shared character module, validates request bodies, and uses bounded AI requests. All visible model status is truthful.

The visual design is a warm paper shell around a dark luminous stage, with an expressive cream face and restrained acid-yellow details. Film mode hides chrome and uses a portrait layout. Reduced-motion preferences disable dramatic effects. Escape resets the scene. Optional capabilities fail gracefully.

## Acceptance

- A new user can start with npm start and meet NOX without configuring a key.
- Demo chat can remember a name, recall it, and invoke bounded scene actions.
- The same packet boundary accepts optional model output and rejects unknown actions.
- Controls cover voice, camera, three personas, scene demos, memory reset, film mode, recording, and text chat.
- Automated tests verify memory corruption recovery, packet validation, dialogue routes, real HTTP routes, request rejection, and provider failure behaviour.
- Browser checks verify desktop layout, chat, scene controls, film layout, memory reload, and graceful unsupported capabilities.
- A founder guide explains every file, data flow, animation mathematics, model boundary, failure modes, design tradeoffs, extension examples, and interview questions.
