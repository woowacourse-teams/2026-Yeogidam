import {useState} from 'react';

import {normalizeInstagramContentUrl, saveContent} from '../../../entities/content/api';
import {normalizeReelError} from '../../../entities/content/errors';
import type {ReelProcessingStatus, SaveInstagramReelResponse} from '../../../entities/content/types';
import {setSharedSaveState} from '../../../lib/reel-save-state';

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
  startLinkSave: (reel: ReelProcessingStatus) => void;
  finishLinkSave: (response: SaveInstagramReelResponse) => void;
  failLinkSave: (reel: ReelProcessingStatus) => void;
};

type Options = {
  isGuest: boolean;
  /** 비회원이 링크를 추가하려 하거나 저장 API가 AUTH401_001로 실패하면 부릅니다. */
  onRequireLogin?: () => void;
  progress: LinkSaveProgress;
};

/**
 * 링크 입력 대화상자와 링크 저장 요청을 맡습니다.
 * 저장 흐름은 공유 상태(reel-save-state)에 적고 progress로 알려, 처리 중이면 useReelProcessing이 이어서 지켜봅니다.
 * 비회원이 대화상자를 열려고 하면 열지 않고 로그인을 요청합니다.
 */
export function useLinkSave({isGuest, onRequireLogin, progress}: Options) {
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [submitState, setSubmitState] = useState<LinkSubmitState>(IDLE);
  const isSubmitting = submitState.status === 'submitting';

  const openDialog = () => {
    if (isGuest) {
      onRequireLogin?.();
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
    const initialReel: ReelProcessingStatus = {
      id: `manual-${Date.now()}`,
      processing_status: 'PROCESSING',
      failure_reason: null,
      instagram_thumbnail_url: null,
      created_at: new Date().toISOString(),
    };

    // 새 링크 요청은 이전 릴스의 카드/폴링 상태를 이어받지 않습니다.
    progress.startLinkSave(initialReel);
    setSharedSaveState({
      url: normalizedUrl,
      status: 'PROCESSING',
      source: 'url_input',
      reel: initialReel,
    });
    setSubmitState(SUBMITTING);
    try {
      const response = await saveContent(linkValue);
      const nextReel: ReelProcessingStatus = {
        id: response.reelId,
        processing_status: response.status,
        failure_reason: response.failureReason ?? null,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      };
      setSharedSaveState({
        url: normalizedUrl,
        status: response.status,
        source: 'url_input',
        reused: response.reused,
        reel: nextReel,
      });
      progress.finishLinkSave(response);
      setIsDialogVisible(false);
      setLinkValue('');
    } catch (submitError) {
      const normalizedError = normalizeReelError(submitError);
      const failedReel: ReelProcessingStatus = {
        id: `manual-failed-${Date.now()}`,
        processing_status: 'FAILED',
        failure_reason: normalizedError.errorCode,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      };
      progress.failLinkSave(failedReel);
      setSharedSaveState({
        url: normalizedUrl,
        status: 'FAILED',
        source: 'url_input',
        reel: failedReel,
      });
      if (normalizedError.errorCode === 'AUTH401_001') {
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
