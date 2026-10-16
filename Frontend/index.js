/**
 * @format
 */

import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { OtaUpdater } from './src/app/OtaUpdater';
import { PostHogRoot } from './src/app/PostHogRoot';

function Root() {
  return (
    <PostHogRoot>
      <OtaUpdater />
      <App />
    </PostHogRoot>
  );
}

AppRegistry.registerComponent(appName, () => Root);
