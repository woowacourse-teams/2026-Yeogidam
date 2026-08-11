import {placeMocks} from './mocks';
import type {Place} from './types';

export async function getPlaces(): Promise<Place[]> {
  return Promise.resolve(placeMocks);
}
