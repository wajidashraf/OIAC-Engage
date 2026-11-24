# Activity post reference UI implementation plan

**Goal:** Match the supplied activity composer and posted media/document references while preserving comments and the verified flow.

**Architecture:** Add pure file presentation helpers, a cancellable private-file resource hook, a scoped preview dialog and gallery/document presenters. Retain post-save/upload orchestration. Add activity-only composer action/help slots so comments retain their original rendering.

**Constraints:** Same endpoint, payload, limits and retry identities; no backend or discussion changes; no guessed PDF page counts; no public file URLs or new dependencies. Work in the shared app and preserve existing dirty files. Keep deployment artifacts private.

- [x] Inspect current composer, attachment cards, tests, styles and the user's reference layouts.
- [x] Record protected source hashes and download a fresh Test/UAT code-site baseline.
- [x] Write failing tests for Photo/Document buttons, shared selection chips, lazy document preview, photo galleries and preview lifecycle.
- [x] Implement file badges/metadata formatting and the activity-only composer toolbar/chips.
- [x] Implement private-content request reuse, modal keyboard/focus behavior, photo collage and document rows; preserve stale-request guards.
- [x] Align post header and scoped styling with references; leave discussion sources/styles unchanged.
- [x] Run focused/full regressions, build and desktop/mobile visual/accessibility checks; fix review findings.
- [x] Deploy to the already-authorized Test/UAT site using fresh download-code-site metadata; compare exact assets and protected metadata.
- [x] Verify the new controls, preview/download actions and existing comments in the signed-in browser. Update evidence and report the result.

Verified on 28 October 2026: 1,096 tests across 87 files, production build, full Chromium at 1440/390 px, zero scoped WCAG A/AA violations, both native file pickers, mixed-post retry/reload, 1/2/5-photo layouts and hidden-photo navigation, lazy native PDF preview and cached download. Independent review found a cancelled pending-cache ownership issue; a failing StrictMode regression reproduced it and now passes with cancellation-aware entries.

PAC upload-code-site succeeded. Fresh readback matched both built JS/CSS hashes and preserved all 155 checked metadata files and five protected source files. Authenticated hosted checks used the existing marked UAT post; both pickers, chips, full-size photo, PDF preview and exact text download passed without new records/uploads. Evidence: [deployment](../../alm/activity-post-reference-ui-uat-deployment.json), [hosted checks](../../alm/activity-post-reference-ui-hosted.json). Private screenshots/logs: `.superpowers/activity-post-ui/`.
