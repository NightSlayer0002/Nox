# Sourced Orbit and compact composer

October 11, 2026. The Orbit program and conversation input were updated without
changing routes, authentication, providers, guest quotas or owner archives.

## Orbit

ARWES supplies all visible ring geometry. Its original MIT-licensed
`createFrameCircleSettings.ts` and `filterProps.ts` are vendored unchanged.
Run `node scripts/export-orbit-asset.mjs` to reproduce the local SVG from these
files. That exporter serializes the upstream descriptors and draw callback;
it sets transparent background/mint colors and the generator's stroke settings.
It does not introduce a new illustration or hand-authored ring path.

`public/js/orbit-effect.js` loads that SVG once when Orbit is first used. Canvas
transforms place it in two tilted planes with opposite rotation rates. Each
plane is split into a rear pass and front pass around the character render.
The diameter uses NOX's body scale, bounded by stage dimensions. The center
follows his actual position. The effect is therefore compatible with Presence,
Liquid Metal, Signal, portrait film mode and the existing recording canvas.
Motion-disabled rendering uses a stationary pose; NOX's chosen always-on motion
policy otherwise remains unchanged. Unavailable artwork is omitted instead of
replaced by generated particles. Disposal releases the image reference.

## Composer

Vercel AI Elements supplies the PromptInput/InputGroup layout pattern:
transparent textarea, block-end footer, compact tools and submit/stop control.
Unmodified source and Apache-2.0 license are in `public/vendor/ai-elements`.
`public/source-composer.css` adapts the pattern to native HTML and NOX tokens.
It does not load Vercel's React/shadcn component dependency graph at runtime.
The supplied screenshot informed arrangement, not branding or available models.
All icon art is unmodified Lucide SVG, with its ISC notice preserved.

- Notes opens the existing notebook; it is not a fake upload control.
- Quick/Balanced/Deep selects the existing answer-depth policy. Guests stay Quick.
- AI provider uses only the configured server catalog. Preferences and the
  composer share one selection through `createProviderControls`. Unconfigured
  providers remain disabled; model/API keys remain server-owned. Deep Groq
  continues to use the server's larger-model policy.
- The microphone invokes existing browser dictation. Its accessible label and
  pressed state reflect listening; unsupported browsers disable it explicitly.
- The waveform toggles NOX's reply voice and stays synchronized with the stage
  Voice control. It does not create a new voice or require new credentials.
- Send is disabled for an empty draft. While generating, Stop occupies the same
  space and cancels the existing request. Enter sends; Shift+Enter adds a line.

The footer wraps into two rows on smaller containers. Native selects, labels,
focus indicators and keyboard actions remain available. Local SVG icons and
source files require no external CDN requests. No database or backend change is
part of this update.

## Verification

The regression suite covers bounded/body-relative orbit sizing, image lifecycle,
canvas drawing, image failure and provider-control synchronization. Browser
checks cover the ring artwork, desktop and 375px-content composer layouts,
notes, voice-state synchronization, submission, multiline drafts and provider
switching. Local chat checks use the explicitly labelled fixture preview;
production chat checks use the deployed provider when available.
