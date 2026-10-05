# NOX 0.4 implementation record

User intent: keep NOX as an expressive content character/companion, add real non-repeating language-model conversation using free-tier providers, deploy through the newly created Nox GitHub repository to Vercel, teach the code, and replace neumorphism using the two cinematic templates as inspiration.

Execution is inline. The user directly requested continuing implementation and gave the visual brief and provider scope.

## Work and checks

- [x] Read existing Canvas/Node flows, current deployment work and visual references.
- [x] Verify official Groq, Gemini, NVIDIA and Vercel API/free-use documentation.
- [x] Add provider catalog and fixed endpoint adapters sharing identity/context/packet; test request shape, failures and server-selected models.
- [x] Add Groq Orpheus speech, improve browser voice, implement canceled request/playback guards and Blob cleanup; test mocked audio lifecycle.
- [x] Protect hosted cloud endpoints with visit-only owner access, trusted hosts/origins and request bounds.
- [x] Build original room asset and cinematic CSS/semantic HTML; preserve actual character interaction and camera/recording semantics.
- [x] Scene buttons toggle off; browser-check Gravity and Orbit pressed state.
- [x] Package Vercel Build Output v3 and test importing a built function over HTTP; clear stale generated files on rebuild.
- [x] Independent read-only review. Fix provider metadata added after Unicode request-size measurement and add regression coverage.
- [x] Write deployment steps and update founder and visual guides.
- [x] Finish desktop/phone browser verification and rerun final tests/check/build.
- [x] Commit and push verified source to NightSlayer0002/Nox.
- [x] Import into the user's Vercel account and configure Groq key plus owner access token (user completed private entry).
- [x] Verify real deployed URL, actual model replies and natural speech after credentials are configured.

Mocked tests do not invoke real providers. Separate owner-authenticated production checks verified Groq conversation and Orpheus speech after the user entered credentials privately and accepted the model terms. Free tiers have quotas; NVIDIA hosted access is trial use and Vercel Hobby is non-commercial. Cloud memory sync, public accounts, vision, audible exports, and unlimited usage are not part of this release.

Final local evidence: 62 tests passed, syntax checked 31 modules, and Vercel output build succeeded. Independent reviews covered provider request bounds, ESM packaging, and WAV segmentation/assembly; findings were fixed with regression coverage. Desktop and 390px phone layouts were checked; compact-rail overflow was fixed. Proof images live in ignored artifacts/.

Source published to NightSlayer0002/Nox on main. The user completed Vercel sign-in, installed GitHub access limited to Nox, and entered the Groq key and private owner token directly in Vercel. Neither secret was copied into chat, source, or Git.

Live deployment: https://nox-iota-lemon.vercel.app, Night Hobby team, main linked. Runtime fix c32e38e and long-speech fix c95de44 both redeployed automatically and reached Ready. Public status HTTP 200 / owner locked; unauthorized chat and speech HTTP 401; live scene toggle checked. Groq generated distinct context-aware replies. The owner confirmed hearing the natural Hello sample. A subsequent 253-character story returned HTTP 200 for both chat and assembled speech, verifying the long-reply path in production. Saving a file alone does not publish it; pushing main triggers a verified Vercel build and updates the same public URL after deployment succeeds.
