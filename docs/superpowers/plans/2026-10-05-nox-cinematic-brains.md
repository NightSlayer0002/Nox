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
- [ ] Verify real deployed URL, actual model replies and natural speech after credentials are configured.

No real model/voice calls have been made during mocked tests. Free tiers have quotas; NVIDIA hosted access is trial use and Vercel Hobby is non-commercial. Cloud memory sync, public accounts, vision, audible exports, and unlimited usage are not part of this release.

Final local evidence: 57 tests pass, syntax checked 28 modules, Vercel build succeeds; independent review finding fixed with regression. Desktop and 390px phone layouts checked; compact-rail overflow fixed; browser error log empty. Proof images live in ignored artifacts/. Git was initialized and origin points to the user’s empty Nox repository.

Source published: cbaa1d5 on main. User completed Vercel sign-in; importing the existing repository is in progress. Groq key and private owner-token entry are still pending.

Live deployment: https://nox-iota-lemon.vercel.app, Night Hobby team, main linked. Runtime fix c32e38e redeployed automatically and reached Ready. Public status HTTP 200 / owner locked; unauthorized chat and speech HTTP 401; live scene toggle checked. Real provider checks await owner unlock in the live app.
