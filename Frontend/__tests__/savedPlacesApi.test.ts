import {createSupabaseSavedPlacesRepository} from '../src/entities/info/api';

describe('saved places deletion', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('deletes with the saved_places row id and no request body', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ok: true, status: 204});
    globalThis.fetch = fetchMock;
    const repository = createSupabaseSavedPlacesRepository({
      baseUrl: 'https://project.supabase.co/',
      publishableKey: 'publishable-key',
      getAccessToken: async () => 'access-token',
    });

    await repository.deleteSavedPlaces(['saved-place-id']);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/saved_places?id=eq.saved-place-id',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          apikey: 'publishable-key',
          Authorization: 'Bearer access-token',
        }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('refreshes the session and retries once after AUTH401_002', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          status: 401,
          errorCode: 'AUTH401_002',
          message: '로그인이 만료됐어요. 다시 로그인해주세요.',
          retryable: true,
        }),
      })
      .mockResolvedValueOnce({ok: true, status: 204});
    const refreshSession = jest.fn().mockResolvedValue(true);
    globalThis.fetch = fetchMock;
    const repository = createSupabaseSavedPlacesRepository({
      baseUrl: 'https://project.supabase.co',
      refreshSession,
    });

    await repository.deleteSavedPlaces(['saved-place-id']);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
