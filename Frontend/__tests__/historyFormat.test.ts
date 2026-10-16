import type {HistoryReel} from '../src/entities/content/types';
import {
  formatHistoryDate,
  getHistoryFailureMessage,
  getHistoryTitle,
  getHistoryVisibleState,
  groupHistoryReelsByDate,
  hasResolvedHistoryTitle,
} from '../src/pages/history/history-format';

const reel = (overrides: Partial<HistoryReel> = {}): HistoryReel => ({
  id: '1',
  instagram_url: 'https://www.instagram.com/reel/1/',
  instagram_title: null,
  instagram_description: '게시물 1',
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: 'https://cdn.example.com/1.jpg',
  processing_status: 'COMPLETED',
  failure_reason: null,
  save_mode: null,
  created_at: '2026-10-15T09:00:00',
  ...overrides,
});

describe('제목', () => {
  test('캡션의 첫 줄을 제목으로 쓰고, 캡션과 제목이 없으면 기본 제목을 쓴다', () => {
    expect(getHistoryTitle(reel({instagram_description: '성수 카페\n둘째 줄'}))).toBe('성수 카페');
    expect(getHistoryTitle(reel({instagram_description: null, instagram_title: '릴스 제목'}))).toBe(
      '릴스 제목',
    );
    expect(getHistoryTitle(reel({instagram_description: null}))).toBe('저장한 콘텐츠');
  });

  test('기본 제목이면 제목을 아직 얻지 못한 것으로 본다', () => {
    expect(hasResolvedHistoryTitle(reel())).toBe(true);
    expect(hasResolvedHistoryTitle(reel({instagram_description: '  '}))).toBe(false);
  });
});

describe('실패 문구', () => {
  test('실패 이유의 앞 코드로 문구를 고른다', () => {
    expect(getHistoryFailureMessage('PLACE_NOT_MATCHED')).toBe('지도에서 장소를 찾지 못했어요.');
    expect(getHistoryFailureMessage('CLIENT000_002 | timeout after 30s')).toBe(
      '응답이 늦어져 분석하지 못했어요.',
    );
    expect(getHistoryFailureMessage(' AUTH401_002 ')).toBe('로그인이 만료됐어요.');
  });

  test('서버 오류 코드 둘은 같은 문구를 쓴다', () => {
    expect(getHistoryFailureMessage('DATA500_001')).toBe('서버에서 분석을 처리하지 못했어요.');
    expect(getHistoryFailureMessage('COMMON500_001')).toBe('서버에서 분석을 처리하지 못했어요.');
  });

  test('모르는 코드나 빈 이유는 기본 문구를 쓴다', () => {
    const fallback = '장소 분석에 실패했어요. 잠시 후 다시 시도해주세요.';
    expect(getHistoryFailureMessage('SOMETHING_NEW')).toBe(fallback);
    expect(getHistoryFailureMessage('')).toBe(fallback);
    expect(getHistoryFailureMessage(null)).toBe(fallback);
  });
});

describe('날짜', () => {
  test('기기 시간대의 날짜를 두 자리 월과 일로 적는다', () => {
    expect(formatHistoryDate('2026-03-05T23:59:00')).toBe('2026.03.05');
    expect(formatHistoryDate('2026-12-31T00:00:00')).toBe('2026.12.31');
  });

  test('날짜로 읽을 수 없으면 받은 값을 그대로 쓴다', () => {
    expect(formatHistoryDate('어제')).toBe('어제');
  });
});

describe('카드 노출 상태', () => {
  test('처리 상태를 노출 상태로 바꾼다', () => {
    expect(getHistoryVisibleState(reel({processing_status: 'COMPLETED'}))).toBe('success');
    expect(getHistoryVisibleState(reel({processing_status: 'FAILED'}))).toBe('failed');
    expect(getHistoryVisibleState(reel({processing_status: 'PROCESSING'}))).toBe('processing');
    expect(getHistoryVisibleState(reel({processing_status: 'PENDING'}))).toBe('processing');
  });

  test('처리 중인데 썸네일이나 제목이 아직 없으면 loading이다', () => {
    expect(
      getHistoryVisibleState(reel({processing_status: 'PENDING', instagram_thumbnail_url: null})),
    ).toBe('loading');
    expect(
      getHistoryVisibleState(reel({processing_status: 'PROCESSING', instagram_description: null})),
    ).toBe('loading');
    // 처리가 끝난 항목은 썸네일이 없어도 loading이 아니다.
    expect(
      getHistoryVisibleState(reel({processing_status: 'COMPLETED', instagram_thumbnail_url: null})),
    ).toBe('success');
  });
});

describe('날짜 묶음', () => {
  test('날짜와 항목을 처음 나온 순서로 묶고, 떨어진 같은 날짜 항목은 앞 묶음에 붙인다', () => {
    const a = reel({id: 'a', created_at: '2026-10-15T12:00:00'});
    const b = reel({id: 'b', created_at: '2026-10-14T12:00:00'});
    const c = reel({id: 'c', created_at: '2026-10-15T08:00:00'});

    expect(groupHistoryReelsByDate([a, b, c])).toEqual([
      ['2026.10.15', [a, c]],
      ['2026.10.14', [b]],
    ]);
    expect(groupHistoryReelsByDate([])).toEqual([]);
  });
});
