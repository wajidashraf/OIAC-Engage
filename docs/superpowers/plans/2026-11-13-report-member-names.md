# Meeting Report selected member names

**User-approved requirements:** Rename the staff label to Tag Staff Members. Both report-form member dropdowns show comma-separated selected contact names immediately, including existing selections when editing. Empty placeholders are Select staff members and Select volunteers. Long names remain on one line with CSS ellipsis. Preserve search, dropdown interactions, validation, GUID values, relationship mappings and submission.

**Implementation:** Change only the existing MultiContactLookup trigger presentation, its two MeetingReportForm uses/label and the report-scoped trigger text CSS. This component is used only by these two Meeting Report fields. Derive display text from values[].name, leave the selected ContactOption objects and ID handling intact, and expose the complete display text through a hover title.

- [x] Update component regression tests for immediate selection/deselection, three names, field-specific empty placeholders, saved selections before options load, and search results that omit saved selections.
- [x] Update report integration tests for the staff label and names on create/edit while preserving relationship GUID assertions. Confirmed nine expected failures against the original implementation.
- [x] Implement comma-separated display text and scoped single-line ellipsis; rename the form label without changing search/load/update code.
- [x] Run focused lookup/report/service tests, type-check, and isolated build. Verify real browser layout at desktop/mobile widths and unchanged search/selection behavior.
- [x] Review the scoped diff; record evidence. No deployment, Dataverse/schema changes, commits or unrelated source edits.

Pre-existing Home date correction and activity attachment changes remain outside this work.

## Verification

- Focused tests: 59 passed across three files, including create/edit submission and relationship GUID checks.
- Full frontend suite: 1,138 passed across 88 files.
- TypeScript no-emit check and isolated Vite build passed; existing deployment assets were preserved.
- Playwright tested the actual component and scoped theme CSS with local fixtures at 1440px, 390px and 320px. Long summaries overflow their text box with single-line ellipsis, retain complete hover titles, keep the chevron visible and do not cause page overflow. Search, select/deselect, empty placeholders and keyboard close/focus passed for both fields; zero runtime errors or API writes.
- Browser evidence: `.superpowers/report-member-names/browser-verification.json` and `verified-1440.png`, `verified-390.png`, `verified-320.png`.
- Initial verification build: `.superpowers/report-member-names/build`, assets `index-BFAHXypm.js` and `index-BR8cbrdV.css`. The subsequent approved combined Test/UAT release verified the renamed label and both selected-name summaries through the hosted form. See [deployment evidence](../../alm/2026-11-13-dashboard-reports-appointments-uat-deployment.json). Production remains unchanged.
