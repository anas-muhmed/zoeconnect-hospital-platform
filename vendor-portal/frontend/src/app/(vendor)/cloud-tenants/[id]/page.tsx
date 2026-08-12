'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import PageHeader from '@/components/PageHeader';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import StepContent from '@mui/material/StepContent';
import IconButton from '@mui/material/IconButton';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import BlockIcon from '@mui/icons-material/Block';
import ReplayIcon from '@mui/icons-material/Replay';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TuneIcon from '@mui/icons-material/Tune';
import PeopleIcon from '@mui/icons-material/People';
import SettingsIcon from '@mui/icons-material/Settings';
import { cloudTenantsApi } from '@/lib/api/cloud-tenants.api';
import type { CloudTenantProvisioningStatus } from '@/lib/api/cloud-tenants.api';
import { vendorApi } from '@/lib/api/vendor.api';
import { ConnectorManagementCard } from './ConnectorManagementCard';

// Cloud Tenant Operations, Phase 10.1 -- the tenant detail page called for
// in PHASE_10_DEFERRED_BACKLOG.md item 8 ("View Tenant Details"). Reads
// only what's actually available today: the `cloud_tenants` row itself
// (Hospital / Tenant ID / Subdomain / Status / Admin identity / License
// plan / Provisioned On) plus ZoeConnect's provisioning-run step history via
// `/cloud-tenants/:id/history`. Deliberately does NOT claim to show
// "Storage" / "Oracle Connection" / cross-tenant "Activity Logs" --
// PHASE_10_DEFERRED_BACKLOG.md item 8 lists those as separate, still-
// unbuilt backend capabilities (no per-tenant storage-usage or Oracle-
// connection-health endpoint exists anywhere yet), so surfacing them here
// would just be a UI mockup of data that doesn't exist. Scoped to Phase
// 10.4 ("Monitoring & Audit") instead of faked here.

const STATUS_COLOR: Record<CloudTenantProvisioningStatus, 'default' | 'warning' | 'success' | 'error'> = {
  PENDING: 'default',
  PROVISIONING: 'warning',
  ACTIVE: 'success',
  FAILED: 'error',
  DEPROVISIONED: 'default',
  RETRYING: 'warning',
};

const STEP_STATUS_COLOR: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  pending: 'default',
  in_progress: 'warning',
  succeeded: 'success',
  failed: 'error',
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>
        {value ?? '—'}
      </Typography>
    </Box>
  );
}

function DeprovisionButton({ tenantId, hospitalName, subdomain, disabled }: {
  tenantId: string; hospitalName: string; subdomain: string | null; disabled: boolean;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => cloudTenantsApi.deprovision(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-tenant', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['cloud-tenants'] });
      enqueueSnackbar('Tenant deprovisioned.', { variant: 'success' });
      setConfirmOpen(false);
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Deprovisioning failed', { variant: 'error' });
    },
  });

  return (
    <>
      <Tooltip title={disabled ? 'Only ACTIVE tenants can be deprovisioned' : ''}>
        <span>
          <Button
            variant="outlined" color="error" startIcon={<BlockIcon />}
            disabled={disabled} onClick={() => setConfirmOpen(true)}
          >
            Deprovision
          </Button>
        </span>
      </Tooltip>
      <ResponsiveDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Deprovision {hospitalName}?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This deactivates the tenant on ZoeConnect and revokes its connector pairings.{' '}
            {subdomain
              ? <>Users at <strong>{subdomain}</strong> will immediately lose access.</>
              : <>Users at <strong>{hospitalName}</strong> will immediately lose access.</>}{' '}
            This cannot be undone from Vendor Portal.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            variant="contained" color="error"
            disabled={mutation.isPending}
            startIcon={mutation.isPending ? <CircularProgress size={16} /> : <BlockIcon />}
          >
            Deprovision
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </>
  );
}

function RetryProvisioningButton({ tenantId, hospitalName }: { tenantId: string; hospitalName: string }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Requirement: Retry availability must reflect ALL server-side
  // conditions (status FAILED, not superseded by an ACTIVE tenant for the
  // same hospital, etc.) -- fetched fresh whenever this button mounts so
  // a stale client-side status never shows an enabled button the backend
  // would reject anyway.
  const { data: eligibility, isLoading: eligibilityLoading } = useQuery({
    queryKey: ['cloud-tenant-retry-eligibility', tenantId],
    queryFn: () => cloudTenantsApi.getRetryEligibility(tenantId),
  });

  const mutation = useMutation({
    mutationFn: () => cloudTenantsApi.retry(tenantId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cloud-tenant', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['cloud-tenant-history', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['cloud-tenant-retry-eligibility', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['cloud-tenants'] });
      enqueueSnackbar(
        data.provisioningStatus === 'ACTIVE'
          ? 'Provisioning retried successfully — tenant is now ACTIVE.'
          : 'Retry did not complete provisioning — see the updated failure reason below.',
        { variant: data.provisioningStatus === 'ACTIVE' ? 'success' : 'warning' },
      );
      setConfirmOpen(false);
    },
    onError: (err: any) => {
      // Never a generic message here: both the eligibility gate and
      // provision()'s own guards already return specific, actionable text
      // (e.g. "This provisioning request has already been superseded...").
      enqueueSnackbar(err?.response?.data?.message ?? 'Retry failed', { variant: 'error' });
      setConfirmOpen(false);
    },
  });

  const disabled = eligibilityLoading || !eligibility?.allowed;
  const tooltip = eligibilityLoading
    ? ''
    : (eligibility?.reason ?? '');

  return (
    <>
      <Tooltip title={tooltip}>
        <span>
          <Button
            variant="outlined" startIcon={<ReplayIcon />}
            disabled={disabled} onClick={() => setConfirmOpen(true)}
          >
            Retry Provisioning
          </Button>
        </span>
      </Tooltip>
      <ResponsiveDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Retry provisioning {hospitalName}?</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            This resumes the existing failed provisioning run from where it left off — it does not restart
            provisioning from the beginning, and it will not create a duplicate tenant, admin account, or connector.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            variant="contained"
            disabled={mutation.isPending}
            startIcon={mutation.isPending ? <CircularProgress size={16} /> : <ReplayIcon />}
          >
            Retry
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </>
  );
}

export default function CloudTenantDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ['cloud-tenant', id],
    queryFn: () => cloudTenantsApi.get(id),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['cloud-tenant-history', id],
    queryFn: () => cloudTenantsApi.getHistory(id),
    enabled: Boolean(tenant),
  });

  // Customers merge (Phase 2, 2026-07-20) -- find the `hospitals` row
  // CloudTenantsService.linkHospitalRecord() creates on successful
  // provisioning, so this page can jump straight into the same license/
  // user/HIS-config management surface self-hosted hospitals get, instead
  // of leaving a provisioned tenant with no ongoing management link at
  // all (the exact gap this merge closes). No dedicated lookup endpoint
  // exists yet, so this matches client-side against the full hospitals
  // list -- fine at today's scale; worth a real endpoint if that list
  // grows large.
  const { data: hospitals } = useQuery({
    queryKey: ['hospitals'],
    queryFn: vendorApi.getHospitals,
    enabled: Boolean(tenant),
  });
  const linkedHospital = hospitals?.find(h => h.cloudTenantId === id);

  const copyLoginUrl = () => {
    if (tenant?.loginUrl) {
      navigator.clipboard.writeText(tenant.loginUrl);
      enqueueSnackbar('Login URL copied', { variant: 'success' });
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton height={40} width={300} />
        <Skeleton height={200} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (error || !tenant) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Could not load this cloud tenant.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title={tenant.hospitalName}
        back="/cloud-tenants"
        mb={2}
        actions={
          <>
            <Chip label={tenant.provisioningStatus} color={STATUS_COLOR[tenant.provisioningStatus]} />
            {tenant.provisioningStatus === 'FAILED' && (
              <RetryProvisioningButton tenantId={tenant.id} hospitalName={tenant.hospitalName} />
            )}
            <DeprovisionButton
              tenantId={tenant.id}
              hospitalName={tenant.hospitalName}
              subdomain={tenant.subdomain}
              disabled={tenant.provisioningStatus !== 'ACTIVE'}
            />
          </>
        }
      />

      {tenant.provisioningStatus === 'FAILED' && tenant.failureReason && (
        <Alert severity="error" sx={{ mb: 2 }}>{tenant.failureReason}</Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Tenant</Typography>
              <DetailRow label="Hospital" value={tenant.hospitalName} />
              <DetailRow label="Tenant ID" value={tenant.hdspTenantId} />
              <DetailRow label="Subdomain (legacy)" value={tenant.subdomain} />
              <DetailRow
                label="Login URL"
                value={tenant.loginUrl ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                    {tenant.loginUrl}
                    <IconButton size="small" onClick={copyLoginUrl} aria-label="Copy login URL"><ContentCopyIcon fontSize="inherit" /></IconButton>
                  </Box>
                ) : null}
              />
              <DetailRow label="Subscription Plan" value={tenant.subscriptionPlan} />
              <Divider sx={{ my: 1 }} />
              <DetailRow label="Provisioned At" value={tenant.provisionedAt ? new Date(tenant.provisionedAt).toLocaleString() : null} />
              <DetailRow label="Created" value={new Date(tenant.createdAt).toLocaleString()} />
              <DetailRow label="Last Updated" value={new Date(tenant.updatedAt).toLocaleString()} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>SUPER_ADMIN</Typography>
              <DetailRow label="Username" value={tenant.adminUsername} />
              <DetailRow label="Email" value={tenant.adminEmail} />
              <Alert severity="info" sx={{ mt: 1.5 }} variant="outlined">
                The temporary password was shown once at provisioning time and is not recoverable.
                Password reset is not yet available from Vendor Portal (see deferred backlog item 8).
              </Alert>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Ongoing Management</Typography>
              {linkedHospital ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" startIcon={<TuneIcon />}
                    onClick={() => router.push(`/hospitals/${linkedHospital.id}/his-config`)}>
                    HIS / Query Config
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<PeopleIcon />}
                    onClick={() => router.push(`/hospitals/${linkedHospital.id}/hdsp-users`)}>
                    ZoeConnect Users
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<SettingsIcon />}
                    onClick={() => router.push(`/hospitals/${linkedHospital.id}/settings`)}>
                    System Settings
                  </Button>
                  <Button size="small" variant="text" onClick={() => router.push('/hospitals')}>
                    View in Hospitals list →
                  </Button>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {tenant.provisioningStatus === 'ACTIVE'
                    ? 'No linked hospital record found yet — try refreshing.'
                    : 'Available once this tenant finishes provisioning.'}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <ConnectorManagementCard tenantId={tenant.id} />
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Provisioning History</Typography>
              {historyLoading && <Skeleton height={120} />}
              {!historyLoading && !history && (
                <Typography variant="body2" color="text.secondary">
                  No provisioning run recorded for this tenant yet.
                </Typography>
              )}
              {!historyLoading && history && (
                <Stepper orientation="vertical" nonLinear sx={{ mt: 1 }}>
                  {history.steps.map((step) => (
                    <Step key={step.stepNumber} active expanded>
                      <StepLabel
                        error={step.status === 'failed'}
                        optional={
                          <Chip
                            size="small"
                            label={step.status}
                            color={STEP_STATUS_COLOR[step.status]}
                            sx={{ mt: 0.5 }}
                          />
                        }
                      >
                        {step.stepName}
                      </StepLabel>
                      <StepContent>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {step.startedAt ? new Date(step.startedAt).toLocaleString() : '—'}
                          {step.completedAt ? ` → ${new Date(step.completedAt).toLocaleString()}` : ''}
                        </Typography>
                        {step.lastError && (
                          <Alert severity="error" sx={{ mt: 1 }} variant="outlined">{step.lastError}</Alert>
                        )}
                      </StepContent>
                    </Step>
                  ))}
                </Stepper>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
