import {createSpringApiClient} from '../src/lib/api/spring-client';
import {ApiError} from '../src/lib/api/errors';
import {
  FOLDER_ERROR_CODES,
  createFolder,
  deleteFolder,
  getFolders,
  setSavedPlaceFolders,
  updateFolder,
} from '../src/entities/folder/api';

jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({request: jest.fn()})),
}));

const request = (createSpringApiClient as jest.Mock).mock.results[0].value.request as jest.Mock;

beforeEach(() => request.mockReset());

test('폴더 목록을 앱 모델로 변환한다', async () => {
  request.mockResolvedValue({folders: [
    {folderId: 1, name: '데이트 장소', color: 'RED'},
    {folderId: 2, name: '성수 카페', color: 'TEAL'},
  ]});

  await expect(getFolders()).resolves.toEqual([
    {id: '1', name: '데이트 장소', color: 'RED'},
    {id: '2', name: '성수 카페', color: 'TEAL'},
  ]);
  expect(request).toHaveBeenCalledWith('/api/v1/folders');
});

test('폴더가 없으면 빈 배열을 돌려준다', async () => {
  request.mockResolvedValue({folders: []});
  await expect(getFolders()).resolves.toEqual([]);
});

test('폴더를 만들면 서버가 저장한 폴더를 돌려준다', async () => {
  request.mockResolvedValue({folderId: 3, name: '가보고 싶은 곳', color: 'GREEN'});

  await expect(createFolder({name: ' 가보고 싶은 곳 ', color: 'GREEN'})).resolves.toEqual({
    id: '3', name: '가보고 싶은 곳', color: 'GREEN',
  });
  expect(request).toHaveBeenCalledWith('/api/v1/folders', {
    method: 'POST', body: {name: ' 가보고 싶은 곳 ', color: 'GREEN'},
  });
});

test('폴더 수정은 이름과 색을 함께 PUT으로 보낸다', async () => {
  request.mockResolvedValue(undefined);

  await updateFolder('3', {name: '데이트 코스', color: 'PINK'});
  expect(request).toHaveBeenCalledWith('/api/v1/folders/3', {
    method: 'PUT', body: {name: '데이트 코스', color: 'PINK'},
  });
});

test('폴더 삭제는 DELETE로 부른다', async () => {
  request.mockResolvedValue(undefined);

  await deleteFolder('3');
  expect(request).toHaveBeenCalledWith('/api/v1/folders/3', {method: 'DELETE'});
});

test('장소의 폴더 지정은 중복을 지우고 숫자 id로 보낸다', async () => {
  request.mockResolvedValue(undefined);

  await setSavedPlaceFolders('42', ['1', '2', '1']);
  expect(request).toHaveBeenCalledWith('/api/v1/folder-assignments/42', {
    method: 'PUT', body: {folderIds: [1, 2]},
  });

  await setSavedPlaceFolders('42', []);
  expect(request).toHaveBeenLastCalledWith('/api/v1/folder-assignments/42', {
    method: 'PUT', body: {folderIds: []},
  });
});

test('서버 오류는 errorCode를 유지한 화면 오류로 바꾼다', async () => {
  request.mockRejectedValue(new ApiError({
    kind: 'http',
    status: 409,
    errorCode: 'FOLDER409_001',
    message: '같은 이름의 폴더가 이미 있습니다.',
  }));

  await expect(createFolder({name: '성수 카페', color: 'TEAL'})).rejects.toMatchObject({
    status: 409,
    errorCode: FOLDER_ERROR_CODES.duplicateName,
    retryable: false,
  });
});
