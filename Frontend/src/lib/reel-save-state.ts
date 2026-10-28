import type {ReelProcessingStatus} from '../entities/content/types';
import type {SaveSource} from '../entities/content/types';

export type SharedSaveState = {
  shareResultId?: string;
  url: string;
  status: ReelProcessingStatus['processing_status'];
  reel: ReelProcessingStatus;
  source: SaveSource;
  rawSharedText?: string;
  reused?: boolean;
  saveMode?: 'REVIEW_QUEUE' | 'AUTO_SAVE';
};

let currentState: SharedSaveState | null = null;
const listeners = new Set<(state: SharedSaveState | null) => void>();

export function getSharedSaveState(): SharedSaveState | null {
  return currentState;
}

export function setSharedSaveState(state: SharedSaveState | null): void {
  currentState = state;
  listeners.forEach(listener => listener(currentState));
}

export function subscribeSharedSaveState(
  listener: (state: SharedSaveState | null) => void,
): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => listeners.delete(listener);
}
