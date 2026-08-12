import type { FormSchema, ComponentNode } from '@hdsp/form-schema';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

/**
 * formPdfRenderer — the Wave-1 pdfRenderer callback registered on the 'form'
 * DocumentTypeDefinition (Milestone 4). Implements ADR-002's `pdfRenderer`
 * contract: receives the document version's payload (a FormSchema) and the
 * instance's answers, returns a PDF Buffer.
 *
 * Architecture constraints (do NOT violate):
 * 1. This function is imported and registered in FormsDesignerModule.onModuleInit()
 *    as the `pdfRenderer` on the 'form' DocumentTypeDefinition. It is Forms-module
 *    code, NOT Document Platform code — it lives here because it is specific to
 *    the FormSchema shape. The generic PdfEngineService (document-engine/pdf/)
 *    dispatches to it but has no knowledge of it.
 * 2. This file must not import from canvas-engine[-react] — the PDF renderer is
 *    on the Renderer side of ADR-003's Builder/Renderer boundary.
 * 3. pdfmake operates in Node.js without a browser binary — correct for a
 *    backend service. Puppeteer/Chromium is explicitly avoided to keep the
 *    Docker image lightweight (no external binary dependency).
 *
 * Wave 1 rendering: simple top-down page layout, one component per row,
 * showing label + answer value. Full pixel-accurate canvas layout is a
 * Milestone 7 enhancement (the architecture calls for it at Phase 6's
 * production-readiness phase, not as a Milestone 4 requirement).
 */

/**
 * Formats a single answer value for display in the PDF.
 * Handles booleans (Checkbox), arrays (Radio/Dropdown multi-select),
 * and plain string/number values.
 */
function formatAnswerValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Renders a single Wave-1 component node as a pdfmake content block.
 * Unknown types are rendered as a placeholder row, matching ADR-005's
 * "never crash on an unregistered type" discipline.
 */
function renderComponent(
  node: ComponentNode,
  answers: Record<string, unknown>,
): Content {
  const answer = answers[node.fieldKey];
  const answerText = formatAnswerValue(answer);

  switch (node.type) {
    case 'label': {
      const props = node.props as { text?: string; variant?: string };
      const fontSize = props.variant === 'heading' ? 14 : props.variant === 'subheading' ? 12 : 10;
      return { text: props.text ?? '', fontSize, bold: props.variant === 'heading', margin: [0, 4, 0, 4] };
    }
    case 'textbox':
    case 'textarea': {
      const props = node.props as { label?: string };
      return {
        columns: [
          { text: (props.label ?? node.fieldKey) + ':', bold: true, width: 160, fontSize: 10 },
          { text: answerText, width: '*', fontSize: 10 },
        ],
        margin: [0, 3, 0, 3],
      };
    }
    case 'checkbox': {
      const props = node.props as { label?: string };
      return {
        columns: [
          { text: (props.label ?? node.fieldKey) + ':', bold: true, width: 160, fontSize: 10 },
          { text: answerText, width: '*', fontSize: 10 },
        ],
        margin: [0, 3, 0, 3],
      };
    }
    case 'radio':
    case 'dropdown': {
      const props = node.props as { label?: string };
      return {
        columns: [
          { text: (props.label ?? node.fieldKey) + ':', bold: true, width: 160, fontSize: 10 },
          { text: answerText, width: '*', fontSize: 10 },
        ],
        margin: [0, 3, 0, 3],
      };
    }
    default: {
      if (node.children && node.children.length > 0) {
        const childContent = node.children
          .slice()
          .sort((a, b) => a.geometry.z - b.geometry.z)
          .map(child => renderComponent(child, answers));
          
        return {
          stack: [
            { text: (node.props as any).title || node.type.toUpperCase(), bold: true, fontSize: 11, margin: [0, 4, 0, 4] },
            { stack: childContent, margin: [8, 0, 0, 0] }
          ],
          margin: [0, 4, 0, 4]
        };
      }
      return {
        text: `[${node.type} — ${node.fieldKey}: ${answerText}]`,
        fontSize: 9,
        color: '#888888',
        margin: [0, 2, 0, 2],
      };
    }
  }
}

/**
 * Generates a pdfmake document definition for a FormSchema + answers.
 * Exported for unit-testability without requiring a real pdfmake instance.
 */
export function buildFormDocDefinition(
  schema: FormSchema,
  answers: Record<string, unknown>,
): TDocumentDefinitions {
  const content: Content[] = [];

  for (let pi = 0; pi < schema.pages.length; pi++) {
    const page = schema.pages[pi];

    if (pi > 0) {
      content.push({ text: '', pageBreak: 'before' });
    }

    // Sort components by z-index (top to bottom reading order) within the page.
    const sorted = [...page.components].sort((a, b) => a.geometry.z - b.geometry.z);
    for (const node of sorted) {
      content.push(renderComponent(node, answers));
    }
  }

  return {
    content,
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    info: {
      title: `Form — ${schema.formId}`,
      creator: 'ZoeConnect Healthcare Document Studio',
    },
  };
}

/**
 * The `pdfRenderer` callback registered on the 'form' DocumentTypeDefinition.
 * Called by PdfEngineService.generatePdf() — never called directly by controller
 * or application-service code (always go through PdfEngineService, per ADR-002).
 */
export async function formPdfRenderer(
  payload: unknown,
  answers: Record<string, unknown>,
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfmake = require('pdfmake');

  pdfmake.fonts = {
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  };

  const docDef = buildFormDocDefinition(payload as FormSchema, answers);
  const pdf = pdfmake.createPdf(docDef);
  
  return await pdf.getBuffer();
}
