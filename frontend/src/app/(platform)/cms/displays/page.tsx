'use client';

import { useState } from 'react';
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
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Popover from '@mui/material/Popover';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CampaignIcon from '@mui/icons-material/Campaign';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import SyncIcon from '@mui/icons-material/Sync';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BuildIcon from '@mui/icons-material/Build';
import Autocomplete from '@mui/material/Autocomplete';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { licenseApi } from '@/lib/api/license.api';
import { getCmsPlayerUrl } from '@/lib/utils/cms-player-url';

interface CMSPlaylist { id: string; name: string; }

interface CMSDisplayAssignment {
  id: string;
  name: string;
  slug: string;
  playlistId: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  groupId: string | null;
  tags: string[];
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  isPaused: boolean;
  tickerEnabled: boolean;
  tickerPosition: 'top' | 'bottom';
  tickerSpeed: number;
  tickerBackgroundColor: string | null;
  tickerTextColor: string | null;
  tickerFontSize: number;
  tickerSeparator: string;
}

type TickerSourceType = 'MANUAL' | 'EMERGENCY' | 'QUEUE' | 'API_FEED';

interface CMSTickerMessage {
  id: string;
  displayAssignmentId: string;
  text: string;
  sourceType: TickerSourceType;
  sourceRef: string | null;
  priority: number;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

interface CMSDisplayGroup {
  id: string;
  name: string;
  playlistId: string | null;
}

type RemoteCommandType = 'REFRESH' | 'RESTART' | 'CLEAR_CACHE' | 'FORCE_SYNC' | 'PAUSE' | 'RESUME';

interface CMSPlaylistSchedule {
  id: string;
  displayAssignmentId: string;
  playlistId: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  priority: number;
  isActive: boolean;
}

export default function CmsDisplaysPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', playlistId: '' });
  const [formError, setFormError] = useState('');
  const [scheduleDisplay, setScheduleDisplay] = useState<CMSDisplayAssignment | null>(null);
  // Tracked by id (not the whole object) so the dialog always reads the live row from the
  // `displays` query below -- a snapshotted object would go stale as soon as a mutation
  // (e.g. picking a ticker color) invalidates and refetches ['cms-displays'].
  const [tickerDisplayId, setTickerDisplayId] = useState<string | null>(null);

  const { data: displays = [], isLoading } = useQuery<CMSDisplayAssignment[]>({
    queryKey: ['cms-displays'],
    queryFn: () => apiClient.get('/cms/displays').then(r => r.data),
  });

  const { data: playlists = [] } = useQuery<CMSPlaylist[]>({
    queryKey: ['cms-playlists'],
    queryFn: () => apiClient.get('/cms/playlists').then(r => r.data),
  });

  const { data: groups = [] } = useQuery<CMSDisplayGroup[]>({
    queryKey: ['cms-display-groups'],
    queryFn: () => apiClient.get('/cms/display-groups').then(r => r.data),
  });

  const { data: licenseStatus } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    staleTime: 60_000,
  });

  const commandMutation = useMutation({
    mutationFn: ({ id, commandType }: { id: string; commandType: RemoteCommandType }) =>
      apiClient.post(`/cms/display-commands/${id}`, { commandType }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cms-displays'] }),
  });

  const createMutation = useMutation({
    mutationFn: (dto: typeof form) => apiClient.post('/cms/displays', {
      name: dto.name,
      slug: dto.slug,
      playlistId: dto.playlistId || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-displays'] });
      setCreateOpen(false);
      setForm({ name: '', slug: '', playlistId: '' });
    },
    onError: (e: any) => setFormError(e?.response?.data?.message ?? 'Failed to create display'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CMSDisplayAssignment> }) =>
      apiClient.patch(`/cms/displays/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cms-displays'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cms/displays/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cms-displays'] }),
  });

  // Thin wrapper around the shared getCmsPlayerUrl() helper (also used by
  // the CMS Monitoring page) so this page doesn't carry its own copy of the
  // tenant-scoping logic. `hospitalCode` is this tenant's own code from
  // /license/status -- the same field every tenant-aware consumer in the
  // app already treats as the current tenant context.
  const getPlayerUrl = (slug: string, fullAbsolute: boolean = false): string | null =>
    getCmsPlayerUrl(slug, licenseStatus?.hospitalCode, fullAbsolute);

  const copyUrl = (slug: string) => {
    const full = getPlayerUrl(slug, true);
    if (!full) return;
    navigator.clipboard.writeText(full).then(() => {
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    });
  };

  const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading displays...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>CMS Display Assignments</Typography>
          <Typography variant="body2" color="text.secondary">
            Assign a fallback playlist to each display, and optionally add time-based schedules that override it.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setFormError(''); setCreateOpen(true); }}>
          New Display
        </Button>
      </Box>

      {displays.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No displays registered yet. Create one to get a player URL.</Typography>
        </Paper>
      )}

      {displays.map(display => (
        <Paper key={display.id} sx={{ p: 3, mb: 2, opacity: display.isActive ? 1 : 0.6 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography fontWeight={700} variant="h6">{display.name}</Typography>
                <Chip size="small" label={display.isActive ? 'Active' : 'Disabled'} color={display.isActive ? 'success' : 'default'} />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'grey.100', borderRadius: 1, px: 1.5, py: 0.75, mb: 1.5 }}>
                <Typography variant="body2" fontFamily="monospace" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getPlayerUrl(display.slug) ?? 'Resolving tenant…'}
                </Typography>
                <Tooltip title={copiedSlug === display.slug ? 'Copied!' : 'Copy URL'}>
                  <IconButton size="small" onClick={() => copyUrl(display.slug)} aria-label="Copy URL" disabled={!getPlayerUrl(display.slug)}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Open player">
                  <IconButton
                    size="small"
                    component="a"
                    href={getPlayerUrl(display.slug, true) ?? undefined}
                    target="_blank"
                    aria-label="Open player"
                    disabled={!getPlayerUrl(display.slug, true)}
                  >
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              <TextField
                select
                size="small"
                label="Fallback playlist"
                value={display.playlistId ?? ''}
                onChange={e => updateMutation.mutate({ id: display.id, data: { playlistId: e.target.value || null } })}
                helperText="Used when no schedule is currently active"
                sx={{ minWidth: 260 }}
              >
                <MenuItem value="">— No playlist assigned —</MenuItem>
                {playlists.map(p => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </TextField>

              <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
                <TextField
                  select
                  size="small"
                  label="Screen group"
                  value={display.groupId ?? ''}
                  onChange={e => updateMutation.mutate({ id: display.id, data: { groupId: e.target.value || null } as any })}
                  helperText="Used when no schedule is active and no own playlist wins"
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">— No group —</MenuItem>
                  {groups.map(g => (
                    <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                  ))}
                </TextField>

                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={[]}
                  value={display.tags ?? []}
                  onChange={(_e, newValue) => updateMutation.mutate({ id: display.id, data: { tags: newValue as string[] } as any })}
                  renderInput={(params) => <TextField {...params} label="Tags" placeholder="e.g. Reception" />}
                  sx={{ minWidth: 240 }}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Switch size="small" checked={display.maintenanceMode}
                      onChange={e => updateMutation.mutate({ id: display.id, data: { maintenanceMode: e.target.checked } as any })} />
                  }
                  label={<Typography variant="body2">Maintenance mode</Typography>}
                />
                {display.maintenanceMode && (
                  <TextField
                    size="small"
                    placeholder="System Maintenance / Please wait..."
                    value={display.maintenanceMessage ?? ''}
                    onChange={e => updateMutation.mutate({ id: display.id, data: { maintenanceMessage: e.target.value || null } as any })}
                    sx={{ minWidth: 260 }}
                  />
                )}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Switch size="small" checked={display.tickerEnabled}
                      onChange={e => updateMutation.mutate({ id: display.id, data: { tickerEnabled: e.target.checked } as any })} />
                  }
                  label={<Typography variant="body2">Scrolling ticker</Typography>}
                />
                {display.tickerEnabled && (
                  <Chip size="small" icon={<CampaignIcon />} label={`${display.tickerPosition} · speed ${display.tickerSpeed}`} />
                )}
              </Box>

              <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button size="small" startIcon={<ScheduleIcon />} onClick={() => setScheduleDisplay(display)}>
                  Manage Schedules
                </Button>
                <Button size="small" startIcon={<CampaignIcon />} onClick={() => setTickerDisplayId(display.id)}>
                  Manage Ticker
                </Button>
                <Tooltip title="Refresh player">
                  <IconButton size="small" onClick={() => commandMutation.mutate({ id: display.id, commandType: 'REFRESH' })} aria-label="Refresh player">
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Restart player">
                  <IconButton size="small" onClick={() => commandMutation.mutate({ id: display.id, commandType: 'RESTART' })} aria-label="Restart player">
                    <RestartAltIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Clear cache">
                  <IconButton size="small" onClick={() => commandMutation.mutate({ id: display.id, commandType: 'CLEAR_CACHE' })} aria-label="Clear cache">
                    <CleaningServicesIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Force sync">
                  <IconButton size="small" onClick={() => commandMutation.mutate({ id: display.id, commandType: 'FORCE_SYNC' })} aria-label="Force sync">
                    <SyncIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={display.isPaused ? 'Resume' : 'Pause'}>
                  <IconButton size="small"
                    onClick={() => commandMutation.mutate({ id: display.id, commandType: display.isPaused ? 'RESUME' : 'PAUSE' })}
                    aria-label={display.isPaused ? 'Resume' : 'Pause'}>
                    {display.isPaused ? <PlayArrowIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              </Box>

              {display.lastSeenAt && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Last seen: {new Date(display.lastSeenAt).toLocaleString()}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {display.maintenanceMode && <BuildIcon fontSize="small" color="warning" />}
              <Tooltip title={display.isActive ? 'Disable' : 'Enable'}>
                <IconButton size="small" color={display.isActive ? 'warning' : 'success'}
                  onClick={() => updateMutation.mutate({ id: display.id, data: { isActive: !display.isActive } })}
                  aria-label={display.isActive ? 'Disable' : 'Enable'}>
                  <PowerSettingsNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete display">
                <IconButton size="small" color="error"
                  onClick={() => {
                    if (confirm(`Delete display "${display.name}"? The player URL will stop working.`)) {
                      removeMutation.mutate(display.id);
                    }
                  }}
                  aria-label="Delete display">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Paper>
      ))}

      <ResponsiveDialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Display</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Display Name"
            value={form.name}
            onChange={e => {
              const name = e.target.value;
              setForm(f => ({ ...f, name, slug: f.slug === slugify(f.name) ? slugify(name) : f.slug }));
            }}
            placeholder="e.g. Main Lobby TV"
            fullWidth
          />
          <TextField
            label="URL Slug"
            value={form.slug}
            onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
            helperText={`Used in the player URL: /player/${licenseStatus?.hospitalCode ?? '…'}/<slug>`}
            fullWidth
          />
          <TextField select label="Playlist (optional)" value={form.playlistId}
            onChange={e => setForm(f => ({ ...f, playlistId: e.target.value }))} fullWidth>
            <MenuItem value="">— Assign later —</MenuItem>
            {playlists.map(p => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </TextField>
          {formError && <Alert severity="error">{formError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createMutation.mutate(form)}
            disabled={!form.name || !form.slug || createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {scheduleDisplay && (
        <ScheduleManagerDialog
          display={scheduleDisplay}
          playlists={playlists}
          onClose={() => setScheduleDisplay(null)}
        />
      )}

      {tickerDisplayId && displays.find(d => d.id === tickerDisplayId) && (
        <TickerManagerDialog
          display={displays.find(d => d.id === tickerDisplayId)!}
          onClose={() => setTickerDisplayId(null)}
        />
      )}
    </Box>
  );
}

// ── Schedule Manager Dialog ───────────────────────────────────────────────────
function ScheduleManagerDialog({
  display, playlists, onClose,
}: {
  display: CMSDisplayAssignment;
  playlists: CMSPlaylist[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CMSPlaylistSchedule | 'new' | null>(null);

  const { data: schedules = [], isLoading } = useQuery<CMSPlaylistSchedule[]>({
    queryKey: ['cms-schedules', display.id],
    queryFn: () => apiClient.get(`/cms/displays/${display.id}/schedules`).then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cms-schedules', display.id] });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cms/schedules/${id}`),
    onSuccess: invalidate,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/cms/schedules/${id}`, { isActive }),
    onSuccess: invalidate,
  });

  const playlistName = (id: string) => playlists.find(p => p.id === id)?.name ?? 'Unknown playlist';

  const describeWindow = (s: CMSPlaylistSchedule) => {
    const parts: string[] = [];
    if (s.startTime || s.endTime) {
      parts.push(`${s.startTime?.slice(0, 5) ?? '00:00'}–${s.endTime?.slice(0, 5) ?? '23:59'}`);
    }
    if (s.startDate || s.endDate) {
      parts.push(`${s.startDate ?? '…'} → ${s.endDate ?? '…'}`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'All day, every day';
  };

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Schedules — <Typography component="span" fontWeight={400}>{display.name}</Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          When multiple schedules overlap, the highest priority wins. If no schedule is active, the display falls back to its assigned fallback playlist.
        </Typography>

        {isLoading ? (
          <CircularProgress size={24} />
        ) : schedules.length === 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>No schedules yet — this display always shows its fallback playlist.</Alert>
        ) : (
          <List dense disablePadding sx={{ mb: 2 }}>
            {schedules.map(s => (
              <ListItem
                key={s.id}
                disablePadding
                sx={{ bgcolor: 'grey.50', borderRadius: 1, mb: 0.5, px: 1.5, py: 0.75, border: '1px solid', borderColor: 'divider', opacity: s.isActive ? 1 : 0.5 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                      <Chip size="small" label={`Priority ${s.priority}`} />
                    </Box>
                  }
                  secondary={`${playlistName(s.playlistId)} · ${describeWindow(s)}`}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <ListItemSecondaryAction sx={{ display: 'flex', gap: 0.5 }}>
                  <Switch size="small" checked={s.isActive}
                    onChange={e => toggleMutation.mutate({ id: s.id, isActive: e.target.checked })} />
                  <IconButton size="small" onClick={() => setEditing(s)} aria-label="Edit schedule">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => removeMutation.mutate(s.id)} aria-label="Delete schedule">
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
          Add Schedule
        </Button>

        {editing && (
          <>
            <Divider sx={{ my: 2 }} />
            <ScheduleForm
              displayId={display.id}
              playlists={playlists}
              existing={editing === 'new' ? null : editing}
              onDone={() => { setEditing(null); invalidate(); }}
              onCancel={() => setEditing(null)}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Schedule Create/Edit Form ─────────────────────────────────────────────────
function ScheduleForm({
  displayId, playlists, existing, onDone, onCancel,
}: {
  displayId: string;
  playlists: CMSPlaylist[];
  existing: CMSPlaylistSchedule | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    playlistId: existing?.playlistId ?? '',
    startTime: existing?.startTime?.slice(0, 5) ?? '',
    endTime: existing?.endTime?.slice(0, 5) ?? '',
    startDate: existing?.startDate ?? '',
    endDate: existing?.endDate ?? '',
    priority: existing?.priority ?? 0,
  });
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        playlistId: form.playlistId,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        priority: Number(form.priority) || 0,
      };
      return existing
        ? apiClient.patch(`/cms/schedules/${existing.id}`, payload)
        : apiClient.post(`/cms/displays/${displayId}/schedules`, payload);
    },
    onSuccess: onDone,
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to save schedule'),
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2">{existing ? 'Edit Schedule' : 'New Schedule'}</Typography>
      <TextField size="small" label="Name" value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        placeholder="e.g. Morning Rotation" fullWidth />
      <TextField select size="small" label="Playlist" value={form.playlistId}
        onChange={e => setForm(f => ({ ...f, playlistId: e.target.value }))} fullWidth>
        {playlists.map(p => (
          <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField size="small" label="Start time" type="time" value={form.startTime}
          onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
          InputLabelProps={{ shrink: true }} fullWidth />
        <TextField size="small" label="End time" type="time" value={form.endTime}
          onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
          InputLabelProps={{ shrink: true }} fullWidth />
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField size="small" label="Start date" type="date" value={form.startDate}
          onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
          InputLabelProps={{ shrink: true }} fullWidth />
        <TextField size="small" label="End date" type="date" value={form.endDate}
          onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
          InputLabelProps={{ shrink: true }} fullWidth />
      </Box>
      <TextField size="small" label="Priority (higher wins overlaps)" type="number" value={form.priority}
        onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
        sx={{ width: 240 }} />

      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button size="small" variant="contained"
          disabled={!form.name || !form.playlistId || saveMutation.isPending}
          onClick={() => { setError(''); saveMutation.mutate(); }}>
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}

// ── Color Palette Picker ──────────────────────────────────────────────────────
// A curated swatch grid (rather than a bare hex text field) so admins pick a
// ticker color instead of hand-typing one. "Custom…" still opens the native
// OS color picker for anything outside the presets, and the resulting hex/
// rgba string is what actually gets saved -- same shape as before, just a
// friendlier way to set it.
const TICKER_BACKGROUND_PRESETS = [
  'rgba(0,0,0,0.75)', '#000000', '#0d1b2a', '#1a2332', '#7f1d1d',
  '#14532d', '#1e3a8a', '#78350f', '#3730a3', '#4a044e', '#ffffff',
];
const TICKER_TEXT_PRESETS = [
  '#ffffff', '#000000', '#facc15', '#f87171', '#4ade80',
  '#60a5fa', '#fb923c', '#e879f9', '#94a3b8',
];

function ColorPalettePicker({
  label, value, defaultValue, presets, onChange,
}: {
  label: string;
  value: string | null;
  defaultValue: string;
  presets: string[];
  onChange: (value: string | null) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const current = value ?? defaultValue;
  const open = Boolean(anchorEl);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{label}</Typography>
      <Box
        onClick={e => setAnchorEl(e.currentTarget)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
          border: '1px solid', borderColor: 'divider', borderRadius: 1,
          px: 1, py: 0.5, minWidth: 130, height: 36, boxSizing: 'border-box',
        }}
      >
        <Box sx={{
          width: 20, height: 20, borderRadius: 0.5, flexShrink: 0,
          bgcolor: current, border: '1px solid rgba(0,0,0,0.2)',
          backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
          backgroundSize: '8px 8px', backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
        }}>
          <Box sx={{ width: '100%', height: '100%', borderRadius: 0.5, bgcolor: current }} />
        </Box>
        <Typography variant="body2" sx={{ fontSize: '0.8rem' }} noWrap>{value ? current : 'Default'}</Typography>
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, width: 200 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{label}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0.75, mb: 1.5 }}>
            {presets.map(color => (
              <Tooltip title={color} key={color}>
                <Box
                  onClick={() => { onChange(color); setAnchorEl(null); }}
                  sx={{
                    width: 26, height: 26, borderRadius: 0.5, bgcolor: color, cursor: 'pointer',
                    border: current === color ? '2px solid' : '1px solid',
                    borderColor: current === color ? 'primary.main' : 'rgba(0,0,0,0.2)',
                  }}
                />
              </Tooltip>
            ))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="label" sx={{
              width: 26, height: 26, borderRadius: 0.5, flexShrink: 0, position: 'relative', overflow: 'hidden',
              cursor: 'pointer', border: '1px solid rgba(0,0,0,0.2)',
              backgroundImage: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
            }}>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : '#000000'}
                onChange={e => onChange(e.target.value)}
                style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">Custom…</Typography>
            {value && (
              <Button size="small" sx={{ ml: 'auto', minWidth: 0, fontSize: '0.7rem' }} onClick={() => { onChange(null); setAnchorEl(null); }}>
                Reset
              </Button>
            )}
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}

// ── Ticker Manager Dialog ─────────────────────────────────────────────────────
// Two halves: per-display style/behavior settings (position, speed, colors --
// stored directly on CMSDisplayAssignment, same PATCH used everywhere else on
// this page), and the message list (separately CRUD'd rows in
// CMSTickerMessage, mirroring ScheduleManagerDialog below it exactly). The
// ticker itself runs independently of the playlist -- these messages never
// occupy a playlist slot, they scroll continuously on top of whatever is
// currently playing (see the player's TickerOverlay).
function TickerManagerDialog({
  display, onClose,
}: {
  display: CMSDisplayAssignment;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CMSTickerMessage | 'new' | null>(null);

  const { data: messages = [], isLoading } = useQuery<CMSTickerMessage[]>({
    queryKey: ['cms-ticker-messages', display.id],
    queryFn: () => apiClient.get(`/cms/displays/${display.id}/ticker-messages`).then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cms-ticker-messages', display.id] });
  const invalidateDisplays = () => queryClient.invalidateQueries({ queryKey: ['cms-displays'] });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cms/ticker-messages/${id}`),
    onSuccess: invalidate,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/cms/ticker-messages/${id}`, { isActive }),
    onSuccess: invalidate,
  });

  const settingsMutation = useMutation({
    mutationFn: (data: Partial<CMSDisplayAssignment>) => apiClient.patch(`/cms/displays/${display.id}`, data),
    onSuccess: invalidateDisplays,
  });

  const sourceLabel = (t: TickerSourceType) =>
    t === 'MANUAL' ? 'Manual' : t === 'EMERGENCY' ? 'Emergency' : t === 'QUEUE' ? 'Queue' : 'API Feed';

  const describeWindow = (m: CMSTickerMessage) => {
    const parts: string[] = [];
    if (m.startTime || m.endTime) parts.push(`${m.startTime?.slice(0, 5) ?? '00:00'}–${m.endTime?.slice(0, 5) ?? '23:59'}`);
    if (m.startDate || m.endDate) parts.push(`${m.startDate ?? '…'} → ${m.endDate ?? '…'}`);
    return parts.length > 0 ? parts.join(' · ') : 'All day, every day';
  };

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Scrolling Ticker — <Typography component="span" fontWeight={400}>{display.name}</Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Runs as a continuous overlay bar independent of the playlist -- everything (images, videos,
          widgets) keeps playing normally underneath it. Add multiple messages with priority and
          scheduling; all currently-active ones scroll together.
        </Typography>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Appearance</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
          <TextField
            select size="small" label="Position" value={display.tickerPosition}
            onChange={e => settingsMutation.mutate({ tickerPosition: e.target.value as 'top' | 'bottom' })}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="bottom">Bottom</MenuItem>
            <MenuItem value="top">Top</MenuItem>
          </TextField>
          <TextField
            size="small" label="Speed (0.5–10)" type="number" value={display.tickerSpeed}
            inputProps={{ min: 0.5, max: 10, step: 0.5 }}
            onChange={e => settingsMutation.mutate({ tickerSpeed: Number(e.target.value) })}
            sx={{ width: 140 }}
          />
          <ColorPalettePicker
            label="Background color"
            value={display.tickerBackgroundColor}
            defaultValue="rgba(0,0,0,0.75)"
            presets={TICKER_BACKGROUND_PRESETS}
            onChange={v => settingsMutation.mutate({ tickerBackgroundColor: v })}
          />
          <ColorPalettePicker
            label="Text color"
            value={display.tickerTextColor}
            defaultValue="#ffffff"
            presets={TICKER_TEXT_PRESETS}
            onChange={v => settingsMutation.mutate({ tickerTextColor: v })}
          />
          <TextField
            size="small" label="Font size (em)" type="number" value={display.tickerFontSize}
            inputProps={{ min: 0.5, max: 4, step: 0.1 }}
            onChange={e => settingsMutation.mutate({ tickerFontSize: Number(e.target.value) })}
            sx={{ width: 140 }}
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Messages</Typography>
        {isLoading ? (
          <CircularProgress size={24} />
        ) : messages.length === 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>No messages yet — the ticker won't show anything until one is added.</Alert>
        ) : (
          <List dense disablePadding sx={{ mb: 2 }}>
            {messages.map(m => (
              <ListItem
                key={m.id}
                disablePadding
                sx={{ bgcolor: 'grey.50', borderRadius: 1, mb: 0.5, px: 1.5, py: 0.75, border: '1px solid', borderColor: 'divider', opacity: m.isActive ? 1 : 0.5 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.text}
                      </Typography>
                      <Chip size="small" label={sourceLabel(m.sourceType)} />
                      <Chip size="small" label={`Priority ${m.priority}`} />
                    </Box>
                  }
                  secondary={describeWindow(m)}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <ListItemSecondaryAction sx={{ display: 'flex', gap: 0.5 }}>
                  <Switch size="small" checked={m.isActive}
                    onChange={e => toggleMutation.mutate({ id: m.id, isActive: e.target.checked })} />
                  <IconButton size="small" onClick={() => setEditing(m)} aria-label="Edit ticker message">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => removeMutation.mutate(m.id)} aria-label="Delete ticker message">
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
          Add Message
        </Button>

        {editing && (
          <>
            <Divider sx={{ my: 2 }} />
            <TickerMessageForm
              displayId={display.id}
              existing={editing === 'new' ? null : editing}
              onDone={() => { setEditing(null); invalidate(); }}
              onCancel={() => setEditing(null)}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Ticker Message Create/Edit Form ───────────────────────────────────────────
function TickerMessageForm({
  displayId, existing, onDone, onCancel,
}: {
  displayId: string;
  existing: CMSTickerMessage | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    text: existing?.text ?? '',
    priority: existing?.priority ?? 0,
    startTime: existing?.startTime?.slice(0, 5) ?? '',
    endTime: existing?.endTime?.slice(0, 5) ?? '',
    startDate: existing?.startDate ?? '',
    endDate: existing?.endDate ?? '',
  });
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        text: form.text,
        priority: Number(form.priority) || 0,
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      return existing
        ? apiClient.patch(`/cms/ticker-messages/${existing.id}`, payload)
        : apiClient.post(`/cms/displays/${displayId}/ticker-messages`, { ...payload, sourceType: 'MANUAL' });
    },
    onSuccess: onDone,
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to save ticker message'),
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2">{existing ? 'Edit Message' : 'New Message'}</Typography>
      <TextField size="small" label="Message text" value={form.text}
        onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
        placeholder="e.g. Visiting hours are 10am–8pm daily" multiline minRows={2} fullWidth />
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField size="small" label="Start time" type="time" value={form.startTime}
          onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
          InputLabelProps={{ shrink: true }} fullWidth />
        <TextField size="small" label="End time" type="time" value={form.endTime}
          onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
          InputLabelProps={{ shrink: true }} fullWidth />
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField size="small" label="Start date" type="date" value={form.startDate}
          onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
          InputLabelProps={{ shrink: true }} fullWidth />
        <TextField size="small" label="End date" type="date" value={form.endDate}
          onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
          InputLabelProps={{ shrink: true }} fullWidth />
      </Box>
      <TextField size="small" label="Priority (higher shows first)" type="number" value={form.priority}
        onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
        sx={{ width: 240 }} />

      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button size="small" variant="contained"
          disabled={!form.text.trim() || saveMutation.isPending}
          onClick={() => { setError(''); saveMutation.mutate(); }}>
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}
