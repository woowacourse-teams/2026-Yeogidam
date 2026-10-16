import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';

import {getAppUpdatePolicy, type AppUpdatePolicy} from '../lib/app-update-policy';
import {
  getDismissedRecommendedVersion,
  rememberDismissedRecommendedVersion,
} from '../lib/app-update-policy-storage';

export type RecommendedUpdate = {
  latestVersion: string;
  storeUrl: string;
};

/**
 * 앱 업데이트 정책을 포그라운드로 돌아올 때마다 확인해 강제 업데이트 스토어 주소와 권고 업데이트를 돌려줍니다.
 * 앱 시작 흐름은 refreshUpdatePolicy를 직접 불러 스플래시가 끝나기 전에 첫 결과를 받습니다.
 * 권고 안내를 닫은 버전은 기억해 같은 버전은 다시 띄우지 않습니다.
 */
export function useAppUpdatePolicy() {
  const [requiredUpdateStoreUrl, setRequiredUpdateStoreUrl] = useState<string | null>(null);
  const [recommendedUpdate, setRecommendedUpdate] = useState<RecommendedUpdate | null>(null);
  const dismissedRecommendedVersionRef = useRef<string | null>(null);
  const dismissedRecommendedVersionLoadRef = useRef<Promise<string | null> | null>(null);
  const isMountedRef = useRef(true);

  const applyUpdatePolicy = useCallback((policy: AppUpdatePolicy | null) => {
    if (!policy) return;

    if (policy.updateRequired) {
      setRecommendedUpdate(null);
      setRequiredUpdateStoreUrl(policy.storeUrl);
      return;
    }

    if (
      policy.updateRecommended &&
      dismissedRecommendedVersionRef.current !== policy.latestVersion
    ) {
      setRecommendedUpdate({
        latestVersion: policy.latestVersion,
        storeUrl: policy.storeUrl,
      });
    } else {
      setRecommendedUpdate(null);
    }
  }, []);

  const loadUpdatePolicy = useCallback(async () => {
    if (!dismissedRecommendedVersionLoadRef.current) {
      dismissedRecommendedVersionLoadRef.current = getDismissedRecommendedVersion();
    }

    const [policy, dismissedVersion] = await Promise.all([
      getAppUpdatePolicy(),
      dismissedRecommendedVersionLoadRef.current,
    ]);
    if (dismissedRecommendedVersionRef.current === null) {
      dismissedRecommendedVersionRef.current = dismissedVersion;
    }
    return policy;
  }, []);

  /** 정책을 다시 확인해 상태에 반영합니다. 조회에 실패하면 정책을 모르는 상태로 두고 사용자를 막지 않습니다. */
  const refreshUpdatePolicy = useCallback(async () => {
    const policy = await loadUpdatePolicy();
    if (isMountedRef.current) applyUpdatePolicy(policy);
  }, [applyUpdatePolicy, loadUpdatePolicy]);

  useEffect(() => {
    isMountedRef.current = true;
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') refreshUpdatePolicy().catch(() => undefined);
    });

    return () => {
      isMountedRef.current = false;
      subscription.remove();
    };
  }, [refreshUpdatePolicy]);

  const dismissRecommendedUpdate = useCallback(() => {
    if (recommendedUpdate) {
      dismissedRecommendedVersionRef.current = recommendedUpdate.latestVersion;
      rememberDismissedRecommendedVersion(recommendedUpdate.latestVersion).catch(
        () => undefined,
      );
    }
    setRecommendedUpdate(null);
  }, [recommendedUpdate]);

  return {
    requiredUpdateStoreUrl,
    recommendedUpdate,
    refreshUpdatePolicy,
    dismissRecommendedUpdate,
  };
}
