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
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import AddIcon from '@mui/icons-material/Add';
import ArchiveIcon from '@mui/icons-material/Archive';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Assignment {
  id:                 string;
  assignmentType:     'SERVICE_CENTER' | 'LOCATION';
  serviceCenterId?:   string | null;
  serviceCenterName?: string | null;
  departmentName?:    string | null;
  locationId?:        string | null;
  locationLabel?:     string | null;           // flattened (from public config endpoint)
  locationCode?:      string | null;           // flattened (from public config endpoint)
  location?: {                                  // nested (from admin list endpoint)
    id?:    string;
    label?: string;
    code?:  string;
  } | null;
  displayOrder:       number;
  isActive:           boolean;
}

interface Kiosk {
  id:          string;
  kioskSlug:   string;
  name:        string;
  kioskType:   'MULTIPLE' | 'SINGLE' | 'DISPLAY_ONLY';
  isActive:    boolean;
  isArchived:  boolean;
  assignments: Assignment[];
}

interface TokenLocation {
  id:    string;
  code:  string;
  label: string;
}

interface HisDept { departmentId: string; departmentName: string; intrabranchId: string; }
interface HisSC   { serviceCenterId: string; serviceCenterName: string; departmentId: string; intrabranchId: string; }

// ── Assignment label helper ───────────────────────────────────────────────────
function assignmentLabel(a: Assignment): string {
  if (a.assignmentType === 'SERVICE_CENTER') {
    return a.serviceCenterName ?? a.serviceCenterId ?? 'Unknown Service Center';
  }
  // LOCATION: try flat field first (public config), then nested relation (admin list)
  return a.locationLabel ?? a.location?.label ?? a.locationId ?? 'Unknown Location';
}

function assignmentSubLabel(a: Assignment): string {
  if (a.assignmentType === 'SERVICE_CENTER') {
    return a.departmentName ? `Dept: ${a.departmentName}` : `SC: ${a.serviceCenterId ?? ''}`;
  }
  const code = a.locationCode ?? a.location?.code;
  return code ? `Location · ${code}` : 'Location';
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function KioskManagementPage() {
  const queryClient = useQueryClient();
  const [createOpen,     setCreateOpen]     = useState(false);
  const [assignOpen,     setAssignOpen]     = useState<Kiosk | null>(null);
  const [copiedSlug,     setCopiedSlug]     = useState<string | null>(null);
  const [createForm,     setCreateForm]     = useState({ name: '', kioskType: 'MULTIPLE' as Kiosk['kioskType'] });

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: kiosks = [], isLoading } = useQuery<Kiosk[]>({
    queryKey: ['admin-kiosks'],
    queryFn: () => apiClient.get('/token/kiosks').then((r) => r.data),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (dto: typeof createForm) => apiClient.post('/token/kiosks', dto).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
      setCreateOpen(false);
      setCreateForm({ name: '', kioskType: 'MULTIPLE' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ slug, active }: { slug: string; active: boolean }) =>
      apiClient.post(`/token/kiosks/${slug}/${active ? 'enable' : 'disable'}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (slug: string) => apiClient.post(`/token/kiosks/${slug}/archive`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] }),
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: ({ slug, assignmentId }: { slug: string; assignmentId: string }) =>
      apiClient.delete(`/token/kiosks/${slug}/assignments/${assignmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] }),
  });

  const kioskUrl  = (slug: string) => `/kiosk/${slug}`;
  const copyUrl   = (slug: string) => {
    const full = `${window.location.origin}/kiosk/${slug}`;
    navigator.clipboard.writeText(full).then(() => {
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading kiosks...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Kiosk Management</Typography>
          <Typography variant="body2" color="text.secondary">
            Create kiosks and link them to locations or service centers.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          New Kiosk
        </Button>
      </Box>

      {kiosks.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No kiosks yet. Create one to get started.</Typography>
        </Paper>
      )}

      {kiosks.map((kiosk) => {
        const active = kiosk.assignments.filter((a) => a.isActive);
        return (
          <Paper key={kiosk.id} sx={{ p: 3, mb: 2, opacity: kiosk.isArchived ? 0.5 : 1 }}>
            {/* ── Kiosk header ── */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography fontWeight={700} variant="h6">{kiosk.name}</Typography>
                  <Chip size="small" label={kiosk.kioskType}
                    color={kiosk.kioskType === 'MULTIPLE' ? 'primary' : kiosk.kioskType === 'SINGLE' ? 'secondary' : 'default'} />
                  <Chip size="small"
                    label={kiosk.isArchived ? 'Archived' : kiosk.isActive ? 'Active' : 'Disabled'}
                    color={kiosk.isArchived ? 'default' : kiosk.isActive ? 'success' : 'warning'} />
                </Box>

                {/* URL bar */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'grey.100', borderRadius: 1, px: 1.5, py: 0.75, mb: 2 }}>
                  <Typography variant="body2" fontFamily="monospace" sx={{ flex: 1 }}>
                    /kiosk/{kiosk.kioskSlug}
                  </Typography>
                  <Tooltip title={copiedSlug === kiosk.kioskSlug ? 'Copied!' : 'Copy URL'}>
                    <IconButton size="small" onClick={() => copyUrl(kiosk.kioskSlug)} aria-label={copiedSlug === kiosk.kioskSlug ? 'Copied!' : 'Copy URL'}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Open kiosk">
                    <IconButton size="small" component="a" href={kioskUrl(kiosk.kioskSlug)} target="_blank" aria-label="Open kiosk">
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="View QR code">
                    <IconButton size="small" component="a" href={`/api/v1/kiosk/${kiosk.kioskSlug}/qr`} target="_blank" aria-label="View QR code">
                      <QrCode2Icon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>

                {/* ── Assignments section ── */}
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <LinkIcon sx={{ fontSize: 15 }} />
                      Linked to
                      {kiosk.kioskType === 'MULTIPLE' && active.length >= 1 ? null : (
                        <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                          {kiosk.kioskType === 'MULTIPLE' ? '(max 1)' : '(unlimited)'}
                        </Typography>
                      )}
                    </Typography>
                    {/* Only show Add button if MULTIPLE with no assignment, or SINGLE */}
                    {!kiosk.isArchived && (kiosk.kioskType !== 'MULTIPLE' || active.length === 0) && (
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setAssignOpen(kiosk)}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        Add Assignment
                      </Button>
                    )}
                  </Box>

                  {active.length === 0 ? (
                    <Alert severity="warning" sx={{ py: 0.5 }}>
                      No location/service center linked. This kiosk cannot issue tokens yet.
                    </Alert>
                  ) : (
                    <List dense disablePadding>
                      {active.map((a) => (
                        <ListItem
                          key={a.id}
                          disablePadding
                          sx={{
                            bgcolor: 'grey.50', borderRadius: 1, mb: 0.5, px: 1.5, py: 0.5,
                            border: '1px solid', borderColor: 'divider',
                          }}
                        >
                          <Box sx={{ mr: 1, color: a.assignmentType === 'LOCATION' ? 'primary.main' : 'secondary.main' }}>
                            {a.assignmentType === 'LOCATION'
                              ? <LocationOnIcon sx={{ fontSize: 16 }} />
                              : <AccountTreeIcon sx={{ fontSize: 16 }} />}
                          </Box>
                          <ListItemText
                            primary={assignmentLabel(a)}
                            secondary={assignmentSubLabel(a)}
                            primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                            secondaryTypographyProps={{ variant: 'caption' }}
                          />
                          {!kiosk.isArchived && (
                            <ListItemSecondaryAction>
                              <Tooltip title="Remove assignment">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => removeAssignmentMutation.mutate({ slug: kiosk.kioskSlug, assignmentId: a.id })}
                                 aria-label="Remove assignment">
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </ListItemSecondaryAction>
                          )}
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              </Box>

              {/* Right-side actions */}
              {!kiosk.isArchived && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ml: 1 }}>
                  <Tooltip title={kiosk.isActive ? 'Disable' : 'Enable'}>
                    <IconButton size="small" color={kiosk.isActive ? 'warning' : 'success'}
                      onClick={() => toggleMutation.mutate({ slug: kiosk.kioskSlug, active: !kiosk.isActive })} aria-label={kiosk.isActive ? 'Disable' : 'Enable'}>
                      <PowerSettingsNewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Archive kiosk">
                    <IconButton size="small" color="error"
                      onClick={() => {
                        if (confirm(`Archive "${kiosk.name}"? The kiosk URL will stop working.`))
                          archiveMutation.mutate(kiosk.kioskSlug);
                      }} aria-label="Archive kiosk">
                      <ArchiveIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          </Paper>
        );
      })}

      {/* ── Create kiosk dialog ── */}
      <ResponsiveDialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Kiosk</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Kiosk Name" value={createForm.name}
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Ground Floor Registration" fullWidth />
          <TextField select label="Kiosk Type" value={createForm.kioskType}
            onChange={(e) => setCreateForm((f) => ({ ...f, kioskType: e.target.value as any }))} fullWidth>
            <MenuItem value="MULTIPLE">Multiple — one service, prints directly</MenuItem>
            <MenuItem value="SINGLE">Single — patient picks from multiple services</MenuItem>
            <MenuItem value="DISPLAY_ONLY">Display Only — shows queue, no printing</MenuItem>
          </TextField>
          <Alert severity="info" sx={{ py: 0.5 }}>
            After creating, use "Add Assignment" to link this kiosk to a location or service center.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createMutation.mutate(createForm)}
            disabled={!createForm.name || createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ── Add assignment dialog ── */}
      {assignOpen && (
        <AssignmentDialog
          kiosk={assignOpen}
          onClose={() => {
            setAssignOpen(null);
            queryClient.invalidateQueries({ queryKey: ['admin-kiosks'] });
          }}
        />
      )}
    </Box>
  );
}

// ── Assignment Dialog ─────────────────────────────────────────────────────────
function AssignmentDialog({ kiosk, onClose }: { kiosk: Kiosk; onClose: () => void }) {
  const [type,     setType]     = useState<'LOCATION' | 'SERVICE_CENTER'>('LOCATION');
  const [locId,    setLocId]    = useState('');
  const [deptId,   setDeptId]   = useState('');
  const [scId,     setScId]     = useState('');
  const [error,    setError]    = useState('');

  // Bug fix: /token/his/departments and /token/his/service-centers both
  // require branchId server-side (they 400 without it -- both are @Public()
  // HIS lookups with no JWT to derive a branch from) -- this dialog never
  // sent one, so the department dropdown always showed
  // "No departments (HIS may be unavailable)" regardless of HIS's actual
  // status. See sc-configs/page.tsx's ScConfigDialog for the same pattern.
  const activeBranchId = useAuthStore((s) => s.activeBranchId);

  // Fetch locations
  const { data: locations = [] } = useQuery<TokenLocation[]>({
    queryKey: ['token-locations'],
    queryFn: () => apiClient.get('/token/locations').then((r) => r.data),
  });

  // Fetch HIS departments (only when SERVICE_CENTER selected)
  const { data: departments = [] } = useQuery<HisDept[]>({
    queryKey: ['his-departments', activeBranchId],
    queryFn: () => apiClient.get('/token/his/departments', { params: { branchId: activeBranchId } }).then((r) => r.data),
    enabled: type === 'SERVICE_CENTER' && !!activeBranchId,
  });

  // Fetch service centers for selected dept
  const { data: serviceCenters = [] } = useQuery<HisSC[]>({
    queryKey: ['his-service-centers', activeBranchId, deptId],
    queryFn: () => apiClient.get('/token/his/service-centers', { params: { branchId: activeBranchId, departmentId: deptId } }).then((r) => r.data),
    enabled: type === 'SERVICE_CENTER' && !!activeBranchId && !!deptId,
  });

  const saveMutation = useMutation({
    mutationFn: (dto: object) =>
      apiClient.post(`/token/kiosks/${kiosk.kioskSlug}/assignments`, dto).then((r) => r.data),
    onSuccess: onClose,
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to add assignment'),
  });

  const handleSave = () => {
    setError('');
    if (type === 'LOCATION') {
      if (!locId) { setError('Select a location'); return; }
      const loc = (locations as TokenLocation[]).find((l) => l.id === locId);
      saveMutation.mutate({ assignmentType: 'LOCATION', locationId: locId, displayOrder: 0 });
    } else {
      if (!scId) { setError('Select a service center'); return; }
      const sc = (serviceCenters as HisSC[]).find((s) => s.serviceCenterId === scId);
      const dept = (departments as HisDept[]).find((d) => d.departmentId === deptId);
      saveMutation.mutate({
        assignmentType:    'SERVICE_CENTER',
        serviceCenterId:   sc?.serviceCenterId,
        serviceCenterName: sc?.serviceCenterName,
        departmentId:      dept?.departmentId,
        departmentName:    dept?.departmentName,
        intrabranchId:     sc?.intrabranchId,
        displayOrder:      0,
      });
    }
  };

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Add Assignment — <Typography component="span" fontWeight={400}>{kiosk.name}</Typography>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Link this kiosk to a <strong>Location</strong> (manual) or a <strong>Service Center</strong> (HIS Oracle).
          Patients will receive tokens for whatever is linked here.
        </Typography>

        <TextField select label="Assignment Type" value={type}
          onChange={(e) => { setType(e.target.value as any); setLocId(''); setDeptId(''); setScId(''); }} fullWidth>
          <MenuItem value="LOCATION">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LocationOnIcon fontSize="small" color="primary" /> Location (manual)
            </Box>
          </MenuItem>
          <MenuItem value="SERVICE_CENTER">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccountTreeIcon fontSize="small" color="secondary" /> Service Center (HIS)
            </Box>
          </MenuItem>
        </TextField>

        {type === 'LOCATION' && (
          <TextField select label="Select Location" value={locId}
            onChange={(e) => setLocId(e.target.value)} fullWidth>
            {locations.length === 0
              ? <MenuItem disabled>No locations found</MenuItem>
              : locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>{l.label} ({l.code})</MenuItem>
                ))
            }
          </TextField>
        )}

        {type === 'SERVICE_CENTER' && (
          <>
            <TextField select label="Select Department" value={deptId}
              onChange={(e) => { setDeptId(e.target.value); setScId(''); }} fullWidth>
              {departments.length === 0
                ? <MenuItem disabled>No departments (HIS may be unavailable)</MenuItem>
                : departments.map((d) => (
                    <MenuItem key={d.departmentId} value={d.departmentId}>{d.departmentName}</MenuItem>
                  ))
              }
            </TextField>

            <TextField select label="Select Service Center" value={scId}
              onChange={(e) => setScId(e.target.value)} disabled={!deptId} fullWidth>
              {serviceCenters.length === 0
                ? <MenuItem disabled>{deptId ? 'No service centers found' : 'Select a department first'}</MenuItem>
                : serviceCenters.map((s) => (
                    <MenuItem key={s.serviceCenterId} value={s.serviceCenterId}>{s.serviceCenterName}</MenuItem>
                  ))
              }
            </TextField>
          </>
        )}

        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : 'Link Assignment'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
