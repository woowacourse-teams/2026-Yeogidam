import React, { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';
import Config from 'react-native-config';
import * as Updates from 'expo-updates';
import { PostHogProvider, usePostHog } from 'posthog-react-native';

import {
  getSpringMemberId,
  getSpringTokens,
  onSpringSessionChange,
} from '../lib/auth/spring-session';
import { getAnalyticsEnvironment } from '../analytics/analytics';
import { getInstallationId } from '../lib/share-intent';

type PostHogRootProps = {
  children: ReactNode;
};

function configuredValue(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : null;
}

function PostHogAuthIdentity({ children }: PostHogRootProps) {
  const posthog = usePostHog();

  useEffect(() => {
    let isMounted = true;

    // 앱 시작 시 이미 로그인된 회원도 식별합니다.
    Promise.all([getSpringTokens(), getSpringMemberId()])
      .then(([tokens, memberId]) => {
        if (isMounted && tokens && memberId) posthog.identify(memberId);
      })
      .catch(() => undefined);

    const unsubscribe = onSpringSessionChange((event, memberId) => {
      if (event === 'SIGNED_IN' && memberId) {
        posthog.identify(memberId);
        return;
      }

      if (event === 'SIGNED_OUT') {
        posthog.reset();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [posthog]);

  // 실험 플래그는 앱을 열 때 받아 캐시하므로, 포그라운드로 돌아올 때 다시 받아야 끈 실험이 빨리 거둬집니다.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') posthog.reloadFeatureFlagsAsync().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [posthog]);

  return <>{children}</>;
}

export function PostHogRoot({ children }: PostHogRootProps) {
  const projectToken = configuredValue(Config.POSTHOG_PROJECT_TOKEN);
  const host = configuredValue(Config.POSTHOG_HOST);
  const environment = getAnalyticsEnvironment();
  const installationId = getInstallationId();
  // 어느 OTA 번들이 이벤트를 보냈는지 남겨야 실험 결과를 번들별로 나눠 볼 수 있습니다. 내장 번들은 embedded입니다.
  const otaUpdateId = Updates.updateId ?? 'embedded';
  const runtimeVersion = Updates.runtimeVersion;

  if (!projectToken || !host) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider
      apiKey={projectToken}
      autocapture={{
        captureScreens: false,
        captureTouches: false,
      }}
      options={{
        captureAppLifecycleEvents: true,
        disableGeoip: true,
        disableSurveys: true,
        enableSessionReplay: false,
        host,
        before_send: event => event && ({
          ...event,
          properties: {
            ...event.properties,
            environment,
            ...(installationId ? {installation_id: installationId} : {}),
            ota_update_id: otaUpdateId,
            ...(runtimeVersion ? {runtime_version: runtimeVersion} : {}),
          },
        }),
      }}
    >
      <PostHogAuthIdentity>{children}</PostHogAuthIdentity>
    </PostHogProvider>
  );
}
