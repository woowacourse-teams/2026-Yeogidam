import Config from 'react-native-config';

/** Spring Boot API origin. Keep the /api/v1 path in each endpoint. */
export function getApiBaseUrl(): string {
  const value = Config.API_BASE_URL?.trim().replace(/\/+$/, '');

  if (!value) {
    throw new Error('Missing required environment variable: API_BASE_URL');
  }

  if (!/^https?:\/\/[^\s/?#]+$/.test(value)) {
    throw new Error('API_BASE_URL must be an http(s) origin without a path');
  }

  return value;
}
