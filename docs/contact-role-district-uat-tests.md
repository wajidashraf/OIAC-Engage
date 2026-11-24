# Portal role and district test results

Test/UAT: https://oiac-engage-test.powerappsportals.com/contact

The existing signed-in Contact received real portal role assignments and active membership combinations. Client roles were never simulated. Original assignments were restored and verified in Dataverse and the browser. No application code or production configuration changed.

| Case | Actual portal roles | Active districts | Expected Contacts | Displayed Contacts | Result |
|---|---|---|---:|---:|---|
| volunteer-one | Volunteer | AL-02 | 4 | 4 | passed |
| volunteer-two | Volunteer | AL-02, AZ-03 | 9 | 9 | passed |
| volunteer-three | Volunteer | AK-01, AL-02, AZ-03 | 15 | 15 | passed |
| volunteer-none | Volunteer | None | 0 | 0 | passed |
| admin-none | Administrators | None | 20 | 20 | passed |
| admin-three | Administrators | AK-01, AL-02, AZ-03 | 20 | 20 | passed |
| admin-staff-volunteer | Staff, Administrators, Volunteer | AL-02 | 20 | 20 | passed |
| staff-one | Staff | AZ-03 | 6 | 6 | passed |
| staff-two | Staff | AK-01, AZ-03 | 12 | 12 | passed |
| applicant-one | Applicant | AK-01 | 7 | 7 | passed |
| staff-volunteer-two | Staff, Volunteer | AL-02, AZ-03 | 9 | 9 | passed |
| applicant-none | Applicant | None | 0 | 0 | passed |
| authenticated-only |  | AK-01, AL-02, AZ-03 | Approval gate | Approval gate | passed |

Contact cases cover case-insensitive email search, exclusion of out-of-district searches, pagination, unique root Contacts, administrator edit-control visibility and the no-district/approval states. Read-only smoke checks for Volunteer, Staff, Applicant and Administrator cover Meeting Reports, My Calendar, Events, Appointments, Press Coverage and Activity Channel. Server checks verify administrator-only appointment/history reads and activity moderation/delete-ownership flags. No business forms were saved and no business records were deleted.

## Observations

- The portal membership lookup returned a previous district while Dataverse and the displayed Contact list reflected the current district. Inference from this observation and the existing frontend gate: a cached empty lookup can delay visibility after membership is reactivated until the cache refreshes.
- The actual session role is Applicant, but the account-menu label says Volunteer.
- No active districts: Contacts are empty, but cached membership data retains the generic empty-list state.

## Restoration

The original Volunteer role association, other-site role links, three active membership records, all 17 membership IDs/links/states and the selected Contact fields match the baseline. The restored live browser shows Volunteer and 15 eligible Contacts. Role definitions are unchanged.

Power Pages caches role and data lookups; assignment changes can require propagation or a supported cache refresh. See [Microsoft’s cache guidance](https://learn.microsoft.com/en-us/power-pages/admin/clear-server-side-cache). Detailed evidence: [contact-role-district-uat-tests.json](alm/contact-role-district-uat-tests.json).

## Suggested follow-up

- Use the actual primary role for the Applicant account label (`src/components/PortalNav.tsx`).
- Return authoritative membership presence from the existing trusted directory API and remove the cached membership lookup gate (`src/features/contacts/useDistrictContacts.ts`). This is a proposed improvement; no application changes were made during this test.

The actual runtime-loaded JavaScript and CSS hashes match the reviewed deployment.
