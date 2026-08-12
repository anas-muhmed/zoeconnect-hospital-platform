'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import SaveIcon from '@mui/icons-material/Save';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import ResponsiveTable from '@/components/ResponsiveTable';

// ── Types ─────────────────────────────────────────────────────────────────────

type TokenMode = 'LOCATION_BASED' | 'SERVICE_CENTER_BASED';

interface BranchConfig {
  mode: TokenMode;
}

interface TokenLocation {
  id:          string;
  code:        string;
  label:       string;
  isActive:    boolean;
  tokenPrefix: string;
}

interface ScConfig {
  id:                string;
  departmentId:      string;
  departmentName:    string;
  serviceCenterId:   string;
  serviceCenterName: string;
  intrabranchId:      string | null;
  tokenPrefix:       string;
  startNumber:       number;
  maxNumber:         number;
  resetDaily:        boolean;
  isActive:          boolean;
}

interface HisDept { departmentId: string | number; departmentName: string; }
interface HisSC   { serviceCenterId: string | number; serviceCenterName: string; }

// ── Location prefix editor row ────────────────────────────────────────────────

function LocationPrefixRow({ loc }: { loc: TokenLocation }) {
  const queryClient = useQueryClient();
  const [prefix, setPrefix] = useState(loc.tokenPrefix ?? '');
  const dirty = prefix !== (loc.tokenPrefix ?? '');

  const save = useMutation({
    mutationFn: () => apiClient.patch(`/token/locations/${loc.id}`, { tokenPrefix: prefix.toUpperCase() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['token-locations-all'] }),
  });

  return (
    <TableRow>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocationOnIcon fontSize="small" color="action" />
          <Typography fontWeight={600} variant="body2">{loc.label}</Typography>
        </Box>
      </TableCell>
      <TableCell><Typography variant="caption" color="text.secondary">{loc.code}</Typography></TableCell>
      <TableCell>
        <TextField
          size="small"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 10))}
          placeholder="e.g. G"
          sx={{ width: 100 }}
        />
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {prefix ? `${prefix}-001` : '001'}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Chip size="small" label={loc.isActive ? 'Active' : 'Inactive'} color={loc.isActive ? 'success' : 'default'} variant="outlined" sx={{ mr: 1 }} />
        <Tooltip title="Save prefix">
          <span>
            <IconButton size="small" color="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()} aria-label="Save prefix">
              {save.isPending ? <CircularProgress size={16} /> : <SaveIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

// ── SC config dialog (create / edit) ──────────────────────────────────────────

interface ScDialogProps {
  open:        boolean;
  onClose:     () => void;
  activeBranchId: string | null;
  editing:     ScConfig | null;
}

function ScConfigDialog({ open, onClose, activeBranchId, editing }: ScDialogProps) {
  const queryClient = useQueryClient();
  const [departments,    setDepartments]    = useState<HisDept[]>([]);
  const [serviceCenters, setServiceCenters] = useState<HisSC[]>([]);
  const [deptId,   setDeptId]   = useState('');
  const [scId,     setScId]     = useState('');
  const [prefix,   setPrefix]   = useState('');
  const [startNum, setStartNum] = useState(1);
  const [maxNum,   setMaxNum]   = useState(999);
  const [resetDaily, setResetDaily] = useState(true);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [loadingSCs,   setLoadingSCs]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDeptId(editing.departmentId);
      setScId(editing.serviceCenterId);
      setPrefix(editing.tokenPrefix ?? '');
      setStartNum(editing.startNumber ?? 1);
      setMaxNum(editing.maxNumber ?? 999);
      setResetDaily(editing.resetDaily ?? true);
    } else {
      setDeptId(''); setScId(''); setPrefix(''); setStartNum(1); setMaxNum(999); setResetDaily(true);
    }
    setError(null);
  }, [open, editing]);

  useEffect(() => {
    if (!open || !activeBranchId) return;
    setLoadingDepts(true);
    apiClient.get<HisDept[]>('/token/his/departments', { params: { branchId: activeBranchId } })
      .then((r) => setDepartments(r.data))
      .catch(() => setError('Failed to load departments from HIS Oracle.'))
      .finally(() => setLoadingDepts(false));
  }, [open, activeBranchId]);

  useEffect(() => {
    if (!open || !activeBranchId || !deptId) { setServiceCenters([]); return; }
    setLoadingSCs(true);
    apiClient.get<HisSC[]>('/token/his/service-centers', { params: { branchId: activeBranchId, departmentId: deptId } })
      .then((r) => setServiceCenters(r.data))
      .catch(() => setError('Failed to load service centers.'))
      .finally(() => setLoadingSCs(false));
  }, [open, activeBranchId, deptId]);

  const selectedDept = departments.find((d) => String(d.departmentId) === deptId);
  const selectedSC   = serviceCenters.find((s) => String(s.serviceCenterId) === scId);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        departmentId:      deptId,
        departmentName:    selectedDept?.departmentName ?? editing?.departmentName ?? '',
        serviceCenterId:   scId,
        serviceCenterName: selectedSC?.serviceCenterName ?? editing?.serviceCenterName ?? '',
        intrabranchId:     activeBranchId,
        tokenPrefix:       prefix.toUpperCase(),
        startNumber:       startNum,
        maxNumber:         maxNum,
        resetDaily,
      };
      return editing
        ? apiClient.put(`/token/config/sc-configs/${editing.id}`, body)
        : apiClient.post('/token/config/sc-configs', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-sc-configs'] });
      onClose();
    },
    onError: () => setError('Failed to save configuration. Check your permissions.'),
  });

  const canSave = !!deptId && !!scId;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{editing ? 'Edit Service Center Config' : 'Add Service Center Config'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        <TextField
          select
          label={loadingDepts ? 'Loading departments…' : 'Department'}
          value={deptId}
          onChange={(e) => { setDeptId(e.target.value); setScId(''); }}
          size="small"
          fullWidth
          disabled={!!editing || loadingDepts}
        >
          {departments.map((d) => (
            <MenuItem key={String(d.departmentId)} value={String(d.departmentId)}>{d.departmentName}</MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label={loadingSCs ? 'Loading service centers…' : 'Service Center'}
          value={scId}
          onChange={(e) => setScId(e.target.value)}
          size="small"
          fullWidth
          disabled={!!editing || !deptId || loadingSCs}
        >
          {serviceCenters.map((s) => (
            <MenuItem key={String(s.serviceCenterId)} value={String(s.serviceCenterId)}>{s.serviceCenterName}</MenuItem>
          ))}
        </TextField>

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField
            label="Token Prefix"
            placeholder="e.g. R"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 10))}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Start #"
            type="number"
            value={startNum}
            onChange={(e) => setStartNum(parseInt(e.target.value, 10) || 1)}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Max #"
            type="number"
            value={maxNum}
            onChange={(e) => setMaxNum(parseInt(e.target.value, 10) || 999)}
            size="small"
            sx={{ flex: 1 }}
          />
        </Box>

        <FormControlLabel
          control={<Switch checked={resetDaily} onChange={(e) => setResetDaily(e.target.checked)} />}
          label="Reset sequence daily"
        />

        <Typography variant="caption" color="text.secondary">
          Tokens for this service center will display as{' '}
          <strong>{prefix ? `${prefix}-${startNum}` : String(startNum)}</strong>, …
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canSave || save.isPending}
          onClick={() => save.mutate()}
          startIcon={save.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {editing ? 'Save Changes' : 'Add Configuration'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TokenPrefixConfigPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: config, isLoading: loadingConfig } = useQuery<BranchConfig>({
    queryKey: ['token-branch-config'],
    queryFn: () => apiClient.get('/token/config').then((r) => r.data),
  });
  const mode = config?.mode ?? 'LOCATION_BASED';

  // activeBranchId isn't exposed directly here; derive it via the config response's branch scoping
  // (the backend resolves branch from the JWT, so HIS lookups just need *a* branchId — reuse from auth store)
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  useEffect(() => {
    import('@/lib/store/auth.store').then(({ useAuthStore }) => {
      setActiveBranchId(useAuthStore.getState().activeBranchId ?? null);
    });
  }, []);

  const { data: locations = [], isLoading: loadingLocations } = useQuery<TokenLocation[]>({
    queryKey: ['token-locations-all'],
    queryFn: () => apiClient.get('/token/locations/all').then((r) => r.data),
    enabled: mode === 'LOCATION_BASED',
  });

  const { data: scConfigs = [], isLoading: loadingScConfigs } = useQuery<ScConfig[]>({
    queryKey: ['token-sc-configs'],
    queryFn: () => apiClient.get('/token/config/sc-configs').then((r) => r.data),
    enabled: mode === 'SERVICE_CENTER_BASED',
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScConfig | null>(null);

  const deactivate = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/token/config/sc-configs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['token-sc-configs'] }),
  });

  const activeScConfigs = useMemo(() => scConfigs.filter((c) => c.isActive), [scConfigs]);

  const isLoading = loadingConfig || (mode === 'LOCATION_BASED' ? loadingLocations : loadingScConfigs);

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <IconButton size="small" onClick={() => router.push('/token/config')}>
          <ArrowBackIcon />
        </IconButton>
        {mode === 'SERVICE_CENTER_BASED' ? <AccountTreeIcon color="success" /> : <LocationOnIcon color="success" />}
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>Token Prefix &amp; Number Config</Typography>
          <Typography variant="body2" color="text.secondary">
            {mode === 'SERVICE_CENTER_BASED'
              ? 'Set a token prefix and number range per HIS service center.'
              : 'Set a token prefix per manually configured location.'}
          </Typography>
        </Box>
        {mode === 'SERVICE_CENTER_BASED' && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setEditing(null); setDialogOpen(true); }}
          >
            Add Configuration
          </Button>
        )}
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : mode === 'LOCATION_BASED' ? (
        <Paper variant="outlined">
          {locations.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                No locations yet. Create one from the Token Queue counter screen.
              </Typography>
            </Box>
          ) : (
            <ResponsiveTable minWidth={700}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Location</TableCell>
                  <TableCell>Code</TableCell>
                  <TableCell>Prefix</TableCell>
                  <TableCell>Example</TableCell>
                  <TableCell align="right">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {locations.map((loc) => <LocationPrefixRow key={loc.id} loc={loc} />)}
              </TableBody>
            </Table>
            </ResponsiveTable>
          )}
        </Paper>
      ) : (
        <Paper variant="outlined">
          {activeScConfigs.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary" gutterBottom>
                No service center configurations yet.
              </Typography>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => { setEditing(null); setDialogOpen(true); }}>
                Add your first configuration
              </Button>
            </Box>
          ) : (
            <ResponsiveTable minWidth={800}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Department</TableCell>
                  <TableCell>Service Center</TableCell>
                  <TableCell>Prefix</TableCell>
                  <TableCell>Range</TableCell>
                  <TableCell>Reset Daily</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeScConfigs.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.departmentName}</TableCell>
                    <TableCell>{c.serviceCenterName}</TableCell>
                    <TableCell>
                      <Chip size="small" label={c.tokenPrefix || '(none)'} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {c.startNumber} – {c.maxNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={c.resetDaily ? 'Yes' : 'No'} color={c.resetDaily ? 'success' : 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => { setEditing(c); setDialogOpen(true); }} aria-label="Edit">
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" onClick={() => deactivate.mutate(c.id)} aria-label="Remove">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </ResponsiveTable>
          )}
        </Paper>
      )}

      <ScConfigDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        activeBranchId={activeBranchId}
        editing={editing}
      />
    </Box>
  );
}
