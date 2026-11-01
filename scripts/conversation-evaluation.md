# Conversation evaluation

The policy in `server/conversation-policy.mjs` is a versioned inference-time prompt, not model training. All normal provider adapters receive it through NOX's shared identity. The server response identifies the policy version/hash actually loaded by that deployment, when those metrics are available. A local policy reference in an evaluation report alone does not prove that a hosted deployment used it.

The runner sends fictional conversations to the normal guest chat endpoint. An explicit URL is required. Every accepted turn consumes normal public allowance; requests are sequential, separated by at least 21 seconds, with no retry. The default is the three-turn correction case. `--max-requests` defaults to 20 and is validated before any request. A known exhausted daily allowance or any HTTP error stops the run and retains the checkpoint. An interrupted response leaves the last complete checkpoint intact; the terminal summary records the interruption. Keep that summary alongside the report when investigating a partial run.

```powershell
node scripts/evaluate-conversation.mjs --url https://YOUR-NOX-HOST --cases correction-repair --label baseline --out artifacts/baseline.json
```

Ordinary cases require no source feature. `--cases companion` selects all six (19 requests):

| Case | Turns | Review focus |
| --- | ---: | --- |
| correction-repair | 3 | Two corrections change the substance; both persist |
| reasoned-disagreement | 2 | Explain disagreement instead of pleasing or dismissing |
| playful-exploration | 3 | Join play without imposing productivity |
| shorter-and-stop | 3 | Shorten, then let the conversation end |
| explanation-focus | 3 | Follow the student's changing explanation focus |
| companion-scope | 5 | Retain “Interview preparation is a feature; NOX remains a companion” across intervening topics |

`--cases` also accepts a comma-separated list. The older interface/action probes remain selectable (for example `ordinary-reasoning,unavailable-vision`). `--cases rehearsal` selects all seven source probes, or use a single prefixed name such as `rehearsal-unavailable-dependency`. Rehearsal cases keep their balanced answer depth.

Each later turn uses the actual prior assistant replies. Reports save exact submitted message/context, seeded scenario definitions, local prompt/policy references, observed model/provider/policy metrics, latency, output length, allowance and retry information, and a versioned rubric. Missing hosted metadata stays unknown. The policy hash identifies only the conversation policy text; it does not fingerprint all deployment code, provider prompts or model weights. Full requests and source excerpts are retained, so use fictional fixtures rather than personal or confidential inputs.

`structuralPass` means every requested turn returned nonempty speech and an allowed action. It does not mean the answer is correct, appropriately expressive, helpful, or accepted by a human. `semanticReview` stays `unreviewed`. Seed replies demonstrate a mistaken framing and are explicitly supplied context, not scored model outputs. User turns are scripted; they can refine an answer that was already good.

To prepare an offline comparison of two complete reports with the same cases, rubric, user turns and starting context:

```powershell
node scripts/compare-conversation.mjs --left artifacts/baseline.json --right artifacts/candidate.json --out artifacts/review-01
```

The output directory must be new. Give a reviewer `review.md` and `scores.json`; withhold `answer-key.json` until they record scores, preference and turn-specific evidence. A/B labels are randomized separately per case. Review full rollouts, since later histories contain different model responses. Run metadata is hidden, but wording may still reveal its origin. The generator assigns no scores and does not claim human evaluation occurred. One person's review of a few fictional conversations does not establish broad reliability, learning outcomes or population preference.
