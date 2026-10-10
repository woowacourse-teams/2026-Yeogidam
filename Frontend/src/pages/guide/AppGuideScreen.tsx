import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Platform,
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

type GuideStep = 'intro' | 'share' | 'check' | 'help' | 'done';
type DeviceTab = 'ios' | 'android';

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

const HELP_STEPS: Record<DeviceTab, string[]> = {
  ios: [
    '오른쪽 끝까지 넘겨요',
    '더보기를 눌러요',
    '편집에서 여기담 옆 +를 눌러요',
    '완료하면 맨 앞에 보여요',
  ],
  android: [
    '옆으로 넘겨 여기담을 찾아요',
    '여기담을 길게 눌러요',
    '고정(Pin)을 눌러요',
    '맨 앞에 보여요',
  ],
};

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

const DEMO_APPS = [
  {
    key: 'airdrop',
    label: 'AirDrop',
    color: '#3b9cf5',
    icon: 'wifi-tethering',
  },
  { key: 'message', label: '메시지', color: '#34c759', icon: 'chat-bubble' },
  { key: 'note', label: '메모', color: '#f5c518', icon: 'sticky-note-2' },
  { key: 'remind', label: '미리알림', color: '#ff7a6b', icon: 'checklist' },
  { key: 'mail', label: '메일', color: '#2f8cf0', icon: 'mail' },
  { key: 'files', label: '파일', color: '#4a90e2', icon: 'folder' },
  { key: 'more', label: '더보기', color: '#ffffff', icon: 'more-horiz' },
] as const;
const DEMO_TILE = 64;

function PulseRing({ size, radius }: { size: number; radius: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: '#4f6ef7',
        opacity: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.55, 0],
        }),
        transform: [
          {
            scale: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.5],
            }),
          },
        ],
      }}
    />
  );
}

function useSwipeLoop(active: number) {
  const swipe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    swipe.stopAnimation();
    if (active === 0) {
      swipe.setValue(0);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(swipe, {
            toValue: 1,
            duration: 1300,
            useNativeDriver: true,
          }),
          Animated.delay(400),
          Animated.timing(swipe, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    swipe.setValue(1);
    return undefined;
  }, [active, swipe]);

  return swipe;
}

const ANDROID_APPS = [
  { key: 'message', label: '메시지', color: '#34a853', icon: 'chat-bubble' },
  { key: 'drive', label: '드라이브', color: '#4285f4', icon: 'cloud-upload' },
  { key: 'note', label: '메모', color: '#f9ab00', icon: 'sticky-note-2' },
  { key: 'mail', label: '메일', color: '#ea4335', icon: 'mail' },
  { key: 'link', label: '링크', color: '#7e57c2', icon: 'link' },
  { key: 'yeogidam', label: '여기담', color: '#d9def2', icon: 'place' },
] as const;

function AndroidShareDemo({ active }: { active: number }) {
  const [width, setWidth] = useState(0);
  const swipe = useSwipeLoop(active);
  const press = useRef(new Animated.Value(0)).current;
  const maxOffset = Math.max(0, ANDROID_APPS.length * DEMO_TILE - width + 8);

  useEffect(() => {
    press.stopAnimation();
    press.setValue(0);
    if (active === 1) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(press, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.delay(300),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    return undefined;
  }, [active, press]);

  // 3단계는 이미 끝까지 넘긴 상태, 4단계는 여기담이 맨 앞으로 온 상태
  const apps =
    active === 3
      ? [ANDROID_APPS[5], ...ANDROID_APPS.slice(0, 5)]
      : ANDROID_APPS;
  const translateX = swipe.interpolate({
    inputRange: [0, 1],
    outputRange: [0, active === 3 ? 0 : -maxOffset],
  });

  return (
    <View
      style={styles.demo}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
    >
      <View style={styles.demoRowClip}>
        <Animated.View
          style={[styles.demoRow, { transform: [{ translateX }] }]}
        >
          {apps.map(app => {
            const isTarget = app.key === 'yeogidam';
            return (
              <View key={app.key} style={styles.demoTile}>
                <View style={styles.demoIconWrap}>
                  {isTarget && active === 1 ? (
                    <PulseRing size={46} radius={23} />
                  ) : null}
                  {isTarget && active === 3 ? (
                    <View style={styles.demoPinBadge}>
                      <MaterialIcons
                        name="push-pin"
                        size={12}
                        color="#ffffff"
                      />
                    </View>
                  ) : null}
                  <Animated.View
                    style={[
                      styles.demoIcon,
                      styles.demoRoundIcon,
                      { backgroundColor: app.color },
                      isTarget && active === 1
                        ? {
                            transform: [
                              {
                                scale: press.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [1, 0.85],
                                }),
                              },
                            ],
                          }
                        : null,
                    ]}
                  >
                    {isTarget ? (
                      <Image source={BRAND_MARK} style={styles.demoBrand} />
                    ) : (
                      <MaterialIcons
                        name={app.icon}
                        size={24}
                        color="#ffffff"
                      />
                    )}
                  </Animated.View>
                </View>
                <Text style={styles.demoLabel}>{app.label}</Text>
              </View>
            );
          })}
        </Animated.View>
        {active === 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.demoFinger,
              {
                transform: [
                  {
                    translateX: swipe.interpolate({
                      inputRange: [0, 1],
                      outputRange: [width * 0.7, width * 0.25],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        {active === 2 ? (
          <View style={styles.demoMenu}>
            <View style={styles.demoMenuRow}>
              <View style={styles.demoMenuPin}>
                <PulseRing size={26} radius={13} />
                <MaterialIcons name="push-pin" size={18} color="#141c2d" />
              </View>
              <Text style={styles.demoMenuText}>고정</Text>
            </View>
            <View style={styles.demoMenuRow}>
              <MaterialIcons name="info-outline" size={18} color="#596275" />
              <Text style={styles.demoMenuTextMuted}>앱 정보</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ShareSheetDemo({ active }: { active: number }) {
  const [width, setWidth] = useState(0);
  const swipe = useSwipeLoop(active);
  const maxOffset = Math.max(0, DEMO_APPS.length * DEMO_TILE - width + 8);

  const translateX = swipe.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -maxOffset],
  });

  return (
    <View
      style={styles.demo}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
    >
      {active <= 1 ? (
        <View style={styles.demoRowClip}>
          <Animated.View
            style={[styles.demoRow, { transform: [{ translateX }] }]}
          >
            {DEMO_APPS.map(app => (
              <View key={app.key} style={styles.demoTile}>
                <View style={styles.demoIconWrap}>
                  {app.key === 'more' && active === 1 ? (
                    <PulseRing size={46} radius={12} />
                  ) : null}
                  <View
                    style={[styles.demoIcon, { backgroundColor: app.color }]}
                  >
                    <MaterialIcons
                      name={app.icon}
                      size={26}
                      color={app.key === 'more' ? '#141c2d' : '#ffffff'}
                    />
                  </View>
                </View>
                <Text style={styles.demoLabel}>{app.label}</Text>
              </View>
            ))}
          </Animated.View>
          {active === 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.demoFinger,
                {
                  transform: [
                    {
                      translateX: swipe.interpolate({
                        inputRange: [0, 1],
                        outputRange: [width * 0.7, width * 0.25],
                      }),
                    },
                  ],
                },
              ]}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.demoList}>
          <Text style={styles.demoListHeader}>
            {active === 2 ? '앱 편집' : '즐겨찾기'}
          </Text>
          <View style={styles.demoListRow}>
            <View style={[styles.demoIcon, styles.demoSmallIcon]}>
              <Image source={BRAND_MARK} style={styles.demoBrand} />
            </View>
            <Text style={styles.demoListLabel}>여기담</Text>
            <View style={styles.demoAction}>
              <PulseRing size={28} radius={14} />
              <View style={styles.demoPlus}>
                <MaterialIcons
                  name={active === 2 ? 'add' : 'check'}
                  size={20}
                  color="#ffffff"
                />
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function HelpSteps() {
  const [tab, setTab] = useState<DeviceTab>(
    Platform.OS === 'ios' ? 'ios' : 'android',
  );
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setTimeout(
      () => setActive(prev => (prev + 1) % HELP_STEPS[tab].length),
      3200,
    );
    return () => clearTimeout(timer);
  }, [tab, active]);

  return (
    <View style={styles.helpCard}>
      <View style={styles.tabs}>
        {(['ios', 'android'] as const).map(key => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => {
              setTab(key);
              setActive(0);
            }}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {key === 'ios' ? 'iPhone' : 'Android'}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'ios' ? (
        <ShareSheetDemo active={active} />
      ) : (
        <AndroidShareDemo active={active} />
      )}
      {HELP_STEPS[tab].map((text, index) => {
        const highlighted = index === active;
        return (
          <Pressable
            key={text}
            onPress={() => setActive(index)}
            style={[styles.helpStep, highlighted && styles.helpStepActive]}
          >
            <View
              style={[
                styles.helpStepNumber,
                highlighted && styles.helpStepNumberActive,
              ]}
            >
              <Text
                style={[
                  styles.helpStepNumberText,
                  highlighted && styles.helpStepNumberTextActive,
                ]}
              >
                {index + 1}
              </Text>
            </View>
            <Text style={styles.helpStepText}>{text}</Text>
          </Pressable>
        );
      })}
      {tab === 'android' ? (
        <Text style={styles.helpFooter}>기기마다 메뉴 이름이 조금 달라요.</Text>
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
              <MockInstagramPost onPressShare={() => openShareSheet('check')} />
            </View>
          </>
        );
      case 'check':
        return (
          <>
            <StepHeader step={2} title="공유 목록에서 여기담이 보였나요?" />
            <View style={styles.choices}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setStep('done')}
                style={({ pressed }) => [
                  styles.choice,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.choiceTitle}>네, 보였어요</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setStep('help')}
                style={({ pressed }) => [
                  styles.choice,
                  styles.choiceHighlight,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.choiceTitle}>안 보여요</Text>
              </Pressable>
            </View>
          </>
        );
      case 'help':
        return (
          <>
            <StepHeader
              step={2}
              title="여기담을 공유 목록에 추가해요"
              description="처음 한 번만 하면 돼요."
            />
            <HelpSteps />
            <Pressable
              accessibilityRole="button"
              onPress={() => openShareSheet('check')}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                공유 목록 다시 열어보기
              </Text>
            </Pressable>
          </>
        );
      case 'done':
        return (
          <>
            <StepHeader step={3} title="이제 공유만 하면 저장돼요" />
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
        onPress={() => setStep('check')}
        hitSlop={8}
      >
        <Text style={styles.skipText}>공유는 나중에 해볼게요</Text>
      </Pressable>
    ) : step === 'help' ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => setStep('done')}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>등록했어요</Text>
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
  choices: {
    gap: 12,
  },
  choice: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d9def2',
    backgroundColor: '#ffffff',
    gap: 4,
  },
  choiceHighlight: {
    backgroundColor: '#f3f5fd',
    borderColor: '#aebcf6',
  },
  choiceTitle: {
    color: '#141c2d',
    fontSize: 17,
    fontWeight: '800',
  },
  helpCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#f3f5fd',
    gap: 12,
  },
  tabs: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    backgroundColor: '#e4e8f6',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#ffffff',
  },
  tabText: {
    color: '#596275',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#141c2d',
  },
  demo: {
    borderRadius: 14,
    backgroundColor: '#e9ebf2',
    paddingTop: 14,
    overflow: 'hidden',
  },
  demoRowClip: {
    height: 92,
    overflow: 'hidden',
  },
  demoRow: {
    flexDirection: 'row',
    paddingLeft: 8,
  },
  demoTile: {
    width: DEMO_TILE,
    alignItems: 'center',
    gap: 6,
  },
  demoIconWrap: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  demoSmallIcon: {
    width: 36,
    height: 36,
    backgroundColor: '#d9def2',
  },
  demoBrand: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  demoLabel: {
    color: '#596275',
    fontSize: 11,
  },
  demoFinger: {
    position: 'absolute',
    top: 12,
    left: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(20,28,45,0.35)',
  },
  demoList: {
    marginHorizontal: 14,
    marginBottom: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    gap: 10,
  },
  demoListHeader: {
    color: '#596275',
    fontSize: 12,
    fontWeight: '700',
  },
  demoListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  demoListLabel: {
    flex: 1,
    color: '#141c2d',
    fontSize: 15,
    fontWeight: '700',
  },
  demoAction: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoPlus: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#4f6ef7',
  },
  demoRoundIcon: {
    borderRadius: 23,
  },
  demoPinBadge: {
    position: 'absolute',
    top: -4,
    right: -2,
    zIndex: 1,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#4f6ef7',
  },
  demoMenu: {
    position: 'absolute',
    top: 4,
    right: 14,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    gap: 10,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  demoMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  demoMenuPin: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoMenuText: {
    color: '#141c2d',
    fontSize: 14,
    fontWeight: '800',
  },
  demoMenuTextMuted: {
    color: '#596275',
    fontSize: 14,
  },
  helpStepActive: {
    backgroundColor: '#e4e8f6',
    borderRadius: 10,
    padding: 6,
    margin: -6,
  },
  helpStepNumberActive: {
    backgroundColor: '#4f6ef7',
  },
  helpStepNumberTextActive: {
    color: '#ffffff',
  },
  helpStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  helpStepNumber: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#aebcf6',
  },
  helpStepNumberText: {
    color: '#141c2d',
    fontSize: 12,
    fontWeight: '800',
  },
  helpStepText: {
    flex: 1,
    color: '#141c2d',
    fontSize: 14,
    lineHeight: 20,
  },
  helpFooter: {
    color: '#596275',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#141c2d',
  },
  secondaryButtonText: {
    color: '#141c2d',
    fontSize: 15,
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
