import React, { useEffect, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import Config from 'react-native-config';
import { PostHogProvider, usePostHog } from 'posthog-react-native';

import { supabase } from '../lib/auth/supabase';

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
    const identifySessionUser = (session: Session) => {
      const email = session.user.email?.trim();
      const fullName = session.user.user_metadata.full_name;

      posthog.identify(session.user.id, {
        $set: {
          ...(email ? { email } : {}),
          ...(typeof fullName === 'string' && fullName.trim()
            ? { name: fullName.trim() }
            : {}),
        },
      });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
        identifySessionUser(session);
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

  if (!projectToken || !host) {
    if (__DEV__) {
      const missingVariable = projectToken
        ? 'POSTHOG_HOST'
        : 'POSTHOG_PROJECT_TOKEN';

      throw new Error(
        `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
      );
    }

    return <>{children}</>;
  }

  return (
    <PostHogProvider
      apiKey={projectToken}
      options={{
        captureAppLifecycleEvents: true,
        errorTracking: {
          autocapture: {
            uncaughtExceptions: true,
            unhandledRejections: true,
          },
        },
        host,
        logs: {
          serviceName: 'yeogidam-mobile',
        },
      }}
    >
      <PostHogAuthIdentity>{children}</PostHogAuthIdentity>
    </PostHogProvider>
  );
}
