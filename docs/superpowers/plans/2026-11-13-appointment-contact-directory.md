# Appointment contact directory enhancement

The existing ContactLookup sends debounced requests through appointments ServerLogic to mss_AppointmentCommand. The server applies name search before paging, but only returns fifteen matches without continuation, omits email search, requires recipient portal login/identity, and does not reject Unnamed. The server runs under the existing integration caller without SYSTEM elevation; caller authentication, functional web-role checks and Dataverse privileges remain intact.

Implementation uses the existing custom API and lookup, adds validated contact continuation links backed by Dataverse paging cookies, and exposes Load more contacts inside the existing dropdown. Server-side predicates cover active state and partial case-insensitive first/last/full/email matching. Invalid names are removed on the server and defensively in the client. Browser pages are fetched only on demand. Request cancellation, debounce and duplicate-ID protection apply across pages. No contact-table bulk download, new lookup component, permission widening, schema or mapping change is planned.

The user initially requested retaining recipient portal-login eligibility, then explicitly revised that decision after the supplied-contact audit: **Allow all active contacts as recipients.** The implemented directory and create validation now require an active recipient with a meaningful name, regardless of portal login or identity. Actor authentication, functional roles, self-exclusion and recipient-only response permissions remain unchanged. No contact login settings are modified.

- [x] Add failing SDK, service/proxy and lookup tests for email, placeholders, remote matches beyond 500 rows, contact continuation and stale-page cancellation.
- [x] Implement contact paging/search in the action and trusted proxy, retaining fixed actor/role/privilege boundaries.
- [x] Implement on-demand page support in the existing lookup and connect the appointment form; preserve report lookups and appointment submission IDs.
- [x] Apply the revised all-active-recipient eligibility to directory and create validation, preserving sender authentication and response permissions.
- [x] Run SDK/frontend tests, build, browser pagination/search/selection checks and scoped review.
- [x] Deploy to the explicitly approved Test/UAT site, verify exact readbacks and run read-only hosted checks. No business records or Production changes.

## Verification and release boundary

- SDK handler: 74 tests passed, including 601 matching contacts across 41 pages, email search beyond 600 unrelated contacts, active recipients without portal login/identity, disabled-sender rejection, wildcard escaping, invalid names and recipient-only response security. Additional hosted verification exposed HTTP 500 with raw XML paging cookies; base64url transport with strict UTF-8 decode now preserves the exact SDK cookie without XML in query strings. Regression tests cover native XML/Unicode roundtrip and malformed tokens.
- Focused UI/service/proxy/report tests: 183 passed across five files. Coverage includes stale-page cancellation, safe continuation links, failed-page retry, duplicate removal and existing create/edit/report behaviors.
- Complete release frontend suite: 1,164 tests across 88 files passed. TypeScript no-emit check and isolated Vite build passed.
- Browser: actual AppointmentRequestForm and ContactLookup at 1440px and 390px with 602 local fixtures. Initial page contains 15; pages are loaded only on demand; all 601 matching rows are reachable on page 41. Searching first/full/partial name or uppercase email finds a contact beyond the initial 500 records. Selection preserves the exact Contact ID. No duplicates, overflow, runtime errors or API writes; dropdown/footer positioning passed.
- Independent scoped review: no code findings. The noted documentation clarification has been incorporated.
- Published Test/UAT baseline checks established the earlier six-contact, first-page-only contract. After deployment, live endpoint and UI checks verified the revised contract. Searches by exact supplied ID/name/email found all 18 eligible recipients in the 19-record list; the signed-in sender is correctly excluded. All 12 contacts without portal login are now searchable. No appointment was submitted.
- Browser and test evidence resides under `.superpowers/appointment-contact-directory/` and `.superpowers/release-2026-11-13/`. The sanitized [deployment record](../../alm/2026-11-13-dashboard-reports-appointments-uat-deployment.json) records release boundaries and verification limits.
- Final deployed handler SHA-256: `cc637de7fcb595e47f7f275fbb9e797d88c88a58357d3ef1982b00f4f0d66eaa`; strong name and exact registered-byte readback verified.
- Deployment used a fresh Test/UAT metadata download and reviewed build, preserving unrelated settings, table permissions, web roles and server logic. The original PAC authentication profile was restored. Production remains unchanged.
