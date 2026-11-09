import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {getPlaceBlogs, getPlaceInfo} from '../src/entities/info/api';
import {
  toBlogListItems,
  toMenuItems,
  toMenuPriceRange,
  toWeeklyHours,
} from '../src/pages/place-detail/placeDetailFormat';
import type {PlaceTab} from '../src/pages/place-detail/components/PlaceTabs';
import {usePlaceDetailData} from '../src/pages/place-detail/usePlaceDetailData';

jest.mock('../src/entities/info/api', () => ({
  getPlaceInfo: jest.fn(),
  getPlaceBlogs: jest.fn(),
}));

// 2026-11-12는 목요일입니다.
const THURSDAY = new Date(2026, 10, 12, 15);

describe('장소 상세 응답 변환', () => {
  test('영업시간을 월요일부터 정렬하고 휴무·정보 없음·오늘을 구분한다', () => {
    const hours = toWeeklyHours(
      [
        {dayOfWeek: 'SUNDAY', periods: []},
        {
          dayOfWeek: 'THURSDAY',
          periods: [
            {opensAt: '10:00', closesAt: '15:00'},
            {opensAt: '17:00', closesAt: '02:00'},
          ],
        },
      ],
      THURSDAY,
    );

    expect(hours.map(item => item.day)).toEqual(['월', '화', '수', '목', '금', '토', '일']);
    expect(hours[0]).toMatchObject({hours: '정보 없음', isToday: false});
    expect(hours[3]).toMatchObject({
      hours: '10:00 – 15:00\n17:00 – 02:00',
      isToday: true,
    });
    expect(hours[6]).toMatchObject({hours: '휴무', isClosed: true});
  });

  test('영업시간 정보가 없으면 빈 목록을 돌려준다', () => {
    expect(toWeeklyHours(null, THURSDAY)).toEqual([]);
    expect(toWeeklyHours([], THURSDAY)).toEqual([]);
  });

  test('메뉴 가격을 표시 형식으로 바꾸고 가격이 있는 메뉴로만 범위를 만든다', () => {
    const menus = [
      {name: '라떼', price: 6500},
      {name: '디저트', price: null},
      {name: '세트', price: 12000},
    ];

    expect(toMenuItems(menus).map(item => item.price)).toEqual([
      '6,500원',
      '가격 정보 없음',
      '12,000원',
    ]);
    expect(toMenuPriceRange(menus)).toBe('6,500원 ~ 12,000원');
  });

  test('가격이 없거나 하나뿐이면 가격 범위를 만들지 않는다', () => {
    expect(toMenuPriceRange([{name: '디저트', price: null}])).toBeUndefined();
    expect(toMenuPriceRange([{name: '라떼', price: 6500}])).toBeUndefined();
  });

  test.each([
    ['2026-11-12', '오늘'],
    ['2026-11-09', '3일 전'],
    ['2026-10-29', '2주 전'],
    ['2026-10-01', '1개월 전'],
    ['2025-10-01', '1년 전'],
  ])('블로그 글 날짜 %s를 %s로 표시한다', (postDate, label) => {
    const [item] = toBlogListItems(
      {
        source: 'NAVER',
        posts: [{title: '글', bloggerName: '산책', postDate, link: 'https://a.b/1'}],
      },
      THURSDAY,
    );

    expect(item.meta).toBe(`네이버 · 산책 · ${label}`);
  });

  test('작성자와 날짜가 없는 블로그 글은 출처만 표시한다', () => {
    const [item] = toBlogListItems(
      {
        source: 'NAVER',
        posts: [{title: '글', bloggerName: null, postDate: null, link: 'https://a.b/1'}],
      },
      THURSDAY,
    );

    expect(item.meta).toBe('네이버');
  });
});

describe('usePlaceDetailData', () => {
  const info = {openingHours: null, menus: []};
  const blogs = {source: 'NAVER', posts: []};
  let result: ReturnType<typeof usePlaceDetailData>;

  function Harness({placeId, tab}: {placeId: string | null; tab: PlaceTab}) {
    result = usePlaceDetailData(placeId, tab);
    return null;
  }

  async function render(placeId: string | null, tab: PlaceTab) {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Harness placeId={placeId} tab={tab} />);
    });
    return {
      update: (nextPlaceId: string | null, nextTab: PlaceTab) =>
        ReactTestRenderer.act(async () => {
          renderer.update(<Harness placeId={nextPlaceId} tab={nextTab} />);
        }),
    };
  }

  beforeEach(() => {
    jest.mocked(getPlaceInfo).mockReset().mockResolvedValue(info);
    jest.mocked(getPlaceBlogs).mockReset().mockResolvedValue(blogs);
  });

  test('게시물 탭에서는 아무것도 요청하지 않는다', async () => {
    await render('1', '게시물');

    expect(getPlaceInfo).not.toHaveBeenCalled();
    expect(getPlaceBlogs).not.toHaveBeenCalled();
  });

  test('탭을 처음 열 때 한 번만 요청하고 다시 돌아와도 재요청하지 않는다', async () => {
    const {update} = await render('1', '게시물');

    await update('1', '블로그');
    expect(getPlaceBlogs).toHaveBeenCalledTimes(1);
    expect(getPlaceInfo).not.toHaveBeenCalled();
    expect(result.placeBlogs.data).toEqual(blogs);

    await update('1', '게시물');
    await update('1', '블로그');
    expect(getPlaceBlogs).toHaveBeenCalledTimes(1);
  });

  test('장소가 바뀌면 이전 장소의 값을 지우고 새 장소를 요청한다', async () => {
    const {update} = await render('1', '정보');
    expect(getPlaceInfo).toHaveBeenLastCalledWith('1');

    await update('2', '정보');
    expect(getPlaceInfo).toHaveBeenCalledTimes(2);
    expect(getPlaceInfo).toHaveBeenLastCalledWith('2');
  });

  test('placeId가 없으면 요청하지 않는다', async () => {
    await render(null, '블로그');

    expect(getPlaceBlogs).not.toHaveBeenCalled();
    expect(result.placeBlogs).toMatchObject({data: null, isLoading: false});
  });

  test('실패하면 오류를 돌려주고 다시 시도할 수 있다', async () => {
    const error = {status: 502, errorCode: 'PLACE502_001', message: '실패', retryable: true};
    jest.mocked(getPlaceBlogs).mockRejectedValueOnce(error);

    await render('1', '블로그');
    expect(result.placeBlogs.error).toEqual(error);

    await ReactTestRenderer.act(async () => result.placeBlogs.retry());
    expect(getPlaceBlogs).toHaveBeenCalledTimes(2);
    expect(result.placeBlogs).toMatchObject({data: blogs, error: null});
  });
});
