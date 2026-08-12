export type Screen =
  | 'home'
  | 'login'
  | 'emailLogin'
  | 'signup'
  | 'saved'
  | 'empty'
  | 'map'
  | 'detail'
  | 'my';

export type MainScreen = Exclude<
  Screen,
  'home' | 'login' | 'emailLogin' | 'signup'
>;
