# October 24 audit repairs

The supplied Word report was checked against `6c83c2a`. Findings below were verified in code and targeted regressions before changing behavior. Conditional deployment risks are listed separately.

| Area | What changed and why |
|---|---|
| Notebook/story integrity | Complete durable read-modify-write operations, including recovery replacement, share a per-store origin Web Lock. This prevents a stale tab restoring deleted data or losing another tab's edit. Unsupported browsers refuse unsafe durable writes while preserving read/export; guest memory remains usable. |
| Truthful deletion and failed saves | Notes/stories require a separate Delete/Keep decision, initially focusing Keep. Failed reads/writes retain known saved items and the selected story. Story removal reports whether it committed. Generated stories that cannot save remain visible/exportable as unsaved visit work. |
| Shared admission | Requests reserve capacity atomically across the allowance check and release it on rejection. Full shared gates do not spend daily allowance. Anonymous text/voice share at most 24 of 30 warm-instance slots, leaving six available to owner requests. Per-client abuse throttles remain. |
| Model deadlines | One 26-second budget starts at HTTP entry and spans primary/fallback attempts. Individual attempts retain a 20-second cap; the single quota/access fallback needs at least four seconds remaining and never follows partial output. Disconnects cancel work. |
| Provider failure diagnostics | Sanitized stages distinguish response-envelope JSON, character JSON and schema failures without logging private replies. Recovery wording is clearer. Malformed output does not automatically spend another model request; this does not eliminate upstream failures or establish a live failure rate. |
| Voice/Afterimage readiness | Natural speech bounds headers, body/clip reads and waveform preparation at 25 seconds, with cancellation and reader/iterator cleanup. Afterimage bounds preflight and playback-start readiness, then continues with captions and an explanation when voice is unavailable. Stop invalidates late work. Existing playback-triggered text reveal and Show text now remain. |
| Camera lifecycle | Start/stop generation numbers prevent late acquisition or playback from reviving a stopped preview. Stale tracks are stopped without disturbing a newer session. Browser regression media are synthetic. |
| IME and names | Composition state, isComposing and key code 229 prevent candidate-confirmation Enter from submitting. Timing/callback phrases after “call me” cannot become remembered names; explicit declarations still support unusual names. |
| Reply presentation | A conservative text-only formatter handles common prose markers and obvious escaped paragraph/list boundaries. Code, quoted strings and paths remain protected; rendering uses text nodes. The original reply stays in history. Ambiguous literal escapes are preserved. |
| Source attribution | Assistant history/export retains up to six bounded source ID/title pairs. Reopening restores their labels. Notebook bodies are not duplicated, and source metadata is not inserted into outbound dialogue. |
| NOX reading clearance | Homepage fallback art belongs to each chapter's visual area instead of a fixed square over copy. Initial narrow chat placement reserves only the text lines beside NOX; later lines use full width. Dragging, Park and gravity retain the deliberate free overlay, without moving him on typing or inserting a blank top row. |
| Browser CI | A separate Chromium job exercises delayed startup, IME, Stop/retry, keyboard menus/navigation, lazy-load failure, same-origin storage, source reload/download, synthetic camera cancellation and fallback/narrow layouts. It uses no provider quota. |
| Development and installs | Frontend esbuild watch runs alongside Node's server watcher; client edits rebuild on the same server, with explicit browser refresh. Exit stops the launched tree on Windows. CI/Vercel use locked npm ci --ignore-scripts; reviewed Actions are pinned to immutable SHAs. |
| Current documentation | Updated model/context/input/output, deadlines, storage and quota facts, marked older notes historical, and removed public-signup implications from Access copy. |

## Evidence boundaries

Final local verification passed **912 unit/HTTP tests**, **282 JavaScript syntax checks**, the production build, and **10 Chromium journeys**. Independent review caught a current-camera playback AbortError cleanup regression; its new test failed before the correction and passed afterward. Review found no other material regression in the audited changes. Production CI and deployment status are checked against the final pushed revision separately.

Deterministic regressions cover overlapping writes, persistence failures, deadlines, IME events, camera lifecycle, admission concurrency and source export. Chromium additionally exercises production modules in real same-origin tabs and downloads the actual archive. The dev loop was checked by serving a temporary JSX marker, restoring it and confirming its port closed.

Browser CI disables WebGL for deterministic functional coverage. Full GPU/FPS, physical-phone keyboards and real microphone permission flows remain manual acceptance checks. Existing GPU visuals were preserved. The report's bundle-size observation is useful but does not itself establish an FPS defect; a measured performance pass remains appropriate.

The first Linux CI run caught a test-isolation problem: the PWA worker could claim the page and bypass the simulated failed chunk download. A controlled-worker reproduction confirmed zero intercepted requests. Synthetic functional contexts now block workers and the test asserts both interception and the failed browser request before checking recovery, following [Playwright's network guidance](https://playwright.dev/docs/network#missing-network-events-and-service-workers). Production service workers remain enabled; these journeys do not certify offline/PWA caching.

Web Locks coordinate updated cooperating tabs; close/reload old tabs after updating. This remains local browser storage, without cloud sync, encryption or recovery.

## Still requiring deployment/account work

- **Branch protection:** [the reviewed policy](BRANCH-PROTECTION.md) requires both CI checks, but a committed JSON file does not activate GitHub enforcement. The connector lacks administration writes and the available browser was signed out. Activation remains pending.
- **Distributed budgets:** the 30/24 limits are per warm process. Optional per-network daily counters do not create a deployment-wide spending or concurrency cap. Private production settings and provider billing limits were not inspected.
- **Owner authentication:** the production secret was neither inspected nor rotated. Strong secret provisioning, a distributed unlock throttle and revocable shared sessions remain separate hardening. Logout clears this browser's cookie; a stateless copied valid cookie cannot be individually revoked.

These repairs improve the public preview; they do not establish a hardened release or prove absence of vulnerabilities.
