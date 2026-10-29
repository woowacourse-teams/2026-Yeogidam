import { bare } from '@hot-updater/bare';
import { d1Database, r2Storage } from '@hot-updater/cloudflare';
import { withSentry } from '@hot-updater/sentry-plugin';
import { defineConfig } from 'hot-updater';
import { apiKeys, insights, remoteConfig } from 'hot-updater/plugins';
import { existsSync } from 'node:fs';

if (existsSync('.env.hotupdater')) {
  process.loadEnvFile('.env.hotupdater');
}

export default defineConfig({
  // OTA 배포 때 번들의 소스맵을 Sentry에 올린다. 번들마다 붙는 고유 식별자(Debug ID)로
  // 소스맵을 찾으므로, 앱 버전이 같아도 OTA 번들별로 에러 위치를 원래 코드로 복원할 수 있다.
  build: withSentry(bare({ enableHermes: true, sourcemap: true }), {
    org: 'yeogidam',
    project: 'react-native',
    authToken: process.env.SENTRY_AUTH_TOKEN,
  }),
  storage: r2Storage({
    bucketName: process.env.HOT_UPDATER_CLOUDFLARE_R2_BUCKET_NAME!,
    accountId: process.env.HOT_UPDATER_CLOUDFLARE_ACCOUNT_ID!,
    credentials: {
      accessKeyId: process.env.HOT_UPDATER_CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.HOT_UPDATER_CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  }),
  database: d1Database({
    databaseId: process.env.HOT_UPDATER_CLOUDFLARE_D1_DATABASE_ID!,
    accountId: process.env.HOT_UPDATER_CLOUDFLARE_ACCOUNT_ID!,
    cloudflareApiToken: process.env.HOT_UPDATER_CLOUDFLARE_API_TOKEN!,
  }),
  plugins: [apiKeys(), insights(), remoteConfig()],
  updateStrategy: 'fingerprint', // or "appVersion",
  fingerprint: {
    extraSources: {
      ios: ['ios/**'],
      android: ['android/**'],
    },
    ignorePaths: [
      '**/sentry.properties',
      'android/local.properties',
      'ios/.xcode.env.local',
      '**/xcuserdata/**',
      '**/.idea/**',
      '**/.DS_Store',
      '**/.env',
    ],
  },
  signing: {
    enabled: true,
    privateKeyPath: './keys/private-key.pem',
  },
  platform: {
    ios: { infoPlistPaths: ['ios/Frontend/Info.plist'] },
    android: {
      androidManifestPaths: ['android/app/src/main/AndroidManifest.xml'],
    },
  },
});
