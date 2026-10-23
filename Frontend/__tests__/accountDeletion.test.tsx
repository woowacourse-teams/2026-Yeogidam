import React from 'react';
import {Text, TextInput} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {ApiError} from '../src/lib/api/errors';
import {
  deleteAccount,
  isServerSideDeletionFailure,
  reauthenticateDeletionProvider,
} from '../src/lib/auth/deleteAccount';
import {getSpringOAuthAuthorizationCode} from '../src/lib/auth/spring-sign-in';
import {AccountDeletionScreen} from '../src/pages/my-page/AccountDeletionScreen';

const mockRequest = jest.fn();

jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({
    request: (...args: unknown[]) => mockRequest(...args),
  })),
}));

jest.mock('../src/lib/auth/spring-sign-in', () => ({
  getSpringOAuthAuthorizationCode: jest.fn(),
  getSpringAppleCredential: jest.fn(),
}));

const cancelled = {
  status: null,
  errorCode: 'AUTH000_001',
  message: '로그인이 취소됐어요.',
  retryable: false,
};

beforeEach(() => {
  mockRequest.mockReset();
  jest.mocked(getSpringOAuthAuthorizationCode).mockReset();
});

async function renderScreen(onDeleteAccount: jest.Mock) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <AccountDeletionScreen
        linkedProviders={['kakao']}
        onBack={jest.fn()}
        onDeleteAccount={onDeleteAccount}
      />,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(TextInput).props.onChangeText('DELETE');
  });
  return renderer;
}

function pressDelete(renderer: ReactTestRenderer.ReactTestRenderer) {
  const button = renderer.root
    .findAll(node => node.props.onPress && node.props.disabled !== undefined)
    .find(node =>
      node.findAllByType(Text).some(text => text.props.children === '회원탈퇴'),
    );
  if (!button) throw new Error('delete button not found');
  return ReactTestRenderer.act(async () => {
    await button.props.onPress();
  });
}

const visibleTexts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => node.props.children);

test('탈퇴 버튼을 누를 때 재인증하고 받은 인가 코드로 바로 탈퇴를 요청한다', async () => {
  jest.mocked(getSpringOAuthAuthorizationCode).mockResolvedValue('fresh-code');
  const onDeleteAccount = jest.fn(() => Promise.resolve());
  const renderer = await renderScreen(onDeleteAccount);

  await pressDelete(renderer);

  expect(getSpringOAuthAuthorizationCode).toHaveBeenCalledWith('kakao');
  expect(onDeleteAccount).toHaveBeenCalledWith({
    confirmation: 'DELETE',
    providerTokens: {kakao: 'fresh-code'},
  });
});

test('다시 시도할 때마다 새 인가 코드를 받는다', async () => {
  jest
    .mocked(getSpringOAuthAuthorizationCode)
    .mockResolvedValueOnce('code-1')
    .mockResolvedValueOnce('code-2');
  const onDeleteAccount = jest
    .fn()
    .mockRejectedValueOnce({
      status: 401,
      errorCode: 'USER401_001',
      message: '가입한 계정으로 다시 인증해주세요.',
      retryable: true,
    })
    .mockResolvedValueOnce(undefined);
  const renderer = await renderScreen(onDeleteAccount);

  await pressDelete(renderer);
  expect(visibleTexts(renderer)).toContain('가입한 계정으로 다시 인증해주세요.');

  await pressDelete(renderer);
  expect(onDeleteAccount).toHaveBeenLastCalledWith({
    confirmation: 'DELETE',
    providerTokens: {kakao: 'code-2'},
  });
});

test('인증 창을 닫으면 탈퇴하지 않고 오류도 보여주지 않는다', async () => {
  jest.mocked(getSpringOAuthAuthorizationCode).mockRejectedValue(cancelled);
  const onDeleteAccount = jest.fn();
  const renderer = await renderScreen(onDeleteAccount);

  await pressDelete(renderer);

  expect(onDeleteAccount).not.toHaveBeenCalled();
  expect(visibleTexts(renderer)).not.toContain('인증이 취소됐어요.');
});

test('재인증 취소는 AUTH000_001로 돌려준다', async () => {
  jest.mocked(getSpringOAuthAuthorizationCode).mockRejectedValue(cancelled);

  await expect(reauthenticateDeletionProvider('google')).rejects.toMatchObject({
    errorCode: 'AUTH000_001',
  });
});

test('서버가 재인증 계정을 거절하면(AUTH401_002) 가입 계정으로 다시 인증하도록 안내한다', async () => {
  mockRequest.mockRejectedValue(
    new ApiError({
      kind: 'http',
      status: 401,
      errorCode: 'AUTH401_002',
      message: '소셜 로그인 인증 정보가 유효하지 않습니다.',
    }),
  );

  const error = await deleteAccount({
    confirmation: 'DELETE',
    providerTokens: {kakao: 'code'},
  }).catch(e => e);

  expect(error).toMatchObject({
    errorCode: 'USER401_001',
    message: '가입한 계정으로 다시 인증해주세요.',
  });
  expect(isServerSideDeletionFailure(error)).toBe(false);
});

test('네트워크·시간 초과·5xx는 서버 측 실패로 분류한다', async () => {
  for (const cause of [
    new ApiError({kind: 'network', message: 'offline'}),
    new ApiError({kind: 'timeout', message: 'timeout'}),
    new ApiError({kind: 'http', status: 502, errorCode: 'AUTH502_001', message: 'provider'}),
  ]) {
    mockRequest.mockRejectedValueOnce(cause);
    const error = await deleteAccount({
      confirmation: 'DELETE',
      providerTokens: {kakao: 'code'},
    }).catch(e => e);
    expect(isServerSideDeletionFailure(error)).toBe(true);
  }
});
