import {useState} from 'react';

import {normalizeInstagramContentUrl, saveContent} from '../../../entities/content/api';
import {normalizeReelError} from '../../../entities/content/errors';
import type {SaveInstagramReelResponse} from '../../../entities/content/types';
import {isLoginRequiredError} from '../../../lib/api/screen-error';
import {setSharedSaveState} from '../../../lib/reel-save-state';
import {toProcessingReel} from '../reelProcessing';

/** 링크 저장 요청 상태입니다. 보내는 중에는 오류 문구가 없습니다. */
type LinkSubmitState =
  | {status: 'idle'}
  | {status: 'submitting'}
  | {status: 'error'; message: string};

const IDLE: LinkSubmitState = {status: 'idle'};
const SUBMITTING: LinkSubmitState = {status: 'submitting'};

/** 오류 문구만 지웁니다. 보내는 중이면 그대로 둡니다. */
const clearLinkError = (current: LinkSubmitState): LinkSubmitState =>
  current.status === 'error' ? IDLE : current;

/** 요청이 끝났습니다. 그사이 오류 문구가 생겼으면 문구를 둡니다. */
const finishSubmitting = (current: LinkSubmitState): LinkSubmitState =>
  current.status === 'submitting' ? IDLE : current;

/** 링크 저장 흐름을 처리 중 릴스 상태(useReelProcessing)에 알리는 동작입니다. */
type LinkSaveProgress = {
  startLinkSave: () => void;
  /** createdAt은 공유 상태에 적은 릴스의 만든 시각과 같은 값입니다. */
  finishLinkSave: (response: SaveInstagramReelResponse, createdAt: string) => void;
};

type Options = {
  isGuest: boolean;
  /** 비회원이 링크를 추가하려 하면 로그인 안내 모달을 띄우도록 부릅니다. 없으면 onRequireLogin을 부릅니다. */
  onShowGuestLoginPrompt?: () => void;
  /** 비회원이 링크를 추가하려 하거나(onShowGuestLoginPrompt가 없을 때) 저장 API가 AUTH401_001로 실패하면 부릅니다. */
  onRequireLogin?: () => void;
  progress: LinkSaveProgress;
};

/**
 * 링크 입력 대화상자와 링크 저장 요청을 맡습니다.
 * 서버가 응답한 저장은 공유 상태(reel-save-state)에 적고 progress로 알려, 처리 중이면 useReelProcessing이 이어서 지켜봅니다.
 * 응답 전과 요청 실패 때는 서버 릴스 ID가 없으므로 공유 상태에 지켜볼 릴스를 적지 않습니다.
 * 비회원이 대화상자를 열려고 하면 열지 않고 로그인 안내(없으면 로그인 요청)를 부릅니다.
 */
export function useLinkSave({isGuest, onShowGuestLoginPrompt, onRequireLogin, progress}: Options) {
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [submitState, setSubmitState] = useState<LinkSubmitState>(IDLE);
  const isSubmitting = submitState.status === 'submitting';

  const openDialog = () => {
    if (isGuest) {
      (onShowGuestLoginPrompt ?? onRequireLogin)?.();
      return;
    }
    setSubmitState(clearLinkError);
    setIsDialogVisible(true);
  };

  const closeDialog = () => {
    if (isSubmitting) {
      return;
    }
    setIsDialogVisible(false);
    setLinkValue('');
    setSubmitState(clearLinkError);
  };

  const changeLinkValue = (value: string) => {
    setLinkValue(value);
    setSubmitState(clearLinkError);
  };

  const saveLink = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedUrl =
      normalizeInstagramContentUrl(linkValue) ?? linkValue.trim();

    // 새 링크 요청은 이전 릴스의 폴링을 이어받지 않습니다. 서버가 릴스 ID를 주기 전에는
    // 목록에서 찾을 릴스가 없으므로 공유 상태를 비워 두고 폴링하지 않습니다.
    progress.startLinkSave();
    setSharedSaveState(null);
    setSubmitState(SUBMITTING);
    try {
      const response = await saveContent(linkValue);
      // 공유 상태와 처리 중 릴스 상태가 같은 만든 시각을 쓰도록 여기서 한 번만 찍습니다.
      const createdAt = new Date().toISOString();
      setSharedSaveState({
        url: normalizedUrl,
        status: response.status,
        source: 'url_input',
        reused: response.reused,
        reel: toProcessingReel(response, createdAt),
      });
      progress.finishLinkSave(response, createdAt);
      setIsDialogVisible(false);
      setLinkValue('');
    } catch (submitError) {
      // 실패한 요청은 서버 릴스가 없어 공유 상태에 쓰지 않습니다. 그사이 들어온 외부 공유도 그대로 둡니다.
      const normalizedError = normalizeReelError(submitError);
      if (isLoginRequiredError(normalizedError)) {
        setIsDialogVisible(false);
        onRequireLogin?.();
        return;
      }

      setSubmitState({status: 'error', message: normalizedError.message});
    } finally {
      setSubmitState(finishSubmitting);
    }
  };

  return {
    isDialogVisible,
    linkValue,
    linkError: submitState.status === 'error' ? submitState.message : null,
    isSubmitting,
    openDialog,
    closeDialog,
    changeLinkValue,
    saveLink,
  };
}
