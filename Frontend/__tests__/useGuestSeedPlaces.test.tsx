import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {useGuestSeedPlaces} from '../src/app/useGuestSeedPlaces';
import {ONBOARDING_PLACES} from '../src/entities/onboarding/data';

type Snapshot = ReturnType<typeof useGuestSeedPlaces>;
let latest: Snapshot;

function Harness() {
  latest = useGuestSeedPlaces();
  return null;
}

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

// 단언이 중간에 실패해도 그린 훅이 다음 테스트로 넘어가지 않게 여기서 내립니다.
afterEach(async () => {
  for (const renderer of mounted.splice(0)) {
    await act(async () => renderer.unmount());
  }
});

test('시드 장소로 시작하고, 지운 장소는 빠지며, 되돌리면 시드로 돌아온다', async () => {
  await act(async () => {
    mounted.push(ReactTestRenderer.create(<Harness />));
  });
  expect(latest.guestPlaces).toBe(ONBOARDING_PLACES);
  const [first, second] = ONBOARDING_PLACES;

  await act(async () => {
    latest.deleteGuestPlaces([first.id]);
  });
  expect(latest.guestPlaces.map(place => place.id)).not.toContain(first.id);
  expect(latest.guestPlaces.map(place => place.id)).toContain(second.id);
  expect(latest.guestPlaces).toHaveLength(ONBOARDING_PLACES.length - 1);

  await act(async () => {
    latest.resetGuestPlaces();
  });
  expect(latest.guestPlaces).toBe(ONBOARDING_PLACES);
});

test('지우기와 되돌리기 함수는 다시 그려도 같은 참조다', async () => {
  await act(async () => {
    mounted.push(ReactTestRenderer.create(<Harness />));
  });
  const {deleteGuestPlaces, resetGuestPlaces} = latest;

  await act(async () => {
    latest.deleteGuestPlaces([ONBOARDING_PLACES[0].id]);
  });
  expect(latest.deleteGuestPlaces).toBe(deleteGuestPlaces);
  expect(latest.resetGuestPlaces).toBe(resetGuestPlaces);
});
