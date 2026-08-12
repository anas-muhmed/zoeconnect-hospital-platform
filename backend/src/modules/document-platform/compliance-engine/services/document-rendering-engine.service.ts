import { Injectable, BadRequestException } from '@nestjs/common';
import { IDocumentRenderer, RenderOptions } from '../interfaces/document-renderer.interface';

@Injectable()
export class DocumentRenderingEngineService {
  private renderers = new Map<string, IDocumentRenderer>();

  registerRenderer(renderer: IDocumentRenderer) {
    this.renderers.set(renderer.format, renderer);
  }

  async render(
    format: string,
    payload: Record<string, unknown>,
    answers: Record<string, unknown>,
    options?: RenderOptions
  ): Promise<Buffer> {
    const renderer = this.renderers.get(format);
    if (!renderer) {
      throw new BadRequestException(`No renderer registered for format: ${format}`);
    }

    return renderer.render(payload, answers, options);
  }
}
