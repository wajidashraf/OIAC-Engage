# Appointments action

`AppointmentCommandPlugin.cs` is the only source compiled into the signed plug-in. It implements the unbound action `mss_AppointmentCommand`, using the integration caller's `context.UserId`; it never creates a SYSTEM service. It validates the trusted portal actor, enforces participant reads and recipient-only Pending transitions, and uses a conditional SDK `UpdateRequest` to prevent racing responses from overwriting each other.

The separate `RegisterAppointmentCommand.cs` is administrative tooling, not part of the deployed assembly. Its `Apply(IOrganizationService, dllPath, manifestPath)` method is called only by an authenticated UAT management helper after explicit authorization. It validates existing registration shape and solution membership before an update, rejects extra API parameters, creates missing approved components with `SolutionUniqueName=CRMSolution`, and verifies membership after creation. Plug-in types travel with the assembly; no generic table Create/Update steps are registered. API metadata is public to authenticated Dataverse API callers (`isprivate=false`), which is not an authorization control. Execution requires the existing `prvReadmss_Appointment` privilege. Portal users access only the fixed ServerLogic endpoint; their browser cannot provide ActorContactId.

## Build and test

On Windows with the official PAC CLI SDK assemblies and .NET Framework compiler installed, from the workspace root:

```powershell
& ./oiac-engage/backend/appointments/build-test.ps1
```

Use `-SdkDirectory` if the official PAC tools directory differs. The script compiles for .NET Framework 4.6.2, runs the executable SDK test harness, verifies the strong name and prints the SHA-256. It writes only to ignored `.superpowers/appointments-build/`. The signing key remains there and must be securely retained for future assembly updates; do not commit the private key. The test executable is not deployed. `Microsoft.Xrm.Sdk` is a platform reference, not an embedded dependency. No browser or application secret is needed to build.

## Registration contract

| Property | Value |
|---|---|
| Assembly | `Oiac.Engage.Appointments`, version `1.0.0.0`, Sandbox / Database |
| Type | `Oiac.Engage.Appointments.AppointmentCommandPlugin` |
| Action | `mss_AppointmentCommand`, unbound, POST, no custom processing steps |
| Required inputs | `ActorContactId` Guid (12), `Command` String (10), `Payload` String (10) |
| Output | `Result` String (10), JSON `{ok,...}` |
| Commands | incoming, outgoing, all, calendar, contacts, create, accept, reschedule |

Source protocol and role IDs are deliberately specific to the approved UAT website. Revalidate role/site IDs and privileges before promotion; do not run against Production. `scripts/appointments/action-registration.json` records the actual registered IDs/hash. The approved table changes are in `scripts/appointments/schema-manifest.json`; the lookup definition is documentation of the already-created UAT column, not an instruction to replay an unconditional POST. Promote schema/action with the solution after release approval.

The handler tests exercise privacy for A/B/C, functional-role creation/directory access, pending-recipient responses, actor stamping, field allowlists, actual option values, timezone gaps/folds, legacy null requester and conditional writes under a simulated race. They do not reproduce Dataverse transaction rollback behavior. A real conditional-write fault may emerge as a transaction error from the outer Custom API; the UI then preserves input and allows a retry, which rechecks current status/version before any write. Multi-user hosted UAT must verify this path; no unconditional fallback is permitted.

Authoritative Microsoft references: [custom API creation](https://learn.microsoft.com/power-apps/developer/data-platform/create-custom-api-with-code), [parameter types](https://learn.microsoft.com/power-apps/developer/data-platform/custom-api-tables), [plug-in registration](https://learn.microsoft.com/power-apps/developer/data-platform/register-plug-in), [optimistic concurrency](https://learn.microsoft.com/power-apps/developer/data-platform/optimistic-concurrency), [Power Pages server objects](https://learn.microsoft.com/power-pages/configure/server-objects).

The `all` read command requires the exact Administrator role and site membership on every page. Incoming/outgoing/calendar stay participant-scoped even for administrators. The UI exposes all reads through a separate administrator overview. The existing recipient-only Pending/version response contract is unchanged. The earlier appointment-view release is recorded in `docs/alm/appointment-views-uat-deployment.json`; current directory verification is recorded below.

## Contact directory enhancement (Test/UAT, 13 November 2026)

The `contacts` command accepts `q`, optional `page` (2 or greater for continuation) and an opaque `cookie` token (maximum 8,192 characters). Dataverse XML paging cookies are transported as base64url text and decoded with strict UTF-8 before the SDK call; the XML never appears in the portal query string. This corrects the HTTP 500 observed with raw XML continuation URLs on the hosted site. It searches first/last/full name and email with escaped, case-insensitive partial predicates before paging. Names are normalized and missing/placeholder labels, including Unnamed and Unknown, are excluded. Following the user's revised approval, recipients require active state and a meaningful name, but do not require portal login or an identity record. The sender still requires an active, login-enabled portal identity and a functional caller role. Self-appointments remain forbidden, and creation independently validates the recipient. Contact accounts, login settings and response permissions are unchanged.

Responses contain at most fifteen unique contacts plus `nextLink` or null. Continuation preserves the normalized query, advances the page, and carries the SDK paging cookie. The proxy and client validate the continuation path, query and advancing page; the browser fetches each additional page only when requested and deduplicates IDs. Existing first-page-only callers remain supported. No contact email values or identity credentials are returned.

The SPA and appointments ServerLogic were deployed together to the approved Test/UAT site, followed by the revised all-active-recipient handler and the cookie transport correction. Exact hosted asset, metadata and assembly readbacks were verified. Current verification: 74 SDK tests and 1,164 frontend tests pass; paging coverage includes 601 matching records across 41 pages. Hosted searches verified all 18 eligible contacts from the supplied 19-record list, including all 12 without portal login. The remaining record is the signed-in sender and is correctly excluded. No hosted appointment was created during this release verification. Existing Dataverse fields, table permissions and security roles are unchanged; Production was not modified. See [release evidence](../../docs/alm/2026-11-13-dashboard-reports-appointments-uat-deployment.json).
