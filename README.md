# ICA Client SDK for TypeScript

This SDK allows frontend developers using React or React Native to interact with `dataspace-ica-ts` services for PDF verification, VC/VP management, DIDComm messaging, and organization `did:web` document creation.

## Index

- [Installation](#installation)
- [Configuration](#configuration)
  - [How `baseUrl` is resolved](#how-baseurl-is-resolved)
  - [React (Vite) environment](#react-vite-environment)
- [Usage](#usage)
- [Current Rules](#current-rules)
- [V2 Binding](#v2-binding)
- [Organization Offboarding](#organization-offboarding)
- [Verify Response Shape](#verify-response-shape)
- [Features](#features)
- [Testing](#testing)
- [Shared Utilities](#shared-utilities)
- [Backend Auth (Node/Backend)](#backend-auth-nodebackend)

## Installation

```bash
npm install ica-client-sdk-ts
```

## Configuration

### How `baseUrl` is resolved

The SDK resolves ICA URL in this order:

1. `new IcaClient({ baseUrl: ... })`
2. `process.env.ICA_BASE_URL`
3. `http://localhost:3310`

For browser apps, the recommended and most reliable approach is to always pass `baseUrl` explicitly in the `IcaClient` constructor.

### React (Vite) environment

Use a single environment variable in your React app:

```bash
VITE_ICA_BASE_URL=http://localhost:3310
```

Initialize the SDK with that value:
```ts
const client = new IcaClient({
  sector: Sector.HealthCare,
  didWeb: 'did:web:ica',
  baseUrl: import.meta.env.VITE_ICA_BASE_URL,
  organizationVcs: [],
  crypto: globalThis.crypto
});
```
### SDK local default (Node/test/reference)

The repository includes:

```bash
ICA_BASE_URL=http://localhost:3310
```

This variable is used only if you do not provide `baseUrl` explicitly.

If your runtime does not expose `globalThis.crypto`, inject a compatible
implementation through `IcaClientConfig.crypto`. The SDK uses it only for
secure UUID generation.

## Usage

```typescript
import { IcaClient, Sector } from 'ica-client-sdk-ts';

const client = new IcaClient({
  sector: Sector.HealthCare,
  didWeb: 'did:web:ica',
  baseUrl: import.meta.env.VITE_ICA_BASE_URL,
  organizationVcs: [], // If registered
  crypto: globalThis.crypto
});

client.setControllerMessageSigningPublicKey('ES384', 'controller-msg-es384-001', {
  kty: 'EC',
  crv: 'P-384',
  x: '<msg-x>',
  y: '<msg-y>'
});

client.setOrgCredentialSigningPublicKey('ES384', 'org-cred-es384-001', {
  kty: 'EC',
  crv: 'P-384',
  x: '<cred-x>',
  y: '<cred-y>'
});

// Set VP token (signed by frontend)
client.setVpToken(signedVpToken);

// Verify terms PDF
const { thid, location } = await client.verifyTerms(pdfBytesOrLink, {
  mediaType: 'application/pdf'
});

// If the signed PDF/certificate does not expose the representative email and
// the BFF needs ICA to include representative credentialSubject.sameAs, the
// BFF must send it explicitly during verifyTerms().
//
// Production/strict recommendation:
// - put the value in the signed annex as `person.email`
// - let ICA derive the canonical `credentialSubject.sameAs = urn:multibase:z...`
//   from that plain email
//
// Demo/local fallback:
// - send `legalRepresentativePayload.email` or `.sameAs`
// - if you send `.sameAs` for an email-based identity, use the canonical
//   `urn:multibase:z...` value, not `mailto:...`
await client.verifyTerms(pdfBytesOrLink, {
  mediaType: 'application/pdf',
  legalRepresentativePayload: {
    email: 'controller@example.org'
  }
});

// The SDK sends FAPI-style request envelopes with:
// - jti: request identifier
// - thid: thread identifier
// For new ICA requests, thid is generated and equals jti.
// The attachment.id is generated as a UUID by default.

// Poll for result.
// The returned object follows the same shape as dataspace-ica-ts OpenAPI
// for POST /terms/pdf/contract/_verify-response.
const verifyResponse = await client.pollVerifyTermsResponse(thid);

// Important:
// - ICA does not infer this email from the BFF login/registration by itself
// - if the BFF does not send it and the signed PDF/certificate does not carry
//   it either, ICA has no representative email to map into the VC
// - the payload fallback above is a demo/local convenience and should not
//   replace signed `person.email` evidence in production

// v2 bootstrap helpers:
// - organization public/private JWK live outside resource on the organization entry
// - controller public JWK lives outside resource on the legal representative entry
const organizationKeyMaterial = client.getOrganizationKeyMaterialFromVerifyResponse(verifyResponse);
const controllerBindingPublicKey = client.getControllerBindingPublicKeyFromVerifyResponse(verifyResponse);

// Get VC JWT attachments from the DIDComm response
const { organizationVC, legalRepresentativeVC, allVcs } = client.getVcsFromResponse(verifyResponse);

// Get the credential objects from verify-response body.data[].resource
const organizationCredential = client.getOrganizationCredentialFromVerifyResponse(verifyResponse);
const legalRepresentativeCredential = client.getLegalRepresentativeCredentialFromVerifyResponse(verifyResponse);
// Get structured credentialSubject info using schema.org-style shapes
const organizationInfo = client.getOrganizationInfoFromVerifyResponse(verifyResponse);
const legalRepresentativeInfo = client.getLegalRepresentativeInfoFromVerifyResponse(verifyResponse);

console.log(organizationInfo?.legalName);
console.log(organizationInfo?.taxID);
console.log(organizationInfo?.address?.addressCountry);
console.log(legalRepresentativeInfo?.givenName);
console.log(legalRepresentativeInfo?.familyName);
console.log(legalRepresentativeInfo?.identifier); // National ID
// - meta.jws.protected.jwk is the controller/message-signing key
// - the organization credential-signing key is sent as an extra JWK attachment
//   during verifyTerms() if setOrgCredentialSigningPublicKey() is configured
// - if the organization key was ICA-generated in _verify (keySource=generated),
//   _create must send organization.publicKeyJwk again as explicit confirmation

const { thid: createThid } = await client.createOrgDidDocument({
  organization: {
    identifier: 'did:web:globaldatacare.es:animal-care:organization:taxid:VATES-B00000000',
    publicKeyJwk: organizationKeyMaterial.publicKeyJwk,
    jwks: {
      keys: [
        {
          kid: 'org-didcomm-enc-001',
          kty: 'EC',
          crv: 'P-384',
          x: '<org-enc-x>',
          y: '<org-enc-y>',
          use: 'enc',
          purposes: ['didcomm-enc']
        }
      ]
    }
  },
  controller: {
    sameAs: 'urn:multibase:zControllerHash',
    publicKeyJwk: controllerBindingPublicKey,
    jwks: {
      keys: [
        {
          kid: 'controller-didcomm-sign-001',
          kty: 'EC',
          crv: 'P-384',
          x: '<controller-sign-x>',
          y: '<controller-sign-y>',
          use: 'sig',
          purposes: ['didcomm-sign']
        }
      ]
    }
  }
});
const createResponse = await client.pollCreateOrgDidDocumentResponse(createThid);

const { thid: derivedThid } = await client.createOrgDidDocumentFromVcs({
  organizationVC: organizationCredential,
  legalRepresentativeVC: legalRepresentativeCredential,
  organizationPublicKeyJwk: organizationKeyMaterial.publicKeyJwk,
  controllerPublicKeyJwk: controllerBindingPublicKey
});
const derivedCreateResponse = await client.pollCreateOrgDidDocumentResponse(derivedThid);


// Prepare DIDComm message
const message = client.prepareDidCommRequest('type', body, attachments);
client.includeVpTokenInMessage(message);
client.includeFileInMessage(message, fileBytes, 'application/pdf', 'file-id');
```

## BFF demo fallback for representative email

If the BFF wants ICA to include representative `credentialSubject.sameAs` in
the returned VC, and the signed PDF/certificate does not already carry that
contact value, the BFF may send it explicitly during `verifyTerms(...)`.

Important scope:

- this fallback is only for `demo/local` ICA mode
- production should prefer signed `person.email` in the PDF annex
- ICA does not infer this email from the BFF login/session automatically
- representative proof is two-dimensional:
  - `credentialSubject.sameAs` for public identity continuity
  - `credentialSubject.hasCredential.material` for controller signing-key continuity
- production-grade VCs should ideally carry both dimensions

Canonical input rules:

- if the BFF has the raw email, send it as `legalRepresentativePayload.email`
- if the BFF already has the canonical hashed alias, send it as
  `legalRepresentativePayload.sameAs`
- for email-based identity, canonical `sameAs` is `urn:multibase:z...`, not
  `mailto:...`

Step by step:

1. Prefer putting `person.email` in the signed PDF annex so ICA can derive the representative `sameAs` from signed evidence.
2. If demo/local onboarding does not have that email in the PDF or certificate, send `legalRepresentativePayload.email` during `verifyTerms(...)`.
3. If the BFF already computed the canonical hash, send `legalRepresentativePayload.sameAs` instead.
4. Expect production-grade ICA responses to carry both `credentialSubject.sameAs` and `credentialSubject.hasCredential.material`.

Example:

```ts
await client.verifyTerms(pdfBytesOrLink, {
  mediaType: 'application/pdf',
  legalRepresentativePayload: {
    email: 'controller@example.org'
  }
});
```

Equivalent explicit `sameAs` example:

```ts
await client.verifyTerms(pdfBytesOrLink, {
  mediaType: 'application/pdf',
  legalRepresentativePayload: {
    sameAs: 'urn:multibase:zControllerHash'
  }
});
```

## Current Rules

- `_verify` is still the onboarding verification step; it is not the place to add new organization keys after onboarding.
- `_create` is the current step that publishes the organization DID document.
- Treat the onboarding/message-signing key separately from VC-signing keys.
- For organization VC signing, prefer `ES384` as the primary VC-signing key in `organization.publicKeyJwk`.
- If Pontus-X compatibility is needed, publish `ES256K` as an additional key in `organization.jwks.keys[]`, not as the primary key.
- The same key-model should be reused later for employee DID documents and employee keys.

Recommended SDK usage:

- `setControllerMessageSigningPublicKey(alg, kid, jwk)` for controller onboarding/message binding
- `setOrgCredentialSigningPublicKey(alg, kid, jwk)` to send the organization public JWK attachment in `_verify`
- in `_create`, explicit `controller.publicKeyJwk` and `organization.publicKeyJwk` are still valid for v1 compatibility when no stored binding/bootstrap key exists yet
- if `_verify` already stored the controller binding, an explicit `controller.publicKeyJwk` in `_create` must match it exactly
- if `_verify` already stored the organization key, an explicit `organization.publicKeyJwk` in `_create` must match it exactly
- if `_verify` returned `keySource: "generated"`, pass back `organizationKeyMaterial.publicKeyJwk` to `_create` as confirmation before publishing the DID document

## V2 Binding

The v2 onboarding flow binds the controller message-signing key during `_verify` using `meta.jws.protected.jwk`.

That key is for onboarding/message authorization. It is not automatically the same key that will sign VCs for SMART-on-FHIR, EUDI Wallet, or Pontus-X.

The organization credential-signing key is separate:

- send it as an extra `application/jwk+json` attachment in `_verify`, or
- let ICA autogenerate `ES384` and read the returned `publicKeyJwk/privateKeyJwk` from `_verify-response`

Important security rule:

- the initial onboarding transaction can bind the first organization key,
- reusing the same contract to bind a different key must be rejected,
- post-onboarding key addition or rotation must use a dedicated key-management endpoint, not `_verify`.
- if `_verify` already bound a controller key, `_create` cannot replace it.
- if `_verify` already stored an organization key, `_create` cannot replace it.
- if ICA generated the organization keypair in `_verify`, the caller must keep it and confirm the same `publicKeyJwk` in `_create`.

Today, the SDK can already transport both:

- `meta.jws.protected.jwk` for the controller key
- the organization public JWK attachment for the organization credential key

## Organization Offboarding

Organization offboarding should not use the current network credential `_revoke` endpoint.

For organization lifecycle, the intended business endpoint is:

```text
POST /ica/cds-{jurisdiction}/v1/{sector}/terms/pdf/{resourceType}/_remove
POST /ica/cds-{jurisdiction}/v1/{sector}/terms/pdf/{resourceType}/_remove-response
```

Intended semantics:

- the organization no longer accepts those terms
- the organization is removed from the active catalog
- the organization DID document is removed from active publication
- organization keys are revoked/deactivated
- a later return requires a full new onboarding cycle (`_verify` -> `_create`)

Authorization model:

- didactic mode: controller key may still travel as `meta.jws.protected.jwk`
- hardened mode: request should be real `didcomm-signed`, optionally wrapped in `didcomm-encrypted`

Important:

- this is different from `network/credentials/{credentialType}/_revoke`
- `network ... _revoke` is for credential lifecycle
- `terms ... _remove` is for organization participation / accepted-terms lifecycle

The SDK now exposes:

- `removeOrganizationTerms()`
- `pollRemoveOrganizationTermsResponse()`

Frontend method pair for offboarding:

1. call `removeOrganizationTerms()`
2. then poll with `pollRemoveOrganizationTermsResponse()`

For local manual testing today, the realistic flow is:

1. `_verify`
2. `_create`
3. `_remove`

The full organization offboarding cycle is:


Example:

  y: '<y>'
});

const removeResponse = await client.pollRemoveOrganizationTermsResponse(removeJob.thid);
```

If the organization is created again after `_remove`, the same pair is used again to confirm a second full cycle:

```ts
const secondRemoveJob = await client.removeOrganizationTerms({
  organization: {
    identifier: 'did:web:globaldatacare.es:animal-care:organization:taxid:VATES-B42215152',
    taxID: 'VATES-B42215152'
  },
  reason: 'organization-requested-removal'
});

const secondRemoveResponse = await client.pollRemoveOrganizationTermsResponse(secondRemoveJob.thid);
```

## Verify Response Shape

`pollVerifyTermsResponse()` returns the DIDComm envelope documented by `dataspace-ica-ts` for `_verify-response`:

```typescript
type VerifyResponse = {
  thid?: string;
  attachments?: Array<{
    id?: string;
    format?: string;
    resourceType?: 'Bundle';
    type?: 'batch-response';
    total?: number;
        status?: string;
      };
      resource?: {
        type?: string[];
        credentialSubject?: Record<string, unknown>;
      };
    }>;
  };
};
```

- `getVcsFromResponse(response)`
- `getLegalRepresentativeCredentialFromVerifyResponse(response)`
- `getOrganizationInfoFromVerifyResponse(response)`
Using the `dataspace-ica-ts` OpenAPI example, the main fields come from:

- `response.body.data[1].resource.credentialSubject.familyName`
- `response.body.data[1].resource.credentialSubject.identifier`

## Features


## Testing

Run tests against local ICA instance:

```bash
npm test
```

Ensure ICA is running on port 3310.

## Shared Utilities

The SDK re-exports shared DIDComm utilities from `gdc-common-utils-ts`:

```typescript
import { prepareDidCommRequest, includeVpTokenInMessage, includeFileInMessage, getThidFromMessage, getDataResults } from 'ica-client-sdk-ts';
```

These utilities already live in `gdc-common-utils-ts` and are also re-exported by other SDKs such as `dataconv-client-sdk-ts`.

If you want to depend on the common base module directly, import them from `gdc-common-utils-ts/utils/didcomm`.

## Backend Auth (Node/Backend)

This SDK includes ICA backend-auth helpers for the custom async profile `identity-exchange.v1`:

- `controllerExchange(...)` + `pollControllerExchangeResponse(...)`
- `createApiKey(...)`, `disableApiKey(...)`, `removeApiKey(...)`, `searchApiKeys(...)`
- `createApiKeyRules(...)` (atomic policy helper: one rule entry per authorization rule)
- `pollApiKeyActionResponse(thid, bearerToken, action)`
- `identityDcr(...)`, `pollIdentityDcrResponse(...)`
- `identityDcrWithBinding(...)` (parameter-first DCR helper)
- `identityCode(...)`, `pollIdentityCodeResponse(...)`
- `identityToken(...)`, `pollIdentityTokenResponse(...)`
- `identityExchange(...)`, `pollIdentityExchangeResponse(...)`
- `runBackendAuthFlow(...)` for DCR + PKCE + exchange orchestration

Notes:

- `identity-exchange.v1` is ICA custom flow: `/_dcr -> /_code -> /_token -> /_exchange` (all async submit/poll).
- SMART Backend Services (`client_credentials + private_key_jwt`) is a separate OAuth profile.
- `_dcr` in this section is backend technical identity binding (`client_id` + technical JWK). It is not the human controller VP/Clearing House flow.
- For `identity-exchange.v1`, runtime `client_id` is still required by `_code/_token/_exchange`.
- API key provisioning policy is atomic: each `data[].resource` is one authorization rule.
  - `instrument` (ODRL policy object, recommended),
  - optional expiry.

How `meta.jws.protected` should be handled depends on transport profile:

1. `didcomm-plain`:

2. `didcomm-signed`:
- JWS protected header is produced by the signing layer,
- client business API should not manually inject `meta.jws.protected`.

3. `didcomm-encrypted` (with nested JWS):
- outer JWE/JWS headers are produced by cryptographic envelope handling,
- business methods should pass key/material parameters and let envelope tooling generate headers.

Current implementation status:
- Backend-auth methods in this SDK currently target `application/didcomm-plain+json`.
- `identityDcrWithBinding(...)` is implemented for parameter-first DCR input.
- Signed/encrypted envelope generation is still handled outside these backend-auth methods.

### Parameter-First Inputs (audit contract)

For backend identity flows, prefer explicit variables over raw JSON blobs:

- `clientId`
- `bearerToken`
- `codeVerifier`
- `codeChallengeMethod` (`S256` default)
- `controllerSigAlg` (example `ES384`)
- `controllerSigKid`
- `controllerSigPublicJwk`
- `transportProtection` (`plain` | `signed` | `encrypted`)

These variables define intent. Envelope/meta serialization should be generated by SDK crypto/envelope helpers according to `transportProtection`.

Minimal identity flow example:

```ts
const dcrSubmit = await client.identityDcr('<api-key-value>', {}, {
  bearerToken: '<controller-access-token>',
  meta: {
    jws: {
      protected: {
        alg: 'ES384',
        jwk: { kty: 'EC', crv: 'P-384', x: '<x>', y: '<y>' }
      }
    }
  }
});
await client.pollIdentityDcrResponse(dcrSubmit.thid, '<controller-access-token>');

const codeSubmit = await client.identityCode({
  client_id: '<api-key-value>',
  code_challenge: '<pkce-s256-challenge>',
  code_challenge_method: 'S256'
}, { bearerToken: '<controller-access-token>' });
const codeResponse = await client.pollIdentityCodeResponse(codeSubmit.thid, '<controller-access-token>');
```

Parameter-first DCR helper (implemented):

```ts
await client.identityDcrWithBinding({
  clientId: '<api-key-value>',
  bearerToken: '<controller-access-token>',
  controllerSigAlg: 'ES384',
  controllerSigKid: 'controller-es384-001',
  controllerSigPublicJwk: { kty: 'EC', crv: 'P-384', x: '<x>', y: '<y>' },
  transportProtection: 'plain'
});
```

### Backend Onboarding Variants

For security audits, keep these two variants explicit:

1. Controller-led provisioning:
- A human controller authenticates in ICA and creates backend API keys (`/_create`).
- The controller executes `_dcr` using backend public key material provided out-of-band.
- Backend starts in pre-bound mode and should skip `_dcr` if binding is already `bound`.

2. Backend-led binding (same API contract):
- The controller still authorizes API key issuance, but backend performs `_dcr` itself through the SDK.
- No human VP token is required inside `_dcr`; `_dcr` is technical key binding for backend identity.

After binding is `bound`, runtime token issuance uses `_code -> _token -> _exchange` for `identity-exchange.v1`.

`runBackendAuthFlow(...)` now supports DCR execution policy:

- `dcrMode: "force"` (default): always run `_dcr`.
- `dcrMode: "skip"`: skip `_dcr` explicitly.
- `dcrMode: "auto"`: skip `_dcr` when known/observed binding is `bound`.

## Roadmap and Briefing
- `BRIEFING_DATASPACE_EN.md`
- `TODO_ROADMAP.md`
