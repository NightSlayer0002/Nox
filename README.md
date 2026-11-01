# NOX

An expressive thinking companion. Talk through an idea, change your mind, play a little, or bring something you want to understand.

[Live preview](https://nox-iota-lemon.vercel.app/)

## Source-linked conversations

Code preparation is an optional conversation surface, alongside chat, stories and play. Open **Prepare with code** in a conversation or find it in Discover. Start with the built-in example, a pasted/local file, or a public GitHub repository. GitHub files are pinned to a commit; importing never executes code or silently reads an entire repository into the model.

The file remains visible with numbered, highlighted lines. Choose a complete function or section within 80 lines and 6,000 characters, then ask for an explanation, a question, or discuss it in your own words. Missing dependencies must be requested explicitly. Only a committed explanation marks a section discussed; understanding is a separate user self-check. Export keeps the submitted explanation, source/range and NOX's feedback together.

Retry retains the original source/range/intent. If that visit-only source is unavailable, the existing answer is preserved instead of replacing it with a source-free guess. New selections invalidate pending imports, and invalid correction drafts remain visible and block the affected request.

Calls show the selected excerpt; ordinary long answers still use a bounded spoken opening. **Hear line by line** adds a deliberately smaller mode: up to four code lines, one explanation per line, with highlighting driven by actual playback events. Invalid or missing line labels prevent speech; Stop, source changes and playback failures prevent later requests. This is not a whole-repository spoken walkthrough. Reading code accurately and being enjoyable to think with require evaluation beyond transport and UI tests.

## Conversation evaluation

NOX uses a versioned companion policy with hosted models, not a trained proprietary model. It emphasizes following intent, incorporating corrections, reasoned disagreement, playful exploration and respecting a request to stop. The server returns the loaded policy version/hash for reproducible probes.

[Evaluation instructions](scripts/conversation-evaluation.md) cover six ordinary multi-turn cases, seven source-grounding cases, explicit request budgets, saved rollout evidence and an offline blinded comparison pack. Structural checks cannot establish conversation quality or user preference. Reports remain semantically unreviewed until a person records a judgment. A model or policy change is not evidence of learning outcomes or market demand.

## Development

Requires Node.js 24 and npm.

```sh
npm ci --ignore-scripts
npm run dev
```

Open `http://127.0.0.1:3000`. The development command watches frontend dependencies and the server; refresh the browser after a frontend rebuild. Use `npm start` to build the client and start the server without watch mode.

For connected AI, copy `.env.example` to `.env`, configure a supported provider, and restart the server. Keep credentials server-side. The guest preview needs no account; private developer tools use separate owner access.

## Verification

```sh
npm run verify
npx --no-install playwright install chromium
npm run test:browser
```

`verify` runs unit/HTTP tests, JavaScript syntax checks, and the production build. Browser journeys run against a local synthetic provider and fake camera media, without provider credentials or quota. Their functional contexts disable WebGL and service workers to keep fault injection deterministic. GPU performance, physical-phone keyboards, microphone permissions, and offline/PWA behavior require separate testing.

GitHub Actions runs **Tests and production build** and **Browser journeys** on pull requests and pushes to `main`.

## Project structure

- `client/`: React interface components and Three.js scenes.
- `public/`: static assets, styles, browser modules, and the service worker.
- `server.mjs`, `server/`: HTTP handlers, provider adapters, sessions, and request budgets.
- `shared/`: validated message, activity, and interface contracts.
- `tests/`, `scripts/`: regression coverage, browser fixtures, and build tooling.
- `assets-source/`: editable character assets and export instructions.

The code flow separates import (`public/js/rehearsal-source.js`), visit-only source ownership (`rehearsal-session.js`), interface coordination (`rehearsal-ui.js`) and the server-validated excerpt (`shared/rehearsal.js`). It uses the existing chat and voice paths rather than a parallel conversation engine.

## Data and access

Guest chats, notes, activities, preferences and imported code are temporary and clear on refresh. Owner conversations are stored locally in the browser; imported code still lasts only for the visit. There is no public account system or cloud synchronization. Relevant dialogue, selected notes, and the active code excerpt with its goal/corrections are sent to the configured AI provider when you send a message. Earlier replies may quote source in subsequent conversation context. Provider data terms apply; do not import credentials or confidential material. Natural voice uses a speech provider when enabled. Camera previews and recordings stay local.

Text and voice have separate allowances. Process-local throttles are not deployment-wide spending caps. Provider quotas and hosting terms apply. NOX is a public preview and AI answers can be incorrect.

## Deployment

See [deployment instructions](docs/DEPLOYMENT.md) for environment configuration and the Vercel build. Secrets, generated output, and internal working notes are excluded from version control.

## Assets and licenses

Third-party code and asset notices are retained in [public/vendor](public/vendor/README.md), with pinned source records in [sources.json](public/vendor/sources.json). Character editing and export instructions are in [assets-source/nox](assets-source/nox/README.md). Preserve these notices when redistributing the relevant assets or code.
