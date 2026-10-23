import {Platform} from 'react-native';
import {appleAuth} from '@invertase/react-native-apple-authentication';

import type {SpringLoginResponse} from '../api/spring-auth-api';
import {normalizeAuthError} from './errors';
import {signInWithSpringApple} from './spring-sign-in';

export const isAppleSignInSupported =
  Platform.OS === 'ios' && appleAuth.isSupported;

export async function signInWithApple(): Promise<SpringLoginResponse> {
  try {
    return await signInWithSpringApple();
  } catch (error) {
    throw normalizeAuthError(error);
  }
}
