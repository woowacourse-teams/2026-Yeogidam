import { getHistoryFailureMessage } from '../src/pages/history/HistoryScreen';

describe('history failure messages', () => {
  it.each([
    ['CONTENT_UNAVAILABLE', '릴스 내용을 읽지 못했어요.'],
    ['PLACE_NOT_EXTRACTED', '캡션에서 장소를 찾지 못했어요.'],
    ['PLACE_NOT_MATCHED', '지도에서 일치하는 장소를 찾지 못했어요.'],
    ['PROCESSING_FAILED', '서버에서 분석을 처리하지 못했어요.'],
    ['UNEXPECTED', '장소 분석에 실패했어요. 잠시 후 다시 시도해주세요.'],
  ] as const)('shows the app message for %s', (reason, message) => {
    expect(getHistoryFailureMessage(reason)).toBe(message);
  });

  it('falls back to the general message without a reason', () => {
    expect(getHistoryFailureMessage(null)).toBe(
      '장소 분석에 실패했어요. 잠시 후 다시 시도해주세요.',
    );
  });
});
