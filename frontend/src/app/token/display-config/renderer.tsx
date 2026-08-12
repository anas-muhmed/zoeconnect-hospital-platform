'use client';
import { useState, useEffect } from 'react';
import { CanvasElement, ElementConfig } from './types';

const MOCK_LOCS = [
  { code: 'LOC1', label: 'General Billing', counters: [
    { id: 'c1', counterNumber: 1, currentToken: 53 },
    { id: 'c2', counterNumber: 2, currentToken: 25 },
    { id: 'c3', counterNumber: 3, currentToken: 89 },
    { id: 'c4', counterNumber: 4, currentToken: 88 },
    { id: 'c5', counterNumber: 5, currentToken: null },
    { id: 'c6', counterNumber: 6, currentToken: 97 },
  ]},
  { code: 'LOC2', label: 'Pharmacy Billing', counters: [
    { id: 'p1', counterNumber: 1, currentToken: 12 },
    { id: 'p2', counterNumber: 2, currentToken: null },
  ]},
];
const MOCK_RECENT = [
  { tokenNumber: 53, locationLabel: 'General Billing', locationCode: 'LOC1', counterNumber: 1 },
  { tokenNumber: 52, locationLabel: 'General Billing', locationCode: 'LOC1', counterNumber: 1 },
  { tokenNumber: 51, locationLabel: 'General Billing', locationCode: 'LOC1', counterNumber: 2 },
  { tokenNumber: 50, locationLabel: 'General Billing', locationCode: 'LOC1', counterNumber: 1 },
  { tokenNumber: 49, locationLabel: 'General Billing', locationCode: 'LOC1', counterNumber: 3 },
  { tokenNumber: 48, locationLabel: 'General Billing', locationCode: 'LOC1', counterNumber: 1 },
];

export function RenderElement({
  el,
  locations = MOCK_LOCS,
  recentCalls = MOCK_RECENT,
  flashId = null,
}: {
  el: CanvasElement;
  locations?: typeof MOCK_LOCS;
  recentCalls?: typeof MOCK_RECENT;
  flashId?: string | null;
}) {
  const c = el.config;

  const resolveLocation = (code?: string) => {
    if (!code) return locations[0];
    return locations.find((l) => l.code === code) ?? locations[0];
  };

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: c.backgroundColor ?? 'transparent',
    border: c.borderWidth ? `${c.borderWidth}px solid ${c.borderColor ?? 'transparent'}` : 'none',
    borderRadius: c.borderRadius ? `${c.borderRadius}px` : 0,
    opacity: c.opacity ?? 1,
    boxSizing: 'border-box',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (el.type === 'box') return <div style={containerStyle} />;

  if (el.type === 'text') {
    return (
      <div style={{ ...containerStyle, justifyContent: c.textAlign === 'right' ? 'flex-end' : c.textAlign === 'center' ? 'center' : 'flex-start', paddingLeft: `${c.paddingX ?? 0}%`, paddingRight: `${c.paddingX ?? 0}%` }}>
        <span style={{ color: c.color ?? '#fff', fontSize: `${c.fontSize ?? 1}em`, fontWeight: c.fontWeight ?? 400, letterSpacing: c.letterSpacing ? `${c.letterSpacing}px` : undefined, textTransform: (c.textTransform ?? 'none') as any, fontFamily: c.fontFamily ?? 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.2 }}>
          {c.text ?? ''}
        </span>
      </div>
    );
  }

  if (el.type === 'clock') return <LiveClockEl config={c} style={containerStyle} />;

  if (el.type === 'location-name') {
    const loc = resolveLocation(c.locationCode);
    return (
      <div style={{ ...containerStyle, justifyContent: 'flex-start', paddingLeft: `${c.paddingX ?? 1}%`, paddingRight: `${c.paddingX ?? 1}%` }}>
        <span style={{ color: c.color ?? '#fff', fontSize: `${c.fontSize ?? 1}em`, fontWeight: c.fontWeight ?? 700, letterSpacing: c.letterSpacing ? `${c.letterSpacing}px` : '2px', textTransform: (c.textTransform ?? 'uppercase') as any }}>
          {loc?.label ?? 'Location Name'}
        </span>
      </div>
    );
  }

  if (el.type === 'counter') {
    const loc = resolveLocation(c.locationCode);
    const slot = c.counterNumber ? loc?.counters.find((ct) => ct.counterNumber === c.counterNumber) : loc?.counters[0];
    const isFlashing = flashId === slot?.id;
    return (
      <div style={{ ...containerStyle, flexDirection: 'column', animation: isFlashing ? 'tokenFlash 2.2s ease-in-out' : 'none' }}>
        {c.showCounterName !== false && (
          <span style={{ color: c.counterNameColor ?? '#fff', fontSize: `${c.counterNameFontSize ?? 1.8}em`, fontWeight: 800, letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '0.2em' }}>
            Counter {slot?.counterNumber ?? 1}
          </span>
        )}
        <span style={{ color: slot?.currentToken ? (c.tokenColor ?? '#FFD700') : 'rgba(255,255,255,0.12)', fontSize: `${c.tokenFontSize ?? 12}em`, fontWeight: 900, lineHeight: 1, textShadow: (slot?.currentToken && c.glowEnabled !== false) ? `0 0 40px ${c.glowColor ?? c.tokenColor ?? '#FFD700'}99, 0 4px 24px rgba(0,0,0,0.7)` : 'none', transition: 'all 0.3s ease', fontVariantNumeric: 'tabular-nums' }}>
          {slot?.currentToken ?? '—'}
        </span>
        {slot?.currentToken && c.showNowServing !== false && (
          <span style={{ color: c.nowServingColor ?? 'rgba(255,255,255,0.5)', fontSize: `${c.nowServingFontSize ?? 1.1}em`, fontWeight: 700, letterSpacing: '4px', textTransform: 'uppercase', marginTop: '0.2em' }}>
            Now Serving
          </span>
        )}
      </div>
    );
  }

  if (el.type === 'counter-grid') {
    const loc = resolveLocation(c.locationCode);
    const counters = loc?.counters ?? [];
    const perRow = c.countersPerRow ?? 5;
    return (
      <div style={{ ...containerStyle, flexWrap: 'wrap', alignContent: 'flex-start', alignItems: 'stretch', justifyContent: 'flex-start' }}>
        {counters.map((slot) => {
          if (!slot) return null;
          const isFlashing = flashId === slot.id;
          return (
            <div key={slot.id} style={{ flex: `1 1 ${100 / perRow}%`, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${c.counterBorderColor ?? 'rgba(255,255,255,0.08)'}`, borderBottom: `1px solid ${c.counterBorderColor ?? 'rgba(255,255,255,0.08)'}`, overflow: 'hidden', animation: isFlashing ? 'tokenFlash 2.2s ease-in-out' : 'none' }}>
              {c.showCounterName !== false && (
                <span style={{ color: c.counterNameColor ?? '#fff', fontSize: `${c.counterNameFontSize ?? 1.8}em`, fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase' }}>
                  Counter {slot.counterNumber}
                </span>
              )}
              <span style={{ color: slot.currentToken ? (c.tokenColor ?? '#FFD700') : 'rgba(255,255,255,0.12)', fontSize: `${c.tokenFontSize ?? 10}em`, fontWeight: 900, lineHeight: 1, textShadow: (slot.currentToken && c.glowEnabled !== false) ? `0 0 40px ${c.glowColor ?? c.tokenColor ?? '#FFD700'}99` : 'none', fontVariantNumeric: 'tabular-nums' }}>
                {slot.currentToken ?? '—'}
              </span>
              {slot.currentToken && c.showNowServing !== false && (
                <span style={{ color: c.nowServingColor ?? 'rgba(255,255,255,0.5)', fontSize: `${c.nowServingFontSize ?? 1.1}em`, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase' }}>
                  Now Serving
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (el.type === 'recent-bar') {
    const items = recentCalls.filter((r) => !c.locationCode || r.locationCode === c.locationCode).slice(0, c.maxItems ?? 999);
    return (
      <div style={{ ...containerStyle, justifyContent: 'flex-start', gap: '2em', paddingLeft: '1%', paddingRight: '1%', flexWrap: 'nowrap', overflow: 'hidden' }}>
        {c.labelText && (
          <span style={{ color: c.labelColor ?? 'rgba(255,255,255,0.4)', fontSize: `${c.labelFontSize ?? 1.1}em`, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {c.labelText}
          </span>
        )}
        {items.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '0.4em', flexShrink: 0, opacity: 1 - i * 0.1 }}>
            <span style={{ color: c.tokenRecentColor ?? '#FFD700', fontSize: `${c.tokenRecentFontSize ?? 2.4}em`, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {r.tokenNumber}
            </span>
            <span style={{ color: c.metaColor ?? 'rgba(255,255,255,0.4)', fontSize: `${c.metaFontSize ?? 1.0}em`, letterSpacing: '1px', whiteSpace: 'nowrap' }}>
              {r.locationLabel} · C{r.counterNumber}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (el.type === 'image') {
    const src = c.src ?? '';
    if (!src) return (
      <div style={{ ...containerStyle, flexDirection: 'column', gap: '0.5em', border: '2px dashed rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: '3em', opacity: 0.3 }}>Image</span>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9em', textAlign: 'center', padding: '0 10%' }}>Paste an image URL in Properties</span>
      </div>
    );
    return (
      <div style={{ ...containerStyle, padding: 0 }}>
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: (c.objectFit ?? 'cover') as any, objectPosition: c.objectPosition ?? 'center center', display: 'block', borderRadius: c.borderRadius ? `${c.borderRadius}px` : 0 }} />
      </div>
    );
  }

  if (el.type === 'video') {
    const src = c.src ?? '';
    if (!src) return (
      <div style={{ ...containerStyle, flexDirection: 'column', gap: '0.5em', border: '2px dashed rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: '3em', opacity: 0.3 }}>Video</span>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9em', textAlign: 'center', padding: '0 10%' }}>Paste a video URL or YouTube embed link in Properties</span>
      </div>
    );
    const isYoutube = src.includes('youtube.com') || src.includes('youtu.be');
    if (isYoutube) {
      let embedSrc = src;
      if (src.includes('youtube.com/watch?v=')) {
        const vid = src.split('v=')[1]?.split('&')[0] ?? '';
        embedSrc = `https://www.youtube.com/embed/${vid}`;
      } else if (src.includes('youtu.be/')) {
        const vid = src.split('youtu.be/')[1]?.split('?')[0] ?? '';
        embedSrc = `https://www.youtube.com/embed/${vid}`;
      }
      const videoId = embedSrc.split('/embed/')[1]?.split('?')[0] ?? '';
      const params = new URLSearchParams({ autoplay: c.videoAutoplay !== false ? '1' : '0', loop: c.videoLoop !== false ? '1' : '0', mute: c.videoMuted !== false ? '1' : '0', controls: c.videoControls ? '1' : '0', playlist: videoId, rel: '0', modestbranding: '1' });
      return (
        <div style={{ ...containerStyle, padding: 0 }}>
          <iframe src={`${embedSrc}?${params.toString()}`} style={{ width: '100%', height: '100%', border: 'none', borderRadius: c.borderRadius ? `${c.borderRadius}px` : 0 }} allow="autoplay; fullscreen" allowFullScreen />
        </div>
      );
    }
    return (
      <div style={{ ...containerStyle, padding: 0 }}>
        <video src={src} autoPlay={c.videoAutoplay !== false} loop={c.videoLoop !== false} muted={c.videoMuted !== false} controls={c.videoControls === true} playsInline style={{ width: '100%', height: '100%', objectFit: (c.objectFit ?? 'cover') as any, display: 'block', borderRadius: c.borderRadius ? `${c.borderRadius}px` : 0 }} />
      </div>
    );
  }

  if (el.type === 'slideshow') return <SlideshowEl config={c} containerStyle={containerStyle} />;
  if (el.type === 'marquee') return <MarqueeEl config={c} />;

  return null;
}

function LiveClockEl({ config: c, style }: { config: ElementConfig; style: React.CSSProperties }) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: (c.clockFormat ?? '12h') === '12h' });
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 10_000);
    return () => clearInterval(id);
  }, [c.clockFormat]);
  return (
    <div style={{ ...style, justifyContent: c.textAlign === 'right' ? 'flex-end' : c.textAlign === 'center' ? 'center' : 'flex-start' }}>
      <span style={{ color: c.color ?? 'rgba(255,255,255,0.45)', fontSize: `${c.fontSize ?? 1.4}em`, fontWeight: c.fontWeight ?? 400, fontVariantNumeric: 'tabular-nums' }}>
        {time}
      </span>
    </div>
  );
}

function SlideshowEl({ config: c, containerStyle }: { config: ElementConfig; containerStyle: React.CSSProperties }) {
  const images = c.slideshowImages ?? [];
  const [current, setCurrent] = useState(0);
  const intervalMs = (c.slideshowInterval ?? 5) * 1000;
  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => setCurrent((p) => (p + 1) % images.length), intervalMs);
    return () => clearInterval(id);
  }, [images.length, intervalMs]);
  useEffect(() => { setCurrent(0); }, [images.length]);
  if (images.length === 0) return (
    <div style={{ ...containerStyle, flexDirection: 'column', gap: '0.5em', border: '2px dashed rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: '3em', opacity: 0.3 }}>Slides</span>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9em', textAlign: 'center', padding: '0 10%' }}>Add image URLs in Properties (one per line)</span>
    </div>
  );
  const isFade = (c.slideshowTransition ?? 'fade') === 'fade';
  return (
    <div style={{ ...containerStyle, padding: 0, position: 'relative' }}>
      {images.map((src, i) => (
        <img key={src + i} src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: (c.objectFit ?? 'cover') as any, objectPosition: c.objectPosition ?? 'center center', opacity: i === current ? 1 : 0, transition: isFade ? 'opacity 0.9s ease-in-out' : 'none', zIndex: i === current ? 2 : 1, display: 'block' }} />
      ))}
      {c.showSlideshowIndicators !== false && images.length > 1 && (
        <div style={{ position: 'absolute', bottom: '4%', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '5px', zIndex: 10 }}>
          {images.map((_, i) => (
            <div key={i} onClick={() => setCurrent(i)} style={{ width: i === current ? '18px' : '7px', height: '7px', borderRadius: '3.5px', backgroundColor: i === current ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.35s ease', cursor: 'pointer', boxShadow: i === current ? '0 0 6px rgba(255,255,255,0.6)' : 'none' }} />
          ))}
        </div>
      )}
    </div>
  );
}

function MarqueeEl({ config: c }: { config: ElementConfig }) {
  const text = (c.text ?? 'Welcome to our hospital.') + (c.separatorText ?? '     -     ');
  const speed = Math.max(0.5, Math.min(10, c.marqueeSpeed ?? 3));
  const duration = 60 / speed;
  const animName = `hdspTicker_${Math.round(speed * 10)}`;
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', backgroundColor: c.backgroundColor ?? 'transparent', border: c.borderWidth ? `${c.borderWidth}px solid ${c.borderColor ?? 'transparent'}` : 'none', borderRadius: c.borderRadius ? `${c.borderRadius}px` : 0, opacity: c.opacity ?? 1 }}>
      <style>{`@keyframes ${animName} { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      <div style={{ display: 'inline-block', whiteSpace: 'nowrap', animation: `${animName} ${duration}s linear infinite`, willChange: 'transform' }}>
        <span style={{ color: c.color ?? '#fff', fontSize: `${c.fontSize ?? 1.4}em`, fontWeight: c.fontWeight ?? 600, letterSpacing: c.letterSpacing ? `${c.letterSpacing}px` : '1px', fontFamily: c.fontFamily ?? 'inherit' }}>
          {text + text}
        </span>
      </div>
    </div>
  );
}
