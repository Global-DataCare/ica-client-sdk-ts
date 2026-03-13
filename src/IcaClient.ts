// Copyright 2025 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/IcaClient.ts

import { DidCommMessage, DidCommAttachment } from 'gdc-common-utils-ts/utils/didcomm';
import { VcManager } from './VcManager';
import { VpManager } from './VpManager';
import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import { prepareDidCommRequest, includeVpTokenInMessage, includeFileInMessage, getThidFromMessage, getDataResults } from 'gdc-common-utils-ts/utils/didcomm';

dotenv.config();

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
}

export class IcaClient {
  private config: IcaClientConfig;
  private vcManager: VcManager;
  private vpManager: VpManager;
  private httpClient?: AxiosInstance;
  private fetchFn?: typeof fetch;
  private baseUrl: string;
  private jurisdiction: string = 'ES'; // Default, can be configurable
  private retryTimes: number;
  private retryDelayMs: number;

  constructor(config: IcaClientConfig) {
    this.config = config;
    this.vcManager = new VcManager(config.organizationVcs || []);
    this.vpManager = new VpManager();

    this.baseUrl = config.baseUrl || process.env.ICA_BASE_URL || 'http://localhost:3310';
    this.httpClient = config.httpClient || axios.create({ baseURL: this.baseUrl });
    this.fetchFn = config.fetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);

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

  // Verify terms PDF for onboarding
  async verifyTerms(pdfLinkOrBytes: string | Uint8Array): Promise<{ thid: string; location: string }> {
    const message = new DidCommMessage();
    message.type = 'https://globaldatacare.es/didcomm/ica/terms/verify-request/v1';
    message.body = {};

    // Add attachment
    if (typeof pdfLinkOrBytes === 'string') {
      message.attachments = [{
        id: 'signed-terms',
        media_type: 'application/pdf',
        data: { links: [pdfLinkOrBytes] }
      }];
    } else {
      const base64 = Buffer.from(pdfLinkOrBytes).toString('base64');
      message.attachments = [{
        id: 'signed-terms',
        media_type: 'application/pdf',
        data: { base64 }
      }];
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
      const thid = message.thid || message.id;
      return { thid, location };
    } else {
      throw new Error('Unexpected response status: ' + response.status);
    }
  }

  // Poll verify terms response (retry based on Retry-After or default interval)
  async pollVerifyTermsResponse(thid: string): Promise<DidCommMessage> {
    const url = `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/terms/pdf/contract/_verify-response?thid=${thid}`;

    for (let attempt = 0; attempt < this.retryTimes; attempt++) {
      const response = await this.request({
        method: 'POST',
        url,
        body: { thid },
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 200) {
        return response.data as DidCommMessage;
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
    if (contentType.includes('application/json')) {
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

  // Create organization DID document (POST /entity/did/document/_create)
  async createOrgDidDocument(orgData: any): Promise<{ thid: string; location: string }> {
    const message = new DidCommMessage();
    message.type = 'https://globaldatacare.es/didcomm/ica/entity/did/document/create-request/v1';
    message.body = orgData; // e.g., { organizationName, publicKeys, etc. }

    const url = `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/entity/did/document/_create`;
    const response = await this.request({
      method: 'POST',
      url,
      body: message,
      headers: { 'Content-Type': 'application/didcomm-plain+json' }
    });

    if (response.status === 202) {
      const location = response.headers.location;
      const thid = message.thid || message.id;
      return { thid, location };
    } else {
      throw new Error('Unexpected response status: ' + response.status);
    }
  }

  // Poll create org DID document response (POST /_create-response)
  async pollCreateOrgDidDocumentResponse(thid: string): Promise<DidCommMessage> {
    const url = `/ica/cds-${this.jurisdiction}/v1/${this.config.sector}/entity/did/document/_create-response?thid=${thid}`;

    for (let attempt = 0; attempt < this.retryTimes; attempt++) {
      const response = await this.request({
        method: 'POST',
        url,
        body: { thid },
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status === 200) {
        return response.data as DidCommMessage;
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
  async getOrgDidDoc(orgData: any): Promise<DidCommMessage> {
    const { thid } = await this.createOrgDidDocument(orgData);
    return this.pollCreateOrgDidDocumentResponse(thid);
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