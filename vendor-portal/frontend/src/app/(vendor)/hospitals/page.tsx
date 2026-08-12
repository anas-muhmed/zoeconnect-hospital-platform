'use client';

import { useState, useMemo } from 'react';
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
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import FormGroup from '@mui/material/FormGroup';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Menu from '@mui/material/Menu';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import ExtensionIcon from '@mui/icons-material/Extension';
import TuneIcon from '@mui/icons-material/Tune';
import PeopleIcon from '@mui/icons-material/People';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import { vendorApi, MODULE_LABELS, ALL_MODULES } from '@/lib/api/vendor.api';
import type { Hospital } from '@/lib/api/vendor.api';

type RevokeType = 'FULL' | 'MODULE';

// ── License/trial summary derived from Hospital.licenses ────────────────────

interface LicenseSummary {
  isTrial: boolean;
  isLicensed: boolean;
  modules: string[];
  trialEndsAt: string | null;
  licenseEndsAt: string | null; // null = perpetual
}

function summarizeLicenses(hospital: Hospital): LicenseSummary {
  // Cloud tenants: the live subscription_licenses row (fetched server-side
  // from ZoeConnect Cloud's Cloud Licensing API) is authoritative when
  // present -- it's the only place a trial issued directly at provisioning
  // time (bypassing Vendor Portal's own approve/extend-trial flow, and so
  // never present in `hospital.licenses`) is visible at all. Only fall back
  // to the local `licenses` audit trail when the live query found nothing
  // (not provisioned yet, tenant lookup failed, etc.).
  const cs = hospital.cloudSubscription;
  if (cs) {
    const now = new Date();
    const expired = cs.currentPeriodEnd ? new Date(cs.currentPeriodEnd) < now : false;
    const isTrial = cs.subscriptionStatus === 'trialing' && !expired;
    const isLicensed = (cs.subscriptionStatus === 'active') && !expired;
    return {
      isTrial,
      isLicensed,
      modules: cs.licensedModules.filter(m => m !== 'PLATFORM'),
      trialEndsAt: isTrial ? cs.currentPeriodEnd : null,
      licenseEndsAt: isLicensed ? cs.currentPeriodEnd : null,
    };
  }

  const now = new Date();
  const active = (hospital.licenses ?? []).filter(l => {
    if (l.status !== 'ACTIVE') return false;
    if (l.expiresAt && new Date(l.expiresAt) < now) return false;
    return true;
  });

  const trialLicenses = active.filter(l => l.licenseType === 'TRIAL_EXTENSION');
  const paidLicenses  = active.filter(l => l.licenseType !== 'TRIAL_EXTENSION');

  const modules = new Set<string>();
  for (const l of active) {
    for (const m of l.licensedModules) {
      if (m !== 'PLATFORM') modules.add(m);
    }
  }

  const trialEndsAt = trialLicenses
    .map(l => l.expiresAt)
    .filter((d): d is string => !!d)
    .sort()[0] ?? null;

  const licenseExpiries = paidLicenses.map(l => l.expiresAt);
  const licenseEndsAt = paidLicenses.length === 0
    ? null
    : licenseExpiries.some(d => d === null)
      ? null // at least one perpetual license → no overall expiry
      : (licenseExpiries.filter((d): d is string => !!d).sort().slice(-1)[0] ?? null);

  return {
    isTrial:     trialLicenses.length > 0,
    isLicensed:  paidLicenses.length > 0,
    modules:     Array.from(modules),
    trialEndsAt,
    licenseEndsAt,
  };
}

// ── Per-row action menu (used in compact/split-screen mode) ──────────────────

function HospitalActionMenu({
  hospital,
  onHisConfig,
  onUsers,
  onSecurity,
  onSettings,
  onExtendTrial,
  onRevoke,
  onSuspend,
  onActivate,
  onDelete,
}: {
  hospital:      Hospital;
  onHisConfig:   () => void;
  onUsers:       () => void;
  onSecurity:    () => void;
  onSettings:    () => void;
  onExtendTrial: () => void;
  onRevoke:      () => void;
  onSuspend:     () => void;
  onActivate:    () => void;
  onDelete:      () => void;
}) {
  // Suspend/Activate and permanent Delete are self-hosted-only lifecycle
  // actions -- cloud tenants are managed via their own subscription/billing
  // status, not manually suspended or hard-deleted from the vendor portal.
  const isCloud = hospital.deploymentType === 'cloud';
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchor);

  return (
    <>
      <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{ sx: { minWidth: 200 } }}
      >
        <MenuItem onClick={() => { setAnchor(null); onHisConfig(); }}>
          <ListItemIcon><TuneIcon fontSize="small" color="primary" /></ListItemIcon>
          <ListItemText>HIS Schema Config</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onUsers(); }}>
          <ListItemIcon><PeopleIcon fontSize="small" color="primary" /></ListItemIcon>
          <ListItemText>ZoeConnect Users</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onSecurity(); }}>
          <ListItemIcon><SecurityIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Remote Admin (Security)</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onSettings(); }}>
          <ListItemIcon><SettingsIcon fontSize="small" color="action" /></ListItemIcon>
          <ListItemText>System Settings</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onExtendTrial(); }}>
          <ListItemIcon><ExtensionIcon fontSize="small" color="info" /></ListItemIcon>
          <ListItemText>Extend Trial</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setAnchor(null); onRevoke(); }}>
          <ListItemIcon><DeleteForeverIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Revoke License</ListItemText>
        </MenuItem>
        {!isCloud && (hospital.status === 'ACTIVE' ? (
          <MenuItem onClick={() => { setAnchor(null); onSuspend(); }}>
            <ListItemIcon><BlockIcon fontSize="small" color="warning" /></ListItemIcon>
            <ListItemText>Suspend</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem onClick={() => { setAnchor(null); onActivate(); }}>
            <ListItemIcon><CheckCircleIcon fontSize="small" color="success" /></ListItemIcon>
            <ListItemText>Activate</ListItemText>
          </MenuItem>
        ))}
        {!isCloud && (
          <MenuItem onClick={() => { setAnchor(null); onDelete(); }} sx={{ color: 'error.dark' }}>
            <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: 'error.dark' }} /></ListItemIcon>
            <ListItemText>Delete (permanent)</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HospitalsPage() {
  const qc     = useQueryClient();
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const theme   = useTheme();
  // Switch to compact action-menu mode when viewport < 900 px
  // (split-screen on a 1920 px monitor → each half ≈ 960 px → just above threshold;
  //  on a 1280 px monitor in split view → ≈ 640 px → compact mode kicks in)
  const compact = useMediaQuery(theme.breakpoints.down('md'));

  // Revoke dialog state
  const [revokeTarget,  setRevokeTarget]  = useState<string | null>(null);
  const [revokeType,    setRevokeType]    = useState<RevokeType>('FULL');
  const [revokeModules, setRevokeModules] = useState<string[]>([]);
  const [revokeReason,  setRevokeReason]  = useState('');
  const [forceLogout,   setForceLogout]   = useState(true);

  // Trial extension dialog state
  const [trialTarget,  setTrialTarget]  = useState<string | null>(null);
  const [trialExpiry,  setTrialExpiry]  = useState('');
  const [trialReason,  setTrialReason]  = useState('');

  // Delete hospital dialog state
  const [deleteTarget,  setDeleteTarget]  = useState<Hospital | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const { data: hospitals, isLoading, error } = useQuery({
    queryKey: ['hospitals'],
    queryFn:  vendorApi.getHospitals,
    refetchInterval: 30_000,
  });

  const { data: revokeLicenses } = useQuery({
    queryKey: ['hospital-licenses', revokeTarget],
    queryFn:  () => vendorApi.getHospitalLicenses(revokeTarget!),
    enabled:  !!revokeTarget,
  });

  const activeModulesForRevoke = useMemo(() => {
    if (!revokeLicenses) return null;
    const now = new Date();
    const mods = new Set<string>();
    for (const lic of revokeLicenses) {
      if (lic.status !== 'ACTIVE') continue;
      if (lic.expiresAt && new Date(lic.expiresAt) < now) continue;
      for (const m of lic.licensedModules) {
        if (m !== 'PLATFORM') mods.add(m);
      }
    }
    return Array.from(mods);
  }, [revokeLicenses]);

  const suspendMutation = useMutation({
    mutationFn: (id: string) => vendorApi.suspendHospital(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hospitals'] }); enqueueSnackbar('Hospital suspended', { variant: 'warning' }); },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => vendorApi.activateHospital(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hospitals'] }); enqueueSnackbar('Hospital activated', { variant: 'success' }); },
  });

  const revokeMutation = useMutation({
    mutationFn: () => vendorApi.revokeHospital(revokeTarget!, {
      type: revokeType, modules: revokeType === 'MODULE' ? revokeModules : undefined,
      reason: revokeReason, forceLogout,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hospitals'] });
      enqueueSnackbar('Revocation delivered to hospital', { variant: 'warning' });
      setRevokeTarget(null); setRevokeReason(''); setRevokeModules([]);
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.message ?? 'Revoke failed', { variant: 'error' }),
  });

  const trialMutation = useMutation({
    mutationFn: () => vendorApi.extendTrial(trialTarget!, trialExpiry, trialReason),
    onSuccess: () => {
      enqueueSnackbar('Trial extended — hospital notified', { variant: 'success' });
      setTrialTarget(null); setTrialExpiry(''); setTrialReason('');
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.message ?? 'Extension failed', { variant: 'error' }),
  });

  const deleteHospitalMutation = useMutation({
    mutationFn: () => vendorApi.deleteHospital(deleteTarget!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hospitals'] });
      enqueueSnackbar('Hospital and all related data permanently deleted', { variant: 'success' });
      setDeleteTarget(null); setDeleteConfirm('');
    },
    onError: (err: any) => enqueueSnackbar(err?.response?.data?.message ?? 'Delete failed', { variant: 'error' }),
  });

  const toggleRevokeModule = (code: string) =>
    setRevokeModules(prev => prev.includes(code) ? prev.filter(m => m !== code) : [...prev, code]);

  const STATUS_COLORS = { ACTIVE: 'success', PENDING: 'warning', SUSPENDED: 'error' } as const;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <PageHeader icon={<LocalHospitalIcon color="primary" />} title="Registered Tenants" />

      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load hospitals</Alert>}

      <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <ResponsiveTable minWidth={compact ? 560 : 900}>
        <Table sx={{ minWidth: compact ? 560 : 900 }} size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Hospital</TableCell>
              <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Public IP</TableCell>
              {/* Machine FP hidden on compact to save space */}
              {!compact && <TableCell sx={{ fontWeight: 700 }}>Machine FP</TableCell>}
              <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Last Webhook</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Licensing</TableCell>
              {!compact && <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Registered</TableCell>}
              <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: compact ? 7 : 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              : hospitals?.map(h => {
                  const lic = summarizeLicenses(h);
                  return (
                  <TableRow key={h.id} hover>
                    {/* Hospital name + code */}
                    <TableCell sx={{ minWidth: 130 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{h.hospitalName}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {h.hospitalCode}
                      </Typography>
                    </TableCell>

                    {/* Deployment Type -- Customers merge (Phase 2) */}
                    <TableCell>
                      <Chip
                        label={h.deploymentType === 'cloud' ? 'Cloud' : 'Self-Hosted'}
                        size="small"
                        color={h.deploymentType === 'cloud' ? 'info' : 'default'}
                        variant={h.deploymentType === 'cloud' ? 'filled' : 'outlined'}
                      />
                    </TableCell>

                    {/* Public IP -- not applicable to cloud tenants (see Hospital.publicIp doc comment) */}
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {h.deploymentType === 'cloud' ? (
                        <Typography variant="caption" color="text.disabled" fontStyle="italic">Cloud-managed</Typography>
                      ) : (
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {h.publicIp}:{h.publicPort}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Machine FP — hidden in compact mode */}
                    {!compact && (
                      <TableCell sx={{ maxWidth: 160 }}>
                        {h.deploymentType === 'cloud' ? (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        ) : (
                          <Tooltip title={h.machineFingerprint ?? ''}>
                            <Typography variant="caption" sx={{
                              fontFamily: 'monospace', color: 'text.secondary',
                              display: 'block', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              maxWidth: 140,
                            }}>
                              {h.machineFingerprint}
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                    )}

                    {/* Last Webhook */}
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {h.lastWebhookAt ? (
                        <>
                          <Chip label={h.lastWebhookStatus} size="small"
                            color={h.lastWebhookStatus === 'OK' ? 'success' : 'error'}
                            sx={{ mb: 0.25 }} />
                          <Typography variant="caption" color="text.secondary" display="block">
                            {new Date(h.lastWebhookAt).toLocaleString()}
                          </Typography>
                        </>
                      ) : <Typography variant="body2" color="text.disabled">Never</Typography>}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Chip label={h.status} size="small" color={STATUS_COLORS[h.status]} />
                    </TableCell>

                    {/* Licensing — trial/licensed status, modules, expiry */}
                    <TableCell sx={{ minWidth: 160 }}>
                      {lic.isTrial && (
                        <Chip label="TRIAL" size="small" color="info" variant="outlined" sx={{ mb: 0.5, mr: 0.5 }} />
                      )}
                      {lic.isLicensed && (
                        <Chip label="LICENSED" size="small" color="success" variant="outlined" sx={{ mb: 0.5 }} />
                      )}
                      {!lic.isTrial && !lic.isLicensed && (
                        <Typography variant="caption" color="text.disabled" fontStyle="italic" display="block">
                          No active license
                        </Typography>
                      )}
                      {lic.modules.length > 0 && (
                        <Tooltip title={lic.modules.map(m => MODULE_LABELS[m] ?? m).join(', ')}>
                          <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ maxWidth: 150 }}>
                            {lic.modules.map(m => MODULE_LABELS[m] ?? m).join(', ')}
                          </Typography>
                        </Tooltip>
                      )}
                      {lic.isTrial && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Trial ends {lic.trialEndsAt ? new Date(lic.trialEndsAt).toLocaleDateString() : '—'}
                        </Typography>
                      )}
                      {lic.isLicensed && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {lic.licenseEndsAt ? `Expires ${new Date(lic.licenseEndsAt).toLocaleDateString()}` : 'Perpetual'}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Registered — hidden in compact mode */}
                    {!compact && (
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {new Date(h.registeredAt).toLocaleDateString()}
                      </TableCell>
                    )}

                    {/* Actions */}
                    <TableCell align="center">
                      {compact ? (
                        // ── Compact: single ⋮ menu ────────────────────────
                        <HospitalActionMenu
                          hospital={h}
                          onHisConfig={()   => router.push(`/hospitals/${h.id}/his-config`)}
                          onUsers={()       => router.push(`/hospitals/${h.id}/hdsp-users`)}
                          onSecurity={()    => router.push(`/hospitals/${h.id}/security`)}
                          onSettings={()    => router.push(`/hospitals/${h.id}/settings`)}
                          onExtendTrial={() => setTrialTarget(h.id)}
                          onRevoke={()      => { setRevokeTarget(h.id); setRevokeType('FULL'); }}
                          onSuspend={()     => suspendMutation.mutate(h.id)}
                          onActivate={()    => activateMutation.mutate(h.id)}
                          onDelete={()      => { setDeleteTarget(h); setDeleteConfirm(''); }}
                        />
                      ) : (
                        // ── Full: inline icon row ─────────────────────────
                        <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center' }}>
                          <Tooltip title="HIS Schema Config">
                            <IconButton size="small" color="primary" onClick={() => router.push(`/hospitals/${h.id}/his-config`)} aria-label="HIS Schema Config">
                              <TuneIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="ZoeConnect Users">
                            <IconButton size="small" color="primary" onClick={() => router.push(`/hospitals/${h.id}/hdsp-users`)} aria-label="ZoeConnect Users">
                              <PeopleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remote Admin (Security)">
                            <IconButton size="small" color="error" onClick={() => router.push(`/hospitals/${h.id}/security`)} aria-label="Remote Admin (Security)">
                              <SecurityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="System Settings">
                            <IconButton size="small" onClick={() => router.push(`/hospitals/${h.id}/settings`)} aria-label="System Settings">
                              <SettingsIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Extend Trial">
                            <IconButton size="small" color="info" onClick={() => setTrialTarget(h.id)} aria-label="Extend Trial">
                              <ExtensionIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Revoke License">
                            <IconButton size="small" color="error" onClick={() => { setRevokeTarget(h.id); setRevokeType('FULL'); }} aria-label="Revoke License">
                              <DeleteForeverIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {/* Suspend/Activate and permanent Delete are self-hosted-only
                              lifecycle actions -- cloud tenants are managed via their own
                              subscription/billing status, not manually here. */}
                          {h.deploymentType !== 'cloud' && (h.status === 'ACTIVE'
                            ? <Tooltip title="Suspend Hospital">
                                <IconButton size="small" color="warning" onClick={() => suspendMutation.mutate(h.id)} aria-label="Suspend Hospital">
                                  <BlockIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            : <Tooltip title="Activate Hospital">
                                <IconButton size="small" color="success" onClick={() => activateMutation.mutate(h.id)} aria-label="Activate Hospital">
                                  <CheckCircleIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                          )}
                          {h.deploymentType !== 'cloud' && (
                            <Tooltip title="Delete Hospital (permanent)">
                              <IconButton size="small" sx={{ color: 'error.dark' }} onClick={() => { setDeleteTarget(h); setDeleteConfirm(''); }} aria-label="Delete Hospital (permanent)">
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
            }
          </TableBody>
        </Table>
        </ResponsiveTable>
      </Card>

      {/* ── Revocation Dialog ─────────────────────────────────────────────── */}
      <ResponsiveDialog open={!!revokeTarget} onClose={() => setRevokeTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: 'error.main' }}>Revoke License</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
          <Alert severity="error">
            This will immediately push a revocation event to the hospital. The license will stop working within seconds.
          </Alert>
          <FormControl fullWidth size="small">
            <InputLabel>Revocation Type</InputLabel>
            <Select value={revokeType} label="Revocation Type" onChange={e => setRevokeType(e.target.value as RevokeType)}>
              <MenuItem value="FULL">Full Revocation (all modules)</MenuItem>
              <MenuItem value="MODULE">Module-Level (specific modules only)</MenuItem>
            </Select>
          </FormControl>
          {revokeType === 'MODULE' && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>Select modules to revoke</Typography>
              {activeModulesForRevoke === null ? (
                <CircularProgress size={20} />
              ) : activeModulesForRevoke.length === 0 ? (
                <Typography variant="body2" color="text.disabled" fontStyle="italic">
                  No active modules found for this hospital.
                </Typography>
              ) : (
                <FormGroup row>
                  {activeModulesForRevoke.map(code => (
                    <FormControlLabel key={code}
                      control={<Checkbox size="small" checked={revokeModules.includes(code)}
                        onChange={() => toggleRevokeModule(code)} />}
                      label={<Typography variant="body2">{MODULE_LABELS[code]}</Typography>}
                    />
                  ))}
                </FormGroup>
              )}
            </Box>
          )}
          <TextField label="Reason" fullWidth multiline minRows={2}
            value={revokeReason} onChange={e => setRevokeReason(e.target.value)}
            placeholder="Non-payment, contract termination, abuse..." />
          <FormControlLabel
            control={<Switch checked={forceLogout} onChange={e => setForceLogout(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>Force logout all users</Typography>
                <Typography variant="caption" color="text.secondary">
                  Clears all active sessions immediately on the hospital side
                </Typography>
              </Box>
            }
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRevokeTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error"
            disabled={!revokeReason.trim() || (revokeType === 'MODULE' && revokeModules.length === 0) || revokeMutation.isPending}
            startIcon={revokeMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <DeleteForeverIcon />}
            onClick={() => revokeMutation.mutate()}>
            Confirm Revoke
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ── Delete Hospital Dialog ────────────────────────────────────────── */}
      <ResponsiveDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: 'error.dark', fontWeight: 700 }}>Delete Hospital — Permanent</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Alert severity="error">
            This permanently deletes <strong>{deleteTarget?.hospitalName}</strong> and ALL related data —
            licenses, license requests, HIS config, ZoeConnect user credentials, and revocation events.
            This action cannot be undone.
          </Alert>
          <TextField
            label={`Type "${deleteTarget?.hospitalCode}" to confirm`}
            fullWidth size="small"
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
            sx={{ fontFamily: 'monospace' }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" startIcon={<DeleteIcon />}
            disabled={deleteConfirm !== deleteTarget?.hospitalCode || deleteHospitalMutation.isPending}
            onClick={() => deleteHospitalMutation.mutate()}>
            {deleteHospitalMutation.isPending ? 'Deleting...' : 'Permanently Delete'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ── Trial Extension Dialog ────────────────────────────────────────── */}
      <ResponsiveDialog open={!!trialTarget} onClose={() => setTrialTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Extend Trial</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
          <TextField
            label="New expiry date" type="date" fullWidth size="small"
            value={trialExpiry} onChange={e => setTrialExpiry(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Reason" fullWidth size="small" multiline minRows={2}
            value={trialReason} onChange={e => setTrialReason(e.target.value)}
            placeholder="e.g. Evaluation extended by 7 days pending sign-off"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTrialTarget(null)}>Cancel</Button>
          <Button variant="contained"
            disabled={!trialExpiry || trialMutation.isPending}
            startIcon={trialMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <ExtensionIcon />}
            onClick={() => trialMutation.mutate()}>
            Extend Trial
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
