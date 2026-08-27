import React from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

type HistoryScreenProps = {onBack: () => void};

const thumbnail = 'https://www.figma.com/api/mcp/asset/88501ab5-fdd5-49c7-bda1-e486a502a36c.png';

const groups = [
  {date: '2026.08.26', items: ['FAILED', 'COMPLETED', 'FAILED', 'FAILED']},
  {date: '2026.08.25', items: ['COMPLETED', 'FAILED', 'COMPLETED']},
];

function HistoryItem({status}: {status: 'FAILED' | 'COMPLETED'}) {
  const completed = status === 'COMPLETED';
  return (
    <Pressable accessibilityRole="button" style={styles.item}>
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

export function HistoryScreen({onBack}: HistoryScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backButton}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {groups.map(group => (
          <View key={group.date} style={styles.group}>
            <Text style={styles.date}>{group.date}</Text>
            <View>
              {group.items.map((status, index) => (
                <HistoryItem key={`${group.date}-${index}`} status={status as 'FAILED' | 'COMPLETED'} />
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
  header: {height: 60, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', gap: 10},
  backButton: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center'},
  back: {fontSize: 30, lineHeight: 34, color: 'rgba(0,0,0,.61)', fontWeight: '500'},
  headerTitle: {fontSize: 20, fontWeight: '700', color: '#1a1a2e'},
  headerSpacer: {flex: 1},
  content: {paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40},
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
