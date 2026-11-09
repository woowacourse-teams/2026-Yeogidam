import React from 'react';
import {Modal} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockCapture = jest.fn();
jest.mock('posthog-react-native', () => ({
  usePostHog: () => ({capture: mockCapture}),
}));

import {PMF_SURVEY, PmfSurveyModal} from '../src/components/PmfSurveyModal';

const DURING_SURVEY = () => new Date('2026-11-13T23:59:59+09:00');
const MEMBER_ID = 'member-1';

async function render(props: Partial<React.ComponentProps<typeof PmfSurveyModal>> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <PmfSurveyModal enabled memberId={MEMBER_ID} now={DURING_SURVEY} {...props} />,
    );
  });
  return renderer;
}

function isVisible(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findByType(Modal).props.visible;
}

function press(renderer: ReactTestRenderer.ReactTestRenderer, testID: string) {
  const button = renderer.root.findByProps({testID});
  return ReactTestRenderer.act(async () => button.props.onPress());
}

function capturedEvents() {
  return mockCapture.mock.calls.map(([name, properties]) => [
    name,
    {survey_id: properties.survey_id, method: properties.method, answer: properties.answer},
  ]);
}

beforeEach(async () => {
  mockCapture.mockClear();
  for (const memberId of [MEMBER_ID, 'member-2']) {
    await AsyncStorage.removeItem(
      `@yeogidam/answered-pmf-survey/${PMF_SURVEY.id}/${memberId}`,
    );
  }
});

test('기간 안에서 로그인한 회원에게만 보여 준다', async () => {
  expect(isVisible(await render())).toBe(true);
  expect(isVisible(await render({memberId: null}))).toBe(false);
  expect(isVisible(await render({enabled: false}))).toBe(false);
  expect(
    isVisible(await render({now: () => new Date('2026-11-14T00:00:00+09:00')})),
  ).toBe(false);
});

test('선택지를 고르기 전에는 답변을 보낼 수 없다', async () => {
  const renderer = await render();
  const submit = renderer.root.findByProps({testID: 'pmf-survey-submit-button'});
  expect(submit.props.disabled).toBe(true);

  await press(renderer, 'pmf-survey-option-very_disappointed');
  expect(
    renderer.root.findByProps({testID: 'pmf-survey-submit-button'}).props.disabled,
  ).toBe(false);
});

test('[나중에]는 이번 실행에서만 숨기고 다음 실행에 다시 묻는다', async () => {
  const renderer = await render();
  await press(renderer, 'pmf-survey-later-button');
  expect(isVisible(renderer)).toBe(false);

  expect(isVisible(await render())).toBe(true);
  expect(capturedEvents()).toContainEqual([
    'pmf_survey_dismissed',
    {survey_id: PMF_SURVEY.id, method: 'later_button', answer: undefined},
  ]);
});

test('답하면 같은 회원에게는 다시 묻지 않고 다른 회원에게는 묻는다', async () => {
  const renderer = await render();
  await press(renderer, 'pmf-survey-option-somewhat_disappointed');
  await press(renderer, 'pmf-survey-submit-button');
  expect(isVisible(renderer)).toBe(false);
  expect(capturedEvents()).toContainEqual([
    'pmf_survey_answered',
    {survey_id: PMF_SURVEY.id, method: undefined, answer: 'somewhat_disappointed'},
  ]);

  expect(isVisible(await render())).toBe(false);
  expect(isVisible(await render({memberId: 'member-2'}))).toBe(true);
});

test('노출 이벤트는 한 실행에 한 번만 남긴다', async () => {
  const renderer = await render();
  await ReactTestRenderer.act(async () => {
    renderer.update(
      <PmfSurveyModal enabled={false} memberId={MEMBER_ID} now={DURING_SURVEY} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer.update(<PmfSurveyModal enabled memberId={MEMBER_ID} now={DURING_SURVEY} />);
  });

  const viewed = mockCapture.mock.calls.filter(([name]) => name === 'pmf_survey_viewed');
  expect(viewed).toHaveLength(1);
});
