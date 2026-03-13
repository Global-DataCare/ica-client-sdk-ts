// Copyright 2025 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/index.ts

// ICA Client SDK Entry Point

export { IcaClient, Sector } from './IcaClient';
export { DidCommMessage, DidCommAttachment } from 'gdc-common-utils-ts/utils/didcomm';
export { VcManager } from './VcManager';
export { VpManager } from './VpManager';
export type {
  CreateOrgDidDocumentRequest,
  IcaCreateOrgDidDocumentResponse,
  IcaCredential,
  IcaDidCommAttachment,
  IcaDidCommResponse,
  IcaDidDocument,
  IcaJwk,
  IcaLegalRepresentativeCredential,
  IcaLegalRepresentativeCredentialSubject,
  IcaOrganizationCredential,
  IcaOrganizationCredentialSubject,
  IcaVerifyTermsResponse
} from './types';

// Shared utilities from gdc-common-utils-ts
export { prepareDidCommRequest, includeVpTokenInMessage, includeFileInMessage, getThidFromMessage, getDataResults } from 'gdc-common-utils-ts/utils/didcomm';
