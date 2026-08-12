import { SceneGraph } from '../scene/scene-graph';
import { EventBus } from '../events/event-bus';

export class PageModel {
  public id: string;
  public name: string;
  public width: number;
  public height: number;
  public scene: SceneGraph;

  constructor(id: string, name: string, width: number, height: number, bus: EventBus) {
    this.id = id;
    this.name = name;
    this.width = width;
    this.height = height;
    this.scene = new SceneGraph(bus);
  }
}

export class DocumentModel {
  public id: string;
  public title: string;
  public metadata: any = {};
  public pageSettings: any = {};
  public styles: any = {};
  public variables: any = {};
  public rules: any = {};
  public workflows: any = {};
  public pages: PageModel[] = [];

  constructor(id: string, title: string) {
    this.id = id;
    this.title = title;
  }

  addPage(page: PageModel) {
    this.pages.push(page);
  }

  getPage(id: string): PageModel | undefined {
    return this.pages.find((p) => p.id === id);
  }
}
