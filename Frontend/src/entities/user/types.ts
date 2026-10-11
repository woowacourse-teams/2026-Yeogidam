/** 회원이 가입한 소셜 로그인 제공자입니다. 서버 응답의 oauthProvider 값 그대로입니다. */
export type OAuthProvider = 'KAKAO' | 'GOOGLE' | 'APPLE';

export type User = {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
};
