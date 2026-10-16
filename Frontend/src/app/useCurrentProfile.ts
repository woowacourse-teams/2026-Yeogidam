import {useCallback, useEffect, useState} from 'react';

import {getCurrentProfile} from '../entities/info/api';
import type {ProfileApiError, ProfileInfo} from '../entities/info/types';

/**
 * 로그인한 회원이 메인 화면에 있을 때 프로필을 읽어 둡니다. 조건이 깨지면 비웁니다.
 * 마이페이지가 쓰는 세 값(프로필, 오류, 로딩)과 재시도, 비우기를 돌려줍니다.
 */
export function useCurrentProfile(enabled: boolean) {
  const [currentProfile, setCurrentProfile] = useState<ProfileInfo | null>(null);
  const [profileError, setProfileError] = useState<ProfileApiError | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setCurrentProfile(null);
      setProfileError(null);
      setIsProfileLoading(false);
      return;
    }

    let isMounted = true;

    setIsProfileLoading(true);
    setProfileError(null);

    getCurrentProfile()
      .then(profile => {
        if (isMounted) setCurrentProfile(profile);
      })
      .catch(error => {
        if (!isMounted) return;
        setCurrentProfile(null);
        setProfileError(error as ProfileApiError);
      })
      .finally(() => {
        if (isMounted) setIsProfileLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  const retryProfile = useCallback(async () => {
    setIsProfileLoading(true);

    try {
      const profile = await getCurrentProfile();
      setCurrentProfile(profile);
    } catch (error) {
      setCurrentProfile(null);
      setProfileError(error as ProfileApiError);
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  /** 회원 탈퇴처럼 세션이 사라진 뒤 이전 회원의 프로필이 남지 않게 합니다. */
  const clearProfile = useCallback(() => {
    setCurrentProfile(null);
    setProfileError(null);
  }, []);

  return {currentProfile, profileError, isProfileLoading, retryProfile, clearProfile};
}
