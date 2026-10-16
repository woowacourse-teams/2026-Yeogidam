import {useCallback, useEffect, useRef, useState} from 'react';

import {getCurrentProfile} from '../entities/info/api';
import type {ProfileApiError, ProfileInfo} from '../entities/info/types';

/**
 * 회원 프로필을 읽어 두고 마이페이지가 쓰는 세 값(프로필, 오류, 로딩)과 재시도, 비우기를 돌려줍니다.
 *
 * @param enabled true가 되면 읽고, false가 되면 세 값을 모두 비웁니다(React Query의 enabled와 달리 값을 남기지 않습니다).
 * 늦게 도착한 응답은 요청 번호로 버리므로, 로그아웃이나 탈퇴 뒤에 이전 회원의 프로필이 써지지 않습니다.
 */
export function useCurrentProfile(enabled: boolean) {
  const [currentProfile, setCurrentProfile] = useState<ProfileInfo | null>(null);
  const [profileError, setProfileError] = useState<ProfileApiError | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  // 가장 최근 요청의 번호입니다. 응답이 이 번호와 다르면 이미 지난 요청이므로 버립니다.
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++latestRequestIdRef.current;

    if (!enabled) {
      setCurrentProfile(null);
      setProfileError(null);
      setIsProfileLoading(false);
      return;
    }

    const isCurrent = () => requestId === latestRequestIdRef.current;

    setIsProfileLoading(true);
    setProfileError(null);

    getCurrentProfile()
      .then(profile => {
        if (isCurrent()) setCurrentProfile(profile);
      })
      .catch(error => {
        if (!isCurrent()) return;
        setCurrentProfile(null);
        setProfileError(error as ProfileApiError);
      })
      .finally(() => {
        if (isCurrent()) setIsProfileLoading(false);
      });
  }, [enabled]);

  const retryProfile = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    const isCurrent = () => requestId === latestRequestIdRef.current;

    setIsProfileLoading(true);

    try {
      const profile = await getCurrentProfile();
      if (isCurrent()) setCurrentProfile(profile);
    } catch (error) {
      if (!isCurrent()) return;
      setCurrentProfile(null);
      setProfileError(error as ProfileApiError);
    } finally {
      if (isCurrent()) setIsProfileLoading(false);
    }
  }, []);

  /** 회원 탈퇴처럼 세션이 사라진 뒤 이전 회원의 프로필과 오류가 남지 않게 합니다. 로딩 표시는 enabled가 꺼질 때 내려갑니다. */
  const clearProfile = useCallback(() => {
    setCurrentProfile(null);
    setProfileError(null);
  }, []);

  return {currentProfile, profileError, isProfileLoading, retryProfile, clearProfile};
}
