# Activity post attachments implementation plan

**Goal:** Add persistent SharePoint files to Activity Channel posts using the user's supplied Test/UAT Power Pages flow.

**Architecture:** A private flow client handles upload/list/view. A post-only wrapper adds file selection and resumable uploads to the existing composer. Post cards fetch private file metadata/content. Extend the existing flow with authenticated, post-scoped SharePoint operations.

**Constraints:** No comment/reply attachments, meeting-report changes, public links, invented caller IDs, schema additions, Production deployment, or changes to unrelated dirty files. Use the current styling. Preserve existing post request identity and confirmed-save behavior.

- [x] Inspect the supplied flow, actual trigger input, current composer/card/service, saved OIAC sign-in and exact Test/UAT identifiers.
- [x] Record the user-authorized scope and design.
- [x] Write failing service tests for the portal payload, CSRF/session headers, list/view validation and uploads.
- [x] Implement activityAttachmentService and expose the existing shared CSRF helper without changing its behavior.
- [x] Write failing UI tests for post-only selection, upload retry without another post, retrieval/rendering and cleanup.
- [x] Implement ActivityPostComposer, ActivityAttachments and scoped styling; integrate with existing composer/card/page.
- [x] Inspect registered flow roles and actual connector references; preserve the original flow, prepare and validate its exact upload/list/view definition.
- [x] Configure the authorized Test/UAT flow using supported authenticated management operations; keep the same trigger URL and original text input.
- [x] Run focused regression tests and production build; independently review changed code and correct findings.
- [x] Deploy the approved frontend to the exact Test/UAT site using fresh download-code-site metadata; read back exact JS/CSS hashes and preserve all 155 checked protected metadata files.
- [x] Initial hosted verification was limited by browser sign-in; this was reported rather than claimed as a pass. Full-Chromium local fixtures passed at 1440 and 390 pixels. Subsequent signed-in verification and corrections are recorded below.

## Hosted upload correction

- [x] Reproduce the user's upload error with a real signed-in portal session; listing also returned a flow-level forbidden response.
- [x] Verify the management/runtime site ID against the exact Test/UAT URL/environment and distinguish it from the Dataverse website record ID. Correct the trigger guard with a failing-then-passing regression check.
- [x] Reuse one marked test activity and stable file identifiers. Inspect the actual upload failure: length received the binary object's type rather than a string/array. Correct size validation with a failing-then-passing regression check.
- [x] Verify real PNG/PDF/TXT uploads, reload retrieval, matching original bytes, and document download in the signed-in portal. No user's existing activity was changed or reposted.
- [x] Remove temporary flow diagnostics, verify exact activated definition readback, and verify same-ID retry returns the original attachment without increasing the count.
- [x] Complete independent review; no remaining concrete blocker reported. Record sanitized management and hosted evidence.
