import axios from 'axios';
import { IcaClient, Sector } from '../IcaClient';
import { IcaCrypto, IcaVerifyTermsResponse } from '../types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createMockResponse(status: number, headers: Headers = new Headers(), data: any = {}) {
  return {
    status,
    headers,
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(JSON.stringify(data)),
    ok: status >= 200 && status < 300,
    statusText: '',
    type: 'basic',
    url: 'http://localhost:3310',
    redirected: false,
    clone: () => ({} as Response),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    blob: jest.fn().mockResolvedValue(new Blob([])),
    formData: jest.fn().mockResolvedValue(new FormData())
  } as unknown as Response;
}

function createVerifyResponseExample(): IcaVerifyTermsResponse {
  return {
    jti: 'urn:uuid:verify-resp-001',
    iss: 'did:web:localhost%3A3310',
    aud: 'did:web:localhost%3A3310',
    thid: 'verify-terms-001',
    type: 'application/bundle-api+json',
    attachments: [
      {
        id: 'vc-jwt-1',
        format: 'vc+jwt',
        media_type: 'application/vc+jwt',
        filename: 'Organization-verification-v1.0-1.jwt',
        data: {
          json: {
            format: 'vc+jwt',
            jwt: '<vc-jwt-organization>'
          }
        }
      },
      {
        id: 'vc-jwt-2',
        format: 'vc+jwt',
        media_type: 'application/vc+jwt',
        filename: 'LegalRepresentative-verification-v1.0-2.jwt',
        data: {
          json: {
            format: 'vc+jwt',
            jwt: '<vc-jwt-legal-representative>'
          }
        }
      }
    ],
    body: {
      resourceType: 'Bundle',
      type: 'batch-response',
      total: 2,
      data: [
        {
          type: 'Organization-verification-v1.0',
          publicKeyJwk: {
            kty: 'EC',
            crv: 'P-384',
            x: 'org-pub-x',
            y: 'org-pub-y',
            alg: 'ES384',
            kid: 'org-es384-001'
          },
          privateKeyJwk: {
            kty: 'EC',
            crv: 'P-384',
            x: 'org-pub-x',
            y: 'org-pub-y',
            d: 'org-priv-d',
            alg: 'ES384',
            kid: 'org-es384-001'
          },
          keySource: 'generated',
          response: { status: '200' },
          resource: {
            id: 'urn:uuid:org-vc-001',
            type: ['VerifiableCredential', 'OrganizationCredential'],
            issuer: 'did:web:localhost%3A3310',
            credentialSubject: {
              id: 'did:web:globaldatacare.es:animal-care:organization:taxid:VATES-B00000000',
              '@type': 'Organization',
              legalName: 'Example Data Provider SL',
              taxID: 'VATES-B00000000',
              sameAs: 'did:web:provider.example.org',
              url: 'provider.example.org',
              alternateName: 'example-provider'
            }
          }
        },
        {
          type: 'LegalRepresentative-verification-v1.0',
          publicKeyJwk: {
            kty: 'EC',
            crv: 'P-384',
            x: 'controller-x',
            y: 'controller-y',
            alg: 'ES384',
            kid: 'controller-es384-001'
          },
          response: { status: '200' },
          resource: {
            id: 'urn:uuid:person-vc-001',
            type: ['VerifiableCredential', 'PersonCredential', 'LegalRepresentativeCredential'],
            issuer: 'did:web:localhost%3A3310',
            credentialSubject: {
              id: 'urn:person:identifier:IDCES-99999999R',
              '@type': 'Person',
              name: 'Alex Example',
              givenName: 'Alex',
              familyName: 'Example',
              identifier: 'IDCES-99999999R',
              nationality: 'ES',
              sameAs: 'urn:multibase:zControllerHash',
              alternateName: 'controller-es384-001',
              additionalType: 'ES384',
              memberOf: {
                '@type': 'Organization',
                legalName: 'Example Data Provider SL',
                taxID: 'VATES-B00000000'
              }
            }
          }
        }
      ]
    }
  };
}

describe('IcaClient', () => {
  let client: IcaClient;

  beforeEach(() => {
    mockedAxios.create.mockReturnValue(mockedAxios);
    mockedAxios.post.mockReset();

    if (!mockedAxios.request) {
      mockedAxios.request = jest.fn();
    }
    mockedAxios.request.mockReset();

    client = new IcaClient({
      sector: Sector.AnimalCare,
      didWeb: 'did:web:ica',
      baseUrl: 'http://localhost:3310',
      retryTimes: 3,
      retryDelayMs: 1
    });
  });

  it('should initialize client', () => {
    expect(client).toBeDefined();
  });

  it('should verify terms via link', async () => {
    mockedAxios.request?.mockResolvedValueOnce({
      status: 202,
      headers: { location: '/dummy', 'retry-after': '1' }
    });

    const result = await client.verifyTerms('https://example.com/pdf.pdf');
    expect(result.thid).toBeDefined();
    expect(result.location).toBe('/dummy');
    expect(mockedAxios.request).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        jti: expect.any(String),
        thid: expect.any(String),
        type: 'https://globaldatacare.es/didcomm/ica/terms/verify-request/v1',
      })
    }));
    const requestPayload: any = mockedAxios.request.mock.calls[0]?.[0]?.data;
    expect(requestPayload?.thid).toBe(requestPayload?.jti);
    expect(requestPayload?.id).toBeUndefined();
    expect(requestPayload?.attachments?.[0]?.id).toMatch(UUID_V4_REGEX);
    expect(requestPayload?.attachments?.[0]?.media_type).toBe('application/pdf');
  });

  it('should verify terms via bytes with generated UUID attachment id', async () => {
    mockedAxios.request?.mockResolvedValueOnce({
      status: 202,
      headers: { location: '/dummy', 'retry-after': '1' }
    });

    const result = await client.verifyTerms(new Uint8Array([1, 2, 3]));

    expect(result.thid).toBeDefined();
    expect(result.location).toBe('/dummy');
    const requestPayload: any = mockedAxios.request.mock.calls[0]?.[0]?.data;
    expect(requestPayload?.attachments?.[0]?.id).toMatch(UUID_V4_REGEX);
    expect(requestPayload?.attachments?.[0]?.media_type).toBe('application/pdf');
    expect(requestPayload?.attachments?.[0]?.data?.base64).toBeDefined();
  });

  it('should include optional verify body and meta payload', async () => {
    mockedAxios.request?.mockResolvedValueOnce({
      status: 202,
      headers: { location: '/dummy', 'retry-after': '1' }
    });

    await client.verifyTerms('https://example.com/pdf.pdf', {
      body: {
        onboardingVersion: 'v2-preview'
      },
      meta: {
        jws: {
          protected: {
            alg: 'ES384',
            kid: 'org-es384-key-001',
            jwk: { kty: 'EC', crv: 'P-384', x: 'org-x', y: 'org-y' }
          }
        }
      }
    });

    const requestPayload: any = mockedAxios.request.mock.calls[0]?.[0]?.data;
    expect(requestPayload?.body?.onboardingVersion).toBe('v2-preview');
    expect(requestPayload?.meta?.jws?.protected?.kid).toBe('org-es384-key-001');
    expect(requestPayload?.meta?.jws?.protected?.jwk).toEqual({
      kty: 'EC',
      crv: 'P-384',
      x: 'org-x',
      y: 'org-y'
    });
  });

  it('should populate verify meta.jws.protected from setControllerMessageSigningPublicKey', async () => {
    mockedAxios.request?.mockResolvedValueOnce({
      status: 202,
      headers: { location: '/dummy', 'retry-after': '1' }
    });

    client.setControllerMessageSigningPublicKey('ES384', 'msg-es384-001', {
      kty: 'EC',
      crv: 'P-384',
      x: 'msg-x',
      y: 'msg-y'
    });

    await client.verifyTerms('https://example.com/pdf.pdf');

    const requestPayload: any = mockedAxios.request.mock.calls[0]?.[0]?.data;
    expect(requestPayload?.meta?.jws?.protected).toEqual({
      alg: 'ES384',
      kid: 'msg-es384-001',
      jwk: {
        kty: 'EC',
        crv: 'P-384',
        x: 'msg-x',
        y: 'msg-y'
      }
    });
  });

  it('should attach organization public JWK in verifyTerms when setOrgCredentialSigningPublicKey is configured', async () => {
    mockedAxios.request?.mockResolvedValueOnce({
      status: 202,
      headers: { location: '/dummy', 'retry-after': '1' }
    });

    client.setOrgCredentialSigningPublicKey('ES384', 'org-cred-es384-001', {
      kty: 'EC',
      crv: 'P-384',
      x: 'org-cred-x',
      y: 'org-cred-y'
    });

    await client.verifyTerms('https://example.com/pdf.pdf');

    const requestPayload: any = mockedAxios.request.mock.calls[0]?.[0]?.data;
    expect(requestPayload?.attachments).toHaveLength(2);
    expect(requestPayload?.attachments?.[1]).toEqual({
      id: expect.stringContaining('-organization-public-jwk'),
      media_type: 'application/jwk+json',
      filename: 'organization-public-key.jwk.json',
      data: {
        json: {
          kty: 'EC',
          crv: 'P-384',
          x: 'org-cred-x',
          y: 'org-cred-y',
          alg: 'ES384',
          kid: 'org-cred-es384-001'
        }
      }
    });
  });

  it('should prefer injected crypto for attachment UUID generation', async () => {
    const injectedCrypto: IcaCrypto = {
      randomUUID: jest.fn(() => '11111111-2222-4333-8444-555555555555')
    };
    const clientWithInjectedCrypto = new IcaClient({
      sector: Sector.AnimalCare,
      didWeb: 'did:web:ica',
      baseUrl: 'http://localhost:3310',
      retryTimes: 3,
      retryDelayMs: 1,
      crypto: injectedCrypto
    });

    mockedAxios.request?.mockResolvedValueOnce({
      status: 202,
      headers: { location: '/dummy', 'retry-after': '1' }
    });

    await clientWithInjectedCrypto.verifyTerms('https://example.com/pdf.pdf');

    expect(injectedCrypto.randomUUID).toHaveBeenCalledTimes(1);
    const requestPayload: any = mockedAxios.request.mock.calls[0]?.[0]?.data;
    expect(requestPayload?.attachments?.[0]?.id).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('should throw when neither injected crypto nor global crypto is available', async () => {
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true
    });

    try {
      const clientWithoutCrypto = new IcaClient({
        sector: Sector.AnimalCare,
        didWeb: 'did:web:ica',
        baseUrl: 'http://localhost:3310',
        retryTimes: 3,
        retryDelayMs: 1
      });

      await expect(clientWithoutCrypto.verifyTerms('https://example.com/pdf.pdf')).rejects.toThrow(
        'Provide IcaClientConfig.crypto or ensure globalThis.crypto is available.'
      );
    } finally {
      if (originalCryptoDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
      } else {
        delete (globalThis as typeof globalThis & { crypto?: IcaCrypto }).crypto;
      }
    }
  });

  it('should poll verify terms response with retries', async () => {
    mockedAxios.request
      ?.mockResolvedValueOnce({ status: 202, headers: { 'retry-after': '0' } })
      .mockResolvedValueOnce({ status: 202, headers: { 'retry-after': '0' } })
      .mockResolvedValueOnce({ status: 200, data: { id: 'ok' } });

    const response = await client.pollVerifyTermsResponse('test-thid');
    expect(response).toEqual({ id: 'ok' });
    expect(mockedAxios.request).toHaveBeenCalledTimes(3);
  });

  it('should error after max retries', async () => {
    mockedAxios.request
      ?.mockResolvedValue({ status: 202, headers: { 'retry-after': '0' } });

    await expect(client.pollVerifyTermsResponse('test-thid')).rejects.toThrow(
      'Failed polling verify terms response after 3 attempts'
    );
  });

  it('should create and get org did doc (retry behaviour)', async () => {
    mockedAxios.request
      ?.mockResolvedValueOnce({ status: 202, headers: { 'retry-after': '0' } })
      .mockResolvedValueOnce({ status: 200, data: { id: 'did-123' } });

    const response = await client.getOrgDidDoc({
      organization: {
        identifier: 'did:web:org.example:animal-care:organization:taxid:VATES-1234',
        publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x1', y: 'y1' }
      },
      controller: {
        sameAs: 'did:web:rep.example',
        publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x2', y: 'y2' }
      }
    });
    expect(response).toEqual({ id: 'did-123' });
  });

  it('should create org DID document from VCs', async () => {
    const verifyResponse = createVerifyResponseExample();
    const orgVc = verifyResponse.body?.data?.[0]?.resource;
    const repVc = verifyResponse.body?.data?.[1]?.resource;

    mockedAxios.request
      ?.mockResolvedValueOnce({ status: 202, headers: { location: '/dummy', 'retry-after': '1' } });

    const result = await client.createOrgDidDocumentFromVcs({
      organizationVC: orgVc,
      legalRepresentativeVC: repVc,
      organizationPublicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'org-x', y: 'org-y' },
      controllerPublicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'rep-x', y: 'rep-y' }
    });

    expect(result.location).toBe('/dummy');
    expect(mockedAxios.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }));
    expect(mockedAxios.request).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        jti: expect.any(String),
        thid: expect.any(String),
        body: {
          data: [
            {
              resource: {
                organization: expect.objectContaining({
                  identifier: 'did:web:globaldatacare.es:animal-care:organization:taxid:VATES-B00000000',
                  publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'org-x', y: 'org-y' }
                }),
                controller: expect.objectContaining({
                  sameAs: 'urn:multibase:zControllerHash',
                  publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'rep-x', y: 'rep-y' }
                })
              }
            }
          ]
        }
      })
    }));
    const requestPayload: any = mockedAxios.request.mock.calls[0]?.[0]?.data;
    expect(requestPayload?.thid).toBe(requestPayload?.jti);
    expect(requestPayload?.id).toBeUndefined();
  });

  it('should include optional jwks in DID document creation payload', async () => {
    mockedAxios.request
      ?.mockResolvedValueOnce({ status: 202, headers: { location: '/dummy', 'retry-after': '1' } });

    await client.createOrgDidDocument({
      organization: {
        identifier: 'did:web:org.example:animal-care:organization:taxid:VATES-1234',
        publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x1', y: 'y1' },
        jwks: {
          keys: [
            {
              kid: 'org-didcomm-enc-001',
              kty: 'EC',
              crv: 'P-384',
              x: 'org-enc-x',
              y: 'org-enc-y',
              use: 'enc',
              purposes: ['didcomm-enc']
            }
          ]
        }
      },
      controller: {
        sameAs: 'did:web:rep.example',
        publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x2', y: 'y2' },
        jwks: {
          keys: [
            {
              kid: 'controller-didcomm-sign-001',
              kty: 'EC',
              crv: 'P-384',
              x: 'controller-sign-x',
              y: 'controller-sign-y',
              use: 'sig',
              purposes: ['didcomm-sign']
            }
          ]
        }
      }
    });

    expect(mockedAxios.request).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        body: {
          data: [
            {
              resource: {
                organization: expect.objectContaining({
                  jwks: {
                    keys: [expect.objectContaining({ kid: 'org-didcomm-enc-001', purposes: ['didcomm-enc'] })]
                  }
                }),
                controller: expect.objectContaining({
                  jwks: {
                    keys: [expect.objectContaining({ kid: 'controller-didcomm-sign-001', purposes: ['didcomm-sign'] })]
                  }
                })
              }
            }
          ]
        }
      })
    }));
  });

  it('should use setOrgCredentialSigningPublicKey as fallback in createOrgDidDocument', async () => {
    mockedAxios.request
      ?.mockResolvedValueOnce({ status: 202, headers: { location: '/dummy', 'retry-after': '1' } });

    client.setOrgCredentialSigningPublicKey('ES384', 'cred-es384-001', {
      kty: 'EC',
      crv: 'P-384',
      x: 'cred-x',
      y: 'cred-y'
    });

    await client.createOrgDidDocument({
      organization: {
        identifier: 'did:web:org.example:animal-care:organization:taxid:VATES-1234'
      },
      controller: {
        sameAs: 'did:web:rep.example',
        publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x2', y: 'y2' }
      }
    });

    const requestPayload: any = mockedAxios.request.mock.calls[0]?.[0]?.data;
    expect(requestPayload?.body?.data?.[0]?.resource?.organization?.publicKeyJwk).toEqual({
      kty: 'EC',
      crv: 'P-384',
      x: 'cred-x',
      y: 'cred-y',
      alg: 'ES384',
      kid: 'cred-es384-001'
    });
  });

  it('should throw if required did document fields missing', async () => {
    await expect(client.createOrgDidDocumentFromVcs({
      controllerPublicKeyJwk: { kty: 'EC' }
    }))
      .rejects.toThrow('Missing required DID document fields');
  });

  it('should extract credentials, subjects, and VC JWTs from verify response', () => {
    const response = createVerifyResponseExample();

    const credentials = client.getCredentialsFromVerifyResponse(response);
    const vcs = client.getVcsFromResponse(response);

    expect(credentials.organizationCredential?.credentialSubject?.legalName).toBe('Example Data Provider SL');
    expect(credentials.legalRepresentativeCredential?.credentialSubject?.sameAs).toBe('urn:multibase:zControllerHash');
    expect(credentials.allCredentials).toHaveLength(2);
    expect(client.getOrganizationInfoFromVerifyResponse(response)?.taxID).toBe('VATES-B00000000');
    expect(client.getLegalRepresentativeInfoFromVerifyResponse(response)?.givenName).toBe('Alex');
    expect(client.getLegalRepresentativeInfoFromVerifyResponse(response)?.familyName).toBe('Example');
    expect(client.getLegalRepresentativeInfoFromVerifyResponse(response)?.identifier).toBe('IDCES-99999999R');
    expect(vcs.organizationVC).toBe('<vc-jwt-organization>');
    expect(vcs.legalRepresentativeVC).toBe('<vc-jwt-legal-representative>');
    expect(vcs.allVcs).toEqual(['<vc-jwt-organization>', '<vc-jwt-legal-representative>']);
    expect(client.getOrganizationKeyMaterialFromVerifyResponse(response)).toEqual({
      publicKeyJwk: expect.objectContaining({ kid: 'org-es384-001' }),
      privateKeyJwk: expect.objectContaining({ d: 'org-priv-d' }),
      keySource: 'generated'
    });
    expect(client.getControllerKeyMaterialFromVerifyResponse(response)).toEqual({
      publicKeyJwk: expect.objectContaining({ kid: 'controller-es384-001' }),
      keySource: undefined
    });
  });
});

describe('IcaClient with fetch', () => {
  let client: IcaClient;

  beforeEach(() => {
    mockedAxios.create.mockReset();
    mockedAxios.create.mockReturnValue(undefined as any);

    // Mock global fetch
    const mockFetch = jest.fn();
    global.fetch = mockFetch;
    mockFetch.mockReset();
    client = new IcaClient({
      sector: Sector.HealthCare,
      didWeb: 'did:web:ica',
      baseUrl: 'http://localhost:3310',
      retryTimes: 2,
      retryDelayMs: 1,
      fetch: mockFetch
    });
  });

  it('should initialize client with fetch', () => {
    expect(client).toBeDefined();
  });

  it('should verify terms via link using fetch', async () => {
    const mockResponse = createMockResponse(202, new Headers({ location: '/dummy', 'retry-after': '1' }), {});
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

    const result = await client.verifyTerms('https://example.com/pdf.pdf');
    expect(result.thid).toBeDefined();
    expect(result.location).toBe('/dummy');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3310/ica/cds-ES/v1/health-care/terms/pdf/contract/_verify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/didcomm-plain+json' },
        body: expect.any(String)
      })
    );
    const rawBody = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0]?.[1]?.body;
    const requestPayload: any = typeof rawBody === 'string' ? JSON.parse(rawBody) : undefined;
    expect(requestPayload?.jti).toEqual(expect.any(String));
    expect(requestPayload?.thid).toBe(requestPayload?.jti);
    expect(requestPayload?.id).toBeUndefined();
    expect(requestPayload?.attachments?.[0]?.id).toMatch(UUID_V4_REGEX);
    expect(requestPayload?.attachments?.[0]?.media_type).toBe('application/pdf');
  });

  it('should poll verify terms response with retries using fetch', async () => {
    const mockResponse202 = createMockResponse(202, new Headers({ 'retry-after': '0' }), {});
    const mockResponse200 = createMockResponse(200, new Headers({ 'content-type': 'application/didcomm-plain+json' }), { id: 'ok' });
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce(mockResponse202)
      .mockResolvedValueOnce(mockResponse200);

    const response = await client.pollVerifyTermsResponse('test-thid');
    expect(response).toEqual({ id: 'ok' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should error after max retries using fetch', async () => {
    const mockResponse = createMockResponse(202, new Headers({ 'retry-after': '0' }), {});
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

    await expect(client.pollVerifyTermsResponse('test-thid')).rejects.toThrow(
      'Failed polling verify terms response after 2 attempts'
    );
  });

  it('should get ICA DID document using fetch', async () => {
    const mockResponse = createMockResponse(200, new Headers({ 'content-type': 'application/json' }), { did: 'did:web:ica' });
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

    const result = await client.getIcaDidDocument();
    expect(result).toEqual({ did: 'did:web:ica' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3310/.well-known/did.json',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('should create org DID document using fetch', async () => {
    const mockResponse = createMockResponse(202, new Headers({ location: '/create-response', 'retry-after': '1' }), {});
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

    const result = await client.createOrgDidDocument({
      organization: {
        identifier: 'did:web:org.example:animal-care:organization:taxid:VATES-1234',
        publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x1', y: 'y1' }
      },
      controller: {
        sameAs: 'did:web:rep.example',
        publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x2', y: 'y2' }
      }
    });
    expect(result.thid).toBeDefined();
    expect(result.location).toBe('/create-response');
    const rawBody = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0]?.[1]?.body;
    const requestPayload: any = typeof rawBody === 'string' ? JSON.parse(rawBody) : undefined;
    expect(requestPayload?.jti).toEqual(expect.any(String));
    expect(requestPayload?.thid).toBe(requestPayload?.jti);
    expect(requestPayload?.id).toBeUndefined();
  });

  it('should poll create org DID document response using fetch', async () => {
    const mockResponse202 = createMockResponse(202, new Headers({ 'retry-after': '0' }), {});
    const mockResponse200 = createMockResponse(200, new Headers({ 'content-type': 'application/didcomm-plain+json' }), { id: 'did-123' });
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce(mockResponse202)
      .mockResolvedValueOnce(mockResponse200);

    const response = await client.pollCreateOrgDidDocumentResponse('test-thid');
    expect(response).toEqual({ id: 'did-123' });
  });

  it('should get org DID doc using fetch', async () => {
    const mockResponse202 = createMockResponse(202, new Headers({ 'retry-after': '0' }), {});
    const mockResponse200 = createMockResponse(200, new Headers({ 'content-type': 'application/didcomm-plain+json' }), { id: 'did-123' });
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce(mockResponse202)
      .mockResolvedValueOnce(mockResponse200);

    const response = await client.getOrgDidDoc({
      organization: {
        identifier: 'did:web:org.example:animal-care:organization:taxid:VATES-1234',
        publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x1', y: 'y1' }
      },
      controller: {
        sameAs: 'did:web:rep.example',
        publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x2', y: 'y2' }
      }
    });
    expect(response).toEqual({ id: 'did-123' });
  });

  it('should throw error if no transport available', async () => {
    Reflect.set(globalThis as object, 'fetch', undefined);

    const clientNoTransport = new IcaClient({
      sector: Sector.AnimalCare,
      didWeb: 'did:web:ica'
    });

    await expect(clientNoTransport.verifyTerms('pdf')).rejects.toThrow(
      'No HTTP transport available: provide axios httpClient or fetch implementation'
    );
  });
});
