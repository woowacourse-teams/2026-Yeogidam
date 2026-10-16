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

test('시드 장소로 시작하고, 지운 장소는 빠지며, 되돌리면 시드로 돌아온다', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
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
  await act(async () => renderer.unmount());
});

test('지우기와 되돌리기 함수는 다시 그려도 같은 참조다', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
  });
  const {deleteGuestPlaces, resetGuestPlaces} = latest;

  await act(async () => {
    latest.deleteGuestPlaces([ONBOARDING_PLACES[0].id]);
  });
  expect(latest.deleteGuestPlaces).toBe(deleteGuestPlaces);
  expect(latest.resetGuestPlaces).toBe(resetGuestPlaces);
  await act(async () => renderer.unmount());
});
