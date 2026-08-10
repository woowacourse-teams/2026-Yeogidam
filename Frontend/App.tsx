import React, {useState} from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

type Screen = 'home' | 'saved' | 'empty' | 'map' | 'detail' | 'my';

const places = [
  {name: '카페 온월', address: '경기도 성남시', image: require('./src/assets/place-cafe-onwol.png')},
  {name: '모노룸 커피', address: '서울시 마포구', image: require('./src/assets/place-monoroom.png')},
  {name: '서울숲 데이블', address: '서울시 성동구', image: require('./src/assets/place-dable.png')},
  {name: '레이어 커피바', address: '서울시 강남구', image: require('./src/assets/place-layer.png')},
];

const screenOptions: {id: Screen; label: string; description: string}[] = [
  {id: 'saved', label: '저장한 장소', description: '2열 카드 형태의 저장 목록'},
  {id: 'empty', label: '저장한 장소 (비어 있음)', description: '저장 전 안내 화면'},
  {id: 'map', label: '지도', description: '검색과 장소 바텀시트'},
  {id: 'detail', label: '장소 상세', description: '사진과 게시물 목록'},
  {id: 'my', label: '마이', description: '내 활동과 설정'},
];

function App() {
  const [screen, setScreen] = useState<Screen>('home');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        {screen === 'home' ? <Home onOpen={setScreen} /> : <AppScreen screen={screen} onNavigate={setScreen} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Home({onOpen}: {onOpen: (screen: Screen) => void}) {
  return (
    <View style={styles.home}>
      <View style={styles.homeHero}>
        <Text style={styles.eyebrow}>YEOGIDAM</Text>
        <Text style={styles.homeTitle}>마음에 드는 장소를{`\n`}여기 담아보세요.</Text>
        <Text style={styles.homeBody}>와이어프레임에 있는 모든 화면을 확인할 수 있어요.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.menuList} showsVerticalScrollIndicator={false}>
        {screenOptions.map(item => (
          <Pressable key={item.id} onPress={() => onOpen(item.id)} style={({pressed}) => [styles.menuCard, pressed && styles.pressed]}>
            <View><Text style={styles.menuTitle}>{item.label}</Text><Text style={styles.menuDescription}>{item.description}</Text></View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function AppScreen({screen, onNavigate}: {screen: Exclude<Screen, 'home'>; onNavigate: (screen: Screen) => void}) {
  const content = screen === 'saved' ? <SavedList onOpenDetail={() => onNavigate('detail')} />
    : screen === 'empty' ? <EmptySaved />
    : screen === 'map' ? <MapScreen onOpenDetail={() => onNavigate('detail')} />
    : screen === 'detail' ? <DetailScreen />
    : <MyScreen />;
  return <View style={styles.appShell}>{content}<TabBar active={screen} onNavigate={onNavigate} /></View>;
}

function Header({title, back}: {title: string; back?: () => void}) {
  return <View style={styles.header}>{back ? <Pressable onPress={back} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable> : <View /> }<Text style={styles.headerTitle}>{title}</Text><Pressable style={styles.headerAction}><Text style={styles.headerIcon}>⌕</Text></Pressable></View>;
}

function SavedList({onOpenDetail}: {onOpenDetail: () => void}) {
  return <View style={styles.page}><Header title="저장한 장소" /><View style={styles.divider} />
    <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
      {places.concat(places.slice(1, 3)).map((place, index) => <Pressable key={`${place.name}-${index}`} onPress={onOpenDetail} style={styles.placeCard}>
        <Image source={place.image} style={styles.placeImage} /><View style={styles.dim} /><View style={styles.heart}><Text>♡</Text></View>
        <View style={styles.placeLabel}><Text style={styles.placeName}>{place.name}</Text><Text style={styles.placeAddress}>{place.address}</Text></View>
      </Pressable>)}
    </ScrollView><View style={styles.fab}><Text style={styles.fabText}>＋</Text></View>
  </View>;
}

function EmptySaved() {
  return <View style={styles.page}><Header title="저장한 장소" /><View style={styles.emptyContent}>
    <Image source={require('./src/assets/empty-illustration.png')} style={styles.emptyImage} />
    <Text style={styles.emptyTitle}>아직 저장된 장소가 없어요</Text><Text style={styles.emptyBody}>인스타그램 릴스나 유튜브 쇼츠에서{`\n`}공유하기를 통해 여기담에 저장해보세요.</Text>
  </View></View>;
}

function MapScreen({onOpenDetail}: {onOpenDetail: () => void}) {
  return <View style={styles.mapPage}><ImageBackground source={require('./src/assets/map-background.png')} style={styles.mapBackground} imageStyle={styles.mapImage}>
    <View style={styles.mapSearch}><Text style={styles.searchBack}>‹</Text><Text style={styles.searchText}>우테코</Text><Text style={styles.close}>×</Text></View>
    <View style={[styles.marker, styles.selectedMarker]}><Text style={styles.markerText}>카페 온월</Text></View>
    {[[25, 35], [64, 37], [20, 58], [72, 55]].map(([left, top], i) => <View key={i} style={[styles.dot, {left: `${left}%`, top: `${top}%`}]} />)}
  </ImageBackground>
  <View style={styles.sheet}><View style={styles.sheetPill} />
    {places.slice(0, 2).map(place => <Pressable key={place.name} onPress={onOpenDetail} style={styles.mapResult}><View style={styles.resultTop}><View><Text style={styles.resultName}>{place.name}</Text><Text style={styles.resultAddress}>서울 성동구 성수이로 88 2층</Text></View><Text style={styles.resultHeart}>♡</Text></View><Image source={place.image} style={styles.resultImage} /></Pressable>)}
  </View></View>;
}

function DetailScreen() {
  return <ScrollView style={styles.detailPage} contentContainerStyle={styles.detailContent}><View style={styles.detailHeader}><Text style={styles.back}>‹</Text><Text style={styles.detailHeart}>♡</Text></View>
    <Text style={styles.detailName}>카페 온월</Text><Text style={styles.detailAddress}>서울 성동구 성수이로 88 2층 (성수동)</Text>
    <Image source={places[0].image} style={styles.heroImage} /><View style={styles.detailTabs}><Text style={styles.detailTabActive}>홈</Text><Text style={styles.detailTab}>게시물</Text><Text style={styles.detailTab}>리뷰</Text></View>
    <View style={styles.postGrid}>{[...Array(6)].map((_, i) => <Image key={i} source={places[i % 4].image} style={styles.postImage} />)}</View>
  </ScrollView>;
}

function MyScreen() {
  return <View style={styles.page}><Header title="마이" /><View style={styles.profile}><View style={styles.avatar}><Text style={styles.avatarText}>여</Text></View><Text style={styles.profileName}>여기담 사용자</Text><Text style={styles.profileCopy}>나만의 장소를 기록하고 관리해요.</Text></View>
    {['내가 저장한 장소', '최근 본 장소', '알림 설정', '앱 설정'].map(item => <View style={styles.setting} key={item}><Text style={styles.settingText}>{item}</Text><Text style={styles.settingArrow}>›</Text></View>)}
  </View>;
}

function TabBar({active, onNavigate}: {active: Screen; onNavigate: (screen: Screen) => void}) {
  const tabs: {id: Screen; icon: string; label: string}[] = [{id: 'saved', icon: '♧', label: '저장됨'}, {id: 'map', icon: '♧', label: '지도'}, {id: 'my', icon: '♙', label: '마이'}];
  return <View style={styles.tabBar}>{tabs.map(tab => <Pressable key={tab.id} onPress={() => onNavigate(tab.id)} style={styles.tab}><Text style={[styles.tabIcon, active === tab.id && styles.activeText]}>{tab.icon}</Text><Text style={[styles.tabText, active === tab.id && styles.activeText]}>{tab.label}</Text></Pressable>)}<Pressable onPress={() => onNavigate('home')} style={styles.homeDot}><Text style={styles.homeDotText}>⌂</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#fff'}, appShell: {flex: 1, backgroundColor: '#fff'}, page: {flex: 1, backgroundColor: '#fff'},
  home: {flex: 1, backgroundColor: '#f5f3ee', paddingHorizontal: 24}, homeHero: {paddingTop: 64, paddingBottom: 36}, eyebrow: {fontSize: 12, fontWeight: '800', color: '#7885c8', letterSpacing: 2}, homeTitle: {fontSize: 30, lineHeight: 41, fontWeight: '800', color: '#1a1a2e', marginTop: 12}, homeBody: {fontSize: 14, color: '#8e8e93', marginTop: 12}, menuList: {gap: 12, paddingBottom: 36}, menuCard: {backgroundColor: '#fff', borderRadius: 20, padding: 20, minHeight: 86, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#1a1a2e', shadowOpacity: .06, shadowRadius: 12, elevation: 2}, pressed: {opacity: .72}, menuTitle: {fontSize: 16, fontWeight: '800', color: '#1a1a2e'}, menuDescription: {fontSize: 12, color: '#8e8e93', marginTop: 5}, arrow: {fontSize: 30, color: '#aeaeb2'},
  header: {height: 76, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, headerTitle: {fontSize: 22, fontWeight: '800', color: '#1a1a2e'}, headerAction: {width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: .08, shadowRadius: 4, elevation: 2}, headerIcon: {fontSize: 28, color: '#dbe0f9'}, back: {fontSize: 38, lineHeight: 38, color: '#1a1a2e'}, divider: {height: 1, backgroundColor: '#e5e5ea', marginHorizontal: 24},
  grid: {padding: 12, paddingBottom: 130, flexDirection: 'row', flexWrap: 'wrap', gap: 10}, placeCard: {width: '48.5%', height: 248, borderRadius: 20, overflow: 'hidden', backgroundColor: '#eee'}, placeImage: {width: '100%', height: '100%', resizeMode: 'cover'}, dim: {position: 'absolute', left: 0, right: 0, bottom: 0, height: 72, backgroundColor: 'rgba(24,24,24,.38)'}, heart: {position: 'absolute', right: 8, top: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center'}, placeLabel: {position: 'absolute', left: 10, right: 10, bottom: 10}, placeName: {color: '#fff', fontSize: 14, fontWeight: '800'}, placeAddress: {color: '#fff', fontSize: 10, marginTop: 2}, fab: {position: 'absolute', right: 18, bottom: 88, width: 52, height: 52, borderRadius: 26, backgroundColor: '#dbe0f9', alignItems: 'center', justifyContent: 'center', shadowColor: '#3b6fe8', shadowOpacity: .25, shadowRadius: 10, elevation: 4}, fabText: {fontSize: 30, color: '#fff', fontWeight: '300'},
  emptyContent: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 72}, emptyImage: {width: 156, height: 195, borderRadius: 30, marginBottom: 24}, emptyTitle: {fontSize: 20, fontWeight: '800', color: '#1a1a2e'}, emptyBody: {fontSize: 14, color: '#8e8e93', lineHeight: 23, textAlign: 'center', marginTop: 8},
  mapPage: {flex: 1, backgroundColor: '#fafafa'}, mapBackground: {flex: 1}, mapImage: {resizeMode: 'cover'}, mapSearch: {position: 'absolute', top: 14, left: 14, right: 14, height: 44, backgroundColor: '#fff', borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, shadowColor: '#1a1a2e', shadowOpacity: .1, shadowRadius: 8, elevation: 3}, searchBack: {fontSize: 30, color: '#1a1a2e', marginRight: 12}, searchText: {fontSize: 15, fontWeight: '800', color: '#1a1a2e', flex: 1}, close: {fontSize: 26, color: '#8e8e93'}, marker: {position: 'absolute', paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: '#fff', borderRadius: 18, backgroundColor: '#dbe0f9'}, selectedMarker: {left: '39%', top: '31%'}, markerText: {fontSize: 11, fontWeight: '800', color: '#fff'}, dot: {position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#7ac7df', borderWidth: 3, borderColor: '#fff'}, sheet: {position: 'absolute', height: 395, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 14, shadowColor: '#000', shadowOpacity: .15, shadowRadius: 16, elevation: 8}, sheetPill: {alignSelf: 'center', height: 5, width: 97, borderRadius: 3, backgroundColor: '#1a1a2e', opacity: .15, marginBottom: 12}, mapResult: {paddingVertical: 12}, resultTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}, resultName: {fontSize: 16, fontWeight: '800', color: '#1a1a2e'}, resultAddress: {fontSize: 12, color: '#8e8e93', marginTop: 3}, resultHeart: {fontSize: 28, color: '#dbe0f9'}, resultImage: {height: 108, width: '100%', borderRadius: 16, resizeMode: 'cover'},
  detailPage: {flex: 1, backgroundColor: '#fff'}, detailContent: {paddingBottom: 120}, detailHeader: {height: 60, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}, detailHeart: {fontSize: 30, color: '#dbe0f9'}, detailName: {fontSize: 28, fontWeight: '800', color: '#1a1a2e', paddingHorizontal: 24, marginTop: 8}, detailAddress: {fontSize: 12, color: '#8e8e93', paddingHorizontal: 24, marginTop: 6, marginBottom: 18}, heroImage: {width: '100%', height: 190, resizeMode: 'cover'}, detailTabs: {height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: '#e5e5ea'}, detailTab: {fontSize: 14, color: '#aeaeb2'}, detailTabActive: {fontSize: 14, fontWeight: '800', color: '#1a1a2e'}, postGrid: {padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8}, postImage: {width: '48.7%', height: 185, borderRadius: 12, resizeMode: 'cover'},
  profile: {alignItems: 'center', paddingVertical: 42, borderBottomWidth: 8, borderBottomColor: '#f5f3ee'}, avatar: {width: 72, height: 72, borderRadius: 36, backgroundColor: '#dbe0f9', justifyContent: 'center', alignItems: 'center'}, avatarText: {fontSize: 28, fontWeight: '800', color: '#fff'}, profileName: {fontSize: 18, fontWeight: '800', color: '#1a1a2e', marginTop: 12}, profileCopy: {fontSize: 13, color: '#8e8e93', marginTop: 6}, setting: {height: 58, marginHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#e5e5ea', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, settingText: {fontSize: 15, color: '#1a1a2e'}, settingArrow: {fontSize: 25, color: '#aeaeb2'},
  tabBar: {height: 68, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e5ea', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16}, tab: {flex: 1, alignItems: 'center', gap: 2}, tabIcon: {fontSize: 20, color: '#aeaeb2'}, tabText: {fontSize: 10, color: '#aeaeb2'}, activeText: {color: '#b6c2fb', fontWeight: '800'}, homeDot: {width: 30, height: 30, borderRadius: 15, backgroundColor: '#f5f3ee', alignItems: 'center', justifyContent: 'center'}, homeDotText: {fontSize: 16, color: '#8e8e93'},
});

export default App;
