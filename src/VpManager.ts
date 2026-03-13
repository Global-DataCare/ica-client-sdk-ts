// Copyright 2025 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/VpManager.ts

export class VpManager {
  private vpToken?: string;

  setVpToken(vpToken: string): void {
    this.vpToken = vpToken;
  }

  getVpToken(): string | undefined {
    return this.vpToken;
  }

  // Generate VP without signing (frontend handles signing)
  generateVp(vcs: string[]): any {
    // Return VP structure, but not signed
    return {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      verifiableCredential: vcs
    };
  }
}