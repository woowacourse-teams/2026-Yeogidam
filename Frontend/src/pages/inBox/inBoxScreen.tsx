import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';

import { BOTTOM_NAVIGATION_BAR_HEIGHT } from '../../components/BottomNavigationBar';
import InboxChevronRight from '../../assets/icons/inbox-chevron-right.svg';
import InboxHeaderFrame from '../../assets/icons/inbox-header-frame.svg';
import InstagramIcon from '../../assets/icons/social/instagram.svg';
import {
  getInboxSelection,
  setInboxSelection,
} from '../../lib/inbox-selection-storage';

type Place = { id: string; name: string; imageUrl: string };
type Item = {
  id: string;
  title: string;
  source: string;
  imageUrl: string;
  places: Place[];
};

const items: Item[] = [
  {
    id: 'seoul',
    title: '서울 최초로 생김 숲속 감성 숙소',
    source: '@seoul_sources',
    imageUrl:
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=400&q=80',
    places: [
      {
        id: 'layer',
        name: '레이어 커피바',
        imageUrl:
          'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=300&q=80',
      },
      {
        id: 'oneul',
        name: '카페 온일',
        imageUrl:
          'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=300&q=80',
      },
      {
        id: 'layer-two',
        name: '레이어 커피바',
        imageUrl:
          'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=300&q=80',
      },
    ],
  },
  {
    id: 'walk',
    title: '더위를 잊게 하는 여름 산책 코스',
    source: '@seoul_sources',
    imageUrl:
      'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=400&q=80',
    places: [
      {
        id: 'park',
        name: '서울숲',
        imageUrl:
          'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=300&q=80',
      },
    ],
  },
  {
    id: 'dessert',
    title: '성수에서 찾은 작은 디저트 가게',
    source: '@seoul_sources',
    imageUrl:
      'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=400&q=80',
    places: [
      {
        id: 'seongsu-bakery',
        name: '성수 베이커리',
        imageUrl:
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80',
      },
      {
        id: 'sweet-table',
        name: '스위트 테이블',
        imageUrl:
          'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=300&q=80',
      },
    ],
  },
  {
    id: 'gallery',
    title: '비 오는 날 가기 좋은 전시 공간',
    source: '@artlog',
    imageUrl:
      'https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=400&q=80',
    places: [
      {
        id: 'seoul-museum',
        name: '서울시립미술관',
        imageUrl:
          'https://images.unsplash.com/photo-1561214115-f2f134cc4912?auto=format&fit=crop&w=300&q=80',
      },
    ],
  },
  {
    id: 'night',
    title: '한강 야경을 즐기는 서울의 밤',
    source: '@seoul_sources',
    imageUrl:
      'https://images.unsplash.com/photo-1538485399081-7191377e8241?auto=format&fit=crop&w=400&q=80',
    places: [
      {
        id: 'hangang-park',
        name: '반포 한강공원',
        imageUrl:
          'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=300&q=80',
      },
      {
        id: 'banpo-bridge',
        name: '반포대교 달빛무지개분수',
        imageUrl:
          'https://images.unsplash.com/photo-1548115184-bc6544d06a58?auto=format&fit=crop&w=300&q=80',
      },
    ],
  },
];

const CARD_HORIZONTAL_PADDING = 6;
const CHEVRON_WIDTH = 33;
const CARD_CONTENT_GAP = 10;
const PLACE_LIST_LEFT_INSET =
  CARD_HORIZONTAL_PADDING + CHEVRON_WIDTH + CARD_CONTENT_GAP;
const PLACE_LIST_RIGHT_INSET = 23;

export function InBoxScreen() {
  const [expandedIds, setExpandedIds] = useState<string[]>([items[0].id]);
  const [isEmptyState, setIsEmptyState] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);
  const [isSelectionHydrated, setIsSelectionHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getInboxSelection().then(selection => {
      if (!isMounted) {
        return;
      }

      setSelectedItemIds(
        selection.itemIds.filter(id => items.some(item => item.id === id)),
      );
      setSelectedPlaceIds(
        selection.placeIds.filter(id =>
          items.some(item => item.places.some(place => place.id === id)),
        ),
      );
      setIsSelectionHydrated(true);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isSelectionHydrated) {
      return;
    }

    setInboxSelection({ itemIds: selectedItemIds, placeIds: selectedPlaceIds });
  }, [isSelectionHydrated, selectedItemIds, selectedPlaceIds]);
  const toggleSelectedPlace = (id: string) =>
    setSelectedPlaceIds(current =>
      current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id],
    );
  const toggleSelectedItem = (item: Item) => {
    const allPlacesSelected = item.places.every(place =>
      selectedPlaceIds.includes(place.id),
    );

    if (selectedItemIds.includes(item.id)) {
      setSelectedItemIds(current => current.filter(value => value !== item.id));
      return;
    }

    if (allPlacesSelected) {
      setSelectedPlaceIds(current =>
        current.filter(id => !item.places.some(place => place.id === id)),
      );
      return;
    }

    setSelectedItemIds(current => [...current, item.id]);
  };
  const hasSelection =
    selectedItemIds.length > 0 || selectedPlaceIds.length > 0;
  const visibleItems = isEmptyState
    ? []
    : items.filter(item => !deletedItemIds.includes(item.id));
  const toggleExpandedItem = (id: string) =>
    setExpandedIds(current =>
      current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id],
    );
  const deleteSelectedItems = () => {
    setDeletedItemIds(current => [...current, ...selectedItemIds]);
    setSelectedItemIds([]);
    setSelectedPlaceIds([]);
    setExpandedIds(current =>
      current.filter(id => !selectedItemIds.includes(id)),
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Image
            source={require('../../assets/illustrations/empty-illustration.png')}
            style={styles.brandMarkImage}
          />
        </View>
        <Text style={styles.title}>대기함</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="빈 상태 화면 전환"
            onPress={() => setIsEmptyState(current => !current)}
            style={styles.emptyStateToggle}
          >
            <Text style={styles.emptyStateToggleText}>
              {isEmptyState ? '목록 보기' : '빈 상태 보기'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="대기함 기록 보기"
            style={styles.headerAction}
          >
            <InboxHeaderFrame height={41} width={41} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[styles.list, isEmptyState && styles.emptyList]}
        showsVerticalScrollIndicator={false}
      >
        {isEmptyState ? (
          <View style={styles.emptyState}>
            <Image
              source={require('../../assets/illustrations/empty-illustration.png')}
              style={styles.emptyImage}
            />
            <Text style={styles.emptyTitle}>대기 중인 장소가 없어요</Text>
            <Text style={styles.emptyDescription}>
              인스타그램 릴스나 유튜브 쇼츠에서{`\n`}공유하기를 통해 여기담에
              저장해보세요.
            </Text>
          </View>
        ) : (
          visibleItems.map(item => {
            const expanded = expandedIds.includes(item.id);
            const selectedByReel = selectedItemIds.includes(item.id);
            const selected =
              selectedByReel ||
              item.places.every(place => selectedPlaceIds.includes(place.id));
            const selectedPlaceCount = selected
              ? item.places.length
              : item.places.filter(place => selectedPlaceIds.includes(place.id))
                  .length;
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardContent}>
                  <View style={styles.summary}>
                    <Pressable
                      accessibilityLabel={`${item.title} 펼치기`}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => toggleExpandedItem(item.id)}
                      style={styles.summaryContent}
                    >
                      <InboxChevronRight
                        height={30}
                        style={expanded ? styles.expandedChevron : undefined}
                        width={CHEVRON_WIDTH}
                      />
                      <View style={styles.summaryContentView}>
                        <Image
                          source={{ uri: item.imageUrl }}
                          style={styles.summaryImage}
                        />
                        <View style={styles.summaryText}>
                          <Text numberOfLines={1} style={styles.itemTitle}>
                            {item.title}
                          </Text>
                          <View style={styles.sourceRow}>
                            <InstagramIcon
                              height={15}
                              opacity={0.45}
                              width={15}
                            />
                            <Text style={styles.source}>{item.source}</Text>
                          </View>
                          <Text style={styles.count}>
                            {item.places.length}개의 장소 발견
                            {selectedPlaceCount > 0
                              ? ` | ${selectedPlaceCount}개 선택`
                              : ''}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${item.title} 선택`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      hitSlop={10}
                      onPress={() => toggleSelectedItem(item)}
                      style={[
                        styles.itemSelectButton,
                        selected && styles.itemSelectButtonActive,
                      ]}
                    >
                      {selected ? (
                        <MaterialIcons color="#ffffff" name="check" size={19} />
                      ) : null}
                    </Pressable>
                  </View>
                  {expanded ? (
                    <View style={styles.placeList}>
                      <View style={styles.placeRows}>
                        {item.places.map(place => {
                          const saved =
                            selected || selectedPlaceIds.includes(place.id);
                          return (
                            <View key={place.id} style={styles.placeRow}>
                              <Image
                                source={{ uri: place.imageUrl }}
                                style={styles.placeImage}
                              />
                              <View style={styles.placeInfo}>
                                <View style={styles.placeNameRow}>
                                  <Text style={styles.placeName}>
                                    {place.name}
                                  </Text>
                                  <Text style={styles.category}>카페</Text>
                                </View>
                                <Text style={styles.address}>서울 성동구</Text>
                              </View>
                              <Pressable
                                accessibilityLabel={`${place.name} 보관함에 저장`}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: saved }}
                                hitSlop={10}
                                onPress={() => toggleSelectedPlace(place.id)}
                                style={[
                                  styles.saveButton,
                                  saved && styles.saveButtonActive,
                                ]}
                              >
                                {saved ? (
                                  <MaterialIcons
                                    color="#fff"
                                    name="check"
                                    size={16}
                                  />
                                ) : null}
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      {hasSelection && !isEmptyState ? (
        <View pointerEvents="box-none" style={styles.bulkActionContainer}>
          <Pressable
            accessibilityLabel="선택한 항목 삭제"
            onPress={deleteSelectedItems}
            style={[styles.bulkAction, styles.deleteAction]}
          >
            <Text style={styles.deleteActionText}>삭제</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="선택한 항목 저장"
            onPress={() => {
              setSelectedItemIds([]);
              setSelectedPlaceIds([]);
            }}
            style={[styles.bulkAction, styles.storeAction]}
          >
            <Text style={styles.storeActionText}>저장</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 84,
    paddingHorizontal: 24,
  },
  brandMark: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  brandMarkImage: { height: '100%', width: '100%' },
  title: { color: '#1A1A2E', fontSize: 20, fontWeight: '700', marginLeft: 17 },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginLeft: 'auto',
  },
  headerAction: { alignItems: 'center', justifyContent: 'center' },
  emptyStateToggle: {
    backgroundColor: '#F1F3FB',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  emptyStateToggleText: { color: '#59617B', fontSize: 11, fontWeight: '700' },
  expandedChevron: { transform: [{ rotate: '90deg' }] },
  list: {
    gap: 16,
    paddingBottom: BOTTOM_NAVIGATION_BAR_HEIGHT + 62,
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 12,
  },
  emptyList: { flexGrow: 1 },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: BOTTOM_NAVIGATION_BAR_HEIGHT + 54,
  },
  emptyImage: { height: 178, width: 178 },
  emptyTitle: {
    color: '#1F2238',
    fontSize: 19,
    fontWeight: '800',
    marginTop: 24,
  },
  emptyDescription: {
    color: '#9A9A9A',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: -4, height: 4 },
    shadowRadius: 4,
    elevation: 2,
  },
  cardContent: {
    backgroundColor: '#fff',
    borderColor: '#F0F0F0',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 115,
    paddingBottom: CARD_HORIZONTAL_PADDING,
    paddingLeft: CARD_HORIZONTAL_PADDING,
    paddingRight: PLACE_LIST_RIGHT_INSET,
    paddingTop: CARD_HORIZONTAL_PADDING,
  },
  summaryContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: CARD_CONTENT_GAP,
  },
  summaryContentView: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  summaryImage: { borderRadius: 7, height: 97, width: 65 },
  summaryText: { flex: 1 },
  itemTitle: { color: '#000', fontSize: 15, fontWeight: '700' },
  sourceRow: { alignItems: 'center', flexDirection: 'row', marginTop: 6 },
  source: { color: '#8D8D8D', fontSize: 13, marginLeft: 3 },
  count: { color: '#9B9B9B', fontSize: 13, marginTop: 5 },
  placeList: {
    borderTopColor: '#bfbebe',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  placeRows: {
    marginLeft: PLACE_LIST_LEFT_INSET,
    marginRight: PLACE_LIST_RIGHT_INSET,
  },
  placeRow: {
    alignItems: 'center',
    borderBottomColor: '#d8d8d8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 96,
  },
  placeImage: { borderRadius: 3, height: 64, width: 64 },
  placeInfo: { flex: 1, marginHorizontal: 10 },
  placeNameRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  placeName: {
    color: '#202020',
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  category: {
    borderColor: '#C9C9C9',
    borderRadius: 9,
    borderWidth: 1,
    color: '#6F6F6F',
    fontSize: 10,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  address: { color: '#9B9B9B', fontSize: 13, marginTop: 7 },
  saveButton: {
    alignItems: 'center',
    borderColor: '#A5A5A5',
    borderRadius: 15,
    borderWidth: 1,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  saveButtonActive: {
    backgroundColor: '#B8C5FF',
    borderColor: '#B8C5FF',
    shadowColor: '#A9B7F1',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 5,
    elevation: 3,
  },
  itemSelectButton: {
    alignItems: 'center',
    borderColor: '#A5A5A5',
    borderRadius: 15,
    borderWidth: 1,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  itemSelectButtonActive: {
    backgroundColor: '#B8C5FF',
    borderColor: '#B8C5FF',
    shadowColor: '#A9B7F1',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 5,
    elevation: 3,
  },
  bulkActionContainer: {
    bottom: BOTTOM_NAVIGATION_BAR_HEIGHT + 44,
    flexDirection: 'row',
    gap: 16,
    left: 20,
    position: 'absolute',
    right: 20,
  },
  bulkAction: {
    alignItems: 'center',
    borderRadius: 24,
    flex: 1,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#2D3655',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
  },
  deleteAction: { backgroundColor: '#FFFFFF' },
  deleteActionText: { color: '#1F2238', fontSize: 16, fontWeight: '800' },
  storeAction: { backgroundColor: '#B8C5FF' },
  storeActionText: { color: '#1F2238', fontSize: 16, fontWeight: '800' },
});
