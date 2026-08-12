export interface RenderOptions {
  watermark?: string;
  includeHeaders?: boolean;
  includeFooters?: boolean;
  hospitalBranding?: Record<string, unknown>;
}

export interface IDocumentRenderer {
  /**
   * Identifies the type of renderer (e.g. 'pdf', 'thermal', 'label')
   */
  readonly format: string;

  /**
   * Render a document instance into a final output format (buffer).
   */
  render(payload: Record<string, unknown>, answers: Record<string, unknown>, options?: RenderOptions): Promise<Buffer>;
}
