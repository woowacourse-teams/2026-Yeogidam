import React, { useEffect, type ReactNode } from 'react';
import Config from 'react-native-config';
import { PostHogProvider, usePostHog } from 'posthog-react-native';

import { loadAuthSession } from '../lib/auth/authStorage';
import { subscribeAuthState } from '../lib/auth/tokenClient';
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
    // 공유 저장소 세션의 userId 자리에는 서버 회원 id 문자열이 들어 있습니다.
    const identifyMember = async () => {
      const session = await loadAuthSession();

      if (session) {
        posthog.identify(session.userId);
      }
    };

    identifyMember().catch(() => undefined);

    return subscribeAuthState(signedIn => {
      if (signedIn) {
        identifyMember().catch(() => undefined);
        return;
      }

      posthog.reset();
    });
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
