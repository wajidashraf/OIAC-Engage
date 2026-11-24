# Contact district directory plugin

Standalone, read-only Dataverse plugin. Assembly `Oiac.Engage.ContactDirectory`, plugin type `Oiac.Engage.ContactDirectory.ContactDirectoryPlugin`, version `1.0.0.0`, .NET Framework 4.6.2.

## Interface

Custom API message: `mss_ContactDistrictDirectory`.

| Input | SDK type | Rules |
| --- | --- | --- |
| `ActorContactId` | `Guid` | Required, nonempty, active Contact. Supplied only by trusted Power Pages server logic. |
| `Search` | `string` | Optional, defaults to empty; maximum 200 UTF-16 code units. Preserved exactly, including spaces. The adapter may trim before calling the API and must use the returned next link unchanged. |
| `Page` | `int` | Defaults to 1 if omitted; 1 through 100000. |
| `Cookie` | `string` | Optional on page 1; required on later pages. Maximum 16384 characters; opaque base64url cursor binding actor, exact search, expected page, and native SDK cookie. |

Output `Result` is a JSON string:

```json
{"ok":true,"contacts":[{"contactid":"guid","fullname":"Name","emailaddress1":null,"mobilephone":null,"address1_city":null,"_mss_district_value":null}],"nextLink":null}
```

The optional `_mss_district_value@OData.Community.Display.V1.FormattedValue` property preserves the SDK formatted value for the selected legacy district lookup. That legacy lookup does not authorize directory visibility.

When more rows exist, `nextLink` is `/_api/serverlogics/contact-directory?q=<escaped-search>&page=N&cookie=<cursor>`. Page 1 rejects cookies. Malformed cursors and actor/search/page mismatches return validation errors before SDK reads. The cursor is a transport envelope, not an authentication token; the trusted actor and membership scope are reapplied to every request.

Failures return `{"ok":false,"error":{"code":"validation|unauthenticated|forbidden|unavailable","message":"safe message"}}`. SDK exception text is never returned.

## Scope and permissions

The plugin creates the SDK service with `context.UserId`. It performs one active-actor Contact retrieval and one FetchXML Contact retrieval, with no writes or elevated service. Restrict Custom API execution to the intended integration caller; never accept a browser-supplied actor in server logic.

The Contact root uses an active membership `exists` join, with an active actor-membership `inner` join on district. Shared memberships across multiple districts and duplicate membership rows yield unique root Contacts. Active Contacts in no shared active membership remain absent. An actor without active memberships receives an empty list. The plugin does not check portal identities or admin roles; the frontend uses its separately authorized all-active route for administrators.

The query projects only `contactid`, `fullname`, `emailaddress1`, `mobilephone`, `address1_city`, and `mss_district`, orders by `fullname` then `contactid`, and pages natively in batches of 15. Search is a literal, case-insensitive partial match across name, email, mobile phone, and city. XML and SQL LIKE metacharacters are escaped independently.

The design follows Microsoft documentation for [EXISTS joins](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/join-tables#use-exists-or-in-link-types) and [SDK FetchXML paging cookies](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/page-results#paging-cookies). If Dataverse indicates more rows without a usable paging cookie, the API fails safely instead of issuing an unbounded or inconsistent continuation.

## Build and verification

Run `./build-test.ps1` from PowerShell. Optionally pass `-SdkDirectory` pointing to official `Microsoft.Xrm.Sdk.dll` tooling. Uses the existing workspace `.superpowers/appointments-build/appointments.snk` without creating or modifying it; outputs go only to workspace `.superpowers/contact-directory-build`.

The script compiles and signs the assembly with the .NET Framework compiler, executes 35 SDK-interface tests, prints the DLL SHA256, and verifies the strong name. Tests evaluate emitted FetchXML joins, filters, projection, ordering, and native paging against controlled entities. They cover multiple districts, duplicate and inactive memberships, active/inactive actors and contacts, literal searches across all four fields, 601 Contacts across 41 pages, Unicode/XML cookie roundtrips, input/cursor limits, safe fault responses, and caller identity. These tests do not replace native Dataverse registration and runtime validation.
