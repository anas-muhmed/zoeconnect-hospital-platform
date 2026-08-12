'use client';
import { Suspense } from 'react';
/**
 * Token Display Canvas Builder — /token/display-config
 * Superadmin-only. Full drag/resize canvas page builder.
 * Left: palette + layer list. Centre: 16:9 canvas. Right: properties panel.
 */
import {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TvIcon from '@mui/icons-material/Tv';

import { useAuthStore } from '@/lib/store/auth.store';
import { apiClient } from '@/lib/api/client';
import {
  CanvasElement, DisplayLayout, ElementConfig, ElementType,
  DEFAULT_LAYOUT, ELEMENT_DEFAULTS, ELEMENT_LABELS,
} from './types';

import { useQuery } from '@tanstack/react-query';
import { licenseApi } from '@/lib/api/license.api';
import { getTokenDisplayUrl } from '@/lib/utils/token-display-url';

import { RenderElement } from './renderer';

// ── Resize handles ────────────────────────────────────────────────────────────
const HANDLES = [
  { id: 'nw', style: { top: -5, left: -5, cursor: 'nw-resize' } },
  { id: 'n', style: { top: -5, left: 'calc(50% - 4px)', cursor: 'n-resize' } },
  { id: 'ne', style: { top: -5, right: -5, cursor: 'ne-resize' } },
  { id: 'e', style: { top: 'calc(50% - 4px)', right: -5, cursor: 'e-resize' } },
  { id: 'se', style: { bottom: -5, right: -5, cursor: 'se-resize' } },
  { id: 's', style: { bottom: -5, left: 'calc(50% - 4px)', cursor: 's-resize' } },
  { id: 'sw', style: { bottom: -5, left: -5, cursor: 'sw-resize' } },
  { id: 'w', style: { top: 'calc(50% - 4px)', left: -5, cursor: 'w-resize' } },
] as const;

// ── Property input helpers ────────────────────────────────────────────────────
const INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 4,
  color: '#fff',
  fontSize: '0.72rem',
  fontFamily: 'monospace',
  padding: '3px 6px',
  outline: 'none',
  width: '100%',
};

function PropRow({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.2 }}>
      <Typography sx={{ width: 100, fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1 }}>{children}</Box>
    </Box>
  );
}

function NumInput({ value, onChange, suffix = '' }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ ...INPUT_STYLE, width: 80 }}
      />
      {suffix && <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)' }}>{suffix}</Typography>}
    </Box>
  );
}

function TextInput({ value, onChange, mono = false }: { value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...INPUT_STYLE, fontFamily: mono ? 'monospace' : 'inherit' }}
    />
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value.trim());
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box component="label" sx={{ width: 22, height: 22, borderRadius: 0.5, background: value, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
        {isHex && <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0 }} />}
      </Box>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={{ ...INPUT_STYLE, flex: 1 }} />
    </Box>
  );
}

function SelectInput({ value, options, onChange }: { value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...INPUT_STYLE, width: '100%' }}>
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function BoolInput({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      size="small"
      checked={value}
      onChange={(e) => onChange(e.target.checked)}
      sx={{ '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#4caf5088' } }}
    />
  );
}

function TextAreaInput({ value, onChange, rows = 4, placeholder = '' }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      style={{ ...INPUT_STYLE, width: '100%', resize: 'vertical', lineHeight: 1.5 }}
    />
  );
}

const SEC = ({ label }: { label: string }) => (
  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', mt: 2, mb: 0.75 }}>
    {label}
  </Typography>
);

// ── Media upload button ───────────────────────────────────────────────────────
function UploadButton({
  accept,
  multiple = false,
  label = 'Upload',
  onUploaded,
}: {
  accept: string;
  multiple?: boolean;
  label?: string;
  onUploaded: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setTotal(files.length);
    setDone(0);
    const urls: string[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await apiClient.post<{ url: string }>('/token/media/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        urls.push(res.data.url);
      } catch { /* skip failed */ }
      setDone((p) => p + 1);
    }
    onUploaded(urls);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }} onChange={handleChange} />
      <Button
        size="small"
        variant="outlined"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        sx={{
          fontSize: '0.65rem', py: 0.35, px: 1,
          color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.15)',
          '&:hover': { borderColor: '#4caf50', color: '#4caf50' },
          minWidth: 0, whiteSpace: 'nowrap',
        }}
      >
        {uploading
          ? (total > 1 ? `Uploading ${done}/${total}…` : 'Uploading…')
          : label}
      </Button>
    </Box>
  );
}

// ── Properties panel ──────────────────────────────────────────────────────────
function PropertiesPanel({
  el,
  onUpdate,
  onDelete,
  onBringFront,
  onSendBack,
  onDuplicate,
}: {
  el: CanvasElement;
  onUpdate: (patch: Partial<CanvasElement> & { config?: Partial<ElementConfig> }) => void;
  onDelete: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onDuplicate: () => void;
}) {
  const upd = (cfg: Partial<ElementConfig>) => onUpdate({ config: cfg });
  const c = el.config;

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', px: 2, pb: 4, '&::-webkit-scrollbar': { width: 3 }, '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.12)', borderRadius: 2 } }}>
      {/* Element title */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.07)', mb: 1 }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#4caf50' }}>
          {ELEMENT_LABELS[el.type]}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Duplicate"><IconButton size="small" onClick={onDuplicate} sx={{ color: 'rgba(255,255,255,0.4)', p: 0.4 }} aria-label="Duplicate"><ContentCopyIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
          <Tooltip title="Bring forward"><IconButton size="small" onClick={onBringFront} sx={{ color: 'rgba(255,255,255,0.4)', p: 0.4 }} aria-label="Bring forward"><KeyboardArrowUpIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
          <Tooltip title="Send backward"><IconButton size="small" onClick={onSendBack} sx={{ color: 'rgba(255,255,255,0.4)', p: 0.4 }} aria-label="Send backward"><KeyboardArrowDownIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
          <Tooltip title="Delete element"><IconButton size="small" onClick={onDelete} sx={{ color: '#ef5350', p: 0.4 }} aria-label="Delete element"><DeleteOutlineIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
        </Box>
      </Box>

      {/* Position & Size — no limits */}
      <SEC label="Position & Size (%)" />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
        {([['X', 'x'], ['Y', 'y'], ['W', 'w'], ['H', 'h']] as [string, keyof CanvasElement][]).map(([label, key]) => (
          <Box key={key}>
            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', mb: 0.3 }}>{label}</Typography>
            <input type="number" value={Number((el[key] as number).toFixed(2))} onChange={(e) => onUpdate({ [key]: parseFloat(e.target.value) || 0 })} style={{ ...INPUT_STYLE, width: '100%' }} />
          </Box>
        ))}
      </Box>

      {/* Appearance */}
      <SEC label="Appearance" />
      <PropRow label="Background"><ColorInput value={c.backgroundColor ?? 'transparent'} onChange={(v) => upd({ backgroundColor: v })} /></PropRow>
      <PropRow label="Border color"><ColorInput value={c.borderColor ?? 'transparent'} onChange={(v) => upd({ borderColor: v })} /></PropRow>
      <PropRow label="Border width"><NumInput value={c.borderWidth ?? 0} onChange={(v) => upd({ borderWidth: v })} suffix="px" /></PropRow>
      <PropRow label="Border radius"><NumInput value={c.borderRadius ?? 0} onChange={(v) => upd({ borderRadius: v })} suffix="px" /></PropRow>
      <PropRow label="Opacity"><NumInput value={c.opacity ?? 1} onChange={(v) => upd({ opacity: v })} /></PropRow>
      <PropRow label="Z-index"><NumInput value={c.zIndex ?? 1} onChange={(v) => upd({ zIndex: v })} /></PropRow>
      <PropRow label="Padding X"><NumInput value={c.paddingX ?? 0} onChange={(v) => upd({ paddingX: v })} suffix="%" /></PropRow>
      <PropRow label="Padding Y"><NumInput value={c.paddingY ?? 0} onChange={(v) => upd({ paddingY: v })} suffix="%" /></PropRow>

      {/* Text props */}
      {(el.type === 'text' || el.type === 'clock' || el.type === 'location-name') && (
        <>
          <SEC label="Typography" />
          <PropRow label="Color"><ColorInput value={c.color ?? '#fff'} onChange={(v) => upd({ color: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.fontSize ?? 1} onChange={(v) => upd({ fontSize: v })} suffix="em" /></PropRow>
          <PropRow label="Font weight"><NumInput value={c.fontWeight ?? 400} onChange={(v) => upd({ fontWeight: v })} /></PropRow>
          <PropRow label="Letter spacing"><NumInput value={c.letterSpacing ?? 0} onChange={(v) => upd({ letterSpacing: v })} suffix="px" /></PropRow>
          <PropRow label="Align">
            <SelectInput value={c.textAlign ?? 'left'} options={[{ v: 'left', l: 'Left' }, { v: 'center', l: 'Center' }, { v: 'right', l: 'Right' }]} onChange={(v) => upd({ textAlign: v as any })} />
          </PropRow>
          <PropRow label="Transform">
            <SelectInput value={c.textTransform ?? 'none'} options={[{ v: 'none', l: 'None' }, { v: 'uppercase', l: 'Uppercase' }, { v: 'lowercase', l: 'Lowercase' }]} onChange={(v) => upd({ textTransform: v as any })} />
          </PropRow>
        </>
      )}

      {/* Static text content */}
      {el.type === 'text' && (
        <>
          <SEC label="Content" />
          <PropRow label="Text">
            <input type="text" value={c.text ?? ''} onChange={(e) => upd({ text: e.target.value })} style={{ ...INPUT_STYLE, width: '100%' }} />
          </PropRow>
        </>
      )}

      {/* Clock */}
      {el.type === 'clock' && (
        <>
          <SEC label="Clock" />
          <PropRow label="Format">
            <SelectInput value={c.clockFormat ?? '12h'} options={[{ v: '12h', l: '12h (07:51 pm)' }, { v: '24h', l: '24h (19:51)' }]} onChange={(v) => upd({ clockFormat: v as any })} />
          </PropRow>
        </>
      )}

      {/* Location name */}
      {el.type === 'location-name' && (
        <>
          <SEC label="Data" />
          <PropRow label="Location code">
            <TextInput value={c.locationCode ?? ''} onChange={(v) => upd({ locationCode: v })} mono />
          </PropRow>
        </>
      )}

      {/* Counter */}
      {el.type === 'counter' && (
        <>
          <SEC label="Data" />
          <PropRow label="Location code"><TextInput value={c.locationCode ?? ''} onChange={(v) => upd({ locationCode: v })} mono /></PropRow>
          <PropRow label="Counter #"><NumInput value={c.counterNumber ?? 0} onChange={(v) => upd({ counterNumber: v })} /></PropRow>
          <SEC label="Token Number" />
          <PropRow label="Color"><ColorInput value={c.tokenColor ?? '#FFD700'} onChange={(v) => upd({ tokenColor: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.tokenFontSize ?? 12} onChange={(v) => upd({ tokenFontSize: v })} suffix="em" /></PropRow>
          <PropRow label="Glow"><BoolInput value={c.glowEnabled ?? true} onChange={(v) => upd({ glowEnabled: v })} /></PropRow>
          <PropRow label="Glow color"><ColorInput value={c.glowColor ?? '#FFD700'} onChange={(v) => upd({ glowColor: v })} /></PropRow>
          <PropRow label="Flash color"><ColorInput value={c.flashColor ?? 'rgba(255,215,0,0.35)'} onChange={(v) => upd({ flashColor: v })} /></PropRow>
          <SEC label="Counter Label" />
          <PropRow label="Show label"><BoolInput value={c.showCounterName ?? true} onChange={(v) => upd({ showCounterName: v })} /></PropRow>
          <PropRow label="Color"><ColorInput value={c.counterNameColor ?? '#fff'} onChange={(v) => upd({ counterNameColor: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.counterNameFontSize ?? 1.8} onChange={(v) => upd({ counterNameFontSize: v })} suffix="em" /></PropRow>
          <SEC label="Now Serving" />
          <PropRow label="Show"><BoolInput value={c.showNowServing ?? true} onChange={(v) => upd({ showNowServing: v })} /></PropRow>
          <PropRow label="Color"><ColorInput value={c.nowServingColor ?? 'rgba(255,255,255,0.5)'} onChange={(v) => upd({ nowServingColor: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.nowServingFontSize ?? 1.1} onChange={(v) => upd({ nowServingFontSize: v })} suffix="em" /></PropRow>
        </>
      )}

      {/* Counter grid */}
      {el.type === 'counter-grid' && (
        <>
          <SEC label="Data" />
          <PropRow label="Location code"><TextInput value={c.locationCode ?? ''} onChange={(v) => upd({ locationCode: v })} mono /></PropRow>
          <PropRow label="Per row"><NumInput value={c.countersPerRow ?? 5} onChange={(v) => upd({ countersPerRow: v })} /></PropRow>
          <PropRow label="Cell border"><ColorInput value={c.counterBorderColor ?? 'rgba(255,255,255,0.08)'} onChange={(v) => upd({ counterBorderColor: v })} /></PropRow>
          <SEC label="Token Number" />
          <PropRow label="Color"><ColorInput value={c.tokenColor ?? '#FFD700'} onChange={(v) => upd({ tokenColor: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.tokenFontSize ?? 10} onChange={(v) => upd({ tokenFontSize: v })} suffix="em" /></PropRow>
          <PropRow label="Glow"><BoolInput value={c.glowEnabled ?? true} onChange={(v) => upd({ glowEnabled: v })} /></PropRow>
          <PropRow label="Glow color"><ColorInput value={c.glowColor ?? '#FFD700'} onChange={(v) => upd({ glowColor: v })} /></PropRow>
          <PropRow label="Flash color"><ColorInput value={c.flashColor ?? 'rgba(255,215,0,0.35)'} onChange={(v) => upd({ flashColor: v })} /></PropRow>
          <SEC label="Counter Label" />
          <PropRow label="Show"><BoolInput value={c.showCounterName ?? true} onChange={(v) => upd({ showCounterName: v })} /></PropRow>
          <PropRow label="Color"><ColorInput value={c.counterNameColor ?? '#fff'} onChange={(v) => upd({ counterNameColor: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.counterNameFontSize ?? 1.8} onChange={(v) => upd({ counterNameFontSize: v })} suffix="em" /></PropRow>
          <SEC label="Now Serving" />
          <PropRow label="Show"><BoolInput value={c.showNowServing ?? true} onChange={(v) => upd({ showNowServing: v })} /></PropRow>
          <PropRow label="Color"><ColorInput value={c.nowServingColor ?? 'rgba(255,255,255,0.5)'} onChange={(v) => upd({ nowServingColor: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.nowServingFontSize ?? 1.1} onChange={(v) => upd({ nowServingFontSize: v })} suffix="em" /></PropRow>
        </>
      )}

      {/* Recent bar */}
      {el.type === 'recent-bar' && (
        <>
          <SEC label="Data" />
          <PropRow label="Location code"><TextInput value={c.locationCode ?? ''} onChange={(v) => upd({ locationCode: v })} mono /></PropRow>
          <PropRow label="Max items"><NumInput value={c.maxItems ?? 999} onChange={(v) => upd({ maxItems: v })} /></PropRow>
          <SEC label="Label" />
          <PropRow label="Text"><TextInput value={c.labelText ?? ''} onChange={(v) => upd({ labelText: v })} /></PropRow>
          <PropRow label="Color"><ColorInput value={c.labelColor ?? 'rgba(255,255,255,0.4)'} onChange={(v) => upd({ labelColor: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.labelFontSize ?? 1.1} onChange={(v) => upd({ labelFontSize: v })} suffix="em" /></PropRow>
          <SEC label="Token Number" />
          <PropRow label="Color"><ColorInput value={c.tokenRecentColor ?? '#FFD700'} onChange={(v) => upd({ tokenRecentColor: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.tokenRecentFontSize ?? 2.4} onChange={(v) => upd({ tokenRecentFontSize: v })} suffix="em" /></PropRow>
          <SEC label="Location/Counter text" />
          <PropRow label="Color"><ColorInput value={c.metaColor ?? 'rgba(255,255,255,0.4)'} onChange={(v) => upd({ metaColor: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.metaFontSize ?? 1.0} onChange={(v) => upd({ metaFontSize: v })} suffix="em" /></PropRow>
        </>
      )}

      {/* ── Image ─────────────────────────────────────────────────────────── */}
      {el.type === 'image' && (
        <>
          <SEC label="Source" />
          <PropRow label="URL">
            <TextInput value={c.src ?? ''} onChange={(v) => upd({ src: v })} mono />
          </PropRow>
          <PropRow label="Upload">
            <UploadButton accept="image/*" label="Choose image…" onUploaded={([url]) => url && upd({ src: url })} />
          </PropRow>
          <SEC label="Display" />
          <PropRow label="Fit">
            <SelectInput value={c.objectFit ?? 'cover'} options={[{ v: 'cover', l: 'Cover (fill, crop)' }, { v: 'contain', l: 'Contain (letterbox)' }, { v: 'fill', l: 'Fill (stretch)' }, { v: 'none', l: 'None (natural size)' }]} onChange={(v) => upd({ objectFit: v as any })} />
          </PropRow>
          <PropRow label="Position">
            <SelectInput value={c.objectPosition ?? 'center center'} options={[{ v: 'center center', l: 'Center' }, { v: 'top center', l: 'Top' }, { v: 'bottom center', l: 'Bottom' }, { v: 'center left', l: 'Left' }, { v: 'center right', l: 'Right' }]} onChange={(v) => upd({ objectPosition: v })} />
          </PropRow>
        </>
      )}

      {/* ── Video / YouTube ───────────────────────────────────────────────── */}
      {el.type === 'video' && (
        <>
          <SEC label="Source" />
          <PropRow label="URL / Embed">
            <TextInput value={c.src ?? ''} onChange={(v) => upd({ src: v })} mono />
          </PropRow>
          <PropRow label="Upload">
            <UploadButton accept="video/*" label="Choose video…" onUploaded={([url]) => url && upd({ src: url })} />
          </PropRow>
          <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', mb: 1.5, lineHeight: 1.6 }}>
            Supports: direct .mp4/.webm, YouTube watch/embed/youtu.be, or uploaded files
          </Typography>
          <SEC label="Playback" />
          <PropRow label="Autoplay"><BoolInput value={c.videoAutoplay !== false} onChange={(v) => upd({ videoAutoplay: v })} /></PropRow>
          <PropRow label="Loop"><BoolInput value={c.videoLoop !== false} onChange={(v) => upd({ videoLoop: v })} /></PropRow>
          <PropRow label="Muted"><BoolInput value={c.videoMuted !== false} onChange={(v) => upd({ videoMuted: v })} /></PropRow>
          <PropRow label="Controls"><BoolInput value={c.videoControls === true} onChange={(v) => upd({ videoControls: v })} /></PropRow>
          <SEC label="Display" />
          <PropRow label="Fit">
            <SelectInput value={c.objectFit ?? 'cover'} options={[{ v: 'cover', l: 'Cover (fill, crop)' }, { v: 'contain', l: 'Contain (letterbox)' }, { v: 'fill', l: 'Fill (stretch)' }]} onChange={(v) => upd({ objectFit: v as any })} />
          </PropRow>
        </>
      )}

      {/* ── Image slideshow ───────────────────────────────────────────────── */}
      {el.type === 'slideshow' && (
        <>
          <SEC label="Images (one URL per line)" />
          <TextAreaInput
            rows={6}
            placeholder={'https://example.com/banner1.jpg\nhttps://example.com/banner2.jpg'}
            value={(c.slideshowImages ?? []).join('\n')}
            onChange={(v) => upd({ slideshowImages: v.split('\n').map((s) => s.trim()).filter(Boolean) })}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.75, mb: 1.5 }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>
              {(c.slideshowImages ?? []).length} image{(c.slideshowImages ?? []).length !== 1 ? 's' : ''}
            </Typography>
            <UploadButton
              accept="image/*"
              multiple
              label="Upload images…"
              onUploaded={(urls) => upd({ slideshowImages: [...(c.slideshowImages ?? []), ...urls] })}
            />
          </Box>
          <SEC label="Timing" />
          <PropRow label="Interval"><NumInput value={c.slideshowInterval ?? 5} onChange={(v) => upd({ slideshowInterval: v })} suffix="sec" /></PropRow>
          <SEC label="Transition" />
          <PropRow label="Effect">
            <SelectInput value={c.slideshowTransition ?? 'fade'} options={[{ v: 'fade', l: 'Fade' }, { v: 'slide', l: 'Cut (instant)' }]} onChange={(v) => upd({ slideshowTransition: v as any })} />
          </PropRow>
          <PropRow label="Indicators"><BoolInput value={c.showSlideshowIndicators !== false} onChange={(v) => upd({ showSlideshowIndicators: v })} /></PropRow>
          <SEC label="Display" />
          <PropRow label="Fit">
            <SelectInput value={c.objectFit ?? 'cover'} options={[{ v: 'cover', l: 'Cover (fill, crop)' }, { v: 'contain', l: 'Contain (letterbox)' }, { v: 'fill', l: 'Fill (stretch)' }]} onChange={(v) => upd({ objectFit: v as any })} />
          </PropRow>
          <PropRow label="Position">
            <SelectInput value={c.objectPosition ?? 'center center'} options={[{ v: 'center center', l: 'Center' }, { v: 'top center', l: 'Top' }, { v: 'bottom center', l: 'Bottom' }]} onChange={(v) => upd({ objectPosition: v })} />
          </PropRow>
        </>
      )}

      {/* ── Scrolling marquee ─────────────────────────────────────────────── */}
      {el.type === 'marquee' && (
        <>
          <SEC label="Content" />
          <PropRow label="Text">
            <input type="text" value={c.text ?? ''} onChange={(e) => upd({ text: e.target.value })} style={{ ...INPUT_STYLE, width: '100%' }} />
          </PropRow>
          <PropRow label="Separator">
            <TextInput value={c.separatorText ?? '     ❆     '} onChange={(v) => upd({ separatorText: v })} />
          </PropRow>
          <SEC label="Typography" />
          <PropRow label="Color"><ColorInput value={c.color ?? '#fff'} onChange={(v) => upd({ color: v })} /></PropRow>
          <PropRow label="Font size"><NumInput value={c.fontSize ?? 1.4} onChange={(v) => upd({ fontSize: v })} suffix="em" /></PropRow>
          <PropRow label="Font weight"><NumInput value={c.fontWeight ?? 600} onChange={(v) => upd({ fontWeight: v })} /></PropRow>
          <PropRow label="Letter spacing"><NumInput value={c.letterSpacing ?? 1} onChange={(v) => upd({ letterSpacing: v })} suffix="px" /></PropRow>
          <SEC label="Speed" />
          <PropRow label="Speed (1–10)"><NumInput value={c.marqueeSpeed ?? 3} onChange={(v) => upd({ marqueeSpeed: v })} /></PropRow>
          <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', mb: 1 }}>
            Higher = faster scroll
          </Typography>
        </>
      )}
    </Box>
  );
}

// ── Drag / resize state types ─────────────────────────────────────────────────
type DragState = {
  id: string;
  mode: 'move' | 'resize';
  handle?: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
};

function applyDragOrResize(el: CanvasElement, d: DragState, dx: number, dy: number): CanvasElement {
  if (d.mode === 'move') {
    return { ...el, x: d.origX + dx, y: d.origY + dy };
  }
  switch (d.handle) {
    case 'se': return { ...el, w: Math.max(0.5, d.origW + dx), h: Math.max(0.5, d.origH + dy) };
    case 'sw': return { ...el, x: d.origX + dx, w: Math.max(0.5, d.origW - dx), h: Math.max(0.5, d.origH + dy) };
    case 'ne': return { ...el, y: d.origY + dy, w: Math.max(0.5, d.origW + dx), h: Math.max(0.5, d.origH - dy) };
    case 'nw': return { ...el, x: d.origX + dx, y: d.origY + dy, w: Math.max(0.5, d.origW - dx), h: Math.max(0.5, d.origH - dy) };
    case 'n': return { ...el, y: d.origY + dy, h: Math.max(0.5, d.origH - dy) };
    case 's': return { ...el, h: Math.max(0.5, d.origH + dy) };
    case 'e': return { ...el, w: Math.max(0.5, d.origW + dx) };
    case 'w': return { ...el, x: d.origX + dx, w: Math.max(0.5, d.origW - dx) };
    default: return el;
  }
}

// ── Main editor page ──────────────────────────────────────────────────────────
function DisplayConfigPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageSlug = searchParams?.get('slug') ?? null; // null = global default

  const { user } = useAuthStore();
  const isSuperAdmin = user?.roles?.some((r: any) => r.name === 'SUPER_ADMIN') ?? false;

  const [layout, setLayout] = useState<DisplayLayout>(DEFAULT_LAYOUT);
  const [bgColor, setBgColor] = useState(DEFAULT_LAYOUT.backgroundColor);
  const [selected, setSelected] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(true);

  const { data: licenseStatus } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    staleTime: 60_000,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [canvasW, setCanvasW] = useState(960);

  // Canvas ratio
  const [canvasRatio, setCanvasRatio] = useState<import('./types').CanvasRatio>('16:9');
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);

  // Derived CSS aspect-ratio string
  const cssAspectRatio = useMemo(() => {
    if (canvasRatio === 'custom') return `${customW}/${customH}`;
    return canvasRatio.replace(':', '/');
  }, [canvasRatio, customW, customH]);

  // Named-page settings dialog
  const [pageTitle, setPageTitle] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Track canvas width for em-based font sizes
  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setCanvasW(e.contentRect.width));
    if (canvasWrapRef.current) obs.observe(canvasWrapRef.current);
    return () => obs.disconnect();
  }, []);

  // Load saved layout — named page or global default
  useEffect(() => {
    setLoading(true);
    const req = pageSlug
      ? apiClient.get(`/token/display-pages/${pageSlug}`).then((r) => {
        const page = r.data as any;
        setPageTitle(page.title ?? pageSlug);
        setEditTitle(page.title ?? pageSlug);
        return page.layout;
      })
      : apiClient.get('/token/display-config').then((r) => r.data);

    req
      .then((data) => {
        if (data?.version === 2) {
          setLayout(data as DisplayLayout);
          setBgColor(data.backgroundColor ?? DEFAULT_LAYOUT.backgroundColor);
          if (data.canvasRatio) setCanvasRatio(data.canvasRatio);
          if (data.customWidth) setCustomW(data.customWidth);
          if (data.customHeight) setCustomH(data.customHeight);
        } else if (pageSlug) {
          // Named page with no layout yet — start with a blank canvas
          const blank: DisplayLayout = { version: 2, backgroundColor: '#08111f', elements: [] };
          setLayout(blank);
          setBgColor(blank.backgroundColor);
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSlug]);

  // Global pointer handlers for drag/resize (touch interaction audit, Phase 2:
  // this used to be window 'mousemove'/'mouseup', which never fire from a
  // touchscreen -- element placement/resize on this canvas was entirely
  // unreachable on a tablet. Pointer Events deliver the same clientX/clientY
  // shape for mouse, touch, and pen, so the drag-state math is unchanged;
  // setPointerCapture on the element that started the drag (see the
  // onPointerDown handlers below) is what keeps 'pointermove' reliably
  // reaching window even if the finger strays outside the canvas mid-drag.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const dragState = dragRef.current;
      if (!dragState || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = (e.clientX - dragState.startX) / rect.width * 100;
      const dy = (e.clientY - dragState.startY) / rect.height * 100;
      setLayout((prev) => ({
        ...prev,
        elements: prev.elements.map((el) =>
          (el && el.id === dragState.id) ? applyDragOrResize(el, dragState, dx, dy) : el
        ),
      }));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        deleteElement(selected);
      }
      if (e.key === 'Escape') setSelected(null);
      const nudge = e.shiftKey ? 2 : 0.5;
      if (e.key === 'ArrowLeft') updateElement(selected, { x: (layout.elements.find(el => el.id === selected)?.x ?? 0) - nudge });
      if (e.key === 'ArrowRight') updateElement(selected, { x: (layout.elements.find(el => el.id === selected)?.x ?? 0) + nudge });
      if (e.key === 'ArrowUp') updateElement(selected, { y: (layout.elements.find(el => el.id === selected)?.y ?? 0) - nudge });
      if (e.key === 'ArrowDown') updateElement(selected, { y: (layout.elements.find(el => el.id === selected)?.y ?? 0) + nudge });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, layout]);

  const updateElement = (id: string, patch: Partial<CanvasElement> & { config?: Partial<ElementConfig> }) => {
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => {
        if (!el || el.id !== id) return el;
        const { config: cfgPatch, ...rest } = patch;
        return { ...el, ...rest, config: { ...el.config, ...(cfgPatch ?? {}) } };
      }),
    }));
  };

  const deleteElement = (id: string) => {
    setLayout((prev) => ({ ...prev, elements: prev.elements.filter((el) => el.id !== id) }));
    if (selected === id) setSelected(null);
  };

  const addElement = (type: ElementType) => {
    const id = `${type}-${Date.now()}`;
    const defaults = ELEMENT_DEFAULTS[type];
    const SIZE: Partial<Record<ElementType, { w: number; h: number }>> = {
      'counter-grid': { w: 80, h: 60 },
      'recent-bar': { w: 100, h: 12 },
      'counter': { w: 25, h: 40 },
      'image': { w: 25, h: 20 },
      'video': { w: 40, h: 30 },
      'slideshow': { w: 35, h: 28 },
      'marquee': { w: 100, h: 8 },
    };
    const sz = SIZE[type] ?? { w: 30, h: 8 };
    const newEl: CanvasElement = {
      id, type,
      x: 10, y: 10,
      w: sz.w,
      h: sz.h,
      config: { ...defaults },
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelected(id);
  };

  const duplicateElement = (id: string) => {
    const el = layout.elements.find((e) => e.id === id);
    if (!el) return;
    const newEl: CanvasElement = { ...el, id: `${el.type}-${Date.now()}`, x: el.x + 2, y: el.y + 2 };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelected(newEl.id);
  };

  const bringFront = (id: string) => {
    const maxZ = Math.max(...layout.elements.map((e) => e.config.zIndex ?? 1));
    updateElement(id, { config: { zIndex: maxZ + 1 } });
  };

  const sendBack = (id: string) => {
    const minZ = Math.min(...layout.elements.map((e) => e.config.zIndex ?? 1));
    updateElement(id, { config: { zIndex: minZ - 1 } });
  };

  const commitToLive = async () => {
    setSaving(true);
    const full: DisplayLayout = {
      ...layout,
      backgroundColor: bgColor,
      canvasRatio,
      ...(canvasRatio === 'custom' ? { customWidth: customW, customHeight: customH } : {}),
    };
    try {
      if (pageSlug) {
        await apiClient.patch(`/token/display-pages/${pageSlug}`, { layout: full });
        setToast({ msg: `"${pageTitle || pageSlug}" saved — visit ${getTokenDisplayUrl(pageSlug, licenseStatus?.deploymentMode, licenseStatus?.hospitalCode)} to preview`, severity: 'success' });
      } else {
        await apiClient.put('/token/display-config', full);
        setToast({ msg: 'Layout committed — all display boards updated instantly', severity: 'success' });
      }
    } catch {
      setToast({ msg: 'Failed to save layout', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const savePageMeta = async () => {
    if (!pageSlug) return;
    setSavingMeta(true);
    try {
      await apiClient.patch(`/token/display-pages/${pageSlug}`, { title: editTitle });
      setPageTitle(editTitle);
      setSettingsOpen(false);
      setToast({ msg: 'Page settings saved', severity: 'success' });
    } catch {
      setToast({ msg: 'Failed to save settings', severity: 'error' });
    } finally {
      setSavingMeta(false);
    }
  };

  const selectedEl = layout.elements.find((e) => e.id === selected) ?? null;

  if (!isSuperAdmin) return (
    <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="error">Access denied — superadmin only</Typography></Box>
  );
  if (loading) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}><CircularProgress /></Box>
  );

  const sortedElements = [...layout.elements].sort((a, b) => (a.config.zIndex ?? 1) - (b.config.zIndex ?? 1));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', bgcolor: '#0d1117', color: '#fff', overflow: 'hidden' }}>

      {/* ── Header ────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', flexShrink: 0, gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton size="small" onClick={() => router.push(pageSlug ? '/token/display-pages' : '/token')} sx={{ color: 'rgba(255,255,255,0.5)' }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <TvIcon sx={{ color: '#4caf50', fontSize: 20 }} />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography fontWeight={700} sx={{ fontSize: '0.95rem', lineHeight: 1.2 }}>
                {pageSlug ? (pageTitle || pageSlug) : 'Display Canvas Builder'}
              </Typography>
              {pageSlug && (
                <Tooltip title="Page settings">
                  <IconButton size="small" onClick={() => { setEditTitle(pageTitle); setSettingsOpen(true); }} sx={{ color: 'rgba(255,255,255,0.35)', p: 0.3 }} aria-label="Page settings">
                    <SettingsIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>
              {pageSlug ? getTokenDisplayUrl(pageSlug, licenseStatus?.deploymentMode, licenseStatus?.hospitalCode) : 'Drag · Resize · Select · Commit to push live'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* ── Canvas ratio picker ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', mr: 0.25 }}>Screen</Typography>
            {(['16:9', '9:16', '4:3', '3:4', 'custom'] as const).map((r) => (
              <Box
                key={r}
                onClick={() => setCanvasRatio(r)}
                sx={{
                  px: 0.9, py: 0.3, borderRadius: 0.75, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600,
                  border: '1px solid',
                  borderColor: canvasRatio === r ? '#4caf50' : 'rgba(255,255,255,0.12)',
                  color: canvasRatio === r ? '#4caf50' : 'rgba(255,255,255,0.4)',
                  bgcolor: canvasRatio === r ? 'rgba(76,175,80,0.1)' : 'transparent',
                  '&:hover': { borderColor: canvasRatio === r ? '#4caf50' : 'rgba(255,255,255,0.25)' },
                  transition: 'all 0.15s',
                }}
              >
                {r}
              </Box>
            ))}
            {canvasRatio === 'custom' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                <input type="number" value={customW} onChange={(e) => setCustomW(parseInt(e.target.value) || 1920)} style={{ ...INPUT_STYLE, width: 60, textAlign: 'center' }} />
                <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>×</Typography>
                <input type="number" value={customH} onChange={(e) => setCustomH(parseInt(e.target.value) || 1080)} style={{ ...INPUT_STYLE, width: 60, textAlign: 'center' }} />
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>BG</Typography>
            <Box component="label" sx={{ width: 24, height: 24, borderRadius: 0.5, background: bgColor, border: '1px solid rgba(255,255,255,0.2)', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
              <input type="color" value={bgColor.startsWith('#') ? bgColor : '#08111f'} onChange={(e) => setBgColor(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0 }} />
            </Box>
            <input type="text" value={bgColor} onChange={(e) => setBgColor(e.target.value)} style={{ ...INPUT_STYLE, width: 120 }} />
          </Box>
          <Tooltip title="Reset to default layout">
            <IconButton size="small" onClick={() => { setLayout(DEFAULT_LAYOUT); setBgColor(DEFAULT_LAYOUT.backgroundColor); setSelected(null); }} sx={{ color: 'rgba(255,255,255,0.4)' }} aria-label="Reset to default layout">
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button variant="contained" color="success" disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <CheckIcon />}
            onClick={commitToLive} sx={{ fontWeight: 700, px: 2 }}>
            {saving ? 'Saving…' : 'Commit to Live'}
          </Button>
        </Box>
      </Box>

      {/* ── Body ──────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left panel: palette + layers ───────────────────── */}
        <Box sx={{ width: 200, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Palette */}
          <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', mb: 1 }}>
              Add Element
            </Typography>
            {(Object.keys(ELEMENT_LABELS) as ElementType[]).map((type) => (
              <Box
                key={type}
                onClick={() => addElement(type)}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.6, borderRadius: 1, cursor: 'pointer', mb: 0.4, '&:hover': { bgcolor: 'rgba(76,175,80,0.12)' }, transition: 'background 0.15s' }}
              >
                <AddIcon sx={{ fontSize: 12, color: '#4caf50' }} />
                <Typography sx={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.7)' }}>{ELEMENT_LABELS[type]}</Typography>
              </Box>
            ))}
          </Box>

          {/* Layer list */}
          <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, '&::-webkit-scrollbar': { width: 3 }, '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.12)' } }}>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', mb: 1 }}>
              Layers
            </Typography>
            {[...layout.elements].reverse().map((el) => el ? (
              <Box
                key={el.id}
                onClick={() => setSelected(el.id)}
                sx={{
                  px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', mb: 0.3,
                  bgcolor: selected === el.id ? 'rgba(76,175,80,0.15)' : 'transparent',
                  border: selected === el.id ? '1px solid rgba(76,175,80,0.3)' : '1px solid transparent',
                  '&:hover': { bgcolor: selected === el.id ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.05)' },
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <Typography sx={{ fontSize: '0.7rem', color: selected === el.id ? '#4caf50' : 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ELEMENT_LABELS[el.type]}
                </Typography>
                <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
                  z{el.config.zIndex ?? 1}
                </Typography>
              </Box>
            ) : null)}
          </Box>
        </Box>

        {/* ── Centre: canvas ─────────────────────────────────── */}
        <Box ref={canvasWrapRef} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#060b12', p: 3, overflow: 'hidden', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#4caf50', boxShadow: '0 0 5px #4caf50', animation: 'pulse 2s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>CANVAS — {selected ? `${selected} selected` : 'click element to select'}</Typography>
          </Box>

          <Box
            ref={canvasRef}
            onClick={(e) => { if (e.target === canvasRef.current) setSelected(null); }}
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: cssAspectRatio,
              backgroundColor: bgColor,
              overflow: 'hidden',
              cursor: 'default',
              fontSize: `${canvasW / 100}px`,
              maxHeight: 'calc(100dvh - 200px)',
              maxWidth: `calc((100dvh - 200px) * ${cssAspectRatio.replace('/', ' / ')})`,
              outline: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <style>{`
              @keyframes tokenFlash {
                0%   { background-color: transparent; }
                12%  { background-color: rgba(255,215,0,0.35); }
                28%  { background-color: transparent; }
                44%  { background-color: rgba(255,215,0,0.35); }
                60%  { background-color: transparent; }
                76%  { background-color: rgba(255,215,0,0.18); }
                100% { background-color: transparent; }
              }
            `}</style>

            {sortedElements.map((el) => {
              if (!el) return null;
              const isSel = selected === el.id;
              return (
                <Box
                  key={el.id}
                  sx={{
                    position: 'absolute',
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: `${el.w}%`,
                    height: `${el.h}%`,
                    zIndex: el.config.zIndex ?? 1,
                    cursor: 'grab',
                    outline: isSel ? '2px solid #4caf50' : 'none',
                    outlineOffset: '0px',
                    '&:hover': { outline: isSel ? '2px solid #4caf50' : '1px dashed rgba(255,255,255,0.3)' },
                    userSelect: 'none',
                    boxSizing: 'border-box',
                    touchAction: 'none',
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as Element).setPointerCapture(e.pointerId);
                    setSelected(el.id);
                    dragRef.current = {
                      id: el.id, mode: 'move',
                      startX: e.clientX, startY: e.clientY,
                      origX: el.x, origY: el.y, origW: el.w, origH: el.h,
                    };
                  }}
                >
                  <RenderElement el={el} />

                  {isSel && HANDLES.map((h) => (
                    <Box
                      key={h.id}
                      component="span"
                      sx={{
                        position: 'absolute',
                        width: 8, height: 8,
                        bgcolor: '#4caf50',
                        border: '1px solid #fff',
                        borderRadius: 0.3,
                        zIndex: 9999,
                        ...h.style,
                        '&:hover': { bgcolor: '#81c784' },
                        touchAction: 'none',
                      } as any}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.target as Element).setPointerCapture(e.pointerId);
                        dragRef.current = {
                          id: el.id, mode: 'resize', handle: h.id,
                          startX: e.clientX, startY: e.clientY,
                          origX: el.x, origY: el.y, origW: el.w, origH: el.h,
                        };
                      }}
                    />
                  ))}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* ── Right panel: properties ─────────────────────────── */}
        <Box sx={{ width: 260, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto' }}>
          {selectedEl ? (
            <PropertiesPanel
              el={selectedEl}
              onUpdate={(patch) => updateElement(selectedEl.id, patch)}
              onDelete={() => deleteElement(selectedEl.id)}
              onBringFront={() => bringFront(selectedEl.id)}
              onSendBack={() => sendBack(selectedEl.id)}
              onDuplicate={() => duplicateElement(selectedEl.id)}
            />
          ) : (
            <Box sx={{ p: 2.5, textAlign: 'center', mt: 4 }}>
              <Typography sx={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.2)', lineHeight: 1.7 }}>
                Click an element on the canvas to edit its properties
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)} sx={{ fontWeight: 600 }}>
          {toast?.msg}
        </Alert>
      </Snackbar>

      {/* ── Page settings dialog (named pages only) ── */}
      {pageSlug && (
        <ResponsiveDialog
          open={settingsOpen}
          onClose={() => !savingMeta && setSettingsOpen(false)}
          PaperProps={{ sx: { bgcolor: '#1a2035', color: '#fff', minWidth: 380, borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' } }}
        >
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Page settings</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
            <Box>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', mb: 0.75 }}>Display title</Typography>
              <TextField
                fullWidth size="small" autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') savePageMeta(); }}
                InputProps={{ sx: { color: '#fff', bgcolor: 'rgba(255,255,255,0.06)', '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' } } }}
              />
            </Box>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
              URL: {pageSlug ? getTokenDisplayUrl(pageSlug, licenseStatus?.deploymentMode, licenseStatus?.hospitalCode) : ''}
            </Typography>
            <Button
              size="small" variant="outlined"
              onClick={() => window.open(getTokenDisplayUrl(pageSlug, licenseStatus?.deploymentMode, licenseStatus?.hospitalCode), '_blank')}
              sx={{ alignSelf: 'flex-start', fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.15)' }}
            >
              Preview ↗
            </Button>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setSettingsOpen(false)} disabled={savingMeta} sx={{ color: 'rgba(255,255,255,0.4)' }}>Cancel</Button>
            <Button variant="contained" color="success" onClick={savePageMeta} disabled={savingMeta}>
              {savingMeta ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </ResponsiveDialog>
      )}
    </Box>
  );
}

export default function DisplayConfigPageWrapper() { return <Suspense fallback={null}><DisplayConfigPage /></Suspense>; }
