export type AuthScreen = 'login' | 'emailLogin' | 'signup';

export type MainScreen = 'saved' | 'map' | 'my';

export type DetailSource = 'saved' | 'map';

export type AuthFlowState = {
  kind: 'auth';
  stack: AuthScreen[];
};

export type MainFlowState = {
  kind: 'main';
  activeTab: MainScreen;
  detailSource: DetailSource | null;
};

export type AppFlowState = AuthFlowState | MainFlowState;

export type Screen = AuthScreen | MainScreen | 'detail';
