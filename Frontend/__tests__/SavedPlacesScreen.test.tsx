import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type { ShareResult } from '../src/entities/content/types';
import { ApiError } from '../src/lib/api/errors';
import type { ExtractionPollerEvent } from '../src/lib/extraction-poller';
import { SavedPlacesLinkDialog } from '../src/pages/saved-places/components/SavedPlacesLinkDialog';
import { SavedPlacesScreen } from '../src/pages/saved-places/SavedPlacesScreen';

const mockCreateShare = jest.fn();
const mockGetSavedPlaces = jest.fn();
const mockRegisterExtraction = jest.fn();
const mockPollerListeners = new Set<(event: ExtractionPollerEvent) => void>();

jest.mock('posthog-react-native', () => ({ usePostHog: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/entities/info/api', () => ({
  getSavedPlaces: () => mockGetSavedPlaces(),
  deleteSavedPlaces: jest.fn(),
}));

jest.mock('../src/entities/content/api', () => ({
  ...jest.requireActual('../src/entities/content/api'),
  createShare: (instagramUrl: string) => mockCreateShare(instagramUrl),
}));

jest.mock('../src/lib/extraction-poller', () => ({
  registerExtraction: (sharedMediaId: string) =>
    mockRegisterExtraction(sharedMediaId),
  subscribeExtractionPoller: (
    listener: (event: ExtractionPollerEvent) => void,
  ) => {
    mockPollerListeners.add(listener);
    return () => {
      mockPollerListeners.delete(listener);
    };
  },
}));

/** 사용자가 붙여 넣은 링크이며, 화면은 쿼리를 떼어 정규형으로 보냅니다. */
const PASTED_LINK = 'https://instagram.com/reel/C1seongsu/?igsh=abc';
const NORMALIZED_LINK = 'https://www.instagram.com/reel/C1seongsu/';

async function renderScreen(onRequireLogin = jest.fn()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesScreen
        onOpenDetail={jest.fn()}
        onRequireLogin={onRequireLogin}
      />,
    );
  });
  return renderer;
}

function findDialog(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findByType(SavedPlacesLinkDialog);
}

/** 저장 버튼입니다. 대화상자는 isSubmitting을 이 버튼의 disabled로 넘깁니다. */
function findSaveButtons(renderer: ReactTestRenderer.ReactTestRenderer) {
  const dialog = findDialog(renderer);
  return dialog.findAll(node => node.props.onPress === dialog.props.onSubmit);
}

async function enterLink(
  renderer: ReactTestRenderer.ReactTestRenderer,
  link: string,
) {
  await ReactTestRenderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: '장소 링크 추가' })
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    findDialog(renderer).props.onChangeValue(link);
  });
}

async function submit(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => {
    await findDialog(renderer).props.onSubmit();
  });
}

function shareResult(
  extractionStatus: ShareResult['extractionStatus'],
): ShareResult {
  return { sharedMediaId: '30', extractionStatus };
}

beforeEach(() => {
  mockGetSavedPlaces.mockResolvedValue([]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockPollerListeners.clear();
});

describe('link submission', () => {
  it('hands an EXTRACTING share to the poller and closes the dialog', async () => {
    mockCreateShare.mockResolvedValue(shareResult('EXTRACTING'));
    const renderer = await renderScreen();

    await enterLink(renderer, PASTED_LINK);
    await submit(renderer);

    expect(mockCreateShare).toHaveBeenCalledWith(NORMALIZED_LINK);
    expect(mockRegisterExtraction).toHaveBeenCalledWith('30');
    expect(mockGetSavedPlaces).toHaveBeenCalledTimes(1);
    expect(findDialog(renderer).props.visible).toBe(false);
  });

  it('reloads the saved places right away without polling when the share already SUCCEEDED', async () => {
    mockCreateShare.mockResolvedValue(shareResult('SUCCEEDED'));
    const renderer = await renderScreen();

    await enterLink(renderer, PASTED_LINK);
    await submit(renderer);

    expect(mockGetSavedPlaces).toHaveBeenCalledTimes(2);
    expect(mockRegisterExtraction).not.toHaveBeenCalled();
    expect(findDialog(renderer).props.visible).toBe(false);
  });

  it('shows the failure guidance without polling when the share FAILED', async () => {
    mockCreateShare.mockResolvedValue(shareResult('FAILED'));
    const renderer = await renderScreen();

    await enterLink(renderer, PASTED_LINK);
    await submit(renderer);

    expect(Alert.alert).toHaveBeenCalledWith(
      '장소 분석에 실패했어요',
      '히스토리에서 자세한 내용을 확인할 수 있어요.',
    );
    expect(mockRegisterExtraction).not.toHaveBeenCalled();
    expect(mockGetSavedPlaces).toHaveBeenCalledTimes(1);
  });

  it('disables the save button while the request is in flight', async () => {
    let resolveShare!: (result: ShareResult) => void;
    mockCreateShare.mockReturnValue(
      new Promise<ShareResult>(resolve => {
        resolveShare = resolve;
      }),
    );
    const renderer = await renderScreen();
    await enterLink(renderer, PASTED_LINK);

    await ReactTestRenderer.act(async () => {
      findDialog(renderer).props.onSubmit();
    });

    expect(findDialog(renderer).props.isSubmitting).toBe(true);
    const saveButtons = findSaveButtons(renderer);
    expect(saveButtons.length).toBeGreaterThan(0);
    saveButtons.forEach(button => expect(button.props.disabled).toBe(true));

    await ReactTestRenderer.act(async () => {
      findDialog(renderer).props.onSubmit();
    });
    expect(mockCreateShare).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      resolveShare(shareResult('EXTRACTING'));
    });
    expect(findDialog(renderer).props.isSubmitting).toBe(false);
  });

  it('keeps the dialog open with the message for a link that is not an Instagram reel', async () => {
    const renderer = await renderScreen();

    await enterLink(renderer, 'https://example.com/reel/C1seongsu/');
    await submit(renderer);

    expect(mockCreateShare).not.toHaveBeenCalled();
    expect(findDialog(renderer).props.errorMessage).toBe(
      '지원하지 않는 링크입니다. Instagram 릴스 링크를 입력해주세요.',
    );
  });

  it('asks for login when the request carries no token', async () => {
    mockCreateShare.mockRejectedValue(
      new ApiError({
        status: 401,
        errorCode: 'AUTH401_004',
        message: '로그인이 필요한 요청입니다.',
        requestId: 'req-1',
      }),
    );
    const onRequireLogin = jest.fn();
    const renderer = await renderScreen(onRequireLogin);

    await enterLink(renderer, PASTED_LINK);
    await submit(renderer);

    expect(onRequireLogin).toHaveBeenCalledTimes(1);
    expect(findDialog(renderer).props.visible).toBe(false);
  });
});

describe('poller subscription', () => {
  it('reloads the saved places only when an extraction SUCCEEDED', async () => {
    await renderScreen();
    expect(mockPollerListeners.size).toBe(1);
    const [listener] = [...mockPollerListeners];

    await ReactTestRenderer.act(async () => {
      listener({
        finished: [{ sharedMediaId: '30', extractionStatus: 'FAILED' }],
        extractingCount: 0,
      });
    });
    expect(mockGetSavedPlaces).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      listener({
        finished: [{ sharedMediaId: '31', extractionStatus: 'SUCCEEDED' }],
        extractingCount: 0,
      });
    });
    expect(mockGetSavedPlaces).toHaveBeenCalledTimes(2);
  });
});
