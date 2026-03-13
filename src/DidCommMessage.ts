// Copyright 2025 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/DidCommMessage.ts

import { DidCommPayload } from 'gdc-common-utils-ts/models/comm';

export interface DidCommAttachment {
  id: string;
  media_type: string;
  data: { links?: string[]; base64?: string; json?: any };
}

export class DidCommMessage implements DidCommPayload {
  id: string;
  type: string;
  from?: string;
  to?: string[];
  thid?: string;
  pthid?: string;
  created_time?: number;
  expires_time?: number;
  body: { [key: string]: any };
  attachments?: DidCommAttachment[];

  constructor() {
    this.id = this.generateId();
    this.type = '';
    this.body = {};
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}