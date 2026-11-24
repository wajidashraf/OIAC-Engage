# Activity upload confirmation recovery

The reported post `d745090c-c8cf-5359-a88a-c5a5b4f8eca2` has both files in SharePoint. Authenticated reads downloaded its PNG (1,462,990 bytes) and DOCX (17,145 bytes) successfully. The original 07:21:43 UTC run shows Create_Upload, New_Upload_Result and Return_Result succeeded. Sensitive response details remain masked by flow security settings, so the exact original browser HTTP/parse failure is not asserted.

The client currently translates any rejected upload acknowledgement into a definite upload-failure warning, even if the write persisted. Add bounded, read-only reconciliation for uncertain acknowledgements: list the saved post's attachments, match the same file ID/name/size, retrieve its bytes, and compare them exactly with the selected file. Explicit forbidden/validation responses must remain failures. Missing metadata, read errors or different bytes must remain unconfirmed. Do not send another upload during recovery or create another post. Keep the existing stable retry identities and backend permissions.

- [x] Inspect live flow, original run and persisted user files; confirm successful downloads.
- [x] Reproduce uncertain-acknowledgement failure in service tests; cover exact recovery and denial/mismatch cases.
- [x] Implement bounded read-back verification and accurate unconfirmed-upload copy.
- [x] Run appropriate regressions/build and review; save a fresh Test/UAT baseline and protected source hashes.
- [x] Deploy to the previously authorized Test/UAT site, read back exact assets/protected metadata.
- [x] Verify response-loss recovery in an isolated signed-in test tab using existing attachments and intercepted writes; no actual post or file write. Record evidence.

Validation: all 1,109 frontend tests across 87 files and the production build passed. Desktop/mobile Chromium tests simulated a persisted file with an HTTP 202 acknowledgement and confirmed automatic recovery, one post creation, correct reload/preview/download behavior and zero scoped WCAG A/AA violations. Twelve additional service cases cover uncertain acknowledgements, explicit denials and failed/different read-back. Independent review found no actionable issues.

The authenticated hosted test loaded the new compiled build, intercepted the post command and both upload requests in its isolated tab, returned simulated HTTP 202 responses, and allowed only actual authenticated list/view operations through to the backend. Both existing user files matched their downloaded bytes and the composer finished with `Activity and files posted.` and no false warning. No real post or file write occurred. Evidence: [hosted fault-injection/read-back check](../../alm/activity-upload-confirmation-hosted.json), [deployment readback](../../alm/activity-upload-confirmation-uat-deployment.json). Private original snapshots, downloads, run diagnostics and browser logs remain under ignored `.superpowers/activity-post-attachments/upload-confirmation/`.
