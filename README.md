# ICA Client SDK for TypeScript

This SDK allows frontend developers using React or React Native to interact with `dataspace-ica-ts` services for PDF verification, VC/VP management, DIDComm messaging, and organization `did:web` document creation.

## Installation

```bash
npm install ica-client-sdk-ts
```

## Configuration

Set environment variables:

```bash
ICA_BASE_URL=http://localhost:3310
```

If your runtime does not expose `globalThis.crypto`, inject a compatible
implementation through `IcaClientConfig.crypto`. The SDK uses it only for
secure UUID generation.

## Usage

```typescript
import { IcaClient, Sector } from 'ica-client-sdk-ts';

const client = new IcaClient({
  sector: Sector.HealthCare,
  didWeb: 'did:web:ica',
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
const controllerKeyMaterial = client.getControllerKeyMaterialFromVerifyResponse(verifyResponse);

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
//   publicKeyJwk/privateKeyJwk in verify-response
// - _create can later override the organization key by sending another
//   organization.publicKeyJwk explicitly

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
    publicKeyJwk: controllerKeyMaterial.publicKeyJwk,
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
  controllerPublicKeyJwk: controllerKeyMaterial.publicKeyJwk
});
const derivedCreateResponse = await client.pollCreateOrgDidDocumentResponse(derivedThid);

// v2 onboarding binding:
// setControllerMessageSigningPublicKey() populates meta.jws.protected.jwk automatically.
// setOrgCredentialSigningPublicKey() adds an organization public JWK attachment automatically.
await client.verifyTerms(pdfBytesOrLink, {
  mediaType: 'application/pdf'
});

// You can still override the message meta explicitly when needed.
await client.verifyTerms(pdfBytesOrLink, {
  mediaType: 'application/pdf',
  meta: {
    jws: {
      protected: {
        alg: 'ES384',
        kid: 'org-msg-es384-override',
        jwk: { kty: 'EC', crv: 'P-384', x: '<x>', y: '<y>' }
      }
    }
  }
});

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
- `setOrgCredentialSigningPublicKey(alg, kid, jwk)` to send the organization public JWK attachment in `_verify`, and also as `_create` fallback when you want explicit override
- explicit request payload values still override SDK defaults

## Planned V2 Binding

The planned v2 onboarding flow binds the controller message-signing key during `_verify` using `meta.jws.protected.jwk`.

That key is for onboarding/message authorization. It is not automatically the same key that will sign VCs for SMART-on-FHIR, EUDI Wallet, or Pontus-X.

The organization credential-signing key is separate:

- send it as an extra `application/jwk+json` attachment in `_verify`, or
- let ICA autogenerate `ES384` and read the returned `publicKeyJwk/privateKeyJwk` from `_verify-response`

Important security rule:

- the initial onboarding transaction can bind the first organization key,
- reusing the same contract to bind a different key must be rejected,
- post-onboarding key addition or rotation must use a dedicated key-management endpoint, not `_verify`.

Today, the SDK can already transport both:

- `meta.jws.protected.jwk` for the controller key
- the organization public JWK attachment for the organization credential key

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
