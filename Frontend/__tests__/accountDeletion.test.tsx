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
import {renderTracked} from './support/renderers';

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
  const renderer = await renderTracked(
    <AccountDeletionScreen
      linkedProviders={['kakao']}
      onBack={jest.fn()}
      onDeleteAccount={onDeleteAccount}
    />,
  );
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

describe('탈퇴 요청 오류 표', () => {
  test.each([
    [
      '토큰이 없으면 로그인이 필요하다고 안내한다',
      new ApiError({kind: 'auth', status: 401, message: '로그인이 필요해요.'}),
      {status: 401, errorCode: 'AUTH401_001', message: '로그인이 필요해요.', retryable: true},
    ],
    [
      '토큰을 읽지 못해도 로그인이 필요하다고 안내한다',
      new ApiError({kind: 'auth', message: '로그인 정보를 확인하지 못했어요.'}),
      {status: 401, errorCode: 'AUTH401_001', message: '로그인이 필요해요.', retryable: true},
    ],
    [
      '서버 코드가 있으면 서버 코드와 문구를 쓰고 401은 다시 시도할 수 있다',
      new ApiError({kind: 'http', status: 401, errorCode: 'AUTH401_004', message: '로그인이 필요한 요청입니다.'}),
      {status: 401, errorCode: 'AUTH401_004', message: '로그인이 필요한 요청입니다.', retryable: true},
    ],
    [
      '서버 코드가 있는 404는 서버 문구를 쓰고 다시 시도하지 않는다',
      new ApiError({kind: 'http', status: 404, errorCode: 'USER404_001', message: '존재하지 않는 사용자입니다.'}),
      {status: 404, errorCode: 'USER404_001', message: '존재하지 않는 사용자입니다.', retryable: false},
    ],
    [
      '코드 없는 400은 요청 확인 문구를 쓴다',
      new ApiError({kind: 'http', status: 400, errorCode: null, message: '요청을 처리하지 못했어요.'}),
      {status: 400, errorCode: 'COMMON400_001', message: '요청 내용을 확인해주세요.', retryable: false},
    ],
    [
      '코드 없는 401은 로그인 필요 문구를 쓴다',
      new ApiError({kind: 'http', status: 401, errorCode: null, message: '요청을 처리하지 못했어요.'}),
      {status: 401, errorCode: 'AUTH401_001', message: '로그인이 필요해요.', retryable: true},
    ],
    [
      '코드 없는 502는 계정 연결 해제 실패로 안내한다',
      new ApiError({kind: 'http', status: 502, errorCode: null, message: '요청을 처리하지 못했어요.'}),
      {status: 502, errorCode: 'USER502_001', message: '연결된 로그인 계정을 해제하지 못했어요.', retryable: true},
    ],
    [
      '코드 없는 그 밖의 5xx는 처리 중 문제로 안내하고 응답 상태를 남긴다',
      new ApiError({kind: 'http', status: 504, errorCode: null, message: '요청을 처리하지 못했어요.'}),
      {status: 504, errorCode: 'COMMON500_001', message: '처리 중 문제가 생겼어요.', retryable: true},
    ],
    [
      '코드 없는 그 밖의 4xx는 처리 실패로 본다',
      new ApiError({kind: 'http', status: 404, errorCode: null, message: '요청을 처리하지 못했어요.'}),
      {status: 404, errorCode: 'CLIENT000_003', message: '응답을 처리하지 못했어요.', retryable: false},
    ],
    [
      '연결 실패는 기본 표를 따른다',
      new ApiError({kind: 'network', message: '인터넷 연결을 확인해주세요.'}),
      {status: null, errorCode: 'CLIENT000_001', message: '인터넷 연결을 확인해주세요.', retryable: true},
    ],
    [
      'ApiError가 아닌 오류는 처리 실패로 본다',
      new Error('secure storage unavailable'),
      {status: null, errorCode: 'CLIENT000_003', message: '응답을 처리하지 못했어요.', retryable: false},
    ],
    [
      '시간 초과는 전송 계층 문구(토큰 재발급 대기 등)를 그대로 쓴다',
      new ApiError({kind: 'timeout', message: '로그인 정보를 확인하고 있어요. 잠시 후 다시 시도해주세요.'}),
      {
        status: null,
        errorCode: 'CLIENT000_002',
        message: '로그인 정보를 확인하고 있어요. 잠시 후 다시 시도해주세요.',
        retryable: true,
      },
    ],
    [
      '응답을 읽지 못하면 처리 실패로 보고 응답 상태를 남긴다',
      new ApiError({kind: 'invalid_response', status: 200, message: '응답을 처리하지 못했어요.'}),
      {status: 200, errorCode: 'CLIENT000_003', message: '응답을 처리하지 못했어요.', retryable: false},
    ],
    [
      '취소는 처리 실패 코드로 다시 시도할 수 있다',
      new ApiError({kind: 'cancelled', message: '요청이 취소됐어요.'}),
      {status: null, errorCode: 'CLIENT000_003', message: '요청이 취소됐어요.', retryable: true},
    ],
    [
      '요청 ID는 화면 오류에 싣지 않는다',
      new ApiError({kind: 'http', status: 404, errorCode: 'USER404_001', message: '존재하지 않는 사용자입니다.', requestId: 'req-1'}),
      {status: 404, errorCode: 'USER404_001', message: '존재하지 않는 사용자입니다.', retryable: false},
    ],
  ])('%s', async (_rule, cause, expected) => {
    mockRequest.mockRejectedValueOnce(cause);

    const error = await deleteAccount({
      confirmation: 'DELETE',
      providerTokens: {kakao: 'code'},
    }).catch(e => e);

    expect(error).toEqual(expected);
  });

  test.each([
    ['시간 초과는 서버 측 실패로 보아 탈퇴된 것처럼 처리한다', new ApiError({kind: 'timeout', message: '응답이 늦어지고 있어요.'}), true],
    ['응답 처리 실패는 서버 측 실패가 아니다', new ApiError({kind: 'invalid_response', status: 200, message: '응답을 처리하지 못했어요.'}), false],
    ['취소는 서버 측 실패가 아니다', new ApiError({kind: 'cancelled', message: '요청이 취소됐어요.'}), false],
  ])('%s', async (_rule, cause, expected) => {
    mockRequest.mockRejectedValueOnce(cause);

    const error = await deleteAccount({
      confirmation: 'DELETE',
      providerTokens: {kakao: 'code'},
    }).catch(e => e);

    expect(isServerSideDeletionFailure(error)).toBe(expected);
  });
});

describe('재인증 오류 표', () => {
  test.each([
    [
      '로그인 미완료는 다시 로그인하라고 안내한다',
      {status: 400, errorCode: 'AUTH400_001', message: '로그인을 완료하지 못했어요. 다시 시도해주세요.', retryable: true},
      {status: 401, errorCode: 'USER401_001', message: '계정 보호를 위해 다시 로그인해주세요.', retryable: true},
    ],
    [
      '제공자 연결 오류는 계정 연결 해제 실패로 안내한다',
      {status: 502, errorCode: 'AUTH502_001', message: '로그인 제공자 연결이 원활하지 않아요.', retryable: true},
      {status: 502, errorCode: 'USER502_001', message: '연결된 로그인 계정을 해제하지 못했어요.', retryable: true},
    ],
    [
      '그 밖의 로그인 오류는 그대로 옮긴다',
      {status: null, errorCode: 'CLIENT000_001', message: '인터넷 연결을 확인해주세요.', retryable: true, requestId: 'req-1'},
      {status: null, errorCode: 'CLIENT000_001', message: '인터넷 연결을 확인해주세요.', retryable: true, requestId: 'req-1'},
    ],
  ])('%s', async (_rule, authError, expected) => {
    jest.mocked(getSpringOAuthAuthorizationCode).mockRejectedValue(authError);

    await expect(reauthenticateDeletionProvider('kakao')).rejects.toEqual(expected);
  });
});
