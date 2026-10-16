import {useCallback, useState} from 'react';

import {reportHistoryReel} from '../../entities/content/history-api';

/**
 * 실패한 히스토리 항목의 제보 상태를 들고 제보를 보냅니다. 보내는 순간 제보 완료로 바꾸고, 실패하면
 * 되돌린 뒤 false를 돌려줍니다. 확인 창과 실패 안내는 제보 버튼이 있는 화면이 맡습니다.
 */
export function useHistoryReport(reelId: string) {
  const [reported, setReported] = useState(false);

  const report = useCallback(async () => {
    setReported(true);
    try {
      await reportHistoryReel(reelId);
      return true;
    } catch {
      setReported(false);
      return false;
    }
  }, [reelId]);

  return {reported, report};
}
