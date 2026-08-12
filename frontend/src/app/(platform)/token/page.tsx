'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Divider from '@mui/material/Divider';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import InputAdornment from '@mui/material/InputAdornment';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import TvIcon from '@mui/icons-material/Tv';
import LogoutIcon from '@mui/icons-material/Logout';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import LockIcon from '@mui/icons-material/Lock';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import PlaceIcon from '@mui/icons-material/Place';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import CampaignIcon from '@mui/icons-material/Campaign';

import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store/auth.store';
import { useTokenSocket, LocationState, TokenCalledPayload } from '@/lib/hooks/useTokenSocket';
import { initTokenAudio, announceToken, AudioMode } from '@/lib/audio/tokenAudio';
import { apiClient } from '@/lib/api/client';

const TOKEN_MAX = 100;
const MAX_COUNTERS = 10;  // max counter slots shown in join panel

// ─────────────────────────────────────────────────────────────────────────────
// Recent location helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RecentLocation {
  locationId:    string;
  locationLabel: string;
}

const RECENT_LOC_KEY = 'hdsp:token:recent_locs';
const MAX_RECENT = 5;

function loadRecentLocs(): RecentLocation[] {
  try { return JSON.parse(localStorage.getItem(RECENT_LOC_KEY) ?? '[]'); } catch { return []; }
}

function saveRecentLoc(loc: RecentLocation) {
  const existing = loadRecentLocs().filter((r) => r.locationId !== loc.locationId);
  localStorage.setItem(RECENT_LOC_KEY, JSON.stringify([loc, ...existing].slice(0, MAX_RECENT)));
}

// ─────────────────────────────────────────────────────────────────────────────
// JoinPanel — operator selects an existing location + counter (LOCATION_BASED mode)
// ─────────────────────────────────────────────────────────────────────────────

interface JoinPanelProps {
  locations:           LocationState[];
  currentUserId:       string | undefined;
  connected:           boolean;
  socketError:         string | null;
  isAdmin:             boolean;
  onJoin:              (locationId: string, counterNumber: number) => void;
  onCreateLocation?:   (label: string) => Promise<void>;
}

function JoinPanel({ locations, currentUserId, connected, socketError, isAdmin, onJoin, onCreateLocation }: JoinPanelProps) {
  const router = useRouter();
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedCounter,    setSelectedCounter]    = useState<number | null>(null);
  const [joining,            setJoining]            = useState(false);
  const [recentLocs,         setRecentLocs]         = useState<RecentLocation[]>([]);

  // Create-location dialog (Bug 3 fix: isAdmin was passed but never used)
  const [createOpen,  setCreateOpen]  = useState(false);
  const [newLocLabel, setNewLocLabel] = useState('');
  const [creating,    setCreating]    = useState(false);

  // Load recents on mount
  useEffect(() => { setRecentLocs(loadRecentLocs()); }, []);

  // Reset spinner on socket error
  useEffect(() => { if (socketError) setJoining(false); }, [socketError]);

  const activeLocations   = locations.filter((l) => l.isActive);
  const selectedLocation  = locations.find((l) => l.id === selectedLocationId);

  // Build counter slots from the selected location's current state
  const counterSlots: Array<{ num: number; occupied: boolean; isYours: boolean; operatorName: string | null }> = [];
  if (selectedLocationId) {
    const counters = selectedLocation?.counters ?? [];
    const max = counters.length > 0
      ? Math.max(MAX_COUNTERS, ...counters.map((c) => c.counterNumber))
      : MAX_COUNTERS;
    for (let i = 1; i <= Math.min(max + 1, MAX_COUNTERS); i++) {
      const slot    = counters.find((c) => c.counterNumber === i);
      const isYours = !!slot && !!currentUserId && slot.operatorId === currentUserId;
      counterSlots.push({ num: i, occupied: slot?.isOccupied ?? false, isYours, operatorName: slot?.operatorName ?? null });
    }
  }

  const handleJoin = () => {
    if (!selectedLocationId || selectedCounter == null) return;
    setJoining(true);
    const loc = locations.find((l) => l.id === selectedLocationId);
    if (loc) {
      saveRecentLoc({ locationId: loc.id, locationLabel: loc.label });
      setRecentLocs(loadRecentLocs());
    }
    onJoin(selectedLocationId, selectedCounter);
  };

  const handleCreateLocation = async () => {
    if (!newLocLabel.trim() || !onCreateLocation) return;
    setCreating(true);
    try {
      await onCreateLocation(newLocLabel.trim());
      setCreateOpen(false);
      setNewLocLabel('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'background.default' }}>
      <Paper elevation={3} sx={{ width: '100%', maxWidth: 520, p: 4, display: 'flex', flexDirection: 'column', gap: 3, borderRadius: 3 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PlaceIcon color="primary" fontSize="large" />
            <Box>
              <Typography variant="h6" fontWeight={700}>Join a Billing Counter</Typography>
              <Typography variant="body2" color="text.secondary">
                Select a location and counter number to begin calling tokens
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* Bug 3 fix: show create-location button for admins */}
            {isAdmin && onCreateLocation && (
              <Tooltip title="Create new location">
                <IconButton size="small" color="primary" onClick={() => { setCreateOpen(true); setNewLocLabel(''); }} aria-label="Create new location">
                  <AddIcon />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Close and go back to dashboard">
              <IconButton size="small" onClick={() => router.push('/dashboard')} aria-label="Close and go back to dashboard">
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Divider />

        {/* Recently used quick-select */}
        {recentLocs.length > 0 && !selectedLocationId && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1} color="text.secondary">
              Recently used
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {recentLocs.map((r) => {
                if (!r) return null;
                const loc = activeLocations.find((l) => l.id === r.locationId);
                if (!loc) return null;
                return (
                  <Button
                    key={r.locationId}
                    variant="outlined"
                    size="small"
                    fullWidth
                    onClick={() => { setSelectedLocationId(r.locationId); setSelectedCounter(null); }}
                    sx={{ justifyContent: 'flex-start', textTransform: 'none', fontWeight: 600 }}
                  >
                    {loc.label}
                  </Button>
                );
              })}
            </Box>
            <Divider sx={{ mt: 2 }} />
          </Box>
        )}

        {/* Step 1 — Location */}
        <Box>
          <Typography variant="subtitle2" fontWeight={600} mb={1}>
            1. Select location
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>Location</InputLabel>
            <Select
              value={selectedLocationId}
              label="Location"
              onChange={(e) => {
                setSelectedLocationId(e.target.value);
                setSelectedCounter(null);
              }}
            >
              {activeLocations.map((l) => (
                <MenuItem key={l.id} value={l.id}>{l.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Step 2 — Counter */}
        {selectedLocationId && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              2. Select your counter number
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {counterSlots.map(({ num, occupied, isYours, operatorName }) => (
                <Tooltip
                  key={num}
                  title={
                    isYours  ? `Counter ${num} — yours, click to reclaim` :
                    occupied ? `Counter occupied by ${operatorName ?? 'another operator'}` :
                               `Counter ${num}`
                  }
                >
                  <span>
                    <Button
                      variant={selectedCounter === num ? 'contained' : 'outlined'}
                      size="small"
                      disabled={occupied && !isYours}
                      onClick={() => setSelectedCounter(num)}
                      color={isYours ? 'success' : 'primary'}
                      sx={{
                        minWidth: 52, height: 52, fontWeight: 700, fontSize: '1.1rem', position: 'relative',
                        ...(occupied && !isYours && {
                          opacity: 0.4,
                          '&::after': {
                            content: '""', position: 'absolute', inset: 0,
                            backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(0,0,0,.15) 3px, rgba(0,0,0,.15) 4px)',
                          },
                        }),
                        ...(isYours && { borderStyle: 'dashed', borderWidth: 2 }),
                      }}
                    >
                      {isYours ? num : occupied ? <LockIcon fontSize="small" /> : num}
                    </Button>
                  </span>
                </Tooltip>
              ))}
            </Box>
            {selectedLocation && selectedLocation.counters.some((c) => c.isOccupied) && (
              <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                <LockIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.3 }} />
                Locked = in use by another operator ·{' '}
                <span style={{ fontWeight: 600 }}>Dashed green = your counter</span>
              </Typography>
            )}
          </Box>
        )}

        {/* Connecting indicator */}
        {!connected && !joining && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={12} />
            <Typography variant="caption" color="text.secondary">Connecting to server…</Typography>
          </Box>
        )}

        {/* Join button */}
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={!selectedLocationId || selectedCounter == null || joining}
          onClick={handleJoin}
          sx={{ fontWeight: 700, py: 1.5 }}
        >
          {joining ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Join Counter'}
        </Button>

      </Paper>

      {/* Create location dialog */}
      <ResponsiveDialog open={createOpen} onClose={() => !creating && setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create new location</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Location name"
            placeholder="e.g. Billing Counter, Pharmacy"
            value={newLocLabel}
            onChange={(e) => setNewLocLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLocation(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateLocation}
            disabled={!newLocLabel.trim() || creating}
            startIcon={creating ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
          >
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCJoinPanel — operator selects Dept → Service Center + counter (SC_BASED mode)
// Bug 1 fix: new component rendered when tokenIssuanceMode === 'SERVICE_CENTER_BASED'
// ─────────────────────────────────────────────────────────────────────────────

interface HisDept { departmentId: string | number; departmentName: string; [k: string]: unknown; }
interface HisSC   { serviceCenterId: string | number; serviceCenterName: string; code?: string; [k: string]: unknown; }

interface SCJoinPanelProps {
  currentUserId: string | undefined;
  connected:     boolean;
  socketError:   string | null;
  activeBranchId: string | null;
  onJoin:        (locationId: string, counterNumber: number) => void;
}

function SCJoinPanel({ connected, socketError, activeBranchId, onJoin }: SCJoinPanelProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [departments,   setDepartments]   = useState<HisDept[]>([]);
  const [serviceCenters, setServiceCenters] = useState<HisSC[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState(user?.activeDepartmentId ?? '');
  const [selectedSCId,   setSelectedSCId]   = useState(user?.activeServiceCenterId ?? '');
  const [selectedCounter, setSelectedCounter] = useState<number | null>(null);
  const [joining,         setJoining]         = useState(false);
  const [loadingDepts,    setLoadingDepts]    = useState(false);
  const [loadingSCs,      setLoadingSCs]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  // Real Oracle name for the HIS-selected department/service center, resolved
  // by direct ID lookup when it isn't present in the filtered lists fetched
  // below. This is the source of truth for the fallback label -- preferred
  // over the name HIS itself sends at login (which may not always be sent).
  const [resolvedDeptName, setResolvedDeptName] = useState<string | null>(null);
  const [resolvedSCName,   setResolvedSCName]   = useState<string | null>(null);

  // Reset spinner on socket error
  useEffect(() => { if (socketError) setJoining(false); }, [socketError]);

  // Fetch departments on mount (when branchId available)
  useEffect(() => {
    if (!activeBranchId) return;
    setLoadingDepts(true);
    setError(null);
    apiClient
      .get<HisDept[]>('/token/his/departments', { params: { branchId: activeBranchId } })
      .then((r) => setDepartments(r.data))
      .catch(() => setError('Failed to load departments. Check Oracle HIS connection.'))
      .finally(() => setLoadingDepts(false));
  }, [activeBranchId]);

  // If the HIS-selected department isn't in the fetched list, resolve its
  // real name directly by ID rather than showing a bare numeric ID.
  useEffect(() => {
    if (loadingDepts) return;
    const id = user?.activeDepartmentId;
    if (!id || departments.find((d) => String(d.departmentId) === id)) return;
    apiClient
      .get<HisDept>(`/token/his/departments/${id}`)
      .then((r) => setResolvedDeptName(r.data.departmentName))
      .catch(() => { /* leave resolvedDeptName null -- falls back to name/ID below */ });
  }, [loadingDepts, departments, user?.activeDepartmentId]);

  // Fetch service centers when department changes
  useEffect(() => {
    if (!activeBranchId || !selectedDeptId) {
      setServiceCenters([]);
      setSelectedSCId('');
      return;
    }
    setLoadingSCs(true);
    setSelectedCounter(null);
    apiClient
      .get<HisSC[]>('/token/his/service-centers', {
        params: { branchId: activeBranchId, departmentId: selectedDeptId },
      })
      .then((r) => setServiceCenters(r.data))
      .catch(() => setError('Failed to load service centers.'))
      .finally(() => setLoadingSCs(false));
  }, [activeBranchId, selectedDeptId]);

  // Same as the department resolution above, for service centers.
  useEffect(() => {
    if (loadingSCs) return;
    const id = user?.activeServiceCenterId;
    if (!id || serviceCenters.find((s) => String(s.serviceCenterId) === id)) return;
    apiClient
      .get<HisSC>(`/token/his/service-centers/${id}`)
      .then((r) => setResolvedSCName(r.data.serviceCenterName))
      .catch(() => { /* leave resolvedSCName null -- falls back to name/ID below */ });
  }, [loadingSCs, serviceCenters, user?.activeServiceCenterId]);

  // The HIS-selected department/service center isn't always present in Oracle's
  // hisdepartment/servicecenter tables (the source for the dropdown lists above),
  // so fall back to a synthetic entry built from the name HIS sent at login time.
  // This keeps selectedDept/selectedSC always resolvable when the ID came from
  // HIS auto-login, avoiding both a blank/ID-only label and a crash in handleJoin().
  const selectedDept =
    departments.find((d) => String(d.departmentId) === selectedDeptId) ??
    (selectedDeptId && selectedDeptId === user?.activeDepartmentId
      ? { departmentId: selectedDeptId, departmentName: resolvedDeptName || user?.activeDepartmentName || `Department ${selectedDeptId}` }
      : undefined);
  const selectedSC =
    serviceCenters.find((s) => String(s.serviceCenterId) === selectedSCId) ??
    (selectedSCId && selectedSCId === user?.activeServiceCenterId
      ? { serviceCenterId: selectedSCId, serviceCenterName: resolvedSCName || user?.activeServiceCenterName || `Service Center ${selectedSCId}` }
      : undefined);

  const counterSlots = Array.from({ length: MAX_COUNTERS }, (_, i) => i + 1);

  const handleJoin = async () => {
    if (!selectedDeptId || !selectedSCId || selectedCounter == null || !activeBranchId) return;
    if (!selectedDept || !selectedSC) {
      setError('Could not resolve department/service center details. Please try again.');
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const r = await apiClient.post<{ id: string }>('/token/service-center/ensure', {
        serviceCenterId:   String(selectedSC!.serviceCenterId),
        serviceCenterName: selectedSC!.serviceCenterName ?? '',
        departmentId:      String(selectedDept!.departmentId),
        departmentName:    selectedDept!.departmentName ?? '',
        intrabranchId:     activeBranchId,
        branchId:          activeBranchId,
      });
      onJoin(r.data.id, selectedCounter);
    } catch {
      setError('Failed to connect to service center — check Oracle HIS connection.');
      setJoining(false);
    }
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'background.default' }}>
      <Paper elevation={3} sx={{ width: '100%', maxWidth: 520, p: 4, display: 'flex', flexDirection: 'column', gap: 3, borderRadius: 3 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AccountTreeIcon color="primary" fontSize="large" />
            <Box>
              <Typography variant="h6" fontWeight={700}>Join a Service Center Counter</Typography>
              <Typography variant="body2" color="text.secondary">
                Select department, service center, and counter to begin calling tokens
              </Typography>
            </Box>
          </Box>
          <Tooltip title="Close and go back to dashboard">
            <IconButton size="small" onClick={() => router.push('/dashboard')} aria-label="Close and go back to dashboard">
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Divider />

        {!activeBranchId && (
          <Alert severity="warning">No active branch selected. Please select a branch to continue.</Alert>
        )}

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
        )}

        {/* Step 1 — Department */}
        <Box>
          <Typography variant="subtitle2" fontWeight={600} mb={1}>
            1. Select department
          </Typography>
          <FormControl fullWidth size="small" disabled={!!user?.isHisIntegration || !activeBranchId || loadingDepts}>
            <InputLabel>
              {loadingDepts ? 'Loading departments…' : 'Department'}
            </InputLabel>
            <Select
              value={selectedDeptId}
              label={loadingDepts ? 'Loading departments…' : 'Department'}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                setSelectedSCId('');
                setSelectedCounter(null);
              }}
            >
              {departments.map((d) => (
                <MenuItem key={String(d.departmentId)} value={String(d.departmentId)}>{d.departmentName}</MenuItem>
              ))}
              {user?.activeDepartmentId && !departments.find(d => String(d.departmentId) === user.activeDepartmentId) && (
                 <MenuItem value={user.activeDepartmentId} disabled>
                   {resolvedDeptName || user.activeDepartmentName || `Department ${user.activeDepartmentId}`}
                 </MenuItem>
              )}
            </Select>
          </FormControl>
        </Box>

        {/* Step 2 — Service Center */}
        {selectedDeptId && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              2. Select service center
            </Typography>
            <FormControl fullWidth size="small" disabled={!!user?.isHisIntegration || loadingSCs}>
              <InputLabel>
                {loadingSCs ? 'Loading service centers…' : 'Service Center'}
              </InputLabel>
              <Select
                value={selectedSCId}
                label={loadingSCs ? 'Loading service centers…' : 'Service Center'}
                onChange={(e) => {
                  setSelectedSCId(e.target.value);
                  setSelectedCounter(null);
                }}
              >
                {serviceCenters.map((s) => (
                  <MenuItem key={String(s.serviceCenterId)} value={String(s.serviceCenterId)}>{s.serviceCenterName}</MenuItem>
                ))}
                {user?.activeServiceCenterId && !serviceCenters.find(s => String(s.serviceCenterId) === user.activeServiceCenterId) && (
                   <MenuItem value={user.activeServiceCenterId} disabled>
                     {resolvedSCName || user.activeServiceCenterName || `Service Center ${user.activeServiceCenterId}`}
                   </MenuItem>
                )}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* Step 3 — Counter */}
        {selectedSCId && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              3. Select your counter number
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {counterSlots.map((num) => (
                <Tooltip key={num} title={`Counter ${num}`}>
                  <Button
                    variant={selectedCounter === num ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => setSelectedCounter(num)}
                    color="primary"
                    sx={{ minWidth: 52, height: 52, fontWeight: 700, fontSize: '1.1rem' }}
                  >
                    {num}
                  </Button>
                </Tooltip>
              ))}
            </Box>
          </Box>
        )}

        {/* Connecting indicator */}
        {!connected && !joining && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={12} />
            <Typography variant="caption" color="text.secondary">Connecting to server…</Typography>
          </Box>
        )}

        {/* Join button */}
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={!selectedDeptId || !selectedSCId || selectedCounter == null || joining || !connected}
          onClick={handleJoin}
          sx={{ fontWeight: 700, py: 1.5 }}
        >
          {joining ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Join Counter'}
        </Button>

      </Paper>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function TokenManagementPage() {
  const { user, token: authToken, activeBranchId } = useAuthStore();

  const canOperate =
    user?.permissions?.includes('TOKEN:COUNTER:OPERATE') ||
    user?.roles?.some(r => r.name === 'SUPER_ADMIN') ||
    user?.roles?.some(r => r.name === 'HOSPITAL_ADMIN');

  const isAdmin =
    user?.roles?.some(r => r.name === 'SUPER_ADMIN') ||
    user?.roles?.some(r => r.name === 'HOSPITAL_ADMIN') ||
    false;

  // Bug 34 fix: gate create-location button on the actual permission, not just
  // hardcoded role names. A user can have TOKEN:LOCATION:MANAGE through a
  // custom role without being SUPER_ADMIN or HOSPITAL_ADMIN.
  const canManageLocation =
    isAdmin ||
    user?.permissions?.includes('TOKEN:LOCATION:MANAGE') ||
    false;

  const queryClient = useQueryClient();

  // Bug 1 fix: fetch token config to determine issuance mode
  const { data: tokenConfig } = useQuery<{ mode: 'LOCATION_BASED' | 'SERVICE_CENTER_BASED' }>({
    queryKey: ['token-branch-config'],
    queryFn: () => apiClient.get('/token/config').then((r) => r.data),
    enabled: !!canOperate,
    staleTime: 60_000,
  });

  const tokenMode = tokenConfig?.mode ?? 'LOCATION_BASED';

  const [audioMode,    setAudioMode]    = useState<AudioMode | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null);
  const [callingToken, setCallingToken] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [customToken,  setCustomToken]  = useState('');
  const [actionMenu,   setActionMenu]   = useState<{ num: number; anchor: HTMLElement; noShow: boolean } | null>(null);

  // Ref for session so the onCalled callback doesn't capture stale values
  const mySessionRef = useRef<{ locationId: string; counterNumber: number } | null>(null);

  // Bug fix (race condition UX): only report success once the server has
  // actually confirmed the call/recall for THIS operator's own counter —
  // never optimistically, since a simultaneous call from another counter on
  // the same token can be rejected server-side (see callToken() Redis lock).
  const handleCalled = useCallback((payload: TokenCalledPayload) => {
    const s = mySessionRef.current;
    if (s && s.locationId === payload.locationId && s.counterNumber === payload.counterNumber) {
      void announceToken(payload.tokenNumber, payload.counterNumber);
      setCallingToken(null);
      setSuccessMsg(
        payload.action === 'RECALLED'
          ? `Token ${payload.tokenNumber} re-announced`
          : `Token ${payload.tokenNumber} called`,
      );
    }
  }, []);

  // Bug fix: an admin switching the branch's issuance mode (LOCATION_BASED <->
  // SERVICE_CENTER_BASED) used to leave operators who already had this page
  // open stuck on the old join panel until they manually reloaded, because
  // the cached GET /token/config result never got invalidated. Refetch the
  // moment the server pushes the change.
  const handleModeChanged = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['token-branch-config'] });
  }, [queryClient]);

  // Socket
  const { connected, locations, session, joinCounter, leaveCounter, callToken, recallToken, markNotArrived, resetCounter } =
    useTokenSocket({ withAudio: false, onCalled: handleCalled, onError: setError, onModeChanged: handleModeChanged });

  // Keep the session ref in sync
  useEffect(() => {
    mySessionRef.current =
      session?.locked && session.locationId != null && session.counterNumber != null
        ? { locationId: session.locationId, counterNumber: session.counterNumber }
        : null;
  }, [session]);

  // ── Browser back-button handling for HIS auto-login sessions ───────────────
  //
  // This page lives inside an iframe embedded in a HIS JSF page. iframes share
  // the tab's joint session history with their parent, so a native browser
  // back press was walking through whatever's underneath -- sometimes an
  // unrelated /kiosk route from earlier in the browsing session, sometimes a
  // stale HIS JSF ViewState that no longer matches the server's session state
  // and renders as "A non recoverable error has occurred" (JSF back-button/
  // bfcache replay is a known JSF fragility, not something fixable from here
  // -- and not something this iframe can intercept once the browser decides a
  // real top-level navigation of the (cross-origin) parent tab is needed;
  // that's outside what any same-origin/cross-origin JS in this iframe can
  // observe or cancel).
  //
  // Gate on "running inside an iframe" (synchronous, known immediately) --
  // NOT on user?.isHisIntegration, which only becomes true after an async
  // profile fetch resolves. Gating on the async value left a real window
  // right after any reload of this page (which the very first trapped back
  // press can itself trigger, since the iframe's original navigation entry
  // predates any of our own pushState calls) where the trap wasn't installed
  // yet -- a second back press landing in that window went completely
  // untrapped, straight through to HIS's fragile history.
  //
  // Also push a small BUFFER of sentinel entries (not just one) and re-push a
  // buffer on every popstate, not a single entry. A single push-per-popstate
  // is vulnerable to the user physically double/triple-clicking the back
  // button faster than JS can react to the first popstate before the browser
  // processes the next one -- a known limitation of this history-trapping
  // pattern in general. A deeper buffer makes that race far less likely to
  // break through, though it is a mitigation, not a hard guarantee.
  useEffect(() => {
    if (typeof window === 'undefined' || window.self === window.top) return;

    const BUFFER = 8;
    const pushBuffer = (n: number) => {
      for (let i = 0; i < n; i++) {
        window.history.pushState({ hdspTokenGuard: true }, '', window.location.href);
      }
    };

    pushBuffer(BUFFER);

    const onPopState = () => {
      pushBuffer(4);

      const s = mySessionRef.current;
      if (s) {
        leaveCounter(s.locationId, s.counterNumber);
        return;
      }
      // Nothing left to step back through in-app -- hand off to HIS via
      // postMessage instead of ever letting real browser navigation happen.
      // Requires a matching `window.addEventListener('message', ...)` on the
      // HIS JSF page to actually act on this; if that's not wired up yet,
      // this is a harmless no-op (the trap above still prevents any real
      // navigation either way).
      window.parent.postMessage({ type: 'hdsp:token-back' }, '*');
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [leaveCounter]);

  // Active session details
  const myLocationId    = session?.locationId;
  const myCounterNumber = session?.counterNumber;
  const myLocation      = locations.find((l) => l.id === myLocationId);
  const mySlot          = myLocation?.counters.find((c) => c.counterNumber === myCounterNumber);

  // Called / no-show tokens in my location today
  const calledSet = new Set(myLocation?.calledTokens ?? []);
  const noShowSet = new Set(myLocation?.noShowTokens ?? []);
  const isTokenCalled   = (n: number) => calledSet.has(n);
  const isNoShow        = (n: number) => noShowSet.has(n);
  const isCurrentServed = (n: number) => mySlot?.currentToken === n;
  const issuedCount     = myLocation?.issuedCount ?? 0;
  const isIssued        = (n: number) => n > 0 && n <= issuedCount;

  // Bug fix: the token grid used to always render a fixed TOKEN_MAX (100)
  // buttons, so once more than 100 tokens were issued in a day (e.g. after
  // raising a service center's max number in Token Prefix Config, or just a
  // busy location with no configured ceiling — location-based issuance has
  // no cap and counts indefinitely), tokens past #100 had no button to call
  // even though they were validly issued. Size the grid to whatever's
  // actually been issued, with some headroom for the next few upcoming ones.
  const gridSize = Math.max(TOKEN_MAX, issuedCount + 20);

  // Audio init
  useEffect(() => { initTokenAudio().then(setAudioMode); }, []);

  // Clear the "in flight" spinner if the server rejects the action — success
  // is cleared via handleCalled() once the server actually confirms it.
  useEffect(() => { if (error) setCallingToken(null); }, [error]);

  // Bug 3 fix: create location handler — POST to backend; WS broadcast auto-updates locations list
  const handleCreateLocation = async (label: string): Promise<void> => {
    await apiClient.post('/token/locations', { label });
  };

  // ── Call a token ───────────────────────────────────────────────────────────
  //
  // Race-condition fix: this only *requests* the call. Success/failure is
  // resolved by the server (atomic Redis lock in TokenService.callToken) —
  // we no longer show an optimistic "called" message here. If two counters
  // call the same token at once, only one request wins server-side; the
  // loser gets a 'token:error' explaining the token was already taken.
  const handleCall = useCallback((tokenNum: number) => {
    if (!myLocationId || myCounterNumber == null) return;
    if (isTokenCalled(tokenNum) || isNoShow(tokenNum) || !isIssued(tokenNum)) return;
    setCallingToken(tokenNum);
    setError(null);
    callToken(myLocationId, myCounterNumber, tokenNum);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocationId, myCounterNumber, callToken, calledSet, noShowSet, issuedCount]);

  // ── Recall a token (patient missed announcement, or reactivate a not-arrived token) ──
  //
  // Recalling a token that was marked "not arrived" clears that flag
  // server-side and puts it back into the normal called (light-orange)
  // state — it can be marked not-arrived again later if needed.
  const handleRecall = useCallback((tokenNum: number) => {
    if (!myLocationId || myCounterNumber == null) return;
    setCallingToken(tokenNum);
    setError(null);
    recallToken(myLocationId, myCounterNumber, tokenNum);
  }, [myLocationId, myCounterNumber, recallToken]);

  // ── Mark a called token as "did not arrive" ─────────────────────────────────
  // Explicit operator action — replaces the old behaviour where every called
  // token silently doubled as a "click to reannounce" button. This is a status
  // flag, not a dead end: it just recolors the token so operators can spot
  // absent patients at a glance. Recalling it (see handleRecall) clears the
  // flag and puts it back in the normal called state, and it can be marked
  // not-arrived again later if the patient still doesn't show.
  const handleMarkNotArrived = useCallback((tokenNum: number) => {
    if (!myLocationId || myCounterNumber == null) return;
    setError(null);
    markNotArrived(myLocationId, myCounterNumber, tokenNum);
    setSuccessMsg(`Token ${tokenNum} marked as not arrived`);
  }, [myLocationId, myCounterNumber, markNotArrived]);

  // ── Space / Enter → call next available token ─────────────────────────────

  const handleCallRef = useRef(handleCall);
  useEffect(() => { handleCallRef.current = handleCall; }, [handleCall]);

  useEffect(() => {
    if (!session?.locked) return;

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        const called = myLocation?.calledTokens ?? [];
        const calledSet = new Set(called);
        const issuedCount = myLocation?.issuedCount ?? 0;
        for (let i = 1; i <= issuedCount; i++) {
          if (!calledSet.has(i)) {
            handleCallRef.current(i);
            return;
          }
        }
        if (issuedCount === 0) {
          setError('No tokens have been printed yet.');
        } else {
          setError('All printed tokens for today have been called in this location.');
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session?.locked, myLocation?.calledTokens]);

  // ── Permission gate ────────────────────────────────────────────────────────

  if (!canOperate) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">You don&apos;t have permission to access Token Management.</Alert>
      </Box>
    );
  }

  // ── Join panel — shown until operator picks location + counter ─────────────

  const isLicenseError = !!error && (
    error.toLowerCase().includes('license') || error.toLowerCase().includes('licensed')
  );

  if (!session?.locked) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Mini header */}
        <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ConfirmationNumberIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" fontWeight={700}>Token Queue</Typography>
          <Chip
            size="small"
            icon={connected ? <WifiIcon /> : <WifiOffIcon />}
            label={connected ? 'Live' : 'Connecting…'}
            color={connected ? 'success' : 'warning'}
            variant="outlined"
            sx={{ ml: 'auto' }}
          />
        </Box>

        {/* License / connection error */}
        {isLicenseError ? (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
            {isAdmin ? (
              <Alert
                severity="error"
                sx={{ maxWidth: 520 }}
                action={
                  <Button color="inherit" size="small" href="/settings/license">
                    License Settings
                  </Button>
                }
              >
                <strong>Queue Management license has expired.</strong>
                <br />
                Go to License Settings to submit a renewal request to your vendor.
              </Alert>
            ) : (
              <Alert severity="error" sx={{ maxWidth: 520 }}>
                <strong>Queue Management is currently unavailable.</strong>
                <br />
                The module license has expired. Please contact your IT administrator to resolve this.
              </Alert>
            )}
          </Box>
        ) : error ? (
          <Box sx={{ px: 3, pt: 2 }}>
            <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert>
          </Box>
        ) : null}

        {/* Bug 1 fix: branch join panel by token issuance mode */}
        {!isLicenseError && (
          tokenMode === 'SERVICE_CENTER_BASED' ? (
            <SCJoinPanel
              currentUserId={user?.id}
              connected={connected}
              socketError={error}
              activeBranchId={activeBranchId}
              onJoin={(locationId, counterNumber) => {
                joinCounter(locationId, counterNumber);
              }}
            />
          ) : (
            <JoinPanel
              locations={locations}
              currentUserId={user?.id}
              connected={connected}
              socketError={error}
              isAdmin={canManageLocation}
              onCreateLocation={handleCreateLocation}
              onJoin={(locationId, counterNumber) => {
                joinCounter(locationId, counterNumber);
              }}
            />
          )
        )}
      </Box>
    );
  }

  // ── Operator screen ────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ConfirmationNumberIcon color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
              {myLocation?.label ?? '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Counter {myCounterNumber}
            </Typography>
          </Box>
          <Chip
            size="small"
            icon={connected ? <WifiIcon /> : <WifiOffIcon />}
            label={connected ? 'Live' : 'Reconnecting…'}
            color={connected ? 'success' : 'warning'}
            variant="outlined"
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title={`Audio: ${audioMode ?? 'detecting…'}`}>
            <Chip
              size="small"
              icon={<VolumeUpIcon />}
              label={
                audioMode === 'chunks' ? 'Pre-recorded'
                : audioMode === 'speech' ? 'Browser TTS'
                : audioMode === 'visual' ? 'Visual only'
                : '…'
              }
              variant="outlined"
            />
          </Tooltip>

          <Tooltip title="Keyboard: Space / Enter = call next token">
            <Chip size="small" icon={<KeyboardIcon />} label="Space / Enter" variant="outlined" />
          </Tooltip>

          <Tooltip title="Open display board (TV screen) for this location">
            <IconButton
              size="small"
              onClick={() =>
                window.open(
                  // Cloud Token Queue Display fix (2026-07-31): displayToken
                  // is globally unique and self-identifies the tenant, unlike
                  // `code` (unique only per-tenant) — see
                  // TokenLocation.displayToken's doc comment.
                  myLocation?.displayToken
                    ? `/token/display?token=${myLocation.displayToken}`
                    : `/token/display?location=${myLocation?.code}`,
                  '_blank',
                  'noopener',
                )
              }
            >
              <TvIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Leave this counter">
            <IconButton
              size="small"
              color="warning"
              onClick={() => leaveCounter(myLocationId!, myCounterNumber!)}
             aria-label="Leave this counter">
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Divider />

      {/* Currently serving banner */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          borderColor: mySlot?.currentToken ? 'success.main' : 'divider',
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">Now Serving</Typography>
          <Typography
            variant="h3"
            fontWeight={900}
            color={mySlot?.currentToken ? 'success.main' : 'text.disabled'}
            lineHeight={1}
          >
            {mySlot?.currentToken ?? '—'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<RefreshIcon />}
            onClick={() => setConfirmReset(true)}
          >
            Reset
          </Button>
        </Box>
      </Paper>

      {/* Error banner */}
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Token grid */}
      <Paper variant="outlined" sx={{ p: 2, flex: 1, overflow: 'auto' }}>

        {/* ── Custom token input ─────────────────────────────────────────── */}
        {(() => {
          const customNum = parseInt(customToken, 10);
          const isValidNum = !isNaN(customNum) && customNum > 0;
          // Bug fix: a token can only be called/recalled if it was actually
          // issued/printed — block calling arbitrary numbers that were never issued.
          const notIssued        = isValidNum && !isIssued(customNum);
          // Not-arrived tokens recall just like any other called token — recalling
          // clears the not-arrived flag and puts it back in the normal called state.
          const customIsNoShow   = isValidNum && isNoShow(customNum);
          const isAlreadyCalled  = isValidNum && isTokenCalled(customNum);
          const canSubmit        = isValidNum && !notIssued;

          const submit = () => {
            if (!canSubmit) return;
            if (isAlreadyCalled) { handleRecall(customNum); } else { handleCall(customNum); }
            setCustomToken('');
          };

          return (
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    type="number"
                    label="Call specific token"
                    placeholder="e.g. 142"
                    value={customToken}
                    onChange={(e) => setCustomToken(e.target.value)}
                    error={notIssued}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                    inputProps={{ min: 1, max: 999 }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <ConfirmationNumberIcon fontSize="small" color={customIsNoShow ? 'error' : isAlreadyCalled ? 'warning' : 'action'} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ width: 200 }}
                  />
                  <Button
                    variant="contained"
                    color={customIsNoShow ? 'error' : isAlreadyCalled ? 'warning' : 'success'}
                    size="small"
                    disabled={!canSubmit || !connected}
                    onClick={submit}
                    sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
                  >
                    {isAlreadyCalled ? 'Recall Token' : 'Call Token'}
                  </Button>
                </Box>
                {notIssued ? (
                  <Typography variant="caption" color="error.main" sx={{ ml: 0.5 }}>
                    Token {customNum} has not been printed/issued yet — it can&apos;t be called
                  </Typography>
                ) : customIsNoShow ? (
                  <Typography variant="caption" color="error.main" sx={{ ml: 0.5 }}>
                    Token {customNum} was marked not-arrived — click Recall to try the patient again
                  </Typography>
                ) : isAlreadyCalled ? (
                  <Typography variant="caption" color="warning.main" sx={{ ml: 0.5 }}>
                    Token {customNum} was already called — click Recall to re-announce for the patient
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    Space / Enter calls the next available token
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })()}

        <Grid container spacing={0.75}>
          {Array.from({ length: gridSize }, (_, i) => i + 1).map((num) => {
            const called     = isTokenCalled(num);
            const noShow     = isNoShow(num);
            const nowServing = isCurrentServed(num);
            const isLoading  = callingToken === num;
            const notIssued  = !isIssued(num);

            return (
              <Grid item key={num} xs={2} sm={1.5} md={1.2} lg={1}>
                <Tooltip
                  title={
                    notIssued  ? `Token ${num} — not printed yet` :
                    noShow     ? `Token ${num} — marked not arrived · click to recall and try again` :
                    nowServing ? `Token ${num} — Now Serving` :
                    called     ? `Token ${num} — called · click for options (re-announce / mark not arrived)` :
                                 `Call token ${num}`
                  }
                  placement="top"
                >
                  <span>
                    <Button
                      fullWidth
                      variant={nowServing ? 'contained' : 'outlined'}
                      color={noShow ? 'error' : called && !nowServing ? 'warning' : 'success'}
                      size="small"
                      disabled={isLoading || !connected || notIssued}
                      onClick={(e) => {
                        if (nowServing) { handleRecall(num); return; }
                        if (called) { setActionMenu({ num, anchor: e.currentTarget, noShow }); return; }
                        handleCall(num);
                      }}
                      sx={{
                        minWidth: 0,
                        aspectRatio: '1',
                        fontWeight: nowServing ? 900 : 600,
                        fontSize: { xs: '0.7rem', sm: '0.85rem' },
                        p: 0.5,
                        transition: 'all 0.15s',
                        ...(!called && !nowServing && !notIssued && {
                          backgroundColor: 'rgba(46,125,50,0.08)',
                          borderColor: 'rgba(46,125,50,0.5)',
                          '&:hover': {
                            backgroundColor: 'rgba(46,125,50,0.18)',
                          },
                        }),
                        ...(notIssued && {
                          backgroundColor: 'rgba(0,0,0,0.02)',
                          borderColor: 'rgba(0,0,0,0.12)',
                          borderStyle: 'dashed',
                          color: 'rgba(0,0,0,0.25) !important',
                        }),
                        ...(called && !nowServing && !noShow && {
                          opacity: 0.5,
                          backgroundColor: 'rgba(237,108,2,0.05)',
                          borderColor: 'rgba(237,108,2,0.35)',
                          color: 'warning.main',
                          '&:hover': {
                            opacity: 1,
                            backgroundColor: 'rgba(237,108,2,0.12)',
                            borderColor: 'warning.main',
                          },
                        }),
                        ...(noShow && {
                          opacity: 0.75,
                          backgroundColor: 'rgba(211,47,47,0.08)',
                          borderColor: 'rgba(211,47,47,0.5)',
                          color: 'error.main',
                          '&:hover': {
                            opacity: 1,
                            backgroundColor: 'rgba(211,47,47,0.18)',
                            borderColor: 'error.main',
                          },
                        }),
                        ...(nowServing && {
                          boxShadow: (t) => `0 0 0 3px ${t.palette.success.light}`,
                        }),
                      }}
                    >
                      {isLoading ? <CircularProgress size={14} /> : noShow ? <PersonOffIcon fontSize="small" /> : num}
                    </Button>
                  </span>
                </Tooltip>
              </Grid>
            );
          })}
        </Grid>

        {/* Called-token action menu — explicit choice instead of blanket click-to-reannounce.
            For a token already marked not-arrived, only Recall is offered — recalling
            clears the not-arrived flag and puts it back in the normal called state. */}
        <Menu
          open={!!actionMenu}
          anchorEl={actionMenu?.anchor ?? null}
          onClose={() => setActionMenu(null)}
        >
          <MenuItem
            onClick={() => {
              if (actionMenu) handleRecall(actionMenu.num);
              setActionMenu(null);
            }}
          >
            <CampaignIcon fontSize="small" sx={{ mr: 1 }} color="warning" />
            {actionMenu?.noShow ? `Recall token ${actionMenu?.num} (try again)` : `Re-announce token ${actionMenu?.num}`}
          </MenuItem>
          {!actionMenu?.noShow && (
            <MenuItem
              onClick={() => {
                if (actionMenu) handleMarkNotArrived(actionMenu.num);
                setActionMenu(null);
              }}
            >
              <PersonOffIcon fontSize="small" sx={{ mr: 1 }} color="error" />
              Mark not arrived
            </MenuItem>
          )}
        </Menu>
      </Paper>

      {/* All counters in this location */}
      {myLocation && myLocation.counters.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" alignSelf="center">
            {myLocation.label}:
          </Typography>
          {myLocation.counters.map((c) => (
            <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" fontWeight={600}>
                Counter {c.counterNumber}:
              </Typography>
              <Chip
                size="small"
                label={c.currentToken ?? 'idle'}
                color={c.counterNumber === myCounterNumber ? 'primary' : 'default'}
                variant={c.counterNumber === myCounterNumber ? 'filled' : 'outlined'}
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            </Box>
          ))}
        </Paper>
      )}

      {/* Snackbar */}
      <Snackbar
        open={!!successMsg}
        autoHideDuration={1500}
        onClose={() => setSuccessMsg(null)}
        message={successMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />

      {/* Reset confirm */}
      <ResponsiveDialog open={confirmReset} onClose={() => setConfirmReset(false)}>
        <DialogTitle>Reset Counter {myCounterNumber}?</DialogTitle>
        <DialogContent>
          <Typography>
            Clears the &quot;Now Serving&quot; number for Counter {myCounterNumber} in{' '}
            <strong>{myLocation?.label}</strong>. Already-called tokens remain disabled.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              resetCounter(myLocationId!, myCounterNumber!);
              setConfirmReset(false);
            }}
          >
            Reset
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
