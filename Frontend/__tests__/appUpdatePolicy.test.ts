import type { AppUpdatePolicy } from '../src/lib/app-update-policy';

type AppUpdatePolicyModule = typeof import('../src/lib/app-update-policy');

const BASE_URL = 'https://api.example.com';
const POLICY_URL = `${BASE_URL}/api/v1/app-update-policies?platform=ios&appVersion=1.1.0`;

const requiredPolicy: AppUpdatePolicy = {
  updateRequired: true,
  updateRecommended: false,
  minimumSupportedVersion: '1.2.0',
  latestVersion: '1.4.0',
  storeUrl: 'https://apps.apple.com/kr/app/id0000000000',
};
const recommendedPolicy: AppUpdatePolicy = {
  ...requiredPolicy,
  updateRequired: false,
  updateRecommended: true,
};
const upToDatePolicy: AppUpdatePolicy = {
  ...requiredPolicy,
  updateRequired: false,
  updateRecommended: false,
};

/**
 * jest.setup.js가 App 테스트를 위해 이 모듈을 목으로 바꿔 두므로 실제 모듈을 읽습니다.
 * 서버 주소와 권고 모달 표시 여부가 모듈 변수라서 테스트마다 새로 읽습니다.
 */
function loadAppUpdatePolicy(): AppUpdatePolicyModule {
  let loaded: AppUpdatePolicyModule | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<AppUpdatePolicyModule>(
      '../src/lib/app-update-policy',
    );
  });
  return loaded!;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('app update policy request', () => {
  it.each([
    ['required', requiredPolicy],
    ['recommended', recommendedPolicy],
    ['up-to-date', upToDatePolicy],
  ])('reads every field of the %s policy', async (_name, serverPolicy) => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, serverPolicy));
    globalThis.fetch = fetchMock;
    const { configureAppUpdatePolicyApi, getAppUpdatePolicy } =
      loadAppUpdatePolicy();
    configureAppUpdatePolicyApi({ baseUrl: BASE_URL });

    await expect(getAppUpdatePolicy()).resolves.toEqual(serverPolicy);

    expect(fetchMock).toHaveBeenCalledWith(POLICY_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  });

  it.each([
    [
      'the Supabase function shape',
      {
        minimumSupportedVersion: '1.2.0',
        storeUrl: 'https://apps.apple.com/kr/app/id0000000000',
        updateRequired: false,
      },
    ],
    [
      'a recommendation flag that is not a boolean',
      { ...recommendedPolicy, updateRecommended: 'true' },
    ],
    ['an empty store URL', { ...recommendedPolicy, storeUrl: ' ' }],
    ['a missing latest version', { ...recommendedPolicy, latestVersion: null }],
  ])('returns null for %s', async (_name, body) => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, body));
    const { configureAppUpdatePolicyApi, getAppUpdatePolicy } =
      loadAppUpdatePolicy();
    configureAppUpdatePolicyApi({ baseUrl: BASE_URL });

    await expect(getAppUpdatePolicy()).resolves.toBeNull();
  });

  it('returns null when the server rejects the request', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(400, {
        message: 'appVersion은 주.부.수정 형식이어야 합니다.',
        errorCode: 'APP400_002',
      }),
    );
    const { configureAppUpdatePolicyApi, getAppUpdatePolicy } =
      loadAppUpdatePolicy();
    configureAppUpdatePolicyApi({ baseUrl: BASE_URL });

    await expect(getAppUpdatePolicy()).resolves.toBeNull();
  });

  it('returns null when the request does not reach the server', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed'));
    const { configureAppUpdatePolicyApi, getAppUpdatePolicy } =
      loadAppUpdatePolicy();
    configureAppUpdatePolicyApi({ baseUrl: BASE_URL });

    await expect(getAppUpdatePolicy()).resolves.toBeNull();
  });

  it('returns null when the server does not answer within five seconds', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(() => new Promise<Response>(() => {}));
    const { configureAppUpdatePolicyApi, getAppUpdatePolicy } =
      loadAppUpdatePolicy();
    configureAppUpdatePolicyApi({ baseUrl: BASE_URL });

    const policy = getAppUpdatePolicy();
    jest.advanceTimersByTime(5000);

    await expect(policy).resolves.toBeNull();
  });

  it('returns null without a request before the server address is configured', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    const { getAppUpdatePolicy } = loadAppUpdatePolicy();

    await expect(getAppUpdatePolicy()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('recommended update prompt', () => {
  it('is shown only once per app session', () => {
    const { consumeRecommendedUpdatePrompt } = loadAppUpdatePolicy();

    expect(consumeRecommendedUpdatePrompt(recommendedPolicy)).toBe(true);
    expect(consumeRecommendedUpdatePrompt(recommendedPolicy)).toBe(false);
  });

  it('is not used up by required or up-to-date policies', () => {
    const { consumeRecommendedUpdatePrompt } = loadAppUpdatePolicy();

    expect(consumeRecommendedUpdatePrompt(requiredPolicy)).toBe(false);
    expect(consumeRecommendedUpdatePrompt(upToDatePolicy)).toBe(false);
    expect(consumeRecommendedUpdatePrompt(recommendedPolicy)).toBe(true);
  });
});
