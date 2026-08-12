export type Screen =
  | 'home'
  | 'login'
  | 'saved'
  | 'empty'
  | 'map'
  | 'detail'
  | 'my';

export type MainScreen = Exclude<Screen, 'home' | 'login'>;
