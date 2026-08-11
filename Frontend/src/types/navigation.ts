export type Screen = 'home' | 'saved' | 'empty' | 'map' | 'detail' | 'my';

export type MainScreen = Exclude<Screen, 'home'>;
