# Representative contact filtering

The existing Representative field uses ContactLookup and searchContacts('representative'). Its OData query has no active/name predicate and mapContact substitutes Unnamed contact for blank names. Staff and Volunteer fields share the service, so the correction must be explicitly scoped to the representative kind; leave the shared mapper and other queries unchanged.

Add statecode = 0, non-null/nonempty fullname and placeholder-name exclusions to the Representative OData filter before the existing fifteen-record limit. Dataverse string comparisons are case-insensitive. Select statecode for this lookup and reject nonactive, blank/whitespace or trimmed placeholder names defensively before mapContact. Keep valid names, email addresses, selected GUIDs and existing edit/submission logic unchanged. Add only statecode to the existing explicit Webapi/contact/fields allowlist as a required read/filter column. No schema or table-permission changes.

- [x] Add failing tests for initial/searched Representative queries, returned invalid rows and unchanged Staff/Volunteer behavior. Seven expected failures confirmed before implementation.
- [x] Implement the Representative-only filters and defensive mapping, and add the necessary status column to API configuration.
- [x] Verify focused and full tests, type-check/build and browser initial/search/selection behavior with invalid records before valid results; preserve existing deployment assets.
- [x] Review the scoped diff and record results. No deployment or business-record writes.

## Verification

- Focused report service/configuration/lookup/form suite: 77 tests across four files passed. Exact Contact configuration assertion also updated for the required statecode column.
- Complete frontend suite: 1,164 tests across 88 files passed.
- TypeScript no-emit and isolated Vite build passed. Bundle index-Tm_OUcPL.js; CSS index-C-9auer1.css is unchanged from the preceding appointment verification build.
- Browser at 1440px and 390px: 24 invalid records precede valid representatives in the fixture. Supported server predicates remove known invalid records before the limit; returned padded/whitespace labels are dropped defensively. Initial and searched lists display the two valid active contacts with emails. Email search, escaped apostrophe search, selection/removal and exact GUID preservation passed. Zero runtime errors, overflow or API writes.
- Evidence: `.superpowers/representative-filter/browser-verification.json`, `verified-1440.png`, `verified-390.png`, and `.superpowers/representative-filter-full-suite.log`.
- The existing dropdown component, form selection handlers, staff/volunteer queries and shared contact mapper were not changed for this task. Table permissions and Dataverse schema are unchanged. API metadata adds only statecode to the existing Contact column list.
- The approved combined release subsequently deployed the frontend and updated Webapi/contact/fields setting to Test/UAT. Exact metadata readback and hosted initial/search results verified active-state and meaningful-name filtering. See [deployment evidence](../../alm/2026-11-13-dashboard-reports-appointments-uat-deployment.json). Original compiled workspace assets were preserved, and Production remains unchanged.
