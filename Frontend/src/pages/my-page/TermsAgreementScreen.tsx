import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

type AgreementItem = {
  badge: '필수' | '선택';
  label: string;
  summary: string;
};

type ArticleSection = {
  title: string;
  body: string[];
  bullets?: string[];
};

type PrivacyRow = {
  category: string;
  fields: string;
  purpose: string;
  retention: string;
};

type TermsAgreementScreenProps = {
  onBack: () => void;
};

const AGREEMENT_ITEMS: AgreementItem[] = [
  {
    badge: '필수',
    label: '서비스 이용약관에 동의합니다.',
    summary:
      '여기담은 회원이 소셜 로그인 또는 이메일 계정을 통해 로그인한 뒤, 장소 정보를 저장하고, 지도에서 확인하며, 링크를 입력해 장소 관련 콘텐츠를 관리할 수 있도록 제공되는 서비스입니다. 회원은 타인의 권리를 침해하거나 관계 법령에 위반되는 방식으로 서비스를 이용해서는 안 됩니다.',
  },
  {
    badge: '필수',
    label: '개인정보 수집 및 이용에 동의합니다.',
    summary:
      '회사는 회원가입, 로그인, 프로필 관리, 저장한 장소 관리, 링크 처리, 고객 문의 대응, 서비스 운영 및 계정 보호를 위해 필요한 최소한의 개인정보를 수집·이용합니다. 자세한 내용은 아래 개인정보 수집 및 이용 동의 전문을 따릅니다.',
  },
  {
    badge: '선택',
    label: '위치기반 서비스 이용에 동의합니다.',
    summary:
      '회사는 회원이 위치 권한을 허용한 경우 현재 위치를 기반으로 지도 화면에서 주변 장소를 확인하거나 저장한 장소를 더 편리하게 탐색할 수 있도록 위치 정보를 이용할 수 있습니다. 회원은 위치 권한을 허용하지 않아도 기본적인 서비스 이용이 가능합니다. 다만 현재 위치 기반 기능 일부는 제한될 수 있습니다.',
  },
];

const SERVICE_TERMS_SECTIONS: ArticleSection[] = [
  {
    title: '제1조 목적',
    body: [
      '이 약관은 여기담(이하 "회사")이 제공하는 장소 저장 및 탐색 서비스 "여기담"(이하 "서비스")의 이용과 관련하여 회사와 회원의 권리, 의무 및 책임사항을 정하는 것을 목적으로 합니다.',
    ],
  },
  {
    title: '제2조 서비스 내용',
    body: ['회사가 제공하는 서비스의 주요 내용은 다음과 같습니다.'],
    bullets: [
      '소셜 로그인 또는 이메일 기반 회원가입 및 로그인',
      '회원 프로필 등록 및 수정',
      '관심 장소 저장 및 목록 조회',
      '지도 기반 장소 확인 및 탐색',
      '외부 링크 입력을 통한 장소 관련 정보 처리',
      '장소 상세 정보 및 외부 콘텐츠 연계 정보 제공',
      '회원탈퇴 및 계정 삭제',
    ],
  },
  {
    title: '제3조 회원가입 및 계정 관리',
    body: [
      '회원은 회사가 정한 절차에 따라 가입할 수 있습니다. 회원은 본인의 정보를 정확하게 제공해야 하며, 계정 정보를 타인에게 공유하거나 부정하게 사용하게 해서는 안 됩니다. 회원은 계정 정보의 관리 소홀로 발생한 불이익에 대해 책임을 질 수 있습니다.',
    ],
  },
  {
    title: '제4조 회원의 의무',
    body: ['회원은 서비스를 이용하면서 다음 행위를 해서는 안 됩니다.'],
    bullets: [
      '타인의 명의 또는 정보를 도용하는 행위',
      '서비스 또는 제3자의 권리를 침해하는 행위',
      '불법적이거나 부적절한 링크, 정보, 콘텐츠를 입력하거나 유통하는 행위',
      '서비스의 정상적인 운영을 방해하는 행위',
      '자동화된 수단 등으로 비정상적인 접근을 시도하는 행위',
    ],
  },
  {
    title: '제5조 링크 입력 및 외부 콘텐츠 이용',
    body: [
      '회원이 서비스에 입력하는 URL, 링크 또는 관련 정보는 회원이 적법하게 이용할 수 있는 정보여야 합니다. 회사는 입력된 링크를 바탕으로 장소와 관련된 정보를 처리하거나 표시할 수 있으며, 필요한 범위에서 링크의 메타데이터, 썸네일, 작성자 식별 정보 또는 장소 연계 정보를 이용할 수 있습니다. 외부 플랫폼에서 제공되는 콘텐츠의 정확성, 최신성, 권리관계는 해당 플랫폼 또는 원 권리자에게 귀속됩니다.',
    ],
  },
  {
    title: '제6조 서비스의 변경 및 중단',
    body: [
      '회사는 운영상 또는 기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다. 다만 회원에게 중대한 영향이 있는 경우에는 사전에 공지하거나 서비스 내에서 안내하도록 노력합니다.',
    ],
  },
  {
    title: '제7조 이용 제한',
    body: [
      '회사는 회원이 법령, 이 약관 또는 서비스 운영정책을 위반한 경우 서비스 이용을 제한하거나 계정을 정지 또는 삭제할 수 있습니다.',
    ],
  },
  {
    title: '제8조 회원탈퇴 및 데이터 처리',
    body: [
      '회원은 서비스에서 제공하는 절차에 따라 탈퇴를 요청할 수 있습니다. 탈퇴가 완료되면 관련 법령 또는 회사 정책에 따라 보관이 필요한 정보를 제외하고 회원의 프로필, 저장한 장소, 계정 관련 정보는 삭제 또는 분리 보관될 수 있습니다.',
    ],
  },
  {
    title: '제9조 책임의 제한',
    body: [
      '회사는 천재지변, 통신 장애, 외부 플랫폼 장애, 회원의 귀책사유 등 회사의 합리적인 통제를 벗어난 사유로 발생한 손해에 대해서는 책임을 지지 않습니다. 회사는 회원이 입력한 링크나 정보의 적법성, 정확성, 완전성을 보증하지 않습니다.',
    ],
  },
  {
    title: '제10조 약관의 변경',
    body: [
      '회사는 관련 법령을 위반하지 않는 범위에서 이 약관을 변경할 수 있습니다. 변경 시 적용일자와 변경 사유를 사전에 공지합니다.',
    ],
  },
];

const PRIVACY_ROWS: PrivacyRow[] = [
  {
    category: '필수',
    fields: '소셜 로그인 식별자, 이메일 주소, 이름 또는 닉네임, 프로필 이미지',
    purpose: '회원 식별, 로그인, 계정 생성 및 운영',
    retention: '회원 탈퇴 시까지',
  },
  {
    category: '필수',
    fields: '프로필 정보(닉네임, 소개, 프로필 이미지)',
    purpose: '마이페이지 표시, 프로필 수정 및 계정 관리',
    retention: '회원 탈퇴 시까지',
  },
  {
    category: '필수',
    fields: '저장한 장소 정보, 링크 입력 정보, 장소와 연계된 처리 결과',
    purpose: '장소 저장 기능 제공, 장소 분류 및 상세 정보 제공',
    retention: '회원 탈퇴 시까지',
  },
  {
    category: '필수',
    fields: '서비스 이용 이력, 로그인 상태 유지에 필요한 정보',
    purpose: '서비스 운영, 오류 대응, 계정 보호, 부정 이용 방지',
    retention: '회원 탈퇴 시까지 또는 법령상 보관 기간까지',
  },
  {
    category: '선택',
    fields: '현재 위치 정보',
    purpose: '지도 화면에서 현재 위치 기반 탐색 기능 제공',
    retention: '동의 철회 또는 목적 달성 시까지',
  },
];

function AgreementCard({badge, label, summary}: AgreementItem) {
  const isRequired = badge === '필수';

  return (
    <View style={styles.agreementCard}>
      <View style={styles.agreementHeader}>
        <View
          style={[
            styles.badge,
            isRequired ? styles.requiredBadge : styles.optionalBadge,
          ]}>
          <Text
            style={[
              styles.badgeText,
              isRequired ? styles.requiredBadgeText : styles.optionalBadgeText,
            ]}>
            {badge}
          </Text>
        </View>
      </View>
      <Text style={styles.agreementLabel}>{label}</Text>
      <Text style={styles.agreementSummary}>{summary}</Text>
    </View>
  );
}

function ArticleCard({title, body, bullets}: ArticleSection) {
  return (
    <View style={styles.articleCard}>
      <Text style={styles.articleTitle}>{title}</Text>
      {body.map(paragraph => (
        <Text key={paragraph} style={styles.articleBody}>
          {paragraph}
        </Text>
      ))}
      {bullets?.map(item => (
        <View key={item} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function PrivacyInfoCard({category, fields, purpose, retention}: PrivacyRow) {
  const isRequired = category === '필수';

  return (
    <View style={styles.privacyCard}>
      <View style={styles.privacyHeader}>
        <View
          style={[
            styles.badge,
            isRequired ? styles.requiredBadge : styles.optionalBadge,
          ]}>
          <Text
            style={[
              styles.badgeText,
              isRequired ? styles.requiredBadgeText : styles.optionalBadgeText,
            ]}>
            {category}
          </Text>
        </View>
      </View>
      <View style={styles.privacyFieldGroup}>
        <Text style={styles.privacyLabel}>수집 항목</Text>
        <Text style={styles.privacyValue}>{fields}</Text>
      </View>
      <View style={styles.privacyFieldGroup}>
        <Text style={styles.privacyLabel}>이용 목적</Text>
        <Text style={styles.privacyValue}>{purpose}</Text>
      </View>
      <View style={styles.privacyFieldGroup}>
        <Text style={styles.privacyLabel}>보유 및 이용 기간</Text>
        <Text style={styles.privacyValue}>{retention}</Text>
      </View>
    </View>
  );
}

export function TermsAgreementScreen({onBack}: TermsAgreementScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.headerAction}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>약관 동의</Text>
        <View style={styles.headerAction} />
      </View>

      <ScrollView bounces={false} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>
            여기담 서비스 이용을 위해 아래 약관에 동의해주세요.
          </Text>
          <Text style={styles.heroMeta}>작성일: 2026-08-14</Text>
          <Text style={styles.heroMeta}>
            기준: 현재 프론트엔드 코드베이스에 구현된 회원가입, 소셜 로그인,
            프로필, 저장한 장소, 지도, 링크 입력, 회원탈퇴 흐름
          </Text>
          <Text style={styles.heroNotice}>
            이 문서는 제품 기획 및 화면 반영용 초안입니다. 실제 배포 전에는 법률
            검토와 운영 정책 확인이 필요합니다.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>1. 회원가입 화면 동의 항목 구성</Text>
          <Text style={styles.sectionTitle}>약관 안내 문구 예시</Text>
          <Text style={styles.sectionDescription}>
            회원가입 화면에서 아래 약관을 명확히 안내하는 구성을 기준으로
            정리했습니다.
          </Text>
          <View style={styles.agreementList}>
            {AGREEMENT_ITEMS.map(item => (
              <AgreementCard key={item.label} {...item} />
            ))}
          </View>
          <View style={styles.inlineNoticeBox}>
            <Text style={styles.inlineNoticeTitle}>
              필수 항목에 동의해야 회원가입을 진행할 수 있어요.
            </Text>
            <Text style={styles.inlineNoticeBody}>
              선택 항목은 동의하지 않아도 서비스 이용이 가능해요.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>2. 서비스 이용약관 초안</Text>
          <Text style={styles.sectionTitle}>서비스 이용약관</Text>
          <Text style={styles.sectionDescription}>
            현재 구현 범위를 기준으로 정리한 약관 문안입니다.
          </Text>
          <View style={styles.articleList}>
            {SERVICE_TERMS_SECTIONS.map(section => (
              <ArticleCard key={section.title} {...section} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            3. 개인정보 수집 및 이용 동의 초안
          </Text>
          <Text style={styles.sectionTitle}>개인정보 수집 및 이용</Text>
          <Text style={styles.sectionDescription}>
            회사는 다음과 같이 회원의 개인정보를 수집·이용합니다.
          </Text>
          <View style={styles.privacyList}>
            {PRIVACY_ROWS.map(row => (
              <PrivacyInfoCard
                key={`${row.category}-${row.fields}`}
                {...row}
              />
            ))}
          </View>
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>개인정보 수집 및 이용 안내</Text>
            <Text style={styles.noticeBody}>
              회사는 회원가입 및 서비스 제공을 위해 필요한 최소한의 개인정보만
              수집합니다. 회원은 필수 항목 수집 및 이용에 동의하지 않을 경우
              회원가입 및 핵심 기능 이용이 제한될 수 있습니다. 선택 항목은
              동의하지 않아도 기본적인 서비스 이용이 가능하며, 동의하지 않은
              경우 관련 기능만 제한될 수 있습니다.
            </Text>
          </View>
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>
              제3자 제공 및 처리위탁 관련 안내 문구 예시
            </Text>
            <Text style={styles.noticeBody}>
              회사는 서비스 제공을 위해 로그인 제공자, 지도 제공자, 백엔드
              인프라 제공자 등 외부 서비스를 연동할 수 있습니다. 다만
              개인정보를 제3자에게 제공하거나 외부 업체에 처리위탁하는
              경우에는 실제 운영 구조를 확정한 뒤 별도 고지 또는 동의를 받는
              문구로 정리하는 것이 필요합니다.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            4. 위치기반 서비스 이용 동의 초안
          </Text>
          <Text style={styles.sectionTitle}>위치기반 서비스 이용 동의</Text>
          <View style={styles.noticeCard}>
            <Text style={styles.noticeBody}>
              회사는 회원이 지도 화면에서 현재 위치를 기준으로 장소를 탐색할 수
              있도록 위치 정보를 이용할 수 있습니다. 위치 정보는 회원이
              기기에서 위치 권한을 허용한 경우에만 사용되며, 위치 권한은
              언제든지 기기 설정에서 변경할 수 있습니다. 회사는 위치기반 기능
              제공에 필요한 범위를 넘어 위치 정보를 이용하지 않습니다.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>5. 화면 반영용 짧은 문구 예시</Text>
          <Text style={styles.sectionTitle}>화면 반영 문구</Text>
          <View style={styles.copyCard}>
            <Text style={styles.copyLabel}>전체 동의 영역</Text>
            <Text style={styles.copyValue}>
              여기담 서비스 이용을 위해 아래 약관에 동의해주세요.
            </Text>
          </View>
          <View style={styles.copyCard}>
            <Text style={styles.copyLabel}>필수 항목 하단 안내</Text>
            <Text style={styles.copyValue}>
              필수 항목에 동의해야 회원가입을 진행할 수 있어요.
            </Text>
          </View>
          <View style={styles.copyCard}>
            <Text style={styles.copyLabel}>선택 항목 하단 안내</Text>
            <Text style={styles.copyValue}>
              선택 항목은 동의하지 않아도 서비스 이용이 가능해요.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    height: 72,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAction: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  back: {
    fontSize: 38,
    lineHeight: 38,
    color: '#1a1a2e',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    gap: 28,
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: '#f6f7ff',
    padding: 22,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e0e5ff',
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  heroMeta: {
    fontSize: 13,
    lineHeight: 20,
    color: '#58627a',
  },
  heroNotice: {
    fontSize: 13,
    lineHeight: 21,
    color: '#7c4d1c',
    backgroundColor: '#fff7ec',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  section: {
    gap: 14,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5c6fc8',
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  sectionDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: '#5f6473',
  },
  agreementList: {
    gap: 14,
  },
  agreementCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e7eaf4',
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 12,
  },
  agreementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  requiredBadge: {
    backgroundColor: '#eef2ff',
  },
  optionalBadge: {
    backgroundColor: '#effaf2',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  requiredBadgeText: {
    color: '#4457b2',
  },
  optionalBadgeText: {
    color: '#1f7b49',
  },
  agreementLabel: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  agreementSummary: {
    fontSize: 14,
    lineHeight: 22,
    color: '#4c5568',
  },
  inlineNoticeBox: {
    borderRadius: 18,
    backgroundColor: '#f8f9fd',
    padding: 16,
    gap: 6,
  },
  inlineNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  inlineNoticeBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#5f6473',
  },
  articleList: {
    gap: 12,
  },
  articleCard: {
    borderRadius: 20,
    backgroundColor: '#fbfbfd',
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#eceef5',
  },
  articleTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  articleBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#4c5568',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletMark: {
    marginTop: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#4457b2',
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: '#4c5568',
  },
  privacyList: {
    gap: 12,
  },
  privacyCard: {
    borderRadius: 22,
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: '#e7eaf4',
  },
  privacyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  privacyFieldGroup: {
    gap: 5,
  },
  privacyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7c8498',
  },
  privacyValue: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1a1a2e',
  },
  noticeCard: {
    borderRadius: 20,
    backgroundColor: '#f8f9fd',
    padding: 18,
    gap: 8,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  noticeBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#4c5568',
  },
  copyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eceef5',
    backgroundColor: '#ffffff',
    padding: 16,
    gap: 8,
  },
  copyLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7c8498',
  },
  copyValue: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: '#1a1a2e',
  },
});
