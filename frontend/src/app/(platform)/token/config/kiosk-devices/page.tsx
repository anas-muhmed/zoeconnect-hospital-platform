'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import IconButton from '@mui/material/IconButton';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DevicesIcon from '@mui/icons-material/Devices';
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useAuthStore } from '@/lib/store/auth.store';
import { apiClient } from '@/lib/api/client';
import ResponsiveTable from '@/components/ResponsiveTable';

/**
 * Admin surface for Kiosk Desktop (Electron till) devices -- generate
 * activation codes, see which tills are registered/online/offline, and
 * disable/revoke a till without needing physical access to it. Backed by
 * kiosk-devices endpoints in
 * backend/src/modules/platform/kiosk-device/kiosk-admin.controller.ts
 * (see kiosk-desktop/README.md for the full picture: this page is where
 * IT gets the activation code that gets typed once into a till's setup
 * screen).
 */

interface KioskDevice {
  id: string;
  label: string | null;
  kioskUrl: string;
  status: string;
  displayStatus: 'registered' | 'online' | 'offline' | 'disabled' | 'revoked';
  hostname: string | null;
  appVersion: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
}

interface KioskPairing {
  id: string;
  label: string | null;
  kioskUrl: string;
  status: 'pending' | 'active' | 'revoked';
  createdAt: string;
  expiresAt: string | null;
}

const STATUS_COLOR: Record<string, 'success' | 'default' | 'warning' | 'error'> = {
  online: 'success',
  registered: 'default',
  offline: 'warning',
  disabled: 'error',
  revoked: 'error',
};

export default function KioskDevicesPage() {
  const { hasPermission } = useAuthStore();
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [pairings, setPairings] = useState<KioskPairing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKioskUrl, setNewKioskUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [devicesRes, pairingsRes] = await Promise.all([
        apiClient.get('/kiosk-devices'),
        apiClient.get('/kiosk-devices/pairings'),
      ]);
      setDevices(devicesRes.data);
      setPairings(pairingsRes.data.filter((p: KioskPairing) => p.status !== 'revoked'));
    } catch (err: any) {
      setError(err.message || 'Failed to load kiosk devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // keep online/offline status fresh
    return () => clearInterval(interval);
  }, [load]);

  const canManage = hasPermission('TOKEN:KIOSK:MANAGE');
  if (!canManage) {
    return <Box p={4}><Alert severity="error">Permission denied.</Alert></Box>;
  }

  const handleCreatePairing = async () => {
    if (!newKioskUrl.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiClient.post('/kiosk-devices/pairings', {
        label: newLabel.trim() || undefined,
        kioskUrl: newKioskUrl.trim(),
      });
      setNewCode(res.data.activationCode);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to generate activation code');
    } finally {
      setCreating(false);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setNewLabel('');
    setNewKioskUrl('');
    setNewCode(null);
  };

  const revokePairing = async (id: string) => {
    await apiClient.delete(`/kiosk-devices/pairings/${id}`);
    await load();
  };

  const disableDevice = async (id: string) => {
    await apiClient.patch(`/kiosk-devices/${id}/disable`);
    await load();
  };

  const enableDevice = async (id: string) => {
    await apiClient.patch(`/kiosk-devices/${id}/enable`);
    await load();
  };

  const revokeDevice = async (id: string) => {
    if (!confirm('Permanently revoke this kiosk? It will need a brand new activation code to come back online.')) return;
    await apiClient.delete(`/kiosk-devices/${id}`);
    await load();
  };

  if (loading) return <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <DevicesIcon color="primary" fontSize="large" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={600}>Kiosk Devices</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage ZoeConnect Kiosk Desktop tills (the Electron app installed via ZoeConnect_Kiosk_Setup.exe).
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          New Activation Code
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Registered Tills</Typography>
        <ResponsiveTable minWidth={900}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Label</TableCell>
              <TableCell>Kiosk URL</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Hostname</TableCell>
              <TableCell>Last Seen</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {devices.length === 0 && (
              <TableRow><TableCell colSpan={6}><Typography color="text.secondary" sx={{ py: 2 }}>No kiosks registered yet.</Typography></TableCell></TableRow>
            )}
            {devices.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.label || <em>Unlabeled</em>}</TableCell>
                <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.kioskUrl}</TableCell>
                <TableCell><Chip size="small" label={d.displayStatus} color={STATUS_COLOR[d.displayStatus] ?? 'default'} /></TableCell>
                <TableCell>{d.hostname || '-'}</TableCell>
                <TableCell>{d.lastHeartbeatAt ? new Date(d.lastHeartbeatAt).toLocaleString() : 'Never'}</TableCell>
                <TableCell align="right">
                  {d.displayStatus === 'disabled' ? (
                    <IconButton size="small" title="Re-enable" aria-label="Re-enable" onClick={() => enableDevice(d.id)}><CheckCircleIcon fontSize="small" /></IconButton>
                  ) : (
                    <IconButton size="small" title="Disable" aria-label="Disable" onClick={() => disableDevice(d.id)} disabled={d.displayStatus === 'revoked'}><BlockIcon fontSize="small" /></IconButton>
                  )}
                  <IconButton size="small" title="Revoke permanently" aria-label="Revoke permanently" onClick={() => revokeDevice(d.id)} disabled={d.displayStatus === 'revoked'}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </ResponsiveTable>
      </Paper>

      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Pending / Active Activation Codes</Typography>
        <ResponsiveTable minWidth={800}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Label</TableCell>
              <TableCell>Kiosk URL</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pairings.length === 0 && (
              <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 2 }}>No outstanding activation codes.</Typography></TableCell></TableRow>
            )}
            {pairings.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.label || <em>Unlabeled</em>}</TableCell>
                <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.kioskUrl}</TableCell>
                <TableCell><Chip size="small" label={p.status} color={p.status === 'pending' ? 'default' : 'success'} /></TableCell>
                <TableCell>{p.expiresAt ? new Date(p.expiresAt).toLocaleString() : 'Never'}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" title="Revoke code" aria-label="Revoke code" onClick={() => revokePairing(p.id)}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </ResponsiveTable>
      </Paper>

      <ResponsiveDialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Kiosk Activation Code</DialogTitle>
        <DialogContent>
          {!newCode ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Kiosk URL"
                placeholder="/token/print-kiosk?branchId=..."
                value={newKioskUrl}
                onChange={(e) => setNewKioskUrl(e.target.value)}
                helperText="Prefer a relative path (e.g. /token/print-kiosk?branchId=... or /kiosk/<slug>) so it works whether the till activates over http:// on the hospital LAN or https:// publicly. An absolute URL works too, but only if its protocol/port matches what's entered on the till."
                fullWidth
              />
              <TextField
                label="Label (optional)"
                placeholder="Reception-1"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                fullWidth
              />
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Give this code to whoever is setting up the till. It's shown only once and expires in 72 hours.
              </Typography>
              <Typography variant="h4" fontFamily="monospace" letterSpacing={2} sx={{ my: 2 }}>
                {newCode}
              </Typography>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => navigator.clipboard.writeText(newCode)}
              >
                Copy
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{newCode ? 'Done' : 'Cancel'}</Button>
          {!newCode && (
            <Button variant="contained" onClick={handleCreatePairing} disabled={creating || !newKioskUrl.trim()}>
              {creating ? <CircularProgress size={20} /> : 'Generate Code'}
            </Button>
          )}
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
