# Home schedule date correction implementation plan

**Approved scope:** Only Home's Upcoming Events and Meeting Invites lists. Show valid start dates on or after today's Eastern calendar date, including earlier times today. Preserve existing event registration counts, invitation eligibility/actions, sorting, three-event limit and the separate Upcoming Meetings card. Shared loaders and My Calendar retain historical records.

**Architecture:** Keep the complete event/invitation collections inside the Home dashboard hook. Derive filtered Home lists using a shared Eastern date key; filter events before applying their existing three-item limit. Refresh the date at aligned minute boundaries and on focus/visibility, with cleanup. Use Eastern Time for Home event date tiles and accurate empty-state text.

- [x] Add regression tests proving past and invalid dates are excluded, earlier times today are retained, filtering precedes the event limit, invitation status/actions and counts are preserved, and the Eastern day rolls over while Home stays open.
- [x] Run the tests against the original implementation and confirm the expected failures: seven relevant failures before the correction.
- [x] Add the Home-only date helper/clock and derive the two filtered lists; update only the relevant Home display text/date formatting.
- [x] Verify Eastern midnight, DST, browser timezone differences, return-to-tab refresh and effect cleanup; run related regression tests and an isolated production build.
- [x] Connect the supplied browser extension token without persisting it and test the corrected build in an isolated preview with controlled API responses. User redirected hosted verification to Test/UAT; its authenticated dashboard passed with real Dataverse reads and a JavaScript replacement confined to one temporary browser tab. No deployment performed.
- [x] Review the scoped diff and preserve pre-existing unrelated changes; record results. Independent review: no findings. Existing dist JavaScript and CSS hashes match the original bundle.

Existing user changes elsewhere in this working tree are outside this correction. No commits, dependency changes, CRM writes, configuration changes or production upload are included.

## Verification

- Focused Home, service and My Calendar regression tests: 117 passed across seven files.
- Complete frontend suite: 1,133 passed across 88 files.
- TypeScript: `tsc --noEmit --incremental false` passed.
- Isolated Vite build: `.superpowers/home-schedule/build`, JavaScript `index-dxPuyfzE.js`; existing bundle-size advisory remains.
- Connected Edge extension preview: today/future selection, retained earlier-today entries, ET tiles, event cap after filtering, invitation controls, midnight rollover, empty states, desktop 1440px and mobile 390px passed; zero API writes, runtime errors or horizontal overflow.
- Browser evidence: `.superpowers/home-schedule/preview-results.json`, `preview-1440.png`, `preview-390.png`.
- Authenticated Test/UAT verification: published Home displayed two September events and six September invitations. The corrected temporary preview hid all eight past entries, retained summary counts and other Home headings, and returned HTTP 200 for all 16 observed API requests. Zero API writes or runtime errors. The temporary tab was closed; evidence in `.superpowers/home-schedule/uat-verification.json` and `uat-corrected.png`.
- Subsequent approved Test/UAT deployment on 13 November used a fresh metadata baseline and the reviewed combined release build. Hosted Home now hides the past records. See [deployment evidence](../../alm/2026-11-13-dashboard-reports-appointments-uat-deployment.json). Production remains unchanged; any later production release must use its own baseline.
