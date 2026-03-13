// Copyright 2025 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/VcManager.ts

export class VcManager {
  private vcs: string[];

  constructor(initialVcs: string[] = []) {
    this.vcs = initialVcs;
  }

  addVcs(vcs: string[]): void {
    this.vcs.push(...vcs);
  }

  getVcs(): string[] {
    return this.vcs;
  }
}