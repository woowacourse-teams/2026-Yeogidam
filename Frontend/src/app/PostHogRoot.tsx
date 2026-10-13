import React, { useEffect, type ReactNode } from 'react';
import Config from 'react-native-config';
import { PostHogProvider, usePostHog } from 'posthog-react-native';

import { supabase } from '../lib/auth/supabase';
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
        posthog.identify(session.user.id);
        return;
      }

      if (event === 'SIGNED_OUT') {
        posthog.reset();
      }
    });

    return () => subscription.unsubscribe();
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
