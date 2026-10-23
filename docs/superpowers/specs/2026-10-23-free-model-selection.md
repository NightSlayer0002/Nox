# NOX free API model selection

Research checked against official provider pages on **October 23, 2026**. This is a documentation review, not a live model benchmark or an account-specific quota inspection. No inference calls or account changes were made.

## Decision

Use Groq `openai/gpt-oss-120b` as the default public model. It is a practical capability upgrade from the existing `openai/gpt-oss-20b`, uses the already configured provider, and is listed as a production model. Keep 20B as a bounded fallback for a model being unavailable or a documented quota condition. A fallback must obey its own and the organization's limits; it must not create a retry loop or bypass provider limits.

This does **not** establish a universally smartest free model. Provider benchmarks, reasoning settings, serving implementations, and NOX's conversation tasks differ. Groq's current Qwen candidate is promising but is explicitly a preview model; Groq says preview models are for evaluation and should not be used in production. [Groq supported models](https://console.groq.com/docs/models).

## Relevant limits and alternatives

| Provider and model | Current free access | Documented limits / decision |
| --- | --- | --- |
| Groq GPT-OSS 120B | Published Free Plan, rather than a one-time signup credit | 30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD. Selected default. |
| Groq GPT-OSS 20B | Published Free Plan | Same published limits. Faster generation, lower aggregate capability; fallback. |
| Groq Qwen 3.8 27B | Published Free Plan; preview | Same published limits; evaluation candidate only. |
| Cerebras GPT-OSS 120B / Qwen 3.8 27B | Free Trial, followed by paid credits | Trial: 5 RPM, 30K uncached TPM, 90K total TPM, 1M TPH, 1M TPD. Current promotion is a one-time $5 credit requiring a valid payment method and expiring after 30 days. Access pauses on expiry/exhaustion unless paid credits are purchased. |
| NVIDIA Nemotron 3.5 Super VL 120B A12B | Free prototype endpoint; early access | A candidate for testing with a new provider account/key, not an established free public production backend. Exact guaranteed RPM/TPM/TPD/RPD are not published in the reviewed pages. |
| Gemini API | Ongoing free quota for certain models | Not eligible for NOX's intended worldwide audience including schoolchildren under current API terms. Active numeric quotas are shown per project in AI Studio, rather than a universally guaranteed public table. |
| DeepSeek direct API | Token-priced service | Current official pricing lists charges for input and output; the reviewed page does not establish an ongoing free API tier. |

Sources: [Groq Free Plan limits](https://console.groq.com/docs/rate-limits), [Cerebras limits](https://inference-docs.cerebras.ai/support/rate-limits), [Cerebras pricing and promotion terms](https://www.cerebras.ai/pricing), [NVIDIA model endpoint](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini limits](https://ai.google.dev/gemini-api/docs/rate-limits), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/).

Groq quotas apply at organization level, with actual organization limits authoritative. Both OSS models have a 131,072-token context and 65,536 maximum completion, but those context sizes do not increase the free quota. Advertised generation speeds are approximately 500 tokens/s for 120B and 1,000 tokens/s for 20B; these are not end-to-end latency guarantees. [120B model](https://console.groq.com/docs/model/openai/gpt-oss-120b), [20B model](https://console.groq.com/docs/model/openai/gpt-oss-20b).

NVIDIA explicitly limits Developer Program NIM access to prototyping, research, development and testing. It defines serving real end users as production, requiring the appropriate production license/subscription. Its hosted trial terms also require a separate subscription for production. Do not describe these prototype endpoints as an unlimited free production alternative. The previous Nemotron 3 Super endpoint is marked deprecated. [NVIDIA FAQ](https://docs.api.nvidia.com/nim/docs/product), [NVIDIA API trial terms, section 1.4](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf), [previous endpoint](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b).

## Quota and response policy

- Keep prompts and history bounded, reserve a measured completion allowance, and account for actual usage across users. For illustration, 1,500 uncached tokens per turn would allow about 5 turns/minute and 133/day under the published token limits, despite the larger request limits. This arithmetic is an estimate, not a capacity promise.
- Use response quota headers and `retry-after`; return an honest temporary-limit response when capacity is exhausted. Do not add keys, accounts or organizations to multiply free quotas. Groq's AUP explicitly prohibits that. [Groq AUP](https://console.groq.com/docs/legal/ai-policy).
- Both OSS models support automatic prompt caching. Keep stable instructions/schema first and changing user/context data later. Cache hits require exact prefixes, expire after two hours without use and are not guaranteed. Cached tokens are excluded from rate limits only after processing, so parallel requests can still hit limits. Read `usage.prompt_tokens_details.cached_tokens`; do not budget against an assumed hit. [Groq caching](https://console.groq.com/docs/prompt-caching).
- For GPT-OSS, use supported `reasoning_effort` values (`low`, `medium`, `high`) and `include_reasoning: false`. The model-specific documentation says `reasoning_format` is not supported for GPT-OSS. Hiding reasoning changes the returned fields; it is not evidence that reasoning tokens stopped being generated. Apply a bounded completion budget and check for truncation. [Groq reasoning](https://console.groq.com/docs/reasoning).

## Audience and data constraints

Gemini API terms effective March 23, 2026 require the API developer to be 18+ and prohibit API clients directed toward or likely accessed by under-18s. They also require paid services for API clients offered in the EEA, Switzerland or UK. Free input/output can be used for product improvement and human review; the terms instruct users not to submit sensitive, confidential or personal information to unpaid services. These are concrete conflicts with NOX's intended audience and use. [Gemini API terms](https://ai.google.dev/gemini-api/terms).

Groq's current agreement was modified June 22, 2026. The account operator must be 18+. Clause 6.3 specifically addresses customer applications likely accessed by minors and assigns the customer responsibility for applicable laws and personal-data handling; do not substitute restrictions from archived Groq terms. This is not a finding that every worldwide child-data requirement has been satisfied. [Current Groq agreement](https://console.groq.com/docs/legal/services-agreement).

Groq documents no retention of ordinary inference content by default, with exceptions for enabled persistence features and reliability/abuse investigation; temporary investigation logs may last up to 30 days. All customers can enable zero data retention in organization settings. Retained customer data is stored in the United States. These settings were not changed or inspected for this account. [Groq data controls](https://console.groq.com/docs/your-data).

## Quality verification before stronger claims

Use the same NOX prompt, schema and token budget for blind comparisons: ordinary conversation, Hinglish/Hindi/English, school-level explanations, math with known answers, ambiguous and false-premise requests, emotional support, age-appropriate refusal boundaries, adversarial prompt injection, and multi-turn context. Judge factual correctness, useful specificity, tone, safety, schema validity and unsupported claims. Measure truncation, prompt/completion/cached tokens, latency and rate-limit behavior separately. Record task-level wins and failures; a schema-valid response alone is not evidence of useful or correct output. Run any optional live comparison under an explicit small request/token budget and save results without personal conversation data.
