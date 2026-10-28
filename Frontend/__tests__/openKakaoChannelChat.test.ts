import {Linking} from 'react-native';
import {openKakaoChannelChat} from '../src/lib/support/openKakaoChannelChat';

jest.mock('react-native-config', () => ({
  KAKAO_CHANNEL_PUBLIC_ID: '_AxoriX/friend',
  KAKAO_CHANNEL_CHAT_URL: 'https://pf.kakao.com/_other/chat',
}));

describe('openKakaoChannelChat', () => {
  it('opens the configured channel chat room', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    await openKakaoChannelChat();

    expect(openURL).toHaveBeenCalledWith('https://pf.kakao.com/_AxoriX/chat');
  });
});
