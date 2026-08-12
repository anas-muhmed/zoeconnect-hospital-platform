'use client';

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import VerifiedIcon from '@mui/icons-material/Verified';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import LinkIcon from '@mui/icons-material/Link';
import SendIcon from '@mui/icons-material/Send';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';

import ResponsiveTable from '@/components/ResponsiveTable';
import { licenseApi, ALL_MODULES, type LicenseStatus, type LicenseHistoryRecord } from '@/lib/api/license.api';
import { useAuthStore } from '@/lib/store/auth.store';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import PageHeader from '@/components/PageHeader';
import VendorRegisterDialog from '@/components/vendor/VendorRegisterDialog';

const MODULE_LABELS: Record<string, string> = {
  PLATFORM:  'Platform Core',
  LOYALTY:   'Patient Loyalty',
  FORMS:     'Digital Forms',
  QUEUE:     'Queue Management',
  FEEDBACK:  'Patient Feedback',
  EIC:       'Early Intervention Centre',
  CMS:       'Content Management System',
  INCIDENT:  'Incident Management',
};

const HISTORY_STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactElement }> = {
  TRIAL:   { label: 'Trial Activated',    color: 'warning', icon: <WarningAmberIcon fontSize="small" /> },
  ACTIVE:  { label: 'License Activated',  color: 'success', icon: <VerifiedIcon fontSize="small" /> },
  REVOKED: { label: 'License Revoked',    color: 'error',   icon: <BlockIcon fontSize="small" /> },
  EXPIRED: { label: 'License Expired',    color: 'default', icon: <ErrorOutlineIcon fontSize="small" /> },
};

// -- Status Summary Card -----------------------------------------------------------
function StatusCard({ status }: { status: LicenseStatus }) {
  const inGrace  = status.isValid && status.isInGracePeriod;
  const severity = !status.isValid ? 'error' : (status.isTrial || inGrace) ? 'warning' : 'success';
  const icon     = !status.isValid ? <ErrorOutlineIcon /> : (status.isTrial || inGrace) ? <WarningAmberIcon /> : <VerifiedIcon />;
  const label    = !status.isValid ? 'License Expired'
                 : inGrace        ? 'Grace Period — License Expired'
                 : status.isTrial ? 'Trial License'
                 :                  'Licensed';

  const graceHoursLeft = inGrace && status.gracePeriodEndsAt
    ? Math.max(0, Math.ceil((new Date(status.gracePeriodEndsAt).getTime() - Date.now()) / 3_600_000))
    : null;

  return (
    <Alert severity={severity} icon={icon} sx={{ mb: 3, alignItems: 'center' }}>
      <AlertTitle sx={{ fontWeight: 700 }}>{label}</AlertTitle>
      {status.isTrial && !inGrace && 'This is a 30-day trial. Register with the vendor to request a full license.'}
      {!status.isValid && 'Your license has expired. Contact your vendor to renew.'}
      {inGrace && graceHoursLeft !== null &&
        `One or more module licenses have expired. Access continues for ${graceHoursLeft}h as a grace period — contact your vendor to renew immediately.`}
      {status.isValid && !status.isTrial && !inGrace &&
        (status.expiresAt ? `Valid until ${new Date(status.expiresAt).toLocaleDateString()}` : 'Perpetual license — no expiry')}
    </Alert>
  );
}

// ── Request License Dialog ────────────────────────────────────────────────────
function RequestLicenseDialog({
  open, onClose, currentModules, gracePeriodModules, deploymentMode,
}: {
  open: boolean;
  onClose: () => void;
  /** Modules with a currently valid (non-expired) license */
  currentModules: string[];
  /** Modules in grace period — expired but temporarily accessible; require renewal */
  gracePeriodModules: string[];
  /** From LicenseStatus.deploymentMode — Attendance is self-hosted-only
   *  (decision, 2026-07-20: it depends on a single process-wide Oracle
   *  pool that can't serve multiple cloud tenants' distinct HIS databases,
   *  see AttendanceModule's exclusion in app.module.ts), so it's not
   *  offered as a requestable module for cloud tenants at all. */
  deploymentMode?: string;
}) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const REQUIRED_MODULES = ['PLATFORM'];
  const requestableModules = deploymentMode === 'cloud'
    ? ALL_MODULES.filter(m => m.code !== 'ATTENDANCE')
    : ALL_MODULES;

  // Grace period modules are pre-selected so admins don't forget to renew them
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [remarks,         setRemarks]         = useState('');

  React.useEffect(() => {
    if (open) {
      // Pre-select grace period modules so they are included in the renewal request
      setSelectedModules([...gracePeriodModules.filter(m => !REQUIRED_MODULES.includes(m))]);
      setRemarks('');
    }
  }, [open, gracePeriodModules]);

  // "truly licensed" = licensed AND NOT in grace period (i.e., valid license)
  const trulyLicensed = currentModules.filter(m => !gracePeriodModules.includes(m));

  const toggleModule = (code: string) => {
    if (trulyLicensed.includes(code)) return;  // genuinely licensed — no need to request
    if (REQUIRED_MODULES.includes(code)) return;
    setSelectedModules(prev =>
      prev.includes(code) ? prev.filter(m => m !== code) : [...prev, code]);
  };

  const finalModules = [...new Set([
    ...REQUIRED_MODULES.filter(m => !trulyLicensed.includes(m)),
    ...selectedModules,
  ])];

  const mutation = useMutation({
    mutationFn: () => licenseApi.submitRequest({
      requestedModules: finalModules,
      remarks: remarks.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-requests'] });
      enqueueSnackbar('License renewal request submitted to vendor', { variant: 'success' });
      onClose();
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Request failed', { variant: 'error' });
    },
  });

  // Modules in grace period — shown separately so admin can renew them
  const needsRenewal = requestableModules.filter(
    m => gracePeriodModules.includes(m.code) && !REQUIRED_MODULES.includes(m.code)
  );
  // Genuinely licensed (valid, not expired, not required)
  const alreadyLicensed = requestableModules.filter(
    m => trulyLicensed.includes(m.code) && !REQUIRED_MODULES.includes(m.code)
  );
  // Not licensed at all
  const availableToRequest = requestableModules.filter(
    m => !currentModules.includes(m.code) && !REQUIRED_MODULES.includes(m.code)
  );
  const nothingToRequest = needsRenewal.length === 0 && availableToRequest.length === 0;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Request License Modules</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Select the modules you need. Platform Core is always required and included automatically.
        </Typography>

        {/* Platform Core — always required, always ticked */}
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Required
          </Typography>
          <FormGroup sx={{ mt: 0.5 }}>
            {ALL_MODULES.filter(m => REQUIRED_MODULES.includes(m.code)).map(m => (
              <FormControlLabel
                key={m.code}
                disabled
                control={<Checkbox checked size="small" color="primary" />}
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={600} color="text.disabled">
                      {m.label} <Typography component="span" variant="caption" color="text.disabled">(always included)</Typography>
                    </Typography>
                    <Typography variant="caption" color="text.disabled">{m.description}</Typography>
                  </Box>
                }
              />
            ))}
          </FormGroup>
        </Box>

        {/* Grace period modules — expired, pre-selected for renewal */}
        {needsRenewal.length > 0 && (
          <Box>
            <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'warning.main' }}>
              Renewal Required (Grace Period)
            </Typography>
            <Alert severity="warning" sx={{ mt: 0.5, mb: 1, py: 0.5 }}>
              These modules have expired. They are pre-selected — submit this request to renew them before the grace period ends.
            </Alert>
            <FormGroup>
              {needsRenewal.map(m => (
                <FormControlLabel
                  key={m.code}
                  control={
                    <Checkbox
                      size="small"
                      color="warning"
                      checked={selectedModules.includes(m.code)}
                      onChange={() => toggleModule(m.code)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{m.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{m.description}</Typography>
                    </Box>
                  }
                />
              ))}
            </FormGroup>
          </Box>
        )}

        {/* Already licensed — shown as locked */}
        {alreadyLicensed.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Already Licensed
            </Typography>
            <FormGroup sx={{ mt: 0.5 }}>
              {alreadyLicensed.map(m => (
                <FormControlLabel
                  key={m.code}
                  disabled
                  control={<Checkbox checked size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={600} color="text.disabled">{m.label}</Typography>
                      <Typography variant="caption" color="text.disabled">{m.description}</Typography>
                    </Box>
                  }
                />
              ))}
            </FormGroup>
          </Box>
        )}

        {/* New modules to request */}
        {availableToRequest.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Available to Request
            </Typography>
            <FormGroup sx={{ mt: 0.5 }}>
              {availableToRequest.map(m => (
                <FormControlLabel
                  key={m.code}
                  control={
                    <Checkbox
                      size="small"
                      checked={selectedModules.includes(m.code)}
                      onChange={() => toggleModule(m.code)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{m.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{m.description}</Typography>
                    </Box>
                  }
                />
              ))}
            </FormGroup>
          </Box>
        )}

        {nothingToRequest && (
          <Alert severity="success" icon={<CheckIcon />}>
            All available modules are already licensed on this server.
          </Alert>
        )}

        <TextField
          label="Remarks (optional)"
          multiline minRows={3}
          fullWidth size="small"
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          placeholder="Describe your use case or any special requirements..."
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={finalModules.length === 0 || mutation.isPending}
          startIcon={mutation.isPending ? <CircularProgress size={16} /> : <SendIcon />}
        >
          Submit Request ({finalModules.length} module{finalModules.length !== 1 ? 's' : ''})
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Upload Dialog (legacy / manual) ──────────────────────────────────────────
function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState('');

  const mutation = useMutation({
    mutationFn: (license: Record<string, unknown>) => licenseApi.upload(license),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-status'] });
      enqueueSnackbar('License activated successfully', { variant: 'success' });
      onClose(); setJsonText('');
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Failed to activate license', { variant: 'error' });
    },
  });

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setJsonText(ev.target?.result as string); setParseError(''); };
    reader.readAsText(file);
  };

  const handleActivate = () => {
    try { const parsed = JSON.parse(jsonText); setParseError(''); mutation.mutate(parsed); }
    catch { setParseError('Invalid JSON — paste or upload the .json license file exactly as received'); }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Upload License File (Manual)</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        <Alert severity="info">
          This is the manual upload method. If you are registered with the vendor platform, licenses are delivered automatically — you do not need to upload manually.
        </Alert>
        <Button variant="outlined" startIcon={<UploadFileIcon />}
          onClick={() => fileRef.current?.click()} sx={{ alignSelf: 'flex-start' }}>
          Choose License File (.json)
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json"
          style={{ display: 'none' }} onChange={handleFileLoad} />
        <TextField label="License JSON" multiline minRows={8} maxRows={16} fullWidth
          value={jsonText} onChange={e => { setJsonText(e.target.value); setParseError(''); }}
          error={!!parseError} helperText={parseError}
          placeholder='{"licenseKey":"...","signature":"..."}' sx={{ fontFamily: 'monospace' }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button variant="contained" onClick={handleActivate}
          disabled={!jsonText.trim() || mutation.isPending}
          startIcon={mutation.isPending ? <CircularProgress size={16} /> : <CheckCircleIcon />}>
          Activate License
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Info Row helper ───────────────────────────────────────────────────────────
function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={500} sx={mono ? { fontFamily: 'monospace', fontSize: 12 } : undefined}>
        {value}
      </Typography>
    </Box>
  );
}

// ── Request Status Badge ──────────────────────────────────────────────────────
const REQUEST_STATUS_PROPS = {
  PENDING:   { label: 'Pending Review', color: 'warning',  icon: <HourglassEmptyIcon fontSize="small" /> },
  APPROVED:  { label: 'Approved',       color: 'success',  icon: <CheckIcon fontSize="small" /> },
  REJECTED:  { label: 'Rejected',       color: 'error',    icon: <BlockIcon fontSize="small" /> },
  REVOKED:   { label: 'Revoked',        color: 'default',  icon: <CancelIcon fontSize="small" /> },
  CANCELLED: { label: 'Cancelled',      color: 'default',  icon: <CancelIcon fontSize="small" /> },
} as const;

// ── Cancel Request Confirmation ───────────────────────────────────────────────
function CancelRequestDialog({
  open, onClose, onConfirm, pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Cancel license request?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          This withdraws your pending request. The vendor will no longer be asked to review it,
          and you&apos;ll be able to submit a new request right away.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>Keep Request</Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={pending}
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : <CancelIcon />}
        >
          Cancel Request
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LicensePage() {
  const { hasPermission } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const canManage = hasPermission('PLATFORM:SETTINGS:UPDATE');

  const [uploadOpen,   setUploadOpen]   = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [requestOpen,  setRequestOpen]  = useState(false);
  const [cancelOpen,   setCancelOpen]   = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    refetchInterval: 30_000,
  });

  const { data: registration, isLoading: regLoading } = useQuery({
    queryKey: ['license-registration'],
    queryFn: licenseApi.getRegistration,
    enabled: canManage,
  });

  const { data: requests, isLoading: reqLoading } = useQuery({
    queryKey: ['license-requests'],
    queryFn: licenseApi.getRequests,
    enabled: canManage,
    refetchInterval: 15_000,
  });

  const { data: fpData } = useQuery({
    queryKey: ['license-fingerprint'],
    queryFn: licenseApi.getFingerprint,
    enabled: canManage,
  });

  const { data: history, isLoading: histLoading } = useQuery({
    queryKey: ['license-history'],
    queryFn: licenseApi.getHistory,
    enabled: canManage,
    refetchInterval: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => licenseApi.cancelRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-requests'] });
      enqueueSnackbar('License request cancelled', { variant: 'success' });
      setCancelOpen(false);
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Failed to cancel request', { variant: 'error' });
    },
  });

  const copyFp = () => {
    if (fpData?.fingerprint) {
      navigator.clipboard.writeText(fpData.fingerprint);
      enqueueSnackbar('Fingerprint copied', { variant: 'info' });
    }
  };

  const isRegistered  = registration?.registered && registration.status === 'ACTIVE';
  const pendingRequest = requests?.find(r => r.status === 'PENDING');

  // Stepper state
  const activeStep = !isRegistered ? 0 : !requests?.some(r => r.status === 'APPROVED') ? 1 : 2;

  return (
    <Box sx={{ p: 3, maxWidth: 960 }}>
      <PageHeader
        title="License Management"
        subtitle="Vendor registration, license requests and module activation"
        icon={<VpnKeyIcon />}
        back="/settings"
        breadcrumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'License' },
        ]}
        actions={canManage && (
          <>
            {!isRegistered && status?.vendorRegistrationRequired !== false && (
              <Button variant="contained" startIcon={<LinkIcon />} onClick={() => setRegisterOpen(true)}>
                Register with Vendor
              </Button>
            )}
            {isRegistered && !pendingRequest && (
              <Button variant="contained" startIcon={<SendIcon />} onClick={() => setRequestOpen(true)}>
                Request License
              </Button>
            )}
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setUploadOpen(true)}>
              Manual Upload
            </Button>
          </>
        )}
      />

      {/* License Status Alert */}
      {statusLoading
        ? <Skeleton variant="rounded" height={80} sx={{ mb: 3 }} />
        : status && <StatusCard status={status} />
      }

      {/* Vendor Onboarding Stepper */}
      {canManage && (
        <Card elevation={0} sx={{ border: 1, borderColor: 'divider', mb: 3 }}>
          <CardHeader
            title="Vendor License Workflow"
            titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
          />
          <Divider />
          <CardContent>
            <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
              <Step completed={isRegistered}>
                <StepLabel>Register with Vendor</StepLabel>
              </Step>
              <Step completed={requests?.some(r => r.status === 'APPROVED') ?? false}>
                <StepLabel>Submit License Request</StepLabel>
              </Step>
              <Step>
                <StepLabel>License Auto-Activated</StepLabel>
              </Step>
            </Stepper>

            {!isRegistered && !regLoading && (
              <Alert severity="info">
                {status?.vendorRegistrationRequired === false
                  ? 'Waiting for automated vendor provisioning to complete. Registration will happen automatically.'
                  : 'Register this ZoeConnect instance with your vendor platform. The vendor will be able to see your hospital details, machine fingerprint, and approve license requests.'}
              </Alert>
            )}
            {isRegistered && !requests?.some(r => ['APPROVED','PENDING'].includes(r.status ?? '')) && (
              <Alert severity="info">
                You are registered. Click <strong>Request License</strong> to select modules and submit a request to the vendor.
              </Alert>
            )}
            {pendingRequest && (
              <Alert
                severity="warning"
                icon={<HourglassEmptyIcon />}
                action={canManage && (
                  <Button color="warning" size="small" onClick={() => setCancelOpen(true)}>
                    Cancel Request
                  </Button>
                )}
              >
                A license request is pending vendor review. You will be notified automatically when the vendor acts on it.
              </Alert>
            )}
            {requests?.some(r => r.status === 'APPROVED') && (
              status?.isInGracePeriod ? (
                <Alert severity="warning" icon={<WarningAmberIcon />}>
                  Your license request was approved, but one or more modules have since <strong>expired</strong> and are now in the grace period. Submit a new renewal request to restore full access.
                </Alert>
              ) : (
                <Alert severity="success" icon={<CheckCircleIcon />}>
                  Your license request was approved and the license is active.
                </Alert>
              )
            )}
          </CardContent>
        </Card>
      )}

      <Grid container spacing={3}>
        {/* License Details */}
        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: 1, borderColor: 'divider', height: '100%' }}>
            <CardHeader title="License Details" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
            <Divider />
            <CardContent>
              {statusLoading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} sx={{ mb: 1 }} />)
              ) : status ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <InfoRow label="Hospital"    value={status.hospitalName || '–'} />
                  <InfoRow label="Code"        value={status.hospitalCode || '–'} />
                  <InfoRow label="Type"        value={<Chip label={status.isTrial ? 'Trial' : 'Full'} size="small" color={status.isTrial ? 'warning' : 'success'} />} />
                  <InfoRow label="Max Users"   value={String(status.maxUsers)} />
                  <InfoRow label="Expires"     value={status.expiresAt ? `${new Date(status.expiresAt).toLocaleDateString()} (${status.daysRemaining}d)` : 'Perpetual'} />
                  <InfoRow label="Machine Lock" value={status.machineFingerprint ?? 'None (any machine)'} mono />
                </Box>
              ) : null}
            </CardContent>
          </Card>
        </Grid>

        {/* Licensed Modules */}
        <Grid item xs={12} md={6}>
          <Card elevation={0} sx={{ border: 1, borderColor: 'divider', height: '100%' }}>
            <CardHeader title="Licensed Modules" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
            <Divider />
            <CardContent sx={{ p: 0 }}>
              {statusLoading ? (
                <Box sx={{ p: 2 }}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} sx={{ mb: 1 }} />)}</Box>
              ) : (
                <List dense disablePadding>
                  {Object.entries(MODULE_LABELS).map(([code, label]) => {
                    const active    = status?.licensedModules.includes(code) ?? false;
                    const inGrace   = active && (status?.gracePeriodModules ?? []).includes(code);
                    const graceEnd  = inGrace && status?.gracePeriodEndsAt
                      ? Math.max(0, Math.ceil((new Date(status.gracePeriodEndsAt).getTime() - Date.now()) / 3_600_000))
                      : null;
                    return (
                      <ListItem key={code} divider>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          {active
                            ? <CheckCircleIcon fontSize="small" color={inGrace ? 'warning' : 'success'} />
                            : <CancelIcon fontSize="small" color="disabled" />}
                        </ListItemIcon>
                        <ListItemText
                          primary={label} secondary={code}
                          primaryTypographyProps={{ fontWeight: active ? 600 : 400, color: active ? 'text.primary' : 'text.disabled' }}
                          secondaryTypographyProps={{ fontFamily: 'monospace', fontSize: 11 }}
                        />
                        {inGrace && (
                          <Tooltip title={`License expired — grace period ends in ${graceEnd}h. Renew to restore full access.`}>
                            <Chip label={`Grace Period${graceEnd !== null ? ` (${graceEnd}h)` : ''}`} size="small" color="warning" variant="outlined" />
                          </Tooltip>
                        )}
                        {active && !inGrace && <Chip label="Active" size="small" color="success" variant="outlined" />}
                      </ListItem>
                    );
                  })}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Vendor Registration Info */}
        {canManage && isRegistered && registration && (
          <Grid item xs={12} md={6}>
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
              <CardHeader
                title="Vendor Registration"
                titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
                action={<Chip label="Connected" color="success" size="small" />}
              />
              <Divider />
              <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <InfoRow label="Vendor URL"  value={registration.vendorApiUrl ?? '–'} mono />
                  <InfoRow label="Public IP"   value={`${registration.publicIp}:${registration.publicPort}`} mono />
                  <InfoRow label="Registered"  value={registration.registeredAt ? new Date(registration.registeredAt).toLocaleDateString() : '–'} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Machine Fingerprint */}
        {canManage && fpData && (
          <Grid item xs={12} md={isRegistered ? 6 : 12}>
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <FingerprintIcon color="action" />
                  <Typography variant="subtitle2" fontWeight={600}>Machine Fingerprint</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" mb={1.5}>
                  Uniquely identifies this server. Shared with vendor automatically on registration.
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'grey.50', border: 1, borderColor: 'divider', borderRadius: 1, px: 2, py: 1 }}>
                  <Typography sx={{ flex: 1, fontFamily: 'monospace', fontSize: 13, letterSpacing: 1 }}>
                    {fpData.fingerprint}
                  </Typography>
                  <Tooltip title="Copy">
                    <IconButton size="small" onClick={copyFp} aria-label="Copy">
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Request History */}
        {canManage && (
          <Grid item xs={12}>
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
              <CardHeader title="License Request History" titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
              <Divider />
              <CardContent sx={{ p: 0 }}>
                {reqLoading ? (
                  <Box sx={{ p: 2 }}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} sx={{ mb: 1 }} />)}</Box>
                ) : !requests?.length ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.disabled">No license requests submitted yet</Typography>
                  </Box>
                ) : (
                  <ResponsiveTable minWidth={800}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell><b>Submitted</b></TableCell>
                        <TableCell><b>Modules Requested</b></TableCell>
                        <TableCell><b>Remarks</b></TableCell>
                        <TableCell><b>Status</b></TableCell>
                        <TableCell><b>Resolved</b></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {requests.map(req => {
                        const props = REQUEST_STATUS_PROPS[req.status];
                        return (
                          <TableRow key={req.id} hover>
                            <TableCell>{new Date(req.submittedAt).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {req.requestedModules.map(m => (
                                  <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" />
                                ))}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                                {req.remarks ?? '–'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={props.label}
                                color={props.color as any}
                                size="small"
                                icon={props.icon}
                              />
                              {req.rejectionReason && (
                                <Typography variant="caption" color="error.main" display="block">
                                  {req.rejectionReason}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              {req.resolvedAt ? new Date(req.resolvedAt).toLocaleDateString() : '–'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </ResponsiveTable>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
        {/* License Event History */}
        {canManage && (
          <Grid item xs={12}>
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
              <CardHeader
                title="License Event History"
                subheader="Every license activation, revocation, and expiry recorded on this server"
                titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
              />
              <Divider />
              <CardContent sx={{ p: 0 }}>
                {histLoading ? (
<Box sx={{ p: 2 }}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} sx={{ mb: 1 }} />)}</Box>
                ) : !requests?.length ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.disabled">No license requests submitted yet</Typography>
                  </Box>
                ) : (
                  <ResponsiveTable minWidth={800}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell><b>Submitted</b></TableCell>
                        <TableCell><b>Modules Requested</b></TableCell>
                        <TableCell><b>Remarks</b></TableCell>
                        <TableCell><b>Status</b></TableCell>
                        <TableCell><b>Resolved</b></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {requests.map(req => {
                        const props = REQUEST_STATUS_PROPS[req.status];
                        return (
                          <TableRow key={req.id} hover>
                            <TableCell>{new Date(req.submittedAt).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {req.requestedModules.map(m => (
                                  <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" />
                                ))}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                                {req.remarks ?? '–'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={props.label}
                                color={props.color as any}
                                size="small"
                                icon={props.icon}
                              />
                              {req.rejectionReason && (
                                <Typography variant="caption" color="error.main" display="block">
                                  {req.rejectionReason}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              {req.resolvedAt ? new Date(req.resolvedAt).toLocaleDateString() : '–'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </ResponsiveTable>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
        {/* License Event History */}
        {canManage && (
          <Grid item xs={12}>
            <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
              <CardHeader
                title="License Event History"
                subheader="Every license activation, revocation, and expiry recorded on this server"
                titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
              />
              <Divider />
              <CardContent sx={{ p: 0 }}>
                {histLoading ? (
                  <Box sx={{ p: 2 }}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} sx={{ mb: 1 }} />)}</Box>
                ) : !history?.length ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.disabled">No license events recorded</Typography>
                  </Box>
                ) : (
                  <ResponsiveTable minWidth={1000}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell><b>Date</b></TableCell>
                        <TableCell><b>Event</b></TableCell>
                        <TableCell><b>Modules</b></TableCell>
                        <TableCell><b>Max Users</b></TableCell>
                        <TableCell><b>Expires</b></TableCell>
                        <TableCell><b>Activated By</b></TableCell>
                        <TableCell><b>Last Updated</b></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.map((rec) => {
                        const statusMeta = HISTORY_STATUS_MAP[rec.status] ?? HISTORY_STATUS_MAP.EXPIRED;
                        return (
                          <TableRow key={rec.id} hover>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {new Date(rec.activatedAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={statusMeta.label}
                                color={statusMeta.color as any}
                                size="small"
                                icon={statusMeta.icon}
                              />
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {rec.licensedModules.length
                                  ? rec.licensedModules.map(m => (
                                      <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" variant="outlined" />
                                    ))
                                  : <Typography variant="caption" color="text.disabled">—</Typography>
                                }
                              </Box>
                            </TableCell>
                            <TableCell>{rec.maxUsers ?? '—'}</TableCell>
                            <TableCell>
                              {rec.expiresAt
                                ? new Date(rec.expiresAt).toLocaleDateString()
                                : <Chip label="Perpetual" size="small" color="success" variant="outlined" />}
                            </TableCell>
                            <TableCell>
                              {new Date(rec.activatedAt).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  </ResponsiveTable>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {registerOpen && (
        <VendorRegisterDialog
          open={registerOpen}
          onClose={() => setRegisterOpen(false)}
          onSubmit={(dto) => licenseApi.register(dto)}
        />
      )
      }
      <RequestLicenseDialog
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        // Fix: during a trial, LicenseService.getStatus() deliberately
        // widens `licensedModules` to every module so the hospital can
        // evaluate the whole platform (see that method's "Full-platform
        // trial" comment) -- but that widened list isn't what's genuinely
        // licensed, it's just temporarily unlocked for evaluation. Passing
        // it straight through here made every module look
        // "Already Licensed" in this dialog, so a hospital in trial could
        // never actually select anything to request from the vendor --
        // "Submit Request (0 modules)" was the only possible outcome.
        // While on trial, nothing is genuinely licensed yet (beyond the
        // always-required PLATFORM), so present an empty set here instead,
        // letting every real module show under "Available to Request".
        // Once a real license is uploaded/approved, isTrial flips false and
        // status.licensedModules (now the real, narrow union) is used as-is.
        currentModules={status?.isTrial ? [] : (status?.licensedModules ?? [])}
        gracePeriodModules={status?.gracePeriodModules ?? []}
        deploymentMode={status?.deploymentMode}
      />
      <UploadDialog      open={uploadOpen}   onClose={() => setUploadOpen(false)} />
      <CancelRequestDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => pendingRequest && cancelMutation.mutate(pendingRequest.id)}
        pending={cancelMutation.isPending}
      />
    </Box>
  );
}

