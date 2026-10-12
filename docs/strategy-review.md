# Factual strategy review

The **Bilan** page (`/bilan`) compares first-send cohorts using confirmed local state. It does not request a provider, write records, classify job families, or recommend a platform. The dashboard retains its existing all-time calculations and links to this separate view.

## Observation rules

- The default is the last 30 completed Paris calendar days. `from` and `to` URL parameters are inclusive. A custom period is compared with the immediately preceding period of equal calendar length. Reversed, invalid, current-day and future-ending periods are refused visibly.
- A dossier belongs to the period containing its earliest usable send date. Existing event/legacy-date rules and non-cancelled declared sends are reused. Multiple sends count one dossier; archived/excluded dossiers remain eligible.
- Each cohort is observed only through its own period end. Results before the first send or after the observation cutoff do not contribute. Outcomes after the cutoff may appear in all-time dashboard statistics. Unequal exposure within a cohort and incomplete histories prevent causal conclusions.
- Response evidence is a dated response, interview, offer or refusal. Status alone never supplies an event. Rates use all sent dossiers in that cohort as their denominator, including dossiers with incomplete histories. Missing responses mean **no documented response**, not confirmed silence or rejection.
- Response delay is measured from first send to first admissible response in calendar days. The median uses responders only, with its sample size and individual delays available in the expandable evidence. Empty denominators and unobservable medians display a dash.
- Differences are current minus previous: counts, percentage points, or days. Rates and differences are calculated before rounding to one displayed decimal.
- Source/title grouping normalizes whitespace and case only. Missing values have a distinct internal key, even when an actual label happens to read “Non renseigné”. Groups are alphabetical, not ranked by performance.

## Evidence and quality

Every metric exposes the dossiers and observed dates behind both periods. Rates additionally expose all denominator dossiers. Source/title rows expose the same metrics and evidence. Dossier links lead to the existing detail page.

Quality counts deliberately cover **all loaded dossiers**, independently of the filters: incomplete histories, missing usable sends, missing source/title and date anomalies. Categories overlap. Invalid/future event dates and outcomes preceding the first send are reported without changing records. Active declarations whose dossier was deleted are listed separately and excluded; cancelled declarations are ignored. Deleted dossiers cannot be reconstructed.

The page hides results during initial loading, pending persistence/synchronization and errors. It never substitutes an empty result for a failed load. The existing synchronization banner remains the recovery path. Changing a period or using browser history updates the date form; submitting reads the actual form fields.

## Implementation and validation

`src/strategy-review.mjs` is a pure calculation module with a TypeScript declaration. Existing application and submission types, API, SQLite schema and portable snapshot versions are unchanged. Inputs are not rewritten. The Paris planning clock supplies the current date; day arithmetic uses UTC day numbers to avoid DST-length errors.

`tests/strategy-review.test.mjs` covers inclusive cohorts, equal periods, leap years/DST boundaries, repeated/legacy/declared sends, cancellations, orphans, observation cutoffs, inconsistent dates, unknown histories, archived/excluded dossiers, grouping reconciliation, null denominators, median parity and input preservation.

Validation uses synthetic data only. Run `npm test` and `npm run build` (equivalent package scripts to `pnpm test` and `pnpm build`). Browser acceptance includes desktop/mobile evidence expansion, denominator inspection, dossier links, URL/date filters, browser history, keyboard operation, empty results, and loading/error recovery. No real register, provider request or personal database is required.

### Verified on 2026-10-12

- Full suite: 104 tests passed. After strengthening breakdown reconciliation and adding the DST-delay regression, all 8 strategy-review tests passed (105 tests now defined in the suite).
- TypeScript and final production build passed; the existing Vite large-chunk warning remains.
- Browser checks passed at desktop 1440×1000 and mobile 390×844 using a synthetic in-memory database: evidence/denominator expansion, source breakdown, dossier navigation, custom/default/reversed date filters, URL updates, history restoration, keyboard activation, empty periods, loading, explicit simulated load failure and synchronization recovery.
- Review fixed date submission to use actual native form values, after browser automation exposed stale controlled-field values. The corrected filter workflow was repeated against the final build.
- The synthetic server and browser tab were closed, no server children/listener remained, and the viewport override was reset. No real application data or paid provider was used.
