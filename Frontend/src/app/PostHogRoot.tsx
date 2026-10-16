import React, { useEffect, type ReactNode } from 'react';
import Config from 'react-native-config';
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

  return <>{children}</>;
}

export function PostHogRoot({ children }: PostHogRootProps) {
  const projectToken = configuredValue(Config.POSTHOG_PROJECT_TOKEN);
  const host = configuredValue(Config.POSTHOG_HOST);
  const environment = getAnalyticsEnvironment();
  const installationId = getInstallationId();

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
          },
        }),
      }}
    >
      <PostHogAuthIdentity>{children}</PostHogAuthIdentity>
    </PostHogProvider>
  );
}
