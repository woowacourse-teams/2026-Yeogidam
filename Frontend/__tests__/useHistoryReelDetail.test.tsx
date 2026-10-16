import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {getHistoryReelDetail} from '../src/entities/content/history-api';
import type {HistoryReel, HistoryReelDetail} from '../src/entities/content/types';
import {useHistoryReelDetail} from '../src/pages/history/useHistoryReelDetail';

jest.mock('../src/entities/content/history-api', () => ({getHistoryReelDetail: jest.fn()}));

const reel = (id: number): HistoryReel => ({
  id: String(id),
  instagram_url: `https://www.instagram.com/reel/${id}/`,
  instagram_title: null,
  instagram_description: `게시물 ${id}`,
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: `https://cdn.example.com/${id}.jpg`,
  processing_status: 'COMPLETED',
  failure_reason: null,
  save_mode: null,
  created_at: '2026-10-15T00:00:00Z',
});

const detailOf = (base: HistoryReel): HistoryReelDetail => ({
  ...base,
  extraction: {extraction_places: []},
});

type Snapshot = ReturnType<typeof useHistoryReelDetail>;
let latest: Snapshot;

type HarnessProps = {target: HistoryReel; guestDetail?: HistoryReelDetail | null};

function Harness({target, guestDetail}: HarnessProps) {
  latest = useHistoryReelDetail(target, guestDetail);
  return null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

async function render(props: HarnessProps) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness {...props} />);
  });
  return {
    rerender: (next: HarnessProps) =>
      ReactTestRenderer.act(async () => {
        renderer.update(<Harness {...next} />);
      }),
  };
}

beforeEach(() => {
  jest.mocked(getHistoryReelDetail).mockReset();
});

test('회원은 상세를 읽는 동안 loading이고, 읽으면 상세를 담은 success가 된다', async () => {
  const request = deferred<HistoryReelDetail>();
  jest.mocked(getHistoryReelDetail).mockReturnValueOnce(request.promise);

  await render({target: reel(1)});
  expect(latest).toEqual({status: 'loading'});
  expect(getHistoryReelDetail).toHaveBeenCalledWith(reel(1));

  await ReactTestRenderer.act(async () => request.resolve(detailOf(reel(1))));
  expect(latest).toEqual({status: 'success', detail: detailOf(reel(1))});
});

test('조회가 실패하면 error가 된다', async () => {
  jest.mocked(getHistoryReelDetail).mockRejectedValueOnce(new Error('offline'));

  await render({target: reel(1)});
  expect(latest).toEqual({status: 'error'});
});

test('폴링이 같은 항목을 새 객체로 바꿔도 다시 읽지 않는다', async () => {
  jest.mocked(getHistoryReelDetail).mockResolvedValue(detailOf(reel(1)));

  const {rerender} = await render({target: reel(1)});
  await rerender({target: {...reel(1), instagram_description: '바뀐 캡션'}});

  expect(getHistoryReelDetail).toHaveBeenCalledTimes(1);
  expect(latest).toEqual({status: 'success', detail: detailOf(reel(1))});
});

test('비회원은 서버에 묻지 않고 체험 상세를 쓰며, 체험 상세가 없으면 찾은 장소가 없는 상세로 본다', async () => {
  const {rerender} = await render({target: reel(1), guestDetail: detailOf(reel(1))});
  expect(latest).toEqual({status: 'success', detail: detailOf(reel(1))});

  await rerender({target: reel(2), guestDetail: null});
  expect(latest).toEqual({status: 'success', detail: {...reel(2), extraction: null}});
  expect(getHistoryReelDetail).not.toHaveBeenCalled();
});

test('상세가 열린 채 항목 ID가 바뀌면 늦게 온 이전 응답을 버린다', async () => {
  const first = deferred<HistoryReelDetail>();
  const second = deferred<HistoryReelDetail>();
  jest
    .mocked(getHistoryReelDetail)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);

  const {rerender} = await render({target: reel(1)});
  await rerender({target: reel(2)});
  expect(latest).toEqual({status: 'loading'});

  await ReactTestRenderer.act(async () => second.resolve(detailOf(reel(2))));
  expect(latest).toEqual({status: 'success', detail: detailOf(reel(2))});

  await ReactTestRenderer.act(async () => first.resolve(detailOf(reel(1))));
  expect(latest).toEqual({status: 'success', detail: detailOf(reel(2))});
});

test('항목 ID가 바뀌면 이전 상세를 남기지 않고 다시 읽으며, 조회가 실패하면 error가 된다', async () => {
  const second = deferred<HistoryReelDetail>();
  jest
    .mocked(getHistoryReelDetail)
    .mockResolvedValueOnce(detailOf(reel(1)))
    .mockReturnValueOnce(second.promise);

  const {rerender} = await render({target: reel(1)});
  expect(latest).toEqual({status: 'success', detail: detailOf(reel(1))});

  await rerender({target: reel(2)});
  expect(latest).toEqual({status: 'loading'});

  await ReactTestRenderer.act(async () => second.reject(new Error('offline')));
  expect(latest).toEqual({status: 'error'});
});
