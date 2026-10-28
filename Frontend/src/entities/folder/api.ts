import {toScreenApiError} from '../../lib/api/screen-error';
import {createSpringApiClient} from '../../lib/api/spring-client';
import type {FolderColorCode} from './color';

const client = createSpringApiClient();
const FOLDERS_PATH = '/api/v1/folders';
const FOLDER_ASSIGNMENTS_PATH = '/api/v1/folder-assignments';

/** 폴더 API가 돌려주는 오류 코드입니다. 화면 문구는 앱이 정하므로 errorCode로 분기합니다. */
export const FOLDER_ERROR_CODES = {
  limitExceeded: 'FOLDER400_001',
  invalidName: 'FOLDER400_002',
  invalidColor: 'FOLDER400_003',
  notFound: 'FOLDER404_001',
  assignmentTargetNotFound: 'FOLDER404_002',
  duplicateName: 'FOLDER409_001',
} as const;

type FolderResponse = {
  folderId: number;
  name: string;
  color: string;
};

export type Folder = {
  id: string;
  name: string;
  // 서버 색 코드입니다. 모르는 코드가 올 수 있어 hex는 toFolderColorHex로 바꿉니다.
  color: string;
};

export type FolderInput = {
  name: string;
  color: FolderColorCode;
};

/** 화면은 {status, errorCode, message, retryable} 계약으로 오류를 분기합니다. */
async function withScreenError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toScreenApiError(error);
  }
}

function toFolder(item: FolderResponse): Folder {
  return {id: String(item.folderId), name: item.name, color: item.color};
}

function folderPath(folderId: string): string {
  return `${FOLDERS_PATH}/${encodeURIComponent(folderId)}`;
}

/** 내 폴더를 만든 순서(folderId 오름차순)로 가져옵니다. */
export function getFolders(): Promise<Folder[]> {
  return withScreenError(async () => {
    const response = await client.request<{folders: FolderResponse[] | null}>(
      FOLDERS_PATH,
    );
    return (response.folders ?? []).map(toFolder);
  });
}

/** 폴더를 만들고 서버가 저장한 폴더를 돌려줍니다. 이름은 서버가 앞뒤 공백을 지웁니다. */
export function createFolder({name, color}: FolderInput): Promise<Folder> {
  return withScreenError(async () => {
    const response = await client.request<FolderResponse>(FOLDERS_PATH, {
      method: 'POST',
      body: {name, color},
    });
    return toFolder(response);
  });
}

/** 이름과 색을 통째로 덮어씁니다. 색만 바꿀 때도 지금 이름을 함께 보내야 합니다. */
export function updateFolder(
  folderId: string,
  {name, color}: FolderInput,
): Promise<void> {
  return withScreenError(async () => {
    await client.request<void>(folderPath(folderId), {
      method: 'PUT',
      body: {name, color},
    });
  });
}

/** 폴더만 지우고 담겨 있던 장소는 보관함에 남습니다. 없는 폴더를 지워도 성공합니다. */
export function deleteFolder(folderId: string): Promise<void> {
  return withScreenError(async () => {
    await client.request<void>(folderPath(folderId), {method: 'DELETE'});
  });
}

/**
 * 보관함 장소가 속할 폴더를 통째로 정합니다. 빈 배열이면 모든 폴더에서 빼고, 같은 요청은 몇 번을 보내도 결과가 같습니다.
 * TODO(#475): 서버 코드가 커밋되기 전 설계 기준이라 리뷰에서 바뀔 수 있습니다.
 */
export function setSavedPlaceFolders(
  savedPlaceId: string,
  folderIds: string[],
): Promise<void> {
  return withScreenError(async () => {
    await client.request<void>(
      `${FOLDER_ASSIGNMENTS_PATH}/${encodeURIComponent(savedPlaceId)}`,
      {
        method: 'PUT',
        // 서버 folderId는 숫자이므로 앱의 문자열 id를 되돌립니다.
        body: {folderIds: [...new Set(folderIds)].map(Number)},
      },
    );
  });
}
