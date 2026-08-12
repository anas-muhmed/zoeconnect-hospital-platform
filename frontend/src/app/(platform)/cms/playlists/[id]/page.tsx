'use client';

import { useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import PublishIcon from '@mui/icons-material/Publish';
import HistoryIcon from '@mui/icons-material/History';
import RestoreIcon from '@mui/icons-material/Restore';
import ImageIcon from '@mui/icons-material/Image';
import VideocamIcon from '@mui/icons-material/Videocam';
import QueueIcon from '@mui/icons-material/Queue';
import WidgetsIcon from '@mui/icons-material/Widgets';
import EditIcon from '@mui/icons-material/Edit';
import MenuItem from '@mui/material/MenuItem';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

/**
 * Phase 5: widget plugin config schemas, admin-side. Kept as a small,
 * self-contained duplicate of each plugin's `configSchema` (see
 * app/cms/player/[slug]/renderers/*.plugin.tsx) rather than importing across
 * the admin/player route boundary -- avoids coupling the authenticated admin
 * bundle to the public player bundle. When adding a new widget plugin,
 * register it here too so it shows up in "Add Widget".
 */
interface WidgetConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  helperText?: string;
}

interface WidgetPluginMeta {
  widgetType: string;
  name: string;
  icon: ReactNode;
  description: string;
  configSchema: WidgetConfigField[];
}

const WIDGET_PLUGINS: WidgetPluginMeta[] = [
  {
    widgetType: 'QUEUE_WIDGET',
    name: 'Queue Widget',
    icon: <QueueIcon fontSize="small" />,
    description: 'Live waiting/serving/last-called status for a hospital location or service center.',
    configSchema: [
      { key: 'title', label: 'Display Title', type: 'text', defaultValue: 'Queue Status', helperText: 'e.g. "Reception Queue"' },
      {
        key: 'referenceType', label: 'Reference Type', type: 'select', defaultValue: 'SERVICE_CENTER',
        options: [{ value: 'SERVICE_CENTER', label: 'Service Center' }, { value: 'LOCATION', label: 'Location' }],
      },
      { key: 'referenceId', label: 'Location / Service Center ID', type: 'text', helperText: 'The HIS service center id or token location id' },
      { key: 'refreshSeconds', label: 'Refresh Interval (s)', type: 'number', defaultValue: 5 },
      {
        key: 'theme', label: 'Theme', type: 'select', defaultValue: 'blue',
        options: [{ value: 'blue', label: 'Hospital Blue' }, { value: 'green', label: 'Hospital Green' }, { value: 'dark', label: 'Dark' }],
      },
      { key: 'showWaiting', label: 'Show Waiting Count', type: 'boolean', defaultValue: true },
      { key: 'showServing', label: 'Show Currently Serving', type: 'boolean', defaultValue: true },
      { key: 'showLastCalled', label: 'Show Last Called', type: 'boolean', defaultValue: true },
    ],
  },
];

function defaultConfigFor(schema: WidgetConfigField[]): Record<string, unknown> {
  return Object.fromEntries(schema.map(f => [f.key, f.defaultValue ?? (f.type === 'boolean' ? false : '')]));
}

interface CMSMedia {
  id: string;
  originalName: string;
  url: string;
  mediaType: 'IMAGE' | 'VIDEO';
}

interface CMSPlaylistItem {
  id: string;
  mediaId: string | null;
  widgetType: string | null;
  configuration: Record<string, unknown> | null;
  displayOrder: number;
  enabled: boolean;
  durationSeconds: number | null;
  muted: boolean;
  loopPlayback: boolean;
  playFull: boolean;
  media: CMSMedia | null;
}

interface CMSPlaylist {
  id: string;
  name: string;
  description: string | null;
  hasUnpublishedChanges: boolean;
  publishedVersionId: string | null;
}

interface CMSPublishVersion {
  id: string;
  versionNumber: number;
  publishedBy: string;
  publishedAt: string;
  snapshot: { items: { itemId: string }[] };
}

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');

export default function CmsPlaylistBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const playlistId = params.id as string;
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [editWidgetItem, setEditWidgetItem] = useState<CMSPlaylistItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishError, setPublishError] = useState('');

  const { data: playlist, isLoading: loadingPlaylist } = useQuery<CMSPlaylist>({
    queryKey: ['cms-playlist', playlistId],
    queryFn: () => apiClient.get(`/cms/playlists/${playlistId}`).then(r => r.data),
  });

  const { data: items = [], isLoading: loadingItems } = useQuery<CMSPlaylistItem[]>({
    queryKey: ['cms-playlist-items', playlistId],
    queryFn: () => apiClient.get(`/cms/playlists/${playlistId}/items`).then(r => r.data),
  });

  const { data: media = [] } = useQuery<CMSMedia[]>({
    queryKey: ['cms-media'],
    queryFn: () => apiClient.get('/cms/media').then(r => r.data),
  });

  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: ['cms-playlist-items', playlistId] });
    queryClient.invalidateQueries({ queryKey: ['cms-playlist', playlistId] });
  };

  const addItemMutation = useMutation({
    mutationFn: (mediaId: string) => apiClient.post(`/cms/playlists/${playlistId}/items`, { mediaId }),
    onSuccess: () => { invalidateItems(); setAddOpen(false); },
  });

  const addWidgetMutation = useMutation({
    mutationFn: (data: { widgetType: string; configuration: Record<string, unknown> }) =>
      apiClient.post(`/cms/playlists/${playlistId}/widget-items`, data),
    onSuccess: () => { invalidateItems(); setAddWidgetOpen(false); },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Partial<CMSPlaylistItem> }) =>
      apiClient.patch(`/cms/playlists/${playlistId}/items/${itemId}`, data),
    onSuccess: invalidateItems,
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => apiClient.delete(`/cms/playlists/${playlistId}/items/${itemId}`),
    onSuccess: invalidateItems,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedItemIds: string[]) =>
      apiClient.post(`/cms/playlists/${playlistId}/items/reorder`, { orderedItemIds }),
    onSuccess: invalidateItems,
  });

  const publishMutation = useMutation({
    mutationFn: () => apiClient.post(`/cms/playlists/${playlistId}/publish`),
    onSuccess: invalidateItems,
    onError: (e: any) => setPublishError(e?.response?.data?.message ?? 'Publish failed'),
  });

  const moveItem = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const ordered = items.map(i => i.id);
    [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
    reorderMutation.mutate(ordered);
  };

  const availableMedia = media.filter(m => !items.some(i => i.mediaId === m.id));

  if (loadingPlaylist || loadingItems) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading playlist...</Typography>
      </Box>
    );
  }

  if (!playlist) return null;

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <IconButton size="small" onClick={() => router.push('/cms/playlists')}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="h5" fontWeight={700}>{playlist.name}</Typography>
        {playlist.publishedVersionId ? (
          <Chip size="small" label={playlist.hasUnpublishedChanges ? 'Unpublished changes' : 'Published'}
            color={playlist.hasUnpublishedChanges ? 'warning' : 'success'} />
        ) : (
          <Chip size="small" label="Never published" color="default" />
        )}
      </Box>
      {playlist.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{playlist.description}</Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Add Media
        </Button>
        <Button variant="outlined" startIcon={<WidgetsIcon />} onClick={() => setAddWidgetOpen(true)}>
          Add Widget
        </Button>
        <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => setHistoryOpen(true)}>
          Version History
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<PublishIcon />}
          disabled={items.filter(i => i.enabled).length === 0 || publishMutation.isPending}
          onClick={() => { setPublishError(''); publishMutation.mutate(); }}
        >
          {publishMutation.isPending ? 'Publishing...' : 'Publish'}
        </Button>
      </Box>

      {publishError && <Alert severity="error" sx={{ mb: 2 }}>{publishError}</Alert>}

      {items.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No items yet. Add media to build this playlist.</Typography>
        </Paper>
      ) : (
        items.map((item, index) => (
          <Paper key={item.id} sx={{ p: 2, mb: 1.5, opacity: item.enabled ? 1 : 0.5 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <IconButton size="small" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <Typography variant="caption" color="text.secondary">{index + 1}</Typography>
                <IconButton size="small" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}>
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </Box>

              <Box sx={{ width: 100, height: 70, bgcolor: 'grey.900', borderRadius: 1, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.widgetType ? (
                  <QueueIcon sx={{ color: 'grey.500' }} />
                ) : item.media?.mediaType === 'IMAGE' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${API_ORIGIN}${item.media.url}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <video src={`${API_ORIGIN}${item.media?.url}`} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </Box>

              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {item.widgetType ? <WidgetsIcon fontSize="small" /> : item.media?.mediaType === 'IMAGE' ? <ImageIcon fontSize="small" /> : <VideocamIcon fontSize="small" />}
                  <Typography fontWeight={600} variant="body2">
                    {item.widgetType
                      ? (WIDGET_PLUGINS.find(w => w.widgetType === item.widgetType)?.name ?? item.widgetType)
                      : item.media?.originalName}
                  </Typography>
                  {item.widgetType && (
                    <Tooltip title="Edit widget configuration">
                      <IconButton size="small" onClick={() => setEditWidgetItem(item)} aria-label="Edit widget configuration">
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <FormControlLabel
                    sx={{ ml: 'auto', mr: 0 }}
                    control={
                      <Switch size="small" checked={item.enabled}
                        onChange={e => updateItemMutation.mutate({ itemId: item.id, data: { enabled: e.target.checked } })} />
                    }
                    label={<Typography variant="caption">Enabled</Typography>}
                  />
                  <Tooltip title="Remove from playlist">
                    <IconButton size="small" color="error" onClick={() => removeItemMutation.mutate(item.id)} aria-label="Remove from playlist">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>

                <Divider sx={{ mb: 1 }} />

                {item.widgetType ? (
                  <TextField
                    size="small"
                    type="number"
                    label="Display duration (seconds)"
                    value={item.durationSeconds ?? 15}
                    onChange={e => updateItemMutation.mutate({ itemId: item.id, data: { durationSeconds: Number(e.target.value) || 1 } })}
                    sx={{ width: 220 }}
                  />
                ) : item.media?.mediaType === 'IMAGE' ? (
                  <TextField
                    size="small"
                    type="number"
                    label="Display duration (seconds)"
                    value={item.durationSeconds ?? 10}
                    onChange={e => updateItemMutation.mutate({ itemId: item.id, data: { durationSeconds: Number(e.target.value) || 1 } })}
                    sx={{ width: 220 }}
                  />
                ) : (
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <FormControlLabel
                      control={<Switch size="small" checked={item.muted}
                        onChange={e => updateItemMutation.mutate({ itemId: item.id, data: { muted: e.target.checked } })} />}
                      label={<Typography variant="caption">Muted</Typography>}
                    />
                    <FormControlLabel
                      control={<Switch size="small" checked={item.loopPlayback}
                        onChange={e => updateItemMutation.mutate({ itemId: item.id, data: { loopPlayback: e.target.checked } })} />}
                      label={<Typography variant="caption">Loop this video</Typography>}
                    />
                    <FormControlLabel
                      control={<Switch size="small" checked={item.playFull}
                        onChange={e => updateItemMutation.mutate({ itemId: item.id, data: { playFull: e.target.checked } })} />}
                      label={<Typography variant="caption">Play full length</Typography>}
                    />
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        ))
      )}

      <ResponsiveDialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Media to Playlist</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 2 }}>
          {availableMedia.length === 0 ? (
            <Typography color="text.secondary">
              No more media available. Upload new media in the Media Library first.
            </Typography>
          ) : (
            availableMedia.map(m => (
              <Paper
                key={m.id}
                variant="outlined"
                sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'grey.50' } }}
                onClick={() => addItemMutation.mutate(m.id)}
              >
                <Box sx={{ width: 60, height: 42, bgcolor: 'grey.900', borderRadius: 1, overflow: 'hidden', flexShrink: 0 }}>
                  {m.mediaType === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${API_ORIGIN}${m.url}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <video src={`${API_ORIGIN}${m.url}`} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </Box>
                <Typography variant="body2" noWrap sx={{ flex: 1 }}>{m.originalName}</Typography>
                {m.mediaType === 'IMAGE' ? <ImageIcon fontSize="small" /> : <VideocamIcon fontSize="small" />}
              </Paper>
            ))
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Close</Button>
        </DialogActions>
      </ResponsiveDialog>

      {addWidgetOpen && (
        <AddWidgetDialog
          onClose={() => setAddWidgetOpen(false)}
          onAdd={(widgetType, configuration) => addWidgetMutation.mutate({ widgetType, configuration })}
          saving={addWidgetMutation.isPending}
        />
      )}

      {editWidgetItem && (
        <EditWidgetDialog
          item={editWidgetItem}
          onClose={() => setEditWidgetItem(null)}
          onSave={(configuration) => {
            updateItemMutation.mutate({ itemId: editWidgetItem.id, data: { configuration } as any });
            setEditWidgetItem(null);
          }}
        />
      )}

      {historyOpen && (
        <VersionHistoryDialog
          playlistId={playlistId}
          currentVersionId={playlist.publishedVersionId}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </Box>
  );
}

// ── Widget config field renderer (shared by Add/Edit dialogs) ────────────────
function WidgetConfigForm({
  schema, values, onChange,
}: {
  schema: WidgetConfigField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {schema.map(field => {
        if (field.type === 'boolean') {
          return (
            <FormControlLabel
              key={field.key}
              control={
                <Switch
                  checked={Boolean(values[field.key])}
                  onChange={e => onChange(field.key, e.target.checked)}
                />
              }
              label={<Typography variant="body2">{field.label}</Typography>}
            />
          );
        }
        if (field.type === 'select') {
          return (
            <TextField
              key={field.key}
              select
              size="small"
              label={field.label}
              value={(values[field.key] as string) ?? ''}
              onChange={e => onChange(field.key, e.target.value)}
              helperText={field.helperText}
              fullWidth
            >
              {(field.options ?? []).map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          );
        }
        return (
          <TextField
            key={field.key}
            size="small"
            type={field.type === 'number' ? 'number' : 'text'}
            label={field.label}
            value={(values[field.key] as string | number) ?? ''}
            onChange={e => onChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
            helperText={field.helperText}
            fullWidth
          />
        );
      })}
    </Box>
  );
}

// ── Add Widget Dialog ──────────────────────────────────────────────────────────
function AddWidgetDialog({
  onClose, onAdd, saving,
}: {
  onClose: () => void;
  onAdd: (widgetType: string, configuration: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [selected, setSelected] = useState<WidgetPluginMeta | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});

  const selectPlugin = (plugin: WidgetPluginMeta) => {
    setSelected(plugin);
    setValues(defaultConfigFor(plugin.configSchema));
  };

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Widget to Playlist</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {!selected ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {WIDGET_PLUGINS.map(plugin => (
              <Paper
                key={plugin.widgetType}
                variant="outlined"
                sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'grey.50' } }}
                onClick={() => selectPlugin(plugin)}
              >
                {plugin.icon}
                <Box>
                  <Typography variant="body2" fontWeight={600}>{plugin.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{plugin.description}</Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        ) : (
          <WidgetConfigForm
            schema={selected.configSchema}
            values={values}
            onChange={(key, value) => setValues(v => ({ ...v, [key]: value }))}
          />
        )}
      </DialogContent>
      <DialogActions>
        {selected && <Button onClick={() => setSelected(null)}>Back</Button>}
        <Button onClick={onClose}>Cancel</Button>
        {selected && (
          <Button variant="contained" disabled={saving} onClick={() => onAdd(selected.widgetType, values)}>
            {saving ? 'Adding...' : 'Add to Playlist'}
          </Button>
        )}
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Edit Widget Dialog ─────────────────────────────────────────────────────────
function EditWidgetDialog({
  item, onClose, onSave,
}: {
  item: CMSPlaylistItem;
  onClose: () => void;
  onSave: (configuration: Record<string, unknown>) => void;
}) {
  const plugin = WIDGET_PLUGINS.find(w => w.widgetType === item.widgetType);
  const [values, setValues] = useState<Record<string, unknown>>({
    ...(plugin ? defaultConfigFor(plugin.configSchema) : {}),
    ...(item.configuration ?? {}),
  });

  if (!plugin) return null;

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure {plugin.name}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <WidgetConfigForm
          schema={plugin.configSchema}
          values={values}
          onChange={(key, value) => setValues(v => ({ ...v, [key]: value }))}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onSave(values)}>Save</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Version History Dialog ────────────────────────────────────────────────────
function VersionHistoryDialog({
  playlistId, currentVersionId, onClose,
}: {
  playlistId: string;
  currentVersionId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rollbackError, setRollbackError] = useState('');

  const { data: versions = [], isLoading } = useQuery<CMSPublishVersion[]>({
    queryKey: ['cms-playlist-versions', playlistId],
    queryFn: () => apiClient.get(`/cms/playlists/${playlistId}/versions`).then(r => r.data),
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => apiClient.post(`/cms/playlists/${playlistId}/versions/${versionId}/rollback`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-playlist-versions', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['cms-playlist', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['cms-playlist-items', playlistId] });
    },
    onError: (e: any) => setRollbackError(e?.response?.data?.message ?? 'Rollback failed'),
  });

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Version History</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Every publish creates a new, permanent version. Rolling back re-publishes an older version's
          content as a brand-new current version — nothing is deleted or overwritten.
        </Typography>

        {rollbackError && <Alert severity="error" sx={{ mb: 2 }}>{rollbackError}</Alert>}

        {isLoading ? (
          <CircularProgress size={24} />
        ) : versions.length === 0 ? (
          <Alert severity="info">This playlist has never been published.</Alert>
        ) : (
          <List dense disablePadding>
            {versions.map(v => {
              const isCurrent = v.id === currentVersionId;
              return (
                <ListItem
                  key={v.id}
                  disablePadding
                  sx={{ bgcolor: isCurrent ? 'success.lighter' : 'grey.50', borderRadius: 1, mb: 0.5, px: 1.5, py: 0.75, border: '1px solid', borderColor: isCurrent ? 'success.light' : 'divider' }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={600}>Version {v.versionNumber}</Typography>
                        {isCurrent && <Chip size="small" label="Current" color="success" />}
                        <Typography variant="caption" color="text.secondary">
                          {v.snapshot?.items?.length ?? 0} item(s)
                        </Typography>
                      </Box>
                    }
                    secondary={`Published ${new Date(v.publishedAt).toLocaleString()} by ${v.publishedBy}`}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  {!isCurrent && (
                    <ListItemSecondaryAction>
                      <Tooltip title="Rollback to this version">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setRollbackError('');
                            if (confirm(`Rollback to Version ${v.versionNumber}? This will become the new live content immediately.`)) {
                              rollbackMutation.mutate(v.id);
                            }
                          }}
                          disabled={rollbackMutation.isPending}
                         aria-label="Rollback to this version">
                          <RestoreIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
