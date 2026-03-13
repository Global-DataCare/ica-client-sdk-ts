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

## Usage

```typescript
import { IcaClient, Sector } from 'ica-client-sdk-ts';

const client = new IcaClient({
  sector: Sector.HealthCare,
  didWeb: 'did:web:ica',
  organizationVcs: [] // If registered
});

// Set VP token (signed by frontend)
client.setVpToken(signedVpToken);

// Verify terms
const { thid, location } = await client.verifyTerms(pdfBytesOrLink);

// Poll for result.
// The returned object follows the same shape as dataspace-ica-ts OpenAPI
// for POST /terms/pdf/contract/_verify-response.
const verifyResponse = await client.pollVerifyTermsResponse(thid);

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
console.log(organizationInfo?.url);
console.log(legalRepresentativeInfo?.givenName);
console.log(legalRepresentativeInfo?.familyName);
console.log(legalRepresentativeInfo?.identifier);
console.log(legalRepresentativeInfo?.sameAs);

// Get ICA DID document
const icaDidDoc = await client.getIcaDidDocument();

// Create org DID document from required fields.
// Important: ICA does not know the public JWK of the organization or of the
// legal representative. The frontend must pass both publicKeyJwk values.
// The SDK can read identifier/taxID/url/sameAs from verified credentials,
// but keys must come from the frontend.

const { thid: createThid } = await client.createOrgDidDocument({
  organization: {
    identifier: 'did:web:globaldatacare.es:animal-care:organization:taxid:VATES-B00000000',
    publicKeyJwk: { kty: 'EC', crv: 'P-384', x: '<org-x>', y: '<org-y>' }
  },
  controller: {
    sameAs: 'urn:multibase:zControllerHash',
    publicKeyJwk: { kty: 'EC', crv: 'P-384', x: '<controller-x>', y: '<controller-y>' }
  }
});
const createResponse = await client.pollCreateOrgDidDocumentResponse(createThid);

// Or derive the organization DID input from the verified credentials
// and still provide both public keys explicitly from the frontend
const { thid: derivedThid } = await client.createOrgDidDocumentFromVcs({
  organizationVC: organizationCredential,
  legalRepresentativeVC: legalRepresentativeCredential,
  organizationPublicKeyJwk: { kty: 'EC', crv: 'P-384', x: '<org-x>', y: '<org-y>' },
  controllerPublicKeyJwk: { kty: 'EC', crv: 'P-384', x: '<controller-x>', y: '<controller-y>' }
});
const derivedCreateResponse = await client.pollCreateOrgDidDocumentResponse(derivedThid);

// Prepare DIDComm message
const message = client.prepareDidCommRequest('type', body, attachments);
client.includeVpTokenInMessage(message);
client.includeFileInMessage(message, fileBytes, 'application/pdf', 'file-id');
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

The SDK exports shared utilities for DIDComm messaging that can be reused in other SDKs like preconversion:

```typescript
import { prepareDidCommRequest, includeVpTokenInMessage, includeFileInMessage, getThidFromMessage, getDataResults } from 'ica-client-sdk-ts';
```

These utilities are candidates to be moved to `gdc-common-utils-ts` for broader reuse.
