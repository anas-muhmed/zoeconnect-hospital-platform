'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import PageHeader from '@/components/PageHeader';
import ResponsiveTable from '@/components/ResponsiveTable';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VisibilityIcon from '@mui/icons-material/Visibility';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { cloudTenantsApi } from '@/lib/api/cloud-tenants.api';
import type { CloudTenant, CloudTenantProvisioningStatus } from '@/lib/api/cloud-tenants.api';

// Cloud Tenant Onboarding, Phase B Step 6 -- "Cloud Tenants" screen
// (CLOUD_TENANT_ONBOARDING_DESIGN.md, Section 3). Deliberately separate
// from the "Hospitals" screen (`(vendor)/hospitals/page.tsx`), which
// remains the existing self-hosted "Register to Vendor" flow, unchanged.
//
// Cloud Tenant Operations, Phase 10.1/10.2 -- adds the Actions column
// (View / Deprovision) this screen was missing entirely (see
// PHASE_10_DEFERRED_BACKLOG.md item 8: "no way to act on a tenant
// afterward from Vendor Portal").

const STATUS_COLOR: Record<CloudTenantProvisioningStatus, 'default' | 'warning' | 'success' | 'error'> = {
  PENDING: 'default',
  PROVISIONING: 'warning',
  ACTIVE: 'success',
  FAILED: 'error',
  DEPROVISIONED: 'default',
  RETRYING: 'warning',
};

function ProvisionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    hospitalName: '', adminUsername: '', adminEmail: '', adminFullName: '',
  });
  const [result, setResult] = useState<(CloudTenant & { tempPassword: string }) | null>(null);

  const mutation = useMutation({
    mutationFn: () => cloudTenantsApi.provision(form),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cloud-tenants'] });
      setResult(data);
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Provisioning failed', { variant: 'error' });
    },
  });

  const handleClose = () => {
    setForm({ hospitalName: '', adminUsername: '', adminEmail: '', adminFullName: '' });
    setResult(null);
    onClose();
  };

  const copyPassword = () => {
    if (result) {
      navigator.clipboard.writeText(result.tempPassword);
      enqueueSnackbar('Password copied', { variant: 'success' });
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Provision Cloud Tenant</DialogTitle>
      <DialogContent>
        {result ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Alert severity={result.provisioningStatus === 'ACTIVE' ? 'success' : 'error'}>
              {result.provisioningStatus === 'ACTIVE'
                ? 'Tenant provisioned successfully.'
                : `Provisioning failed: ${result.failureReason ?? 'unknown error'}`}
            </Alert>
            {result.provisioningStatus === 'ACTIVE' && (
              <>
                <TextField
                  label="Login URL"
                  value={result.loginUrl ?? ''}
                  InputProps={{ readOnly: true }}
                  helperText="Every organization shares this same login URL — no subdomain to remember."
                  fullWidth
                />
                <TextField label="Admin Username" value={result.adminUsername} InputProps={{ readOnly: true }} fullWidth />
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    label="Temporary Password (shown once)"
                    value={result.tempPassword}
                    InputProps={{ readOnly: true }}
                    fullWidth
                  />
                  <Button onClick={copyPassword} startIcon={<ContentCopyIcon />}>Copy</Button>
                </Box>
                <Alert severity="warning">
                  This password will not be shown again — copy it now and share it securely with the hospital.
                </Alert>
              </>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Hospital Name" fullWidth required
              value={form.hospitalName}
              onChange={e => setForm({ ...form, hospitalName: e.target.value })}
            />
            <TextField
              label="Admin Username" fullWidth required
              helperText="Must be globally unique across every organization on the platform."
              value={form.adminUsername}
              onChange={e => setForm({ ...form, adminUsername: e.target.value })}
            />
            <TextField
              label="Admin Email" fullWidth required type="email"
              helperText="Must be globally unique across every organization on the platform."
              value={form.adminEmail}
              onChange={e => setForm({ ...form, adminEmail: e.target.value })}
            />
            <Alert severity="info">
              Every organization logs in at the same shared URL — there&apos;s no subdomain to configure.
            </Alert>
            <TextField
              label="Admin Full Name" fullWidth
              value={form.adminFullName}
              onChange={e => setForm({ ...form, adminFullName: e.target.value })}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {result ? (
          <Button onClick={handleClose} variant="contained">Done</Button>
        ) : (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              variant="contained"
              disabled={
                mutation.isPending ||
                !form.hospitalName || !form.adminUsername || !form.adminEmail
              }
              startIcon={mutation.isPending ? <CircularProgress size={16} /> : undefined}
            >
              Provision
            </Button>
          </>
        )}
      </DialogActions>
    </ResponsiveDialog>
  );
}

function DeprovisionConfirmDialog({
  tenant, open, onClose,
}: { tenant: CloudTenant | null; open: boolean; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => cloudTenantsApi.deprovision(tenant!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-tenants'] });
      enqueueSnackbar('Tenant deprovisioned.', { variant: 'success' });
      onClose();
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Deprovisioning failed', { variant: 'error' });
    },
  });

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Deprovision {tenant?.hospitalName}?</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This deactivates the tenant on ZoeConnect and revokes its connector pairings.{' '}
          {tenant?.subdomain
            ? <>Users at <strong>{tenant.subdomain}</strong> will immediately lose access.</>
            : <>Users at <strong>{tenant?.hospitalName}</strong> will immediately lose access.</>}{' '}
          This cannot be undone from Vendor Portal.
        </Alert>
        <Typography variant="body2" color="text.secondary">
          This is a pilot-rollback action, not a delete — the tenant&apos;s data is retained, just
          marked inactive.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button
          onClick={() => mutation.mutate()}
          variant="contained"
          color="error"
          disabled={mutation.isPending}
          startIcon={mutation.isPending ? <CircularProgress size={16} /> : <BlockIcon />}
        >
          Deprovision
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

function ReleaseSubdomainConfirmDialog({
  tenant, open, onClose,
}: { tenant: CloudTenant | null; open: boolean; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => cloudTenantsApi.releaseSubdomain(tenant!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-tenants'] });
      enqueueSnackbar('Subdomain released.', { variant: 'success' });
      onClose();
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Releasing subdomain failed', { variant: 'error' });
    },
  });

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Release &ldquo;{tenant?.subdomain}&rdquo;?</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This permanently frees up <strong>{tenant?.subdomain}</strong> so a different hospital can be
          provisioned under that same subdomain. {tenant?.hospitalName}&apos;s own history — audit logs,
          licenses, users, connector pairings — is not affected and is not deleted; it simply stops
          reserving this subdomain string. This cannot be undone.
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Only do this once you&apos;re sure no one still needs the old{' '}
          <strong>https://{tenant?.subdomain}...</strong> URL (bookmarks, old emails, integrations) to
          resolve back to {tenant?.hospitalName}.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button
          onClick={() => mutation.mutate()}
          variant="contained"
          color="warning"
          disabled={mutation.isPending}
          startIcon={mutation.isPending ? <CircularProgress size={16} /> : <LockOpenIcon />}
        >
          Release Subdomain
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

function RowActionsMenu({ tenant }: { tenant: CloudTenant }) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  const canDeprovision = tenant.provisioningStatus === 'ACTIVE';
  // ZoeConnect Identity Architecture Migration, Phase 6: "Release Subdomain"
  // is a legacy action -- only meaningful for a tenant that actually has a
  // subdomain on record (older provisioning attempts, kept for historical
  // compatibility). A tenant provisioned without one has nothing to release.
  const canRelease = !!tenant.subdomain && tenant.provisioningStatus === 'DEPROVISIONED' && !tenant.subdomainReleasedAt;

  return (
    <>
      <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="Tenant actions">
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => { setAnchorEl(null); router.push(`/cloud-tenants/${tenant.id}`); }}>
          <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
          <ListItemText>View details</ListItemText>
        </MenuItem>
        <Tooltip title={canDeprovision ? '' : 'Only ACTIVE tenants can be deprovisioned'} placement="left">
          <span>
            <MenuItem
              disabled={!canDeprovision}
              onClick={() => { setAnchorEl(null); setConfirmOpen(true); }}
            >
              <ListItemIcon><BlockIcon fontSize="small" color={canDeprovision ? 'error' : 'inherit'} /></ListItemIcon>
              <ListItemText sx={canDeprovision ? { color: 'error.main' } : undefined}>Deprovision</ListItemText>
            </MenuItem>
          </span>
        </Tooltip>
        <Tooltip
          title={
            canRelease
              ? ''
              : !tenant.subdomain
                ? 'This tenant has no subdomain on record'
                : tenant.subdomainReleasedAt
                  ? 'Subdomain already released'
                  : 'Only a deprovisioned tenant\'s subdomain can be released'
          }
          placement="left"
        >
          <span>
            <MenuItem
              disabled={!canRelease}
              onClick={() => { setAnchorEl(null); setReleaseConfirmOpen(true); }}
            >
              <ListItemIcon><LockOpenIcon fontSize="small" color={canRelease ? 'warning' : 'inherit'} /></ListItemIcon>
              <ListItemText sx={canRelease ? { color: 'warning.main' } : undefined}>Release Subdomain</ListItemText>
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>
      <DeprovisionConfirmDialog tenant={tenant} open={confirmOpen} onClose={() => setConfirmOpen(false)} />
      <ReleaseSubdomainConfirmDialog tenant={tenant} open={releaseConfirmOpen} onClose={() => setReleaseConfirmOpen(false)} />
    </>
  );
}

export default function CloudTenantsPage() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: tenants, isLoading, error } = useQuery({
    queryKey: ['cloud-tenants'],
    queryFn: cloudTenantsApi.list,
  });

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Cloud Tenants"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            Provision Cloud Tenant
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load cloud tenants.</Alert>}

      <Card>
        <ResponsiveTable minWidth={900}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Hospital</TableCell>
              <TableCell>Subdomain (legacy)</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Login URL</TableCell>
              <TableCell>Provisioned At</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6}><Skeleton height={40} /></TableCell></TableRow>
            )}
            {!isLoading && tenants?.length === 0 && (
              <TableRow><TableCell colSpan={6}><Typography color="text.secondary">No cloud tenants yet.</Typography></TableCell></TableRow>
            )}
            {tenants?.map(t => (
              <TableRow
                key={t.id}
                hover
                onClick={() => router.push(`/cloud-tenants/${t.id}`)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>{t.hospitalName}</TableCell>
                <TableCell>{t.subdomain ?? '—'}</TableCell>
                <TableCell>
                  {t.provisioningStatus === 'FAILED' && t.failureReason ? (
                    <Tooltip title={t.failureReason} arrow>
                      <Chip size="small" label={t.provisioningStatus} color={STATUS_COLOR[t.provisioningStatus]} />
                    </Tooltip>
                  ) : t.provisioningStatus === 'DEPROVISIONED' && t.subdomainReleasedAt ? (
                    <Tooltip
                      title={`Subdomain released ${new Date(t.subdomainReleasedAt).toLocaleString()} — available for a new tenant`}
                      arrow
                    >
                      <Chip size="small" label="RELEASED" variant="outlined" color="default" />
                    </Tooltip>
                  ) : (
                    <Chip size="small" label={t.provisioningStatus} color={STATUS_COLOR[t.provisioningStatus]} />
                  )}
                </TableCell>
                <TableCell>{t.loginUrl ?? '—'}</TableCell>
                <TableCell>{t.provisionedAt ? new Date(t.provisionedAt).toLocaleString() : '—'}</TableCell>
                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                  <RowActionsMenu tenant={t} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </ResponsiveTable>
      </Card>

      <ProvisionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </Box>
  );
}
