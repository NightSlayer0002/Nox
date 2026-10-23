# Conversation reliability and companion verification

23 October 2026. Implementation commits: `9374b95` through `4ef8bd9`; short-phone fix: `07bfc59`; final gravity capability correction: `89fd7bf`. Design documentation: `1f95eb5`.

## Automated evidence

- `npm run verify`: **848 tests passed**, **260 JavaScript modules syntax checked**, client and Vercel build succeeded. Full local output: `artifacts/reliability-final-verify.log`.
- Independent reviews covered state transport, action receipts, model fallback, audio lifecycle, call cleanup, settings changes, clip planning and floating layout. Material findings were repaired and covered by regression tests.
- The scoped CSS design scan reported no findings in message-companion.css, reply-presentation.css and floating-presence.css. This was a regex-only CSS scan; it does not prove contrast, responsive layout or visual quality.

## Browser evidence

Local browser checks used fictional replies and silent audio fixtures without external model or speech quota.

- Desktop initial placement sits beside the welcome at middle height, with approximately 191px visible NOX artwork. The 390 × 844 phone starts above welcome copy, with approximately 119px visible artwork and a 28 × 21px controls bot inside a 44px target.
- Voice-off text renders immediately. Voice-on waits for actual playback; Show text now releases the complete answer during deliberately slow audio. Deliberately failed speech leaves the full written answer intact. Normal fixture playback reports speaking and reveals its answer.
- The voice conversation dialog opens and returns the same Stage to the floating overlay on close. No microphone permission was requested for this check.
- Simulated touch dwell highlights the selected message and opens its contextual menu with a safe excerpt and described actions. No action is sent until chosen. The revised surprised expression retains filled luminous eyes; sleep marks stay within the canvas and visibly fade.
- Gravity moves through intermediate vertical positions before landing, rather than immediately snapping to its floor. Simulated keyboard opening triggers one hop; suggestion-bar changes do not repeat it. Landscape controls remain above navigation and scroll internally.
- No horizontal overflow at 320 × 640, 390 × 844 or 667 × 375. On short portrait phones, the empty welcome scrolls below NOX; at 320 × 640 its heading starts at 242px while NOX's canvas ends at 234px. The final starter link was exercised. After sending the first message, the extra inset disappears (computed padding 0px) and the transcript uses the complete area above the composer. The 390 × 844 welcome remains unchanged.
- Local proof images: `artifacts/nox-reliability-desktop.png` and `artifacts/nox-reliability-mobile.png`.
- Production welcome placement was inspected at 390 × 844 and 1440 × 900. A real math conversation returned a correct explanation; its contextual menu opened with the selected-message outline, safe excerpt and described actions. Production proof images: `artifacts/nox-reliability-live-mobile.png`, `artifacts/nox-reliability-live-desktop.png`, `artifacts/nox-reliability-live-menu.png`.

## Baseline live probes

Three fictional live chat requests were made before deployment, sequentially with normal allowance and no retry. All used GPT-OSS 20B. A capability question returned the gravity action without an instruction to enable it. An already-done acknowledgment returned action none but incorrectly announced a new activation. Automated action checks alone therefore overstated semantic quality. Saved results: `artifacts/conversation-before.json`.

One 364-character fictional speech request returned its first of two clips after **4,346ms**, with both clips complete after **4,572ms**. Saved result: `artifacts/speech-before.json`. This is a single observation, not a latency distribution or controlled benchmark.

## Updated live probes

The deployed GPT-OSS 120B returned the intended actions in all six completed scenario probes: already-done acknowledgment, refusal, capability question, stop gravity, quoted command and user-stopped-it. Client request times were 900–1,644ms. Saved results: `artifacts/conversation-after.json` and `artifacts/conversation-broader.json`. This compares the whole product change (model, prompt and state), not an isolated blind model benchmark.

The stop reply used imprecise wording about returning to the floor. Review also found that the older capability description excluded the newly restored landing rebound. The final capability correction describes one tiny vertical rebound, stationary gravity stop and explicit Park separately. Regression coverage composes Stage, floating dynamics and interface observation to verify that stopping can leave NOX airborne at the same position.

An additional airborne-stop probe against this final correction received HTTP 502 with a provider structured-output error. It was not retried or silently rewritten, and it could not execute an action. Saved result: `artifacts/conversation-stop-airborne.json`. The final wording therefore has no successful live verdict for this extra case. Do not claim every model response is reliable or all semantics were proven correct.

A correctly instrumented speech probe on the new deployment used the same 364-character fictional text and returned two clips: **4,177ms** to first clip and **4,284ms** total. This remains a substantial provider wait and does not establish a statistically meaningful speed improvement over the baseline. An earlier post-deployment timing probe mistakenly compared the MIME-type field with a generic audio event name; it recorded a 5,350ms total but no valid first-clip measurement. It is excluded from first-clip comparison. Local tests/browser fixtures establish actual-playback synchronization, manual release, bounded waiting and failure cleanup independently of provider speed.

## Publication and limits

Publication was initially rejected by automatic approval review because it could not verify deployment authorization. The user then explicitly approved pushing to main and deploying to Vercel.

- Code revision `07bfc59af461280fa2348fc2f88e972ec242facc`: [GitHub Actions 39986553323](https://github.com/NightSlayer0002/Nox/actions/runs/39986553323) succeeded; [Vercel GGHBRECtWSuwzKVF4AP2xPx441Qs](https://vercel.com/night-86c7/nox/GGHBRECtWSuwzKVF4AP2xPx441Qs) succeeded.
- Final code revision `89fd7bffca4f78380c47086021fba1299275a9fb`: [GitHub Actions 39987539131](https://github.com/NightSlayer0002/Nox/actions/runs/39987539131) succeeded; [Vercel 5fKDqSSHHuN2PubqFPqjtW6GWXJi](https://vercel.com/night-86c7/nox/5fKDqSSHHuN2PubqFPqjtW6GWXJi) succeeded. Subsequent documentation publication changes no runtime code.

No physical Android or iOS device was attached. Touch/keyboard checks used browser fixtures and tests. Local speech fixtures establish lifecycle correctness, not real-provider latency. The free model choice is a documented practical production option, not a universal intelligence ranking; model replies still need ongoing scenario review. Complete answers are saved before voice preparation, and the four-second/manual text escape avoids hiding a valid answer indefinitely.

## Proportion and alignment follow-up

The user found the enlarged NOX too bulky and the bot too small/detached. The conversation canvas is now 208px on desktop and 144px on phones (approximately 155px/107px visible body). Bot artwork is 44 × 33px / 36 × 27px with its existing 44px tap target. Initial placement uses the centered composer width, leaves room for the bot on the right, and vertically aligns with the welcome. When welcome content is not yet mounted, its fallback uses the conversation area rather than the full workspace edge. Native DOMRect prototype geometry has explicit regression coverage.

The follower targets the visible right shoulder instead of the transparent canvas corner. Near the right edge it lifts above that shoulder rather than flipping left. The spring trail, full draggable bounds, held-head room and gravity landing geometry remain intact. Short-phone welcome spacing follows the smaller canvas.

`npm run verify` passes **850 tests**, **260 syntax checks**, and the production build. Browser layouts were checked at 1920 × 1000, 1440 × 900, 390 × 844 and 320 × 640. At 320 × 640 the canvas ends at 218px and the welcome heading begins at 226px, with no horizontal overflow. The right-edge phone bot stayed on NOX's right with its complete target in bounds, and its menu opened. Local proof: `artifacts/companion-proportions-desktop.png` and `artifacts/companion-proportions-mobile.png`.
