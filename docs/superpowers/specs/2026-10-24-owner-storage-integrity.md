# Owner notebook and story integrity

Audit base: `6c83c2a`. Implementation reviewed October 24, 2026. Final integration/production evidence belongs in the release verification record.

## Reproduced defects

The original stores refreshed localStorage before mutation but did not serialize the complete transaction. A deterministic second-tab operation inserted between that read and write restored a deleted note during a context toggle and a deleted story during an add. Independent story edits lost one change. Explicit recovery replacement could overwrite a concurrent addition. Tests reproduced all of these against the audited code.

Story persistence also swallowed a failed write, changed to memory-only storage, removed the visible item, and returned success while the durable original still contained it. Note/story Delete buttons acted immediately, unlike chat deletion.

## Changes and reasons

- `storage-transaction.js` uses per-store, origin-wide exclusive Web Locks for the complete durable read/modify/write. Notebook add/delete/context changes and story add/update/delete/clear all participate. Explicit recovery replacement uses the same lock. A read immediately before an unlocked write is not sufficient.
- Browser owner writes fail closed when Web Locks are unavailable. Saved content remains readable/exportable, and the interface explains the limitation. This intentionally avoids claiming that an in-realm queue protects multiple tabs. Isolated guest memory and initially unavailable storage remain usable for temporary work.
- Recovery still preserves exact unreadable/future-format bytes. Replacement checks the confirmed bytes inside the transaction, refuses a changed original, and merges now-readable saved work with visit work.
- Story persistence installs the new visible snapshot only after a successful write. Failed durable additions/edits throw rather than pretend they saved. Delete returns `{removed, committed, scope, error?}`. Its UI clears the selected story and announces deletion only after a committed result. Failed writes preserve the archive row and selected contents so retry/export remain possible. Both stores track known saved IDs: losing read access refuses deletion of those durable items rather than dropping only their visible copy. New temporary items remain removable.
- Every production caller awaits mutation results, including branch edits, edited-line saves, generation, context toggles, file import and recovery replacement. Busy states prevent confusing concurrent interface actions. If a newly generated story cannot save, the receiver retains it visibly as an unsaved visit cut with export guidance instead of discarding the model's work or claiming it was archived.
- Notes/stories show an inline confirmation and Keep escape before deletion in guest and owner modes. Copy identifies browser/visit scope and the lack of a cloud copy/undo. Failed confirmed deletion leaves content visible and reports failure.

## Verification

`tests/owner-store-transactions.test.mjs` covers delete-versus-toggle, delete-versus-add, independent edits, recovery-versus-write for both stores, failed story write/delete retry, unavailable-lock refusal, guest isolation and lost storage-read access. Its first eight regressions failed before implementation and passed afterward. Both read-access regressions also failed before their targeted fixes.

`tests/notebook-ui.test.mjs` and `tests/afterimage-ui.test.mjs` execute production component handlers with controlled storage. They cover guest/owner Delete, Keep/cancel, successful confirmation and durable failure preserving content. These handler tests do not replace real browser touch/focus checks.

At the intermediate integrated tree, `npm test` passed 904/904 tests with local loopback HTTP access. The initial default-sandbox run failed because loopback fetch returned `EACCES`, which an isolated HTTP test confirmed. Final release counts may differ as other audit fixes land; use the later complete verification run.

## Practical limits

Web Locks coordinate cooperating code on the same origin. Older open tabs running pre-fix JavaScript, browser extensions, DevTools or unrelated code that ignores the lock can still change localStorage. Close older tabs when updating. This is not database synchronization, encryption, backup or cross-device recovery. Two real same-origin owner tabs and physical touch/keyboard confirmation journeys still require separate browser acceptance evidence.

The fallback deliberately refuses durable browser writes rather than risk update loss. Browser localStorage can still fail from quota, privacy settings or revoked access. Export valuable work; no deletion can retract content already sent to a provider. Same-field concurrent edits are serialized with the later committed edit winning; this is not collaborative conflict resolution.
