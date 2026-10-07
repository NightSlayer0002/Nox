# Deploy NOX and understand every step

NOX's public address is https://nox-iota-lemon.vercel.app with source at https://github.com/NightSlayer0002/Nox. Vercel is linked to main in the Night Hobby team. The Groq defaults and private credentials were entered directly in Vercel. A successful build is not proof of runtime health: the live status and authorization checks described below are separate evidence.

## The recommended free setup

Use GroqCloud for conversation and optionally Groq Orpheus for voice. Use a personal Vercel Hobby project for experimentation. Do not upgrade the AI account or enable paid billing if you want a strictly free setup. Free plans have limits; this does not produce unlimited inference.

- Groq: https://console.groq.com/keys and https://console.groq.com/settings/limits. The default conversation model is `openai/gpt-oss-20b` hosted by Groq. Its name contains OpenAI, but the request goes to Groq and uses a Groq key, not OpenAI billing. Orpheus has a separate speech quota and may require accepting its model terms in the Groq console. It is a preview model, so availability can change.
- Gemini: https://aistudio.google.com/api-keys. The configured default is `gemini-2.5-flash-lite`. Google's free tier permits using submitted content to improve its products; keep sensitive notebook entries out of it.
- NVIDIA: https://build.nvidia.com. Create a key for hosted NIM access, and check the model's access and trial limits. Hosted trial access is not a promise of free commercial production or unlimited credits.
- Vercel: https://vercel.com/new. Sign in with GitHub. Hobby is for personal, non-commercial use. Before monetizing a hosted business, check Vercel's commercial-use rules; that stage is outside this free-only configuration.

Sources checked October 5, 2026: [Groq limits](https://console.groq.com/docs/rate-limits), [Groq models](https://console.groq.com/docs/models), [Orpheus speech](https://console.groq.com/docs/text-to-speech), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [NVIDIA trial terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf), [Vercel Hobby](https://vercel.com/docs/plans/hobby).

## 1. What belongs where

GitHub stores source code and version history. Vercel downloads a chosen Git commit, runs the build, hosts static files, and runs five small server functions: status, chat, speech, summary and session. Groq/Gemini/NVIDIA run the language model. None of these services replaces the others.

Your browser sends text to NOX's same-origin `/api/chat` endpoint. The server adds its secret provider key and forwards a bounded conversation to the chosen model. The browser receives only a validated reply packet. It never downloads the provider key.

The NOX owner access token is a different secret. Enter it once in Preferences → Owner access. It is sent only to your own NOX server, cleared from the input immediately, and never saved in localStorage. The server issues a signed, HttpOnly, SameSite=Strict cookie for up to twelve hours; production also requires Secure. Reloads and new tabs on the same host can reuse that session. Lock cloud access clears this browser cookie. Changing NOX_ACCESS_TOKEN invalidates every existing session. Treat both access and your token as private; this lightweight gate protects an owner prototype, not a public multi-user service.

## 2. Local keys, if you want the brain on this computer too

From the project folder in PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` locally. Put your Groq key in `GROQ_API_KEY`. Never put it in HTML, `public/js`, a GitHub file, or a chat message. `.env` is excluded by `.gitignore`. Restart the server after changing environment values:

```powershell
npm.cmd start
```

`npm.cmd run dev` restarts the Node process when backend files change. Frontend file changes need a browser refresh. Local `.env` is not uploaded to Vercel; the cloud settings are entered separately.

## 3. Commit the source to GitHub

If this folder has not been initialized yet:

```powershell
git init -b main
git remote add origin https://github.com/NightSlayer0002/Nox.git
```

Then:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
git status --short
git add .
git commit -m "Build NOX cinematic studio with switchable AI brains"
git push -u origin main
```

Before committing, check that `.env`, `.vercel`, `node_modules`, and `artifacts` are absent from staged files. Git may ask you to sign in to GitHub through its credential manager. If it asks for an author name/email, use your own GitHub identity (a GitHub no-reply address works). Do not enter an API key as a Git password. Do not force-push over work someone else added.

## 4. Import the repository into Vercel

1. Sign into Vercel with GitHub. Complete account terms and GitHub access prompts yourself. You can grant access just to Nox.
2. Choose **Add New / Project**, import `NightSlayer0002/Nox`, and choose your personal team.
3. Project root is the repository root. Framework is **Other**. Node is **24.x**.
4. The committed `vercel.json` sets build to `npm run verify` (tests, syntax checks, then output packaging) and install to `npm install --ignore-scripts`. Leave the Output Directory override **off**: the build writes the explicit `.vercel/output` format.
5. Add environment settings below for Production. Add them to Preview only if you want cloud access on preview URLs too.
6. Deploy. Wait for Vercel to show Ready. Copy the URL it actually assigns; the app does not assume `nox.vercel.app` is available.

Our build uses Vercel's [Build Output API v3](https://vercel.com/docs/build-output-api). This explicitly packages backend functions and avoids guessing the framework from our native Node project.

## 5. Exact Vercel environment settings

| Name | Value / purpose |
|---|---|
| `GROQ_API_KEY` | Your private Groq key, entered in Vercel's environment settings |
| `NOX_PROVIDER` | `groq` |
| `GROQ_MODEL` | `openai/gpt-oss-20b` (optional; this is already the default) |
| `NOX_ACCESS_TOKEN` | A long random private token you create, separate from provider keys |
| `NOX_NATURAL_VOICE` | `1` for Groq speech; `0` to keep voice entirely in the browser |
| `NOX_SPEECH_PROVIDER` | `groq` |
| `NOX_SPEECH_VOICE` | `troy` |
| `GEMINI_API_KEY` | Optional Google key; makes Gemini appear in Settings |
| `GEMINI_MODEL` | Optional; defaults to `gemini-2.5-flash-lite` |
| `NVIDIA_API_KEY` | Optional NVIDIA key; makes NIM appear in Settings |
| `NVIDIA_MODEL` | Optional; defaults to `nvidia/nemotron-3-nano-30b-a3b` |
| `NOX_PUBLIC_ORIGIN` | Only for a custom domain, such as `https://nox.example.com` |

Vercel's automatic deployment/production URL variables are used for the normal `.vercel.app` host allowlist. Keep system environment variables exposed (the default). Custom domains need `NOX_PUBLIC_ORIGIN` and a redeployment. Local `PORT` is not needed on Vercel. Leave `OPENAI_API_KEY` blank for this free-only setup.

Generate a random owner token privately on your computer, for example:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep that output private and save it in your password manager; enter it in Vercel and NOX Settings. Do not paste it in chat. The server fails closed: cloud credentials without an owner token leave cloud use locked.

Changing a Vercel environment value needs a new deployment before running code sees it. Use Redeploy or push a new commit. [Vercel environment variables](https://vercel.com/docs/environment-variables).

## 6. Confirm that the live app works

- Open the actual deployment URL over HTTPS. The background, font, face, and sidebar should load.
- Click Gravity twice. It should start and stop; repeat with another program.
- Open Settings. With keys configured the anonymous view says owner locked. Enter the NOX access token, then choose GroqCloud.
- Send two different questions. The provider should return fresh model-generated replies. If a quota, model-access or key error occurs, the UI reports it; it does not secretly replace the reply with a scripted line.
- Choose Natural voice, then turn Voice on. The AI-generated voice disclosure appears in Settings. If Groq speech model terms need acceptance or the quota is exhausted, check the Groq console or choose Browser voice.
- Lock access again. Providers disappear and cloud calls require unlocking.
- Check phone layout. Camera and microphone permissions are optional; NOX's model cannot see your camera. Recording still exports silent WebM, including the room, live character, captions, and optional camera preview. Use OBS/system-audio capture to include voice.

Until these live checks pass with a real provider key, describe the integration as implemented and locally tested, not account-verified.

## 7. How edits reach the live website

```text
Save a local file
  → refresh localhost to see it while developing
  → run tests/check/build
  → git add, commit, push to main
  → Vercel automatically builds that commit
  → a successful deployment updates the production URL
```

A save does not change the public website. We deliberately do not run an automatic file-watcher that commits half-written files or secrets. Once Vercel is linked, pushes to the configured production branch (normally main) deploy automatically; other branches create preview deployments. [Vercel Git integration](https://vercel.com/docs/git).

For the next update:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
git add public server shared scripts tests docs README.md package.json vercel.json .env.example
git commit -m "Describe the change"
git push
```

Local and hosted browser storage are different origins. Your localhost notebook will not automatically appear on Vercel, and another device starts with a fresh notebook. This release has no cloud database or cross-device memory sync.

## 8. Limits to understand as a founder

A language model generates responses from context; the prompt is NOX's personality and rules, not his entire brain. We do not train our own model in this release. Each provider receives the current message, selected persona, name, up to twelve facts, and up to twelve recent turns. You can switch providers, but providers can sound different even with the same prompt.

The server's thirty-request-per-minute limit is an in-memory convenience limit per running function process. It is not a global usage cap, billing control, or durable public-user quota. Owner protection and provider-side Free plan limits are what make this prototype appropriate for personal access. Anonymous cloud AI is disabled. A public product with user accounts needs a database-backed quota and proper authentication first.

A free quota can be reduced, exhausted, or removed. Check the provider dashboard for your account's exact current limits. Switching providers is manual and explicit; we do not silently share the same conversation with another provider when one fails. Check trial/commercial rights before using NVIDIA access for monetized content.

## 9. Files introduced or changed for deployment

| File | Responsibility |
|---|---|
| `server/providers.mjs` | Provider catalog, server-only keys, fixed endpoint adapters, common personality and reply normalization |
| `server/ai.mjs` | Shared NOX identity and legacy OpenAI Responses adapter |
| `server/speech.mjs` | Fixed Groq Orpheus or legacy OpenAI speech request, text/audio bounds, timeouts |
| `server.mjs` | Local static server and common API handler, host/origin checks, owner authorization, cloud quota guard |
| `public/js/app.js`, `public/js/connection.js` | Provider selection, explicit connection states, unlock/session requests, same-origin cloud requests |
| `public/js/voice.js` | Browser voice selection and cancellation-safe natural audio playback |
| `scripts/build-vercel.mjs` | Rebuilds static output and five packaged Node function entrypoints |
| `vercel.json` | Vercel install/build configuration |
| `.env.example` | Configuration names and defaults, without real secrets |
| `.gitignore` | Excludes secrets and generated output |
| `tests/providers.test.mjs` | Provider request shape, failures, no secret metadata |
| `tests/speech.test.mjs` | Text limits, provider/voice selection, bounded audio |
| `tests/voice.test.mjs` | Playback races, aborts, blob cleanup, browser voice selection |
| `tests/deploy.test.mjs` | Static/private separation, stale asset removal, packaged handler execution |

A function does not listen on port 3000 in Vercel. Vercel invokes its exported handler. We take the existing HTTP server's request listener and export it, preserving the same validation in local and cloud execution. Each function folder includes its backend module dependencies and `.vc-config.json`, whose runtime is Node 24. Static files are copied separately; no `.env` file enters either output.

### Why each function has its own package.json

The function bundle includes a minimal `package.json` with `"type": "module"`. This tells Vercel that the shared `.js` contract uses ESM exports. Local Node 24 can infer the module type from source syntax, which initially hid the missing declaration. The first live function invocation revealed the mismatch. The build regression now imports every handler in a separate Node process with automatic module detection disabled, and each bundle declares its module scope explicitly. A successful build is followed by live endpoint checks; it is not sufficient proof of runtime health.

## Live verification record — October 5, 2026

The first live API invocation revealed the ESM-scope issue documented above. Commit `c32e38e` fixed it; pushing main automatically produced a Ready production deployment. The live `/api/status` endpoint returns HTTP 200 with owner-locked metadata. Unauthenticated `/api/chat` and `/api/speech` both return HTTP 401 before any provider invocation. The frontend loads over HTTPS, and Gravity starts then stops on its second click. The owner then unlocked the visit for the real conversation and speech checks below.

### Orpheus model terms and long replies

Groq requires a separate acceptance of the speech model terms in the account that owns the API key. The owner completed this in the Orpheus Playground; the live speech endpoint then returned HTTP 200 for a short sample. Orpheus accepts at most 200 characters per request, while NOX captions permit 420. `server/wav.mjs` splits longer speech near whitespace without breaking surrogate pairs. `server/speech.mjs` generates the parts in parallel under one twenty-second deadline and combines compatible audio frames into one WAV with corrected container sizes and a two-megabyte output cap. Long replies therefore use multiple speech requests and consume more of the separate free quota. No reply text is silently cut off to fit one provider request.

Owner-authenticated live conversation was verified with a shadow/stage-fright premise, a distinct follow-up ending, and a short Hello reply using Groq `openai/gpt-oss-20b`. The owner confirmed hearing the natural Hello sample. After commit `c95de44` deployed automatically and reached Ready, a fresh prompt produced a 253-character story. Production logs recorded HTTP 200 for both chat and the assembled speech response, verifying the longer reply path beyond Orpheus's single-request limit. The listening confirmation applies to the short sample; the long reply was verified through the live requests and WAV tests.

Final source verification before that deployment: 62 tests passed, 31 JavaScript modules passed syntax checks, and the Vercel output build succeeded. Safe speech diagnostics log only constant failure categories, HTTP status, and a whitelisted format name; they never log API keys, owner tokens, provider error bodies, or conversation text. The live-site screenshot is saved locally at `artifacts/nox-live.jpg` and is intentionally ignored by Git.

## NOX 0.5: home, workspace, history, and streaming

The current connection repair adds a fifth `/api/session` function. If you see **Unlock AI**, enter your existing NOX access token in Preferences → Owner access. No new Groq key is needed. Unlock automatically selects your configured provider and lasts up to twelve hours on this browser/domain. A reload should still show GroqCloud. **Scripted demo** is now an explicit provider choice; locked or failed AI never silently substitutes scripted replies. A browser blocking the session cookie receives an actionable error rather than a false success message.

Voice defaults to a recognized male browser voice, or male Troy when Natural is selected. New speaker selections use v2 preferences; prior speaker defaults reset once for this requested change. Natural PCM WAV mouth animation measures audio amplitude and closes through silence. Browser speech has explicit sentence gaps and uses word events where supported; its timing remains approximate. Test with “Hello. Give me a moment. Now I’m back.” and watch the pause between sentences. Subjective timbre still needs your own listening check.

The home page is `/`; the interactive workspace is `/app`. The current build packages `/api/summary` and `/api/session` alongside status, chat, and speech. All five are Node 24 functions with explicit ESM scope. Chat streaming uses the existing chat endpoint with `stream: true`; it sends SSE text events and one final normalized packet. A closed or failed stream never becomes a saved assistant reply. Cloud chat, summaries, and speech share the same owner authorization, trusted origin, request-size bounds, and convenience rate limit.

Motion and voice default on for a fresh preference set. Settings persist explicit off choices. Browser voice is the default engine, and audio playback requires browser interaction. Orpheus remains optional: choose Natural, pick a character voice, and use Try this voice. NOX 0.5 used Austin as its default; the requested boyish voice in 0.6 defaults to male Troy. Supported vocal directions reflect NOX's mood and count toward the 200-character segment budget. These are model directions, so acting quality can vary.

The Library stores conversations in this browser and domain, with search, reopen, export, and delete. It holds up to 40 threads and 200 messages per thread; the oldest entries are bounded rather than an unlimited archive. Export conversations you want to preserve. Web Locks serialize mutations against fresh storage, and storage events update other tabs; browsers without this capability are told to use one workspace tab. If browser storage fails, the UI says that new history lasts for the visit. Cloud requests use a compact summary, recent context, and bounded excerpts of unsummarized old turns while a summary is pending. Full retained transcripts remain available locally. Summarization consumes additional model quota only at its background threshold, and it never replaces or deletes the transcript.

Speech caching is process-local, bounded to 12 entries / 12 MiB and five minutes. Cache keys hash the configured provider credential, voice, persona, emotion, and exact text. Identical in-flight work coalesces; failed requests are not cached. A Vercel cold start or another function instance has its own empty cache. Groq's automatic prompt cache is different: it can reuse an identical prompt prefix on supported models, so the fixed identity/schema precede changing notebook data. No complete conversation replies are cached.

### Enable NVIDIA later

The owner deferred key setup because NVIDIA's site was unavailable. Groq continues to work; NVIDIA has not been verified against that account.

1. Open https://build.nvidia.com/nvidia/nemotron-3-nano-30b-a3b, sign in, review any model/account terms personally, and choose Get API Key.
2. In https://vercel.com/night-86c7/nox/settings/environment-variables, choose Add Environment Variable → Secret. Enter `NVIDIA_API_KEY`, paste the key privately, select Production, and Save.
3. Leave `NOX_PROVIDER=groq` for Groq to remain the default. `NVIDIA_MODEL` is optional; the code defaults to `nvidia/nemotron-3-nano-30b-a3b`. Setting `NVIDIA_MODEL=meta/llama-3.3-70b-instruct` selects Llama instead. Nemotron 3 requests disable thinking to reduce unnecessary reasoning for character turns.
4. Redeploy the latest commit from Vercel, or push the next code update. Existing deployments do not pick up newly saved environment variables.
5. In `/app`, unlock owner access and choose NVIDIA NIM in Preferences. Send a fresh question and inspect the reply/timing. API Catalog trial access has account and model limits; adding the adapter does not grant access or promise unlimited use.

References: [NVIDIA model](https://build.nvidia.com/nvidia/nemotron-3-nano-30b-a3b), [NVIDIA voice-agent reasoning guidance](https://github.com/NVIDIA-AI-Blueprints/nemotron-voice-agent/blob/main/docs/how-to/configure-llm.md), [Groq prompt caching](https://console.groq.com/docs/prompt-caching), [Orpheus vocal directions](https://console.groq.com/docs/text-to-speech/orpheus).

### Rename the public website link

The project's domain page was inspected: the current `nox-iota-lemon.vercel.app` row has Edit, and its editable Domain field is connected to Production. No name was changed.

1. Open https://vercel.com/night-86c7/nox/settings/domains.
2. Click Edit next to `nox-iota-lemon.vercel.app`.
3. Replace Domain with an available name such as `your-nox-name.vercel.app`, keep Connect to an environment → Production, and Save. This example is not an availability claim; Vercel validates it.
4. In Environment Variables, set `NOX_PUBLIC_ORIGIN=https://your-nox-name.vercel.app` using the actual new name, then redeploy. NOX uses an explicit hostname allowlist for its APIs, so new aliases/custom domains need the correct configured origin. The owner token protection remains in place.
5. Test the home page, `/app`, and owner-unlocked chat at the new URL. Export chats before moving: local browser history belongs to the old origin and does not automatically follow the rename. Keep the old address as an additional production domain if you still need old links to work, subject to Vercel allowing that alias.

An owned custom domain follows Add Existing and the DNS instructions Vercel shows. Purchasing a domain is separate from renaming a Vercel subdomain and was not requested. Renaming the repository or Project Name is a different setting from editing this production alias. [Vercel domain documentation](https://vercel.com/docs/domains).

### Live 0.5 verification — October 5, 2026

Commit `aef0fb8` deployed automatically and reached Ready. The landing page and `/app` served the new UI; the public status endpoint returned HTTP 200 and owner-locked metadata. Anonymous chat, speech, and summary requests returned HTTP 401. The owner unlocked the workspace without sharing the token. Groq recalled the shadow from the migrated conversation, then generated a fresh response. That second request measured server-side first words at 413 ms and completion at 414 ms; Orpheus audio was received in 2908 ms. The background conversation summary completed, and the local transcript still had all 21 retained messages. Browser voice was selected again after testing Natural. Local verification passed 80 tests, syntax checks for 41 modules, the Vercel build, and independent review. NVIDIA remains deferred, not account-verified. These timings are one test sample and exclude work before the server timer begins.

## Live 0.6 connection, voice and gravity verification — October 5, 2026

The earlier repeated lines came from the scripted demo after visit-only access was lost. NOX now blocks locked cloud sends and requires demo to be chosen explicitly. The owner unlocked once; the signed session survived reloads and subsequent production deployments without re-entering the private token.

Groq's previous JSON-object streaming path returned `json_validate_failed`. Safe diagnostics identified that category without logging provider bodies, secrets or conversation text. Commit `d304f53` switched supported GPT-OSS requests to strict JSON-schema output. A real two-sentence LLM explanation succeeded, measuring first text and completion at 1059 ms and natural audio at 2047 ms. Strict Groq responses arrive as a complete validated packet, while NVIDIA/Gemini keep their token-streaming paths.

The owner heard the male Troy sample and confirmed it was boyish enough. During a live replay, the DOM mouth level measured 0.86 during voiced audio and 0.00 with the rest expression during a silent audio interval. Natural WAV timing follows actual playback amplitude; browser speech timing remains approximate.

Commit `e1d952f` reached Ready through the existing GitHub → Vercel pipeline. After reloading the public workspace, a fresh identity question generated: “I’m NOX, a minimalist AI companion—just call me NOX.” The UI identified GroqCloud, with first text at 311 ms, completion at 312 ms and voice at 2210 ms. These are individual server-side test samples, not latency guarantees.

Two live pickup/release loops kept Gravity's control pressed well beyond its former ten-second timeout. On release, the falling expression was surprised, gazeY was 10.34, held was false and falling was true. Landing cleared the falling layer. Clicking Gravity again changed aria-pressed to false and cleared falling. Four regression tests cover long holds, release/cancel/reset, settling and reduced motion. Full verification passed 103 tests, syntax checks for 49 modules and the Vercel build; independent review found no important issues.

Local proof images live under ignored `artifacts/`: `nox-falling-live.jpg`, `nox-identity-live.jpg` and `nox-annoyed-live.jpg`. Verification output is `nox-gravity-verify.log`. The temporary preview server was stopped; no task preview remains on port 3002. NVIDIA remains configured in code but deferred until the owner supplies a key.
## NOX 0.7 acting update

Expressions now render locally from twenty Canvas poses, with a matte charcoal body. The language-model packet schema, owner session and boyish voice remain compatible; no new API key is needed for gestures or expression previews. The Scene Studio preview and “His little tells” guide expose the acting vocabulary.

Preflight verification passed 114 tests, 50 JavaScript syntax checks and the Vercel build. Independent review caught fine-sample shake and wake-up issues; realistic movement regression tests verified both fixes. Local browser QA confirmed spiral rendering, immediate preview switching, phone layout, portrait film composition and the new corner peek. The temporary preview on port 3002 was stopped after QA.

For a release check, reload `/app#scenes`, select Dizzy under Try an expression and press Show me. Switch to another face immediately. Pick him up normally, then hold the button and shake left/right or up/down to trigger dizziness. With Gravity enabled, release and check that he falls and the Gravity control stays on. The local gestures consume no provider quota. Keep previews distinct from actual gesture checks: a preview verifies a rendered pose, while timed input tests verify the detector.
The rare Cute outrage update adds one local pose after six ordinary annoyance bursts. Four new regression tests cover its cadence, continuous clicking, preview/dizzy isolation, double-click protection, hover priority, and speech silence. Full verification passes 118 tests, syntax checks for 50 modules and the Vercel build. It needs no new provider setting or API key.

## NOX 0.8 Laboratory

The editorial frontend bundles React, GSAP, Motion, Lenis, React Spring and Three.js locally with esbuild. The build compiles JSX before copying public assets into Vercel output; no CDN scripts or extra hosting project are required. The 3D scene is a lazy chunk, renders on demand, caps pixel ratio at 1.5, and has a static fallback. Hash routes, scene controls, owner access and existing local data keys remain compatible. New `nox.knowledge.v1`, `nox.depth.v1` and `nox.theme.v1` keys hold the notebook and preferences. They do not synchronize across origins/devices.

Groq Deep defaults to `openai/gpt-oss-120b`; `GROQ_DEEP_MODEL` can override it on the server. Existing deployed keys are sufficient; no new credential is needed. Quick/Balanced/Deep use output budgets of 900/1,800/4,000 tokens and more reasoning for GPT-OSS, with written caps of 420/2,400/6,000 characters. Provider inference still has a 20-second deadline inside a 30-second function. A long Deep request may exhaust free quota or time out; errors remain visible. Voice reads a sentence-bounded opening of at most 420 characters. The complete written answer remains in history.

Explicit remembered facts are opt-in in both cloud and demo paths, with a second guard before browser storage writes. User-added knowledge is plain text, ranked locally with BM25-style scoring and bounded to four relevant excerpts. The server treats excerpts as untrusted reference data. Source labels identify submitted context and do not certify the answer's faithfulness. The 16 KiB request budget can remove context before transmission.

Failed bearer guesses across API endpoints share a bounded eight-attempt/five-minute guard. Its 512 IP buckets are process-local, as are ordinary API quotas and speech caches: Vercel instances do not share them. Signed owner sessions, host/origin checks, bounded bodies and allowlisted actions remain the principal application boundaries. This deployment is a private owner prototype; separate public user accounts, a tenant database and distributed abuse protection are future work. Self-only script policy, blocked objects, same-origin form destinations, and immutable caching for hashed chunks are emitted by the build. API responses remain no-store.

Use [the current system manual](NOX-SYSTEM-MANUAL.md) for the full architecture and operating responsibilities. Vercel Hobby is restricted to personal/non-commercial use; NVIDIA's API Catalog trial is for evaluation and is not a free production entitlement. Review the official terms linked in that manual before monetizing. Keys, account terms and model availability remain the owner's responsibility.

After deployment, reload the homepage and workspace. Check 3D rotation, mobile menu, command palette (`Ctrl/⌘ K`), Knowledge add/disable/export/delete, all workspace hashes, and owner-session persistence. Unlock with your existing private owner token to verify real model replies. Never place tokens or provider keys in source, public browser bundles or screenshots.
