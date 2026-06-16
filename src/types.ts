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

export interface VerifyTermsOrganizationPayload {
  legalName?: string;
  taxID?: string;
}

export interface VerifyTermsLegalRepresentativePayload {
  givenName?: string;
  familyName?: string;
  identifier?: string;
  /**
   * Optional public controller alias forwarded to ICA during `_verify`.
   *
   * Contract note:
   * - for email-based bindings, the canonical ICA value is the normalized
   *   `urn:multibase:z...` produced from the plain email, not `mailto:...`
   * - production/strict ICA flows should still source representative
   *   `credentialSubject.sameAs` from the signed PDF annex (`person.email`) or
   *   the signer certificate email
   * - demo/local ICA flows may additionally accept this field from the payload
   *   when the signed sources do not expose that contact value
   */
  sameAs?: string;
  /**
   * Optional representative email forwarded to ICA during `_verify`.
   *
   * Contract note:
   * - this is not inferred from the BFF session or user registration
   * - if the BFF wants ICA to include representative `credentialSubject.sameAs`
   *   and the signed PDF/certificate does not already carry it, the BFF must
   *   send it explicitly here
   * - production/strict ICA flows should prefer `person.email` in the signed
   *   PDF annex; demo/local ICA flows may use this payload fallback
   * - this fallback should not be treated as a substitute for a signed
   *   representative identity claim in production
   */
  email?: string;
}

export interface VerifyTermsOptions {
  mediaType?: string;
  attachmentId?: string;
  organizationPayload?: VerifyTermsOrganizationPayload;
  legalRepresentativePayload?: VerifyTermsLegalRepresentativePayload;
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
  /**
   * Public identity continuity alias of the representative/controller.
   *
   * Typical production shape for email-based identity:
   * - `urn:multibase:z...`
   *
   * This field is complementary to `hasCredential.material`, which expresses
   * continuity of the controller signing/binding key.
   */
  sameAs?: string;
  alternateName?: string;
  additionalType?: string;
  /**
   * Signing/binding continuity of the controller key associated with the
   * representative.
   *
   * Preferred canonical shape:
   * - `urn:ietf:params:oauth:jwk-thumbprint:sha-256:<base64url>`
   *
   * This field is complementary to `sameAs`, which expresses public identity
   * continuity such as email-derived aliases.
   */
  hasCredential?: Record<string, unknown>;
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
    sameAs?: string;
    publicKeyJwk?: IcaJwk;
    jwks?: IcaJwks;
  };
}

export interface RemoveOrganizationTermsRequest {
  organization: {
    identifier?: string;
    taxID?: string;
  };
  controller?: {
    sameAs?: string;
  };
  reason?: string;
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

export interface IcaRemoveOrganizationTermsResource {
  id?: string;
  status?: string;
  organizationTaxId?: string;
  did?: string;
  removedAt?: string;
  reason?: string;
  effects?: Record<string, unknown>;
  [key: string]: unknown;
}

export type IcaRemoveOrganizationTermsResponse = IcaDidCommResponse<IcaRemoveOrganizationTermsResource>;

export interface BackendAuthRequestOptions {
  bearerToken: string;
  meta?: IcaDidCommMessageMeta;
  thid?: string;
}

export interface ControllerExchangeRequestBody {
  [key: string]: unknown;
}

export interface ApiKeyCreateAction {
  agent: {
    email: string;
  };
  scope: string[];
  target?: string;
  instrument?: Record<string, unknown>;
  expires_in_seconds?: number;
}

export interface ApiKeyAuthorizationRule {
  agentEmail: string;
  scopes: string[];
  target?: string;
  odrlPolicy?: Record<string, unknown>;
  expiresInSeconds?: number;
}

export interface ApiKeySelector {
  identifier?: string;
  agent?: {
    sameAs?: string;
    email?: string;
  };
}

export interface ApiKeyActionRequest {
  thid?: string;
  data?: Array<{
    resource: ApiKeyCreateAction | ApiKeySelector;
  }>;
  [key: string]: unknown;
}

export interface IdentityDcrBody {
  [key: string]: unknown;
}

export type TransportProtection = 'plain' | 'signed' | 'encrypted';

export interface IdentityDcrBindingRequest {
  clientId: string;
  bearerToken: string;
  controllerSigPublicJwk: IcaJwk;
  controllerSigAlg?: string;
  controllerSigKid?: string;
  body?: IdentityDcrBody;
  thid?: string;
  transportProtection?: TransportProtection;
}

export interface IdentityCodeBody {
  client_id: string;
  code_challenge: string;
  code_challenge_method?: 'S256' | 'plain' | string;
  [key: string]: unknown;
}

export interface IdentityTokenBody {
  client_id: string;
  code: string;
  code_verifier: string;
  [key: string]: unknown;
}

export interface IdentityExchangeBody {
  client_id: string;
  subject_token: string;
  subject_token_type?: string;
  [key: string]: unknown;
}

export type IcaBackendAuthResponse = IcaDidCommResponse<Record<string, unknown>>;

export interface RunBackendAuthFlowRequest {
  bearerToken: string;
  clientId: string;
  codeVerifier: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain' | string;
  subjectTokenType?: string;
  dcrBody?: IdentityDcrBody;
  meta?: IcaDidCommMessageMeta;
  dcrMode?: 'force' | 'skip' | 'auto';
  knownBindingStatus?: 'bound' | 'pending_dcr' | 'unknown';
  apiKeySearchRequest?: ApiKeyActionRequest;
}

export interface RunBackendAuthFlowResult {
  codeChallenge: string;
  dcr: IcaBackendAuthResponse;
  code: IcaBackendAuthResponse;
  token: IcaBackendAuthResponse;
  exchange: IcaBackendAuthResponse;
}
