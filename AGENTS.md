# AGENTS.md - ICA Client SDK Contributor Guide

## Scope
Guide for contributors working on `ica-client-sdk-ts`.
This SDK currently focuses on DIDComm onboarding flows (`_verify`, `_create`, `_remove`) and helper extraction methods.

## Current Surface (implemented)
- Main client: `src/IcaClient.ts`
- Public exports: `src/index.ts`
- Types: `src/types.ts`
- Tests: `src/__tests__/IcaClient.test.ts`

Implemented request flows:
- `POST /ica/cds-{jurisdiction}/v1/{sector}/terms/pdf/contract/_verify`
- `POST /ica/cds-{jurisdiction}/v1/{sector}/terms/pdf/contract/_verify-response`
- `POST /ica/cds-{jurisdiction}/v1/{sector}/entity/did/document/_create`
- `POST /ica/cds-{jurisdiction}/v1/{sector}/entity/did/document/_create-response`
- `POST /ica/cds-{jurisdiction}/v1/{sector}/terms/pdf/contract/_remove`
- `POST /ica/cds-{jurisdiction}/v1/{sector}/terms/pdf/contract/_remove-response`

Transport pattern:
- POST request returns `202` + `Location`.
- Polling methods call matching `*_response` endpoint.

## Backend Auth Surface (implemented)
The SDK now exposes high-level methods for the ICA backend auth lifecycle:
- organization bootstrap: `/organization/dataspace/auth/_exchange`
- api key lifecycle: `/api-key/org.schema/action/_create|_disable|_remove|_search`
- identity auth: `/identity/auth/_dcr|_code|_token|_exchange`

Critical clarification:
- `_dcr` here is backend technical identity binding (`client_id` + backend public JWK in `meta.jws.protected.jwk`).
- It is not the human wallet VP/Clearing House flow.
- Human/controller authentication and organization trust checks happen before backend API key issuance, not inside `_dcr`.

Reference for exact sequence and contracts:
- `dataspace-ica-ts/docs/backend-auth-migration.md`
- `dataspace-ica-ts/src/api/openapi.ts`
- `dataspace-ica-ts/src/api/managers/backend-auth-request-manager.ts`

## Required Design Rules
- Keep existing API backward-compatible.
- Follow existing async style: submit -> poll response.
- Preserve injectable transports:
  - `httpClient` (axios)
  - `fetch`
- Reuse request helper internals (`request`, `sleep`, retry handling).
- Return typed SDK responses rather than raw `any`.

## Backend Auth Client Methods
- `controllerExchange(...)`
- `pollControllerExchangeResponse(thid)`
- `createApiKey(...)`, `disableApiKey(...)`, `removeApiKey(...)`, `searchApiKeys(...)`
- `pollApiKeyActionResponse(thid)`
- `identityDcr(...)`, `pollIdentityDcrResponse(thid)`
- `identityCode(...)`, `pollIdentityCodeResponse(thid)`
- `identityToken(...)`, `pollIdentityTokenResponse(thid)`
- `identityExchange(...)`, `pollIdentityExchangeResponse(thid)`

Orchestration helper:
- `runBackendAuthFlow(...)` for `_create -> _dcr -> _code -> _token -> _exchange`

## Testing Requirements
When changing auth/transport behavior:
- `npm run build`
- `npm test`
- Add test coverage for:
  - `202 + Location` submit handling
  - polling retries / retry-after behavior
  - terminal success/failure payload mapping
  - content-type compatibility (`application/json` and DIDComm where applicable)

## Docs Requirements
If new methods are added:
- Update `README.md` usage section with end-to-end backend auth example.
- Include endpoint-to-method mapping table.
- Mention dependency on ICA `SECURITY_MODE` behavior for bearer validation.
