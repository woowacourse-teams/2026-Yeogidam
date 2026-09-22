import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  TERMS_DOCUMENT_BLOCKS,
  type TermsDocumentBlock,
} from './terms-content.generated';

type TermsAgreementScreenProps = { onBack: () => void };
type ContentBlock = Extract<
  TermsDocumentBlock,
  { type: 'paragraph' | 'list' | 'table' }
>;

type DocumentSubsection = {
  title: string;
  blocks: ContentBlock[];
};

type DocumentSection = {
  title: string;
  blocks: ContentBlock[];
  subsections: DocumentSubsection[];
};

type TermsDocument = {
  title: string;
  introduction: ContentBlock[];
  sections: DocumentSection[];
};

function buildTermsDocument(
  blocks: readonly TermsDocumentBlock[],
): TermsDocument {
  let title = '여기담 서비스 약관 및 개인정보 처리방침';
  let hasDocumentTitle = false;
  let currentSection: DocumentSection | null = null;
  let currentSubsection: DocumentSubsection | null = null;
  const introduction: ContentBlock[] = [];
  const sections: DocumentSection[] = [];

  blocks.forEach(block => {
    if (block.type === 'divider') {
      currentSubsection = null;
      return;
    }

    if (block.type === 'heading') {
      if (block.level === 1 && !hasDocumentTitle) {
        title = block.text;
        hasDocumentTitle = true;
        return;
      }

      if (block.level === 1) {
        currentSection = {
          title: block.text,
          blocks: [],
          subsections: [],
        };
        sections.push(currentSection);
        currentSubsection = null;
        return;
      }

      if (!currentSection) {
        return;
      }

      currentSubsection = { title: block.text, blocks: [] };
      currentSection.subsections.push(currentSubsection);
      return;
    }

    if (currentSubsection) {
      currentSubsection.blocks.push(block);
      return;
    }

    if (currentSection) {
      currentSection.blocks.push(block);
      return;
    }

    introduction.push(block);
  });

  return { title, introduction, sections };
}

const TERMS_DOCUMENT = buildTermsDocument(TERMS_DOCUMENT_BLOCKS);

function Paragraph({ text }: { text: string }) {
  return <Text style={styles.bodyText}>{text}</Text>;
}

function ListBlock({
  items,
  ordered,
}: Extract<ContentBlock, { type: 'list' }>) {
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={`${index}-${item}`} style={styles.listRow}>
          <Text style={styles.listMark}>{ordered ? `${index + 1}.` : '•'}</Text>
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function TableBlock({
  headers,
  rows,
}: Extract<ContentBlock, { type: 'table' }>) {
  return (
    <View style={styles.table}>
      {rows.map((row, rowIndex) => (
        <View key={`${rowIndex}-${row.join('-')}`} style={styles.tableRow}>
          {headers.map((header, columnIndex) => (
            <View key={header} style={styles.tableField}>
              <Text style={styles.tableLabel}>{header}</Text>
              <Text style={styles.tableValue}>{row[columnIndex] ?? '-'}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Content({ block }: { block: ContentBlock }) {
  if (block.type === 'paragraph') {
    return <Paragraph text={block.text} />;
  }

  if (block.type === 'list') {
    return <ListBlock {...block} />;
  }

  return <TableBlock {...block} />;
}

function ContentList({ blocks }: { blocks: readonly ContentBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <Content key={`${block.type}-${index}`} block={block} />
      ))}
    </>
  );
}

export function TermsAgreementScreen({ onBack }: TermsAgreementScreenProps) {
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
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>{TERMS_DOCUMENT.title}</Text>
          <ContentList blocks={TERMS_DOCUMENT.introduction} />
        </View>

        {TERMS_DOCUMENT.sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>

            {section.blocks.length > 0 ? (
              <View style={styles.sectionBody}>
                <ContentList blocks={section.blocks} />
              </View>
            ) : null}

            <View style={styles.cardList}>
              {section.subsections.map(subsection => (
                <View key={subsection.title} style={styles.card}>
                  <Text style={styles.cardTitle}>{subsection.title}</Text>
                  <ContentList blocks={subsection.blocks} />
                </View>
              ))}
            </View>
          </View>
        ))}
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
    gap: 32,
  },
  introCard: {
    borderRadius: 24,
    backgroundColor: '#f6f7ff',
    padding: 22,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e0e5ff',
  },
  introTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  sectionBody: {
    borderRadius: 20,
    backgroundColor: '#f8f9fd',
    padding: 18,
    gap: 12,
  },
  cardList: {
    gap: 12,
  },
  card: {
    borderRadius: 20,
    backgroundColor: '#fbfbfd',
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#eceef5',
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#4c5568',
  },
  list: {
    gap: 7,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listMark: {
    minWidth: 18,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    color: '#5368c4',
  },
  listText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: '#4c5568',
  },
  table: {
    gap: 10,
  },
  tableRow: {
    borderRadius: 16,
    padding: 14,
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e7eaf4',
  },
  tableField: {
    gap: 3,
  },
  tableLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#7c8498',
  },
  tableValue: {
    fontSize: 14,
    lineHeight: 21,
    color: '#1a1a2e',
  },
});
