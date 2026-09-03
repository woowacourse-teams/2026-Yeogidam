import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  BOTTOM_NAVIGATION_BAR_BOTTOM_GAP,
  BOTTOM_NAVIGATION_BAR_HEIGHT,
} from '../../components/BottomNavigationBar';
import InboxChevronRight from '../../assets/icons/inbox-chevron-right.svg';
import InboxHeaderFrame from '../../assets/icons/inbox-header-frame.svg';
import InstagramIcon from '../../assets/icons/social/instagram.svg';
import {
  resolveQueueItems,
  getInboxReels,
  type InboxPlace,
  type InboxReel,
  type QueueResolutionAction,
} from '../../entities/content/inbox-api';
import { normalizeReelError } from '../../entities/content/errors';
import {normalizeReelTitle} from '../../entities/content/title';
import { supabase } from '../../lib/auth/supabase';

function pendingPlaces(item: InboxReel) {
  return item.places.filter(place => place.reviewStatus === 'PENDING');
}

function placeAddress(place: InboxPlace) {
  const address =
    place.place?.sourceAddress ??
    place.place?.roadAddress ??
    place.place?.address ??
    '';

  return address.split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
}

function secondaryCategory(category: string | null | undefined) {
  return category
    ?.split('>')
    .map(value => value.trim())
    .filter(Boolean)[1];
}

const CARD_HORIZONTAL_PADDING = 6;
const CHEVRON_WIDTH = 33;
const CARD_CONTENT_GAP = 10;
const PLACE_LIST_LEFT_INSET =
  CARD_HORIZONTAL_PADDING + CHEVRON_WIDTH + CARD_CONTENT_GAP;
const PLACE_LIST_RIGHT_INSET = 23;
const ANALYSIS_POLL_INTERVAL_MS = 5000;

type InBoxScreenProps = {
  onOpenHistory: () => void;
  onSelectionChange: (hasSelection: boolean) => void;
};

export function InBoxScreen({onOpenHistory, onSelectionChange}: InBoxScreenProps) {
  const {bottom: bottomInset} = useSafeAreaInsets();
  const bottomActionOffset =
    bottomInset > 0 ? BOTTOM_NAVIGATION_BAR_BOTTOM_GAP : 8;
  const [items, setItems] = useState<InboxReel[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    onSelectionChange(selectedPlaceIds.length > 0);
  }, [onSelectionChange, selectedPlaceIds.length]);

  useEffect(() => () => onSelectionChange(false), [onSelectionChange]);

  const loadInbox = useCallback(async (isRefresh = false, silently = false) => {
    if (!silently) {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
    }

    try {
      const reels = await getInboxReels();
      setItems(reels);
      setErrorMessage(null);
    } catch (error) {
      // Keep the last successful list visible for permission, timeout, and network failures.
      setErrorMessage(normalizeReelError(error).message);
    } finally {
      if (!silently) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadInbox();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') loadInbox(true);
    });
    return () => subscription.remove();
  }, [loadInbox]);

  useEffect(() => {
    const intervalId = setInterval(
      () => loadInbox(true, true),
      ANALYSIS_POLL_INTERVAL_MS,
    );
    return () => clearInterval(intervalId);
  }, [loadInbox]);

  const toggleSelectedPlace = (id: string) =>
    setSelectedPlaceIds(current =>
      current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id],
    );
  const toggleSelectedItem = (item: InboxReel) => {
    const selectablePlaces = pendingPlaces(item);
    const allPlacesSelected = selectablePlaces.every(place =>
      selectedPlaceIds.includes(place.id),
    );

    if (allPlacesSelected) {
      setSelectedPlaceIds(current =>
        current.filter(id => !selectablePlaces.some(place => place.id === id)),
      );
      return;
    }

    setSelectedPlaceIds(current => [
      ...current,
      ...selectablePlaces
        .map(place => place.id)
        .filter(id => !current.includes(id)),
    ]);
  };
  const hasSelection = selectedPlaceIds.length > 0;
  const visibleItems = items;
  const toggleExpandedItem = (id: string) =>
    setExpandedIds(current =>
      current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id],
    );
  const selectedPendingPlaceIds = () =>
    items.flatMap(item =>
      pendingPlaces(item)
        .map(place => place.id)
        .filter(id => selectedPlaceIds.includes(id)),
    );
  const resolveSelectedItems = async (action: QueueResolutionAction) => {
    if (isResolving) {
      return;
    }

    const reelPlaceIds = selectedPendingPlaceIds();
    if (reelPlaceIds.length === 0) {
      return;
    }

    setIsResolving(true);
    try {
      await resolveQueueItems(reelPlaceIds, action);
      setSelectedPlaceIds([]);
      await loadInbox(true);
    } catch (error) {
      const normalized = normalizeReelError(error);
      setErrorMessage(normalized.message);

      if (normalized.status === 401) {
        await supabase.auth.refreshSession();
      }
      if (normalized.errorCode !== 'COMMON400_001') {
        await loadInbox(true, true);
      }
    } finally {
      setIsResolving(false);
    }
  };
  const confirmResolveSelectedItems = (action: QueueResolutionAction) => {
    const label = action === 'SAVE' ? '저장' : '삭제';
    Alert.alert(
      `선택한 장소를 ${label}할까요?`,
      action === 'SAVE'
        ? '선택한 장소를 보관함에 저장합니다.'
        : '선택한 장소를 대기함에서 삭제합니다.',
      [
        {text: '취소', style: 'cancel'},
        {
          text: label,
          style: action === 'DISCARD' ? 'destructive' : 'default',
          onPress: () => {
            resolveSelectedItems(action).catch(() => undefined);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Image
            source={require('../../assets/icons/brand-mark.png')}
            style={styles.brandMarkImage}
          />
        </View>
        <Text style={styles.title}>대기함</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="대기함 기록 보기"
            accessibilityRole="button"
            onPress={onOpenHistory}
            style={styles.headerAction}
          >
            <InboxHeaderFrame height={41} width={41} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.list,
          visibleItems.length === 0 && styles.emptyList,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadInbox(true)}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {errorMessage && visibleItems.length > 0 ? (
          <Pressable onPress={() => loadInbox(true)} style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>
              {errorMessage} · 다시 시도
            </Text>
          </Pressable>
        ) : null}
        {isLoading && visibleItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyDescription}>
              대기함을 불러오는 중이에요.
            </Text>
          </View>
        ) : visibleItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Image
              source={require('../../assets/illustrations/empty-illustration.png')}
              style={styles.emptyImage}
            />
            <Text style={styles.emptyTitle}>대기 중인 장소가 없어요</Text>
            <Text style={styles.emptyDescription}>
              {errorMessage
                ? `${errorMessage}\n아래로 당겨 새로고침 해주세요.`
                : '인스타그램 릴스나 유튜브 쇼츠에서\n공유하기를 통해 여기담에 저장해보세요.'}
            </Text>
          </View>
        ) : (
          visibleItems.map(item => {
            const displayTitle = normalizeReelTitle(
              item.instagramDescription,
              item.instagramTitle,
            );
            const expanded = expandedIds.includes(item.id);
            const selectablePlaces = pendingPlaces(item);
            const selected = selectablePlaces.every(place =>
              selectedPlaceIds.includes(place.id),
            );
            const selectedPlaceCount = selected
              ? selectablePlaces.length
              : item.places.filter(place => selectedPlaceIds.includes(place.id))
                  .length;
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardContent}>
                  <View style={styles.summary}>
                    <Pressable
                      accessibilityLabel={`${
                        displayTitle
                      } 펼치기`}
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
                        {item.instagramThumbnailUrl ? (
                          <Image
                            source={{ uri: item.instagramThumbnailUrl }}
                            style={styles.summaryImage}
                          />
                        ) : (
                          <View
                            style={[
                              styles.summaryImage,
                              styles.imagePlaceholder,
                            ]}
                          />
                        )}
                        <View style={styles.summaryText}>
                          <Text numberOfLines={1} style={styles.itemTitle}>
                            {displayTitle}
                          </Text>
                          <View style={styles.sourceRow}>
                            <InstagramIcon
                              height={15}
                              opacity={0.45}
                              width={15}
                            />
                            <Text style={styles.source}>
                              @{item.instagramAuthorUsername ?? 'unknown'}
                            </Text>
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
                      accessibilityLabel={`${
                        displayTitle
                      } 선택`}
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
                          const isPending = place.reviewStatus === 'PENDING';
                          const category = secondaryCategory(place.place?.category);
                          const saved =
                            isPending &&
                            (selected || selectedPlaceIds.includes(place.id));
                          return (
                            <View key={place.id} style={styles.placeRow}>
                              {place.place?.thumbnailUrl ? (
                                <Image
                                  source={{ uri: place.place.thumbnailUrl }}
                                  style={styles.placeImage}
                                />
                              ) : (
                                <View
                                  style={[
                                    styles.placeImage,
                                    styles.imagePlaceholder,
                                  ]}
                                />
                              )}
                              <View style={styles.placeInfo}>
                                <Text numberOfLines={1} style={styles.placeName}>
                                  {place.place?.name ?? '알 수 없는 장소'}
                                </Text>
                                {category ? (
                                  <Text style={styles.category}>
                                    {category}
                                  </Text>
                                ) : null}
                                <Text numberOfLines={2} style={styles.address}>
                                  {placeAddress(place)}
                                </Text>
                              </View>
                              <Pressable
                                accessibilityLabel={`${
                                  place.place?.name ?? '장소'
                                } 보관함에 저장`}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: saved }}
                                disabled={!isPending}
                                hitSlop={10}
                                onPress={() => toggleSelectedPlace(place.id)}
                                style={[
                                  styles.saveButton,
                                  saved && styles.saveButtonActive,
                                  !isPending && styles.saveButtonDisabled,
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
      {hasSelection ? (
        <View
          pointerEvents="box-none"
          style={[styles.bulkActionContainer, {bottom: bottomActionOffset}]}
        >
          <Pressable
            accessibilityLabel="선택한 항목 삭제"
            disabled={isResolving}
            onPress={() => confirmResolveSelectedItems('DISCARD')}
            style={[
              styles.bulkAction,
              styles.deleteAction,
              isResolving && styles.bulkActionDisabled,
            ]}
          >
            <Text style={styles.deleteActionText}>삭제</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="선택한 항목 저장"
            disabled={isResolving}
            onPress={() => confirmResolveSelectedItems('SAVE')}
            style={[
              styles.bulkAction,
              styles.storeAction,
              isResolving && styles.bulkActionDisabled,
            ]}
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
  errorBanner: {
    backgroundColor: '#FFF4F4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  errorBannerText: { color: '#A54D4D', fontSize: 13, textAlign: 'center' },
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
    minWidth: 0,
  },
  summaryContentView: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    minWidth: 0,
  },
  summaryImage: { borderRadius: 7, height: 97, width: 65 },
  imagePlaceholder: { backgroundColor: '#F1F3FB' },
  summaryText: { flex: 1, minWidth: 0 },
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
  placeInfo: { flex: 1, marginHorizontal: 10, minWidth: 0 },
  placeName: {
    color: '#202020',
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
    alignSelf: 'flex-start',
    marginTop: 4,
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
  saveButtonDisabled: { borderColor: '#E5E5E5', opacity: 0.45 },
  itemSelectButton: {
    alignItems: 'center',
    borderColor: '#A5A5A5',
    borderRadius: 15,
    borderWidth: 1,
    height: 23,
    justifyContent: 'center',
    flexShrink: 0,
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
    flexDirection: 'row',
    gap: 16,
    left: 20,
    position: 'absolute',
    right: 20,
    zIndex: 20,
  },
  bulkAction: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    height: BOTTOM_NAVIGATION_BAR_HEIGHT,
    justifyContent: 'center',
    shadowColor: '#2D3655',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
  },
  bulkActionDisabled: { opacity: 0.5 },
  deleteAction: { backgroundColor: '#FFFFFF' },
  deleteActionText: { color: '#1F2238', fontSize: 16, fontWeight: '800' },
  storeAction: { backgroundColor: '#000000' },
  storeActionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
