# Contact Multi-District Implementation Plan

> **For agentic workers:** Execute inline with the executing-plans workflow. Keep current dirty work intact; `.git` is read-only, so isolated build/staging directories and per-file snapshots replace git worktree/commit operations.

**Goal:** CRM-managed multi-district membership and a paginated Contact directory, preserving global permissions and unrelated pages.

**Architecture:** A two-lookup junction table with a unique pair key and CRM subgrid. A GET-only Power Pages Server Logic adapter invokes a read-only Dataverse Custom API for compact shared-membership filtering and native SDK paging. Administrators query all active Contacts.

**Tech Stack:** React/TypeScript, Power Pages Web API/Server Logic, Dataverse SDK/Custom API and metadata/customization APIs, existing fixed-Test/UAT authenticated management helper, Vitest.

## Global constraints

Keep global Contact permissions. Preserve legacy `mss_district`, existing Contact data, UI layout and other modules. No Production deployment. No credentials in source or logs. Use fresh site metadata when uploading. Do not stage, commit, reset or modify `.git`.

## Task 1: Schema, administration and migration

Files: `scripts/contact-districts/schema.json`, `scripts/contact-districts/manage.mjs`, private `.superpowers/multi-district-2026-11-13/` snapshots and manifests.

- [x] Audit current schema, relationship absence, Contact form and existing permissions.
- [x] Freeze current Contact IDs/district values, original Contact form XML and proposed payloads.
- [x] Create or verify `mss_contactdistrictmembership`, required lookups, Restrict relationships and unique Contact/District key. Wait for key status Active.
- [x] Add active-membership view/main form and Contact subgrid without replacing other controls. Add components to CRMSolution; publish only affected entities.
- [x] Backfill missing pairs from legacy assignments. Read back every pair and rerun the dry-run; require zero missing pairs and unchanged Contact values.

## Task 2: Contact retrieval and administrator behavior

Files: `src/features/contacts/contactService.ts`, `contactTypes.ts`, `useDistrictContacts.ts`, `src/pages/Contact.tsx`; corresponding service/hook/page tests.

- [x] Add failing tests for paged active membership retrieval and Contact directory endpoint and strict continuation context, empty memberships, root Contact uniqueness and search.
- [x] Replace the hook's single-ID dependency with `getLoggedInUserDistricts(contactId, signal): Promise<readonly string[]>`. Handle empty lists through the existing missing-district state.
- [x] Replace portal FetchXML continuation with the read-only Contact directory adapter and standalone SDK plugin; keep all filtering and paging in Dataverse.
- [x] Change the administrator service from Volunteer-only to all active Contacts, preserving edit payloads and detailed search. Change only affected labels and empty-state text.
- [x] Run focused tests; add stale-request, search/paging and administrator regressions before broad verification.

## Task 3: Portal metadata and integration verification

Files: new membership API settings and read-only table permission, configuration tests, `docs/contact-multi-district.md`, `docs/alm/contact-multi-district-uat-deployment.json`.

- [x] Add only the membership Read permission and explicit API allowlist. Verify every original Contact/District permission hash is unchanged.
- [x] Verify native collection filtering and continuation with actual Dataverse IDs. Use disposable, recorded fixtures for overlap/inactive/no-membership cases if existing rows cannot establish those cases.
- [x] Run `npm test`, `npx tsc --noEmit --incremental false`, and an isolated Vite build. Read test/build output before claiming success.
- [x] Build the deployment stage from fresh Test/UAT metadata and only approved membership settings/permission changes and new Contact read adapter. Upload and download exact readback.
- [x] Verify signed-in Contact page behavior when available, document runtime limits precisely, restore the PAC profile and close the temporary bridge.

Runtime query investigations are recorded privately. Final deployment and hosted readback evidence is tracked in `docs/alm/contact-multi-district-uat-deployment.json`; completion checkboxes are finalized only after those checks pass.
