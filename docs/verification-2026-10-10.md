# Five refinements: October 10, 2026

`npm run verify`: 252 tests passed, 113 JavaScript modules syntax checked,
Vercel production output built. Subsequent factual UI copy/export adjustments
passed client compilation, syntax and 23 AFTERIMAGE client regressions.

Live `/guest#conversation`, with guest headers even if an owner cookie exists:
Groq replied “Hey! I’m NOX, and I’m thrilled to have found a new friend!”
Server-reported first words/completion were 322 ms; the voice request was 1760 ms.
These are one test sample, not end-to-end latency guarantees. The natural voice
request succeeded without owner sign-in. Refresh cleared this test conversation.

The live recording exported a 6,609,995-byte WebM with VP9 and Opus tracks;
`A_OPUS` and `OpusHead` were present. The recorder reported “NOX audio track”.
This was real Orpheus playback, unlike the earlier local fixture recording.
Existing silent exports cannot gain audio retroactively.

Local browser checks: guest refresh empty; owner sign-in restored the original
four test threads; sign-out reopened a fresh guest scope without deleting owner
data. Home feature/material anchor navigation placed the emblem beside visible
copy. Desktop HUD/NOX bounding boxes no longer overlap. Preferences shows Troy,
Automatic browser fallback, and NVIDIA NIM “To be connected”. Keyboard and
semantic controls remained usable.

Independent review approved cache isolation: owner speech, guest A and guest B
use different full/segment keys; replay within A warms its own cache. Rotating
visit IDs does not change trusted IP quotas. Ten reviewer checks passed.

The initial requested 390×844 viewport override returned the unchanged
1265×720 preview. A subsequent live navigation rendered at 375×844: the mobile
menu opened, Change matter navigation closed it, and the material copy/control,
3D face and small peeker had separate space. Document scroll width equaled the
375-pixel viewport; there was no horizontal overflow. The override was reset
and temporary preview tabs/server stopped. Production deployment was Ready.

Limits remain explicit: public quotas and caches are process-local; provider
free limits also apply. Owner archives are plaintext browser storage, not a
cloud multi-user database. Voice acting directions guide rather than guarantee
emotion. Browser/OS speech and microphone audio are outside the capture graph.
