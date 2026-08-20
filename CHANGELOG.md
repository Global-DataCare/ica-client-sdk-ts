# Changelog

All notable changes to `ica-client-sdk-ts` will be documented in this file.

## [Unreleased]

- Preserve typed `controllerPayload.did`, `controllerPayload.sameAs` and
  `controllerPayload.jwks` in `_verify`, allowing portals to build the
  controller with the shared `buildProfessionalDidWeb(...)` algorithm instead
  of losing that binding while only the JWK reaches ICA.
- Document that those fields identify the submitted JWK's actual owner. A
  legacy representative JWK must not be labelled with a separately designated
  technical controller, which binds its own key later through the sector flow.

## [2.0.12] - 2026-08-13

- Run Jest against source tests only under Node's ESM VM support, map exported
  Common Utils subpaths to their packaged JavaScript, and retain the packed ESM
  consumer smoke test as a release gate.
- Recognize canonical ICA `ServiceControllerCredential` and
  `ServiceController-verification-v1.0` results while retaining read
  compatibility for `OrganizationControllerCredential`. Controller authority
  is read from schema.org `owner.additionalType`; ISCO stays in
  `owner.hasOccupation.occupationalCategory`.
- Clarify that legacy two-VC responses leave the controller-credential
  collection empty and that transport-level JWK fallback does not promote the
  representative VC to controller authority.
- Expose controller `roleCodes` and `occupationCodes` independently in binding
  projections, including `RESPRSN` and `ISCO-08|1330` from the canonical ICA
  controller credential.

- Add typed extraction for all ICA `OrganizationControllerCredential` service
  VCs, their subjects and VC-JWT attachments. Controller key extraction now
  prefers the dedicated controller entry and falls back to the legacy legal
  representative entry.
- Reuse the common-utils controller response readers when available while
  remaining compatible with older two-credential ICA responses.

## [2.0.11] - 2026-06-24

- Updated dependency target to gdc-common-utils-ts@^2.0.11.


## [2.0.10] - 2026-06-23

- Restored ESM-consumable packaging by publishing explicit `.js` specifiers in
  the built output, declaring `"type": "module"`, and exposing the package
  through `exports`.
- Fixed the SDK entrypoint so DIDComm types are exported as types only instead
  of broken runtime re-exports.
- Added a pack/install/import smoke test that catches published tarballs that
  build locally but fail in a real ESM consumer.

## [2.0.9] - 2026-06-23

- Updated dependency target to gdc-common-utils-ts@^2.0.7.


## [2.0.8] - 2026-06-22

- Documented explicitly that `IcaClientConfig.sector` selects the ICA route
  namespace but does not define the `serviceType` authorizations emitted by
  ICA in the resulting `OrganizationCredential`.
- Added explicit SDK typing for
  `organizationCredential.credentialSubject.makesOffer.{category,serviceType}`
  so `_verify` callers can consume ICA-issued service authorizations without
  relying on opaque dictionary access.

## [2.0.7] - 2026-06-18

- Updated dependency target to gdc-common-utils-ts@^2.0.6.


## [2.0.6] - 2026-06-19

### Changed
- Updated the shared dependency target to `gdc-common-utils-ts@^2.0.6`.

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
