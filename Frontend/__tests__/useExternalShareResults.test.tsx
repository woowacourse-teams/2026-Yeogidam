import React from 'react';

import type {Place} from '../src/entities/place/types';
import {getSharedSaveState, setSharedSaveState} from '../src/lib/reel-save-state';
import {useExternalShareResults} from '../src/pages/saved-places/hooks/useExternalShareResults';
import {renderTracked, settleAsyncWork} from './support/renderers';
import {reelStatus, sharedShare} from './support/savedPlacesFixtures';

// 공유 API 모듈은 그대로 쓰고 네트워크 경계(spring-client)만 바꿔, 응답 모양 확인이 외부 공유 확인 흐름까지 이어지는지 본다.
const mockRequest = jest.fn();
jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: () => ({
    request: (...args: unknown[]) => mockRequest(...args),
  }),
}));

const loadSavedPlaces = jest.fn((): Promise<Place[] | null> => Promise.resolve([]));
const onSharedResultConsumed = jest.fn((_requestId?: string) => Promise.resolve());
const dispatch = jest.fn();
let warnSpy: jest.SpyInstance;

function Harness() {
  useExternalShareResults({enabled: true, loadSavedPlaces, onSharedResultConsumed, dispatch});
  return null;
}

async function renderVerifying() {
  // 앱 진입 때 받은 처리 중 외부 공유는 서버 상태를 한 번 확인한 뒤에 보여 준다.
  setSharedSaveState(sharedShare(reelStatus('8', 'PROCESSING')));
  await renderTracked(<Harness />);
  await settleAsyncWork();
}

beforeEach(() => {
  mockRequest.mockReset();
  loadSavedPlaces.mockClear();
  onSharedResultConsumed.mockClear();
  dispatch.mockClear();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  setSharedSaveState(null);
  warnSpy.mockRestore();
});

test('확인 응답 모양이 어긋나면 확인 실패로 보고, 공유 상태를 지우지 않으며 결과를 소비하지 않는다', async () => {
  mockRequest.mockResolvedValue({nextCursor: null});
  await renderVerifying();

  expect(mockRequest).toHaveBeenCalledWith('/api/v1/shares');
  expect(getSharedSaveState()).toMatchObject({shareResultId: 'request-1', reel: {id: '8'}});
  expect(onSharedResultConsumed).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalledWith(
    expect.objectContaining({view: expect.objectContaining({type: 'show'})}),
  );
});

test('확인한 공유가 목록에 없으면 공유 상태를 지우고 결과를 소비한다', async () => {
  mockRequest.mockResolvedValue({sharedMedias: [], nextCursor: null});
  await renderVerifying();

  expect(getSharedSaveState()).toBeNull();
  expect(onSharedResultConsumed).toHaveBeenCalledWith('request-1');
});
