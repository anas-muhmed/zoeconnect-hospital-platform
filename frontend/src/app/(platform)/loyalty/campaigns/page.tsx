'use client';

import React, { useState } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Tooltip,
  DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Switch, FormControlLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, CircularProgress, Alert, Stack, InputAdornment,
  Select, OutlinedInput, FormControl, InputLabel, SelectChangeEvent,
} from '@mui/material';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import {
  Add as AddIcon,
  Edit as EditIcon,
  PowerSettingsNew as ToggleIcon,
  Campaign as CampaignIcon,
  Refresh as RefreshIcon,
  AllInclusive as AllTiersIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaignApi, Campaign, CampaignType, CreateCampaignPayload } from '@/lib/api/campaign.api';
import { loyaltyApi } from '@/lib/api/loyalty.api';
import type { CardCategory } from '@/lib/api/loyalty.api';
import { format, parseISO } from 'date-fns';
import PageHeader from '@/components/PageHeader';

// ── helpers ──────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<CampaignType, string> = {
  FESTIVAL:    'Festival',
  BIRTHDAY:    'Birthday',
  ANNIVERSARY: 'Anniversary',
  CUSTOM:      'Custom',
};

const TYPE_COLORS: Record<CampaignType, 'primary' | 'secondary' | 'warning' | 'default'> = {
  FESTIVAL:    'primary',
  BIRTHDAY:    'secondary',
  ANNIVERSARY: 'warning',
  CUSTOM:      'default',
};

function statusChip(c: Campaign) {
  const now = new Date();
  if (!c.isActive) return <Chip label="Inactive" size="small" color="default" />;
  const start = c.startDate ? new Date(c.startDate) : null;
  const end   = c.endDate   ? new Date(c.endDate)   : null;
  if (start && now < start) return <Chip label="Scheduled" size="small" color="info" />;
  if (end   && now > end)   return <Chip label="Expired"   size="small" color="error" />;
  return <Chip label="Active" size="small" color="success" />;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; }
}

/** Render tier eligibility chips in the table row */
function TierChips({ codes, categories }: { codes: string[]; categories: CardCategory[] }) {
  if (!codes || codes.length === 0) {
    return (
      <Tooltip title="Applies to all tiers">
        <Chip icon={<AllTiersIcon sx={{ fontSize: '14px !important' }} />} label="All tiers" size="small" variant="outlined" />
      </Tooltip>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap">
      {codes.map((code) => {
        const cat = categories.find((c) => c.code === code);
        return (
          <Chip
            key={code}
            label={cat?.name ?? code}
            size="small"
            sx={{
              bgcolor: cat?.colourHex ? `${cat.colourHex}22` : undefined,
              borderColor: cat?.colourHex,
              color: cat?.colourHex,
              border: '1px solid',
              fontWeight: 600,
              fontSize: 11,
            }}
          />
        );
      })}
    </Stack>
  );
}

// ── empty form state ──────────────────────────────────────────────────────────
const EMPTY: CreateCampaignPayload = {
  name: '',
  campaignType: 'FESTIVAL',
  multiplier: 1,
  bonusPoints: 0,
  eligibleCardCodes: [],
  startDate: '',
  endDate: '',
  isActive: true,
};

// ── Dialog ────────────────────────────────────────────────────────────────────
interface CampaignDialogProps {
  open: boolean;
  editing: Campaign | null;
  categories: CardCategory[];
  onClose: () => void;
}

function CampaignDialog({ open, editing, categories, onClose }: CampaignDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateCampaignPayload>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form when editing changes
  React.useEffect(() => {
    if (editing) {
      setForm({
        name:               editing.name,
        campaignType:       editing.campaignType,
        multiplier:         editing.multiplier,
        bonusPoints:        editing.bonusPoints,
        eligibleCardCodes:  editing.eligibleCardCodes ?? [],
        startDate:          editing.startDate ? editing.startDate.slice(0, 10) : '',
        endDate:            editing.endDate   ? editing.endDate.slice(0, 10)   : '',
        isActive:           editing.isActive,
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [editing, open]);

  const createMutation = useMutation({
    mutationFn: (p: CreateCampaignPayload) => campaignApi.create(p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); onClose(); },
  });

  const updateMutation = useMutation({
    mutationFn: (p: CreateCampaignPayload) => campaignApi.update(editing!.id, p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); onClose(); },
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim())       e.name = 'Name is required';
    if ((form.multiplier ?? 1) < 1) e.multiplier = 'Multiplier must be ≥ 1';
    if ((form.bonusPoints ?? 0) < 0) e.bonusPoints = 'Bonus points cannot be negative';
    if (form.startDate && form.endDate && form.startDate > form.endDate)
      e.endDate = 'End date must be after start date';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const payload: CreateCampaignPayload = {
      ...form,
      startDate: form.startDate || undefined,
      endDate:   form.endDate   || undefined,
    };
    if (editing) updateMutation.mutate(payload);
    else         createMutation.mutate(payload);
  }

  function handleTierChange(e: SelectChangeEvent<string[]>) {
    const val = e.target.value;
    setForm(f => ({ ...f, eligibleCardCodes: typeof val === 'string' ? val.split(',') : val }));
  }

  const busy = createMutation.isPending || updateMutation.isPending;
  const err  = createMutation.error || updateMutation.error;

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {err && (
            <Alert severity="error">
              {(err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'An error occurred'}
            </Alert>
          )}

          <TextField
            label="Campaign Name"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            error={!!errors.name}
            helperText={errors.name}
            fullWidth required
          />

          <TextField
            select label="Campaign Type"
            value={form.campaignType}
            onChange={(e) => setForm(f => ({ ...f, campaignType: e.target.value as CampaignType }))}
            fullWidth
          >
            {(Object.keys(TYPE_LABELS) as CampaignType[]).map(t => (
              <MenuItem key={t} value={t}>{TYPE_LABELS[t]}</MenuItem>
            ))}
          </TextField>

          {/* ── Eligible Tiers ─────────────────────────────────────────────── */}
          <FormControl fullWidth>
            <InputLabel id="tier-select-label">Eligible Tiers</InputLabel>
            <Select
              labelId="tier-select-label"
              multiple
              value={form.eligibleCardCodes ?? []}
              onChange={handleTierChange}
              input={<OutlinedInput label="Eligible Tiers" />}
              MenuProps={{
                // Render inside the dialog's DOM tree so z-index is correct
                disablePortal: true,
                PaperProps: { sx: { maxHeight: 220 } },
              }}
              renderValue={(selected) => {
                if ((selected as string[]).length === 0) return <em style={{ color: '#999' }}>All tiers</em>;
                return (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    {(selected as string[]).map((code) => {
                      const cat = categories.find(c => c.code === code);
                      return (
                        <Chip
                          key={code}
                          label={cat?.name ?? code}
                          size="small"
                          sx={{
                            bgcolor: cat?.colourHex ? `${cat.colourHex}22` : undefined,
                            borderColor: cat?.colourHex,
                            color: cat?.colourHex,
                            border: '1px solid',
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        />
                      );
                    })}
                  </Stack>
                );
              }}
            >
              {categories.length === 0 ? (
                <MenuItem disabled>
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No tiers configured — go to Card Config first
                  </Typography>
                </MenuItem>
              ) : (
                categories
                  .slice()
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((cat) => (
                    <MenuItem key={cat.code} value={cat.code}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 10, height: 10, borderRadius: '50%',
                            bgcolor: cat.colourHex,
                            border: '1px solid rgba(0,0,0,0.15)',
                            flexShrink: 0,
                          }}
                        />
                        {cat.name}
                      </Box>
                    </MenuItem>
                  ))
              )}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
              Leave blank to apply to all tiers
            </Typography>
          </FormControl>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Point Multiplier"
              type="number"
              value={form.multiplier ?? 1}
              onChange={(e) => setForm(f => ({ ...f, multiplier: Number(e.target.value) }))}
              error={!!errors.multiplier}
              helperText={errors.multiplier ?? 'e.g. 2 = double points'}
              InputProps={{ startAdornment: <InputAdornment position="start">×</InputAdornment> }}
              inputProps={{ min: 1, step: 0.5 }}
              fullWidth
            />
            <TextField
              label="Bonus Points"
              type="number"
              value={form.bonusPoints ?? 0}
              onChange={(e) => setForm(f => ({ ...f, bonusPoints: Number(e.target.value) }))}
              error={!!errors.bonusPoints}
              helperText={errors.bonusPoints ?? 'Flat bonus added to earnings'}
              inputProps={{ min: 0 }}
              fullWidth
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Start Date"
              type="date"
              value={form.startDate ?? ''}
              onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              helperText="Leave blank for immediate start"
              fullWidth
            />
            <TextField
              label="End Date"
              type="date"
              value={form.endDate ?? ''}
              onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))}
              error={!!errors.endDate}
              helperText={errors.endDate ?? 'Leave blank for no expiry'}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>

          <FormControlLabel
            control={
              <Switch
                checked={form.isActive ?? true}
                onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
              />
            }
            label="Active on save"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={busy}>
          {busy ? <CircularProgress size={20} /> : editing ? 'Save Changes' : 'Create Campaign'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<Campaign | null>(null);

  const { data: campaigns = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn:  () => campaignApi.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['card-categories'],
    queryFn:  () => loyaltyApi.getCardConfig(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? campaignApi.activate(id) : campaignApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  function openCreate() { setEditing(null); setDialogOpen(true); }
  function openEdit(c: Campaign) { setEditing(c); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Campaigns"
        subtitle="Manage loyalty promotion campaigns — multipliers, bonus points, and scheduled windows"
        icon={<CampaignIcon />}
        back="/loyalty"
        breadcrumbs={[
          { label: 'Loyalty', href: '/loyalty' },
          { label: 'Campaigns' },
        ]}
        actions={
          <>
            <Tooltip title="Refresh" arrow>
              <IconButton onClick={() => refetch()} size="small"
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }} aria-label="Refresh">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New Campaign
            </Button>
          </>
        }
      />

      {/* Summary chips */}
      {campaigns.length > 0 && (
        <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
          <Chip
            label={`${campaigns.filter(c => c.isActive).length} Active`}
            color="success" size="small" variant="outlined"
          />
          <Chip
            label={`${campaigns.filter(c => !c.isActive).length} Inactive`}
            size="small" variant="outlined"
          />
          <Chip
            label={`${campaigns.filter(c => c.campaignType === 'BIRTHDAY').length} Birthday`}
            color="secondary" size="small" variant="outlined"
          />
          <Chip
            label={`${campaigns.filter(c => c.campaignType === 'FESTIVAL').length} Festival`}
            color="primary" size="small" variant="outlined"
          />
        </Stack>
      )}

      {/* Table */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert severity="error" action={
          <Button size="small" onClick={() => refetch()}>Retry</Button>
        }>
          Failed to load campaigns
        </Alert>
      ) : campaigns.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 8, textAlign: 'center' }}>
          <CampaignIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No campaigns yet</Typography>
          <Button startIcon={<AddIcon />} onClick={openCreate} sx={{ mt: 2 }}>
            Create your first campaign
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell><strong>Eligible Tiers</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="right"><strong>Multiplier</strong></TableCell>
                <TableCell align="right"><strong>Bonus Pts</strong></TableCell>
                <TableCell><strong>Start</strong></TableCell>
                <TableCell><strong>End</strong></TableCell>
                <TableCell align="center"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{c.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={TYPE_LABELS[c.campaignType]}
                      color={TYPE_COLORS[c.campaignType]}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <TierChips codes={c.eligibleCardCodes ?? []} categories={categories} />
                  </TableCell>
                  <TableCell>{statusChip(c)}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color={c.multiplier > 1 ? 'primary.main' : 'text.secondary'}>
                      ×{c.multiplier}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color={c.bonusPoints > 0 ? 'success.main' : 'text.secondary'}>
                      {c.bonusPoints > 0 ? `+${c.bonusPoints}` : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {fmtDate(c.startDate)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {fmtDate(c.endDate)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" justifyContent="center" spacing={0.5}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(c)} aria-label="Edit">
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={c.isActive ? 'Deactivate' : 'Activate'}>
                        <IconButton
                          size="small"
                          color={c.isActive ? 'error' : 'success'}
                          onClick={() => toggleMutation.mutate({ id: c.id, active: !c.isActive })}
                          disabled={toggleMutation.isPending}
                         aria-label={c.isActive ? 'Deactivate' : 'Activate'}>
                          <ToggleIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CampaignDialog
        open={dialogOpen}
        editing={editing}
        categories={categories}
        onClose={closeDialog}
      />
    </Box>
  );
}
