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

`ICA_BASE_URL` from `.env.example` remains useful for Node/testing scenarios.

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

// The SDK sends FAPI-style request envelopes with:
// - jti: request identifier
// - thid: thread identifier
// For new ICA requests, thid is generated and equals jti.
// The attachment.id is generated as a UUID by default.

// Poll for result.
// The returned object follows the same shape as dataspace-ica-ts OpenAPI
// for POST /terms/pdf/contract/_verify-response.
const verifyResponse = await client.pollVerifyTermsResponse(thid);

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

// Get ICA DID document
const icaDidDoc = await client.getIcaDidDocument();

// Create org DID document from required fields.
// Important:
// - meta.jws.protected.jwk is the controller/message-signing key
// - the organization credential-signing key is sent as an extra JWK attachment
//   during verifyTerms() if setOrgCredentialSigningPublicKey() is configured
// - if no organization key is provided, ICA can autogenerate ES384 and return
//   publicKeyJwk/privateKeyJwk in _verify-response
// - if _verify already stored a controller binding, _create must reuse it;
//   an explicit controller.publicKeyJwk can only be sent if it matches
// - if _verify already stored an organization key, _create cannot override it;
//   an explicit organization.publicKeyJwk can only be sent if it matches
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

// Or derive the organization DID input from the verified credentials
// and rely on the key material returned by _verify
const { thid: derivedThid } = await client.createOrgDidDocumentFromVcs({
  organizationVC: organizationCredential,
  legalRepresentativeVC: legalRepresentativeCredential,
  organizationPublicKeyJwk: organizationKeyMaterial.publicKeyJwk,
  controllerPublicKeyJwk: controllerBindingPublicKey
});
const derivedCreateResponse = await client.pollCreateOrgDidDocumentResponse(derivedThid);

// v2 onboarding binding:
// setControllerMessageSigningPublicKey() populates meta.jws.protected.jwk automatically.
// setOrgCredentialSigningPublicKey() adds an organization public JWK attachment automatically.
await client.verifyTerms(pdfBytesOrLink, {
  mediaType: 'application/pdf'
});

// For normal integrations, do not build meta.jws.protected.jwk manually.
// Use setControllerMessageSigningPublicKey() and let the SDK populate it.

// Prepare DIDComm message
const message = client.prepareDidCommRequest('type', body, attachments);
client.includeVpTokenInMessage(message);
client.includeFileInMessage(message, fileBytes, 'application/pdf', 'file-id');
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

1. `_verify`
2. `_create`
3. `_remove`
4. new `_verify`
5. new `_create`
6. new `_remove`

Example:

```ts
client.setControllerMessageSigningPublicKey('ES384', 'controller-msg-es384-001', {
  kty: 'EC',
  crv: 'P-384',
  x: '<x>',
  y: '<y>'
});

const removeJob = await client.removeOrganizationTerms({
  organization: {
    identifier: 'did:web:globaldatacare.es:animal-care:organization:taxid:VATES-B42215152',
    taxID: 'VATES-B42215152'
  },
  reason: 'organization-requested-removal'
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
    media_type?: string;
    filename?: string;
    data?: {
      json?: {
        format?: string;
        jwt?: string;
      };
    };
  }>;
  body?: {
    resourceType?: 'Bundle';
    type?: 'batch-response';
    total?: number;
    data?: Array<{
      type?: string;
      publicKeyJwk?: Record<string, unknown>;
      privateKeyJwk?: Record<string, unknown>;
      keySource?: 'attachment' | 'generated';
      response?: {
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

The SDK exposes helpers over that structure:

- `getVcsFromResponse(response)`
- `getCredentialsFromVerifyResponse(response)`
- `getOrganizationCredentialFromVerifyResponse(response)`
- `getLegalRepresentativeCredentialFromVerifyResponse(response)`
- `getOrganizationInfoFromVerifyResponse(response)`
- `getLegalRepresentativeInfoFromVerifyResponse(response)`

Using the `dataspace-ica-ts` OpenAPI example, the main fields come from:

- `response.body.data[0].resource.credentialSubject.legalName`
- `response.body.data[0].resource.credentialSubject.taxID`
- `response.body.data[1].resource.credentialSubject.givenName`
- `response.body.data[1].resource.credentialSubject.familyName`
- `response.body.data[1].resource.credentialSubject.identifier`

## Features

- DIDComm messaging with attachments
- VC/VP management (frontend handles signing)
- PDF verification for onboarding
- Extraction helpers for organization and legal representative credential data
- DID document retrieval
- Typed async responses aligned with `dataspace-ica-ts` OpenAPI examples
- Polling for async responses
- Shared utilities for preconversion SDK

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
- `pollApiKeyActionResponse(thid, bearerToken, action)`
- `identityDcr(...)`, `pollIdentityDcrResponse(...)`
- `identityCode(...)`, `pollIdentityCodeResponse(...)`
- `identityToken(...)`, `pollIdentityTokenResponse(...)`
- `identityExchange(...)`, `pollIdentityExchangeResponse(...)`
- `runBackendAuthFlow(...)` for DCR + PKCE + exchange orchestration

Notes:

- `identity-exchange.v1` is ICA custom flow: `/_dcr -> /_code -> /_token -> /_exchange` (all async submit/poll).
- SMART Backend Services (`client_credentials + private_key_jwt`) is a separate OAuth profile.
- `_dcr` in this section is backend technical identity binding (`client_id` + technical JWK). It is not the human controller VP/Clearing House flow.

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
