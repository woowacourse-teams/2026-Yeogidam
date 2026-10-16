import React, {
  useCallback,
  useState,
} from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import {usePostHog} from 'posthog-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {v4 as uuidv4} from 'uuid';

import {
  captureSavedPlaceSelected,
  type SavedPlaceViewContext,
} from '../../analytics/savedPlaceEvents';
import {
  BOTTOM_NAVIGATION_BAR_HEIGHT,
  bottomNavigationBarContainerStyle,
  getBottomNavigationBarOffset,
} from '../../components/BottomNavigationBar';
import type { Place } from '../../entities/place/types';
import { SavedPlacesErrorState } from './components/SavedPlacesErrorState';
import { SavedPlacesEmptyState } from './components/SavedPlacesEmptyState';
import { SavedPlaceGrid } from './components/SavedPlaceGrid';
import { SavedPlacesHeader } from './components/SavedPlacesHeader';
import { SavedPlacesLinkDialog } from './components/SavedPlacesLinkDialog';
import { SavedPlacesSearchPanel } from './components/SavedPlacesSearchPanel';
import { SavedPlacesSkeleton } from './components/SavedPlacesSkeleton';
import {useLinkSave} from './hooks/useLinkSave';
import {useRecentSearches} from './hooks/useRecentSearches';
import {useReelProcessing} from './hooks/useReelProcessing';
import {useSavedPlacesEditing} from './hooks/useSavedPlacesEditing';
import {useSavedPlacesList} from './hooks/useSavedPlacesList';
import {useSavedPlacesScroll} from './hooks/useSavedPlacesScroll';
import {useSavedPlacesViewedEvent} from './hooks/useSavedPlacesViewedEvent';

type SavedPlacesScreenProps = {
  onOpenDetail: (place: Place, context?: SavedPlaceViewContext) => void;
  isGuest?: boolean;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  onAuthenticationRequired?: () => void;
  onEditModeChange?: (isEditing: boolean) => void;
  /** Allows previews/tests to provide a fixed list instead of calling the API. */
  onRequireLogin?: () => void;
  places?: Place[];
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
  onSharedResultConsumed?: (requestId?: string) => Promise<void>;
};

function SavedPlacesEditAction({
  isEditing,
  onPress,
}: {
  isEditing: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.editActionRow}>
      <Pressable
        accessibilityLabel={isEditing ? '보관함 편집 취소' : '보관함 편집'}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onPress}
        style={({pressed}) => [
          styles.editButton,
          pressed && styles.editButtonPressed,
        ]}>
        <Text style={styles.editButtonText}>{isEditing ? '취소' : '편집'}</Text>
      </Pressable>
    </View>
  );
}

export function SavedPlacesScreen({
  onOpenDetail,
  isGuest = false,
  initialScrollOffset = 0,
  onScrollOffsetChange,
  onAuthenticationRequired,
  onEditModeChange,
  onRequireLogin,
  places: providedPlaces,
  onDeleteGuestPlaces,
  onSharedResultConsumed,
}: SavedPlacesScreenProps) {
  const posthog = usePostHog();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const {
    places,
    isLoading,
    error,
    isRefreshing,
    loadSavedPlaces,
    refreshSavedPlaces,
    removePlaces,
  } = useSavedPlacesList({providedPlaces, onAuthenticationRequired});
  const hasSavedPlaces = places.length > 0;
  const bottomActionOffset = getBottomNavigationBarOffset(bottomInset);
  useSavedPlacesViewedEvent(posthog, {isLoading, error, placeCount: places.length});
  const {scrollViewRef, scrollToTop} = useSavedPlacesScroll({
    initialScrollOffset,
    isLoading,
    hasSavedPlaces,
  });

  const {
    isEditing,
    selectedPlaceIds,
    isDeleting,
    deleteError,
    toggleEditMode,
    enterEditMode,
    togglePlaceSelection,
    deleteSelectedPlaces,
  } = useSavedPlacesEditing({
    places,
    isGuest,
    removePlaces,
    loadSavedPlaces,
    onEditModeChange,
    onDeleteGuestPlaces,
    onAuthenticationRequired,
  });

  const {recentSearches, saveRecentSearch} = useRecentSearches();

  const reelProcessing = useReelProcessing({
    isGuest,
    loadSavedPlaces,
    onSharedResultConsumed,
    onRequireLogin,
  });

  const {
    isDialogVisible,
    linkValue,
    linkError,
    isSubmitting,
    openDialog,
    closeDialog,
    changeLinkValue,
    saveLink,
  } = useLinkSave({
    isGuest,
    onRequireLogin,
    progress: reelProcessing,
  });

  const confirmDeleteSelectedPlaces = useCallback(() => {
    if (isDeleting || selectedPlaceIds.size === 0) {
      return;
    }

    const count = selectedPlaceIds.size;
    Alert.alert(
      '선택한 장소를 삭제할까요?',
      `선택한 ${count}곳의 장소가 보관함에서 삭제됩니다.`,
      [
        {text: '취소', style: 'cancel'},
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            deleteSelectedPlaces().catch(() => undefined);
          },
        },
      ],
    );
  }, [deleteSelectedPlaces, isDeleting, selectedPlaceIds.size]);

  const openPlaceDetail = useCallback(
    (
      place: Place,
      source: SavedPlaceViewContext['source'],
      position: number,
      searchId?: string,
    ) => {
      if (!place.savedPlaceId) {
        onOpenDetail(place);
        return;
      }

      const context: SavedPlaceViewContext = {
        placeId: place.id,
        savedPlaceId: place.savedPlaceId,
        placeViewId: uuidv4(),
        source,
      };
      captureSavedPlaceSelected(posthog, {
        ...context,
        searchId,
        position,
      });
      onOpenDetail(place, context);
    },
    [onOpenDetail, posthog],
  );

  return (
    <View style={styles.container}>
      {isSearchOpen ? (
        <>
          <SavedPlacesSearchPanel
            places={places}
            recentSearches={recentSearches}
            onCloseSearch={() => setIsSearchOpen(false)}
            onPressPlace={(place, selection) =>
              openPlaceDetail(
                place,
                'saved_places_search',
                selection.position,
                selection.searchId,
              )
            }
            onSaveSearchTerm={saveRecentSearch}
          />
        </>
      ) : (
        <>
          <SavedPlacesHeader onPressSearch={() => setIsSearchOpen(true)} />
          {error && hasSavedPlaces ? (
            <View style={styles.errorBanner}>
              <Text numberOfLines={1} style={styles.errorText}>
                {error.message}
              </Text>
              {error.retryable ? (
                <Pressable onPress={loadSavedPlaces}>
                  <Text style={styles.errorRetryText}>재시도</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {deleteError ? (
            <View style={styles.deleteErrorBanner}>
              <Text numberOfLines={2} style={styles.deleteErrorText}>
                {deleteError.message}
              </Text>
              {deleteError.retryable ? (
                <Pressable onPress={deleteSelectedPlaces}>
                  <Text style={styles.deleteErrorRetryText}>재시도</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {isLoading && !hasSavedPlaces ? (
            <SavedPlacesSkeleton />
          ) : hasSavedPlaces ? (
            <>
              <ScrollView
                ref={scrollViewRef}
                alwaysBounceVertical
                onScroll={event =>
                  onScrollOffsetChange?.(event.nativeEvent.contentOffset.y)
                }
                refreshControl={
                  <RefreshControl
                    colors={['#8FA2FF']}
                    onRefresh={refreshSavedPlaces}
                    progressBackgroundColor="#ffffff"
                    refreshing={isRefreshing}
                    tintColor="#8FA2FF"
                  />
                }
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                <SavedPlacesEditAction
                  isEditing={isEditing}
                  onPress={toggleEditMode}
                />
                <SavedPlaceGrid
                  isEditing={isEditing}
                  places={places}
                  onLongPressPlace={enterEditMode}
                  onPressPlace={(place, position) =>
                    openPlaceDetail(place, 'saved_places_grid', position)
                  }
                  onTogglePlaceSelection={togglePlaceSelection}
                  selectedPlaceIds={selectedPlaceIds}
                />
                <View style={styles.scrollFooter}>
                  <Pressable
                    onPress={scrollToTop}
                    style={styles.scrollTopButton}
                  >
                    <MaterialIcons color="#8FA2FF" name="upload" size={24} />
                  </Pressable>
                </View>
              </ScrollView>
            </>
          ) : error ? (
            <SavedPlacesErrorState error={error} onRetry={loadSavedPlaces} />
          ) : (
            <SavedPlacesEmptyState />
          )}
        </>
      )}
      {isEditing ? (
        <Pressable
          accessibilityLabel={
            selectedPlaceIds.size > 0 ? '선택한 장소 삭제하기' : '보관함 편집 취소'
          }
          accessibilityRole="button"
          disabled={isDeleting}
          onPress={
            selectedPlaceIds.size === 0
              ? toggleEditMode
              : confirmDeleteSelectedPlaces
          }
          style={({pressed}) => [
            bottomNavigationBarContainerStyle,
            styles.deleteAction,
            {bottom: bottomActionOffset},
            isDeleting && styles.deleteActionDisabled,
            pressed && styles.deleteActionPressed,
          ]}>
          <View key="saved-places-delete-action-content" style={styles.deleteActionContent}>
            <Text style={styles.deleteActionText}>
              {selectedPlaceIds.size > 0
                ? isDeleting
                  ? '삭제 중...'
                  : '삭제하기'
                : '취소'}
            </Text>
            {selectedPlaceIds.size > 0 ? (
              <View style={styles.deleteCountBadge}>
                <Text style={styles.deleteCountText}>{selectedPlaceIds.size}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="장소 링크 추가"
          accessibilityRole="button"
          onPress={openDialog}
          style={[
            styles.fabShadow,
            {
              bottom:
                BOTTOM_NAVIGATION_BAR_HEIGHT +
                getBottomNavigationBarOffset(bottomInset) +
                12,
            },
          ]}
        >
          <View
            key="saved-places-fab"
            style={styles.fab}
          >
            <Text style={styles.fabText}>＋</Text>
          </View>
        </Pressable>
      )}
      <SavedPlacesLinkDialog
        visible={isDialogVisible}
        value={linkValue}
        onChangeValue={changeLinkValue}
        errorMessage={linkError}
        onClose={closeDialog}
        isSubmitting={isSubmitting}
        onSubmit={saveLink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  deleteAction: {
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  deleteActionPressed: {
    opacity: 0.82,
  },
  deleteActionDisabled: {
    opacity: 0.5,
  },
  deleteActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  deleteActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteCountBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  deleteCountText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  deleteErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#fff5f5',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  deleteErrorText: {
    flex: 1,
    color: '#7c2d2d',
    fontSize: 13,
  },
  deleteErrorRetryText: {
    color: '#5c6fc8',
    fontSize: 13,
    fontWeight: '700',
  },
  editActionRow: {
    alignItems: 'flex-end',
    marginHorizontal: 24,
    marginBottom: 2,
  },
  editButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  editButtonPressed: {
    opacity: 0.6,
  },
  editButtonText: {
    color: '#7b7d8b',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#fff5f5',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  errorText: { flex: 1, color: '#7c2d2d', fontSize: 13 },
  errorRetryText: { color: '#5c6fc8', fontSize: 13, fontWeight: '700' },
  fabShadow: {
    position: 'absolute',
    right: 18,
    // The screen is rendered underneath the absolute bottom tab bar.
    // Keep the FAB above it, including the device's bottom safe-area inset.
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowRadius: 14,
    elevation: 6,
  },
  fab: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(219, 224, 249, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    fontSize: 30,
    color: '#000000',
    fontWeight: '300',
  },
  scrollFooter: {
    alignItems: 'center',
    paddingBottom: 104,
  },
  scrollTopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DBE0F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
