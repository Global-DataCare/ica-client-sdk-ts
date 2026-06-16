# Changelog

All notable changes to `ica-client-sdk-ts` will be documented in this file.

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
