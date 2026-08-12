'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import Switch from '@mui/material/Switch';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface FeedbackQrCode {
  id: string;
  campaignId: string;
  token: string;
  label: string;
  targetType: string;
  targetRef: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

interface FeedbackCampaign {
  id: string;
  name: string;
}

const TARGET_TYPES = ['HOSPITAL', 'BRANCH', 'DEPARTMENT', 'PHARMACY', 'LABORATORY', 'BILLING', 'RECEPTION', 'DOCTOR', 'CUSTOM'];
const PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');

function QrThumb({ id }: { id: string }) {
  const { data } = useQuery<{ dataUrl: string }>({
    queryKey: ['feedback-qr-png', id],
    queryFn: () => apiClient.get(`/feedback/qr-codes/${id}/png`).then(r => r.data),
  });
  if (!data) return <Box sx={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={20} /></Box>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={data.dataUrl} alt="QR code" width={140} height={140} />;
}

const emptyDto = { campaignId: '', label: '', targetType: 'RECEPTION', targetRef: '', expiresAt: '' };

export default function FeedbackQrCodesPageWrapper() {
  return <Suspense fallback={null}><FeedbackQrCodesPage /></Suspense>;
}

function FeedbackQrCodesPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const campaignFilter = searchParams.get('campaignId') ?? '';
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dto, setDto] = useState({ ...emptyDto, campaignId: campaignFilter });
  const [formError, setFormError] = useState('');

  const { data: qrCodes = [], isLoading } = useQuery<FeedbackQrCode[]>({
    queryKey: ['feedback-qr-codes', campaignFilter],
    queryFn: () => apiClient.get('/feedback/qr-codes', { params: campaignFilter ? { campaignId: campaignFilter } : {} }).then(r => r.data),
  });

  const { data: campaigns = [] } = useQuery<FeedbackCampaign[]>({
    queryKey: ['feedback-campaigns'],
    queryFn: () => apiClient.get('/feedback/campaigns').then(r => r.data),
  });
  const campaignName = (id: string) => campaigns.find(c => c.id === id)?.name ?? 'Unknown campaign';

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['feedback-qr-codes'] });

  const openCreate = () => { setDto({ ...emptyDto, campaignId: campaignFilter }); setFormError(''); setDialogOpen(true); };

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/feedback/qr-codes', {
      ...dto,
      targetRef: dto.targetRef || undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt).toISOString() : undefined,
    }),
    onSuccess: () => { invalidate(); setDialogOpen(false); },
    onError: (e: any) => setFormError(e?.response?.data?.message ?? 'Failed to generate QR code'),
  });

  // These previously had no onError handler at all -- a failed PATCH (permission
  // issue, network blip, validation error) silently did nothing, so the Switch
  // could look "flipped" in the UI for a moment while the server never actually
  // changed anything, with no indication to the user that it hadn't worked.
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/feedback/qr-codes/${id}`, { isActive }),
    onSuccess: invalidate,
    onError: (e: any) => { alert(e?.response?.data?.message ?? 'Failed to change QR code status'); invalidate(); },
  });

  const regenerateMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/feedback/qr-codes/${id}/regenerate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['feedback-qr-codes'] }); queryClient.invalidateQueries({ queryKey: ['feedback-qr-png'] }); },
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Failed to regenerate QR code'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/feedback/qr-codes/${id}`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Failed to delete QR code'),
  });

  const publicUrl = (qr: FeedbackQrCode) => `${PUBLIC_ORIGIN}/feedback/f/${qr.token}`;

  const copyLink = async (qr: FeedbackQrCode) => {
    try { await navigator.clipboard.writeText(publicUrl(qr)); } catch { /* clipboard unavailable */ }
  };

  const downloadSvg = async (qr: FeedbackQrCode) => {
    const res = await apiClient.get(`/feedback/qr-codes/${qr.id}/svg`, { responseType: 'text' });
    const blob = new Blob([res.data], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${qr.label.replace(/\s+/g, '-')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printAll = () => window.print();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading QR codes...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }} className="no-print">
        <Box>
          <Typography variant="h5" fontWeight={700}>Feedback QR Codes</Typography>
          <Typography variant="body2" color="text.secondary">
            {campaignFilter ? `Showing QR codes for "${campaignName(campaignFilter)}"` : 'Generate printable QR codes that link to the public feedback portal.'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {qrCodes.length > 0 && (
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={printAll}>Print All</Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Generate QR Code</Button>
        </Box>
      </Box>

      {qrCodes.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }} className="no-print">
          <Typography color="text.secondary">No QR codes yet. Generate one for a campaign to start collecting feedback.</Typography>
        </Paper>
      )}

      <Grid container spacing={2}>
        {qrCodes.map(qr => (
          <Grid item xs={12} sm={6} md={4} key={qr.id}>
            <Paper sx={{ p: 2, textAlign: 'center' }} className="qr-print-card">
              <QrThumb id={qr.id} />
              <Typography fontWeight={700} sx={{ mt: 1 }}>{qr.label}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {campaignName(qr.campaignId)}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mt: 0.5 }} className="no-print">
                <Chip size="small" label={qr.targetType} />
                <Chip size="small" label={qr.isActive ? 'Active' : 'Disabled'} color={qr.isActive ? 'success' : 'default'} />
                {qr.expiresAt && <Chip size="small" label={`Expires ${new Date(qr.expiresAt).toLocaleDateString()}`} />}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mt: 1 }} className="no-print">
                <Tooltip title="Copy public link">
                  <IconButton size="small" onClick={() => copyLink(qr)} aria-label="Copy public link"><ContentCopyIcon fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Download SVG">
                  <IconButton size="small" onClick={() => downloadSvg(qr)} aria-label="Download SVG"><DownloadIcon fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title="Regenerate token (old code stops working)">
                  <IconButton size="small" onClick={() => {
                    if (confirm('Regenerate this QR code? The previously printed code will stop working.')) regenerateMutation.mutate(qr.id);
                  }} aria-label="Regenerate token (old code stops working)"><RefreshIcon fontSize="small" /></IconButton>
                </Tooltip>
                <Tooltip title={qr.isActive ? 'Disable' : 'Enable'}>
                  <Switch size="small" checked={qr.isActive}
                    onChange={e => toggleActiveMutation.mutate({ id: qr.id, isActive: e.target.checked })} />
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" onClick={() => {
                    if (confirm(`Delete QR code "${qr.label}"?`)) removeMutation.mutate(qr.id);
                  }} aria-label="Delete"><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <ResponsiveDialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth className="no-print">
        <DialogTitle>Generate QR Code</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            select label="Campaign" value={dto.campaignId}
            onChange={e => setDto(d => ({ ...d, campaignId: e.target.value }))}
            fullWidth
          >
            {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField
            label="Label" value={dto.label}
            onChange={e => setDto(d => ({ ...d, label: e.target.value }))}
            placeholder="e.g. Front Desk QR - Main Branch"
            fullWidth
          />
          <TextField
            select label="Placed At" value={dto.targetType}
            onChange={e => setDto(d => ({ ...d, targetType: e.target.value }))}
            fullWidth
          >
            {TARGET_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField
            label="Target Detail (optional)" value={dto.targetRef}
            onChange={e => setDto(d => ({ ...d, targetRef: e.target.value }))}
            placeholder="e.g. Dr. Smith, or Department name"
            fullWidth
          />
          <TextField
            label="Expires On (optional)" type="date" value={dto.expiresAt}
            onChange={e => setDto(d => ({ ...d, expiresAt: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          {formError && <Alert severity="error">{formError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createMutation.mutate()}
            disabled={!dto.campaignId || !dto.label || createMutation.isPending}>
            {createMutation.isPending ? 'Generating...' : 'Generate'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .qr-print-card { break-inside: avoid; }
        }
      `}</style>
    </Box>
  );
}
