export interface IcaJwk {
  kty?: string;
  [key: string]: unknown;
}

export interface IcaJwkWithPurposes extends IcaJwk {
  purposes?: string[];
}

export interface IcaJwks {
  keys: IcaJwkWithPurposes[];
}

export interface IcaConfiguredPublicKey {
  alg?: string;
  kid: string;
  jwk: IcaJwk;
}

export interface IcaOperationOutcomeIssue {
  severity?: string;
  code?: string;
  diagnostics?: string;
  [key: string]: unknown;
}

export interface IcaOperationOutcome {
  resourceType?: string;
  issue?: IcaOperationOutcomeIssue[];
  [key: string]: unknown;
}

export interface IcaDidCommAttachmentPayload {
  format?: string;
  jwt?: string;
  [key: string]: unknown;
}

export interface IcaDidCommAttachmentData {
  json?: IcaDidCommAttachmentPayload;
  links?: string[];
  base64?: string;
  [key: string]: unknown;
}

export interface IcaDidCommAttachment {
  id?: string;
  format?: string;
  media_type?: string;
  filename?: string;
  data?: IcaDidCommAttachmentData;
  [key: string]: unknown;
}

export interface IcaDidCommJwsProtectedMeta {
  typ?: string;
  cty?: string;
  alg?: string;
  kid?: string;
  jwk?: IcaJwk;
  [key: string]: unknown;
}

export interface IcaDidCommJweHeaderMeta {
  typ?: string;
  cty?: string;
  enc?: string;
  alg?: string;
  kid?: string;
  skid?: string;
  jwk?: IcaJwk;
  [key: string]: unknown;
}

export interface IcaDidCommMessageMeta {
  jws?: {
    protected?: IcaDidCommJwsProtectedMeta;
    [key: string]: unknown;
  };
  jwe?: {
    header?: IcaDidCommJweHeaderMeta;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface IcaDidCommRequest {
  jti: string;
  thid: string;
  type: string;
  body: Record<string, unknown>;
  attachments?: IcaDidCommAttachment[];
  meta?: IcaDidCommMessageMeta;
  [key: string]: unknown;
}

export interface IcaCrypto {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

export interface VerifyTermsOptions {
  mediaType?: string;
  attachmentId?: string;
  body?: Record<string, unknown>;
  meta?: IcaDidCommMessageMeta;
  organizationPublicKeyJwk?: IcaJwk;
}

export interface IcaBundleResponseEntry<TResource = unknown> {
  type?: string;
  publicKeyJwk?: IcaJwk;
  privateKeyJwk?: IcaJwk;
  keySource?: 'attachment' | 'generated';
  response?: {
    status?: string;
    outcome?: IcaOperationOutcome;
    [key: string]: unknown;
  };
  resource?: TResource;
  [key: string]: unknown;
}

export interface IcaBundleResponseBody<TResource = unknown> {
  resourceType?: string;
  type?: string;
  total?: number;
  issues?: IcaOperationOutcome;
  data?: Array<IcaBundleResponseEntry<TResource>>;
  [key: string]: unknown;
}

export interface IcaDidCommResponse<TResource = unknown> {
  jti?: string;
  iss?: string;
  aud?: string;
  thid?: string;
  type?: string;
  attachments?: IcaDidCommAttachment[];
  body?: IcaBundleResponseBody<TResource>;
  [key: string]: unknown;
}

export interface IcaOrganizationCredentialSubject {
  id?: string;
  '@type'?: string;
  legalName?: string;
  taxID?: string;
  sameAs?: string;
  url?: string;
  alternateName?: string;
  additionalType?: string;
  address?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface IcaLegalRepresentativeMemberOf {
  '@type'?: string;
  legalName?: string;
  taxID?: string;
  [key: string]: unknown;
}

export interface IcaLegalRepresentativeCredentialSubject {
  id?: string;
  '@type'?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  identifier?: string;
  nationality?: string;
  sameAs?: string;
  alternateName?: string;
  additionalType?: string;
  hasOccupation?: Record<string, unknown>;
  memberOf?: IcaLegalRepresentativeMemberOf;
  [key: string]: unknown;
}

export interface IcaCredential<TSubject = Record<string, unknown>> {
  id?: string;
  '@context'?: string[];
  type?: string[];
  issuer?: string;
  validFrom?: string;
  meta?: Record<string, unknown>;
  credentialSubject?: TSubject;
  evidence?: unknown[];
  proof?: Record<string, unknown>;
  [key: string]: unknown;
}

export type IcaOrganizationCredential = IcaCredential<IcaOrganizationCredentialSubject>;
export type IcaLegalRepresentativeCredential = IcaCredential<IcaLegalRepresentativeCredentialSubject>;

export interface IcaFailedTermsVerificationResource {
  id?: string;
  type?: string;
  thid?: string;
  tenantId?: string;
  jurisdiction?: string;
  sector?: string;
  section?: string;
  format?: string;
  resourceType?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  audit?: Record<string, unknown>;
  content?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type IcaVerifyTermsResource =
  | IcaOrganizationCredential
  | IcaLegalRepresentativeCredential
  | IcaFailedTermsVerificationResource;

export type IcaVerifyTermsResponse = IcaDidCommResponse<IcaVerifyTermsResource>;

export interface CreateOrgDidDocumentRequest {
  organization: {
    identifier?: string;
    url?: string;
    taxID?: string;
    publicKeyJwk?: IcaJwk;
    jwks?: IcaJwks;
  };
  controller: {
    sameAs: string;
    publicKeyJwk?: IcaJwk;
    jwks?: IcaJwks;
  };
}

export interface IcaVerifyResponseKeyMaterial {
  publicKeyJwk?: IcaJwk;
  privateKeyJwk?: IcaJwk;
  keySource?: 'attachment' | 'generated';
}

export interface IcaDidDocumentVerificationMethod {
  id?: string;
  type?: string;
  controller?: string;
  publicKeyJwk?: IcaJwk;
  [key: string]: unknown;
}

export interface IcaDidDocument {
  '@context'?: string[];
  id?: string;
  controller?: string;
  verificationMethod?: IcaDidDocumentVerificationMethod[];
  assertionMethod?: string[];
  authentication?: string[];
  [key: string]: unknown;
}

export interface IcaCreateOrgDidDocumentResource {
  didDocument?: IcaDidDocument;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export type IcaCreateOrgDidDocumentResponse = IcaDidCommResponse<IcaCreateOrgDidDocumentResource>;
