/**
 * Canvas-based display layout types.
 * All positions/sizes are in % (0-100) of the canvas container.
 * All font sizes are in em units where 1em = 1% of canvas width.
 * There are no enforced min/max limits on any value.
 */

export type ElementType =
  | 'box'
  | 'text'
  | 'clock'
  | 'counter'
  | 'counter-grid'
  | 'location-name'
  | 'recent-bar'
  | 'image'
  | 'video'
  | 'slideshow'
  | 'marquee';

export interface ElementConfig {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  zIndex?: number;
  paddingX?: number;
  paddingY?: number;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase';
  fontFamily?: string;
  text?: string;
  locationCode?: string;
  counterNumber?: number;
  showCounterName?: boolean;
  showNowServing?: boolean;
  counterNameColor?: string;
  counterNameFontSize?: number;
  tokenColor?: string;
  tokenFontSize?: number;
  glowEnabled?: boolean;
  glowColor?: string;
  flashColor?: string;
  nowServingColor?: string;
  nowServingFontSize?: number;
  countersPerRow?: number;
  counterBorderColor?: string;
  maxItems?: number;
  labelText?: string;
  labelColor?: string;
  labelFontSize?: number;
  tokenRecentColor?: string;
  tokenRecentFontSize?: number;
  metaColor?: string;
  metaFontSize?: number;
  clockFormat?: '12h' | '24h';
  src?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  objectPosition?: string;
  videoAutoplay?: boolean;
  videoLoop?: boolean;
  videoMuted?: boolean;
  videoControls?: boolean;
  slideshowImages?: string[];
  slideshowInterval?: number;
  slideshowTransition?: 'fade' | 'slide';
  showSlideshowIndicators?: boolean;
  marqueeSpeed?: number;
  separatorText?: string;
}

export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  config: ElementConfig;
}

export type CanvasRatio = '16:9' | '9:16' | '4:3' | '3:4' | 'custom';

export interface DisplayLayout {
  version: 2;
  backgroundColor: string;
  elements: CanvasElement[];
  /** Canvas aspect ratio. Defaults to '16:9' if absent. */
  canvasRatio?: CanvasRatio;
  /** Used when canvasRatio === 'custom' */
  customWidth?: number;
  customHeight?: number;
}

export const ELEMENT_DEFAULTS: Record<ElementType, Partial<ElementConfig>> = {
  box: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderRadius: 0, opacity: 1, zIndex: 1 },
  text: { text: 'Label text', color: '#ffffff', fontSize: 1.4, fontWeight: 700, textAlign: 'left', letterSpacing: 0, textTransform: 'none', zIndex: 2 },
  clock: { color: 'rgba(255,255,255,0.45)', fontSize: 1.4, fontWeight: 400, textAlign: 'center', clockFormat: '12h', zIndex: 2 },
  'location-name': { locationCode: '', color: '#ffffff', fontSize: 1.0, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1, paddingX: 2, zIndex: 1 },
  counter: { locationCode: '', counterNumber: 0, showCounterName: true, showNowServing: true, counterNameColor: '#ffffff', counterNameFontSize: 1.8, tokenColor: '#FFD700', tokenFontSize: 12, nowServingColor: 'rgba(255,255,255,0.5)', nowServingFontSize: 1.1, glowEnabled: true, glowColor: '#FFD700', flashColor: 'rgba(255,215,0,0.35)', backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, zIndex: 1 },
  'counter-grid': { locationCode: '', countersPerRow: 5, showCounterName: true, showNowServing: true, counterNameColor: '#ffffff', counterNameFontSize: 1.8, tokenColor: '#FFD700', tokenFontSize: 10, nowServingColor: 'rgba(255,255,255,0.5)', nowServingFontSize: 1.1, glowEnabled: true, glowColor: '#FFD700', flashColor: 'rgba(255,215,0,0.35)', counterBorderColor: 'rgba(255,255,255,0.08)', zIndex: 1 },
  'recent-bar': { locationCode: '', maxItems: 6, labelText: 'RECENT:', labelColor: 'rgba(255,255,255,0.4)', labelFontSize: 1.1, tokenRecentColor: '#FFD700', tokenRecentFontSize: 2.4, metaColor: 'rgba(255,255,255,0.4)', metaFontSize: 1.0, backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 2, zIndex: 1 },
  image: { src: '', objectFit: 'cover', objectPosition: 'center center', opacity: 1, borderRadius: 0, borderWidth: 0, zIndex: 1 },
  video: { src: '', objectFit: 'cover', videoAutoplay: true, videoLoop: true, videoMuted: true, videoControls: false, opacity: 1, borderRadius: 0, zIndex: 1 },
  slideshow: { slideshowImages: [], slideshowInterval: 5, slideshowTransition: 'fade', showSlideshowIndicators: true, objectFit: 'cover', objectPosition: 'center center', opacity: 1, borderRadius: 0, zIndex: 1 },
  marquee: { text: 'Welcome to our hospital. Your health is our priority.', separatorText: '     -     ', color: '#ffffff', fontSize: 1.4, fontWeight: 600, marqueeSpeed: 3, backgroundColor: 'rgba(0,0,0,0.5)', letterSpacing: 1, zIndex: 2 },
};

export const ELEMENT_LABELS: Record<ElementType, string> = {
  box:             'Shape / Box',
  text:            'Text Label',
  clock:           'Live Clock',
  'location-name': 'Location Name',
  counter:         'Counter (single)',
  'counter-grid':  'Counter Grid',
  'recent-bar':    'Recent Calls Bar',
  image:           'Image',
  video:           'Video / YouTube',
  slideshow:       'Image Slideshow',
  marquee:         'Scrolling Ticker',
};

export const DEFAULT_LAYOUT: DisplayLayout = {
  version: 2,
  backgroundColor: '#08111f',
  elements: [
    { id: 'topbar-bg', type: 'box', x: 0, y: 0, w: 100, h: 8, config: { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1, zIndex: 1 } },
    { id: 'title', type: 'text', x: 2, y: 1.5, w: 28, h: 5, config: { text: 'Token Queue Display', color: '#ffffff', fontSize: 1.4, fontWeight: 700, letterSpacing: 1, zIndex: 2 } },
    { id: 'clock', type: 'clock', x: 40, y: 1.5, w: 20, h: 5, config: { color: 'rgba(255,255,255,0.45)', fontSize: 1.4, textAlign: 'center', clockFormat: '12h', zIndex: 2 } },
    { id: 'loc-header', type: 'location-name', x: 0, y: 8, w: 100, h: 6, config: { locationCode: '', color: '#ffffff', fontSize: 1.0, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.06)', borderWidth: 1, paddingX: 2, zIndex: 1 } },
    { id: 'counter-grid', type: 'counter-grid', x: 0, y: 14, w: 100, h: 71, config: { locationCode: '', countersPerRow: 5, showCounterName: true, showNowServing: true, tokenColor: '#FFD700', tokenFontSize: 10, counterNameColor: '#ffffff', counterNameFontSize: 1.8, nowServingColor: 'rgba(255,255,255,0.5)', nowServingFontSize: 1.1, glowEnabled: true, glowColor: '#FFD700', flashColor: 'rgba(255,215,0,0.35)', counterBorderColor: 'rgba(255,255,255,0.08)', zIndex: 1 } },
    { id: 'recent-bar', type: 'recent-bar', x: 0, y: 85, w: 100, h: 15, config: { locationCode: '', maxItems: 6, labelText: 'RECENT:', labelColor: 'rgba(255,255,255,0.4)', labelFontSize: 1.1, tokenRecentColor: '#FFD700', tokenRecentFontSize: 2.4, metaColor: 'rgba(255,255,255,0.4)', metaFontSize: 1.0, backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 2, zIndex: 1 } },
  ],
};
