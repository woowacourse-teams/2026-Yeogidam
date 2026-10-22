import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
  type PanResponderGestureState,
  type PanResponderCallbacks,
  type LayoutChangeEvent,
} from 'react-native';

const BACK_EDGE_WIDTH = 40;

export type BackGestureRegion = { top: number; bottom: number };

export type BackScreen = { key: string; content: React.ReactNode };

type ScreenMotion = {
  translation: Animated.Value;
  radius: Animated.Value;
  shade: Animated.Value;
};

function createScreenMotion(): ScreenMotion {
  return {
    translation: new Animated.Value(0),
    radius: new Animated.Value(0),
    shade: new Animated.Value(0),
  };
}

export function shouldFinishBackSwipe(dx: number, vx: number, width: number) {
  return dx >= width * 0.33 || (dx >= 36 && vx >= 0.55);
}

/** Screens keep their keys and native views while their stacking order changes. */
export function SwipeBackStack({
  screens,
  activeKey,
  backKey,
  onBack,
  enabled = true,
  transitionKey,
  onSwipeStart,
  gestureRegion,
}: {
  screens: BackScreen[];
  activeKey: string;
  backKey?: string | null;
  onBack: () => void;
  enabled?: boolean;
  /** Changes when a back action restores state within the same route. */
  transitionKey?: string | number;
  onSwipeStart?: () => void;
  /** Insets of the area in which a back swipe may start. */
  gestureRegion?: BackGestureRegion;
}) {
  const { width } = useWindowDimensions();
  const containerRef = useRef<View>(null);
  const bounds = useRef({ y: 0, height: 0 });
  const measureBounds = (event: LayoutChangeEvent) => {
    bounds.current.height = event.nativeEvent.layout.height;
    containerRef.current?.measureInWindow((_x, y, _width, height) => {
      bounds.current = { y, height };
    });
  };
  const motions = useRef(new Map<string, ScreenMotion>()).current;
  const presentKeys = new Set(screens.map(screen => screen.key));
  for (const key of motions.keys()) {
    // A popped detail is unmounted. Never give its old native animation nodes
    // to the next detail with the same route key: asynchronous native detach
    // callbacks can write the old offscreen value back after it was reset.
    if (!presentKeys.has(key)) motions.delete(key);
  }
  for (const screen of screens) {
    if (!motions.has(screen.key)) motions.set(screen.key, createScreenMotion());
  }
  const busy = useRef(false);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({
    enabled,
    activeKey,
    backKey,
    onBack,
    width,
    onSwipeStart,
    gestureRegion,
  });
  latest.current = {
    enabled,
    activeKey,
    backKey,
    onBack,
    width,
    onSwipeStart,
    gestureRegion,
  };
  const gestureRef = useRef<{
    from: string;
    to: string;
    width: number;
    foreground: ScreenMotion;
    destination: ScreenMotion;
  } | null>(null);
  const mounted = useRef(true);

  useLayoutEffect(() => {
    // The destination has already arrived at zero BEFORE onBack changes routes.
    // It must never inherit the outgoing screen's completed translateX (width).
    const current = motions.get(activeKey);
    current?.translation.stopAnimation();
    current?.translation.setValue(0);
    current?.radius.setValue(0);
    current?.shade.setValue(0);
    busy.current = false;
    gestureRef.current = null;
    setDragging(false);

    // Reset outgoing/hidden views only after the visibility change was committed.
    // Resetting the foreground at the same time as the pop can flash it at x=0.
    const cleanupFrame = requestAnimationFrame(() => {
      for (const [key, motion] of motions) {
        if (key === activeKey || key === gestureRef.current?.to) continue;
        motion.translation.stopAnimation();
        motion.translation.setValue(0);
        motion.radius.setValue(0);
        motion.shade.setValue(0);
      }
    });
    return () => cancelAnimationFrame(cleanupFrame);
  }, [activeKey, backKey, transitionKey, width, motions]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const motion of motions.values()) {
        motion.translation.stopAnimation();
        motion.radius.stopAnimation();
        motion.shade.stopAnimation();
      }
    };
  }, [motions]);

  const responder = useMemo(() => {
    const cancel = () => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const config = {
        stiffness: 280,
        damping: 32,
        mass: 1,
        overshootClamping: true,
        useNativeDriver: true,
      };
      Animated.spring(gesture.foreground.radius, {
        ...config,
        toValue: 0,
      }).start();
      Animated.spring(gesture.destination.translation, {
        ...config,
        toValue: -gesture.width * 0.22,
      }).start();
      Animated.spring(gesture.destination.shade, {
        ...config,
        toValue: 0.12,
      }).start();
      Animated.spring(gesture.foreground.translation, {
        ...config,
        toValue: 0,
      }).start(({ finished }) => {
        if (finished && mounted.current && gestureRef.current === gesture) {
          gesture.destination.translation.stopAnimation();
          gesture.destination.translation.setValue(0);
          gesture.destination.shade.stopAnimation();
          gesture.destination.shade.setValue(0);
          gestureRef.current = null;
          busy.current = false;
          setDragging(false);
        }
      });
    };
    const callbacks: PanResponderCallbacks = {
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        latest.current.enabled &&
        !!latest.current.backKey &&
        motions.has(latest.current.backKey) &&
        !busy.current &&
        gesture.x0 <= BACK_EDGE_WIDTH &&
        (!latest.current.gestureRegion ||
          (gesture.y0 >= bounds.current.y + latest.current.gestureRegion.top &&
            gesture.y0 <=
              bounds.current.y +
                bounds.current.height -
                latest.current.gestureRegion.bottom)) &&
        gesture.dx > 8 &&
        gesture.dx > Math.abs(gesture.dy) * 1.3,
      onPanResponderGrant: () => {
        const current = latest.current;
        const foreground = motions.get(current.activeKey);
        const destination = current.backKey
          ? motions.get(current.backKey)
          : undefined;
        if (!foreground || !destination || !current.backKey) return;
        busy.current = true;
        current.onSwipeStart?.();
        gestureRef.current = {
          from: current.activeKey,
          to: current.backKey,
          width: current.width,
          foreground,
          destination,
        };
        destination.translation.setValue(-current.width * 0.22);
        destination.shade.setValue(0.12);
        setDragging(true);
      },
      onPanResponderMove: (_, pan) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const distance = Math.min(gesture.width, Math.max(0, pan.dx));
        gesture.foreground.translation.setValue(distance);
        gesture.foreground.radius.setValue(Math.min(18, (distance * 18) / 32));
        gesture.destination.translation.setValue(
          -0.22 * (gesture.width - distance),
        );
        gesture.destination.shade.setValue(
          0.12 * (1 - distance / gesture.width),
        );
      },
      onPanResponderRelease: (_, pan: PanResponderGestureState) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.from !== latest.current.activeKey) return;
        if (!shouldFinishBackSwipe(pan.dx, pan.vx, gesture.width)) {
          cancel();
          return;
        }
        const config = {
          duration: Math.max(110, 260 * (1 - pan.dx / gesture.width)),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        };
        // Only the foreground's movement decides when navigation completes.
        // A decorative animation may be interrupted or never change its value;
        // waiting for all of them can leave the old route active offscreen.
        Animated.timing(gesture.foreground.radius, {
          ...config,
          toValue: 18,
        }).start();
        Animated.timing(gesture.destination.translation, {
          ...config,
          toValue: 0,
        }).start();
        Animated.timing(gesture.destination.shade, {
          ...config,
          toValue: 0,
        }).start();
        Animated.timing(gesture.foreground.translation, {
          ...config,
          toValue: gesture.width,
        }).start(({ finished }) => {
          if (
            !finished ||
            !mounted.current ||
            gestureRef.current !== gesture ||
            gesture.from !== latest.current.activeKey
          )
            return;
          gesture.destination.translation.stopAnimation();
          gesture.destination.translation.setValue(0);
          gesture.destination.shade.stopAnimation();
          gesture.destination.shade.setValue(0);
          // Release responder ownership before promoting the destination.
          // Keep duplicate swipes blocked until the route commit clears busy.
          gestureRef.current = null;
          setDragging(false);
          Keyboard.dismiss();
          latest.current.onBack();
        });
      },
      onPanResponderTerminationRequest: () => gestureRef.current === null,
      onShouldBlockNativeResponder: () => false,
      onPanResponderTerminate: cancel,
    };
    return {
      panHandlers: PanResponder.create(callbacks).panHandlers,
      edgeHandlers: PanResponder.create({
        ...callbacks,
        // Own the reserved edge from touch-down, even when a fully expanded
        // FlatList/ScrollView would otherwise claim the touch first.
        onStartShouldSetPanResponder: () =>
          latest.current.enabled && !!latest.current.backKey && !busy.current,
        onShouldBlockNativeResponder: () => true,
      }).panHandlers,
    };
  }, [motions]);

  return (
    <View
      ref={containerRef}
      onLayout={measureBounds}
      style={styles.container}
      {...responder.panHandlers}
    >
      {screens.map(screen => (
        <RetainedBackScreen
          key={screen.key}
          screen={screen}
          active={screen.key === activeKey}
          behind={screen.key === backKey}
          dragging={dragging}
          motion={motions.get(screen.key)!}
        />
      ))}
      {enabled && backKey ? (
        // Reserve the back-gesture strip before a native map can start panning.
        // Capturing only after dx > 8 is too late for native gesture handlers.
        <View
          {...responder.edgeHandlers}
          testID="back-gesture-edge"
          pointerEvents="box-only"
          style={[styles.gestureEdge, gestureRegion]}
        />
      ) : null}
    </View>
  );
}

function RetainedBackScreen({
  screen,
  active,
  behind,
  dragging,
  motion,
}: {
  screen: BackScreen;
  active: boolean;
  behind: boolean;
  dragging: boolean;
  motion: ScreenMotion;
}) {
  // Each native view keeps its own animation values even when its role changes.
  return (
    <View
      testID={`back-screen-${screen.key}`}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.screen,
        active ? styles.active : behind ? styles.behind : styles.hidden,
      ]}
    >
      <Animated.View
        style={[
          styles.animatedScreen,
          active && dragging ? styles.shadow : null,
          { transform: [{ translateX: motion.translation }] },
        ]}
      >
        <Animated.View
          style={[styles.content, { borderRadius: motion.radius }]}
        >
          {screen.content}
          <Animated.View
            pointerEvents="none"
            style={[styles.scrim, { opacity: motion.shade }]}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  gestureEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: BACK_EDGE_WIDTH,
    zIndex: 10,
    elevation: 20,
  },
  screen: { ...StyleSheet.absoluteFill },
  animatedScreen: { flex: 1 },
  active: { opacity: 1, zIndex: 2 },
  behind: { opacity: 1, zIndex: 1 },
  hidden: { opacity: 0, zIndex: 0 },
  content: { flex: 1, overflow: 'hidden', backgroundColor: '#ffffff' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: '#000000' },
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 12,
  },
});
