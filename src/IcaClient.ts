// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/IcaClient.ts

import type { DidCommAttachment, DidCommMessage } from 'gdc-common-utils-ts/utils/didcomm';
import { VcManager } from './VcManager.js';
import { VpManager } from './VpManager.js';
import axios, { AxiosInstance } from 'axios';
import { prepareDidCommRequest, includeVpTokenInMessage, includeFileInMessage, getThidFromMessage, getDataResults } from 'gdc-common-utils-ts/utils/didcomm';
import {
  ApiKeyActionRequest,
  ApiKeyAuthorizationRule,
  BackendAuthRequestOptions,
  CreateOrgDidDocumentRequest,
  ControllerExchangeRequestBody,
  IcaConfiguredPublicKey,
  IcaBackendAuthResponse,
  IcaBundleResponseEntry,
  IcaCreateOrgDidDocumentResponse,
  IcaDidCommAttachment,
  IcaDidCommMessageMeta,
  IcaCrypto,
  IcaDidCommRequest,
  IcaDidCommResponse,
  IcaJwk,
  IcaJwks,
  IcaLegalRepresentativeCredential,
  IcaLegalRepresentativeCredentialSubject,
  IcaRemoveOrganizationTermsResponse,
  IcaOrganizationCredential,
  IcaOrganizationCredentialSubject,
  IdentityCodeBody,
  IdentityDcrBindingRequest,
  IdentityDcrBody,
  IdentityExchangeBody,
  IdentityTokenBody,
  RemoveOrganizationTermsRequest,
  RunBackendAuthFlowRequest,
  RunBackendAuthFlowResult,
  IcaVerifyResponseKeyMaterial,
  IcaVerifyTermsResource,
  IcaVerifyTermsResponse,
  VerifyTermsOptions
} from './types.js';
export enum Sector {
  AnimalCare = 'animal-care',
  HealthCare = 'health-care',
  OneHealthResearch = 'onehealth-research'
}

export interface IcaClientConfig {
  sector: Sector;
  didWeb: string; // e.g., did:web:ica
  organizationVcs?: string[]; // Array of signed VCs
  baseUrl?: string; // Base URL for ICA service, default from env or localhost:3310
  retryTimes?: number; // Number of polling retries (default 3)
  retryDelayMs?: number; // Default delay when Retry-After absent (default 1000ms)
  httpClient?: AxiosInstance; // Optional injectable axios client for tests
  fetch?: typeof fetch; // Optional fetch implementation (for non-axios environments)
  crypto?: IcaCrypto; // Optional crypto implementation for UUID generation
}

export class IcaClient {
  private config: IcaClientConfig;
  private vcManager: VcManager;
  private vpManager: VpManager;
  private httpClient?: AxiosInstance;
  private fetchFn?: typeof fetch;
  private cryptoApi?: IcaCrypto;
  private baseUrl: string;
  private jurisdiction: string = 'ES'; // Default, can be configurable
  private retryTimes: number;
  private retryDelayMs: number;
  private messageSigningPublicKey?: IcaConfiguredPublicKey;
  private controllerBindingPublicKey?: IcaConfiguredPublicKey;
  private credentialSigningPublicKey?: IcaConfiguredPublicKey;

  constructor(config: IcaClientConfig) {
    this.config = config;
    this.vcManager = new VcManager(config.organizationVcs || []);
    this.vpManager = new VpManager();

    this.baseUrl = config.baseUrl || process.env.ICA_BASE_URL || 'http://localhost:3310';
    this.fetchFn = config.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    this.cryptoApi = config.crypto ?? (globalThis as typeof globalThis & { crypto?: IcaCrypto }).crypto;
    this.httpClient = config.httpClient ?? (config.fetch ? undefined : axios.create({ baseURL: this.baseUrl }));

    this.retryTimes = config.retryTimes ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
  }

  // Initialize with existing VCs if organization is registered
  async initializeWithVcs(vcs: string[]): Promise<void> {
    this.vcManager.addVcs(vcs);
  }

  // Set VP token for user/org (already signed by frontend)
  setVpToken(vpToken: string): void {
    this.vpManager.setVpToken(vpToken);
  }

  setControllerMessageSigningPublicKey(alg: string, kid: string, jwk: IcaJwk): void {
    this.messageSigningPublicKey = {
      alg,
      kid,
      jwk: { ...jwk }
    };
  }

  /**
   * Sets the controller operation-signing public key that should travel inside
   * `_verify` business payload as `body.data[].resource.controller.publicKeyJwk`.
   *
   * Separation of concerns:
   * - this key represents the real controller/business actor
   * - it is distinct from the DIDComm communication key configured via
   *   `setControllerMessageSigningPublicKey(...)`
   * - ICA should project this key into
   *   `credentialSubject.hasCredential.material`
   */
  setControllerBindingPublicKey(alg: string, kid: string, jwk: IcaJwk): void {
    this.controllerBindingPublicKey = {
      alg,
      kid,
      jwk: { ...jwk }
    };
  }

  clearControllerMessageSigningPublicKey(): void {
    this.messageSigningPublicKey = undefined;
  }

  clearControllerBindingPublicKey(): void {
    this.controllerBindingPublicKey = undefined;
  }

  setOrgCredentialSigningPublicKey(alg: string, kid: string, jwk: IcaJwk): void {
    this.credentialSigningPublicKey = {
      alg,
      kid,
      jwk: { ...jwk }
    };
  }

  clearOrgCredentialSigningPublicKey(): void {
    this.credentialSigningPublicKey = undefined;
  }

  private createFapiMessage(
    type: string,
    body: Record<string, unknown> = {},
    attachments: IcaDidCommAttachment[] = []
  ): IcaDidCommRequest {
    const message = prepareDidCommRequest(type, body, attachments as DidCommAttachment[]);
    const jti = message.id;
    const thid = message.thid || jti;

    return {
      jti,
      thid,
      type: message.type,
      body: message.body,
      attachments: message.attachments as IcaDidCommAttachment[] | undefined
    };
  }

  private createAttachmentId(): string {
    const uuidFactory = this.cryptoApi?.randomUUID;
    if (typeof uuidFactory === 'function') {
      return uuidFactory.call(this.cryptoApi);
    }

    const getRandomValues = this.cryptoApi?.getRandomValues?.bind(this.cryptoApi);
    if (typeof getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    throw new Error(
      'Secure random UUID generation is not available in this runtime. ' +
      'Provide IcaClientConfig.crypto or ensure globalThis.crypto is available.'
    );
  }

  private buildConfiguredPublicJwk(configuredKey: IcaConfiguredPublicKey | undefined): IcaJwk | undefined {
    if (!configuredKey) return undefined;
    return {
      ...configuredKey.jwk,
      ...(configuredKey.alg ? { alg: configuredKey.alg } : {}),
      ...(configuredKey.kid ? { kid: configuredKey.kid } : {})
    };
  }

  private buildVerifyMessageMeta(explicitMeta?: IcaDidCommMessageMeta): IcaDidCommMessageMeta | undefined {
    const configuredProtected = this.messageSigningPublicKey
      ? {
          alg: this.messageSigningPublicKey.alg,
          kid: this.messageSigningPublicKey.kid,
          jwk: { ...this.messageSigningPublicKey.jwk }
        }
      : undefined;

    const explicitProtected = explicitMeta?.jws?.protected;
    const protectedHeader = configuredProtected || explicitProtected
      ? {
          ...(configuredProtected || {}),
          ...(explicitProtected || {})
        }
      : undefined;

    if (!protectedHeader && !explicitMeta) return undefined;

    return {
      ...(explicitMeta || {}),
      ...(protectedHeader ? {
        jws: {
          ...(explicitMeta?.jws || {}),
          protected: protectedHeader
        }
      } : {})
    };
  }

  private buildAuthHeaders(contentType: string, bearerToken: string): Record<string, string> {
    if (!bearerToken || !bearerToken.trim()) {
      throw new Error('bearerToken is required');
    }
    return {
      'Content-Type': contentType,
      Authorization: `Bearer ${bearerToken.trim()}`
    };
  }

  private resolveThreadId(thid?: string): string {
    return thid && thid.trim() ? thid.trim() : this.createAttachmentId();
  }

  private async pollAsyncDidcommResponse(url: string, thid: string, bearerToken: string): Promise<IcaBackendAuthResponse> {
    for (let attempt = 0; attempt < this.retryTimes; attempt++) {
      const response = await this.request({
        method: 'POST',
        url,
        body: { thid },
        headers: this.buildAuthHeaders('application/json', bearerToken)
      });

      if (response.status === 200) {
        return response.data as IcaBackendAuthResponse;
      }

      const retryAfterHeader = response.headers?.['retry-after'];
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      const delayMs = (retryAfterSeconds && !Number.isNaN(retryAfterSeconds))
        ? retryAfterSeconds * 1000
        : this.retryDelayMs;

      await this.sleep(delayMs);
    }

    throw new Error(`Failed polling async backend auth response after ${this.retryTimes} attempts`);
  }

  private getFirstStringByKeys(input: unknown, keys: string[]): string | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const queue: unknown[] = [input];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      const record = current as Record<string, unknown>;
      for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }
    return undefined;
  }

  private async computePkceS256Challenge(codeVerifier: string): Promise<string> {
    const cryptoLike = this.cryptoApi ?? (globalThis as typeof globalThis & { crypto?: IcaCrypto }).crypto;
    const subtle = (cryptoLike as { subtle?: { digest: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer> } } | undefined)?.subtle;
    if (!subtle || typeof subtle.digest !== 'function') {
      throw new Error('PKCE S256 requires WebCrypto subtle.digest. Provide IcaClientConfig.crypto with subtle support.');
    }
    const bytes = new TextEncoder().encode(codeVerifier);
    const digest = await subtle.digest('SHA-256', bytes);
    const base64 = Buffer.from(new Uint8Array(digest)).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private extractIdTokenFromTokenResponse(response: IcaBackendAuthResponse): string {
    const idToken = this.getFirstStringByKeys(response, ['id_token', 'subject_token']);
    if (!idToken) {
      throw new Error('Token response does not contain id_token/subject_token.');
    }
    return idToken;
  }

  private buildDcrMetaFromBinding(input: IdentityDcrBindingRequest): IcaDidCommMessageMeta {
    return {
      jws: {
        protected: {
          alg: input.controllerSigAlg || 'ES384',
          ...(input.controllerSigKid ? { kid: input.controllerSigKid } : {}),
          jwk: input.controllerSigPublicJwk
        }
      }
    };
  }

  private isBoundStatus(value: unknown): boolean {
    return typeof value === 'string' && value.toLowerCase() === 'bound';
  }

  private hasBoundStatusDeep(input: unknown): boolean {
    if (!input || typeof input !== 'object') return false;
    const queue: unknown[] = [input];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      const record = current as Record<string, unknown>;
      const candidates = [record.bindingStatus, record.binding_status, record.status];
      if (candidates.some(candidate => this.isBoundStatus(candidate))) {
        return true;
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }
    return false;
  }

  /**
   * Verifies onboarding terms PDF through ICA.
   *
   * Key separation during `_verify`:
   * - DIDComm communication protection lives in `meta.jws` / `meta.jwe`
   * - controller business binding lives in
   *   `body.data[].resource.controller.publicKeyJwk`
   * - organization credential key bootstrap lives in the extra
   *   `application/jwk+json` attachment when provided
   */
  async verifyTerms(
    pdfLinkOrBytes: string | Uint8Array,
    options: VerifyTermsOptions = {}
  ): Promise<{ thid: string; location: string }> {
    const mediaType = options.mediaType || 'application/pdf';
    const attachmentId = options.attachmentId || this.createAttachmentId();
    let attachment: IcaDidCommAttachment;
    if (typeof pdfLinkOrBytes === 'string') {
      attachment = {
        id: attachmentId,
        media_type: mediaType,
        data: { links: [pdfLinkOrBytes] }
      };
    } else {
      const base64 = Buffer.from(pdfLinkOrBytes).toString('base64');
      attachment = {
        id: attachmentId,
        media_type: mediaType,
        data: { base64 }
      };
    }

    const organizationPublicKeyJwk = options.organizationPublicKeyJwk || this.buildConfiguredPublicJwk(this.credentialSigningPublicKey);
    const attachments: IcaDidCommAttachment[] = [attachment];
    if (organizationPublicKeyJwk) {
      attachments.push({
        id: `${attachmentId}-organization-public-jwk`,
        media_type: 'application/jwk+json',
        filename: 'organization-public-key.jwk.json',
        data: { json: organizationPublicKeyJwk }
      });
    }

    const body: Record<string, any> = options.body || {};
    const controllerBindingPublicKeyJwk = options.controllerPayload?.publicKeyJwk
      || this.buildConfiguredPublicJwk(this.controllerBindingPublicKey);

    if (options.organizationPayload || options.legalRepresentativePayload || controllerBindingPublicKeyJwk) {
      if (!body.data) {
        body.data = [{ resource: {} }];
      } else if (Array.isArray(body.data) && body.data.length > 0 && !body.data[0].resource) {
        body.data[0].resource = {};
      } else if (!Array.isArray(body.data) || body.data.length === 0) {
        body.data = [{ resource: {} }];
      }
      
      const resource = body.data[0].resource;
      if (options.organizationPayload) {
        resource.organization = options.organizationPayload;
      }
      if (options.legalRepresentativePayload) {
        resource.legalRepresentative = options.legalRepresentativePayload;
      }
      if (controllerBindingPublicKeyJwk) {
        resource.controller = {
          ...(resource.controller || {}),
          publicKeyJwk: controllerBindingPublicKeyJwk
        };
      }
    }

    const message = this.createFapiMessage(
      'https://globaldatacare.es/didcomm/ica/terms/verify-request/v1',
      body,
      attachments
    );
    const resolvedMeta = this.buildVerifyMessageMeta(options.meta);
    if (resolvedMeta) {
      message.meta = resolvedMeta as IcaDidCommMessageMeta;
    }

    const url = `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/terms/pdf/contract/_verify`;
    const response = await this.request({
      method: 'POST',
      url,
      body: message,
      headers: { 'Content-Type': 'application/didcomm-plain+json' }
    });

    if (response.status === 202) {
      const location = response.headers.location;
      const thid = message.thid;
      return { thid, location };
    } else {
      throw new Error('Unexpected response status: ' + response.status);
    }
  }

  // Poll verify terms response (retry based on Retry-After or default interval)
  async pollVerifyTermsResponse(thid: string): Promise<IcaVerifyTermsResponse> {
    const url = `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/terms/pdf/contract/_verify-response?thid=${thid}`;

    for (let attempt = 0; attempt < this.retryTimes; attempt++) {
      const response = await this.request({
        method: 'POST',
        url,
        body: { thid },
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 200) {
        return response.data as IcaVerifyTermsResponse;
      }

      const retryAfterHeader = response.headers?.['retry-after'];
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      const delayMs = (retryAfterSeconds && !Number.isNaN(retryAfterSeconds))
        ? retryAfterSeconds * 1000
        : this.retryDelayMs;

      await this.sleep(delayMs);
    }

    throw new Error(`Failed polling verify terms response after ${this.retryTimes} attempts`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private buildUrl(url: string): string {
    // If a full URL is provided, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Ensure baseUrl does not end with '/' and url starts with '/'
    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  }

  private headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  private async request(options: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<{ status: number; headers: Record<string, string>; data: any }> {
    const headers = options.headers ?? {};

    // Prefer an injectable axios client if available
    if (this.httpClient) {
      const response = await this.httpClient.request({
        method: options.method,
        url: options.url,
        data: options.body,
        headers
      });
      return {
        status: response.status,
        headers: (response.headers || {}) as Record<string, string>,
        data: response.data
      };
    }

    if (!this.fetchFn) {
      throw new Error('No HTTP transport available: provide axios httpClient or fetch implementation');
    }

    const fetchUrl = this.buildUrl(options.url);
    const body = options.body;
    const fetchOptions: RequestInit = {
      method: options.method,
      headers,
      body: body !== undefined
        ? typeof body === 'string'
          ? body
          : JSON.stringify(body)
        : undefined
    };

    const response = await this.fetchFn(fetchUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';
    let data: any;
    if (contentType.includes('json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      headers: this.headersToObject(response.headers),
      data
    };
  }

  // Get ICA DID document
  async getIcaDidDocument(): Promise<any> {
    const response = await this.request({
      method: 'GET',
      url: '/.well-known/did.json'
    });
    return response.data;
  }

  private parseVcObject<T extends object>(vc: string | object | undefined): T | undefined {
    if (!vc) return undefined;
    if (typeof vc === 'string') {
      try {
        return JSON.parse(vc) as T;
      } catch {
        return undefined;
      }
    }
    return vc as T;
  }

  private getResponseEntries<TResource>(response: IcaDidCommResponse<TResource> | undefined): Array<IcaBundleResponseEntry<TResource>> {
    const data = response?.body?.data;
    return Array.isArray(data) ? data : [];
  }

  private getEntryTypeNames(entry: IcaBundleResponseEntry<unknown>): string[] {
    const typeNames: string[] = [];

    if (typeof entry.type === 'string') {
      typeNames.push(entry.type.toLowerCase());
    }

    const resource = entry.resource;
    if (resource && typeof resource === 'object') {
      const resourceType = (resource as { type?: unknown }).type;
      if (Array.isArray(resourceType)) {
        for (const value of resourceType) {
          if (typeof value === 'string') {
            typeNames.push(value.toLowerCase());
          }
        }
      } else if (typeof resourceType === 'string') {
        typeNames.push(resourceType.toLowerCase());
      }
    }

    return typeNames;
  }

  private attachmentJwt(attachment: IcaDidCommAttachment): string | undefined {
    const jwt = attachment.data?.json?.jwt;
    return typeof jwt === 'string' ? jwt : undefined;
  }

  private attachmentNameMatches(attachment: IcaDidCommAttachment, patterns: string[]): boolean {
    const text = [attachment.filename, attachment.id]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();

    return patterns.some(pattern => text.includes(pattern));
  }

  private isCredentialResource(resource: unknown): resource is IcaOrganizationCredential | IcaLegalRepresentativeCredential {
    return !!resource && typeof resource === 'object' && 'credentialSubject' in resource;
  }

  private isOrganizationCredentialEntry(entry: IcaBundleResponseEntry<IcaVerifyTermsResource>): entry is IcaBundleResponseEntry<IcaOrganizationCredential> {
    return this.getEntryTypeNames(entry).some(typeName => typeName.includes('organization'));
  }

  private isLegalRepresentativeCredentialEntry(entry: IcaBundleResponseEntry<IcaVerifyTermsResource>): entry is IcaBundleResponseEntry<IcaLegalRepresentativeCredential> {
    return this.getEntryTypeNames(entry).some(
      typeName => typeName.includes('legalrepresentative') || typeName.includes('personcredential')
    );
  }

  private extractDidDocumentFieldsFromVcs(
    orgVcInput?: string | object,
    controllerVcInput?: string | object
  ): Partial<{
    orgCredentialSubjectId: string;
    orgCredentialSubjectUrl: string;
    orgCredentialSubjectTaxID: string;
    controllerCredentialSubjectSameAs: string;
  }> {
    const orgVc = this.parseVcObject<IcaOrganizationCredential>(orgVcInput);
    const controllerVc = this.parseVcObject<IcaLegalRepresentativeCredential>(controllerVcInput);

    const orgSubject = (orgVc?.credentialSubject || orgVc?.subject || {}) as Record<string, unknown>;
    const controllerSubject = (controllerVc?.credentialSubject || controllerVc?.subject || {}) as Record<string, unknown>;

    const orgCredentialSubjectId = typeof orgSubject?.id === 'string' ? orgSubject.id : undefined;
    const orgCredentialSubjectUrl = typeof orgSubject?.url === 'string' ? orgSubject.url : undefined;
    const orgCredentialSubjectTaxID = typeof orgSubject?.taxID === 'string' ? orgSubject.taxID : undefined;
    const controllerCredentialSubjectSameAs = typeof controllerSubject?.sameAs === 'string'
      ? controllerSubject.sameAs
      : undefined;

    return {
      orgCredentialSubjectId,
      orgCredentialSubjectUrl,
      orgCredentialSubjectTaxID,
      controllerCredentialSubjectSameAs
    };
  }

  // Create organization DID document (POST /entity/did/document/_create)
  async createOrgDidDocument(orgData: CreateOrgDidDocumentRequest): Promise<{ thid: string; location: string }> {
    const org = orgData.organization;
    const controller = orgData.controller;
    const organizationPublicKeyJwk = org?.publicKeyJwk || this.buildConfiguredPublicJwk(this.credentialSigningPublicKey);

    const hasExplicitId = !!org.identifier;
    const hasDerived = !!org.url && !!org.taxID;
    if (!hasExplicitId && !hasDerived) {
      throw new Error('organization identifier (explicit mode) or organization url + taxID (derived mode) is required');
    }

    const message = this.createFapiMessage(
      'https://globaldatacare.es/didcomm/ica/entity/did/document/create-request/v1',
      {
        data: [
          {
            resource: {
              organization: {
                ...org,
                ...(organizationPublicKeyJwk ? { publicKeyJwk: organizationPublicKeyJwk } : {})
              },
              controller: {
                ...(controller.sameAs ? { sameAs: controller.sameAs } : {}),
                ...(controller.publicKeyJwk ? { publicKeyJwk: controller.publicKeyJwk } : {}),
                ...(controller.jwks ? { jwks: controller.jwks } : {})
              }
            }
          }
        ]
      }
    );

    const url = `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/entity/did/document/_create`;
    const response = await this.request({
      method: 'POST',
      url,
      body: message,
      headers: { 'Content-Type': 'application/didcomm-plain+json' }
    });

    if (response.status === 202) {
      const location = response.headers.location;
      const thid = message.thid;
      return { thid, location };
    } else {
      throw new Error('Unexpected response status: ' + response.status);
    }
  }

  async createOrgDidDocumentFromVcs(options: {
    organizationVC?: string | object;
    legalRepresentativeVC?: string | object;
    organizationIdentifier?: string;
    organizationUrl?: string;
    organizationTaxID?: string;
    organizationPublicKeyJwk?: IcaJwk;
    organizationJwks?: IcaJwks;
    controllerSameAs?: string;
    controllerPublicKeyJwk: IcaJwk;
    controllerJwks?: IcaJwks;
  }): Promise<{ thid: string; location: string }> {
    const extracted = this.extractDidDocumentFieldsFromVcs(options.organizationVC, options.legalRepresentativeVC);

    const organizationPublicKeyJwk = options.organizationPublicKeyJwk || this.buildConfiguredPublicJwk(this.credentialSigningPublicKey);
    const organizationIdentifier = options.organizationIdentifier || extracted.orgCredentialSubjectId;
    const controllerSameAs = options.controllerSameAs || extracted.controllerCredentialSubjectSameAs;

    const organization: CreateOrgDidDocumentRequest['organization'] = {
      ...(organizationPublicKeyJwk ? { publicKeyJwk: organizationPublicKeyJwk } : {}),
      ...(options.organizationJwks ? { jwks: options.organizationJwks } : {})
    };
    if (organizationIdentifier) {
      organization.identifier = organizationIdentifier;
    } else {
      organization.url = options.organizationUrl || extracted.orgCredentialSubjectUrl;
      organization.taxID = options.organizationTaxID || extracted.orgCredentialSubjectTaxID;
    }

    if (!organization.identifier && !(organization.url && organization.taxID)) {
      throw new Error('Missing required organization identifier (did) or organization url+taxID.');
    }

    const payload: CreateOrgDidDocumentRequest = {
      organization,
      controller: {
        ...(controllerSameAs ? { sameAs: controllerSameAs } : {}),
        ...(options.controllerPublicKeyJwk ? { publicKeyJwk: options.controllerPublicKeyJwk } : {}),
        ...(options.controllerJwks ? { jwks: options.controllerJwks } : {})
      }
    };

    return this.createOrgDidDocument(payload);
  }

  // Poll create org DID document response (POST /_create-response)
  async pollCreateOrgDidDocumentResponse(thid: string): Promise<IcaCreateOrgDidDocumentResponse> {
    const url = `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/entity/did/document/_create-response?thid=${thid}`;

    for (let attempt = 0; attempt < this.retryTimes; attempt++) {
      const response = await this.request({
        method: 'POST',
        url,
        body: { thid },
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status === 200) {
        return response.data as IcaCreateOrgDidDocumentResponse;
      }

      const retryAfterHeader = response.headers?.['retry-after'];
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      const delayMs = (retryAfterSeconds && !Number.isNaN(retryAfterSeconds))
        ? retryAfterSeconds * 1000
        : this.retryDelayMs;

      await this.sleep(delayMs);
    }

    throw new Error(`Failed polling org DID document after ${this.retryTimes} attempts`);
  }

  // Shortcut to create org DID document and retrieve final DID document message
  async getOrgDidDoc(orgData: CreateOrgDidDocumentRequest): Promise<IcaCreateOrgDidDocumentResponse> {
    const { thid } = await this.createOrgDidDocument(orgData);
    return this.pollCreateOrgDidDocumentResponse(thid);
  }

  async removeOrganizationTerms(
    request: RemoveOrganizationTermsRequest,
    options: { meta?: IcaDidCommMessageMeta } = {}
  ): Promise<{ thid: string; location: string }> {
    const organization = request.organization || {};
    if (!organization.identifier && !organization.taxID) {
      throw new Error('organization identifier or taxID is required to remove accepted terms');
    }

    const message = this.createFapiMessage(
      'https://globaldatacare.es/didcomm/ica/terms/remove-request/v1',
      {
        data: [
          {
            resource: {
              organization: {
                ...(organization.identifier ? { identifier: organization.identifier } : {}),
                ...(organization.taxID ? { taxID: organization.taxID } : {})
              },
              controller: {
                ...(request.controller?.sameAs ? { sameAs: request.controller.sameAs } : {})
              },
              ...(request.reason ? { reason: request.reason } : {})
            }
          }
        ]
      }
    );
    const resolvedMeta = this.buildVerifyMessageMeta(options.meta);
    if (resolvedMeta) {
      message.meta = resolvedMeta as IcaDidCommMessageMeta;
    }

    const url = `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/terms/pdf/contract/_remove`;
    const response = await this.request({
      method: 'POST',
      url,
      body: message,
      headers: { 'Content-Type': 'application/didcomm-plain+json' }
    });

    if (response.status === 202) {
      const location = response.headers.location;
      const thid = message.thid;
      return { thid, location };
    }

    throw new Error('Unexpected response status: ' + response.status);
  }

  async pollRemoveOrganizationTermsResponse(thid: string): Promise<IcaRemoveOrganizationTermsResponse> {
    const url = `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/terms/pdf/contract/_remove-response?thid=${thid}`;

    for (let attempt = 0; attempt < this.retryTimes; attempt++) {
      const response = await this.request({
        method: 'POST',
        url,
        body: { thid },
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status === 200) {
        return response.data as IcaRemoveOrganizationTermsResponse;
      }

      const retryAfterHeader = response.headers?.['retry-after'];
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      const delayMs = (retryAfterSeconds && !Number.isNaN(retryAfterSeconds))
        ? retryAfterSeconds * 1000
        : this.retryDelayMs;

      await this.sleep(delayMs);
    }

    throw new Error(`Failed polling organization terms removal after ${this.retryTimes} attempts`);
  }

  async controllerExchange(
    body: ControllerExchangeRequestBody = {},
    options: BackendAuthRequestOptions
  ): Promise<{ thid: string; location: string }> {
    const thid = this.resolveThreadId(options.thid);
    const message = this.createFapiMessage(
      'https://globaldatacare.es/didcomm/ica/organization/dataspace/auth/exchange-request/v1',
      body
    );
    message.thid = thid;
    if (options.meta) {
      message.meta = options.meta;
    }

    const response = await this.request({
      method: 'POST',
      url: `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/organization/dataspace/auth/_exchange`,
      body: message,
      headers: this.buildAuthHeaders('application/didcomm-plain+json', options.bearerToken)
    });

    if (response.status === 202) {
      return { thid, location: response.headers.location };
    }
    throw new Error('Unexpected response status: ' + response.status);
  }

  async pollControllerExchangeResponse(thid: string, bearerToken: string): Promise<IcaBackendAuthResponse> {
    return this.pollAsyncDidcommResponse(
      `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/organization/dataspace/auth/_exchange-response?thid=${thid}`,
      thid,
      bearerToken
    );
  }

  async createApiKey(
    request: ApiKeyActionRequest,
    bearerToken: string
  ): Promise<{ thid: string; location: string }> {
    const thid = this.resolveThreadId(request.thid);
    const response = await this.request({
      method: 'POST',
      url: `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/api-key/org.schema/action/_create`,
      body: { ...request, thid },
      headers: this.buildAuthHeaders('application/json', bearerToken)
    });
    if (response.status === 202) {
      return { thid, location: response.headers.location };
    }
    throw new Error('Unexpected response status: ' + response.status);
  }

  // Atomic authorization helper:
  // one rule entry = one consent-like authorization record = one ODRL attachment/policy.
  async createApiKeyRules(
    rules: ApiKeyAuthorizationRule[],
    bearerToken: string,
    thid?: string
  ): Promise<{ thid: string; location: string }> {
    const normalizedRules = (rules || []).map((rule) => ({
      resource: {
        agent: { email: String(rule.agentEmail || '').trim() },
        scope: [...(rule.scopes || [])],
        ...(rule.target ? { target: rule.target } : {}),
        ...(rule.odrlPolicy ? { instrument: rule.odrlPolicy } : {}),
        ...(rule.expiresInSeconds ? { expires_in_seconds: rule.expiresInSeconds } : {}),
      }
    }));
    return this.createApiKey({ thid, data: normalizedRules }, bearerToken);
  }

  async disableApiKey(
    request: ApiKeyActionRequest,
    bearerToken: string
  ): Promise<{ thid: string; location: string }> {
    const thid = this.resolveThreadId(request.thid);
    const response = await this.request({
      method: 'POST',
      url: `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/api-key/org.schema/action/_disable`,
      body: { ...request, thid },
      headers: this.buildAuthHeaders('application/json', bearerToken)
    });
    if (response.status === 202) {
      return { thid, location: response.headers.location };
    }
    throw new Error('Unexpected response status: ' + response.status);
  }

  async removeApiKey(
    request: ApiKeyActionRequest,
    bearerToken: string
  ): Promise<{ thid: string; location: string }> {
    const thid = this.resolveThreadId(request.thid);
    const response = await this.request({
      method: 'POST',
      url: `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/api-key/org.schema/action/_remove`,
      body: { ...request, thid },
      headers: this.buildAuthHeaders('application/json', bearerToken)
    });
    if (response.status === 202) {
      return { thid, location: response.headers.location };
    }
    throw new Error('Unexpected response status: ' + response.status);
  }

  async searchApiKeys(
    request: ApiKeyActionRequest = {},
    bearerToken: string
  ): Promise<{ thid: string; location: string }> {
    const thid = this.resolveThreadId(request.thid);
    const response = await this.request({
      method: 'POST',
      url: `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/api-key/org.schema/action/_search`,
      body: { ...request, thid },
      headers: this.buildAuthHeaders('application/json', bearerToken)
    });
    if (response.status === 202) {
      return { thid, location: response.headers.location };
    }
    throw new Error('Unexpected response status: ' + response.status);
  }

  async pollApiKeyActionResponse(
    thid: string,
    bearerToken: string,
    action: '_create' | '_disable' | '_remove' | '_search' = '_create'
  ): Promise<IcaBackendAuthResponse> {
    return this.pollAsyncDidcommResponse(
      `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/api-key/org.schema/action/${action}-response?thid=${thid}`,
      thid,
      bearerToken
    );
  }

  async identityDcr(
    clientId: string,
    body: IdentityDcrBody = {},
    options: BackendAuthRequestOptions
  ): Promise<{ thid: string; location: string }> {
    const thid = this.resolveThreadId(options.thid);
    const message = this.createFapiMessage(
      'https://globaldatacare.es/didcomm/ica/identity/auth/dcr-request/v1',
      body
    );
    message.thid = thid;
    message.client_id = clientId;
    if (options.meta) {
      message.meta = options.meta;
    }

    const response = await this.request({
      method: 'POST',
      url: `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/identity/auth/_dcr`,
      body: message,
      headers: this.buildAuthHeaders('application/didcomm-plain+json', options.bearerToken)
    });
    if (response.status === 202) {
      return { thid, location: response.headers.location };
    }
    throw new Error('Unexpected response status: ' + response.status);
  }

  async identityDcrWithBinding(input: IdentityDcrBindingRequest): Promise<{ thid: string; location: string }> {
    const protection = input.transportProtection || 'plain';
    if (protection !== 'plain') {
      throw new Error(
        `transportProtection=${protection} is not yet supported by this SDK backend-auth path. ` +
        'Use plain for now; signed/encrypted envelope generation will be introduced in a dedicated transport layer.'
      );
    }

    return this.identityDcr(
      input.clientId,
      input.body || {},
      {
        bearerToken: input.bearerToken,
        thid: input.thid,
        meta: this.buildDcrMetaFromBinding(input)
      }
    );
  }

  async pollIdentityDcrResponse(thid: string, bearerToken: string): Promise<IcaBackendAuthResponse> {
    return this.pollAsyncDidcommResponse(
      `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/identity/auth/_dcr-response?thid=${thid}`,
      thid,
      bearerToken
    );
  }

  async identityCode(
    body: IdentityCodeBody,
    options: BackendAuthRequestOptions
  ): Promise<{ thid: string; location: string }> {
    const thid = this.resolveThreadId(options.thid);
    const message = this.createFapiMessage(
      'https://globaldatacare.es/didcomm/ica/identity/auth/code-request/v1',
      body
    );
    message.thid = thid;
    if (options.meta) {
      message.meta = options.meta;
    }
    const response = await this.request({
      method: 'POST',
      url: `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/identity/auth/_code`,
      body: message,
      headers: this.buildAuthHeaders('application/didcomm-plain+json', options.bearerToken)
    });
    if (response.status === 202) {
      return { thid, location: response.headers.location };
    }
    throw new Error('Unexpected response status: ' + response.status);
  }

  async pollIdentityCodeResponse(thid: string, bearerToken: string): Promise<IcaBackendAuthResponse> {
    return this.pollAsyncDidcommResponse(
      `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/identity/auth/_code-response?thid=${thid}`,
      thid,
      bearerToken
    );
  }

  async identityToken(
    body: IdentityTokenBody,
    options: BackendAuthRequestOptions
  ): Promise<{ thid: string; location: string }> {
    const thid = this.resolveThreadId(options.thid);
    const message = this.createFapiMessage(
      'https://globaldatacare.es/didcomm/ica/identity/auth/token-request/v1',
      body
    );
    message.thid = thid;
    if (options.meta) {
      message.meta = options.meta;
    }
    const response = await this.request({
      method: 'POST',
      url: `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/identity/auth/_token`,
      body: message,
      headers: this.buildAuthHeaders('application/didcomm-plain+json', options.bearerToken)
    });
    if (response.status === 202) {
      return { thid, location: response.headers.location };
    }
    throw new Error('Unexpected response status: ' + response.status);
  }

  async pollIdentityTokenResponse(thid: string, bearerToken: string): Promise<IcaBackendAuthResponse> {
    return this.pollAsyncDidcommResponse(
      `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/identity/auth/_token-response?thid=${thid}`,
      thid,
      bearerToken
    );
  }

  async identityExchange(
    body: IdentityExchangeBody,
    options: BackendAuthRequestOptions
  ): Promise<{ thid: string; location: string }> {
    const thid = this.resolveThreadId(options.thid);
    const message = this.createFapiMessage(
      'https://globaldatacare.es/didcomm/ica/identity/auth/exchange-request/v1',
      body
    );
    message.thid = thid;
    if (options.meta) {
      message.meta = options.meta;
    }
    const response = await this.request({
      method: 'POST',
      url: `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/identity/auth/_exchange`,
      body: message,
      headers: this.buildAuthHeaders('application/didcomm-plain+json', options.bearerToken)
    });
    if (response.status === 202) {
      return { thid, location: response.headers.location };
    }
    throw new Error('Unexpected response status: ' + response.status);
  }

  async pollIdentityExchangeResponse(thid: string, bearerToken: string): Promise<IcaBackendAuthResponse> {
    return this.pollAsyncDidcommResponse(
      `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/identity/auth/_exchange-response?thid=${thid}`,
      thid,
      bearerToken
    );
  }

  async runBackendAuthFlow(request: RunBackendAuthFlowRequest): Promise<RunBackendAuthFlowResult> {
    const codeChallengeMethod = request.codeChallengeMethod || 'S256';
    const computedCodeChallenge = request.codeChallenge
      || (codeChallengeMethod === 'S256'
        ? await this.computePkceS256Challenge(request.codeVerifier)
        : request.codeVerifier);
    const dcrMode = request.dcrMode || 'force';
    let dcr: IcaBackendAuthResponse;
    let shouldRunDcr = dcrMode === 'force';

    if (dcrMode === 'skip') {
      shouldRunDcr = false;
    } else if (dcrMode === 'auto') {
      if (request.knownBindingStatus === 'bound') {
        shouldRunDcr = false;
      } else if (request.knownBindingStatus === 'pending_dcr') {
        shouldRunDcr = true;
      } else {
        const searchSubmit = await this.searchApiKeys(
          request.apiKeySearchRequest || {},
          request.bearerToken
        );
        const searchResponse = await this.pollApiKeyActionResponse(
          searchSubmit.thid,
          request.bearerToken,
          '_search'
        );
        shouldRunDcr = !this.hasBoundStatusDeep(searchResponse);
      }
    }

    if (shouldRunDcr) {
      const dcrSubmit = await this.identityDcr(
        request.clientId,
        request.dcrBody || {},
        {
          bearerToken: request.bearerToken,
          meta: request.meta
        }
      );
      dcr = await this.pollIdentityDcrResponse(dcrSubmit.thid, request.bearerToken);
    } else {
      dcr = {
        body: {
          type: 'batch-response',
          data: [
            {
              resource: {
                status: 'bound',
                action: 'dcr-skipped',
                reason: 'binding-already-bound'
              }
            }
          ]
        }
      };
    }

    const codeSubmit = await this.identityCode(
      {
        client_id: request.clientId,
        code_challenge: computedCodeChallenge,
        code_challenge_method: codeChallengeMethod
      },
      {
        bearerToken: request.bearerToken,
        meta: request.meta
      }
    );
    const code = await this.pollIdentityCodeResponse(codeSubmit.thid, request.bearerToken);
    const authCode = this.getFirstStringByKeys(code, ['code', 'authorization_code']);
    if (!authCode) {
      throw new Error('Code response does not contain authorization code.');
    }

    const tokenSubmit = await this.identityToken(
      {
        client_id: request.clientId,
        code: authCode,
        code_verifier: request.codeVerifier
      },
      {
        bearerToken: request.bearerToken,
        meta: request.meta
      }
    );
    const token = await this.pollIdentityTokenResponse(tokenSubmit.thid, request.bearerToken);
    const idToken = this.extractIdTokenFromTokenResponse(token);

    const exchangeSubmit = await this.identityExchange(
      {
        client_id: request.clientId,
        subject_token: idToken,
        subject_token_type: request.subjectTokenType || 'urn:ietf:params:oauth:token-type:id_token'
      },
      {
        bearerToken: request.bearerToken,
        meta: request.meta
      }
    );
    const exchange = await this.pollIdentityExchangeResponse(exchangeSubmit.thid, request.bearerToken);

    return {
      codeChallenge: computedCodeChallenge,
      dcr,
      code,
      token,
      exchange
    };
  }

  getCredentialsFromVerifyResponse(response: IcaVerifyTermsResponse): {
    organizationCredential?: IcaOrganizationCredential;
    legalRepresentativeCredential?: IcaLegalRepresentativeCredential;
    allCredentials: Array<IcaOrganizationCredential | IcaLegalRepresentativeCredential>;
  } {
    const entries = this.getResponseEntries<IcaVerifyTermsResource>(response);
    const allCredentials = entries
      .map(entry => entry.resource)
      .filter((resource): resource is IcaOrganizationCredential | IcaLegalRepresentativeCredential => this.isCredentialResource(resource));

    const organizationCredential = entries.find(entry => this.isOrganizationCredentialEntry(entry))?.resource;
    const legalRepresentativeCredential = entries.find(entry => this.isLegalRepresentativeCredentialEntry(entry))?.resource;

    return {
      organizationCredential,
      legalRepresentativeCredential,
      allCredentials
    };
  }

  getOrganizationCredentialFromVerifyResponse(response: IcaVerifyTermsResponse): IcaOrganizationCredential | undefined {
    return this.getCredentialsFromVerifyResponse(response).organizationCredential;
  }

  getOrganizationKeyMaterialFromVerifyResponse(response: IcaVerifyTermsResponse): IcaVerifyResponseKeyMaterial {
    const entry = this.getResponseEntries<IcaVerifyTermsResource>(response)
      .find(candidate => this.isOrganizationCredentialEntry(candidate));
    return {
      publicKeyJwk: entry?.publicKeyJwk,
      privateKeyJwk: entry?.privateKeyJwk,
      keySource: entry?.keySource
    };
  }

  getControllerBindingPublicKeyFromVerifyResponse(response: IcaVerifyTermsResponse): IcaJwk | undefined {
    const entry = this.getResponseEntries<IcaVerifyTermsResource>(response)
      .find(candidate => this.isLegalRepresentativeCredentialEntry(candidate));
    return entry?.publicKeyJwk;
  }

  getLegalRepresentativeCredentialFromVerifyResponse(response: IcaVerifyTermsResponse): IcaLegalRepresentativeCredential | undefined {
    return this.getCredentialsFromVerifyResponse(response).legalRepresentativeCredential;
  }

  getOrganizationInfoFromVerifyResponse(response: IcaVerifyTermsResponse): IcaOrganizationCredentialSubject | undefined {
    return this.getOrganizationCredentialFromVerifyResponse(response)?.credentialSubject;
  }

  getLegalRepresentativeInfoFromVerifyResponse(response: IcaVerifyTermsResponse): IcaLegalRepresentativeCredentialSubject | undefined {
    return this.getLegalRepresentativeCredentialFromVerifyResponse(response)?.credentialSubject;
  }

  getOrganizationInfoFromCredential(credentialInput: string | object): IcaOrganizationCredentialSubject | undefined {
    return this.parseVcObject<IcaOrganizationCredential>(credentialInput)?.credentialSubject;
  }

  getLegalRepresentativeInfoFromCredential(credentialInput: string | object): IcaLegalRepresentativeCredentialSubject | undefined {
    return this.parseVcObject<IcaLegalRepresentativeCredential>(credentialInput)?.credentialSubject;
  }

  getVcsFromResponse(response: IcaVerifyTermsResponse): {
    organizationVC?: string;
    legalRepresentativeVC?: string;
    allVcs: string[];
  } {
    const attachments = Array.isArray(response.attachments) ? response.attachments : [];
    const vcAttachments = attachments.filter(attachment => typeof this.attachmentJwt(attachment) === 'string');
    const allVcs = vcAttachments
      .map(attachment => this.attachmentJwt(attachment))
      .filter((jwt): jwt is string => typeof jwt === 'string');

    const fallbackOrganizationAttachment = vcAttachments[0];
    const fallbackLegalRepresentativeAttachment = vcAttachments[1];

    const organizationAttachment = vcAttachments.find(attachment =>
      this.attachmentNameMatches(attachment, ['organization'])
    ) || fallbackOrganizationAttachment;
    const legalRepresentativeAttachment = vcAttachments.find(attachment =>
      this.attachmentNameMatches(attachment, ['legalrepresentative', 'legal-representative'])
    ) || fallbackLegalRepresentativeAttachment;

    return {
      organizationVC: organizationAttachment ? this.attachmentJwt(organizationAttachment) : undefined,
      legalRepresentativeVC: legalRepresentativeAttachment ? this.attachmentJwt(legalRepresentativeAttachment) : undefined,
      allVcs
    };
  }

  // Prepare DIDComm request message
  prepareDidCommRequest(type: string, body: any = {}, attachments: DidCommAttachment[] = []): DidCommMessage {
    return prepareDidCommRequest(type, body, attachments);
  }

  // Include VP token in DIDComm message
  includeVpTokenInMessage(message: DidCommMessage): void {
    const vpToken = this.vpManager.getVpToken();
    if (vpToken) {
      includeVpTokenInMessage(message, vpToken);
    }
  }

  // Include file bytes in DIDComm message
  includeFileInMessage(message: DidCommMessage, fileBytes: Uint8Array, mediaType: string, id: string): void {
    includeFileInMessage(message, fileBytes, mediaType, id);
  }

  // Get THID from DIDComm request message
  getThidFromMessage(message: DidCommMessage): string {
    return getThidFromMessage(message);
  }

  // Generic polling method
  async pollResponse(endpoint: string, thid: string): Promise<DidCommMessage> {
    const response = await this.request({
      method: 'POST',
      url: endpoint,
      body: { thid },
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data as DidCommMessage;
  }

  // Get data results from polling response (array of objects)
  getDataResults(response: DidCommMessage): any[] {
    return getDataResults(response);
  }

  // Other methods...
}
