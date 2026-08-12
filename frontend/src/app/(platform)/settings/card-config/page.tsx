'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import TuneIcon from '@mui/icons-material/Tune';

import ResponsiveTable from '@/components/ResponsiveTable';
import { loyaltyApi, type CardCategory, type DiscountThreshold } from '@/lib/api/loyalty.api';
import { useAuthStore } from '@/lib/store/auth.store';
import PageHeader from '@/components/PageHeader';

// ── Per-tier editor ───────────────────────────────────────────────────────────
function TierEditor({ category }: { category: CardCategory }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('LOYALTY:CARD_CONFIG:UPDATE');

  // Local editable state
  const [minSpend,          setMinSpend]          = useState(String(category.minSpend));
  const [maxSpend,          setMaxSpend]          = useState(category.maxSpend != null ? String(category.maxSpend) : '');
  const [earnRate,          setEarnRate]          = useState(String(category.earnRatePer100));
  const [pointValue,        setPointValue]        = useState(String(category.pointValuePer100));
  const [colourHex,         setColourHex]         = useState(category.colourHex);
  const [thresholds,        setThresholds]        = useState<DiscountThreshold[]>(
    category.discountThresholds.map(t => ({ ...t })),
  );

  const isDirty =
    minSpend       !== String(category.minSpend) ||
    maxSpend       !== (category.maxSpend != null ? String(category.maxSpend) : '') ||
    earnRate       !== String(category.earnRatePer100) ||
    pointValue     !== String(category.pointValuePer100) ||
    colourHex      !== category.colourHex ||
    JSON.stringify(thresholds) !== JSON.stringify(category.discountThresholds);

  const mutation = useMutation({
    mutationFn: () =>
      loyaltyApi.updateCardConfig(category.id, {
        minSpend:           parseFloat(minSpend),
        maxSpend:           maxSpend.trim() === '' ? null : parseFloat(maxSpend),
        earnRatePer100:     parseFloat(earnRate),
        pointValuePer100:   parseFloat(pointValue),
        colourHex,
        discountThresholds: thresholds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card-config'] });
      enqueueSnackbar(`${category.name} card settings saved`, { variant: 'success' });
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Save failed', { variant: 'error' });
    },
  });

  const addThreshold = () =>
    setThresholds(prev => [...prev, { min_value: 0, discount_pct: 0 }]);

  const removeThreshold = (idx: number) =>
    setThresholds(prev => prev.filter((_, i) => i !== idx));

  const updateThreshold = (idx: number, field: keyof DiscountThreshold, value: string) =>
    setThresholds(prev =>
      prev.map((t, i) => i === idx ? { ...t, [field]: parseFloat(value) || 0 } : t),
    );

  const TIER_BG: Record<string, string> = {
    SILVER: '#78909C', GOLD: '#F9A825', PLATINUM: '#7B1FA2',
  };

  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2,
          bgcolor: TIER_BG[category.code] ?? '#555',
        }}
      >
        <Box
          sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: colourHex, border: '2px solid rgba(255,255,255,0.5)' }}
        />
        <Typography variant="h6" fontWeight={700} color="white">
          {category.name}
        </Typography>
        <Chip label={category.code} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 700 }} />
        {isDirty && <Chip label="Unsaved changes" size="small" color="warning" sx={{ ml: 'auto' }} />}
      </Box>

      <Box sx={{ p: 3 }}>
        <Grid container spacing={3}>
          {/* Spend range */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" mb={1.5}>
              TIER UPGRADE THRESHOLDS (Lifetime Spend)
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Min Spend (₹)"
                  fullWidth size="small"
                  value={minSpend}
                  onChange={e => setMinSpend(e.target.value)}
                  disabled={!canEdit}
                  type="number"
                  inputProps={{ min: 0, step: 1000 }}
                  helperText="Patient joins this tier when lifetime spend ≥ this"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Max Spend (₹) — blank = no limit"
                  fullWidth size="small"
                  value={maxSpend}
                  onChange={e => setMaxSpend(e.target.value)}
                  disabled={!canEdit}
                  type="number"
                  inputProps={{ min: 0, step: 1000 }}
                  helperText="Patient upgrades to next tier above this"
                />
              </Grid>
            </Grid>
          </Grid>

          <Grid item xs={12}><Divider /></Grid>

          {/* Points earning */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" mb={1.5}>
              POINTS EARNING
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Points per ₹100 spent"
                  fullWidth size="small"
                  value={earnRate}
                  onChange={e => setEarnRate(e.target.value)}
                  disabled={!canEdit}
                  type="number"
                  inputProps={{ min: 0.01, step: 0.25 }}
                  helperText={`₹10,000 bill → ${Math.floor(10000 / 100) * (parseFloat(earnRate) || 0)} points`}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="₹ value of 100 points"
                  fullWidth size="small"
                  value={pointValue}
                  onChange={e => setPointValue(e.target.value)}
                  disabled={!canEdit}
                  type="number"
                  inputProps={{ min: 0.01, step: 1 }}
                  helperText={`100 pts = ₹${parseFloat(pointValue) || 0} card value`}
                />
              </Grid>
            </Grid>
          </Grid>

          <Grid item xs={12}><Divider /></Grid>

          {/* Discount thresholds */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
              <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                DISCOUNT THRESHOLDS (Card Value in ₹)
              </Typography>
              {canEdit && (
                <IconButton size="small" onClick={addThreshold} color="primary" aria-label="Add discount threshold">
                  <AddIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
              Card value = (available points ÷ 100) × ₹ value of 100 pts.
              Discount applies to the full bill amount.
            </Typography>

            {thresholds.length === 0 ? (
              <Typography variant="body2" color="text.disabled">No discount thresholds — add one with +</Typography>
            ) : (
              <ResponsiveTable minWidth={600}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell><b>Min Card Value (₹)</b></TableCell>
                    <TableCell><b>Discount %</b></TableCell>
                    <TableCell><b>Example (₹10k bill)</b></TableCell>
                    {canEdit && <TableCell />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {thresholds.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <TextField
                          size="small"
                          value={t.min_value}
                          onChange={e => updateThreshold(i, 'min_value', e.target.value)}
                          disabled={!canEdit}
                          type="number"
                          inputProps={{ min: 0, step: 50 }}
                          sx={{ width: 120 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={t.discount_pct}
                          onChange={e => updateThreshold(i, 'discount_pct', e.target.value)}
                          disabled={!canEdit}
                          type="number"
                          inputProps={{ min: 0, max: 100, step: 1 }}
                          sx={{ width: 90 }}
                          InputProps={{ endAdornment: <Typography variant="caption">%</Typography> }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="success.main">
                          ₹{(10000 * (t.discount_pct / 100)).toFixed(0)} saved
                        </Typography>
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <IconButton size="small" onClick={() => removeThreshold(i)} color="error" aria-label={`Remove threshold ${i + 1}`}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </ResponsiveTable>
            )}
          </Grid>

          <Grid item xs={12}><Divider /></Grid>

          {/* Display */}
          <Grid item xs={12}>
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" mb={1.5}>
              DISPLAY
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Colour swatch — clicking it opens the native colour picker */}
              <Box
                component="label"
                sx={{
                  position: 'relative',
                  width: 44,
                  height: 44,
                  borderRadius: 1.5,
                  bgcolor: colourHex,
                  border: '2px solid',
                  borderColor: 'divider',
                  cursor: canEdit ? 'pointer' : 'default',
                  overflow: 'hidden',
                  flexShrink: 0,
                  boxShadow: 1,
                  '&:hover': canEdit ? { boxShadow: 3 } : {},
                  transition: 'box-shadow 0.15s',
                }}
                title={canEdit ? 'Click to pick a colour' : colourHex}
              >
                <Box
                  component="input"
                  type="color"
                  value={colourHex}
                  disabled={!canEdit}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColourHex(e.target.value)}
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    cursor: canEdit ? 'pointer' : 'default',
                    border: 'none',
                    padding: 0,
                  }}
                />
              </Box>

              {/* Hex value display — also editable directly */}
              <TextField
                label="Hex"
                size="small"
                value={colourHex}
                onChange={e => {
                  const v = e.target.value;
                  setColourHex(v);
                }}
                disabled={!canEdit}
                inputProps={{ maxLength: 7, style: { fontFamily: 'monospace', letterSpacing: 1 } }}
                sx={{ width: 120 }}
              />

              {/* Live preview chip */}
              <Chip
                label={category.name}
                size="small"
                sx={{
                  bgcolor: `${colourHex}22`,
                  color: colourHex,
                  border: `1px solid ${colourHex}`,
                  fontWeight: 700,
                  fontSize: 12,
                }}
              />
            </Box>
          </Grid>
        </Grid>

        {/* Save */}
        {canEdit && (
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={() => mutation.mutate()}
              disabled={!isDirty || mutation.isPending}
            >
              Save {category.name} Settings
            </Button>
          </Box>
        )}
      </Box>
    </Paper>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CardConfigPage() {
  const { data: categories, isLoading, error } = useQuery({
    queryKey: ['card-config'],
    queryFn: loyaltyApi.getCardConfig,
  });

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <PageHeader
        title="Card Configuration"
        subtitle="Configure tier thresholds, earn rates, point values, and discount brackets. Changes apply immediately."
        icon={<TuneIcon />}
        back="/settings"
        breadcrumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Card Configuration' },
        ]}
      />

      {error && <Alert severity="error" sx={{ mb: 3 }}>Failed to load card configuration.</Alert>}

      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={320} sx={{ mb: 3 }} />
          ))
        : categories?.map(cat => (
            <Box key={cat.id} sx={{ mb: 3 }}>
              <TierEditor category={cat} />
            </Box>
          ))
      }
    </Box>
  );
}
