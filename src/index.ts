// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/index.ts

// ICA Client SDK Entry Point

export { IcaClient, Sector } from './IcaClient';
export { DidCommMessage, DidCommAttachment } from 'gdc-common-utils-ts/utils/didcomm';
export { VcManager } from './VcManager';
export { VpManager } from './VpManager';
export type {
  ApiKeyActionRequest,
  BackendAuthRequestOptions,
  IcaConfiguredPublicKey,
  IcaBackendAuthResponse,
  CreateOrgDidDocumentRequest,
  ControllerExchangeRequestBody,
  IcaCreateOrgDidDocumentResponse,
  IcaCredential,
  IcaCrypto,
  IcaDidCommAttachment,
  IcaDidCommResponse,
  IcaDidDocument,
  IcaJwk,
  IcaLegalRepresentativeCredential,
  IcaLegalRepresentativeCredentialSubject,
  IcaOrganizationCredential,
  IcaOrganizationCredentialSubject,
  IdentityCodeBody,
  IdentityDcrBindingRequest,
  IdentityDcrBody,
  IdentityExchangeBody,
  IdentityTokenBody,
  TransportProtection,
  RunBackendAuthFlowRequest,
  RunBackendAuthFlowResult,
  IcaVerifyTermsResponse,
  VerifyTermsOptions
} from './types';

// Shared utilities from gdc-common-utils-ts
export { prepareDidCommRequest, includeVpTokenInMessage, includeFileInMessage, getThidFromMessage, getDataResults } from 'gdc-common-utils-ts/utils/didcomm';
