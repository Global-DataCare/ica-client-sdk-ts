// Copyright 2026 Antifraud Services Inc. under the Apache License, Version 2.0.
// File: src/controllerBinding.ts

import { toJwkThumbprintSha256Urn } from 'gdc-common-utils-ts/utils/jwk-thumbprint';
import { normalizeSameAsHash } from 'gdc-common-utils-ts/utils/same-as';
import type {
  IcaBundleResponseEntry,
  IcaJwk,
  IcaLegalRepresentativeCredential,
  IcaLegalRepresentativeCredentialSubject,
  IcaVerifyTermsResponse,
} from './types.js';

/**
 * Minimal public JWK subsets supported by the shared RFC 7638 thumbprint
 * helper. The SDK intentionally mirrors the ICA-side accepted shapes so
 * callers can pre-compute or validate controller binding material locally.
 */
type ThumbprintablePublicJwk =
  | { kty: 'EC'; crv: string; x: string; y: string }
  | { kty: 'RSA'; e: string; n: string }
  | { kty: 'OKP'; crv: string; x: string };

/**
 * Canonical representative/controller binding projection extracted from an ICA
 * `LegalRepresentativeCredential`.
 *
 * Contract summary:
 * - `sameAs` expresses public identity continuity, typically an email-derived
 *   `urn:multibase:z...`
 * - `material` expresses controller key continuity, preferably an RFC 9278
 *   JWK-thumbprint URN
 */
export interface IcaRepresentativeBindingProjection {
  sameAs?: string;
  material?: string;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined;
}

function hasTypeName(entry: IcaBundleResponseEntry<unknown>, expected: string): boolean {
  return String(entry.type || '').trim().toLowerCase().includes(expected);
}

function toThumbprintablePublicJwk(jwk: IcaJwk): ThumbprintablePublicJwk | undefined {
  const kty = asNonEmptyString(jwk.kty);
  if (kty === 'EC') {
    const crv = asNonEmptyString(jwk.crv);
    const x = asNonEmptyString(jwk.x);
    const y = asNonEmptyString(jwk.y);
    if (crv && x && y) return { kty: 'EC', crv, x, y };
    return undefined;
  }
  if (kty === 'RSA') {
    const e = asNonEmptyString(jwk.e);
    const n = asNonEmptyString(jwk.n);
    if (e && n) return { kty: 'RSA', e, n };
    return undefined;
  }
  if (kty === 'OKP') {
    const crv = asNonEmptyString(jwk.crv);
    const x = asNonEmptyString(jwk.x);
    if (crv && x) return { kty: 'OKP', crv, x };
    return undefined;
  }
  return undefined;
}

/**
 * Normalizes a controller public alias into the exact same canonical form used
 * by ICA for `controller.sameAs` and `credentialSubject.sameAs`.
 *
 * Typical conversions:
 * - plain email -> `urn:multibase:z...`
 * - bare `z...` -> `urn:multibase:z...`
 * - already-normalized values remain stable
 *
 * @param input Raw controller alias supplied by frontend/BFF code.
 * @returns ICA-compatible canonical alias or `undefined` when empty.
 */
export function normalizeControllerSameAs(input: string | undefined): string | undefined {
  if (!input || !input.trim()) return undefined;
  return normalizeSameAsHash(input) || undefined;
}

/**
 * Builds the canonical controller credential material identifier used by ICA
 * for `credentialSubject.hasCredential.material`.
 *
 * Preferred result:
 * - RFC 9278 JWK-thumbprint URN derived from the public JWK
 *
 * Fallback:
 * - `kid` when the provided JWK does not expose enough public parameters to
 *   derive an RFC 7638 thumbprint
 *
 * @param publicJwk Controller public signing/binding JWK.
 * @returns Stable material identifier or `undefined` when no usable JWK data exists.
 */
export function buildControllerCredentialMaterial(publicJwk: IcaJwk | undefined): string | undefined {
  if (!publicJwk) return undefined;
  const thumbprintable = toThumbprintablePublicJwk(publicJwk);
  if (thumbprintable) {
    return toJwkThumbprintSha256Urn(thumbprintable as Parameters<typeof toJwkThumbprintSha256Urn>[0]);
  }
  return asNonEmptyString(publicJwk.kid);
}

/**
 * Finds the representative credential entry inside an ICA `_verify-response`
 * DIDComm bundle.
 *
 * The helper is intentionally tolerant to current ICA naming variants:
 * - `LegalRepresentative-verification-v1.0`
 * - entries whose `type` includes `personcredential`
 *
 * @param response Parsed DIDComm bundle returned by ICA.
 * @returns Matching bundle entry or `undefined` when no representative VC exists.
 */
export function findLegalRepresentativeCredentialEntry(
  response: IcaVerifyTermsResponse,
): IcaBundleResponseEntry<IcaLegalRepresentativeCredential> | undefined {
  const entries = Array.isArray(response.body?.data) ? response.body.data : [];
  const match = entries.find((entry) => (
    hasTypeName(entry, 'legalrepresentative')
    || hasTypeName(entry, 'personcredential')
  ));
  return match as IcaBundleResponseEntry<IcaLegalRepresentativeCredential> | undefined;
}

/**
 * Extracts the representative credential subject from an ICA `_verify-response`
 * bundle.
 *
 * @param response Parsed DIDComm bundle returned by ICA.
 * @returns Representative credential subject or `undefined` when absent.
 */
export function getLegalRepresentativeCredentialSubject(
  response: IcaVerifyTermsResponse,
): IcaLegalRepresentativeCredentialSubject | undefined {
  const entry = findLegalRepresentativeCredentialEntry(response);
  const subject = asObject(entry?.resource?.credentialSubject);
  return subject as IcaLegalRepresentativeCredentialSubject | undefined;
}

/**
 * Reads the representative binding projection (`sameAs` + key material) from an
 * ICA `_verify-response` bundle.
 *
 * This helper is intentionally read-only. It does not try to "fix" missing
 * fields; it only exposes what ICA actually emitted for the representative VC.
 *
 * @param response Parsed DIDComm bundle returned by ICA.
 * @returns Binding projection with any emitted fields.
 */
export function extractRepresentativeBindingProjection(
  response: IcaVerifyTermsResponse,
): IcaRepresentativeBindingProjection {
  const subject = getLegalRepresentativeCredentialSubject(response);
  const hasCredential = asObject(subject?.hasCredential);
  const sameAs = asNonEmptyString(subject?.sameAs);
  const material = asNonEmptyString(hasCredential?.material);
  return {
    ...(sameAs ? { sameAs } : {}),
    ...(material ? { material } : {}),
  };
}
