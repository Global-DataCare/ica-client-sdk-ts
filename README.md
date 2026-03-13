# ICA Client SDK for TypeScript

This SDK allows frontend developers using React or React Native to interact with dataspace-ica-ts services for PDF verification, VC/VP management, and DIDComm messaging.

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
import { IcaClient } from 'ica-client-sdk-ts';

import { Sector } from 'ica-client-sdk-ts';

const client = new IcaClient({
  sector: Sector.HealthCare,
  didWeb: 'did:web:ica',
  organizationVcs: [] // If registered
});

// Set VP token (signed by frontend)
client.setVpToken(signedVpToken);

// Verify terms
const { thid, location } = await client.verifyTerms(pdfBytesOrLink);

// Poll for result
const response = await client.pollVerifyTermsResponse(thid);

// Get VCs
const { organizationVC, legalRepresentativeVC, allVcs } = client.getVcsFromResponse(response);

// Get ICA DID document
const icaDidDoc = await client.getIcaDidDocument();

// Create org DID document
const { thid: createThid } = await client.createOrgDidDocument(orgData);
const createResponse = await client.pollCreateOrgDidDocumentResponse(createThid);

// Prepare DIDComm message
const message = client.prepareDidCommRequest('type', body, attachments);
client.includeVpTokenInMessage(message);
client.includeFileInMessage(message, fileBytes, 'application/pdf', 'file-id');
```

## Features

- DIDComm messaging with attachments
- VC/VP management (frontend handles signing)
- PDF verification for onboarding
- DID document retrieval
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