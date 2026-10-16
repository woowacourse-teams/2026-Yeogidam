import {StyleSheet} from 'react-native';

/** 썸네일 주소가 없는 히스토리 항목에 보여 주는 기본 이미지입니다. */
export const HISTORY_FALLBACK_THUMBNAIL =
  'https://www.figma.com/api/mcp/asset/88501ab5-fdd5-49c7-bda1-e486a502a36c.png';

/** 히스토리 목록과 두 상세 화면이 함께 쓰는 바탕, 머리, 원본 릴스 버튼 스타일입니다. */
export const historyStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: 84,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    fontSize: 30,
    lineHeight: 34,
    color: 'rgba(0,0,0,.61)',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
    marginLeft: 17,
  },
  headerSpacer: { flex: 1 },
  detailThumbnail: {
    width: 180,
    height: 226,
    borderRadius: 12,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
    marginTop: 24,
  },
  originalButton: {
    height: 61,
    marginHorizontal: 22,
    marginTop: 49,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.14)',
    borderRadius: 20,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 50,
  },
  disabledButton: { opacity: 0.45 },
  originalText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  detailChevron: { fontSize: 30, color: '#000' },
  homeIndicator: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 139,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1a1a2e',
    opacity: 0.2,
  },
});
