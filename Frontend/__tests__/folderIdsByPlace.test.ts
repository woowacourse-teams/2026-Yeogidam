import {
  getFolderIdsByPlaceId,
  type PlaceFolder,
} from '../src/lib/placeFolderStorage';

const folder = (
  id: string,
  createdAt: string,
  placeAddedAt: Record<string, string>,
): PlaceFolder => ({
  id,
  name: id,
  color: id,
  placeIds: Object.keys(placeAddedAt),
  placeAddedAt,
  createdAt,
});

const folderIdsOf = (folders: PlaceFolder[]) =>
  Object.fromEntries(getFolderIdsByPlaceId(folders));

describe('getFolderIdsByPlaceId', () => {
  test('orders folder ids by added time so the latest comes last', () => {
    const folders = [
      folder('A', '2026-10-01', { cafe: '2026-10-20', bar: '2026-10-02' }),
      folder('B', '2026-10-05', { cafe: '2026-10-10', bar: '2026-10-06' }),
    ];

    expect(folderIdsOf(folders)).toEqual({
      cafe: ['B', 'A'],
      bar: ['A', 'B'],
    });
  });

  test('keeps folder creation order when added at the same time', () => {
    const folders = [
      folder('A', '2026-10-01', { cafe: '2026-10-20' }),
      folder('B', '2026-10-05', { cafe: '2026-10-20' }),
    ];

    expect(folderIdsOf(folders)).toEqual({ cafe: ['A', 'B'] });
  });

  test('uses the folder creation time when the added time is missing', () => {
    const legacy: PlaceFolder = {
      id: 'A',
      name: 'A',
      color: 'A',
      placeIds: ['cafe'],
      createdAt: '2026-10-01',
    };
    const folders = [legacy, folder('B', '2026-10-05', { cafe: '2026-10-03' })];

    expect(folderIdsOf(folders)).toEqual({ cafe: ['A', 'B'] });
  });

  test('omits places that are in no folder', () => {
    expect(getFolderIdsByPlaceId([folder('A', '2026-10-01', {})]).size).toBe(0);
  });
});
