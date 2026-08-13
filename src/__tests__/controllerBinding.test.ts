import {
  buildControllerCredentialMaterial,
  extractRepresentativeBindingProjection,
  findLegalRepresentativeCredentialEntry,
  extractOrganizationControllerBindingProjections,
  extractServiceControllerBindingProjections,
  findOrganizationControllerCredentialEntries,
  getOrganizationControllerCredentialSubjects,
  getServiceControllerCredentialSubjects,
  getLegalRepresentativeCredentialSubject,
  normalizeControllerSameAs,
} from '../controllerBinding';
import { normalizeSameAsHash } from 'gdc-common-utils-ts/utils/same-as';
import { toJwkThumbprintSha256Urn } from 'gdc-common-utils-ts/utils/jwk-thumbprint';
import type { IcaVerifyTermsResponse } from '../types';

const REPRESENTATIVE_ENTRY_TYPE = 'LegalRepresentative-verification-v1.0';
const CONTROLLER_ENTRY_TYPE = 'ServiceController-verification-v1.0';
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

  it('extracts every independent organization controller without substituting the representative', () => {
    const response = buildVerifyResponse();
    response.body?.data?.push({
      type: CONTROLLER_ENTRY_TYPE,
      resource: {
        type: ['VerifiableCredential', 'ServiceCredential', 'ServiceControllerCredential'],
        credentialSubject: {
          id: 'did:web:tenant.example.org',
          '@type': 'Service',
          owner: {
            '@type': 'Person',
            additionalType: 'RESPRSN',
            sameAs: 'urn:multibase:zTechnicalController',
            hasOccupation: { '@type': 'Occupation', occupationalCategory: 'ISCO-08|1330' },
            hasCredential: {
              material: 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:technical-controller',
            },
          },
        },
      },
    });

    expect(findOrganizationControllerCredentialEntries(response)).toHaveLength(1);
    expect(getOrganizationControllerCredentialSubjects(response)[0]?.owner?.sameAs)
      .toBe('urn:multibase:zTechnicalController');
    expect(getServiceControllerCredentialSubjects(response)[0]?.owner?.sameAs)
      .toBe('urn:multibase:zTechnicalController');
    expect(extractOrganizationControllerBindingProjections(response)).toEqual([{
      sameAs: 'urn:multibase:zTechnicalController',
      material: 'urn:ietf:params:oauth:jwk-thumbprint:sha-256:technical-controller',
      roleCodes: ['RESPRSN'],
      occupationCodes: ['ISCO-08|1330'],
    }]);
    expect(extractServiceControllerBindingProjections(response))
      .toEqual(extractOrganizationControllerBindingProjections(response));
  });

  it('returns no organization controller projection for a legacy two-credential response', () => {
    const response = buildVerifyResponse();
    expect(findOrganizationControllerCredentialEntries(response)).toEqual([]);
    expect(getOrganizationControllerCredentialSubjects(response)).toEqual([]);
    expect(extractOrganizationControllerBindingProjections(response)).toEqual([]);
  });
});
