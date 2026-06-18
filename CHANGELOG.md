# Changelog

All notable changes to `ica-client-sdk-ts` will be documented in this file.

## [2.0.5] - 2026-06-17

### Added
- Added reusable controller-binding helpers built on
  `gdc-common-utils-ts` so callers can:
  - normalize representative `sameAs`
  - derive `credentialSubject.hasCredential.material` from a controller JWK
  - inspect representative binding projections returned by ICA
- Added live local ICA E2E coverage for the three `_verify` binding modes:
  - dedicated controller binding key in
    `body.data[].resource.controller.publicKeyJwk`
  - legacy fallback through `meta.jws.protected.jwk`
  - no controller/legacy JWK transported

### Changed
- `verifyTerms(...)` now sends the controller business/operation-signing key in
  `body.data[].resource.controller.publicKeyJwk` via
  `setControllerBindingPublicKey(...)` or `controllerPayload.publicKeyJwk`.
- Kept `setControllerMessageSigningPublicKey(...)` focused on DIDComm
  communication metadata in `meta.jws.protected`.
- Documented the separation between:
  - communication/profile/device/BFF keys
  - controller business/binding keys
- Updated the public README and JSDoc so confidential apps and BFF portals do
  not confuse transport protection keys with the controller key projected into
  representative `hasCredential.material`.

## [2.0.4] - 2026-06-15

### Added
- Added `createApiKeyRules(...)` as an atomic API key policy helper so one
  authorization rule maps to one `data[].resource` entry with optional ODRL
  policy and expiry.
- Extended `VerifyTermsLegalRepresentativePayload` with documented
  `email`/`sameAs` fallback inputs for demo/local `_verify` flows.

### Changed
- Documented the representative email / `sameAs` contract for BFF callers:
  ICA does not infer the email from BFF login state, production should prefer
  signed `person.email` in the PDF annex, and email-based `sameAs` values use
  canonical `urn:multibase:z...` instead of `mailto:...`.
- Expanded SDK tests to cover:
  - forwarding representative `email` and `sameAs` during `verifyTerms(...)`
  - atomic API key rule submission with ODRL policy payloads
- Refreshed integration and briefing docs so the API key policy model remains
  explicit and the demo-only representative identity fallback is documented.
