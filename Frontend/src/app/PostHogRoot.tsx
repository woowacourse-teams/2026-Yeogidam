import React, { useEffect, type ReactNode } from 'react';
import Config from 'react-native-config';
import { PostHogProvider, usePostHog } from 'posthog-react-native';

import {
  getSpringMemberId,
  getSpringTokens,
  onSpringSessionChange,
} from '../lib/auth/spring-session';
import {
  getAnalyticsEnvironment,
  getAnalyticsGuestMode,
} from '../analytics/analytics';
import { getTrafficProperties } from '../analytics/traffic';
import { identifyMember } from '../analytics/identity';
import { getInstallationId } from '../lib/share-intent';
import { otaBundleId } from '../lib/hot-updater';

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
        if (isMounted && tokens && memberId)
          return identifyMember(posthog, memberId);
      })
      .catch(() => undefined);

    // 로그아웃 때 reset()하지 않는 이유는 identifyMember 설명을 참고하세요.
    const unsubscribe = onSpringSessionChange((event, memberId) => {
      if (event === 'SIGNED_IN' && memberId) {
        identifyMember(posthog, memberId).catch(() => undefined);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [posthog]);

  return <>{children}</>;
}

export function PostHogRoot({ children }: PostHogRootProps) {
  const projectToken = configuredValue(Config.POSTHOG_PROJECT_TOKEN);
  const host = configuredValue(Config.POSTHOG_HOST);
  const environment = getAnalyticsEnvironment();
  const installationId = getInstallationId();
  const traffic = getTrafficProperties();

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
        before_send: event => {
          if (!event) return event;
          // 앱 실행 같은 자동 수집 이벤트에도 붙여 회원 활성 수를 is_guest로 가를 수 있게 한다.
          const isGuest = getAnalyticsGuestMode();
          return {
            ...event,
            properties: {
              ...(isGuest === null ? {} : { is_guest: isGuest }),
              ...event.properties,
              environment,
              ...traffic,
              ...(installationId ? { installation_id: installationId } : {}),
              ...(otaBundleId ? { ota_bundle_id: otaBundleId } : {}),
            },
          };
        },
      }}
    >
      <PostHogAuthIdentity>{children}</PostHogAuthIdentity>
    </PostHogProvider>
  );
}
