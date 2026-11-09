import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';

import { useScreenAnalytics } from '../../../analytics/uiEvents';
import { PlaceTabEmptyState } from './PlaceTabEmptyState';

const MENU_PREVIEW_COUNT = 3;

export type PlaceWeeklyHours = {
  day: string;
  hours: string;
  isToday?: boolean;
  isClosed?: boolean;
};

export type PlaceMenuItem = {
  name: string;
  price: string;
};

type PlaceInformationProps = {
  // TODO(API 연동): 영업시간·메뉴 API가 생기면 값을 넘깁니다. 그 전에는 빈 화면을 보여줍니다.
  weeklyHours?: PlaceWeeklyHours[];
  menuPriceRange?: string;
  menuItems?: PlaceMenuItem[];
  /** 메뉴를 펼치거나 접은 뒤 호출합니다. 정보 탭 안에서 메뉴 섹션의 y 위치를 넘깁니다. */
  onMenuToggled?: (menuTop: number) => void;
};

export function PlaceInformation({
  weeklyHours = [],
  menuPriceRange,
  menuItems = [],
  onMenuToggled,
}: PlaceInformationProps) {
  const { button } = useScreenAnalytics();
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  // 늘어난 높이가 스크롤 범위에 반영된 뒤에 올려야 끝에서 잘리지 않아, 레이아웃 완료 시점까지 기다립니다.
  const isMenuToggledRef = useRef(false);
  const visibleMenuItems = isMenuExpanded
    ? menuItems
    : menuItems.slice(0, MENU_PREVIEW_COUNT);
  const hasWeeklyHours = weeklyHours.length > 0;
  const hasMenu = menuItems.length > 0;

  if (!hasWeeklyHours && !hasMenu) {
    return <PlaceTabEmptyState message="아직 등록된 정보가 없어요" />;
  }

  return (
    <View style={styles.container}>
      {hasWeeklyHours ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>영업시간</Text>
          </View>
          <View style={styles.weeklyHours}>
            {weeklyHours.map(({ day, hours, isToday, isClosed }) => (
              <View key={day} style={styles.dayRow}>
                <Text style={[styles.dayText, isToday && styles.todayText]}>
                  {isToday ? `${day}  오늘` : day}
                </Text>
                <Text
                  style={[
                    styles.dayText,
                    isToday && styles.todayText,
                    isClosed && styles.closedText,
                  ]}
                >
                  {hours}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {hasWeeklyHours && hasMenu ? <View style={styles.sectionDivider} /> : null}

      {hasMenu ? (
        <View
          style={styles.section}
          onLayout={event => {
            if (!isMenuToggledRef.current) return;
            isMenuToggledRef.current = false;
            onMenuToggled?.(event.nativeEvent.layout.y);
          }}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>메뉴</Text>
          </View>
          {menuPriceRange ? (
            <Text style={styles.priceRange}>{menuPriceRange}</Text>
          ) : null}
          <View style={styles.menuList}>
            {visibleMenuItems.map((item, index) => (
              <View
                key={item.name}
                style={[
                  styles.menuItem,
                  index < visibleMenuItems.length - 1 && styles.menuItemDivider,
                ]}
              >
                <Text style={styles.menuName}>{item.name}</Text>
                <Text style={styles.menuPrice}>{item.price}</Text>
              </View>
            ))}
          </View>
          {menuItems.length > MENU_PREVIEW_COUNT ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isMenuExpanded ? '메뉴 접기' : '메뉴 펼치기'}
              accessibilityState={{ expanded: isMenuExpanded }}
              hitSlop={10}
              onPress={() => {
                button('toggle_menu');
                isMenuToggledRef.current = true;
                setIsMenuExpanded(expanded => !expanded);
              }}
              style={({ pressed }) => [
                styles.moreButton,
                pressed && styles.pressed,
              ]}
            >
              <MaterialIcons
                color="#1D1B20"
                name={isMenuExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                size={24}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    gap: 8,
  },
  sectionHeader: {
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  weeklyHours: {
    paddingTop: 8,
    gap: 12,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#66666f',
  },
  todayText: {
    fontWeight: '700',
    color: '#1a1a2e',
  },
  closedText: {
    color: '#d64545',
  },
  sectionDivider: {
    height: 8,
    backgroundColor: '#f5f5f8',
  },
  priceRange: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8e8e93',
  },
  menuList: {
    paddingTop: 4,
  },
  menuItem: {
    paddingVertical: 12,
    gap: 2,
  },
  menuItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#ececf0',
  },
  menuName: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: '#1a1a2e',
  },
  menuPrice: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  moreButton: {
    alignSelf: 'center',
  },
  pressed: {
    opacity: 0.55,
  },
});
