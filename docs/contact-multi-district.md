# Contact district memberships

Implemented for OIAC Engage Test/UAT on 13 November 2026. Production is outside this release.

## Manage districts in CRM

Open a Contact in **House CRM** using the customized **Contact** main form. The new **District Memberships** tab lists active associations. Add a membership, choose a District and save. Repeat to assign multiple districts. The Contact lookup is required and is populated from the related subgrid; confirm it before saving.

Deactivate a membership to remove that district from the directory scope. Reactivate its existing row to restore it. A composite Contact/District key prevents creating the same pair twice, including when its existing row is inactive. The membership name is generated automatically. CRM administrators need the appropriate Dataverse privileges on the new table; no portal membership editing is enabled.

The existing single **District** lookup remains the primary district used by existing modules and displayed in the Contact table. It is preserved. Changing that field does not automatically change memberships; manage the new associations explicitly. Existing Meeting Reports, appointments, invitations and profile behavior remain unchanged.

## Contact page behavior

- Administrators see every active Contact across districts, including non-Volunteers and Contacts without a district. Existing administrator editing is preserved.
- Other signed-in users see active Contacts sharing at least one active District Membership with them. A Contact sharing several districts appears once.
- Users without active memberships see the existing no-district message.
- Name, email, phone and city search runs on the server within the eligible records. Results use native 15-row pages.

Global Contact permissions remain enabled as requested. This release filters the directory; it does not introduce district-level API confidentiality. Existing direct API access continues to follow the existing permissions.

## Solution components

Additive table: `mss_contactdistrictmembership`, organization owned, with generated `mss_name`, required Contact and District lookups, standard active/inactive state, two Restrict-delete relationships and a composite alternate key. The existing Contact form gains one related membership subgrid. Its other controls remain intact.

The active view, membership form, modified Contact form, table and relationships are included in `CRMSolution`. The solution also includes the standalone Sandbox assembly `Oiac.Engage.ContactDirectory` and `mss_ContactDistrictDirectory` Custom API with its four request parameters and `Result` response.

Portal metadata adds a read-only Authenticated Users membership permission, explicit membership Web API settings and the authenticated GET-only `contact-directory` server-logic adapter. Existing Contact/District permissions and Contact Web API field values are retained. Use the deployment manifest for exact component IDs and asset hashes.

The adapter supplies the session Contact ID to the fixed read-only Custom API. The plugin derives shared districts in Dataverse with an EXISTS query, preserving unique Contact roots and native SDK paging cookies. A bounded base64url cursor carries paging state; actor and search filters are reapplied on every page. This avoids long district-ID URLs and the observed Power Pages FetchXML continuation limitation. Other server endpoints are unchanged.

## Migration and verification

The initial migration created 15 active membership pairs from 20 existing Contacts, preserving all Contact IDs, primary district assignments and active states. Five Contacts had no legacy district. There were three Districts. No automatic synchronization was added.

`node scripts/contact-districts/manage.mjs dry-run` reports missing or inactive legacy pairs without changing data. The explicit `migration --apply` command creates missing pairs and reactivates existing inactive pairs. It is a reconciliation tool: rerunning it can restore legacy assignments intentionally deactivated in CRM, so inspect its dry-run before use.

Validation covers the full frontend suite, SDK handler tests, a local browser matrix with 601 Contacts over 41 pages at desktop/mobile widths, native Dataverse paging and disposable-fixture cleanup. Hosted checks use the actual signed-in ordinary-user session; administrator UI coverage uses controlled local browser data and native all-active Contact reads. Exact results and limitations are recorded in `docs/alm/contact-multi-district-uat-deployment.json`.

## Deployment and rollback

Deploy the Dataverse solution components before the portal adapter and frontend. Migrate legacy associations once, verify the key is Active and confirm the desired CRM form is enabled for the application. Portal deployments must use `pac pages upload-code-site` against the explicit environment/site, starting with freshly downloaded metadata.

For application rollback, restore the recorded previous frontend bundle and remove only the new adapter registration if necessary. The additive membership table and migration can remain without affecting the old single-district directory. Preserve membership data; do not delete the table or existing Contact records as an application rollback step. Restore only deliberately changed metadata from the captured baseline, preserving subsequent administrator changes.
