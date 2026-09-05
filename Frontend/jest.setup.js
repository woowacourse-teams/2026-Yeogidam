/* global jest */

jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map();

  return {
    __esModule: true,
    default: {
      getItem: jest.fn(key => Promise.resolve(storage.get(key) ?? null)),
      setItem: jest.fn((key, value) => {
        storage.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn(key => {
        storage.delete(key);
        return Promise.resolve();
      }),
    },
  };
});

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {
    setString: jest.fn(),
    getString: jest.fn(() => Promise.resolve('')),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
  },
}));

jest.mock('./src/lib/app-update-policy', () => ({
  getAppUpdatePolicy: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');

  return function LinearGradientMock({ children, ...props }) {
    return React.createElement(View, props, children);
  };
});

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  setGenericPassword: jest.fn(() => Promise.resolve({ service: 'mock' })),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('react-native-inappbrowser-reborn', () => ({
  InAppBrowser: {
    isAvailable: jest.fn(() => Promise.resolve(true)),
    openAuth: jest.fn(() =>
      Promise.resolve({
        type: 'cancel',
      }),
    ),
    closeAuth: jest.fn(),
  },
}));

jest.mock('@invertase/react-native-apple-authentication', () => ({
  appleAuth: {
    isSupported: true,
    performRequest: jest.fn(() =>
      Promise.resolve({
        identityToken: 'apple-token',
        fullName: null,
      }),
    ),
    Error: {
      CANCELED: '1001',
    },
    Operation: {
      LOGIN: 1,
    },
    Scope: {
      EMAIL: 0,
      FULL_NAME: 1,
    },
  },
}));
