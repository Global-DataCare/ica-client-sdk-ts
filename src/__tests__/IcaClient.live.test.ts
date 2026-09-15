// Flow contract: reuse shared test fixtures and canonical types; do not introduce duplicated literals.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildControllerCredentialMaterial,
  extractRepresentativeBindingProjection,
  findLegalRepresentativeCredentialEntry,
  IcaClient,
  normalizeControllerSameAs,
  Sector,
} from '../index';
import type {
  IcaRepresentativeBindingProjection,
  IcaVerifyTermsResponse,
} from '../index';

const LIVE_E2E_FLAG = 'ICA_LIVE_E2E';
const LIVE_E2E_BASE_URL_ENV = 'ICA_BASE_URL';
const LIVE_E2E_PDF_PATH_ENV = 'ICA_LIVE_E2E_PDF_PATH';
const LIVE_E2E_TIMEOUT_MS = 180_000;
const LIVE_E2E_RETRY_TIMES = 30;
const LIVE_E2E_RETRY_DELAY_MS = 1_500;
const DEMO_REPRESENTATIVE_EMAIL = 'sdk.live.controller@example.org';
const REPRESENTATIVE_ENTRY_KEY = 'publicKeyJwk';
const CONTROLLER_SIGNING_ALG = 'ES384';
const CONTROLLER_SIGNING_KID = 'sdk-live-controller-es384-001';
const FIXTURE_FILENAME = 'prueba-TEST-A4-multisign-fnmt.pdf';

const CONTROLLER_BINDING_PUBLIC_JWK = {
  kty: 'EC',
  crv: 'P-384',
  x: 'IKRpT3P3KvzAdM2HBSDd9iEORqySnK15req-d8Czwq5w_cFm90_QkH-PPSX3YRIz',
  y: '7k5iaAexNPo-qiT2JNE0fnWcC1f7tueyImBgcMXsJq-zoV-SRbm8gkLqm5fFV6Ng',
} as const;
const DEVICE_COMMUNICATION_PUBLIC_JWK = {
  kty: 'EC',
  crv: 'P-384',
  x: 'device-communication-x',
  y: 'device-communication-y',
} as const;
const ORGANIZATION_PUBLIC_JWK = generateKeyPairSync('ec', {
  namedCurve: 'secp384r1',
}).publicKey.export({ format: 'jwk' });

/**
 * `jest` compiles this TypeScript file in place, so we can derive the current
 * repository root without relying on `process.cwd()` being stable across
 * callers or CI wrappers.
 */
const CURRENT_DIRNAME = path.dirname(fileURLToPath(import.meta.url));

/**
 * All live test literals are centralized here so the suite stays didactic and
 * easy to reuse against another local ICA instance.
 */
const LIVE_E2E_CONFIG = {
  baseUrl: process.env[LIVE_E2E_BASE_URL_ENV] || 'http://localhost:3310',
  retryTimes: LIVE_E2E_RETRY_TIMES,
  retryDelayMs: LIVE_E2E_RETRY_DELAY_MS,
  sector: Sector.HealthCare,
  representativeEmail: DEMO_REPRESENTATIVE_EMAIL,
  controllerSigningAlg: CONTROLLER_SIGNING_ALG,
  controllerSigningKid: CONTROLLER_SIGNING_KID,
  controllerBindingPublicJwk: CONTROLLER_BINDING_PUBLIC_JWK,
  deviceCommunicationPublicJwk: DEVICE_COMMUNICATION_PUBLIC_JWK,
  expectedRepresentativeSameAs: normalizeControllerSameAs(DEMO_REPRESENTATIVE_EMAIL),
  expectedControllerMaterial: buildControllerCredentialMaterial(CONTROLLER_BINDING_PUBLIC_JWK),
} as const;

/**
 * Returns `true` only when the caller intentionally opted into real HTTP
 * traffic against a running ICA demo instance.
 */
function isLiveE2eEnabled(): boolean {
  return process.env[LIVE_E2E_FLAG] === '1';
}

/**
 * Resolves the PDF fixture path from environment override first, then from the
 * sibling `dataspace-ica-ts/examples/` workspace layout used in local
 * development.
 */
function resolveLivePdfPath(): string {
  const explicit = process.env[LIVE_E2E_PDF_PATH_ENV];
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const candidatePaths = [
    path.resolve(
      CURRENT_DIRNAME,
      '..',
      '..',
      '..',
      'examples',
      FIXTURE_FILENAME,
    ),
    path.resolve(
      CURRENT_DIRNAME,
      '..',
      '..',
      '..',
      'dataspace-ica-ts',
      'examples',
      FIXTURE_FILENAME,
    ),
  ];

  const existingCandidate = candidatePaths.find((candidatePath) => existsSync(candidatePath));
  return existingCandidate || candidatePaths[0];
}

/**
 * Reads the live PDF fixture once and fails early with a clear message when
 * the developer forgot to provide the expected local demo prerequisites.
 */
function readLivePdfFixture(): Uint8Array {
  const pdfPath = resolveLivePdfPath();
  if (!existsSync(pdfPath)) {
    throw new Error(
      `Live ICA PDF fixture not found at "${pdfPath}". ` +
      `Set ${LIVE_E2E_PDF_PATH_ENV} or place ${FIXTURE_FILENAME} in the sibling dataspace-ica-ts examples directory.`,
    );
  }
  return readFileSync(pdfPath);
}

/**
 * Creates a real SDK client pointed at the local ICA demo instance.
 *
 * Separation exercised by this test:
 * - DIDComm communication key travels in `meta.jws`
 * - controller business binding key travels in
 *   `body.data[].resource.controller.publicKeyJwk`
 */
function createLiveClient(options: { includeControllerBinding: boolean; includeCommunicationKey: boolean }): IcaClient {
  const client = new IcaClient({
    sector: LIVE_E2E_CONFIG.sector,
    didWeb: 'did:web:ica-client-sdk-live-test',
    baseUrl: LIVE_E2E_CONFIG.baseUrl,
    retryTimes: LIVE_E2E_CONFIG.retryTimes,
    retryDelayMs: LIVE_E2E_CONFIG.retryDelayMs,
  });

  if (options.includeCommunicationKey) {
    client.setControllerMessageSigningPublicKey(
      LIVE_E2E_CONFIG.controllerSigningAlg,
      'device-communication-es384-001',
      LIVE_E2E_CONFIG.deviceCommunicationPublicJwk,
    );
  }

  if (options.includeControllerBinding) {
    client.setControllerBindingPublicKey(
      LIVE_E2E_CONFIG.controllerSigningAlg,
      LIVE_E2E_CONFIG.controllerSigningKid,
      LIVE_E2E_CONFIG.controllerBindingPublicJwk,
    );
  }

  client.setOrgCredentialSigningPublicKey(
    LIVE_E2E_CONFIG.controllerSigningAlg,
    'sdk-live-organization-es384-001',
    ORGANIZATION_PUBLIC_JWK,
  );

  return client;
}

/**
 * Executes the full `_verify` -> `_verify-response` cycle through the SDK and
 * returns the parsed ICA DIDComm bundle.
 */
async function verifyTermsLive(client: IcaClient): Promise<IcaVerifyTermsResponse> {
  const pdfBytes = readLivePdfFixture();
  const submitted = await client.verifyTerms(pdfBytes, {
    legalRepresentativePayload: {
      email: LIVE_E2E_CONFIG.representativeEmail,
    },
  });

  try {
    return await client.pollVerifyTermsResponse(submitted.thid);
  } catch (error) {
    const response = (error as {
      response?: { status?: number; data?: unknown };
    }).response;
    if (response) {
      throw new Error(
        `ICA _verify-response failed with HTTP ${response.status}: ${JSON.stringify(response.data)}`,
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Asserts the representative binding projection in a way that can be reused by
 * both positive and negative live scenarios.
 */
function assertRepresentativeBinding(
  binding: IcaRepresentativeBindingProjection,
  requirements: { requireSameAs: boolean; requireMaterial: boolean },
): void {
  if (requirements.requireSameAs) {
    assert.equal(
      binding.sameAs,
      LIVE_E2E_CONFIG.expectedRepresentativeSameAs,
      'Representative sameAs should match the ICA-compatible hash of the demo email.',
    );
  }

  if (requirements.requireMaterial) {
    assert.equal(
      binding.material,
      LIVE_E2E_CONFIG.expectedControllerMaterial,
      'Representative binding material should match the RFC 9278 thumbprint derived from the controller JWK.',
    );
  } else {
    assert.equal(
      binding.material,
      undefined,
      'Representative binding material should be absent when the controller JWK is not transported in _verify.',
    );
  }
}

const shouldSkipLiveSuite = !isLiveE2eEnabled();
const liveIt = shouldSkipLiveSuite ? it.skip : it;

describe('IcaClient live E2E against local ICA demo', () => {
  jest.setTimeout(LIVE_E2E_TIMEOUT_MS);

  liveIt(
    'projects demo representative email into sameAs and controller binding JWK into hasCredential.material',
    async () => {
      const client = createLiveClient({ includeCommunicationKey: true, includeControllerBinding: true });
      const response = await verifyTermsLive(client);
      const representativeEntry = findLegalRepresentativeCredentialEntry(response);
      const binding = extractRepresentativeBindingProjection(response);

      expect(representativeEntry?.[REPRESENTATIVE_ENTRY_KEY]).toBeDefined();
      assertRepresentativeBinding(binding, { requireSameAs: true, requireMaterial: true });
    },
  );

  liveIt(
    'reuses the caller-owned keys submitted to verify when creating the organization DID document',
    async () => {
      const client = createLiveClient({ includeCommunicationKey: true, includeControllerBinding: true });
      const verifyResponse = await verifyTermsLive(client);
      const organizationCredential =
        client.getOrganizationCredentialFromVerifyResponse(verifyResponse);
      const legalRepresentativeCredential =
        client.getLegalRepresentativeCredentialFromVerifyResponse(verifyResponse);

      assert.ok(organizationCredential, 'The real _verify response must contain the organization credential.');
      assert.ok(legalRepresentativeCredential, 'The real _verify response must contain the representative credential.');

      const createSubmission = await client.createOrgDidDocumentFromVcs({
        organizationVC: organizationCredential,
        legalRepresentativeVC: legalRepresentativeCredential,
      });
      const createResponse =
        await client.pollCreateOrgDidDocumentResponse(createSubmission.thid);

      assert.ok(
        createResponse.body?.data?.[0]?.resource?.didDocument?.id,
        'The real _create response must contain the published organization DID document.',
      );
    },
  );

});
