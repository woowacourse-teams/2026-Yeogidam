import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(projectRoot, 'docs/terms-and-privacy.md');
const outputPath = resolve(
  projectRoot,
  'src/pages/my-page/terms-content.generated.ts',
);

const source = readFileSync(sourcePath, 'utf8');
const lines = source.replace(/\r\n/g, '\n').split('\n');
const blocks = [];
let paragraph = [];

function flushParagraph() {
  if (paragraph.length === 0) {
    return;
  }

  blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  paragraph = [];
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(cell => cell.trim());
}

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  const trimmed = line.trim();

  if (!trimmed) {
    flushParagraph();
    continue;
  }

  const heading = /^(#{1,2})\s+(.+)$/.exec(trimmed);
  if (heading) {
    flushParagraph();
    blocks.push({
      type: 'heading',
      level: heading[1].length,
      text: heading[2],
    });
    continue;
  }

  if (trimmed === '---') {
    flushParagraph();
    blocks.push({ type: 'divider' });
    continue;
  }

  if (trimmed.startsWith('|')) {
    flushParagraph();
    const tableLines = [];

    while (index < lines.length && lines[index].trim().startsWith('|')) {
      tableLines.push(lines[index]);
      index += 1;
    }

    index -= 1;
    const headers = parseTableRow(tableLines[0]);
    const rows = tableLines
      .slice(2)
      .map(parseTableRow)
      .filter(row => row.some(Boolean));
    blocks.push({ type: 'table', headers, rows });
    continue;
  }

  const orderedItem = /^\d+\.\s+(.+)$/.exec(trimmed);
  const unorderedItem = /^-\s+(.+)$/.exec(trimmed);
  if (orderedItem || unorderedItem) {
    flushParagraph();
    const ordered = Boolean(orderedItem);
    const items = [];

    while (index < lines.length) {
      const itemMatch = ordered
        ? /^\d+\.\s+(.+)$/.exec(lines[index].trim())
        : /^-\s+(.+)$/.exec(lines[index].trim());

      if (!itemMatch) {
        break;
      }

      items.push(itemMatch[1]);
      index += 1;
    }

    index -= 1;
    blocks.push({ type: 'list', ordered, items });
    continue;
  }

  paragraph.push(trimmed);
}

flushParagraph();

const serializedBlocks = JSON.stringify(blocks, null, 2);
const output = `// 이 파일은 docs/terms-and-privacy.md에서 자동 생성됩니다. 직접 수정하지 마세요.

export type TermsDocumentBlock =
  | { type: 'heading'; level: 1 | 2; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'divider' };

export const TERMS_DOCUMENT_BLOCKS: readonly TermsDocumentBlock[] = ${serializedBlocks};
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output);
