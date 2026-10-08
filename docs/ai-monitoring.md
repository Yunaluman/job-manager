# JobPilot AI activity and estimated costs

This lot adds local accounting for JobPilot calls only. It does not track Codex, other agents, subscriptions, provider invoices or the external candidature register. No historical activity is synthesized.

## Dispatch and privacy

`POST /api/ai` requires `purpose`: `offer-extraction`, `cv-analysis` or `letter-generation`. Its successful response still contains `content`.

An accepted attempt is committed and read back before provider dispatch. SQLite uses `synchronous=FULL`. A failed insert, commit or readback refuses dispatch. Validation failures, missing credentials and concurrent-request rejections do not dispatch and are not billed attempts.

The outcome records requested/returned model, purpose, provider, timestamps, monotonic duration, status and validated token counters. Raw prompts, CVs, generated letters, provider response IDs, error bodies and credentials are never retained in telemetry. Only allowlisted fields are persisted. Existing profile and analysis records remain outside this journal.

Missing, invalid or unsupported usage, unknown returned models, missing tariffs and interruptions produce a null cost. They never become zero. A genuine reported zero-token or free-price result may have a known zero estimate. Failed responses with usable model/usage can still have an estimate: an unsuccessful generation does not prove that the provider billed nothing.

Startup marks unfinished attempts `uncertain` with reason `restart`. Their completion time, duration and cost remain unknown. A failed final journal write preserves the pending row and adds a warning to the response. Neither case retries a provider call. The UI preserves generated content when final telemetry persistence fails.

## Pricing

Costs use immutable tariff snapshots selected from the catalog available at dispatch, by exact returned model and the latest effective date at or before dispatch. There is no guessed `latest` alias mapping, fallback to a different requested model, foreign exchange conversion or retroactive recalculation.

Prices are integer milli-USD per million tokens, supporting up to three decimal places. Cost calculations use integer nanodollars and aggregate with BigInt; only display values are rounded. The catalog records currency, effective time, verification time and official source. A new version never updates an old event.

Initial prices were checked on October 8, 2026. Their effective dates mean “observed from this date”, not an assertion about earlier prices:

| Provider | Exact model | Input USD/M | Output USD/M | Supported cached input USD/M |
| --- | --- | ---: | ---: | ---: |
| Mistral | mistral-large-2512 | 0.50 | 1.50 | not normalized |
| Mistral | mistral-large-4 | 0.68 | 2.09 | not normalized |
| Z.ai | glm-4.6 | 0.60 | 2.20 | 0.11 |

Sources: [Mistral pricing](https://docs.mistral.ai/inference/pricing), [Large 3 model ID](https://docs.mistral.ai/models/mistral-large-3-25-12), [Large 4 model ID](https://docs.mistral.ai/models/mistral-large), [Z.ai pricing](https://docs.z.ai/guides/overview/pricing).

The Large 4 price is the promotional price shown on the observation date; the vendor does not state an end date on that page. Prices may change. Catalog updates require the user's source verification and an explicitly confirmed new version; the application does not fetch prices automatically.

Z.ai cached-input counters are normalized from `prompt_tokens_details.cached_tokens`, according to its [chat completion reference](https://docs.z.ai/api-reference/llm/chat-completion). Cached tokens are part of input and are subtracted before applying the discounted rate. Mistral calls request `service_tier=standard_only`, according to its [chat completion reference](https://docs.mistral.ai/api/endpoint/chat). Its published chat OpenAPI `UsageInfo` does not document cached counters; additional billing categories are therefore unknown rather than inferred. No reasoning, audio, storage, tool, batch or priority surcharge is guessed or double-counted. When cache usage is not reported, standard input pricing is an estimate; it may overestimate a discounted bill.

## Local API and configuration

All endpoints inherit the existing Host, Origin and local-session protections:

- `GET /api/ai/activity`: paginated history (`page`, `pageSize`, maximum 100).
- `GET /api/ai/summary`: known estimates, unknown count, available tokens, errors and breakdown by purpose/provider/model.
- `GET /api/ai/budget`: current UTC month, independent of activity-page filters.
- `GET /api/ai/config`: threshold and tariff versions.
- `PUT /api/ai/config`: `{ monthlyLimitCents: null | integer }`, including zero for “alert on any known spending”.
- `POST /api/ai/tariffs`: a new USD version, with `sourceVerified: true`. Only official documentation URLs on the provider's host are accepted. No tariff update/delete endpoint exists.

History/summary filters are `from` (inclusive ISO UTC), `to` (exclusive ISO UTC), `purpose`, `provider`, `model` (exact requested or returned), `status`, and `cost` (`unknown` or `estimated`). The UI's end-date selector is inclusive and converts to the next UTC midnight.

Configuration writes require the lot-2 revision and operation-ID headers and acknowledgement. Conflicts or unknown outcomes retain drafts and require explicit synchronization. Automatic attempt/outcome writes never touch candidature revisions or receipts.

The monthly threshold is disabled by default. When enabled, known estimates strictly exceeding it trigger an alert. Unknown costs also trigger an uncertainty alert, including pending attempts. Alerts never block provider calls. Alerts refresh after local AI calls, confirmed configuration updates and route changes; the history also has an explicit refresh control.

## Backups and validation

Portable exports are version 2 and include events, tariff versions and threshold configuration in the checksummed payload. Version-1 snapshots still restore into a new database; monitoring initializes with no historical events. Version-2 restore validates the telemetry allowlist, state, prices and cost calculation before creating the destination. The existing DPAPI backup protects the complete SQLite image, including all monitoring tables. Restores never overwrite an existing destination.

The deterministic test suite covers dispatch ordering, insert/readback/final-write failures, successful and erroneous provider responses, absent/invalid usage, timeout, different/unpriced models, historical and in-flight tariff versions, integer/display rounding, filters/pagination, monthly boundaries/equality, configuration conflicts/replay, v1/v2 restore and real Windows DPAPI restore with monitoring tables. No paid call is used.

Browser checks cover light/dark at 390, 768 and 1440 pixels, system-theme selection, local table scrolling, empty results, pagination, combined filters, unknown-cost filtering, confirmed configuration, two-tab conflicts, draft navigation guards and server outage/restart. Common text, field, button and alert contrast measurements exceed 4.5:1; this is not a complete WCAG audit.

Final verification against an exact staged checkout passed TypeScript, the production build and all 51 tests. Seven main routes passed 42 light/dark/viewport combinations without global overflow; the candidature-detail route had also passed the six combinations in the preceding UI lot. The existing PDF bundle-size warning remains. Control tabs were closed, the viewport override was reset, and the temporary server and its children were confirmed absent. The real user database was not used.

Local review corrected unlabeled controls, unknown-only cost presentation, response-error usage handling, pricing selection, source URL validation and restored-event consistency. Copilot independent review could not run because the requesting account's review quota was exhausted. Independent review remains necessary before merging. Temporary fixtures and control processes are not production data.
