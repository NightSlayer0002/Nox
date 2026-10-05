# Deploy NOX and understand every step

NOX 0.4 is prepared for GitHub-backed Vercel hosting. The repository is https://github.com/NightSlayer0002/Nox. A successful local build is not proof of a live deployment: the Vercel import, environment settings, and live smoke test still need to happen.

## The recommended free setup

Use GroqCloud for conversation and optionally Groq Orpheus for voice. Use a personal Vercel Hobby project for experimentation. Do not upgrade the AI account or enable paid billing if you want a strictly free setup. Free plans have limits; this does not produce unlimited inference.

- Groq: https://console.groq.com/keys and https://console.groq.com/settings/limits. The default conversation model is `openai/gpt-oss-20b` hosted by Groq. Its name contains OpenAI, but the request goes to Groq and uses a Groq key, not OpenAI billing. Orpheus has a separate speech quota and may require accepting its model terms in the Groq console. It is a preview model, so availability can change.
- Gemini: https://aistudio.google.com/api-keys. The configured default is `gemini-2.5-flash-lite`. Google's free tier permits using submitted content to improve its products; keep sensitive notebook entries out of it.
- NVIDIA: https://build.nvidia.com. Create a key for hosted NIM access, and check the model's access and trial limits. Hosted trial access is not a promise of free commercial production or unlimited credits.
- Vercel: https://vercel.com/new. Sign in with GitHub. Hobby is for personal, non-commercial use. Before monetizing a hosted business, check Vercel's commercial-use rules; that stage is outside this free-only configuration.

Sources checked October 5, 2026: [Groq limits](https://console.groq.com/docs/rate-limits), [Groq models](https://console.groq.com/docs/models), [Orpheus speech](https://console.groq.com/docs/text-to-speech), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [NVIDIA trial terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf), [Vercel Hobby](https://vercel.com/docs/plans/hobby).

## 1. What belongs where

GitHub stores source code and version history. Vercel downloads a chosen Git commit, runs the build, hosts static files, and runs three small server functions. Groq/Gemini/NVIDIA run the language model. None of these services replaces the others.

Your browser sends text to NOX's same-origin `/api/chat` endpoint. The server adds its secret provider key and forwards a bounded conversation to the chosen model. The browser receives only a validated reply packet. It never downloads the provider key.

The NOX owner access token is a different secret. It unlocks cloud requests in Settings for one visit. It is sent only to your own NOX server, kept in JavaScript memory, cleared from the input immediately, and never saved in browser storage. Treat it as private; it grants use of your configured quotas. This lightweight gate is for an owner prototype, not a multi-user account system.

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
| `NVIDIA_MODEL` | Optional; defaults to `meta/llama-3.3-70b-instruct` |
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
| `public/js/app.js` | Provider selection, visit-only owner token, status refresh, authenticated same-origin requests |
| `public/js/voice.js` | Browser voice selection and cancellation-safe natural audio playback |
| `scripts/build-vercel.mjs` | Rebuilds static output and three packaged Node function entrypoints |
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
