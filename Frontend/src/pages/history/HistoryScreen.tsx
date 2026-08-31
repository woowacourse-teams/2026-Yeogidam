import React, {useState} from 'react';
import {Alert, Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import RetryIcon from '../../assets/icons/actions/retry.svg';
import ReportIcon from '../../assets/icons/actions/report.svg';
import InstagramIcon from '../../assets/icons/social/instagram-color.svg';

type HistoryGroup = {date: string; items: Array<'FAILED' | 'COMPLETED'>};
type HistoryScreenProps = {onBack: () => void; groups?: HistoryGroup[]};

const thumbnail = 'https://www.figma.com/api/mcp/asset/88501ab5-fdd5-49c7-bda1-e486a502a36c.png';

const emptyCharacter = 'https://www.figma.com/api/mcp/asset/446736dd-95ce-4bd1-8e39-fa004e2c8b29.png';
const detailCharacter = 'https://www.figma.com/api/mcp/asset/7be73af3-e4e8-417a-9664-9dbe530b90f2.png';
const failureCharacter = 'https://www.figma.com/api/mcp/asset/b1cdc2ef-0cfa-47ed-b534-cbe706d9bb97.png';
const placeThumbnail = 'https://www.figma.com/api/mcp/asset/9313bcb8-b3f7-43b7-847e-e794cf94e2d9.png';

const defaultGroups: HistoryGroup[] = [
  {date: '2026.08.26', items: ['FAILED', 'COMPLETED', 'FAILED', 'FAILED']},
  {date: '2026.08.25', items: ['COMPLETED', 'FAILED', 'COMPLETED']},
];

function HistoryItem({status, onPress}: {status: 'FAILED' | 'COMPLETED'; onPress?: () => void}) {
  const completed = status === 'COMPLETED';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.item}>
      <Image source={{uri: thumbnail}} style={styles.thumbnail} />
      <View style={styles.itemText}>
        <View style={[styles.badge, completed ? styles.successBadge : styles.failureBadge]}>
          <Text style={[styles.badgeText, completed ? styles.successText : styles.failureText]}>
            {completed ? '성공' : '실패'}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.title}>인쇄 잘하는곳 모음</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function HistorySuccessDetail({onBack}: {onBack: () => void}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="대기함으로 돌아가기" hitSlop={12} onPress={onBack} style={styles.backButton}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        <View style={styles.detailHero}>
          <Image source={{uri: detailCharacter}} style={styles.detailCharacter} />
          <Text style={styles.detailTitle}>장소 분석이 완료되었어요!</Text>
          <Text style={styles.detailSubtitle}>총 2개의 장소를 찾았어요</Text>
        </View>
        <Pressable style={styles.originalButton}>
          <InstagramIcon width={28} height={27} />
          <Text style={styles.originalText}>원본 릴스로 이동</Text>
          <Text style={styles.detailChevron}>›</Text>
        </Pressable>
        <Text style={styles.foundTitle}>발견한 장소</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.placeRow}>
          {['장소명', '장소명', '장소명', '장소명'].map((name, index) => (
            <View key={`${name}-${index}`} style={styles.placeCard}>
              <Image source={{uri: placeThumbnail}} style={styles.placeImage} />
              <Text style={styles.placeName}>{name}</Text>
              <Text style={styles.placeAddress}>서울 성동구</Text>
            </View>
          ))}
        </ScrollView>
      </ScrollView>
      <View style={styles.homeIndicator} />
    </View>
  );
}

function HistoryFailureDetail({onBack}: {onBack: () => void}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="히스토리 목록으로 돌아가기" hitSlop={12} onPress={onBack} style={styles.backButton}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.failureContent}>
        <View style={styles.failureHero}>
          <Image source={{uri: failureCharacter}} style={styles.detailCharacter} />
          <Text style={styles.detailTitle}>장소 분석에 실패했어요ㅠ</Text>
          <Text style={styles.failureDescription}>해당 장소에서 장소 정보를{ '\n' }찾지 못햇어요</Text>
        </View>
        <Pressable style={styles.originalButton}>
          <InstagramIcon width={28} height={27} />
          <Text style={styles.originalText}>원본 릴스로 이동</Text>
          <Text style={styles.detailChevron}>›</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert('다시 시도하시겠어요?', '릴스를 다시 분석해볼게요.', [
            {text: '취소', style: 'cancel'},
            {text: '다시 시도', onPress: () => {}},
          ])}
          style={styles.actionButton}>
          <RetryIcon width={20} height={20} style={styles.actionIcon} />
          <Text style={styles.actionText}>다시 시도하기</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert('이 릴스를 제보하시겠어요?', '제보가 접수되면 내용을 확인해 더 나은 장소 정보를 제공할 수 있도록 도와드릴게요.', [
            {text: '취소', style: 'cancel'},
            {text: '제보하기', onPress: () => {}},
          ])}
          style={[styles.actionButton, styles.reportActionButton]}>
          <ReportIcon width={20} height={20} style={styles.actionIcon} />
          <Text style={styles.actionText}>제보하기</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.homeIndicator} />
    </View>
  );
}

export function HistoryScreen({onBack, groups = defaultGroups}: HistoryScreenProps) {
  const [previewEmpty, setPreviewEmpty] = useState(false);
  const [selectedSuccess, setSelectedSuccess] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState(false);
  const visibleGroups = previewEmpty ? [] : groups;

  if (selectedSuccess) {
    return <HistorySuccessDetail onBack={() => setSelectedSuccess(false)} />;
  }
  if (selectedFailure) {
    return <HistoryFailureDetail onBack={() => setSelectedFailure(false)} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backButton}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        {__DEV__ ? (
          <Pressable onPress={() => setPreviewEmpty(current => !current)} style={styles.previewToggle}>
            <Text style={styles.previewToggleText}>{previewEmpty ? '목록' : '빈 화면'}</Text>
          </Pressable>
        ) : <View style={styles.headerSpacer} />}
      </View>
      <ScrollView contentContainerStyle={[styles.content, visibleGroups.length === 0 && styles.emptyContent]} showsVerticalScrollIndicator={false}>
        {visibleGroups.length === 0 ? (
          <View style={styles.emptyBody}>
            <Image source={{uri: emptyCharacter}} style={styles.emptyCharacter} />
            <View style={styles.emptyText}>
              <Text style={styles.emptyTitle}>아직 공유된 콘텐츠가 없어요</Text>
              <Text style={styles.emptyDescription}>인스타그램 릴스나 유튜브 쇼츠에서{ '\n' }공유하기를 통해 여기담에 저장해보세요.</Text>
            </View>
          </View>
        ) : visibleGroups.map(group => (
          <View key={group.date} style={styles.group}>
            <Text style={styles.date}>{group.date}</Text>
            <View>
              {group.items.map((status, index) => (
                <HistoryItem key={`${group.date}-${index}`} status={status as 'FAILED' | 'COMPLETED'} onPress={status === 'COMPLETED' ? () => setSelectedSuccess(true) : () => setSelectedFailure(true)} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.homeIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  header: {height: 84, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center'},
  backButton: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center'},
  back: {fontSize: 30, lineHeight: 34, color: 'rgba(0,0,0,.61)', fontWeight: '500'},
  headerTitle: {fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginLeft: 14},
  headerSpacer: {flex: 1},
  previewToggle: {marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: '#f3f4fb'},
  previewToggleText: {fontSize: 12, fontWeight: '700', color: '#5c6fc8'},
  content: {paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40},
  emptyContent: {flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 0, paddingBottom: 72, paddingHorizontal: 24},
  emptyBody: {alignItems: 'center'},
  emptyCharacter: {width: 195, height: 195, borderRadius: 30, marginBottom: 24},
  emptyText: {alignItems: 'center'},
  emptyTitle: {fontSize: 20, fontWeight: '800', color: '#1a1a2e', textAlign: 'center'},
  emptyDescription: {fontSize: 14, lineHeight: 22.4, color: '#8e8e93', textAlign: 'center', marginTop: 8},
  detailContent: {paddingBottom: 60},
  detailHero: {alignItems: 'center', marginTop: 48},
  detailCharacter: {width: 195, height: 195, borderRadius: 20},
  detailTitle: {fontSize: 20, fontWeight: '800', color: '#1a1a2e', marginTop: 24},
  detailSubtitle: {fontSize: 14, color: '#8e8e93', marginTop: 8},
  originalButton: {height: 61, marginHorizontal: 22, marginTop: 49, borderWidth: 1, borderColor: 'rgba(0,0,0,.14)', borderRadius: 20, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 50},
  instagramIcon: {width: 28, height: 27},
  originalText: {fontSize: 15, fontWeight: '600', color: '#000', flex: 1, textAlign: 'center'},
  detailChevron: {fontSize: 30, color: '#000'},
  foundTitle: {fontSize: 20, fontWeight: '700', color: '#000', marginTop: 35, marginLeft: 32},
  placeRow: {paddingLeft: 31, paddingTop: 12, gap: 6},
  placeCard: {width: 98},
  placeImage: {width: 98, height: 98, borderRadius: 2},
  placeName: {fontSize: 13, fontWeight: '800', color: '#1a1a2e', marginTop: 2},
  placeAddress: {fontSize: 9, color: '#8e8e93', marginTop: 3},
  failureContent: {paddingBottom: 60},
  failureHero: {alignItems: 'center', marginTop: 44},
  failureDescription: {fontSize: 14, lineHeight: 22.4, color: '#8e8e93', textAlign: 'center', marginTop: 6},
  actionButton: {height: 40, marginHorizontal: 22, marginTop: 70, borderWidth: 1, borderColor: 'rgba(0,0,0,.16)', borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  reportActionButton: {marginTop: 13},
  actionIcon: {position: 'absolute', left: 32},
  actionText: {fontSize: 15, fontWeight: '600', color: '#000'},
  group: {marginBottom: 16},
  date: {fontSize: 16, fontWeight: '600', color: '#727070', marginBottom: 12},
  item: {height: 86, borderBottomWidth: 1, borderBottomColor: '#f8f3f3', flexDirection: 'row', alignItems: 'center', gap: 22},
  thumbnail: {width: 58, height: 73, borderRadius: 8, backgroundColor: '#eee'},
  itemText: {height: 73, flex: 1, justifyContent: 'center', gap: 4},
  badge: {height: 19, width: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  badgeText: {fontSize: 10, fontWeight: '400'},
  failureBadge: {borderColor: '#fb6f6f'},
  successBadge: {borderColor: '#34c759'},
  failureText: {color: 'red'},
  successText: {color: '#34c759'},
  title: {fontSize: 16, fontWeight: '800', color: '#1a1a2e'},
  chevron: {fontSize: 32, lineHeight: 32, color: '#1c1c1e', marginRight: 5},
  homeIndicator: {position: 'absolute', bottom: 8, alignSelf: 'center', width: 139, height: 5, borderRadius: 3, backgroundColor: '#1a1a2e', opacity: .2},
});
