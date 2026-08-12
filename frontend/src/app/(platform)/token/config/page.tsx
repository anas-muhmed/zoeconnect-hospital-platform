'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import TuneIcon from '@mui/icons-material/Tune';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface TokenLocation {
  id:    string;
  code:  string;
  label: string;
}

type TokenMode = 'LOCATION_BASED' | 'SERVICE_CENTER_BASED';

interface BranchConfig {
  id:             string;
  branchId:       string;
  mode:           TokenMode;
  dailyResetTime: string;
  timezone:       string;
  updatedBy:      string | null;
  updatedAt:      string;
}

const MODE_OPTIONS: Array<{
  value: TokenMode;
  label: string;
  icon: React.ReactNode;
  description: string;
  bullets: string[];
}> = [
  {
    value: 'LOCATION_BASED',
    label: 'Location Based',
    icon: <LocationOnIcon sx={{ fontSize: 36 }} />,
    description: 'Tokens are issued per manually configured location. No HIS Oracle dependency.',
    bullets: [
      'Admin creates locations (e.g. Billing, Pharmacy)',
      'Each location has its own daily token sequence',
      'Works fully offline — no HIS connection needed',
      'Suitable for non-clinical or simple counter setups',
    ],
  },
  {
    value: 'SERVICE_CENTER_BASED',
    label: 'Service Center Based',
    icon: <AccountTreeIcon sx={{ fontSize: 36 }} />,
    description: 'Tokens are issued per HIS service center. Departments and SCs are pulled from Oracle.',
    bullets: [
      'Service centers imported from HIS Oracle in real-time',
      'Tokens linked to department → service center hierarchy',
      'Enables HIS appointment integration',
      'Requires active Oracle HIS connection',
    ],
  },
];

export default function TokenConfigPage() {
  const router       = useRouter();
  const queryClient  = useQueryClient();
  const [pendingMode,   setPendingMode]   = useState<TokenMode | null>(null);
  const [confirmed,     setConfirmed]     = useState(false);
  const [resetConfirm,  setResetConfirm]  = useState(false);
  const [resetSuccess,  setResetSuccess]  = useState(false);
  const [resetTarget,   setResetTarget]   = useState<'ALL' | string>('ALL'); // 'ALL' or a locationId

  const { data: config, isLoading, isError } = useQuery<BranchConfig>({
    queryKey: ['token-branch-config'],
    queryFn: () => apiClient.get('/token/config').then((r) => r.data),
  });

  const updateMode = useMutation({
    mutationFn: (mode: TokenMode) =>
      apiClient.put('/token/config/mode', { mode }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['token-branch-config'] });
      setPendingMode(null);
      setConfirmed(false);
    },
  });

  const { data: locations = [] } = useQuery<TokenLocation[]>({
    queryKey: ['token-locations'],
    queryFn: () => apiClient.get('/token/locations').then((r) => r.data),
    enabled: resetConfirm, // only fetch when the dialog opens
  });

  const resetMutation = useMutation({
    mutationFn: (target: 'ALL' | string) =>
      apiClient.post('/token/config/reset', target === 'ALL'
        ? {}
        : { referenceType: 'LOCATION', referenceId: target },
      ).then((r) => r.data),
    onSuccess: () => {
      setResetConfirm(false);
      setResetSuccess(true);
      setResetTarget('ALL');
      setTimeout(() => setResetSuccess(false), 5000);
    },
  });

  const activeMode   = config?.mode ?? 'LOCATION_BASED';
  const selectedMode = pendingMode ?? activeMode;
  const isDirty      = pendingMode !== null && pendingMode !== activeMode;

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading configuration...</Typography>
      </Box>
    );
  }

  if (isError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Failed to load token configuration. Check your permissions.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Token Queue Configuration
        </Typography>
        <Typography color="text.secondary" variant="body2">
          Configure how tokens are issued for this branch. Choose between manual locations or HIS service centers.
        </Typography>
      </Box>

      {/* Mode Selection */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            Token Issuance Mode
          </Typography>
          <Chip
            size="small"
            label={activeMode === 'LOCATION_BASED' ? 'Location Based' : 'Service Center Based'}
            color="primary"
            variant="outlined"
          />
        </Box>
        <Divider sx={{ mb: 3 }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
          {MODE_OPTIONS.map((opt) => {
            const isActive   = activeMode === opt.value;
            const isSelected = selectedMode === opt.value;
            return (
              <Card
                key={opt.value}
                variant="outlined"
                sx={{
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  borderWidth: isSelected ? 2 : 1,
                  transition: 'all 0.15s',
                  position: 'relative',
                  bgcolor: isSelected ? 'primary.50' : 'background.paper',
                }}
              >
                <CardActionArea
                  onClick={() => {
                    setPendingMode(opt.value);
                    setConfirmed(false);
                  }}
                  sx={{ p: 2.5, alignItems: 'flex-start', display: 'flex', flexDirection: 'column', height: '100%' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, width: '100%' }}>
                    <Box sx={{ color: isSelected ? 'primary.main' : 'text.secondary' }}>
                      {opt.icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography fontWeight={700} variant="subtitle1">
                        {opt.label}
                      </Typography>
                      {isActive && (
                        <Chip size="small" label="Current" color="success" sx={{ height: 18, fontSize: '0.65rem' }} />
                      )}
                    </Box>
                    <Box sx={{ color: isSelected ? 'primary.main' : 'text.disabled' }}>
                      {isSelected
                        ? <CheckCircleIcon />
                        : <RadioButtonUncheckedIcon />
                      }
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    {opt.description}
                  </Typography>

                  <Box component="ul" sx={{ m: 0, pl: 2, mt: 'auto' }}>
                    {opt.bullets.map((b) => (
                      <Box component="li" key={b} sx={{ mb: 0.25 }}>
                        <Typography variant="caption" color="text.secondary">{b}</Typography>
                      </Box>
                    ))}
                  </Box>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>

        {/* Confirmation warning when changing mode */}
        {isDirty && (
          <Alert
            severity="warning"
            icon={<WarningAmberIcon />}
            sx={{ mb: 2 }}
            action={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  size="small"
                  onClick={() => { setPendingMode(null); setConfirmed(false); }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="warning"
                  disabled={updateMode.isPending}
                  onClick={() => updateMode.mutate(pendingMode!)}
                >
                  {updateMode.isPending ? 'Saving...' : 'Confirm Change'}
                </Button>
              </Box>
            }
          >
            Changing mode from <strong>{activeMode === 'LOCATION_BASED' ? 'Location Based' : 'Service Center Based'}</strong> to{' '}
            <strong>{pendingMode === 'LOCATION_BASED' ? 'Location Based' : 'Service Center Based'}</strong>.
            Existing token history is preserved. Kiosk assignments may need to be reviewed.
          </Alert>
        )}

        {updateMode.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>Failed to update mode. Please try again.</Alert>
        )}
        {updateMode.isSuccess && !isDirty && (
          <Alert severity="success" sx={{ mb: 2 }}>Mode updated successfully.</Alert>
        )}

        {/* Config detail row */}
        {config && (
          <Box sx={{
            display: 'flex', gap: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider',
            flexWrap: 'wrap',
          }}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Daily Reset Time</Typography>
              <Typography variant="body2" fontWeight={600}>{config.dailyResetTime}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Timezone</Typography>
              <Typography variant="body2" fontWeight={600}>{config.timezone}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Last Updated By</Typography>
              <Typography variant="body2" fontWeight={600}>{config.updatedBy ?? 'System'}</Typography>
            </Box>
          </Box>
        )}
      </Paper>

      {/* Quick Links */}
      <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
        Configuration Sections
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
        {[
          {
            icon: <QrCode2Icon sx={{ fontSize: 28, color: 'primary.main' }} />,
            title: 'Kiosk Management',
            description: 'Create and manage permanent kiosks with QR codes and slug URLs.',
            href: '/token/config/kiosks',
          },
          {
            icon: <TuneIcon sx={{ fontSize: 28, color: 'secondary.main' }} />,
            title: 'Print Config',
            description: 'Configure token slip print layout, font sizes, and header text.',
            href: '/token/print-config',
          },
          {
            icon: <AccountTreeIcon sx={{ fontSize: 28, color: 'success.main' }} />,
            title: 'Token Prefix Config',
            description: activeMode === 'SERVICE_CENTER_BASED'
              ? 'Set token prefixes and number ranges per service center.'
              : 'Set a token prefix per location.',
            href: '/token/config/sc-configs',
            disabled: false,
          },
        ].map((item) => (
          <Paper
            key={item.href}
            variant="outlined"
            sx={{
              p: 2.5,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              opacity: item.disabled ? 0.45 : 1,
              transition: 'all 0.15s',
              '&:hover': item.disabled ? {} : {
                borderColor: 'primary.main',
                boxShadow: 1,
              },
            }}
            onClick={() => !item.disabled && router.push(item.href)}
          >
            <Box sx={{ mb: 1 }}>{item.icon}</Box>
            <Typography fontWeight={700} variant="subtitle2" gutterBottom>
              {item.title}
              {item.disabled && (
                <Chip size="small" label="SC Mode Only" sx={{ ml: 1, fontSize: '0.6rem', height: 16 }} />
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              {item.description}
            </Typography>
            {!item.disabled && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
                <Typography variant="caption" fontWeight={600}>Open</Typography>
                <ArrowForwardIcon sx={{ fontSize: 14 }} />
              </Box>
            )}
          </Paper>
        ))}
      </Box>

      {/* ── Manual Reset (danger zone) ── */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
          Danger Zone
        </Typography>
        <Paper variant="outlined" sx={{ p: 3, borderColor: 'error.light' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <RestartAltIcon color="error" fontSize="small" />
                Reset Token Counter to 1
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Immediately resets all token sequences for today back to 1. This affects all
                active locations and service centers in this branch. Counter display panels will
                clear instantly. Use this if the counter rolled over unexpectedly or for a fresh
                start mid-day.
              </Typography>
              {resetSuccess && (
                <Alert severity="success" sx={{ mt: 1.5, py: 0.5 }}>
                  Token counters reset successfully. All sequences will start from 1.
                </Alert>
              )}
              {resetMutation.isError && (
                <Alert severity="error" sx={{ mt: 1.5, py: 0.5 }}>
                  Reset failed. Check your permissions and try again.
                </Alert>
              )}
            </Box>
            <Button
              variant="outlined"
              color="error"
              startIcon={<RestartAltIcon />}
              onClick={() => setResetConfirm(true)}
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              Reset to 1
            </Button>
          </Box>
        </Paper>
      </Box>

      {/* ── Reset confirmation dialog ── */}
      <ResponsiveDialog
        open={resetConfirm}
        onClose={() => { setResetConfirm(false); setResetTarget('ALL'); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="error" />
          Reset Token Counter
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 3, overflow: 'visible' }}>

          {/* Location selector */}
          <TextField
            select
            label="Reset which counter?"
            value={resetTarget}
            onChange={(e) => setResetTarget(e.target.value)}
            fullWidth
            size="small"
          >
            <MenuItem value="ALL">
              <Box>
                <Typography variant="body2" fontWeight={600}>All locations (entire branch)</Typography>
                <Typography variant="caption" color="text.secondary">Resets every active location in this branch</Typography>
              </Box>
            </MenuItem>
            {locations.map((loc) => (
              <MenuItem key={loc.id} value={loc.id}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{loc.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{loc.code}</Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>

          <Typography variant="body2" color="text.secondary">
            {resetTarget === 'ALL'
              ? 'All token counters for today will be reset to 1.'
              : `Only the "${locations.find((l) => l.id === resetTarget)?.label ?? resetTarget}" counter will be reset to 1.`}
          </Typography>

          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            <Typography component="li" variant="body2" color="text.secondary">Redis counter zeroed — next token will be #1</Typography>
            <Typography component="li" variant="body2" color="text.secondary">Today&apos;s called-token history cleared</Typography>
            <Typography component="li" variant="body2" color="text.secondary">Counter display panels update instantly via WebSocket</Typography>
            <Typography component="li" variant="body2" color="text.secondary">Historical DB records are <strong>not</strong> deleted</Typography>
          </Box>

          <Alert severity="warning" sx={{ py: 0.5 }}>
            Patients holding token slips will have conflicting numbers. Inform staff first.
          </Alert>

          {resetMutation.isError && (
            <Alert severity="error" sx={{ py: 0.5 }}>Reset failed. Check your permissions and try again.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setResetConfirm(false); setResetTarget('ALL'); }}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<RestartAltIcon />}
            onClick={() => resetMutation.mutate(resetTarget)}
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? 'Resetting...' : 'Yes, Reset to 1'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
