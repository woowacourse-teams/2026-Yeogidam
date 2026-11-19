import Config from 'react-native-config';
import * as Sentry from '@sentry/react-native';
import { HotUpdater, insights } from '@hot-updater/react-native';

function configuredValue(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : null;
}

const baseURL = configuredValue(Config.HOT_UPDATER_URL);
const clientKey = configuredValue(Config.HOT_UPDATER_CLIENT_KEY);

/** 스플래시가 업데이트 확인을 기다리는 최대 시간. 넘기면 앱을 먼저 보여 주고 결과는 다음 실행에 적용합니다. */
const OTA_CHECK_SPLASH_LIMIT_MS = 1500;
/** 강제 업데이트를 받는 동안 스플래시를 붙잡는 최대 시간. 넘기면 앱을 보여 주고 받은 번들은 다음 실행에 적용합니다. */
const OTA_FORCE_DOWNLOAD_LIMIT_MS = 20_000;
/** 실행 기록(launch report)이 오지 않아도 리로드가 막히지 않도록 기다리는 최대 시간. */
const LAUNCH_READ_LIMIT_MS = 2000;

function reportOtaError(error: unknown) {
  Sentry.captureException(error, { tags: { source: 'hot-updater' } });
}

let resolveLaunchRead: () => void = () => undefined;
/**
 * 이번 실행 기록을 Hot Updater가 읽은 시점. 롤백 감지와 insights 보고가 이 기록을 쓰므로,
 * 강제 업데이트 리로드는 이 뒤에 해야 합니다(`wrap`이 하던 순서와 같습니다).
 */
const launchRead = new Promise<void>(resolve => {
  resolveLaunchRead = resolve;
});

/** 업데이트 서버 설정이 없으면 OTA 없이 앱에 포함된 번들로 실행합니다. */
export const hotUpdater =
  baseURL && clientKey
    ? HotUpdater.init({
        baseURL,
        requestHeaders: { 'x-api-key': clientKey },
        plugins: [insights()],
        onNotifyAppReady: () => resolveLaunchRead(),
        onError: reportOtaError,
      })
    : null;

/**
 * 이번 실행에서 사용 중인 OTA 배포 ID로, `hot-updater bundle list`와 console의 ID와 같습니다.
 * 내려받은 업데이트는 다음 실행부터 적용되므로 앱 시작 시점의 값을 고정해 사용합니다.
 */
export const otaBundleId = hotUpdater?.getBundleId() ?? null;

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * 업데이트 확인은 모듈을 불러오는 즉시 시작해, 앱 마운트·로그인 복원과 병렬로 진행합니다.
 * (`hotUpdater.wrap`은 확인이 끝날 때까지 앱 마운트를 막거나, 강제 업데이트를 사용 중에 리로드합니다.)
 */
const updateCheck = hotUpdater
  ? hotUpdater.checkForUpdate({ updateStrategy: 'fingerprint' }).catch(error => {
      reportOtaError(error);
      return null;
    })
  : Promise.resolve(null);

let hasStarted = false;

/**
 * 스플래시가 함께 기다릴 OTA 단계입니다. 앱 시작 시 한 번만 부릅니다.
 *
 * - 업데이트가 없거나 일반 업데이트면 확인이 끝나는 대로 끝납니다. 일반 업데이트는 백그라운드로 받아 다음 실행에 적용합니다.
 * - 강제 업데이트면 스플래시를 유지한 채 받고 바로 리로드하므로, 끝나지 않고 새 번들로 다시 시작합니다.
 * - 확인이 늦거나 다운로드가 실패·지연되면 앱을 먼저 보여 주고, 사용 중에는 리로드하지 않습니다.
 */
export function waitForOtaBeforeFirstScreen(options?: {
  onForceUpdateStart?: () => void;
}): Promise<void> {
  if (!hotUpdater || hasStarted) return Promise.resolve();
  hasStarted = true;
  const updater = hotUpdater;

  return new Promise<void>(resolve => {
    // 스플래시를 놓아준 뒤에는 어떤 결과가 와도 리로드하지 않는다.
    let isReleased = false;
    let downloadTimer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      if (isReleased) return;
      isReleased = true;
      clearTimeout(checkTimer);
      clearTimeout(downloadTimer);
      resolve();
    };
    const checkTimer = setTimeout(release, OTA_CHECK_SPLASH_LIMIT_MS);

    const run = async () => {
      const updateInfo = await updateCheck;
      if (!updateInfo) return release();

      if (!updateInfo.shouldForceUpdate || isReleased) {
        // 받아 두면 다음 실행에 적용된다.
        updateInfo.updateBundle().catch(reportOtaError);
        return release();
      }

      // 강제 업데이트: 확인 제한 대신 다운로드 제한을 따른다.
      clearTimeout(checkTimer);
      downloadTimer = setTimeout(release, OTA_FORCE_DOWNLOAD_LIMIT_MS);
      options?.onForceUpdateStart?.();

      const isSuccess = await updateInfo.updateBundle();
      if (!isSuccess) throw new Error('New update was found but failed to download the bundle.');
      // 제한 시간을 넘겨 앱이 이미 보이면, 받은 번들은 다음 실행에 적용된다.
      if (isReleased) return;

      await Promise.race([launchRead, delay(LAUNCH_READ_LIMIT_MS)]);
      if (isReleased) return;
      await updater.reload();
      // 리로드되면 이 JS 런타임이 끝나므로, 여기까지 오면 리로드가 실패한 것이다.
      release();
    };

    run().catch(error => {
      reportOtaError(error);
      release();
    });
  });
}
