'use client';

/**
 * ImageCropDialog --- a small, dependency-free pan/zoom crop tool (no
 * react-easy-crop/react-image-crop in this repo -- see package.json; adding
 * one just for this would be a lot of bundle weight for "drag and zoom an
 * image inside a fixed frame"). Lets the admin position an uploaded image
 * themselves against a fixed target aspect ratio (e.g. a phone screen for
 * the feedback form's splash screen) *before* it's saved, instead of
 * relying on blind CSS `object-fit: cover` to guess which part of an
 * arbitrary-aspect-ratio image matters -- that guess is exactly what
 * clipped the hospital logo out of a splash image in practice.
 *
 * Math: the image is always displayed at >= "cover" scale for the viewport
 * (so it can never leave a gap), positioned by `pos` (image top-left, in
 * viewport pixels), and `zoom` is a 1..MAX_ZOOM multiplier on top of that
 * base cover scale. Dragging and zooming both re-clamp `pos` so the image
 * can never be moved to reveal empty space. "Apply Crop" reads whatever
 * rectangle is currently inside the viewport back out of the *original*
 * image resolution and draws just that rectangle onto an output canvas.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';

const MAX_ZOOM = 3;
const MAX_VIEWPORT_HEIGHT = 480;
const MAX_VIEWPORT_WIDTH = 340;

interface ImageCropDialogProps {
  open: boolean;
  file: File | null;
  /** width / height, e.g. 9/16 for a phone-screen-shaped splash image */
  aspectRatio: number;
  outputWidth?: number;
  title?: string;
  onCancel: () => void;
  onCropped: (blob: Blob, fileName: string) => void;
}

export default function ImageCropDialog({
  open, file, aspectRatio, outputWidth = 1080, title = 'Adjust Image', onCancel, onCropped,
}: ImageCropDialogProps) {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);
  const hasCenteredRef = useRef(false);

  // Viewport (crop frame) size -- fixed aspect, capped so it fits comfortably in the dialog.
  const viewport = useMemo(() => {
    let w = MAX_VIEWPORT_WIDTH;
    let h = w / aspectRatio;
    if (h > MAX_VIEWPORT_HEIGHT) {
      const factor = MAX_VIEWPORT_HEIGHT / h;
      h = MAX_VIEWPORT_HEIGHT;
      w = w * factor;
    }
    return { w, h };
  }, [aspectRatio]);

  // Load the file into an <img> once per file change, and reset pan/zoom.
  useEffect(() => {
    if (!file) { setImgEl(null); return; }
    const url = URL.createObjectURL(file);
    hasCenteredRef.current = false;
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      setZoom(1);
      setPos({ x: 0, y: 0 }); // placeholder -- re-centered below once we know the base scale
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = imgEl ? Math.max(viewport.w / imgEl.naturalWidth, viewport.h / imgEl.naturalHeight) : 1;
  const effScale = baseScale * zoom;
  const dispW = imgEl ? imgEl.naturalWidth * effScale : 0;
  const dispH = imgEl ? imgEl.naturalHeight * effScale : 0;

  const clamp = (p: { x: number; y: number }) => {
    const minX = viewport.w - dispW; // <= 0
    const minY = viewport.h - dispH; // <= 0
    return { x: Math.min(0, Math.max(minX, p.x)), y: Math.min(0, Math.max(minY, p.y)) };
  };

  // Center the image the first time it loads; on later changes (zoom, viewport resize) just re-clamp
  // the existing position in place so the admin's pan choice isn't discarded.
  useEffect(() => {
    if (!imgEl) return;
    setPos(prev => {
      if (!hasCenteredRef.current) {
        hasCenteredRef.current = true;
        return clamp({ x: (viewport.w - dispW) / 2, y: (viewport.h - dispH) / 2 });
      }
      return clamp(prev);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgEl, zoom, viewport.w, viewport.h]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startPos: pos };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos(clamp({ x: dragState.current.startPos.x + dx, y: dragState.current.startPos.y + dy }));
  };
  const onPointerUp = () => { dragState.current = null; };

  const handleApply = () => {
    if (!imgEl || !file) return;
    setBusy(true);
    const sourceX = -pos.x / effScale;
    const sourceY = -pos.y / effScale;
    const sourceW = viewport.w / effScale;
    const sourceH = viewport.h / effScale;

    const outH = Math.round(outputWidth / aspectRatio);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setBusy(false); return; }
    ctx.drawImage(imgEl, sourceX, sourceY, sourceW, sourceH, 0, 0, outputWidth, outH);

    canvas.toBlob(blob => {
      setBusy(false);
      if (blob) {
        const ext = file.type === 'image/png' ? 'png' : 'jpg';
        onCropped(blob, `cropped-${Date.now()}.${ext}`);
      }
    }, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92);
  };

  return (
    <ResponsiveDialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'flex-start' }}>
          Drag to reposition, use the slider to zoom. This is exactly what patients will see.
        </Typography>

        <Box
          sx={{
            width: viewport.w, height: viewport.h, overflow: 'hidden', position: 'relative',
            bgcolor: '#000', borderRadius: 1, border: '1px solid', borderColor: 'divider',
            touchAction: 'none', cursor: imgEl ? 'grab' : 'default',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imgEl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgEl.src}
              alt=""
              draggable={false}
              style={{
                position: 'absolute', left: pos.x, top: pos.y,
                width: dispW, height: dispH, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none',
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <ZoomOutIcon fontSize="small" color="action" />
          <Slider
            size="small" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
            onChange={(_, v) => setZoom(v as number)}
          />
          <ZoomInIcon fontSize="small" color="action" />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={!imgEl || busy} onClick={handleApply}>
          {busy ? 'Applying...' : 'Apply Crop'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
