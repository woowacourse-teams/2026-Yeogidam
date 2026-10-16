import {useCallback, useState} from 'react';

import type {HistoryReel} from '../../entities/content/types';
import type {HistoryDetailKind} from './history-format';

/** 히스토리 화면에 지금 보이는 것입니다. 목록이거나, 성공 또는 실패한 항목 하나의 상세입니다. */
export type HistorySelection =
  | {kind: 'list'}
  | {kind: HistoryDetailKind; reel: HistoryReel};

const LIST: HistorySelection = {kind: 'list'};

/**
 * 히스토리 목록과 항목 상세 사이의 선택을 상태 하나로 들고, 상세를 열고 닫는 동작을 돌려줍니다.
 * 성공 상세와 실패 상세는 함께 열리지 않으므로 불린 둘과 선택 항목 대신 kind로 나눕니다.
 */
export function useHistorySelection() {
  const [selection, setSelection] = useState<HistorySelection>(LIST);

  /** 항목 하나의 상세를 엽니다. 어느 상세를 열지는 카드 상태 표(getHistoryCardDetail)가 고릅니다. */
  const openDetail = useCallback(
    (kind: HistoryDetailKind, reel: HistoryReel) => setSelection({kind, reel}),
    [],
  );
  const closeDetail = useCallback(() => setSelection(LIST), []);

  return {selection, openDetail, closeDetail};
}
