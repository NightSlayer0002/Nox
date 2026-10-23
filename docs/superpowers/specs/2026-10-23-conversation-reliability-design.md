# NOX conversation reliability and spoken replies

The user approves repairing state/action coherence, evaluating a stronger sustainable free model, and improving the delay between written and spoken replies. They delegate implementation choices and ask to discover broader failure cases rather than patch particular sentences.

**Status:** Implementation is complete in the working tree, with focused regression coverage. Final release checks, live scenario evaluation and deployment verification remain pending.

## Design

Supply an enum/boolean-only observation of NOX's current route, form, presence, gravity/effect, held/grounded state and latest action execution receipt. Missing fields remain unknown; arbitrary text, URLs, coordinates and instructions are excluded. It is data about the interface, never dialogue attributed to the user or authority to change rules. Existing recent messages remain intact. Capabilities describe stationary placement, vertical composer gravity and keyboard reactions. Corrections, acknowledgments, questions and refusals do not by themselves authorize a new effect. Model requests to enable an already enabled effect are idempotent; manual buttons retain their toggle behavior. Stage records applied, already-active, stopped and unavailable results, including scene expiry. Chat's stop action ends the current effect without stopping speech; authored Afterimage cues retain their original action vocabulary. Avoid canned response rewrites and additional model calls per chat.

Groq GPT-OSS 120B is the implemented default and fixed public model, using the existing credentials. Public guest chat has an explicitly reported, single GPT-OSS 20B fallback only for quota or unavailable-model errors before answer text is emitted. Cancellation, malformed output, credentials and arbitrary provider failures do not trigger fallback. Owner provider/model overrides remain separate. Reply metrics retain the model actually selected and fallback reason. No paid providers, billing changes or increased public allowances are introduced. Official model/free-plan constraints are documented separately; fictional scenario fixtures and an opt-in evaluation script are implemented, with live comparison pending. This does not establish universal model superiority.

When voice is enabled, start synthesis as soon as the validated answer is available. Keep a compact preparing-voice status and reveal the complete written reply when actual playback begins. Provide Show text now and a four-second maximum additional presentation wait; audio failure or unsupported voice also releases the text immediately. Voice-off replies appear as they stream. Store complete written answers before waiting for audio, preserve cancellation and call behavior, and never replay scene actions just to replay voice. Expose actual preparation/playback timing in the developer inspector. Maintain the existing 420-character spoken opening.

Natural audio uses its actual playing event, and browser speech uses utterance start; successful play() acceptance alone does not reveal text. Ordinary Groq speech rebalances a shorter first clip only when the existing clip count is preserved or reduced, keeping the same text and character limits. Four-cue Afterimage synthesis is unchanged. MP3 preparation avoids a redundant WAV-envelope byte read. A call audio failure retains the completed visible answer; changing voice settings during preparation releases text before pausing the call for reconnection.

## Companion interface refinements

The conversation overlay uses a preferred 256px desktop or 160px compact canvas, reduced to fit short viewports and Takeover. It starts beside the welcome area; Park remains explicit. The controls bot follows with a damped spring and fading trail. The follower, gravity and CSS trail use the same effective Stage motion preference, honoring the workspace's explicit motion-on setting. A faster gravity drop has one small landing rebound; the keyboard hop does not add a second bounce. Sleep marks are enlarged, repositioned within the canvas and fade through their animation wrap.

Message exploration has visible dwell progress, target highlighting, a message excerpt and action descriptions. Hover action buttons remain reachable across the gap below a message. Pointer menus animate briefly; keyboard entry focuses an action directly, with arrow/Home/End navigation, Escape dismissal and focus restoration. The existing explicit-choice and draft-protection boundaries remain intact.

## Alternatives and decisions

- Switching models alone leaves missing state and stale capability descriptions; repair those first.
- Hardcoded replies for the reported phrase would miss paraphrases; use typed observations, explicit execution results and a scenario suite.
- Always displaying text immediately preserves speed but keeps the reported mismatch. Waiting indefinitely for TTS could hide a valid answer; selected bounded synchronization gives immediate user control.
- Chunking speculative model text into TTS can speak invalid or later-revised content and consume more requests. Only validated replies enter synthesis in this change.

## Limits and acceptance

No new account setup, paid service, external persistent conversation log or autonomous movement. Runtime action receipts do not rewrite historical archives. Focused tests cover state sanitation and transport, action no-ops/stop/expiry, cancellation, slow/failing/blocked audio, calls, full written-answer retention, clip planning and companion behavior. Fictional correction/refusal/reasoning scenarios require live semantic review in addition to automated action checks. Pending provider probes must stay small and use the normal public allowance; compare quality, model identity and latency without exhausting it. Final browser, physical mobile audio and exact deployment verification remain release work, reported separately from synthetic tests.
