'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Switch from '@mui/material/Switch';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import { vendorApi, MODULE_LABELS, ALL_MODULES, type ApproveDto } from '@/lib/api/vendor.api';

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={500} sx={mono ? { fontFamily: 'monospace', fontSize: 12 } : undefined}>
        {value}
      </Typography>
    </Box>
  );
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // Approve state
  const [licenseType,   setLicenseType]   = useState<ApproveDto['licenseType']>('MODULE_LICENSE');
  const [modules,       setModules]        = useState<string[]>([]);
  const [maxUsers,      setMaxUsers]       = useState('50');
  const [expiresAt,     setExpiresAt]      = useState('');
  const [machineLocked, setMachineLocked]  = useState(false);
  const [vendorNotes,   setVendorNotes]    = useState('');

  // Reject dialog
  const [rejectOpen,  setRejectOpen]  = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data: request, isLoading } = useQuery({
    queryKey: ['request', id],
    queryFn:  () => vendorApi.getRequest(id),
  });

  // Each approval is a delta license — only the NEWLY requested modules.
  // ZoeConnect stores each approval as a separate record and accumulates them.
  // Existing (currentModules) are shown for reference only; the vendor does NOT
  // re-issue them here — they remain active on ZoeConnect from prior approvals.
  const [modulesInit, setModulesInit] = useState(false);
  if (request && !modulesInit) {
    // Pre-tick only the newly requested modules (vendor can untick to partially approve)
    setModules([...request.requestedModules]);
    setModulesInit(true);
  }

  const currentSet   = new Set(request?.currentModules ?? []);
  const requestedSet = new Set(request?.requestedModules ?? []);

  // Display only the requested modules in the checkbox list.
  // Currently-licensed modules are shown as reference chips above, not as checkboxes.
  const displayModules = request ? [...request.requestedModules] : [];

  const approveMutation = useMutation({
    mutationFn: () => vendorApi.approveRequest(id, {
      licenseType,
      modules,
      maxUsers:     parseInt(maxUsers, 10),
      expiresAt:    licenseType === 'PERPETUAL' ? null : (expiresAt || null),
      machineLocked,
      vendorNotes:  vendorNotes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['request', id] });
      qc.invalidateQueries({ queryKey: ['requests'] });
      enqueueSnackbar('License approved and delivered to hospital', { variant: 'success' });
      router.push('/requests');
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Approval failed', { variant: 'error' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => vendorApi.rejectRequest(id, rejectReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      enqueueSnackbar('Request rejected — hospital notified', { variant: 'info' });
      router.push('/requests');
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Rejection failed', { variant: 'error' });
    },
  });

  const toggleModule = (code: string) =>
    setModules(prev => prev.includes(code) ? prev.filter(m => m !== code) : [...prev, code]);

  if (isLoading) {
    return <Box sx={{ p: 3 }}><Skeleton variant="rounded" height={400} /></Box>;
  }

  if (!request) {
    return <Box sx={{ p: 3 }}><Alert severity="error">Request not found</Alert></Box>;
  }

  const isPending = request.status === 'PENDING';

  return (
    <Box sx={{ p: 3, maxWidth: 1000 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} sx={{ mb: 2 }}>
        Back to Requests
      </Button>

      {/* Status banner */}
      {!isPending && (
        <Alert
          severity={request.status === 'APPROVED' ? 'success' : 'error'}
          sx={{ mb: 3 }}
        >
          This request was <b>{request.status}</b>
          {request.resolvedAt && ` on ${new Date(request.resolvedAt).toLocaleDateString()}`}.
          {request.rejectionReason && ` Reason: ${request.rejectionReason}`}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Hospital info */}
        <Grid item xs={12} md={5}>
          <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
            <CardHeader title="Hospital Details"
              titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
            <Divider />
            <CardContent>
              <InfoRow label="Hospital Name"  value={request.hospital.hospitalName} />
              <InfoRow label="Hospital Code"  value={<Chip label={request.hospital.hospitalCode} size="small" sx={{ fontFamily: 'monospace' }} />} />
              <InfoRow label="Public IP"      value={`${request.hospital.publicIp}:${request.hospital.publicPort}`} mono />
              <InfoRow label="Machine FP"     value={request.machineFingerprint} mono />
              <InfoRow label="Currently On"   value={
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {request.currentModules.length
                    ? request.currentModules.map(m => <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" />)
                    : <Typography variant="body2" color="text.disabled">None</Typography>}
                </Box>
              } />
              <InfoRow label="Trial Account"  value={request.isTrial ? <Chip label="Yes" color="warning" size="small" /> : 'No'} />
              <InfoRow label="Submitted"      value={new Date(request.submittedAt).toLocaleString()} />
            </CardContent>
          </Card>

          {/* Request details */}
          <Card elevation={0} sx={{ border: 1, borderColor: 'divider', mt: 2 }}>
            <CardHeader title="Request Details"
              titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }} />
            <Divider />
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>Requested Modules</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
                {request.requestedModules.map(m => (
                  <Chip key={m} label={MODULE_LABELS[m] ?? m} color="primary" size="small" />
                ))}
              </Box>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="subtitle2" color="text.secondary" mb={0.5}>Remarks from Hospital</Typography>
              <Typography variant="body2" color={request.remarks ? 'text.primary' : 'text.disabled'}
                sx={{ fontStyle: request.remarks ? 'normal' : 'italic' }}>
                {request.remarks ?? 'No remarks provided'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Approval panel */}
        <Grid item xs={12} md={7}>
          <Card elevation={0} sx={{ border: 1, borderColor: isPending ? 'primary.main' : 'divider', borderWidth: isPending ? 2 : 1 }}>
            <CardHeader
              title={isPending ? 'Approve or Reject' : 'Approval Panel (Resolved)'}
              titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
            />
            <Divider />
            <CardContent>
              {!isPending ? (
                <Typography color="text.secondary">This request has already been resolved.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {/* License validity type — controls expiry behaviour, not which modules */}
                  <FormControl fullWidth size="small">
                    <InputLabel>License Validity</InputLabel>
                    <Select value={licenseType} label="License Validity"
                      onChange={e => setLicenseType(e.target.value as any)}>
                      <MenuItem value="MODULE_LICENSE">Time-limited (set expiry date below)</MenuItem>
                      <MenuItem value="PERPETUAL">Perpetual — no expiry date</MenuItem>
                      <MenuItem value="TRIAL_EXTENSION">Trial extension only</MenuItem>
                    </Select>
                  </FormControl>

                  {/* Modules to approve */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" mb={0.5}>
                      Modules to License
                    </Typography>
                    {/* Show currently-licensed modules as a quick reference */}
                    {(request.currentModules ?? []).length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>
                          Currently has:
                        </Typography>
                        {(request.currentModules ?? []).map(m => (
                          <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                        ))}
                      </Box>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      These are the modules being requested. Pre-ticked = requested by hospital.
                      Already-active modules (shown above) stay untouched — each approval is a separate delta license on ZoeConnect.
                    </Typography>
                    <FormGroup>
                      {displayModules.map(code => (
                        <FormControlLabel key={code}
                          control={
                            <Checkbox
                              size="small"
                              checked={modules.includes(code)}
                              onChange={() => toggleModule(code)}
                              color="primary"
                            />
                          }
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2">{MODULE_LABELS[code] ?? code}</Typography>
                              <Chip label="Requested" size="small" color="primary" variant="outlined"
                                sx={{ height: 18, fontSize: 10 }} />
                            </Box>
                          }
                          sx={{ mr: 2, mb: 0.5 }}
                        />
                      ))}
                    </FormGroup>
                    {displayModules.length === 0 && (
                      <Typography variant="caption" color="text.disabled" fontStyle="italic">
                        No modules in this request.
                      </Typography>
                    )}
                  </Box>

                  {/* Max users + expiry */}
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField label="Max Users" fullWidth size="small" type="number"
                        value={maxUsers} onChange={e => setMaxUsers(e.target.value)}
                        inputProps={{ min: 1 }} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        label={licenseType === 'PERPETUAL' ? 'Expiry (disabled for perpetual)' : 'Expiry Date'}
                        fullWidth size="small" type="date"
                        value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                        disabled={licenseType === 'PERPETUAL'}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                  </Grid>

                  {/* Machine lock */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FingerprintIcon fontSize="small" color={machineLocked ? 'primary' : 'disabled'} />
                    <FormControlLabel
                      control={<Switch checked={machineLocked} onChange={e => setMachineLocked(e.target.checked)} />}
                      label={
                        <Box>
                          <Typography variant="body2">Machine-lock this license</Typography>
                          <Typography variant="caption" color="text.secondary">
                            License will only work on: {request.machineFingerprint}
                          </Typography>
                        </Box>
                      }
                    />
                  </Box>

                  {/* Internal notes */}
                  <TextField label="Internal notes (not sent to hospital)" fullWidth size="small"
                    multiline minRows={2}
                    value={vendorNotes} onChange={e => setVendorNotes(e.target.value)} />

                  {/* Actions */}
                  <Divider />
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button variant="contained" color="success" fullWidth size="large"
                      startIcon={approveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
                      disabled={modules.length === 0 || approveMutation.isPending}
                      onClick={() => approveMutation.mutate()}>
                      Approve & Send License
                    </Button>
                    <Button variant="outlined" color="error" fullWidth size="large"
                      startIcon={<BlockIcon />}
                      onClick={() => setRejectOpen(true)}>
                      Reject
                    </Button>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Reject Dialog */}
      <ResponsiveDialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject License Request</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" mb={2}>
            The hospital will be notified with this reason.
          </Typography>
          <TextField label="Rejection reason" fullWidth multiline minRows={3}
            value={rejectReason} onChange={e => setRejectReason(e.target.value)}
            placeholder="e.g. Payment pending, Missing hospital code verification..." />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error"
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            startIcon={rejectMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <BlockIcon />}
            onClick={() => rejectMutation.mutate()}>
            Confirm Reject
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
