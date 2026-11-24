# Activity Channel post attachments

Attachments belong to Activity Posts. The Create Activity form accepts up to ten files, ten MiB each; comments and replies have no file picker. The normal activity content remains required. After the native post command succeeds, the frontend uploads files sequentially and retains the confirmed post and stable file IDs across retries. A failed upload does not recreate the activity. Cancel/reopen retains the current draft and selection.

## Supplied flow and site

- Environment: Test/UAT, `16838866-275a-e2e7-838f-57313f30a416`.
- Website: `e7f400bd-1e04-4efa-b8b3-7a7a3b168662`.
- Power Pages management/runtime site ID: `5fb3972a-5518-4b27-a8e2-21abd2963fdc`. This is the injected trigger `siteId`; it is distinct from the Dataverse website record ID above.
- Flow: Upload Activity Channel Post Document, `3d2d6112-bcd2-f111-a059-000d3a35b61f`.
- Portal endpoint: `/_api/cloudflow/v1.0/trigger/3d2d6112-bcd2-f111-a059-000d3a35b61f`.
- Existing registration: `c31dccc1-bcd2-f111-a059-000d3a35b61f`, authenticated-users role `0353acdd-7b95-4c07-8997-ae95dafd978d`. Its web role was not changed.

The flow initially contained only the required text input `Input` (internal key `text`) and a Compose Site ID action. The user authorized extending that existing flow. The original trigger and flow ID are preserved. On 28 October 2026 the extended flow was configured, activated and verified against an exact definition readback through the existing OIAC SDK session. Management operations verify the exact UAT organization, flow ID, unmanaged state, unchanged trigger, and original source snapshot, with restoration on unsuccessful activation. No Production flow was modified.

## Request and response

The app uses the portal session and existing CSRF token helper, with `X-Requested-With: XMLHttpRequest`. Requests wrap a JSON command string in the original Input field:

```json
{"eventData":"{\"Input\":\"{\\\"operation\\\":\\\"list\\\",\\\"postId\\\":\\\"11111111-1111-4111-8111-111111111111\\\"}\"}"}
```

Operations:

- `list`: `postId`; returns `attachments` containing `id`, original `fileName`, `size`, and `contentType`.
- `upload`: `postId`, stable `clientFileId`, `fileName`, decoded `size`, and raw `contentBase64`; returns `attachment`.
- `view`: `postId`, `attachmentId`, and `fileName`; returns `attachment` and `contentBase64`.

The Power Pages Return action returns a `result` text property containing either `{ok:true,...}` or `{ok:false,error:...}`. The client validates identifiers, filenames, response associations, duplicate IDs, bounded sizes, and actual downloaded byte length. A 202 Accepted response is not treated as a confirmed upload.

## Storage and authorization

Files are stored in the existing OIAC Engage SharePoint site's Documents library under `Activity Channel Attachments/<postId>/<clientFileId>_<fileName>`. Existing connection references are reused: `mss_sharedsharepointonline_afea2` and `mss_sharedcommondataserviceforapps_ef7bc`. No Dataverse schema change or public sharing link is introduced.

Before SharePoint access, the flow validates trusted portal-injected site/user context, the requested GUID, an active login-enabled Contact, and an active Activity Post. Upload additionally checks that the caller is the post author, validates IDs and filenames without unsupported Parse JSON regex patterns, verifies the decoded file size, and checks the deterministic file path for retries. An existing file must match the retry's exact content before returning success. Read paths are derived from the validated post and attachment identifiers; the client never submits an arbitrary SharePoint URL.

Visible post cards retrieve metadata, then fetch the visible photo tiles. One photo uses a full-width tile with a download control; multiple photos use a collage with a full-size viewer that can navigate every photo. Documents use typed rows with filename, real file size and Download. PDFs load in the browser PDF viewer only after Preview is selected. Fetched bytes are reused within the post, while each tile/dialog owns and releases its own Blob URL. Cancelled pending cache entries are replaced during React StrictMode lifecycle replay. Known safe image/PDF extensions provide a fallback only when SharePoint returns a generic MIME type. Reads abort on refresh/unmount, and an old aborted download cannot change a newer request's state. Failed file reads have their own retry control and do not prevent reading the post or discussion.

The activity composer has separate Photo and Document buttons feeding the same queue and existing flow. Selected files appear as removable chips above these buttons. The shared ten-file limit, post-first upload sequence, stable retry identities, and comments/replies remain unchanged. Photo selection filters to supported raster formats; Document accepts the existing permitted file types. No PDF page count is displayed because the flow does not supply one.

Deleting a post continues to use the existing native command. This change does not add physical SharePoint-folder cleanup to that command; file access through this flow requires an active existing post.

## Evidence and deployment status

- Full frontend suite: 1,091 tests across 87 files passed on 28 October 2026.
- Production build passed, with the existing main-chunk size advisory.
- Local full-Chromium verification at 1440 and 390 pixels covered upload recovery, one post creation, two persisted files after reload, image display, Chrome PDF viewer loading, no comment file controls, no horizontal overflow, and zero scoped WCAG A/AA violations. These are controlled local fixtures, not hosted authorization evidence.
- Independent review identified PDF sandbox incompatibility and stale aborted download state; both have regression tests and fixes.
- The flow and frontend are deployed to Test/UAT. PAC upload-code-site completed successfully using a pristine download-code-site baseline. A fresh code-site readback matched both compiled JS/CSS SHA-256 hashes, found current page references to both assets, and preserved all 155 checked permission, role, setting, server-logic, flow-registration and content-snippet files byte-for-byte. See [deployment evidence](alm/activity-post-attachments-uat-deployment.json).
- Authenticated hosted acceptance passed on 28 October 2026 after correcting two flow-runtime issues: the trigger injects the management/runtime site ID rather than the Dataverse website record ID, and `base64ToBinary` returns a typed object which cannot be passed to `length`. Byte-size validation now uses the Base64 string length/padding and independently forces decoding before a write.
- One clearly marked Test/UAT activity (`76b92c87-b389-5af2-87e6-ba695830a994`) was used throughout all failed attempts and successful retries. A 68-byte PNG, 599-byte PDF and 39-byte text document uploaded through the real UI, were retrieved after reload, and matched the original bytes. The text-document Download action also returned the expected filename. A same-ID upload retry returned the existing attachment and kept the count at three. The user's existing activity was not modified or recreated. Temporary diagnostics were removed from the final activated flow.
- Two flow regression checks cover the runtime-site identity binding and unsupported `length(binary)` usage. The corresponding management identity proof and sanitized hosted results are in [runtime-fix evidence](alm/activity-post-attachments-runtime-fix.json).

Local evidence and private original snapshots are under ignored `.superpowers/activity-post-attachments/`. `scripts/activity-attachments/flow-clientdata.json` is the reviewable configured flow definition, generated by `build-flow.mjs`. `build-admin.ps1` builds the narrowly scoped administrative helper and requires the previously established local OIAC session helper; it does not create credentials or alter sign-ins.

The screenshot-based composer/gallery/document UI was subsequently deployed to the same Test/UAT site on 28 October 2026. All 1,096 tests and the production build passed. Desktop/mobile browser checks covered both native pickers, chip placement, mixed-post retry/reload, 1/2/5-photo layouts, hidden-photo navigation, modal focus return, native PDF preview and cached downloads, with zero scoped WCAG A/AA violations. Fresh deployment readback matched both compiled assets and preserved all 155 protected metadata files plus five protected sources. Authenticated browser verification reused the existing marked post and confirmed real photo/PDF/text retrieval without a new upload or post. See [UI deployment evidence](alm/activity-post-reference-ui-uat-deployment.json) and [hosted UI checks](alm/activity-post-reference-ui-hosted.json). UI screenshots and logs are under ignored `.superpowers/activity-post-ui/`.

The latest requested revision scopes the green accent to the post section only, centers photo thumbnails within 350 × 350 pixels, presents documents as compact badge/name/size chips, and places the top-level comment field beside Post Comment. PDFs retain modal preview and a separate download icon; other document chips download on selection. The existing modal backdrop, keyboard navigation, private-file cache and retry behavior remain unchanged. The trusted backend already permits deletion only for the author or a current site Administrator; its 30 local SDK behavioral tests passed, including the unrelated-user denial. UI coverage additionally verifies that an unrelated member has no Delete Activity control. These authorization tests do not perform live user impersonation or delete hosted records.

This revision is deployed to Test/UAT. All 1,097 frontend tests, the build, and desktop/mobile browser checks passed; the deployment readback matched both compiled assets and preserved 155 protected metadata files and nine protected sources. Authenticated hosted checks passed measured post-only borders, centered bounded thumbnails, compact document chips, one-row comment controls, full-size image modal, native PDF preview and exact text download using the existing marked post. See [thumbnail/layout deployment evidence](alm/activity-post-thumbnails-uat-deployment.json) and [hosted checks](alm/activity-post-thumbnails-hosted.json).

On 29 October 2026, upload acknowledgement recovery was added after a user reported an error despite successfully saved files. An uncertain upload response now triggers one bounded, authenticated list/read-back check for the same file ID, name, size and exact bytes before reporting failure. It does not submit another upload or create another post. Explicit validation/access denials remain errors, as do missing files, failed reads and different bytes. The remaining warning accurately says the files could not be confirmed. The original user's PNG and DOCX were both downloaded successfully, and the original upload run showed successful Create_Upload, New_Upload_Result and Return_Result actions; the exact original browser response failure is not asserted because sensitive action data is masked.

All 1,109 frontend tests, production build and desktop/mobile fault-injection checks passed. The deployed fix also passed an isolated authenticated-browser test using the two existing files: simulated HTTP 202 upload acknowledgements recovered through real authenticated list/view operations and exact byte comparison, with no real post or upload writes. See [confirmation recovery evidence](alm/activity-upload-confirmation-hosted.json) and [deployment readback](alm/activity-upload-confirmation-uat-deployment.json). The upload flow, permissions, post layout and comments were unchanged by this fix.

On 13 November 2026, the reported warning on Activity Channel was traced to the saved content of a Test User 12 activity created on 29 October at 08:03 UTC. The live page had no active alerts or runtime errors. Feed/comments succeeded, all seven posts had successful attachment-list responses, and the three files on that activity (PNG, PDF and DOCX) were fetched with matching byte sizes. No application correction or post-content change was required. The latest reviewed SPA was rebuilt and redeployed to the approved Test/UAT site; 1,164 tests passed, exact asset readback matched, and all protected metadata was preserved. Post-deployment checks passed. Production and business records were unchanged. See [review and redeployment evidence](alm/2026-11-13-activity-channel-uat-review-deployment.json).
