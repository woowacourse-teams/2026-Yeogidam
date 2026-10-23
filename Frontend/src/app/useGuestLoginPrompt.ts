import {useCallback, useEffect, useState} from 'react';

type Options = {
  /** 비회원이 메인 화면을 방해 없이 보고 있는 상태입니다. 꺼지면 유도를 숨깁니다. */
  isGuestBrowsing: boolean;
  /** 회원이 되면 남은 유도 요청을 지웁니다. */
  isMember: boolean;
};

/**
 * 비회원이 로그인이 필요한 동작(보관함 담기, 지도 검색과 시트 펼치기)을 시도하면 로그인 유도를 띄웁니다.
 * 유도는 비회원 메인을 방해 없이 보고 있을 때만 보이고, 닫거나 회원이 되면 내립니다.
 */
export function useGuestLoginPrompt({isGuestBrowsing, isMember}: Options) {
  const [isPromptRequested, setIsPromptRequested] = useState(false);

  useEffect(() => {
    if (isMember) {
      setIsPromptRequested(false);
    }
  }, [isMember]);

  const showGuestLoginPrompt = useCallback(() => setIsPromptRequested(true), []);
  const dismissGuestLoginPrompt = useCallback(() => setIsPromptRequested(false), []);

  return {
    isGuestLoginPromptVisible: isPromptRequested && isGuestBrowsing,
    showGuestLoginPrompt,
    dismissGuestLoginPrompt,
  };
}
