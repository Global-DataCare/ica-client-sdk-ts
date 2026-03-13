// Copyright 2025 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/index.ts

// ICA Client SDK Entry Point

export { IcaClient } from './IcaClient';
export { DidCommMessage, DidCommAttachment } from 'gdc-common-utils-ts/utils/didcomm';
export { VcManager } from './VcManager';
export { VpManager } from './VpManager';

// Shared utilities from gdc-common-utils-ts
export { prepareDidCommRequest, includeVpTokenInMessage, includeFileInMessage, getThidFromMessage, getDataResults } from 'gdc-common-utils-ts/utils/didcomm';