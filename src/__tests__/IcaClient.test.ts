import axios from 'axios';
import { IcaClient, Sector } from '../IcaClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

    const response = await client.getOrgDidDoc({ orgName: 'Test Org' });
    expect(response).toEqual({ id: 'did-123' });
  });
});

describe('IcaClient with fetch', () => {
  let client: IcaClient;

  beforeEach(() => {
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
    const mockResponse = {
      status: 202,
      headers: new Headers({ location: '/dummy', 'retry-after': '1' }),
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue('')
    };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

    const result = await client.verifyTerms('https://example.com/pdf.pdf');
    expect(result.thid).toBeDefined();
    expect(result.location).toBe('/dummy');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3310/ica/cds-ES/v1/health-care/terms/pdf/contract/_verify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/didcomm-plain+json' },
        body: expect.any(String)
      })
    );
  });

  it('should poll verify terms response with retries using fetch', async () => {
    const mockResponse202 = {
      status: 202,
      headers: new Headers({ 'retry-after': '0' }),
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue('')
    };
    const mockResponse200 = {
      status: 200,
      headers: new Headers(),
      json: jest.fn().mockResolvedValue({ id: 'ok' }),
      text: jest.fn().mockResolvedValue('')
    };
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce(mockResponse202)
      .mockResolvedValueOnce(mockResponse202)
      .mockResolvedValueOnce(mockResponse200);

    const response = await client.pollVerifyTermsResponse('test-thid');
    expect(response).toEqual({ id: 'ok' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should error after max retries using fetch', async () => {
    const mockResponse = {
      status: 202,
      headers: new Headers({ 'retry-after': '0' }),
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue('')
    };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

    await expect(client.pollVerifyTermsResponse('test-thid')).rejects.toThrow(
      'Failed polling verify terms response after 2 attempts'
    );
  });

  it('should get ICA DID document using fetch', async () => {
    const mockResponse = {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest.fn().mockResolvedValue({ did: 'did:web:ica' }),
      text: jest.fn().mockResolvedValue('')
    };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

    const result = await client.getIcaDidDocument();
    expect(result).toEqual({ did: 'did:web:ica' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3310/.well-known/did.json',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('should create org DID document using fetch', async () => {
    const mockResponse = {
      status: 202,
      headers: new Headers({ location: '/create-response', 'retry-after': '1' }),
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue('')
    };
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);

    const result = await client.createOrgDidDocument({ orgName: 'Test Org' });
    expect(result.thid).toBeDefined();
    expect(result.location).toBe('/create-response');
  });

  it('should poll create org DID document response using fetch', async () => {
    const mockResponse202 = {
      status: 202,
      headers: new Headers({ 'retry-after': '0' }),
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue('')
    };
    const mockResponse200 = {
      status: 200,
      headers: new Headers(),
      json: jest.fn().mockResolvedValue({ id: 'did-123' }),
      text: jest.fn().mockResolvedValue('')
    };
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce(mockResponse202)
      .mockResolvedValueOnce(mockResponse200);

    const response = await client.pollCreateOrgDidDocumentResponse('test-thid');
    expect(response).toEqual({ id: 'did-123' });
  });

  it('should get org DID doc using fetch', async () => {
    const mockResponse202 = {
      status: 202,
      headers: new Headers({ 'retry-after': '0' }),
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue('')
    };
    const mockResponse200 = {
      status: 200,
      headers: new Headers(),
      json: jest.fn().mockResolvedValue({ id: 'did-123' }),
      text: jest.fn().mockResolvedValue('')
    };
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce(mockResponse202)
      .mockResolvedValueOnce(mockResponse200);

    const response = await client.getOrgDidDoc({ orgName: 'Test Org' });
    expect(response).toEqual({ id: 'did-123' });
  });

  it('should throw error if no transport available', async () => {
    const clientNoTransport = new IcaClient({
      sector: Sector.AnimalCare,
      didWeb: 'did:web:ica'
    });

    await expect(clientNoTransport.verifyTerms('pdf')).rejects.toThrow(
      'No HTTP transport available: provide axios httpClient or fetch implementation'
    );
  });
});