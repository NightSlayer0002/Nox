# NOX

An expressive AI companion for conversation, learning, interactive stories, and local creative tools.

[Live preview](https://nox-iota-lemon.vercel.app/)

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

## Data and access

Guest chats, notes, activities, and preferences are temporary and clear on refresh. Owner data is stored locally in the browser; there is no public account system or cloud synchronization. Relevant dialogue and selected note excerpts are sent to the configured AI provider. Natural voice uses a speech provider when enabled. Camera previews and recordings stay local.

Text and voice have separate allowances. Process-local throttles are not deployment-wide spending caps. Provider quotas and hosting terms apply. NOX is a public preview and AI answers can be incorrect.

## Deployment

See [deployment instructions](docs/DEPLOYMENT.md) for environment configuration and the Vercel build. Secrets, generated output, and internal working notes are excluded from version control.

## Assets and licenses

Third-party code and asset notices are retained in [public/vendor](public/vendor/README.md), with pinned source records in [sources.json](public/vendor/sources.json). Character editing and export instructions are in [assets-source/nox](assets-source/nox/README.md). Preserve these notices when redistributing the relevant assets or code.
