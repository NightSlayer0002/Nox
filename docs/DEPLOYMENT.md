# Deployment

NOX uses Node.js 24 and Vercel's Build Output API. The build packages static assets and the `status`, `chat`, `speech`, `summary`, `session`, and `afterimage` API handlers.

## Local configuration

Install dependencies and create a local environment file:

```sh
npm ci --ignore-scripts
```

Copy `.env.example` to `.env`, then configure the required variables. Never commit `.env` or place provider credentials in browser code.

| Variable | Purpose |
|---|---|
| `NOX_PROVIDER` | Default configured provider; normally `groq`. |
| `GROQ_API_KEY` | Server-side Groq credential for public chat and optional natural voice. |
| `GROQ_MODEL`, `GROQ_DEEP_MODEL` | Owner conversation model configuration. Public chat follows the bounded policy in `server/free-model-policy.mjs`. |
| `GEMINI_API_KEY`, `NVIDIA_API_KEY` | Optional owner provider integrations. |
| `NOX_ACCESS_TOKEN` | Long random secret protecting hosted owner tools; separate from provider credentials. |
| `NOX_PUBLIC_ORIGIN` | Canonical origin when using a custom domain. |
| `NOX_NATURAL_VOICE`, `NOX_SPEECH_PROVIDER`, `NOX_SPEECH_VOICE` | Optional speech configuration. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional shared per-network daily allowance storage; configure both together. |
| `NOX_FREE_TEXT_DAILY`, `NOX_FREE_SPEECH_DAILY` | Separate daily request budgets when shared allowance storage is configured. |
| `PORT` | Local HTTP port; defaults to `3000`. |

`.env.example` documents the complete supported configuration. Only configured providers are available. Without allowance-store credentials, the public service uses a rate-limited preview rather than claiming durable daily accounting. Partial or unavailable allowance configuration fails closed.

## Vercel

1. Import the GitHub repository and select the intended production branch.
2. Use Node.js 24. Keep the repository's `vercel.json` settings: install with `npm ci --ignore-scripts`, build with `npm run verify`, and no framework preset.
3. Enter server credentials and configuration in Vercel Environment Variables for the intended environments. Keep preview and production credentials scoped appropriately.
4. Deploy the selected commit. Environment changes require a new deployment.

The build writes `.vercel/output`. Static content comes from `public/`; functions receive explicit server/shared dependencies. Local notes, source-authoring assets, Git metadata, and environment files are not deployment inputs. Generated output remains ignored.

Use hosting and provider plans appropriate for the intended use. Review current service terms and quotas directly with each provider; a free tier does not guarantee unlimited inference or commercial hosting rights.

## Release checks

```sh
npm run verify
npx --no-install playwright install chromium
npm run test:browser
```

Both GitHub checks must pass for the release revision: **Tests and production build** and **Browser journeys**. Configure branch protection in GitHub to enforce those checks before merging; a workflow alone does not enforce branch protection.

After deployment, verify the exact commit's Vercel status and inspect the public site. Check guest entry, a short conversation, navigation, and owner authorization. Keep test input synthetic and bounded. A successful build does not establish provider availability or production configuration correctness.

## Operational boundaries

- Provider keys stay server-side. Owner sessions use a signed HttpOnly cookie; locking clears the current browser cookie. Individual copied stateless sessions cannot be revoked separately; rotating the owner secret invalidates all sessions.
- Per-process admission limits are not distributed spending or concurrency limits. Optional daily storage counts accepted requests per public network, not per person or account. Configure provider-side billing controls and deployment-wide budgets separately where needed.
- Guest work clears on refresh. Owner archives remain plaintext browser-local data, without cloud recovery or synchronization. Exports provide portable copies.
- Browser functional checks use synthetic providers/media. Full GPU rendering, physical devices, real microphone permissions, and offline/PWA behavior need separate acceptance checks.
