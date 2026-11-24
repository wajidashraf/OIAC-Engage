# Activity post thumbnails and border revision

The user's latest layout instructions replace the full-width photo collage and document rows. Wrap the post header, body and attachments in one green-accented post section. Keep discussion outside this wrapper with its original plain border and controls.

Display visible photos as horizontally centered, wrapping thumbnails, each at most 350 × 350 pixels and fitting smaller screens. Preserve full image proportions inside the thumbnail. Retain the existing three-photo initial fetch bound, extra-photo indicator and full-size, backdrop modal with keyboard navigation through all photos.

Display documents as wrapping, content-width compact chips matching the latest supplied example, with a small type badge, filename and true size in one row. The latest request replaces the earlier 100 px icon direction. The filename/type area opens PDF preview or downloads other documents; PDF also has an accessible icon-only Download control. Keep existing private retrieval, byte caching and retry behavior.

Post deletion remains restricted by the existing trusted backend capability: the author or a current site Administrator. Verify the UI hides deletion for other users and run the existing backend allow/deny tests; do not broaden roles or change server authorization.

The latest request also changes the top-level comment composer: the comment textarea and Post Comment button share one horizontal row, including mobile. Keep the character counter and errors below this row. Preserve comment validation, uncertain-save retry identities, reply drafts and all discussion rendering. Leave the upload flow, post creation and permissions unchanged. Publish to the previously approved Test/UAT site after tests/build/browser checks, and verify deployed assets and protected metadata.
