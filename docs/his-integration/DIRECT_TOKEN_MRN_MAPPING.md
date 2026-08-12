# Direct Token → MRN Mapping (Manual Entry Flow)

Replaces the live Registration Assistant iframe/widget flow for HIS
installations that would rather have the registrar type the token number
directly on the existing HIS registration screen. Uses the *same* backend
that already powers the widget (`RegistrationService.mapPatient()`) — this
doc only covers the two calls HIS needs to make and how to authenticate.

## 1. What changes on the HIS registration page

- Add a **Token Number** text field to the registration form (the number
  the patient was already given by the kiosk/counter).
- Optional but recommended: validate it as soon as the registrar tabs out
  of the field (see §3, `GET .../state`), showing a small "✔ Token found"
  / "✘ Invalid token" indicator next to it — catches typos before the
  registrar finishes the rest of the form.
- On successful Save (after HIS has generated the MRN), call
  `POST /token/map/patient` (see §4) with the token number + MRN. That's
  the entire integration.

No iframe, no postMessage, no reservation/heartbeat loop.

## 2. Authentication

**Browser-side, via a workstation session token — no HIS backend code, no
credential embedded in the page.** This reuses the exact mechanism the
(now-retired) popup/panel integration always used to call HDSP without a
human login: one physical counter/browser is configured once against a
branch/location/counter (`POST /token/workstation/:workstationId`), and
that configuration mints a 12h session token scoped to *only* that
workstation's own context — see `WorkstationController`/`WorkstationService`
and `JwtStrategy`'s `type: 'workstation'` handling.

`PatientRegistration_HDSP.xhtml`'s script (`hdspEnsureSession()`) bootstraps
this on page load:

1. Reads/creates an opaque `HDSP_WORKSTATION_ID` in `localStorage` (not a
   credential — a client-generated correlation key).
2. `GET /api/v1/token/workstation/:workstationId`. If not yet configured,
   shows a small one-time inline picker (Branch → Location → Counter, built
   from the already-public `options/*` endpoints) and saves it.
3. Stores the returned `sessionToken` in memory and reuses it as
   `Authorization: Bearer <sessionToken>` for both the validate (§3) and
   register (§4) calls, re-bootstrapping a few minutes before its 12h
   expiry.

This was chosen over a server-side `his-integration` service account
specifically because **nothing embedded in browser-readable JavaScript
should be a general-purpose credential** — a workstation session token only
ever authorizes its own already-configured branch/location/counter, so even
if read out of dev tools it cannot act as any other workstation or branch.
A permanent HDSP user login, by contrast, would need to live somewhere
server-side to stay safe, and this integration deliberately keeps zero Java
backend code on the HIS side (consistent with every earlier version of this
integration — see `POPUP_INTEGRATION_ARCHITECTURE.md`).

Audit attribution still identifies the real registrar, not just "workstation":
`hdspReadHisUsername()` reads the already-rendered HIS username out of the
page header and sends it as `registeredByHisUser` on the `map/patient` call
(see §4) — `mapping_audit_log.actor` and `token_records.registration_user`
record that value when present, falling back to the workstation's own
identity only if HIS's username element can't be found on a given theme.

*(A migration, `1783480000000-AddRegistrationViewActionPermissions`, still
creates a locked, unused-by-default `his-integration` service account with
`TOKEN:REGISTRATION:VIEW`/`ACTION` — that migration also fixes a real,
independent permission-seeding gap in `RegistrationController`, unrelated to
this integration's auth choice. The account remains available if some future
integration genuinely needs a server-to-server credential; this xhtml does
not use it.)*

## 3. Validate a token (optional, on-blur)

```
GET /api/v1/token/registration/:tokenNumber/state
Authorization: Bearer <jwt>
```

Response:

```json
{
  "tokenRecord": {
    "id": "b1e6c2b0-...-uuid",
    "fullToken": "R-042",
    "tokenNumber": 42,
    "status": "WAITING",
    "branchId": "BRANCH_001",
    "issuedAt": "2026-07-09T09:30:00.000Z"
  },
  "mapping": null,
  "reservation": null
}
```

- `tokenRecord: null` behavior → HTTP 404 if the token doesn't exist at all.
- `mapping` non-null → token already registered to a patient; block Save
  with "Token already registered" (mirrors the widget's own
  `TOKEN_ALREADY_MAPPED` check in §4).
- **`tokenRecord.id` is the token's permanent internal UUID** — store this
  alongside the display `tokenNumber` (see note in §5). It never changes
  even if display numbers are reused across days.

## 4. Register the mapping (on Save)

```
POST /api/v1/token/registration/map/patient
Authorization: Bearer <workstation session token>
Content-Type: application/json

{
  "tokenNumber": "R-042",
  "hisPatientId": "<HIS internal patient PK>",
  "mrn": "10023891",
  "patientName": "Jane Doe",
  "visitId": "<optional, if a visit already exists>",
  "registeredByHisUser": "<HIS username read from the page header, if found>"
}
```

Success → `201 Created`, body is the created `token_patient_mapping` row
(includes `tokenRecordId`, `mappedAt`, etc).

This one call, server-side:

1. Validates the token exists and isn't already `REGISTERED`.
2. Ensures no existing mapping for that token (`DUPLICATE_PATIENT_MAPPING`
   if there is).
3. Inserts `token_patient_mapping` (`mapped_by` = `registeredByHisUser` when
   provided, else the workstation's own identity).
4. Sets `token_records.status = 'REGISTERED'` (`registration_user` = same
   value as `mapped_by` above).
5. Writes an audit row to `mapping_audit_log` (`actor` = same value; the
   technical caller is preserved separately in the audit payload/mapping
   metadata as `authenticatedAs` whenever it differs from `actor`).

All in one transaction — it either fully succeeds or fully rolls back.

Failure responses to handle:

| Status | Body error             | Meaning                                  |
|--------|-------------------------|-------------------------------------------|
| 404    | —                       | Token number doesn't exist               |
| 409    | `TOKEN_ALREADY_MAPPED`  | Token already registered to a patient    |
| 409    | `DUPLICATE_PATIENT_MAPPING` | Race: mapping created between validate and register |

For 409s, surface "This token has already been used for registration —
please issue a new token" to the registrar rather than retrying silently.

## 5. Downstream lookup (Pharmacy, Loyalty, Feedback, Forms, ...)

Any other HDSP module that only has the MRN can resolve the current
token/registration context:

```
GET /api/v1/token/registration/mapping/by-mrn/:mrn
Authorization: Bearer <token>   (TOKEN:REGISTRATION:VIEW -- any authenticated
                                  caller works: a normal HDSP user session in
                                  another module's UI, or a workstation
                                  session token)
```

Returns the most recently mapped `token_patient_mapping` row for that MRN
(404 if none exists). This is new — added specifically so Pharmacy etc.
don't need to re-implement their own token/MRN resolution.

## 6. Why keep `tokenId` alongside `tokenNumber`/`mrn`

`tokenNumber` (the display value like `R-042`) resets and is reused daily.
If HIS only stores `tokenNumber` + `mrn`, a query next week for "R-042"
is ambiguous across visit dates. `tokenRecord.id` (from §3's response) is
a UUID, permanent, and never reused — store it in HIS's own local record
of the registration if HIS keeps one, even though HDSP's own tables
already key everything off it internally.

## 7. What's intentionally unchanged, and what was removed

- `RegistrationService`, `TokenPatientMapping`, `MappingAuditLog`, and
  `WorkstationController`/`WorkstationService` are untouched — this design
  calls the exact same `mapPatient()` logic and reuses the exact same
  workstation-token bootstrap the old panel used, just without the
  reservation/heartbeat/capability-token layer in between.
- **Removed, not left in place:** the iframe/panel widget
  (`frontend/src/app/widget/*`), its supporting hooks/API clients
  (`usePanelReservation`, `usePopupReservation`, `useWorkstationSession`,
  `useWidgetAuth`, `useRegistrationWidget`, `registration.api.ts`,
  `workstation.api.ts`, `his-identity.api.ts`, `widget-client.ts`), the
  scoped Tailwind toolchain that only styled it, the `/widget/` entry in
  `AuthProvider`'s public-route allowlist, and the per-route
  `frame-ancestors` CSP header in `next.config.mjs` (now a flat `DENY`
  everywhere, since nothing is framed anymore). No HIS site should still be
  pointing at any `/widget/registration/...` route. See
  `POPUP_INTEGRATION_ARCHITECTURE.md`'s retirement notice for the full list
  of what the old design contained.
