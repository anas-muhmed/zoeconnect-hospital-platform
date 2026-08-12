'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import CircleIcon from '@mui/icons-material/Circle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import ResponsiveTable from '@/components/ResponsiveTable';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { licenseApi } from '@/lib/api/license.api';
import { getCmsPlayerUrl } from '@/lib/utils/cms-player-url';

interface CMSPlayerLogEntry { id: string; category: string; message: string; occurredAt: string; }

interface CMSDiagnostics { display: CMSDisplayAssignment; recentLogs: CMSPlayerLogEntry[]; }

interface CMSPlaylist { id: string; name: string; }

interface CMSDisplayAssignment {
  id: string;
  name: string;
  slug: string;
  playlistId: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  isPlayerOnline: boolean | null;
  currentPlaylistId: string | null;
  currentItemLabel: string | null;
  currentVersionNumber: number | null;
  lastSyncAt: string | null;
  cacheStatus: 'OK' | 'SYNCING' | 'ERROR' | 'OFFLINE' | null;
  lastError: string | null;
  storageUsageBytes: number | null;
}

const STALE_AFTER_MS = 90_000; // player health-reports every 30s -- 3 missed reports = considered offline

type HealthLevel = 'online' | 'warning' | 'offline';

function computeHealth(d: CMSDisplayAssignment): HealthLevel {
  if (!d.isActive) return 'offline';
  if (!d.lastSeenAt) return 'offline';
  const ageMs = Date.now() - new Date(d.lastSeenAt).getTime();
  if (ageMs > STALE_AFTER_MS) return 'offline';
  if (d.isPlayerOnline === false) return 'warning';
  if (d.cacheStatus === 'ERROR' || d.cacheStatus === 'OFFLINE') return 'warning';
  return 'online';
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

const HEALTH_META: Record<HealthLevel, { label: string; color: 'success' | 'warning' | 'error' }> = {
  online: { label: 'Online', color: 'success' },
  warning: { label: 'Degraded', color: 'warning' },
  offline: { label: 'Offline', color: 'error' },
};

export default function CmsDeviceMonitoringPage() {
  const queryClient = useQueryClient();
  const [diagnosticsId, setDiagnosticsId] = useState<string | null>(null);

  const { data: displays = [], isLoading } = useQuery<CMSDisplayAssignment[]>({
    queryKey: ['cms-displays-monitoring'],
    queryFn: () => apiClient.get('/cms/displays').then(r => r.data),
    refetchInterval: 15_000,
  });

  const { data: playlists = [] } = useQuery<CMSPlaylist[]>({
    queryKey: ['cms-playlists'],
    queryFn: () => apiClient.get('/cms/playlists').then(r => r.data),
  });

  const { data: licenseStatus } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    staleTime: 60_000,
  });

  const playlistName = (id: string | null) => playlists.find(p => p.id === id)?.name ?? '—';

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading device status...</Typography>
      </Box>
    );
  }

  const onlineCount = displays.filter(d => computeHealth(d) === 'online').length;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>CMS Device Monitoring</Typography>
          <Typography variant="body2" color="text.secondary">
            {onlineCount} of {displays.length} display(s) online. Auto-refreshes every 15s.
          </Typography>
        </Box>
        <Tooltip title="Refresh now">
          <IconButton onClick={() => queryClient.invalidateQueries({ queryKey: ['cms-displays-monitoring'] })} aria-label="Refresh now">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {displays.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No displays registered yet.</Typography>
        </Paper>
      ) : (
        // Bug fix (responsiveness audit, Critical): this Paper used to set
        // `overflow: 'hidden'` directly around the Table -- on any
        // viewport narrower than the table's natural width, that actively
        // CLIPPED the right-hand columns (Storage, the diagnostics
        // action button) instead of scrolling to them, making them
        // completely unreachable rather than just cramped. ResponsiveTable
        // handles the scroll container instead; the Table/columns/rows
        // below are unchanged.
        <Paper>
          <ResponsiveTable minWidth={1100}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Health</TableCell>
                <TableCell>Display</TableCell>
                <TableCell>Last Heartbeat</TableCell>
                <TableCell>Current Playlist</TableCell>
                <TableCell>Current Item</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Last Sync</TableCell>
                <TableCell>Cache</TableCell>
                <TableCell>Storage</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {displays.map(d => {
                const health = computeHealth(d);
                const meta = HEALTH_META[health];
                return (
                  <TableRow key={d.id} hover>
                    <TableCell>
                      <Tooltip title={d.lastError ?? meta.label}>
                        <Chip
                          size="small"
                          icon={<CircleIcon sx={{ fontSize: 10 }} />}
                          label={meta.label}
                          color={meta.color}
                          variant={health === 'online' ? 'filled' : 'outlined'}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{d.name}</Typography>
                      <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                        {getCmsPlayerUrl(d.slug, licenseStatus?.hospitalCode) ?? 'Resolving tenant…'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{timeAgo(d.lastSeenAt)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{playlistName(d.currentPlaylistId ?? d.playlistId)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>{d.currentItemLabel ?? '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{d.currentVersionNumber ? `v${d.currentVersionNumber}` : '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{timeAgo(d.lastSyncAt)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={d.cacheStatus ?? 'Unknown'}
                        color={d.cacheStatus === 'OK' ? 'success' : d.cacheStatus === 'SYNCING' ? 'info' : d.cacheStatus ? 'error' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatBytes(d.storageUsageBytes)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Diagnostics">
                        <IconButton size="small" onClick={() => setDiagnosticsId(d.id)} aria-label="Diagnostics">
                          <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </ResponsiveTable>
        </Paper>
      )}

      {diagnosticsId && (
        <DiagnosticsDialog id={diagnosticsId} playlistName={playlistName} onClose={() => setDiagnosticsId(null)} />
      )}
    </Box>
  );
}

// -- Diagnostics dialog -----------------------------------------------------------
function DiagnosticsDialog({ id, playlistName, onClose }: {
  id: string;
  playlistName: (id: string | null) => string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<CMSDiagnostics>({
    queryKey: ['cms-diagnostics', id],
    queryFn: () => apiClient.get(`/cms/displays/${id}/diagnostics`).then(r => r.data),
    refetchInterval: 10_000,
  });

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Diagnostics {data ? `— ${data.display.name}` : ''}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {isLoading || !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            <Typography variant="body2"><strong>Current Playlist:</strong> {playlistName(data.display.currentPlaylistId ?? data.display.playlistId)}</Typography>
            <Typography variant="body2"><strong>Current Item:</strong> {data.display.currentItemLabel ?? '—'}</Typography>
            <Typography variant="body2"><strong>Last Error:</strong> {data.display.lastError ?? '—'}</Typography>
            <Typography variant="body2"><strong>Network Status:</strong> {data.display.isPlayerOnline === false ? 'Offline' : data.display.isPlayerOnline === true ? 'Online' : 'Unknown'}</Typography>
            <Typography variant="body2"><strong>Cache Usage:</strong> {formatBytes(data.display.storageUsageBytes)} ({data.display.cacheStatus ?? 'Unknown'})</Typography>
            <Typography variant="body2"><strong>Last Sync:</strong> {timeAgo(data.display.lastSyncAt)}</Typography>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Recent Sync History / Player Logs</Typography>
            {data.recentLogs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No log entries reported yet.</Typography>
            ) : (
              <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                {data.recentLogs.map(l => (
                  <Box key={l.id} sx={{ mb: 0.75, fontSize: 12, fontFamily: 'monospace' }}>
                    <Typography variant="caption" color="text.secondary">
                      [{new Date(l.occurredAt).toLocaleTimeString()}] [{l.category}]
                    </Typography>{' '}
                    <Typography variant="caption">{l.message}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
