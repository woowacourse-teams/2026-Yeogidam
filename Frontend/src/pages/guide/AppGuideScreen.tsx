import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';

type AppGuideScreenProps = {
  onComplete: () => void;
  onClose?: () => void;
};

type GuideStep = 'intro' | 'share' | 'done';

const BRAND_MARK = require('../../assets/icons/brand-mark.png');

const MOCK_SLIDES = [
  {
    id: 'cafe',
    title: '레이어 커피바',
    place: '서울 성동구',
    color: '#f1d9c4',
  },
  { id: 'wol', title: '카페 온월', place: '서울 성동구', color: '#cfe3cf' },
  { id: 'bar', title: '성수 이자카야', place: '서울 성동구', color: '#d4d9f2' },
];

const SHARE_PRACTICE_MESSAGE =
  '여기담 공유 연습 · 마음에 드는 장소가 담긴 게시물에서 공유 → 여기담을 선택해요.';

function MockInstagramPost({ onPressShare }: { onPressShare: () => void }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 48;
  const [slide, setSlide] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.2] }),
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.35],
        }),
      },
    ],
  };

  return (
    <View style={[styles.post, { width: cardWidth }]}>
      <View style={styles.postHeader}>
        <Image source={BRAND_MARK} style={styles.avatar} />
        <Text style={styles.postUser}>yeogidam</Text>
        <MaterialIcons name="more-vert" size={20} color="#141c2d" />
      </View>

      <FlatList
        data={MOCK_SLIDES}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        onMomentumScrollEnd={event => {
          setSlide(
            Math.round(event.nativeEvent.contentOffset.x / (cardWidth - 2)),
          );
        }}
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.slide,
              { width: cardWidth - 2, backgroundColor: item.color },
            ]}
          >
            <Text style={styles.slideCount}>
              {index + 1}/{MOCK_SLIDES.length}
            </Text>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slidePlace}>{item.place}</Text>
          </View>
        )}
      />

      <View style={styles.postActions}>
        <MaterialIcons name="favorite-border" size={26} color="#141c2d" />
        <MaterialIcons name="chat-bubble-outline" size={24} color="#141c2d" />
        <View style={styles.shareWrap}>
          <Animated.View
            pointerEvents="none"
            style={[styles.shareRing, ringStyle]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="공유 버튼 눌러보기"
            hitSlop={10}
            onPress={onPressShare}
            style={styles.shareButton}
          >
            <MaterialIcons name="send" size={18} color="#141c2d" />
          </Pressable>
        </View>
        <View style={styles.dots}>
          {MOCK_SLIDES.map((item, index) => (
            <View
              key={item.id}
              style={[styles.postDot, index === slide && styles.postDotActive]}
            />
          ))}
        </View>
        <MaterialIcons name="bookmark-border" size={26} color="#141c2d" />
      </View>

      <View style={styles.tooltip}>
        <Text style={styles.tooltipText}>공유 버튼을 눌러보세요</Text>
      </View>
    </View>
  );
}

function StepHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>STEP {step}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      {description ? (
        <Text style={styles.stepDescription}>{description}</Text>
      ) : null}
    </View>
  );
}

const INTRO_LIBRARY = require('../../assets/guide/intro-library.png');
const INTRO_MAP = require('../../assets/guide/intro-map.png');

const INTRO_PHASES = [
  {
    title: '공유하면 자동으로 저장돼요',
  },
  {
    title: '보관함에 차곡차곡 모여요',
  },
  {
    title: '지도에서 한눈에 볼 수 있어요',
  },
];

const INTRO_PINS = [
  { left: '30%', top: '30%' },
  { left: '62%', top: '48%' },
  { left: '40%', top: '66%' },
] as const;

// 화면 높이에 맞춰 폰 프레임 크기를 정한다 (작은 기기는 기존 크기 유지)
function useIntroFrame() {
  const { height } = useWindowDimensions();
  const frameHeight = Math.min(480, Math.max(330, height - 400));
  const frameWidth = Math.round(frameHeight / 1.5);

  return {
    frameWidth,
    frameHeight,
    libraryHeight: Math.round((frameWidth * 1115) / 640),
    mapHeight: Math.round((frameWidth * 1121) / 640),
  };
}

function IntroDemo() {
  const { frameWidth, frameHeight, libraryHeight, mapHeight } = useIntroFrame();
  const [phase, setPhase] = useState(0);
  const toast = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.Value(0)).current;
  const mapFade = useRef(new Animated.Value(0)).current;
  const mapZoom = useRef(new Animated.Value(0)).current;
  const pins = useRef(INTRO_PINS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const timer = setTimeout(
      () => setPhase(prev => (prev + 1) % INTRO_PHASES.length),
      3600,
    );
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    toast.setValue(0);
    pan.setValue(0);
    mapZoom.setValue(0);
    pins.forEach(pin => pin.setValue(0));

    if (phase === 0) {
      mapFade.setValue(0);
      const anim = Animated.sequence([
        Animated.delay(500),
        Animated.spring(toast, { toValue: 1, useNativeDriver: true }),
      ]);
      anim.start();
      return () => anim.stop();
    }

    if (phase === 1) {
      mapFade.setValue(0);
      const anim = Animated.sequence([
        Animated.delay(400),
        Animated.timing(pan, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),
      ]);
      anim.start();
      return () => anim.stop();
    }

    mapFade.setValue(0);
    const anim = Animated.parallel([
      Animated.timing(mapFade, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(mapZoom, {
        toValue: 1,
        duration: 3400,
        useNativeDriver: true,
      }),
      Animated.stagger(
        450,
        pins.map(pin =>
          Animated.spring(pin, {
            toValue: 1,
            friction: 5,
            useNativeDriver: true,
          }),
        ),
      ),
    ]);
    const delayed = Animated.sequence([Animated.delay(500), anim]);
    delayed.start();
    return () => delayed.stop();
  }, [phase, toast, pan, mapFade, mapZoom, pins]);

  const overflow = libraryHeight - frameHeight;

  return (
    <View style={styles.introDemo}>
      <View style={styles.phone}>
        <View
          style={[
            styles.phoneScreen,
            { width: frameWidth, height: frameHeight },
          ]}
        >
          <Animated.Image
            source={INTRO_LIBRARY}
            resizeMode="cover"
            style={[
              styles.introImage,
              {
                width: frameWidth,
                height: libraryHeight,
                transform: [
                  {
                    translateY: pan.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -overflow],
                    }),
                  },
                ],
              },
            ]}
          />
          {phase === 2 ? (
            <Animated.View
              style={[styles.introMapLayer, { opacity: mapFade }]}
              pointerEvents="none"
            >
              <Animated.Image
                source={INTRO_MAP}
                resizeMode="cover"
                style={[
                  styles.introImage,
                  {
                    width: frameWidth,
                    height: mapHeight,
                    transform: [
                      {
                        scale: mapZoom.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.15],
                        }),
                      },
                    ],
                  },
                ]}
              />
              {INTRO_PINS.map((pos, index) => (
                <Animated.View
                  key={`${pos.left}-${pos.top}`}
                  style={[
                    styles.introPin,
                    pos,
                    {
                      opacity: pins[index],
                      transform: [
                        {
                          translateY: pins[index].interpolate({
                            inputRange: [0, 1],
                            outputRange: [-36, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <MaterialIcons name="place" size={34} color="#4f6ef7" />
                </Animated.View>
              ))}
            </Animated.View>
          ) : null}
          {phase === 0 ? (
            <Animated.View
              style={[
                styles.introToast,
                {
                  opacity: toast,
                  transform: [
                    {
                      translateY: toast.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-30, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <MaterialIcons name="check-circle" size={16} color="#34c759" />
              <Text style={styles.introToastText}>보관함에 저장됐어요</Text>
            </Animated.View>
          ) : null}
        </View>
      </View>

      <Text style={styles.introPhaseTitle}>{INTRO_PHASES[phase].title}</Text>
      <View style={styles.introDots}>
        {INTRO_PHASES.map((item, index) => (
          <Pressable
            key={item.title}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            hitSlop={8}
            onPress={() => setPhase(index)}
          >
            <View
              style={[
                styles.introDot,
                index === phase && styles.introDotActive,
              ]}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function AppGuideScreen({ onComplete, onClose }: AppGuideScreenProps) {
  const [step, setStep] = useState<GuideStep>('intro');

  const openShareSheet = async (next: GuideStep) => {
    try {
      await Share.share({ message: SHARE_PRACTICE_MESSAGE });
    } catch {
      // 공유 시트를 열지 못해도 안내는 계속 진행한다.
    }
    setStep(next);
  };

  const renderBody = () => {
    switch (step) {
      case 'intro':
        return (
          <>
            <View style={styles.introHeader}>
              <Text style={styles.stepTitle}>
                SNS에서 본 장소,{'\n'}여기담에 바로 담아보세요
              </Text>
            </View>
            <IntroDemo />
          </>
        );
      case 'share':
        return (
          <>
            <StepHeader step={1} title="공유 버튼을 눌러보세요" />
            <View style={styles.center}>
              <MockInstagramPost onPressShare={() => openShareSheet('done')} />
            </View>
          </>
        );
      case 'done':
        return (
          <>
            <StepHeader step={2} title="이제 공유만 하면 저장돼요" />
            <View style={styles.doneCard}>
              <Text style={styles.doneFlow}>
                공유 버튼 → 여기담 선택 → 보관함 확인
              </Text>
            </View>
          </>
        );
    }
  };

  const footer =
    step === 'intro' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="공유 방법 알아보기"
        onPress={() => setStep('share')}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>공유 방법 알아보기</Text>
      </Pressable>
    ) : step === 'done' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="여기담 시작하기"
        onPress={onComplete}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>시작하기</Text>
      </Pressable>
    ) : step === 'share' ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => setStep('done')}
        hitSlop={8}
      >
        <Text style={styles.skipText}>공유는 나중에 해볼게요</Text>
      </Pressable>
    ) : null;

  return (
    <View style={styles.container}>
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="사용 가이드 닫기"
          hitSlop={12}
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.closeButtonPressed,
          ]}
        >
          <Text style={styles.closeButtonText}>닫기</Text>
        </Pressable>
      ) : null}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {renderBody()}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 24,
    zIndex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  closeButtonPressed: {
    opacity: 0.65,
  },
  closeButtonText: {
    color: '#596275',
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 128,
    gap: 24,
  },
  center: {
    alignItems: 'center',
  },
  introHeader: {
    gap: 12,
    paddingTop: 8,
  },
  introDemo: {
    alignItems: 'center',
    gap: 10,
  },
  phone: {
    padding: 6,
    borderRadius: 30,
    backgroundColor: '#141c2d',
  },
  phoneScreen: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  introImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  introMapLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#ffffff',
  },
  introPin: {
    position: 'absolute',
    marginLeft: -17,
    marginTop: -34,
  },
  introToast: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#141c2d',
  },
  introToastText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  introPhaseTitle: {
    marginTop: 10,
    color: '#141c2d',
    fontSize: 22,
    fontWeight: '800',
  },
  introDots: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 4,
  },
  introDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#d9def2',
  },
  introDotActive: {
    width: 22,
    backgroundColor: '#aebcf6',
  },
  stepHeader: {
    gap: 12,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#c7cdf7',
  },
  stepBadgeText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  stepTitle: {
    color: '#141c2d',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 33,
  },
  stepDescription: {
    color: '#596275',
    fontSize: 14,
    lineHeight: 20,
  },
  post: {
    borderWidth: 1,
    borderColor: '#141c2d',
    backgroundColor: '#ffffff',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d9def2',
  },
  postUser: {
    flex: 1,
    color: '#141c2d',
    fontSize: 14,
    fontWeight: '700',
  },
  slide: {
    height: 260,
    justifyContent: 'flex-end',
    padding: 16,
  },
  slideCount: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(20,28,45,0.6)',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  slideTitle: {
    color: '#141c2d',
    fontSize: 20,
    fontWeight: '800',
  },
  slidePlace: {
    color: '#596275',
    fontSize: 13,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 16,
  },
  shareWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#aebcf6',
  },
  shareButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#aebcf6',
    backgroundColor: '#ffffff',
  },
  dots: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  postDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#d0d3dc',
  },
  postDotActive: {
    backgroundColor: '#4f6ef7',
  },
  tooltip: {
    alignSelf: 'flex-start',
    marginLeft: 44,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#141c2d',
  },
  tooltipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  doneCard: {
    padding: 20,
    borderRadius: 14,
    backgroundColor: '#f3f5fd',
    gap: 12,
  },
  doneFlow: {
    color: '#141c2d',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    left: 24,
    alignItems: 'center',
  },
  skipText: {
    color: '#596275',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  button: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 14,
    backgroundColor: '#141c2d',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
