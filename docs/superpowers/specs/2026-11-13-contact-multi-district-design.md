# Contact multi-district membership: approved scope

The user approved retaining global Contact permissions and filtering the Contact page using linked districts. Administrators must see all active Contacts, rather than only Volunteers; other authenticated users see active Contacts sharing any active membership district. This is display filtering, not a confidentiality boundary. Existing direct API access remains governed by existing global permissions.

## Verified starting point

- Test/UAT: `16838866-275a-e2e7-838f-57313f30a416`, website `e7f400bd-1e04-4efa-b8b3-7a7a3b168662`, Dataverse `https://org97063a46.crm.dynamics.com`.
- Existing tables: `contact` (`contacts`) and `mss_district` (`mss_districts`). Legacy lookup: `contact.mss_district`, navigation `mss_District`, relationship `mss_contact_District_mss_district`.
- No published Contact–District N:N or reusable membership table exists. The existing Meeting Invites–District N:N belongs to a different business purpose.
- Audit found 20 active Contacts, 15 legacy assignments, five without assignments and three Districts, without a continuation page.
- The `House CRM` app is confirmed. Contact main form `1fed44d1-ae68-4a41-bd2b-f13acac4acfa` contains the legacy district field and existing unrelated subgrids; its membership subgrid will be added without replacing them.
- Contact page currently uses a single district filter; the administrator branch selects only Volunteers. Existing authenticated Contact Global Read and administrator management permissions must remain byte-for-byte unchanged.

## Additive Dataverse model

Create organization-owned `mss_contactdistrictmembership` (display name **Contact District Membership**), rechecking existence before creation. Fields: primary ID `mss_contactdistrictmembershipid`, primary name `mss_name`, required Contact lookup `mss_contact` (`mss_Contact`), required District lookup `mss_district` (`mss_District`), standard active/inactive state. Do not add a duplicate Primary District flag: the existing Contact lookup remains the legacy primary assignment.

Relationships: `mss_contactdistrictmembership_Contact_contact` and `mss_contactdistrictmembership_District_mss_district`. Specify collection navigation names `mss_contact_contactdistrictmemberships` and `mss_district_contactdistrictmemberships`; verify actual metadata after creation. A composite alternate key over `mss_contact,mss_district` prevents duplicate associations, including inactive pairs. Reuse/reactivate a pair rather than creating duplicates. Deleting a referenced Contact/District is restricted while membership rows reference it.

Add an active-membership view, a compact membership main form and a related subgrid on the existing Contact main form. CRM administrators manage memberships there. Add these components to `CRMSolution`. Existing forms, relationships and Contact values remain intact.

Copy the 15 current non-null legacy associations into active membership rows, creating only missing pairs. Generate a dry-run manifest and snapshots before applying. A repeat run must create zero rows. This release does not introduce automatic synchronization or self-service membership editing: future memberships are administered in CRM, and other pages continue using their existing legacy field.

## Portal data access

Keep existing Contact/District table permissions unchanged. Add only read access for the new membership table to the existing Authenticated Users role, with an explicit Web API field allowlist. No portal membership Create/Update/Delete permission. Retain the original Contact API allowlist. A temporary logical lookup alias enabled native query investigation, and is restored to the original values in the final release.

Use the existing Contact components. Retrieve the signed-in Contact's active memberships through the Power Pages Web API, following continuation pages and deduplicating District IDs. A user with no memberships receives the existing missing-district state.

For member Contact pages, a GET-only `contact-directory` Server Logic adapter stamps the authenticated session Contact and invokes the read-only `mss_ContactDistrictDirectory` Custom API. Its standalone Sandbox plugin uses the integration caller's own SDK privileges, an active-root Contact EXISTS join to active matching memberships and an inner join to the actor's active memberships. Each root Contact appears once before native 15-row SDK pagination. Preserve literal, case-insensitive name/email/phone/city search. Native paging cookies travel in bounded base64url envelopes bound to actor/search/page; validate all continuation origin/path/context. Do not fetch the entire Contact table into the browser. Keep shared transport and stale-request protections unchanged.

This adapter follows existing application integration patterns. Native testing established that large district-ID lists exceed portal GET URL limits, and Power Pages' FetchXML wrapper does not reliably honor its own continuation cookie. Running the compact query directly in the Dataverse SDK avoids both limitations.

Administrator list queries all active Contacts, retaining existing edit controls and detailed search. Update only administrator copy that currently says “Volunteer contacts.” Keep the existing District column displaying the legacy primary District, so no unrelated layout or profile changes are introduced.

## Boundaries and verification

Meeting Reports, appointments, profile editing, invitations, activity posts and their mappings are unchanged. Production is excluded. The shared API transport is unchanged. The global-permission choice deliberately does not claim to block an authenticated user from constructing broader Contact queries.

Verify one/two/no memberships, inactive contacts and memberships, overlap/deduplication before paging, name/email search, stale requests, large datasets and administrator all-contact behavior. Run the full frontend suite, typecheck and isolated build. Verify native Web API filtering/paging in Test/UAT, plus migration idempotence and exact metadata/form readback. Temporary live fixtures, if needed, must be newly created, explicitly marked and removed by their exact recorded IDs; no existing Contact may be altered or deleted for testing.

The browser was reconnected with an ordinary Volunteer/Authenticated Users session. Hosted verification must use that real actor; administrative management API fixture checks are separately reported. No actual hosted administrator session is available, so administrator UI behavior is covered by local browser tests and all-active native Web API checks.
