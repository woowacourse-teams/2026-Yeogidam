import {identifyMember, type IdentityStorage} from '../src/analytics/identity';

function memoryStorage(initial: string | null = null): IdentityStorage & {value: string | null} {
  return {
    value: initial,
    async get() {
      return this.value;
    },
    async set(memberId) {
      this.value = memberId;
    },
  };
}

describe('identifyMember', () => {
  const client = {identify: jest.fn(), reset: jest.fn()};
  beforeEach(() => {
    client.identify.mockClear();
    client.reset.mockClear();
  });

  test('first sign-in on a device keeps the anonymous history', async () => {
    const storage = memoryStorage();
    await identifyMember(client, '42', storage);

    expect(client.reset).not.toHaveBeenCalled();
    expect(client.identify).toHaveBeenCalledWith('42');
    expect(storage.value).toBe('42');
  });

  test('the same member signing in again is not split into a new user', async () => {
    await identifyMember(client, '42', memoryStorage('42'));

    expect(client.reset).not.toHaveBeenCalled();
    expect(client.identify).toHaveBeenCalledWith('42');
  });

  test('a different member on the same device starts a fresh identity', async () => {
    const storage = memoryStorage('42');
    await identifyMember(client, '7', storage);

    expect(client.reset).toHaveBeenCalledTimes(1);
    expect(client.reset.mock.invocationCallOrder[0]).toBeLessThan(
      client.identify.mock.invocationCallOrder[0],
    );
    expect(client.identify).toHaveBeenCalledWith('7');
    expect(storage.value).toBe('7');
  });
});
