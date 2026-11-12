import { AppState, type NativeEventSubscription } from 'react-native';
import * as Sentry from '@sentry/react-native';

/**
 * 앱 시작 성능을 Sentry 트랜잭션 두 개로 기록합니다.
 *
 * 1. `App Start` (standalone): 아이콘 탭(네이티브 프로세스 시작) → 스플래시 다음 첫 화면 = **TTID**
 *    `extendAppStart()`로 기본 끝점(루트 컴포넌트 마운트)을 첫 화면까지 늘리고,
 *    스플래시가 기다리는 작업(토큰 읽기, 업데이트 정책 API, 최소 노출 시간)을 하위 span으로 남깁니다.
 * 2. `app.startup`: JS 실행 시작 → 저장 장소 목록이 데이터로 채워짐 = **TTFD**
 *    App Start는 첫 화면에서 끝나므로, 그 뒤의 데이터 로딩까지는 이 트랜잭션이 잽니다.
 *    `startup.full_display_source`로 캐시에서 그렸는지 서버 응답으로 그렸는지 구분합니다.
 * 3. `app.startup.posts`: JS 실행 시작 → 보관함 기본 탭(게시물) 그리드가 채워짐
 * 4. `app.startup.places_network`: JS 실행 시작 → 저장 장소 서버 응답 도착 (캐시로 먼저 그려도 최신 데이터 시점)
 *
 * 3·4는 저장 장소 화면으로 시작한 실행에서, 시작 30초 안에 일어난 경우에만 보냅니다.
 */

export type StartupDestination = 'saved_places' | 'onboarding' | 'other';
export type StartupPhase = 'auth_restore' | 'update_policy' | 'splash_min_duration';
type StartupOutcome =
  | 'full_display'
  | 'full_display_failed'
  | 'initial_display_only'
  | 'backgrounded'
  | 'timeout';

type StartupSpan = ReturnType<typeof Sentry.startInactiveSpan>;

/** 이 시간 안에 TTFD가 오지 않으면 측정을 버리지 않고 timeout으로 닫습니다. */
const FULL_DISPLAY_TIMEOUT_MS = 30_000;

export type StartupDataSource = 'cache' | 'network';

let startupSpan: StartupSpan | undefined;
let postsSpan: StartupSpan | undefined;
let placesNetworkSpan: StartupSpan | undefined;
let isAborted = false;
let destinationIsSavedPlaces = false;
let startedAtMs = 0;
let hasInitialDisplay = false;
let isFinished = false;
let timeoutId: ReturnType<typeof setTimeout> | undefined;
let appStateSubscription: NativeEventSubscription | undefined;

const noop = () => undefined;

export function startStartupTrace(): void {
  if (startupSpan) return;

  // 루트 컴포넌트가 마운트되기 전(= Sentry.wrap의 자동 캡처 전)에 불러야 합니다.
  Sentry.extendAppStart();
  startedAtMs = Date.now();
  startupSpan = Sentry.startInactiveSpan({
    name: 'app.startup',
    op: 'app.startup',
    forceTransaction: true,
  });
  // 끝내지 않은 span은 전송되지 않으므로, 조건에 맞지 않는 실행의 값은 자연히 빠진다.
  postsSpan = Sentry.startInactiveSpan({
    name: 'app.startup.posts',
    op: 'app.startup',
    forceTransaction: true,
  });
  placesNetworkSpan = Sentry.startInactiveSpan({
    name: 'app.startup.places_network',
    op: 'app.startup',
    forceTransaction: true,
  });
  // 30초가 지나면 감시를 끝낸다. TTFD 뒤에도 게시물·서버 응답 시점을 기록하는 동안은 백그라운드 전환을 계속 본다.
  timeoutId = setTimeout(() => {
    isAborted = true;
    finish('timeout');
    appStateSubscription?.remove();
    appStateSubscription = undefined;
  }, FULL_DISPLAY_TIMEOUT_MS);
  // 시작 도중 앱을 내리면 측정값이 실제 대기 시간이 아니게 되므로 따로 표시하고 닫습니다.
  appStateSubscription = AppState.addEventListener('change', nextState => {
    if (nextState === 'background') {
      isAborted = true;
      finish('backgrounded');
    }
  });
}

/** 스플래시 동안 기다리는 작업을 하위 span으로 남겨, 트레이스에서 무엇이 화면을 막는지 보이게 합니다. */
export function startStartupPhase(name: StartupPhase): () => void {
  if (!startupSpan || hasInitialDisplay || isFinished) return noop;

  const span = Sentry.startInactiveSpan({
    parentSpan: Sentry.getExtendedAppStartSpan(),
    op: 'app.start.phase',
    name,
  });
  return () => span.end();
}

export function markStartupInitialDisplay(destination: StartupDestination): void {
  if (!startupSpan || hasInitialDisplay || isFinished) return;

  hasInitialDisplay = true;
  // App Start는 마지막으로 끝난 하위 span 시점으로 잘리므로, 첫 화면 시점에 span을 하나 남기고 마칩니다.
  Sentry.startInactiveSpan({
    parentSpan: Sentry.getExtendedAppStartSpan(),
    op: 'ui.load.initial_display',
    name: destination,
  }).end();
  Sentry.finishExtendedAppStart().catch(noop);
  Sentry.setMeasurement(
    'time_to_initial_display',
    Date.now() - startedAtMs,
    'millisecond',
    startupSpan,
  );
  startupSpan.setAttribute('startup.destination', destination);
  destinationIsSavedPlaces = destination === 'saved_places';

  // TTFD는 저장 장소 화면에만 정의합니다. 온보딩·로그인은 첫 화면이 곧 완성 화면입니다.
  if (destination !== 'saved_places') finish('initial_display_only');
}

export function markStartupFullDisplay(
  isSuccess: boolean,
  source: StartupDataSource = 'network',
): void {
  if (source === 'network' && isSuccess && canMarkSavedLibrary()) {
    placesNetworkSpan?.end();
    placesNetworkSpan = undefined;
  }
  if (!startupSpan || !hasInitialDisplay || isFinished) return;

  startupSpan.setAttribute('startup.full_display_source', source);
  Sentry.setMeasurement(
    'time_to_full_display',
    Date.now() - startedAtMs,
    'millisecond',
    startupSpan,
  );
  finish(isSuccess ? 'full_display' : 'full_display_failed');
}

/** 보관함 기본 탭(게시물) 그리드가 처음 채워진 시점. 캐시든 서버 응답이든 먼저 온 쪽 한 번만 기록한다. */
export function markStartupPostsDisplay(source: StartupDataSource): void {
  if (!postsSpan || !canMarkSavedLibrary()) return;
  postsSpan.setAttribute('startup.posts_source', source);
  postsSpan.end();
  postsSpan = undefined;
}

function canMarkSavedLibrary(): boolean {
  return (
    hasInitialDisplay &&
    destinationIsSavedPlaces &&
    !isAborted &&
    // 시작 직후 30초 안의 값만 앱 시작 성능으로 본다.
    Date.now() - startedAtMs <= FULL_DISPLAY_TIMEOUT_MS
  );
}

function finish(outcome: StartupOutcome): void {
  if (!startupSpan || isFinished) return;

  isFinished = true;
  startupSpan.setAttribute('startup.outcome', outcome);
  startupSpan.end();
}

/** 테스트 전용 */
export function resetStartupTraceForTest(): void {
  if (timeoutId) clearTimeout(timeoutId);
  appStateSubscription?.remove();
  startupSpan = undefined;
  postsSpan = undefined;
  placesNetworkSpan = undefined;
  isAborted = false;
  destinationIsSavedPlaces = false;
  startedAtMs = 0;
  hasInitialDisplay = false;
  isFinished = false;
  timeoutId = undefined;
  appStateSubscription = undefined;
}
