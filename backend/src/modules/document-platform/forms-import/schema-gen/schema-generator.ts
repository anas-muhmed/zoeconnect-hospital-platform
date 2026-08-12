import { Injectable } from '@nestjs/common';
import { ClassifiedField } from '../entities/import-job.entity';
import {
  FormSchema,
  ComponentNode,
  PageNode,
  CURRENT_SCHEMA_VERSION,
} from '@hdsp/form-schema';

/**
 * SchemaGenerator — converts classified fields into a valid FormSchema.
 *
 * Uses the real FormSchema/ComponentNode/PageNode types from @hdsp/form-schema
 * so the generated schema is immediately parseable by isFormSchema() and
 * loadable into the Canvas Engine via loadFormSchemaIntoEngine().
 *
 * SCALE: PDF pixels → canvas units. We keep 1:1 pixel mapping and enforce
 * minimum component sizes so users see a good starting point in the designer.
 */
@Injectable()
export class SchemaGenerator {
  private readonly CANVAS_SCALE = 1.0;
  private readonly PAGE_HEIGHT  = 1100;
  private readonly PAGE_MARGIN  = 40;

  generate(
    classifiedFields: ClassifiedField[],
    documentTitle: string,
    pageCount: number,
  ): FormSchema {
    const formId = `imported-form-${Date.now()}`;

    // Group fields by page
    const fieldsByPage = new Map<number, ClassifiedField[]>();
    classifiedFields.forEach((f) => {
      if (!fieldsByPage.has(f.pageIndex)) fieldsByPage.set(f.pageIndex, []);
      fieldsByPage.get(f.pageIndex)!.push(f);
    });

    // Build pages with embedded components
    const pages: PageNode[] = Array.from({ length: Math.max(pageCount, 1) }, (_, pi) => {
      const pageFields = fieldsByPage.get(pi) ?? [];
      const yOffset = pi * (this.PAGE_HEIGHT + this.PAGE_MARGIN);

      const components: ComponentNode[] = pageFields.map((field, idx): ComponentNode => {
        const { x, y, width, height } = field.boundingBox;

        const w = Math.max(width * this.CANVAS_SCALE, this.minWidth(field.componentType));
        const h = Math.max(height * this.CANVAS_SCALE, this.minHeight(field.componentType));

        return {
          id: field.id,
          type: field.componentType,
          fieldKey: field.fieldKey,
          geometry: {
            x: Math.round(x * this.CANVAS_SCALE),
            y: Math.round(y * this.CANVAS_SCALE + yOffset),
            w: Math.round(w),
            h: Math.round(h),
            z: idx,
            pageId: `page-${pi + 1}`,
          },
          props: {
            label: field.label,
            ...field.suggestedProps,
            // Embed confidence metadata for the Review Mode overlay
            _importMeta: {
              confidence: field.confidence,
              needsReview: field.needsReview,
              classifierSource: field.classifierSource,
              alternatives: field.alternativeSuggestions,
            },
          },
          validation: [],
          logic: {},
          permissions: { visibleTo: [], editableBy: [] },
          audit: { trackChanges: true },
          children: undefined,
        };
      });

      return {
        id: `page-${pi + 1}`,
        size: 'A4',
        orientation: 'portrait',
        components,
        header: null,
        footer: null,
        watermark: null,
        backgroundColor: null,
        backgroundImageAssetId: null,
      };
    });

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      formId,
      category: 'clinical',
      pages,
      dataSources: [],
    };
  }

  private minWidth(type: string): number {
    const map: Record<string, number> = {
      textbox: 200, textarea: 200, label: 80, checkbox: 160, radio: 200,
      dropdown: 180, signature: 260, table: 400, 'repeat-section': 360,
      body_diagram: 280, dental_chart: 360, burn_assessment: 360,
      svg_annotation_layer: 280,
    };
    return map[type] ?? 160;
  }

  private minHeight(type: string): number {
    const map: Record<string, number> = {
      textbox: 44, textarea: 100, label: 24, checkbox: 28, radio: 80,
      dropdown: 44, signature: 100, table: 160, 'repeat-section': 120,
      body_diagram: 320, dental_chart: 260, burn_assessment: 400,
      svg_annotation_layer: 300,
    };
    return map[type] ?? 40;
  }
}
