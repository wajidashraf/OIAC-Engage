# Activity post thumbnails implementation plan

**Goal:** Apply the user's post-only border, 350 px photo thumbnails, compact document chips and one-row comment composer while preserving author/admin-only deletion.

**Architecture:** Group post text and attachments inside an accented wrapper in ActivityCard. Restyle the existing photo gallery and replace full-width document rows with filename action chips. Add a Comment-only field/button row to ActivityComposer while retaining shared save/retry logic. Preserve existing services, modal lifecycle, discussion/reply rendering and native permission enforcement. React, TypeScript, scoped CSS and Playwright; no new dependencies.

- [x] Inspect current layout, authorization code and the supplied reference; record the requested design.
- [x] Save protected hashes and take a fresh Test/UAT code-site baseline.
- [x] Add meaningful browser dimension/border assertions and UI capability coverage; demonstrate the current layout fails the new assertions.
- [x] Implement post wrapper, bounded centered thumbnails, document chips and comment input/button row with preserved actions.
- [x] Run affected UI and backend permission tests, production build and desktop/mobile browser checks; inspect screenshots.
- [x] Deploy to the previously authorized Test/UAT site; compare exact assets and protected metadata.
- [x] Verify new layout and real attachment actions in the signed-in browser, record evidence and report completion.

Local validation: all 1,097 frontend tests across 87 files passed; 30 backend SDK behavioral tests passed, including author/admin-only deletion and unrelated-user denial; production build passed with the existing chunk-size advisory. Full Chromium checks at 1440/390 px passed measured post-only accent, thumbnail max dimensions/centering, compact chip badges, comment input/button row, modal/photo navigation, PDF viewer, cached download, retry/reload, no overflow and zero scoped WCAG A/AA violations. Independent review found no further issues.

PAC upload-code-site succeeded in 144.10 seconds. Fresh readback matched both compiled asset hashes and preserved all 155 protected metadata files and nine protected source files. See [deployment evidence](../../alm/activity-post-thumbnails-uat-deployment.json).

Final authenticated runtime checks passed after a temporary workstation connectivity interruption resolved. The existing marked UAT post confirmed measured post-only border, centered thumbnails bounded to 350 px, compact document chips and same-row comment field/button. Full-size image modal, native PDF viewer and exact text-file download passed through the existing real flow. No hosted record was created or deleted. See [hosted evidence](../../alm/activity-post-thumbnails-hosted.json). Private logs/screenshots are in `.superpowers/activity-post-ui/thumbnails/`.
