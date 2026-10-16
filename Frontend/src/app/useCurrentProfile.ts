import {useCallback, useEffect, useRef, useState} from 'react';

import {getCurrentProfile} from '../entities/info/api';
import {normalizeScreenApiError} from '../lib/api/screen-error';
import type {ProfileApiError, ProfileInfo} from '../entities/info/types';

/**
 * 프로필 읽기 상태입니다. 상태마다 가질 값만 두어, 프로필과 오류가 함께 남거나
 * 성공인데 프로필이 없는 조합을 타입으로 막습니다. 재시도 중에는 이전 오류를 보여 준 채 로딩을 표시합니다.
 */
type ProfileState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; profile: ProfileInfo; isRefreshing: boolean}
  | {status: 'error'; error: ProfileApiError; isRetrying: boolean};

const IDLE: ProfileState = {status: 'idle'};
const LOADING: ProfileState = {status: 'loading'};

/**
 * 회원 프로필을 읽어 두고 마이페이지가 쓰는 세 값(프로필, 오류, 로딩)과 재시도, 비우기를 돌려줍니다.
 *
 * @param enabled true가 되면 읽고, false가 되면 세 값을 모두 비웁니다(React Query의 enabled와 달리 값을 남기지 않습니다).
 * 늦게 도착한 응답은 요청 번호로 버리므로, 로그아웃이나 탈퇴 뒤에 이전 회원의 프로필이 써지지 않습니다.
 */
export function useCurrentProfile(enabled: boolean) {
  const [state, setState] = useState<ProfileState>(IDLE);
  // 가장 최근 요청의 번호입니다. 응답이 이 번호와 다르면 이미 지난 요청이므로 버립니다.
  const latestRequestIdRef = useRef(0);

  /** 첫 읽기와 재시도가 함께 쓰는 요청 하나입니다. 상태 전환은 부르는 쪽이 먼저 정하고, 결과만 여기서 반영합니다. */
  const loadProfile = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    const isCurrent = () => requestId === latestRequestIdRef.current;

    try {
      const profile = await getCurrentProfile();
      if (isCurrent()) setState({status: 'success', profile, isRefreshing: false});
    } catch (error) {
      if (isCurrent()) {
        setState({status: 'error', error: normalizeScreenApiError(error), isRetrying: false});
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // 꺼지는 순간 진행 중인 요청도 지난 요청으로 만들어, 늦게 온 응답이 비운 상태를 덮지 않게 합니다.
      latestRequestIdRef.current += 1;
      setState(IDLE);
      return;
    }

    setState(LOADING);
    loadProfile();
  }, [enabled, loadProfile]);

  /** 다시 읽기입니다. 보여 주던 오류나 프로필은 둔 채 로딩 표시를 켜고 같은 요청을 다시 보냅니다. */
  const retryProfile = useCallback(async () => {
    setState(current => {
      if (current.status === 'error') return {...current, isRetrying: true};
      if (current.status === 'success') return {...current, isRefreshing: true};
      return LOADING;
    });
    await loadProfile();
  }, [loadProfile]);

  /** 회원 탈퇴처럼 세션이 사라진 뒤 이전 회원의 프로필과 오류가 남지 않게 합니다. 로딩 표시는 enabled가 꺼질 때 내려갑니다. */
  const clearProfile = useCallback(() => {
    setState(current => (isProfileLoadingState(current) ? LOADING : IDLE));
  }, []);

  return {
    currentProfile: state.status === 'success' ? state.profile : null,
    profileError: state.status === 'error' ? state.error : null,
    isProfileLoading: isProfileLoadingState(state),
    retryProfile,
    clearProfile,
  };
}

function isProfileLoadingState(state: ProfileState): boolean {
  switch (state.status) {
    case 'loading':
      return true;
    case 'error':
      return state.isRetrying;
    case 'success':
      return state.isRefreshing;
    case 'idle':
      return false;
  }
}
