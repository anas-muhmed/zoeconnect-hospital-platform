'use client';

import { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import SaveIcon from '@mui/icons-material/Save';
import PrintIcon from '@mui/icons-material/Print';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import Slider from '@mui/material/Slider';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuthStore } from '@/lib/store/auth.store';
import { apiClient } from '@/lib/api/client';

// Every distinct line/element on the printed receipt that can have its own
// color intensity, font size, and font family. Keys match what the actual
// print templates (kiosk/[slug], token/kiosk/[code], token/print-kiosk) read
// from config.lineIntensity / lineFontSize / lineFontFamily. `hasFont` is
// false for the divider, since it's a line, not text.
const LINE_DEFS: { key: string; label: string; defaultIntensity: number; defaultFontSize: number; fontWeight: number; hasFont: boolean }[] = [
  { key: 'hospitalName',  label: 'Hospital / Clinic Name',      defaultIntensity: 100, defaultFontSize: 20, fontWeight: 900, hasFont: true },
  { key: 'tagline',       label: 'Tagline',                     defaultIntensity: 100, defaultFontSize: 13, fontWeight: 400, hasFont: true },
  { key: 'tokenLabel',    label: '"Your Token Number" label',   defaultIntensity: 60,  defaultFontSize: 11, fontWeight: 700, hasFont: true },
  { key: 'tokenNumber',   label: 'Token Number',                defaultIntensity: 100, defaultFontSize: 48, fontWeight: 900, hasFont: true },
  { key: 'locationLabel', label: 'Service / Location Name',     defaultIntensity: 100, defaultFontSize: 14, fontWeight: 700, hasFont: true },
  { key: 'divider',       label: 'Divider Line',                defaultIntensity: 30,  defaultFontSize: 0,  fontWeight: 400, hasFont: false },
  { key: 'dateText',      label: 'Date & Time',                 defaultIntensity: 60,  defaultFontSize: 12, fontWeight: 700, hasFont: true },
  { key: 'footerText',    label: 'Footer Text',                 defaultIntensity: 100, defaultFontSize: 12, fontWeight: 400, hasFont: true },
];
const DEFAULT_LINE_SPACING = 1;
// Sanity floor only -- prevents a 0/negative font size, not a design ceiling.
// The receipt paper is fixed-width, but text is allowed to wrap normally
// (multi-word lines simply break onto a second line), so there is no need
// to auto-cap font size against the preview's rendered width. Admins are
// free to size lines as large as they want; if a single very long word
// genuinely doesn't fit, it wraps/overflows visibly in the Live Print
// Preview so they can see and adjust it themselves.
const MIN_FONT_SIZE = 6;
const FONT_FAMILIES = [
  { value: 'inherit', label: 'Default (Monospace)' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
];

export default function PrintConfigPage() {
  const { user, hasPermission } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const [hospitalName, setHospitalName] = useState('');
  const [tagline, setTagline] = useState('');
  const [footerText, setFooterText] = useState('');
  const [paperSize, setPaperSize] = useState('80mm');
  const [kioskBackgroundUrl, setKioskBackgroundUrl] = useState('');
  const [printBufferTime, setPrintBufferTime] = useState(5);
  const [lineSpacing, setLineSpacing] = useState(DEFAULT_LINE_SPACING);
  const [lineIntensity, setLineIntensity] = useState<Record<string, number>>(
    Object.fromEntries(LINE_DEFS.map((l) => [l.key, l.defaultIntensity])),
  );
  const [lineFontSize, setLineFontSize] = useState<Record<string, number>>(
    Object.fromEntries(LINE_DEFS.map((l) => [l.key, l.defaultFontSize])),
  );
  const [lineFontFamily, setLineFontFamily] = useState<Record<string, string>>(
    Object.fromEntries(LINE_DEFS.map((l) => [l.key, 'inherit'])),
  );

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiClient.get('/token/print-config')
      .then(res => {
        const config = res.data;
        setHospitalName(config.hospitalName || '');
        setTagline(config.tagline || '');
        setFooterText(config.footerText || '');
        setPaperSize(config.paperSize || '80mm');
        setKioskBackgroundUrl(config.kioskBackgroundUrl || '');
        setPrintBufferTime(config.printBufferTime ?? 5);
        setLineSpacing(config.lineSpacing ?? DEFAULT_LINE_SPACING);
        setLineIntensity({
          ...Object.fromEntries(LINE_DEFS.map((l) => [l.key, l.defaultIntensity])),
          ...(config.lineIntensity || {}),
        });
        setLineFontSize({
          ...Object.fromEntries(LINE_DEFS.map((l) => [l.key, l.defaultFontSize])),
          ...(config.lineFontSize || {}),
        });
        setLineFontFamily({
          ...Object.fromEntries(LINE_DEFS.map((l) => [l.key, 'inherit'])),
          ...(config.lineFontFamily || {}),
        });
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load config');
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.put('/token/print-config', {
        hospitalName,
        tagline,
        footerText,
        paperSize,
        kioskBackgroundUrl,
        printBufferTime: Math.max(0, printBufferTime),
        lineSpacing,
        lineIntensity,
        lineFontSize,
        lineFontFamily,
      });
      setSuccess('Print configuration saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiClient.post('/token/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setKioskBackgroundUrl(res.data.url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isSuperAdmin = user?.roles?.some((r: any) => r.name === 'SUPER_ADMIN') || user?.roles?.some((r: any) => r.name === 'HOSPITAL_ADMIN');
  if (!isSuperAdmin && !hasPermission('TOKEN:LOCATION:MANAGE')) {
    return <Box p={4}><Alert severity="error">Permission denied.</Alert></Box>;
  }

  if (loading) return <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>;

  // Preview sizing logic (dynamically uses the CSS size provided)
  const isSmall = paperSize.includes('58');
  // Mirrors the opacity/spacing/font helpers the actual print templates use,
  // so the preview on the right reflects every tab's settings live.
  const intensity = (key: string, fallback = 100) => (lineIntensity[key] ?? fallback) / 100;
  const sp = (basePx: number) => `${basePx * lineSpacing}px`;
  const fontPx = (key: string, fallback: number) => `${lineFontSize[key] ?? fallback}px`;
  const fontFam = (key: string) => (lineFontFamily[key] && lineFontFamily[key] !== 'inherit' ? lineFontFamily[key] : undefined);

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <PrintIcon color="primary" fontSize="large" />
        <Box>
          <Typography variant="h5" fontWeight={700}>Print Configuration</Typography>
          <Typography variant="body2" color="text.secondary">Customize the thermal print template and kiosk appearance.</Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

      <Grid container spacing={4}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
              <Tab label="Print Details" />
              <Tab label="Line Spacing & Color" />
            </Tabs>

            <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {tab === 0 && (
                <>
                  <TextField
                    label="Paper Width"
                    value={paperSize}
                    onChange={e => setPaperSize(e.target.value)}
                    fullWidth
                    helperText="Enter a CSS width (e.g. 58mm, 80mm, 3in). Standard thermal printers are 58mm or 80mm."
                  />

                  <TextField
                    label="Print Buffer Time (seconds)"
                    type="number"
                    value={printBufferTime}
                    onChange={e => setPrintBufferTime(Math.max(0, parseInt(e.target.value) || 0))}
                    fullWidth
                    inputProps={{ min: 0, max: 60 }}
                    helperText={
                      printBufferTime === 0
                        ? 'Buffer disabled — kiosk redirects immediately after printing, no confirmation screen shown.'
                        : `Kiosk shows the issued token for ${printBufferTime}s with a countdown, then resets automatically.`
                    }
                  />

                  <TextField
                    label="Hospital / Clinic Name"
                    value={hospitalName}
                    onChange={e => setHospitalName(e.target.value)}
                    fullWidth
                    helperText="Appears at the top of the printed token exactly as typed here — upper/lower case is preserved."
                  />

                  <TextField
                    label="Tagline"
                    value={tagline}
                    onChange={e => setTagline(e.target.value)}
                    fullWidth
                    helperText="Appears directly below the hospital name."
                  />

                  <TextField
                    label="Footer Text"
                    value={footerText}
                    onChange={e => setFooterText(e.target.value)}
                    fullWidth
                    multiline
                    rows={3}
                    helperText="Instructions or notes printed at the bottom of the token."
                  />

                  <Typography variant="h6" fontWeight={700} sx={{ mt: 2 }}>Kiosk Screen Appearance</Typography>

                  <Box>
                    <Typography variant="body2" color="text.secondary" mb={1}>Background Image</Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                      />
                      <Button
                        variant="outlined"
                        startIcon={uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        Upload Image
                      </Button>
                      {kioskBackgroundUrl && (
                        <Button color="error" startIcon={<DeleteIcon />} onClick={() => setKioskBackgroundUrl('')}>
                          Clear
                        </Button>
                      )}
                    </Box>
                    {kioskBackgroundUrl && (
                      <Box mt={2}>
                        <img src={kioskBackgroundUrl} alt="Background Preview" style={{ height: 100, borderRadius: 8, objectFit: 'cover' }} />
                      </Box>
                    )}
                  </Box>
                </>
              )}

              {tab === 1 && (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>Line Height</Typography>
                    <Slider
                      size="small"
                      value={lineSpacing}
                      onChange={(_, v) => setLineSpacing(v as number)}
                      min={0.5}
                      max={2}
                      step={0.05}
                      valueLabelDisplay="auto"
                      sx={{ flex: 1 }}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ width: 42, textAlign: 'right' }}>{lineSpacing.toFixed(2)}x</Typography>
                  </Box>

                  <TableContainer>
                    <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.75, px: 1 } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, width: '20%' }}>Line</TableCell>
                          <TableCell sx={{ fontWeight: 700, width: '30%' }}>Color Intensity</TableCell>
                          <TableCell sx={{ fontWeight: 700, width: '15%' }}>Font Size</TableCell>
                          <TableCell sx={{ fontWeight: 700, width: '35%' }}>Font Type</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {LINE_DEFS.map((line) => (
                          <TableRow key={line.key}>
                            <TableCell>
                              <Typography variant="caption" fontWeight={600}>{line.label}</Typography>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box
                                  sx={{
                                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                                    bgcolor: `rgba(0,0,0,${(lineIntensity[line.key] ?? line.defaultIntensity) / 100})`,
                                    border: '1px solid', borderColor: 'divider',
                                  }}
                                />
                                <Slider
                                  size="small"
                                  value={lineIntensity[line.key] ?? line.defaultIntensity}
                                  onChange={(_, v) => setLineIntensity((prev) => ({ ...prev, [line.key]: v as number }))}
                                  min={0}
                                  max={100}
                                  step={5}
                                  sx={{ flex: 1 }}
                                />
                                <Typography variant="caption" color="text.secondary" sx={{ width: 30 }}>
                                  {lineIntensity[line.key] ?? line.defaultIntensity}%
                                </Typography>
                              </Box>
                            </TableCell>
                            {line.hasFont ? (() => {
                              const currentSize = lineFontSize[line.key] ?? line.defaultFontSize;
                              return (
                              <>
                                <TableCell>
                                  <TextField
                                    type="number"
                                    size="small"
                                    sx={{ width: 70 }}
                                    value={currentSize}
                                    onChange={(e) => {
                                      const raw = parseInt(e.target.value) || line.defaultFontSize;
                                      setLineFontSize((prev) => ({ ...prev, [line.key]: Math.max(MIN_FONT_SIZE, raw) }));
                                    }}
                                    inputProps={{ min: MIN_FONT_SIZE, style: { padding: '4px 8px' } }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    select
                                    size="small"
                                    fullWidth
                                    value={lineFontFamily[line.key] ?? 'inherit'}
                                    onChange={(e) => setLineFontFamily((prev) => ({ ...prev, [line.key]: e.target.value }))}
                                    SelectProps={{ sx: { '& .MuiSelect-select': { py: '4px' } } }}
                                  >
                                    {FONT_FAMILIES.map((f) => (
                                      <MenuItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</MenuItem>
                                    ))}
                                  </TextField>
                                </TableCell>
                              </>
                              );
                            })() : (
                              <TableCell colSpan={2} />
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </Box>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', fontWeight: 800 }}>
            Live Print Preview
          </Typography>
          <Box sx={{
            bgcolor: '#f1f5f9',
            borderRadius: 3,
            p: 4,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            minHeight: 500,
            position: 'sticky',
            top: 16,
          }}>
            <Paper elevation={3} sx={{
              width: paperSize || '80mm',
              maxWidth: '100%',
              // Fixed to exactly what was entered in Print Details -- never
              // grows or shrinks based on font size. Any text too wide wraps
              // or breaks inside this boundary instead of resizing it.
              flexShrink: 0,
              overflow: 'hidden',
              boxSizing: 'border-box',
              p: 3,
              borderRadius: 0,
              bgcolor: 'white',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              color: 'black',
              transition: 'width 0.3s ease',
              '& .MuiTypography-root': {
                maxWidth: '100%',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              },
            }}>
              {/* Hospital name is shown exactly as typed — no forced case transform */}
              <Typography
                sx={{
                  mb: sp(4), fontWeight: 900, lineHeight: 1.2, width: '100%',
                  fontSize: fontPx('hospitalName', isSmall ? 19.2 : 24),
                  fontFamily: fontFam('hospitalName'),
                  opacity: intensity('hospitalName'),
                }}
              >
                {hospitalName || 'Hospital Name'}
              </Typography>
              <Typography
                sx={{
                  mb: sp(24), fontStyle: 'italic', color: '#555', width: '100%',
                  fontSize: fontPx('tagline', isSmall ? 12 : 14),
                  fontFamily: fontFam('tagline'),
                  opacity: intensity('tagline'),
                }}
              >
                {tagline || 'Your tagline here'}
              </Typography>

              <Typography
                sx={{
                  mb: sp(8), fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, width: '100%',
                  fontSize: fontPx('tokenLabel', 11),
                  fontFamily: fontFam('tokenLabel'),
                  opacity: intensity('tokenLabel', 60),
                }}
              >
                Your Token Number
              </Typography>

              <Box sx={{ border: '3px solid black', px: 4, py: 2, my: sp(8), borderRadius: 2, opacity: intensity('tokenNumber') }}>
                <Typography
                  sx={{
                    fontWeight: 900, lineHeight: 1,
                    fontSize: fontPx('tokenNumber', isSmall ? 48 : 64),
                    fontFamily: fontFam('tokenNumber'),
                  }}
                >
                  42
                </Typography>
              </Box>

              <Typography
                sx={{
                  mb: sp(16), fontWeight: 600, width: '100%',
                  fontSize: fontPx('locationLabel', 14),
                  fontFamily: fontFam('locationLabel'),
                  opacity: intensity('locationLabel'),
                }}
              >
                General Billing
              </Typography>

              <Box sx={{ width: '100%', borderTop: `1px dashed rgba(0,0,0, ${intensity('divider', 30)})`, pt: sp(16) }}>
                <Typography
                  sx={{
                    fontWeight: 600, width: '100%',
                    fontSize: fontPx('dateText', 11.2),
                    fontFamily: fontFam('dateText'),
                    opacity: intensity('dateText', 60),
                  }}
                >
                  Date: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                </Typography>

                {footerText && (
                  <Typography
                    sx={{
                      mt: sp(16), display: 'block', width: '100%',
                      fontSize: fontPx('footerText', isSmall ? 11.2 : 12.8),
                      fontFamily: fontFam('footerText'),
                      opacity: intensity('footerText'),
                    }}
                  >
                    {footerText}
                  </Typography>
                )}
              </Box>
            </Paper>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
