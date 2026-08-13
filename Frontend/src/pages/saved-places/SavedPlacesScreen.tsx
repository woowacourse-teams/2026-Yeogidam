import React, {useEffect, useRef, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {BOTTOM_TAB_BAR_HEIGHT} from '../../components/BottomTabBar';
import {savedPlaceMocks} from '../../entities/place/mocks';
import type {Place} from '../../entities/place/types';
import {SavedPlacesEmptyState} from './components/SavedPlacesEmptyState';
import {SavedPlaceGrid} from './components/SavedPlaceGrid';
import {SavedPlacesHeader} from './components/SavedPlacesHeader';
import {SavedPlacesLinkDialog} from './components/SavedPlacesLinkDialog';
import {SavedPlacesSearchPanel} from './components/SavedPlacesSearchPanel';
import {getReelProcessingStatus, saveContent} from '../../entities/content/api';
import type {ReelProcessingStatus} from '../../entities/content/types';

function getFailureMessage(reason: string | null): string {
  switch (reason) {
    case 'IG_CAPTION_NOT_FOUND': return '릴스 캡션을 읽지 못했어요.';
    case 'GEMINI_PLACE_NOT_FOUND': return '캡션에서 장소 후보를 찾지 못했어요.';
    case 'KAKAO_PLACE_NOT_FOUND': return '지도에서 일치하는 장소를 찾지 못했어요.';
    case 'PLACE_NOT_FOUND': return '장소를 찾지 못했어요.';
    default: return '릴스를 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
  }
}

function getFailureDescription(reason: string | null): string {
  switch (reason) {
    case 'KAKAO_PLACE_NOT_FOUND': return '릴스의 장소 정보를 확인한 뒤 다시 시도해주세요.';
    case 'IG_CAPTION_NOT_FOUND': return '릴스에 장소 정보가 포함되어 있는지 확인해주세요.';
    case 'GEMINI_PLACE_NOT_FOUND': return '릴스 캡션에 장소명이 포함되어 있는지 확인해주세요.';
    case 'PLACE_NOT_FOUND': return '다른 릴스 링크로 다시 시도해주세요.';
    default: return '잠시 후 다시 시도하거나 다른 릴스 링크를 사용해주세요.';
  }
}

type SavedPlacesScreenProps = {
  onOpenDetail: () => void;
  places?: Place[];
};

export function SavedPlacesScreen({
  onOpenDetail,
  places = savedPlaceMocks,
}: SavedPlacesScreenProps) {
  const {bottom: bottomInset} = useSafeAreaInsets();
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingReelId, setProcessingReelId] = useState<string | null>(null);
  const [processingReel, setProcessingReel] = useState<ReelProcessingStatus | null>(null);
  const [processingUrl, setProcessingUrl] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasSavedPlaces = places.length > 0;

  const openDialog = () => {
    setLinkError(null);
    setIsDialogVisible(true);
  };

  const closeDialog = () => {
    if (isSubmitting) {
      return;
    }
    setIsDialogVisible(false);
    setLinkValue('');
    setLinkError(null);
  };

  const handleSaveLink = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setLinkError(null);
    try {
      const response = await saveContent(linkValue, 'url_input');
      setProcessingReelId(response.reelId);
      setProcessingUrl(linkValue.trim());
      setProcessingReel({
        id: response.reelId,
        processing_status: response.status,
        failure_reason: response.failureReason ?? null,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      });
      setIsDialogVisible(false);
      setLinkValue('');
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dismissProcessingCard = () => {
    setProcessingReelId(null);
    setProcessingReel(null);
    setProcessingUrl(null);
  };

  const retryProcessing = async () => {
    if (!processingUrl || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await saveContent(processingUrl, 'url_input');
      setProcessingReelId(response.reelId);
      setProcessingReel({
        id: response.reelId,
        processing_status: response.status,
        failure_reason: response.failureReason ?? null,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      Alert.alert('다시 시도할 수 없어요', error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRetryableFailure =
    processingReel?.failure_reason === 'IG_CAPTION_NOT_FOUND' ||
    processingReel?.failure_reason === 'DATA_PROCESSING_FAILED';

  useEffect(() => {
    if (!processingReelId || processingReel?.processing_status === 'FAILED') {
      return;
    }

    let isActive = true;
    const poll = async () => {
      try {
        const nextStatus = await getReelProcessingStatus(processingReelId);
        if (isActive && nextStatus) {
          setProcessingReel(nextStatus);
          if (nextStatus.processing_status === 'COMPLETED') {
            setProcessingReelId(null);
          }
        }
      } catch {
        // Keep the current processing card; the next interval can retry the read.
      }
    };

    const intervalId = setInterval(poll, 3000);
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [processingReelId, processingReel?.processing_status]);

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({y: 0, animated: true});
  };

  return (
    <View style={styles.container}>
      {isSearchOpen ? (
        <>
          <SavedPlacesSearchPanel
            places={places}
            onCloseSearch={() => setIsSearchOpen(false)}
            onPressPlace={() => onOpenDetail()}
          />
          {hasSavedPlaces ? (
            <Pressable
              onPress={openDialog}
              style={[styles.fabShadow, {bottom: BOTTOM_TAB_BAR_HEIGHT + bottomInset + 12}]}>
              <View style={styles.fab}>
                <Text style={styles.fabText}>＋</Text>
              </View>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <SavedPlacesHeader onPressSearch={() => setIsSearchOpen(true)} />
          <View style={styles.divider} />
          {processingReel && processingReel.processing_status !== 'COMPLETED' ? (
            <View style={styles.processingCard}>
              <Text style={styles.processingTitle}>
                {processingReel.processing_status === 'FAILED' ? getFailureMessage(processingReel.failure_reason) : '릴스에서 장소를 찾고 있어요.'}
              </Text>
              <Text style={styles.processingMessage}>
                {processingReel.processing_status === 'FAILED' ? getFailureDescription(processingReel.failure_reason) : '처리가 완료되면 저장 장소에 반영됩니다.'}
              </Text>
              <View style={styles.processingActions}>
                {processingReel.processing_status === 'FAILED' && isRetryableFailure ? (
                  <Pressable disabled={isSubmitting} onPress={retryProcessing} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>{isSubmitting ? '재시도 중' : '다시 시도'}</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={dismissProcessingCard} style={styles.dismissButton}>
                  <Text style={styles.dismissButtonText}>
                    {processingReel.processing_status === 'FAILED' ? '닫기' : '취소'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {hasSavedPlaces ? (
            <>
              <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false}>
                <SavedPlaceGrid
                  places={places}
                  onPressPlace={() => onOpenDetail()}
                />
                <View style={styles.scrollFooter}>
                  <Pressable onPress={scrollToTop} style={styles.scrollTopButton}>
                    <MaterialIcons color="#8FA2FF" name="upload" size={24} />
                  </Pressable>
                </View>
              </ScrollView>
              <Pressable
                onPress={openDialog}
                style={[styles.fabShadow, {bottom: BOTTOM_TAB_BAR_HEIGHT + bottomInset + 12}]}>
                <View style={styles.fab}>
                  <Text style={styles.fabText}>＋</Text>
                </View>
              </Pressable>
            </>
          ) : (
            <SavedPlacesEmptyState />
          )}
        </>
      )}
      <SavedPlacesLinkDialog
        visible={isDialogVisible}
        value={linkValue}
        onChangeValue={value => {
          setLinkValue(value);
          setLinkError(null);
        }}
        errorMessage={linkError}
        onClose={closeDialog}
        isSubmitting={isSubmitting}
        onSubmit={handleSaveLink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  processingCard: {
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: '#f3f5ff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'column',
  },
  processingTextBlock: {
    flex: 1,
    marginRight: 12,
  },
  processingTitle: {
    color: '#24243a',
    fontSize: 16,
    fontWeight: '700',
  },
  processingMessage: {
    marginTop: 6,
    color: '#6e6e7a',
    fontSize: 12,
    lineHeight: 18,
  },
  processingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14,
  },
  retryButton: {
    borderRadius: 14,
    backgroundColor: '#8fa2ff',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  dismissButton: {
    borderRadius: 14,
    backgroundColor: '#e5e7f5',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dismissButtonText: {
    color: '#555b77',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5ea',
    marginHorizontal: 24,
  },
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
