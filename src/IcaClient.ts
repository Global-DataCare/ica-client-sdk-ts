// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/IcaClient.ts

import type { DidCommAttachment, DidCommMessage } from 'gdc-common-utils-ts/utils/didcomm';
import { VcManager } from './VcManager';
import { VpManager } from './VpManager';
import axios, { AxiosInstance } from 'axios';
import { prepareDidCommRequest, includeVpTokenInMessage, includeFileInMessage, getThidFromMessage, getDataResults } from 'gdc-common-utils-ts/utils/didcomm';
import {
  CreateOrgDidDocumentRequest,
  IcaConfiguredPublicKey,
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
  IcaOrganizationCredential,
  IcaOrganizationCredentialSubject,
  IcaVerifyResponseKeyMaterial,
  IcaVerifyTermsResource,
  IcaVerifyTermsResponse,
  VerifyTermsOptions
} from './types';
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

  clearControllerMessageSigningPublicKey(): void {
    this.messageSigningPublicKey = undefined;
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

  // Verify terms PDF for onboarding
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

    const message = this.createFapiMessage(
      'https://globaldatacare.es/didcomm/ica/terms/verify-request/v1',
      options.body || {},
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

    if (!controllerSameAs) {
      throw new Error(
        'Missing required DID document fields. Frontend must provide controller sameAs directly or via the legal representative VC.',
      );
    }

    if (!organization.identifier && !(organization.url && organization.taxID)) {
      throw new Error('Missing required organization identifier or organization url+taxID.');
    }

    const payload: CreateOrgDidDocumentRequest = {
      organization,
      controller: {
        sameAs: controllerSameAs,
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

  getControllerKeyMaterialFromVerifyResponse(response: IcaVerifyTermsResponse): IcaVerifyResponseKeyMaterial {
    const entry = this.getResponseEntries<IcaVerifyTermsResource>(response)
      .find(candidate => this.isLegalRepresentativeCredentialEntry(candidate));
    return {
      publicKeyJwk: entry?.publicKeyJwk,
      keySource: entry?.keySource
    };
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
