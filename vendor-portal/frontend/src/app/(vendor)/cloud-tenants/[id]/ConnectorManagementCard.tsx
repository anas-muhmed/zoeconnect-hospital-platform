'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import IconButton from '@mui/material/IconButton';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import DownloadIcon from '@mui/icons-material/Download';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { cloudTenantsApi } from '@/lib/api/cloud-tenants.api';
import type { ConnectorActivityEntry } from '@/lib/api/cloud-tenants.api';

// Task #102 ("Vendor Portal Connector Management," 2026-07-22) -- the page
// section that lets a support engineer manage a hospital's Connector
// entirely from Vendor Portal, per that task's explicit goal: "support
// never logs into the hospital machine." Every action here is a thin proxy
// through this app's own backend (`cloud-tenants.api.ts` ->
// vendor-portal/backend's `CloudTenantsController` -> ZoeConnect's
// `TenantProvisioningController`) -- this component never talks to ZoeConnect or
// a Connector directly.
//
// "Activation Code" terminology only -- no "Pairing Key" anywhere in this
// file, matching the task's explicit requirement.

const ACTIVITY_LABELS: Record<string, string> = {
  HIS_QUERY_DEFINITIONS_REPUBLISHED: 'Query definitions republished',
  CONNECTOR_RESYNC_TRIGGERED: 'Connector resync triggered',
  CONNECTOR_ACTIVATION_CODE_REGENERATED: 'Activation code regenerated',
};

function ActivationCodeDialog({ open, onClose, code, expiresAt }: {
  open: boolean; onClose: () => void; code: string; expiresAt: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const copy = () => {
    navigator.clipboard.writeText(code);
    enqueueSnackbar('Activation code copied', { variant: 'success' });
  };
  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Connector Activation Code</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This code is shown once and cannot be retrieved again. Give it to the hospital's IT contact --
          they enter it directly into the Connector during installation. It expires{' '}
          {new Date(expiresAt).toLocaleString()}.
        </Alert>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'monospace', fontSize: '1.5rem', letterSpacing: 2,
          bgcolor: 'action.hover', borderRadius: 1, px: 2, py: 1.5,
        }}>
          {code}
          <IconButton onClick={copy} aria-label="Copy activation code"><ContentCopyIcon /></IconButton>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Done</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

export function ConnectorManagementCard({ tenantId }: { tenantId: string }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [revealedCode, setRevealedCode] = useState<{ code: string; expiresAt: string } | null>(null);

  const { data: connector, isLoading, error } = useQuery({
    queryKey: ['cloud-tenant-connector', tenantId],
    queryFn: () => cloudTenantsApi.getConnectorStatus(tenantId),
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['cloud-tenant-connector-activity', tenantId],
    queryFn: () => cloudTenantsApi.getConnectorActivity(tenantId, 20),
  });

  const { data: installer } = useQuery({
    queryKey: ['connector-installer'],
    queryFn: cloudTenantsApi.getConnectorInstaller,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cloud-tenant-connector', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['cloud-tenant-connector-activity', tenantId] });
  };

  const activationMutation = useMutation({
    mutationFn: () => cloudTenantsApi.regenerateConnectorActivationCode(tenantId),
    onSuccess: (result) => {
      setRevealedCode({ code: result.activationCode, expiresAt: result.expiresAt });
      invalidate();
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Could not generate an activation code', { variant: 'error' });
    },
  });

  const republishMutation = useMutation({
    mutationFn: () => cloudTenantsApi.republishConnectorDefinitions(tenantId),
    onSuccess: (result) => {
      enqueueSnackbar(
        result.pushed
          ? `Republished (${result.changedQueryIds.length} definition(s) changed).`
          : 'Definitions recompiled -- no connector currently connected to push to.',
        { variant: result.pushed ? 'success' : 'warning' },
      );
      invalidate();
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Republish failed', { variant: 'error' });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: () => cloudTenantsApi.resyncConnector(tenantId),
    onSuccess: () => {
      enqueueSnackbar('Connector resync triggered.', { variant: 'success' });
      invalidate();
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Resync failed', { variant: 'error' });
    },
  });

  if (isLoading) {
    return <Card><CardContent><Skeleton height={160} /></CardContent></Card>;
  }
  if (error || !connector) {
    return (
      <Card><CardContent>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Connector</Typography>
        <Alert severity="error">Could not load Connector status.</Alert>
      </CardContent></Card>
    );
  }

  const isRegistered = connector.registered;
  const isOnline = isRegistered && connector.isConnected;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>Connector</Typography>
          <Chip
            size="small"
            label={!isRegistered ? 'Not Registered' : isOnline ? 'Online' : 'Offline'}
            color={!isRegistered ? 'default' : isOnline ? 'success' : 'warning'}
          />
          <Tooltip title={installer?.available ? `Download Connector installer v${installer.version}` : 'Installer not yet published'}>
            <span>
              {installer?.available ? (
                <Button size="small" variant="outlined" startIcon={<DownloadIcon />} href={installer.downloadUrl}>
                  Download Installer (v{installer.version})
                </Button>
              ) : (
                <Button size="small" variant="outlined" startIcon={<DownloadIcon />} disabled>
                  Download Installer
                </Button>
              )}
            </span>
          </Tooltip>
          <Button
            size="small" variant="outlined" startIcon={<VpnKeyIcon />}
            onClick={() => activationMutation.mutate()}
            disabled={activationMutation.isPending}
          >
            {isRegistered ? 'Regenerate' : 'Generate'} Activation Code
          </Button>
        </Box>

        {!isRegistered && (
          <Alert severity="info" sx={{ mb: 2 }}>
            No Connector has activated for this tenant yet. Generate an Activation Code and hand it to
            the hospital's IT contact -- they enter it into the Connector during installation and it
            will register and connect automatically.
          </Alert>
        )}

        {isRegistered && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.5, mb: 2 }}>
              <DetailRow label="Connector ID" value={connector.connectorId} />
              <DetailRow label="Status" value={connector.status} />
              <DetailRow label="Hostname" value={connector.hostname} />
              <DetailRow label="Version" value={connector.version ?? 'Not yet reported'} />
              <DetailRow label="Last Seen" value={connector.lastSeenAt ? new Date(connector.lastSeenAt).toLocaleString() : 'Not yet reported'} />
              <DetailRow label="Registered" value={new Date(connector.registeredAt).toLocaleString()} />
              <DetailRow label="Query Definitions" value={`${connector.definitions.definitionCount} published`} />
              <DetailRow
                label="Last Compiled"
                value={connector.definitions.lastCompiledAt ? new Date(connector.definitions.lastCompiledAt).toLocaleString() : 'Never'}
              />
            </Box>

            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
              <Button
                size="small" variant="outlined" startIcon={<RefreshIcon />}
                onClick={() => republishMutation.mutate()}
                disabled={republishMutation.isPending}
              >
                {republishMutation.isPending ? <CircularProgress size={16} /> : 'Republish Query Definitions'}
              </Button>
              <Tooltip title={!isOnline ? 'Connector must be online to force a resync' : ''}>
                <span>
                  <Button
                    size="small" variant="outlined" startIcon={<CloudSyncIcon />}
                    onClick={() => resyncMutation.mutate()}
                    disabled={resyncMutation.isPending || !isOnline}
                  >
                    {resyncMutation.isPending ? <CircularProgress size={16} /> : 'Force Connector Resync'}
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          RECENT ACTIVITY
        </Typography>
        {activityLoading && <Skeleton height={80} />}
        {!activityLoading && (!activity || activity.length === 0) && (
          <Typography variant="body2" color="text.secondary">No connector activity recorded yet.</Typography>
        )}
        {!activityLoading && activity && activity.length > 0 && (
          <List dense disablePadding>
            {activity.map((entry: ConnectorActivityEntry) => (
              <ListItem key={entry.id} disableGutters>
                <ListItemText
                  primary={ACTIVITY_LABELS[entry.action] ?? entry.action}
                  secondary={new Date(entry.createdAt).toLocaleString()}
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>

      <ActivationCodeDialog
        open={Boolean(revealedCode)}
        onClose={() => setRevealedCode(null)}
        code={revealedCode?.code ?? ''}
        expiresAt={revealedCode?.expiresAt ?? ''}
      />
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, gap: 1 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right', wordBreak: 'break-all' }}>
        {value ?? '—'}
      </Typography>
    </Box>
  );
}
