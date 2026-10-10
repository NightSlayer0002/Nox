# AFTERIMAGE: a transmission from a reality you haven't made

This is a creative fiction instrument for NOX, designed for strange story hooks
and performed short videos. It turns one user seed into three playable signals,
each with three acts and two prepared endings. It does not predict the future,
read a camera, claim consciousness, or browse. The distinctive combination is
branching microfiction plus NOX's existing acting and local capture; worldwide
uniqueness is not claimed.

## Flow and controls

Open `/app#afterimage` from the rail, command palette or homepage. Enter a seed
(1–600 characters) and choose wonder, uncanny or bold. Receive makes one
protected generation. Normally it uses one model request; a confirmed provider
HTTP 400 `json_validate_failed` can retry once within the same deadline, with
the attempt count disclosed. A clearly labeled authored example works without AI
access. Three signals appear as an interactive branch lattice. Select one and
choose either ending. Edit its lines locally; Play performs three acts followed
by the chosen ending. Each cue lasts seven seconds, for a 28-second cut.

Stop ends the performance and speech. Navigating away, tab hiding, starting
ordinary chat or changing scene also stops it. Record uses the existing local
captioned WebM path (silent); the actual voice can be captured with OBS or added
in an editor. Export includes the editable script and captions. The browser
keeps at most twelve receptions in a versioned local store, with an explicit
delete control and no cloud synchronization. Replays, local edits and ending
choices do not call a text model. Cloud voice still consumes its speech quota.

## Exact server contract

POST `/api/afterimage`: `{seed:string,tone:'wonder'|'uncanny'|'bold',variation?:integer,provider?:string}`.
The server owns the provider URL/model. No transcript, notes or camera frames
are attached automatically. Origin, owner session, content type, byte/field
limits and request rate protections match chat. Requests can be aborted.

`normalizeAfterimage(value)` returns only this packet and rejects missing or
unexpected structures; it applies string limits and allowlists to every cue:

```
{
  title: string (80),
  anchor: string (160),
  signals: [3 × {
    label: string (48),
    premise: string (180),
    beats: [3 × {speech:string (90), emotion:EMOTIONS, action:ACTIONS}],
    endings: [2 × {label:string (48), speech:string (90), emotion:EMOTIONS, action:ACTIONS}]
  }],
  caption: string (280)
}
```

EMOTIONS and ACTIONS use `shared/character.js`. No model-generated JavaScript,
URLs, DOM commands or new actions are accepted. Regular chat's packet and
provider behavior remain intact. Response:
`{packet,metrics:{provider,model,totalMs,cacheHit}}`. Missing owner access is
401, malformed input is 400/413/415, unconfigured model is 503, sanitized model
failure is 502. No scripted response masquerades as an AI result. A bounded
short-lived warm-instance cache/coalescing may reuse identical requests;
variation changes the creative take deliberately. It is not a global cache.

## Implementation responsibilities

- Shared packet/schema and protected provider task: backend worker.
- Versioned bounded store, pure timed performance controller and narrow
  stage/voice bridge: client engine worker.
- React receiver interface, source-backed branch visualization, routes,
  homepage invitation and CSS: main agent.
- Teaching manual and concrete privacy/latency limitations: documentation worker.

The performance controller sends four allowlisted cues to the existing Stage.
It never owns the Stage's animation clock. A full four-line script is spoken
once (at most 363 characters), avoiding one TTS request per cue; mouth movement
continues to use actual audio energy. Cue time is a rehearsal schedule, not
word-level audio alignment. Native playback controls remain available.

The design uses the established charcoal/teal system, real states/timecodes and
React Flow's source-backed branch nodes/edges. Motion owns UI entrances and
selection changes. Existing Three/R3F and shader assets remain NOX's world.
Heavy receiver code loads only when the new view is entered. No fictitious
accuracy score, decorative fake telemetry or new paid service is introduced.

## Verification

Validate all fields and counts, untrusted actions, malformed JSON, body limits,
owner/origin gates, provider selection, cancellation and sanitized errors.
Verify one-shot playback, cue order, stop/dispose, stale generations, bounded
storage and corrupt/unavailable storage. Test receiver form, choices, local
editing, authored/live labels, timing controls, exports, sidebar/palette routes,
mobile layout and keyboard navigation. Run the complete test/build suite,
review the implementation, then make meaningful separate commits and verify
the automatic Vercel deployment.
