import { OcrPage, LayoutElement } from '../entities/import-job.entity';

/**
 * LayoutAnalyzer — converts raw OCR word lists into structured layout elements.
 *
 * Strategy:
 *  1. Cluster words by Y-proximity into logical lines.
 *  2. Detect labels (text followed by a blank gap / underline).
 *  3. Detect input boxes (isolated blank areas or form field patterns).
 *  4. Detect checkboxes (small squares, "[ ]", "○" patterns).
 *  5. Detect tables (grid of words with consistent column alignment).
 *  6. Detect signature areas (large blank rectangles at the bottom, near "Signature:" text).
 */
export class LayoutAnalyzer {
  analyze(pages: OcrPage[]): LayoutElement[] {
    const elements: LayoutElement[] = [];
    let idSeq = 0;

    const nextId = () => `le-${++idSeq}`;

    for (const page of pages) {
      // Step 1: Cluster words into lines (words within 8px vertical proximity)
      const lines = this.clusterIntoLines(page.words, page.pageIndex);

      for (const line of lines) {
        const lineText = line.map((w) => w.text).join(' ');
        const bb = this.unionBB(line.map((w) => w.boundingBox));

        // Step 2: Detect titles and section headers first (strong structural signals)
        if (this.isTitle(lineText, bb, page)) {
          elements.push({ id: nextId(), kind: 'title', text: lineText, boundingBox: bb, pageIndex: page.pageIndex });
        } else if (this.isSectionHeader(lineText, bb)) {
          elements.push({ id: nextId(), kind: 'section_header', text: lineText, boundingBox: bb, pageIndex: page.pageIndex });
        } else if (this.isLabel(lineText, line)) {
          // Detect labels (ends with ":", contains "name", "date", etc.)
          // Split label from associated field box if on same line
          const colonIdx = lineText.indexOf(':');
          const labelText = colonIdx >= 0 ? lineText.slice(0, colonIdx + 1) : lineText;

          // Detect checkboxes / radio options on the same line
          if (this.hasCheckboxPattern(lineText)) {
            const options = this.extractCheckboxOptions(lineText);
            options.forEach((opt) => {
              elements.push({
                id: nextId(),
                kind: 'radio_option',
                text: opt,
                boundingBox: { ...bb, width: bb.width / Math.max(options.length, 1) },
                pageIndex: page.pageIndex,
              });
            });
          } else {
            elements.push({
              id: nextId(),
              kind: 'label',
              text: labelText,
              boundingBox: bb,
              pageIndex: page.pageIndex,
            });

            // Detect field box to the right of the label
            const labelWidth = bb.width * 0.35;
            elements.push({
              id: nextId(),
              kind: 'field_box',
              text: '',
              boundingBox: {
                x: bb.x + labelWidth,
                y: bb.y,
                width: bb.width - labelWidth,
                height: bb.height,
              },
              pageIndex: page.pageIndex,
            });
          }
        } else if (this.isSignatureArea(lineText)) {
          elements.push({ id: nextId(), kind: 'signature_area', text: lineText, boundingBox: bb, pageIndex: page.pageIndex });
        } else if (lineText.trim()) {
          elements.push({ id: nextId(), kind: 'label', text: lineText, boundingBox: bb, pageIndex: page.pageIndex });
        }
      }
    }

    return elements;
  }

  private clusterIntoLines(
    words: OcrPage['words'],
    pageIndex: number,
    yThreshold = 10,
  ): OcrPage['words'][] {
    if (!words.length) return [];
    const sorted = [...words].sort((a, b) => a.boundingBox.y - b.boundingBox.y);
    const lines: OcrPage['words'][] = [];
    let currentLine: OcrPage['words'] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const w = sorted[i];
      const lastY = currentLine[currentLine.length - 1].boundingBox.y;
      if (Math.abs(w.boundingBox.y - lastY) <= yThreshold) {
        currentLine.push(w);
      } else {
        lines.push(currentLine.sort((a, b) => a.boundingBox.x - b.boundingBox.x));
        currentLine = [w];
      }
    }
    if (currentLine.length) lines.push(currentLine.sort((a, b) => a.boundingBox.x - b.boundingBox.x));
    return lines;
  }

  private unionBB(boxes: Array<{ x: number; y: number; width: number; height: number }>) {
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const x2 = Math.max(...boxes.map((b) => b.x + b.width));
    const y2 = Math.max(...boxes.map((b) => b.y + b.height));
    return { x, y, width: x2 - x, height: y2 - y };
  }

  private isLabel(text: string, words: OcrPage['words']): boolean {
    const t = text.trim();
    return (
      t.endsWith(':') ||
      /^(patient|name|date|age|gender|sex|department|ward|diagnosis|doctor|nurse|signature|id|number|phone|address|weight|height|blood|time|from|to)\b/i.test(t) ||
      (words.length <= 5 && t.length < 60)
    );
  }

  private isTitle(text: string, bb: ReturnType<typeof this.unionBB>, page: OcrPage): boolean {
    return (
      bb.y < page.imageHeight * 0.15 &&
      bb.height >= 20 &&
      text.length > 3 &&
      text === text.toUpperCase()
    );
  }

  private isSectionHeader(text: string, bb: ReturnType<typeof this.unionBB>): boolean {
    return (
      text === text.toUpperCase() &&
      text.length > 3 &&
      text.length < 60 &&
      bb.height >= 14
    );
  }

  private isSignatureArea(text: string): boolean {
    return /signature|sign here|authoriz|verified/i.test(text);
  }

  private hasCheckboxPattern(text: string): boolean {
    return /(\[\s*\]|\(\s*\)|○|□|■|✓|✗|M\s*\/\s*F|yes\s*\/\s*no)/i.test(text);
  }

  private extractCheckboxOptions(text: string): string[] {
    // "M / F" → ["M", "F"]
    const slashSplit = text.match(/(\w+)\s*\/\s*(\w+)/);
    if (slashSplit) return [slashSplit[1], slashSplit[2]];

    // "[ ] Yes  [ ] No" → ["Yes", "No"]
    const boxMatch = text.match(/\[\s*\]\s*(\w+)/g);
    if (boxMatch) return boxMatch.map((m) => m.replace(/\[\s*\]\s*/, '').trim());

    return [text];
  }
}
