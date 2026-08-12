'use client';

/**
 * Display Pages manager — /token/display-pages
 * Lists all named display pages. Superadmin can create, edit, delete, preview.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Box           from '@mui/material/Box';
import Typography    from '@mui/material/Typography';
import Button        from '@mui/material/Button';
import IconButton    from '@mui/material/IconButton';
import Tooltip       from '@mui/material/Tooltip';
import TextField     from '@mui/material/TextField';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle   from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Chip          from '@mui/material/Chip';
import Snackbar      from '@mui/material/Snackbar';
import Alert         from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Switch        from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import ArrowBackIcon   from '@mui/icons-material/ArrowBack';
import AddIcon         from '@mui/icons-material/Add';
import EditIcon        from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon   from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TvIcon          from '@mui/icons-material/Tv';

import { useAuthStore } from '@/lib/store/auth.store';
import { apiClient }    from '@/lib/api/client';
import { useQuery }     from '@tanstack/react-query';
import { licenseApi }   from '@/lib/api/license.api';
import { getTokenDisplayUrl } from '@/lib/utils/token-display-url';

interface DisplayPage {
  id:        string;
  slug:      string;
  title:     string;
  isActive:  boolean;
  createdAt: string;
  updatedAt: string;
}

const ROW_STYLE = {
  display: 'grid',
  gridTemplateColumns: '1fr 160px 100px 180px',
  alignItems: 'center',
  gap: 2,
  px: 2,
  py: 1.5,
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

export default function DisplayPagesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.roles?.some((r: any) => r.name === 'SUPER_ADMIN') ?? false;

  const { data: licenseStatus } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    staleTime: 60_000,
  });

  const [pages,   setPages]   = useState<DisplayPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newSlug,    setNewSlug]    = useState('');
  const [newTitle,   setNewTitle]   = useState('');
  const [creating,   setCreating]   = useState(false);
  const [slugError,  setSlugError]  = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<DisplayPage | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get<DisplayPage[]>('/token/display-pages')
      .then((r) => setPages(r.data))
      .catch(() => setToast({ msg: 'Failed to load pages', severity: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    const slug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) { setSlugError('Slug is required'); return; }
    setCreating(true);
    try {
      await apiClient.post('/token/display-pages', { slug, title: newTitle.trim() || slug });
      setToast({ msg: `Page "${slug}" created`, severity: 'success' });
      setCreateOpen(false);
      setNewSlug('');
      setNewTitle('');
      // Navigate straight to the canvas builder for the new page
      router.push(`/token/display-config?slug=${slug}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to create page';
      setToast({ msg, severity: 'error' });
    } finally {
      setCreating(false);
    }
  };

  // ── Toggle active ───────────────────────────────────────────────────────────

  const handleToggle = async (page: DisplayPage) => {
    try {
      await apiClient.patch(`/token/display-pages/${page.slug}`, { isActive: !page.isActive });
      setPages((prev) => prev.map((p) => p.id === page.id ? { ...p, isActive: !p.isActive } : p));
    } catch {
      setToast({ msg: 'Failed to update page', severity: 'error' });
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/token/display-pages/${deleteTarget.slug}`);
      setPages((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setToast({ msg: `Page "${deleteTarget.slug}" deleted`, severity: 'success' });
      setDeleteTarget(null);
    } catch {
      setToast({ msg: 'Failed to delete page', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const copyLink = (slug: string) => {
    const url = getTokenDisplayUrl(slug, licenseStatus?.deploymentMode, licenseStatus?.hospitalCode, true);
    navigator.clipboard.writeText(url).then(() => {
      setToast({ msg: 'Link copied to clipboard', severity: 'success' });
    });
  };

  if (!isSuperAdmin) return (
    <Box sx={{ p: 4 }}><Typography color="error">Access denied — superadmin only</Typography></Box>
  );

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#0d1117', color: '#fff', pb: 6 }}>

      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton size="small" onClick={() => router.push('/token')} sx={{ color: 'rgba(255,255,255,0.5)' }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <TvIcon sx={{ color: '#4caf50', fontSize: 20 }} />
          <Box>
            <Typography fontWeight={700} sx={{ fontSize: '1rem', lineHeight: 1.2 }}>Display Pages</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
              Manage named TV display URLs
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained" color="success" size="small"
          startIcon={<AddIcon />}
          onClick={() => { setCreateOpen(true); setNewSlug(''); setNewTitle(''); setSlugError(''); }}
          sx={{ fontWeight: 700 }}
        >
          New Page
        </Button>
      </Box>

      {/* ── Default page info card ── */}
      <Box sx={{ mx: 3, mt: 3, p: 2, borderRadius: 2, border: '1px solid rgba(76,175,80,0.2)', bgcolor: 'rgba(76,175,80,0.04)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#4caf50' }}>Default Display</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', mt: 0.25 }}>
              {window?.location?.origin ?? ''}/token/display · Always active · Uses global canvas config
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" startIcon={<EditIcon />}
              onClick={() => router.push('/token/display-config')}
              sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.15)' }}>
              Edit canvas
            </Button>
            <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />}
              onClick={() => window.open('/token/display', '_blank')}
              sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.15)' }}>
              Preview
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ── Custom pages list ── */}
      <Box sx={{ mx: 3, mt: 3, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>

        {/* Table header */}
        <Box sx={{ ...ROW_STYLE, py: 1, bgcolor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Page / URL</Typography>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Created</Typography>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Status</Typography>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Actions</Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={24} sx={{ color: '#4caf50' }} />
          </Box>
        ) : pages.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.25)' }}>No custom pages yet</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.15)', mt: 0.5 }}>Click "New Page" to create your first named display URL</Typography>
          </Box>
        ) : pages.map((page) => (
          <Box key={page.id} sx={{ ...ROW_STYLE, '&:last-child': { borderBottom: 'none' }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>

            {/* Title + slug */}
            <Box>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                {page.title || page.slug}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                {getTokenDisplayUrl(page.slug, licenseStatus?.deploymentMode, licenseStatus?.hospitalCode)}
              </Typography>
            </Box>

            {/* Date */}
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>
              {new Date(page.createdAt).toLocaleDateString()}
            </Typography>

            {/* Active toggle */}
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={page.isActive}
                  onChange={() => handleToggle(page)}
                  sx={{ '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#4caf5088' } }}
                />
              }
              label={
                <Typography sx={{ fontSize: '0.72rem', color: page.isActive ? '#4caf50' : 'rgba(255,255,255,0.3)' }}>
                  {page.isActive ? 'Active' : 'Inactive'}
                </Typography>
              }
            />

            {/* Actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Copy link">
                <IconButton size="small" onClick={() => copyLink(page.slug)} sx={{ color: 'rgba(255,255,255,0.45)', '&:hover': { color: '#fff' } }} aria-label="Copy link">
                  <ContentCopyIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Preview in new tab">
                <IconButton size="small" onClick={() => window.open(getTokenDisplayUrl(page.slug, licenseStatus?.deploymentMode, licenseStatus?.hospitalCode), '_blank')} sx={{ color: 'rgba(255,255,255,0.45)', '&:hover': { color: '#fff' } }} aria-label="Preview in new tab">
                  <OpenInNewIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit canvas">
                <IconButton size="small" onClick={() => router.push(`/token/display-config?slug=${page.slug}`)} sx={{ color: 'rgba(255,255,255,0.45)', '&:hover': { color: '#4caf50' } }} aria-label="Edit canvas">
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete page">
                <IconButton size="small" onClick={() => setDeleteTarget(page)} sx={{ color: 'rgba(255,255,255,0.3)', '&:hover': { color: '#ef5350' } }} aria-label="Delete page">
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        ))}
      </Box>

      {/* ── Create dialog ── */}
      <ResponsiveDialog
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        PaperProps={{ sx: { bgcolor: '#1a2035', color: '#fff', minWidth: 420, borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Create new display page</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', mb: 0.75 }}>
              Page slug <span style={{ color: 'rgba(255,255,255,0.25)' }}>(used in the URL)</span>
            </Typography>
            <TextField
              fullWidth size="small" autoFocus
              placeholder="e.g. pharmacy-tv or lobby-ad"
              value={newSlug}
              error={!!slugError}
              helperText={slugError || (newSlug ? `URL: ${getTokenDisplayUrl(newSlug.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''), licenseStatus?.deploymentMode, licenseStatus?.hospitalCode)}` : '')}
              onChange={(e) => { setNewSlug(e.target.value); setSlugError(''); }}
              InputProps={{ sx: { color: '#fff', fontFamily: 'monospace', fontSize: '0.9rem', bgcolor: 'rgba(255,255,255,0.06)', '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' } } }}
              FormHelperTextProps={{ sx: { color: slugError ? '#ef5350' : 'rgba(255,255,255,0.3)', fontSize: '0.7rem', fontFamily: 'monospace' } }}
            />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', mb: 0.75 }}>
              Display title <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional — shown in management list)</span>
            </Typography>
            <TextField
              fullWidth size="small"
              placeholder="e.g. Pharmacy TV Screen"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              InputProps={{ sx: { color: '#fff', fontSize: '0.9rem', bgcolor: 'rgba(255,255,255,0.06)', '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' } } }}
            />
          </Box>
          <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', bgcolor: 'rgba(76,175,80,0.08)', p: 1.25, borderRadius: 1, border: '1px solid rgba(76,175,80,0.15)' }}>
            After creating, the canvas builder will open so you can design the layout for this page.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setCreateOpen(false)} disabled={creating} sx={{ color: 'rgba(255,255,255,0.4)' }}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleCreate} disabled={creating}
            startIcon={creating ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}>
            {creating ? 'Creating…' : 'Create & design'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ── Delete confirm dialog ── */}
      <ResponsiveDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        PaperProps={{ sx: { bgcolor: '#1a2035', color: '#fff', minWidth: 380, borderRadius: 2, border: '1px solid rgba(239,83,80,0.2)' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete display page?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.7)' }}>
            This will permanently remove <strong style={{ color: '#fff' }}>{deleteTarget ? getTokenDisplayUrl(deleteTarget.slug, licenseStatus?.deploymentMode, licenseStatus?.hospitalCode) : ''}</strong>. The URL will stop working immediately.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting} sx={{ color: 'rgba(255,255,255,0.4)' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineIcon />}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)} sx={{ fontWeight: 600 }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
