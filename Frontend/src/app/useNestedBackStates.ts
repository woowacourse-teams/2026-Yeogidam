import {useCallback, useState} from 'react';

import type {MainScreen} from '../types/navigation';

/** 탭 화면이 스스로 뒤로 갈 수 있는지(지도의 시트와 상세, 히스토리와 보관함의 상세)를 탭마다 둡니다. 내 정보는 안에서 뒤로 갈 화면이 없습니다. */
type NestedBackStates = Record<MainScreen, boolean>;

const INITIAL_STATES: NestedBackStates = {map: false, history: false, saved: false, my: false};

/**
 * 탭 화면이 알려 준 안쪽 뒤로 가기 가능 여부를 모읍니다.
 * 활성 탭이 스스로 뒤로 갈 수 있으면 App은 하드웨어 뒤로 가기와 가장자리 스와이프를 그 화면에 맡깁니다.
 */
export function useNestedBackStates() {
  const [nestedBackStates, setNestedBackStates] = useState<NestedBackStates>(INITIAL_STATES);

  const report = useCallback((tab: MainScreen, canGoBack: boolean) => {
    setNestedBackStates(current =>
      current[tab] === canGoBack ? current : {...current, [tab]: canGoBack},
    );
  }, []);
  const reportMapBackState = useCallback(
    (canGoBack: boolean) => report('map', canGoBack),
    [report],
  );
  const reportHistoryBackState = useCallback(
    (canGoBack: boolean) => report('history', canGoBack),
    [report],
  );
  const reportSavedBackState = useCallback(
    (canGoBack: boolean) => report('saved', canGoBack),
    [report],
  );

  return {nestedBackStates, reportMapBackState, reportHistoryBackState, reportSavedBackState};
}
