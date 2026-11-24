# Production release — 13 November 2026

Published the exact reviewed Test/UAT build to https://oiac.powerappsportals.com. The user explicitly authorized this production promotion.

## Included

- Home dashboard events and invites use today/future Eastern calendar dates.
- Meeting Report selected-member names and representative filtering.
- Appointment Contact server search and pagination across valid active contacts.
- Activity post attachment controls, thumbnails, document cards and SharePoint flow.
- Multi-district Contact directory: administrators see all active Contacts; other supported roles see Contacts sharing an active linked district. Existing global Contact permissions remain.

## Deployment and verification

- Target environment: ca557a8d-626a-ed50-b1e7-ca05693b4405; website: e7f400bd-1e04-4efa-b8b3-7a7a3b168662.
- Exact uploaded JS/CSS hashes and the eight intended metadata deltas were verified by fresh production download.
- Existing managed CRM backend assemblies, history processing steps, Contact form, web-role definitions and production-specific settings/permissions were preserved.
- Created 3706 membership rows from production's own legacy assignments. Verified no missing pairs or duplicates, and preserved all 3829 existing Contact IDs, primary district values and states. No UAT Contact data was copied.
- Imported managed flow-only patch CRMSolution_Patch_de4f57f3 v1.0.1.0, bound it to the verified production runtime site, and activated it. Rebound only its Dataverse connection reference to the deployment account's existing Connected production connection; the SharePoint binding and unrelated flow definitions/states were preserved.
- Signed-in administrator smoke verified Contact paging/search, Activity reads and moderation flags, appointment Contact paging, history reads, attachment listing, and 7 additional page routes. Production browser requests were restricted to reads; no business records or production roles were changed by smoke tests.
- Write journeys were tested in UAT, not repeated in production. The earlier Applicant navigation label and membership-cache propagation findings remain.

## Evidence and rollback

Public report: [production-deployment JSON](../alm/2026-11-13-production-deployment.json). Private exact backups and request receipts remain under .superpowers/production-release-2026-11-13/.

The pre-release site backup is site-before/oiac-engage/.powerpages-site. To roll back the portal, prepare an isolated stage containing that metadata and the backed-up web asset contents, verify this production target, then use pac pages upload-code-site and perform a fresh readback. Do not overwrite production identity settings with UAT files.

The narrow managed child patch can be removed to restore the previous parent workflow layer after checking dependencies. The original flow was off. The connection reference's original value is preserved in connection-rebinding-plan.json; restoring it also restores the original connection-access problem.

Memberships are additive and can remain during a frontend rollback. Any deliberate data rollback must target only exact created IDs in migration-plan.json after checking for subsequent changes; never delete all membership rows or change original Contact district values. Backend binaries were not replaced.

## Final read-only verification — 14 November 2026 (Asia/Riyadh)

The new membership Web API and district-scoped endpoint also responded successfully. This signed-in administrator has no district memberships, so the scoped endpoint correctly returned no Contacts; the administrator UI separately returned all active Contacts and passed two-page navigation and partial-name search. Other roles and multiple-district combinations were exercised in Test/UAT without altering production role assignments.

Zero test business records or files were created in production, and zero deletions were required or performed. The 3,706 legitimate migration rows remain part of the deployed feature. No production code, configuration, roles or business data were changed during the final verification.

Attachment listing was verified on an existing post with no files. Production uploads and file-content downloads were not exercised. The structured runtime report records these limits explicitly.
