import React, {useCallback, useEffect, useRef} from 'react';
import {Animated, StyleSheet} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

/** 위로 이만큼만 스크롤해도 바를 다시 보여 줍니다. */
export const BAR_REVEAL_UP_DISTANCE = 4;
/** 아래로 이만큼 스크롤하면 바를 숨깁니다(살짝 흔들리는 정도로는 숨기지 않습니다). */
export const BAR_HIDE_DOWN_DISTANCE = 12;
/** 한 번에 이보다 크게 튄 스크롤(저장된 위치 복원 등)은 사용자의 방향으로 보지 않습니다. */
const BAR_MAX_JUMP = 300;

export type BarScrollState = {
  lastY: number;
  /** 같은 방향으로 이어진 스크롤 거리(아래로 +, 위로 -) */
  accumulated: number;
  visible: boolean;
};

export const INITIAL_BAR_SCROLL_STATE: BarScrollState = {
  lastY: 0,
  accumulated: 0,
  visible: false,
};

/** 처음 보임 정도입니다. reveal 값과 바 안에서 기억하는 값이 같은 값에서 시작해야 첫 스크롤부터 맞게 움직입니다. */
export const INITIAL_BAR_REVEAL = INITIAL_BAR_SCROLL_STATE.visible ? 1 : 0;

/**
 * 스크롤 위치가 바뀔 때마다 바를 꺼내 고정할지 정합니다. 내리면 숨기고, 위로 살짝만 올려도 바로 보여 줍니다.
 * 맨 위에서는 바가 원래 자리에 있으므로 숨김으로 둡니다. 보임으로 두면 원래 자리가 고정 위치와 같은
 * 검색 헤더가 처음 내릴 때 내용을 따라가지 않고 붙잡혀 있다가 튀어 오릅니다.
 */
export function reduceBarScroll(
  state: BarScrollState,
  y: number,
  metrics?: {contentHeight?: number; viewportHeight?: number},
): BarScrollState {
  if (y <= 0) {
    return {lastY: y, accumulated: 0, visible: false};
  }

  const delta = y - state.lastY;
  if (Math.abs(delta) > BAR_MAX_JUMP) {
    return {...state, lastY: y, accumulated: 0};
  }

  const {contentHeight, viewportHeight} = metrics ?? {};
  // 목록 맨 아래에서 튕겨 돌아오는 움직임은 사용자가 위로 올린 것이 아닙니다.
  if (
    contentHeight !== undefined &&
    viewportHeight !== undefined &&
    y + viewportHeight > contentHeight + 1
  ) {
    return {...state, lastY: y};
  }

  const sameDirection =
    state.accumulated === 0 || Math.sign(delta) === Math.sign(state.accumulated);
  const accumulated = sameDirection ? state.accumulated + delta : delta;

  let visible = state.visible;
  if (accumulated <= -BAR_REVEAL_UP_DISTANCE) {
    visible = true;
  } else if (accumulated >= BAR_HIDE_DOWN_DISTANCE) {
    visible = false;
  }
  return {lastY: y, accumulated, visible};
}

type SavedPlacesStickyBarProps = {
  /** 스크롤 위치(ScrollView의 contentOffset.y)를 담은 값입니다. */
  scrollY: Animated.Value;
  /** 보임(1)·숨김(0) 정도. 값이 바뀌면 바가 올라가거나 내려옵니다. */
  reveal: Animated.Value;
  /** 스크롤 내용 안에서 이 바가 원래 놓이는 y 위치입니다. */
  naturalTop: number;
  /** 숨길 때 stickOffset 위치에서 위로 올리는 거리입니다. 위의 헤더와 바를 함께 화면 밖으로 내보낼 만큼 줍니다. */
  hideDistance: number;
  /** 스크롤 영역 위에서 바가 멈출 y 위치입니다(떠 있는 헤더 높이 등). */
  stickOffset: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * 스크롤 내용 안의 바(검색 헤더, 토글·카테고리 칩)를 위에 겹쳐 그립니다. 처음에는 내용과 함께 움직이다가,
 * 위로 살짝만 올려도 stickOffset 위치로 바로 내려와 멈추고, 다시 내리면 화면 밖으로 사라집니다.
 * 화면 y = max(내용 안의 원래 위치, stickOffset - 숨긴 만큼)
 */
export function SavedPlacesStickyBar({
  scrollY,
  reveal,
  naturalTop,
  hideDistance,
  stickOffset,
  style,
  children,
}: SavedPlacesStickyBarProps) {
  const translateY = useRef(new Animated.Value(naturalTop)).current;
  const scrollRef = useRef(0);
  const revealRef = useRef(INITIAL_BAR_REVEAL);

  const update = useCallback(() => {
    const natural = naturalTop - scrollRef.current;
    const hidden = (1 - revealRef.current) * hideDistance;
    translateY.setValue(Math.max(natural, stickOffset - hidden));
  }, [hideDistance, naturalTop, stickOffset, translateY]);

  useEffect(() => {
    const scrollId = scrollY.addListener(({value}) => {
      scrollRef.current = value;
      update();
    });
    const revealId = reveal.addListener(({value}) => {
      revealRef.current = value;
      update();
    });
    update();
    return () => {
      scrollY.removeListener(scrollId);
      reveal.removeListener(revealId);
    };
  }, [reveal, scrollY, update]);

  return (
    <Animated.View style={[styles.bar, style, {transform: [{translateY}]}]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    backgroundColor: '#ffffff',
  },
});
