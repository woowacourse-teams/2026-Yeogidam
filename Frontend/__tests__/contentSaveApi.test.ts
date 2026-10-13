import {saveContent} from '../src/entities/content/api';
import {supabase} from '../src/lib/auth/supabase';
import {v4 as uuidv4} from 'uuid';

jest.mock('../src/lib/auth/supabase', () => ({
  supabase: {functions: {invoke: jest.fn()}},
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test('일반 URL 저장은 정규화한 주소로 v1 추출을 요청한다', async () => {
  const response = {reelId: 'reel-1', status: 'PROCESSING', reused: false};
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({data: response, error: null});
  const clientRequestId = '6d8c1b73-5be1-4c29-9241-5da0b829e81a';

  await expect(saveContent('https://www.instagram.com/reel/abc/?igsh=123', 'url_input', clientRequestId))
    .resolves.toEqual(response);
  expect(supabase.functions.invoke).toHaveBeenCalledWith('save-instagram-reel', {
    body: {
      instagramUrl: 'https://www.instagram.com/reel/abc/',
      source: 'url_input',
      clientRequestId,
    },
  });
});

test('지원하지 않는 URL은 추출 요청을 보내지 않는다', async () => {
  await expect(saveContent('https://example.com/reel/abc', 'url_input'))
    .rejects.toMatchObject({errorCode: 'REEL400_001'});
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
});

test('명시적인 새 요청마다 서로 다른 UUID를 발급한다', async () => {
  (uuidv4 as jest.Mock)
    .mockReturnValueOnce('6d8c1b73-5be1-4c29-9241-5da0b829e81a')
    .mockReturnValueOnce('6d8c1b73-5be1-4c29-9241-5da0b829e81b');
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({
    data: {reelId: 'reel-1', status: 'PROCESSING', reused: false},
    error: null,
  });

  await saveContent('https://www.instagram.com/reel/abc/', 'url_input');
  await saveContent('https://www.instagram.com/reel/abc/', 'url_input');

  const firstId = (supabase.functions.invoke as jest.Mock).mock.calls[0][1].body.clientRequestId;
  const secondId = (supabase.functions.invoke as jest.Mock).mock.calls[1][1].body.clientRequestId;
  expect(firstId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(secondId).not.toBe(firstId);
});
