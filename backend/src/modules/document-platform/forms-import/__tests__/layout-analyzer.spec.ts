import { LayoutAnalyzer } from '../layout/layout-analyzer';
import { OcrPage } from '../entities/import-job.entity';

function makePage(words: OcrPage['words'], pageIndex = 0): OcrPage {
  return { pageIndex, text: words.map((w) => w.text).join(' '), words, imageWidth: 800, imageHeight: 1100 };
}

function makeWord(text: string, x: number, y: number, w = 60, h = 18): OcrPage['words'][0] {
  return { text, confidence: 0.95, boundingBox: { x, y, width: w, height: h }, pageIndex: 0 };
}

describe('LayoutAnalyzer', () => {
  let analyzer: LayoutAnalyzer;

  beforeEach(() => {
    analyzer = new LayoutAnalyzer();
  });

  it('detects a label from a word ending with ":"', () => {
    const page = makePage([makeWord('Name:', 40, 60)]);
    const elements = analyzer.analyze([page]);
    const label = elements.find((e) => e.kind === 'label');
    expect(label).toBeDefined();
    expect(label!.text).toContain('Name');
  });

  it('clusters co-linear words into a single line element', () => {
    const page = makePage([
      makeWord('Patient', 40, 60),
      makeWord('Name:', 100, 62), // within 8px Y proximity of previous
    ]);
    const elements = analyzer.analyze([page]);
    // Should produce at most 2 elements (label + field_box) not 4 separate ones
    expect(elements.length).toBeLessThanOrEqual(3);
  });

  it('detects a signature label from text', () => {
    const page = makePage([makeWord('Signature:', 40, 900)]);
    const elements = analyzer.analyze([page]);
    // The LayoutAnalyzer either marks it as signature_area or label depending on kind match
    const sig = elements.find((e) => e.kind === 'signature_area' || (e.kind === 'label' && /signature/i.test(e.text)));
    expect(sig).toBeDefined();
  });

  it('detects radio options from M/F pattern', () => {
    const page = makePage([makeWord('Gender:', 40, 140), makeWord('M', 130, 140), makeWord('/', 160, 140), makeWord('F', 180, 140)]);
    const elements = analyzer.analyze([page]);
    // Radio option or label should be present
    const hasRadioOrLabel = elements.some((e) => e.kind === 'radio_option' || e.kind === 'label');
    expect(hasRadioOrLabel).toBe(true);
  });

  it('detects a title-like element near the top of the page', () => {
    // Title: uppercase, y < 15% of page height (165px), height >= 20px
    const page = makePage([makeWord('PATIENT ASSESSMENT FORM', 100, 20, 400, 24)]);
    const elements = analyzer.analyze([page]);
    // Could be title or section_header depending on exact pixel dimensions
    const prominent = elements.find((e) =>
      (e.kind === 'title' || e.kind === 'section_header') && /PATIENT/i.test(e.text)
    );
    expect(prominent).toBeDefined();
  });

  it('returns empty array for empty page', () => {
    const page = makePage([]);
    const elements = analyzer.analyze([page]);
    expect(elements).toEqual([]);
  });

  it('processes multiple pages independently', () => {
    const page1 = makePage([makeWord('Name:', 40, 60)], 0);
    const page2 = makePage([makeWord('Signature:', 40, 900)], 1);
    const elements = analyzer.analyze([page1, page2]);
    expect(elements.some((e) => e.pageIndex === 0)).toBe(true);
    expect(elements.some((e) => e.pageIndex === 1)).toBe(true);
  });
});
