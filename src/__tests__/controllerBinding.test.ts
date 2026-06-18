import {
  buildControllerCredentialMaterial,
  extractRepresentativeBindingProjection,
  findLegalRepresentativeCredentialEntry,
  getLegalRepresentativeCredentialSubject,
  normalizeControllerSameAs,
} from '../controllerBinding';
import { normalizeSameAsHash } from 'gdc-common-utils-ts/utils/same-as';
import { toJwkThumbprintSha256Urn } from 'gdc-common-utils-ts/utils/jwk-thumbprint';
import type { IcaVerifyTermsResponse } from '../types';

const REPRESENTATIVE_ENTRY_TYPE = 'LegalRepresentative-verification-v1.0';
const REPRESENTATIVE_EMAIL = 'Jane.Doe@Example.org';
const REPRESENTATIVE_HASH = normalizeSameAsHash(REPRESENTATIVE_EMAIL);

function buildVerifyResponse(overrides: Partial<IcaVerifyTermsResponse> = {}): IcaVerifyTermsResponse {
  return {
    body: {
      data: [
        {
          type: REPRESENTATIVE_ENTRY_TYPE,
          resource: {
            credentialSubject: {
              sameAs: REPRESENTATIVE_HASH,
              hasCredential: {
                material: 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:controller-thumbprint',
              },
            },
          },
        },
      ],
    },
    ...overrides,
  };
}

describe('controllerBinding helpers', () => {
  it('normalizes controller email into ICA-compatible sameAs', () => {
    expect(normalizeControllerSameAs(REPRESENTATIVE_EMAIL)).toBe(REPRESENTATIVE_HASH);
  });

  it('builds RFC 9278 material from controller public JWK', () => {
    const controllerJwk = {
      kty: 'EC',
      crv: 'P-384',
      x: 'controller-x',
      y: 'controller-y',
    } as const;
    expect(buildControllerCredentialMaterial(controllerJwk)).toBe(toJwkThumbprintSha256Urn(controllerJwk));
  });

  it('falls back to kid when JWK thumbprint inputs are incomplete', () => {
    expect(buildControllerCredentialMaterial({
      kty: 'EC',
      kid: 'controller-es384-001',
    })).toBe('controller-es384-001');
  });

  it('extracts representative binding projection from verify response', () => {
    const response = buildVerifyResponse();
    expect(findLegalRepresentativeCredentialEntry(response)?.type).toBe(REPRESENTATIVE_ENTRY_TYPE);
    expect(getLegalRepresentativeCredentialSubject(response)?.sameAs).toBe(REPRESENTATIVE_HASH);
    expect(extractRepresentativeBindingProjection(response)).toEqual({
      sameAs: REPRESENTATIVE_HASH,
      material: 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:controller-thumbprint',
    });
  });
});
