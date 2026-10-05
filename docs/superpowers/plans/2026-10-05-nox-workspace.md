# NOX landing and workspace implementation plan

> Execution: inline, following the user's requested update to the existing deployed app. Use executing-plans and test-driven-development; one independent whole-change review before publishing.

**Goal:** A cinematic home page and usable NOX workspace, with global gaze, default-on motion/voice, saved chat threads, NVIDIA setup, expressive speech, and observable latency improvements.

**Design:** `/` is a spacious hero inspired by the supplied arch/window references. `/app` opens the workspace. Keep the original room asset, native Canvas character, dark palette, warm cream accents, and restrained typography; draw a tactile body behind the existing live facial features. Workspace navigation selects Explore, Conversation, Scene studio, and Library views; each has a concrete job. Settings remains a dialog. No invented research/search powers or fake saved projects.

**Constraints:** Existing Node 24/native JS architecture, no paid service or new account dependency. Keys remain in Vercel; owner bearer protection stays intact. Camera stays local. Chat history is local to this browser/domain, searchable, exportable, and removable. No caching across unrelated conversation contexts. Saving local code still requires commit/push for production.

## Task 1 — History and context

Files: `public/js/history.js`, `public/js/memory.js`, `shared/character.js`, `tests/history.test.mjs`.
Interface: `createHistory(storage)` exposes active(), list(query), create(), select(id), append(role,content), remove(id), context(), summaryWork(), applySummary(id,through,text), export(). Threads keep at most 200 messages and 40 sessions; context sends a bounded summary plus eight recent turns. Migrate existing notebook history once. All text is rendered with textContent.
- [x] Write/run failing tests for isolation, reload, search/export/delete, corrupt storage, bounded context and stale summary rejection.
- [x] Implement history storage and bounded summary context. Run focused tests.

## Task 2 — Streaming, summaries and speech

Files: `server/providers.mjs`, `server/stream.mjs`, `server/cache.mjs`, `server/speech.mjs`, `server.mjs`, `scripts/build-vercel.mjs`, `public/js/stream.js`, API/voice tests.
Interface: requestProvider supports onText and AbortSignal; `/api/chat` accepts stream:true and emits text/final/error SSE. Partial speech is text only; actions execute only from the final validated packet. `/api/summary` accepts previous summary and up to 24 older turns, under the same owner/origin/size/rate limits. Warm-instance speech cache is TTL/LRU bounded and coalesces identical in-flight calls; failures are never cached. Static identity/schema precede dynamic notebook data for provider prefix caching. Browser voice and Groq vocal directions use packet emotion; selectable supported Orpheus voices.
- [x] Write/run failing tests for fragmented Unicode SSE, premature termination, cancellation, summary bounds/auth and cache expiry/failure isolation.
- [x] Implement adapters, summary handler, caching and emotion. Build all four Vercel functions; run focused tests.

## Task 3 — Product views and interaction

Files: `public/index.html`, `public/app.html`, `public/style.css`, `public/js/landing.js`, `public/js/app.js`, `public/js/stage.js`, `public/js/face.js`, tests/face.test.mjs.
Interface: hash routes within /app select real views; starting/selecting/deleting a thread cancels current reply/voice. Global pointermove updates gaze; drag remains canvas-local. Motion and voice default on with explicit saved off preferences. Browser autoplay still requires interaction. The face is live on both pages. Streaming replaces one draft message; persist only completed assistant replies. Background summaries run only after sufficient old turns, never on every send.
- [x] Write/run failing regression for gaze outside canvas.
- [x] Implement landing, workspace, sidebar/history UI, preserved appearance switch, voice preferences and timing display.
- [x] Browser-check desktop and phone, navigation, global gaze, history reload/search, streaming and cancellation. Save screenshots. Export/delete behavior also has storage tests; post-review async browser checks follow below.

## Task 4 — Deployment and teaching

- [x] Update founder/deployment guides with architecture, storage limits, cache scope, summaries, NVIDIA setup and Vercel domain editing instructions.
- [x] Run npm.cmd run verify; independent review and fix material findings. Commit/push the verified update to main under the existing deployment authorization.
- [x] Confirm Ready production source, landing/workspace/API health. NVIDIA setup was explicitly deferred by the owner; the adapter is ready but its account connection is unverified.

Review focus: aborted streams must not persist partial replies; thread switches must not cross-contaminate context; failed summaries must not discard full history; speech directions must fit Orpheus's 200-character limit; custom domains must be allowlisted without weakening authentication.

Ruling: retain this user-owned checkout and its established main→Vercel publication workflow; the user asked for edits here to reach the same site. Native implementation and one final reviewer avoid parallel edits to the central app controller.

Ruling: independent review found four P2 cases; each was reproduced with a failing test before fixing. History now uses awaited fresh-state mutations under Web Locks, captured thread IDs, and storage-event refreshes. Context keeps up to twelve unsummarized full turns and a bounded excerpt bridge beyond that, rather than assuming a pending summary is complete. SSE sends deltas and supports old cumulative events during deployment transitions. The shared motion preference reader preserves explicit v1/v2 off choices. An initial reviewer could not run because its model usage limit was reached; a fresh reviewer completed the full review and a targeted follow-up, approving these fixes.

Final local verification after the fixes: 80 tests passed, 41 JavaScript modules passed syntax checks, and the Vercel output build succeeded. NVIDIA credential setup was explicitly deferred by the owner because its site was unavailable; no live NVIDIA account claim is made. Vercel's actual Domains/Edit form was inspected without changing the public alias.

Post-review browser evidence: two real same-origin workspace tabs each created a different conversation while replies streamed. The Library and downloaded `nox-conversations-2026-10-05.json` both contained the two complete two-message threads. The download event waiter timed out, but the exported file itself was located and parsed to verify the result. The preview model was explicitly labeled Local test fixture; these checks are browser integration evidence, not live Groq/NVIDIA measurements.

Production evidence: commit `aef0fb8` automatically deployed and reached Ready at https://nox-iota-lemon.vercel.app. Home and /app loaded the new product. Public status returned HTTP 200 / owner locked; anonymous chat, speech and summary returned HTTP 401. After the owner unlocked a live workspace, Groq correctly recalled the earlier shadow character and generated a new line about its home. The second turn measured first words at 413 ms and completion at 414 ms (server timer); natural audio was received in 2908 ms. The background summary completed and the retained transcript still contained all 21 messages. Browser voice was restored as the selected default after the natural-voice test. These are individual request measurements, not a comparative latency benchmark.
