// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/index.ts

// ICA Client SDK Entry Point

export { IcaClient, Sector } from './IcaClient.js';
export { VcManager } from './VcManager.js';
export { VpManager } from './VpManager.js';
export {
  buildControllerCredentialMaterial,
  extractRepresentativeBindingProjection,
  findLegalRepresentativeCredentialEntry,
  getLegalRepresentativeCredentialSubject,
  normalizeControllerSameAs,
} from './controllerBinding.js';
export type { IcaRepresentativeBindingProjection } from './controllerBinding.js';
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
  VerifyTermsControllerPayload,
  VerifyTermsOptions
} from './types.js';
export type { DidCommAttachment, DidCommMessage } from 'gdc-common-utils-ts/utils/didcomm';

// Shared utilities from gdc-common-utils-ts
export { prepareDidCommRequest, includeVpTokenInMessage, includeFileInMessage, getThidFromMessage, getDataResults } from 'gdc-common-utils-ts/utils/didcomm';
