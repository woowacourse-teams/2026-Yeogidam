/**
 * @format
 */

import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { PostHogRoot } from './src/app/PostHogRoot';
import { withHotUpdater } from './src/lib/hot-updater';

function Root() {
  return (
    <PostHogRoot>
      <App />
    </PostHogRoot>
  );
}

AppRegistry.registerComponent(appName, () => withHotUpdater(Root));
