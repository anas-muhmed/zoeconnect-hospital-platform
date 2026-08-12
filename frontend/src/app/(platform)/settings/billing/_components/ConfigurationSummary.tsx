'use client';

import { useEffect, useRef, useState } from 'react';
import { TransitionGroup } from 'react-transition-group';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Fade from '@mui/material/Fade';
import { alpha, useTheme, keyframes } from '@mui/material/styles';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LocalOfferRoundedIcon from '@mui/icons-material/LocalOfferRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import type { BillingQuote, BillingCycle } from '@/lib/api/billing.api';

const popIn = keyframes`
  0% { opacity: 0; transform: scale(0.9) translateY(-4px); }
  60% { opacity: 1; transform: scale(1.015) translateY(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
`;

const flashHighlight = keyframes`
  0% { background-color: var(--flash-color); }
  100% { background-color: transparent; }
`;

export interface SelectedModuleItem {
  code: string;
  name: string;
  /** Price for ONE billing-cycle unit -- the line's estimated charge is price * months (the authoritative total is always the server quote, this is just what's shown per-row while typing/adjusting). */
  price: number | null;
  isCore: boolean;
  /** Billing-cycle units (months for MONTHLY, years for YEARLY) selected for this line. Core is always 1 and has no stepper. */
  months: number;
  /** "Buy more months" on an already-licensed module vs a brand-new purchase -- purely a label/badge distinction, both are priced and charged the same way. */
  isExtension?: boolean;
}

export interface ConfigurationSummaryProps {
  quote: BillingQuote | null;
  isCalculating: boolean;
  onContinue: () => void;
  continueDisabled: boolean;
  continueLoading: boolean;
  items: SelectedModuleItem[];
  onRemove: (code: string) => void;
  onRemoveAll: () => void;
  /** Adjusts a line's billing-cycle-unit count (min 1, max 24) -- delta is +1/-1. */
  onMonthsChange: (code: string, delta: number) => void;
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  yearlyDiscountPercent?: number;
  /** "Continue to Payment" (new subscription) vs "Reactivate Subscription" (REACTIVATION) -- caller decides, this component never guesses the billing journey. */
  ctaLabel?: string;
  ctaLoadingLabel?: string;
  /** Sidebar title -- "Your New Subscription" vs "Reactivate Subscription". Caller decides from billingMode. */
  title?: string;
  /** Replaces the generic "Total / month" row label -- spec calls for "Payment Due Today ₹XXXX" in every checkout-mode journey (NEW_SUBSCRIPTION/REACTIVATION/MODULE_ADDITION). */
  paymentDueLabel?: string;
  /** e.g. "Immediately after successful payment" / "Available immediately after payment" -- shown under the total, only in checkout-mode journeys. */
  activationLabel?: string;
  /** false for a module-addition purchase on an already-open subscription -- billing cycle changes are a separate, still-deferred-to-renewal concern and can never be smuggled in via a module purchase. */
  showBillingCycleToggle?: boolean;
}

const currency = (n: number, ccy = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(n);

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  const theme = useTheme();
  const prevValue = useRef(value);
  const [animateKey, setAnimateKey] = useState(0);

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      setAnimateKey((k) => k + 1);
    }
  }, [value]);

  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
      <Typography variant="body2" color={muted ? 'text.secondary' : 'text.primary'} fontWeight={strong ? 700 : 400}>
        {label}
      </Typography>
      <Typography
        key={animateKey}
        variant="body2"
        color={muted ? 'text.secondary' : 'text.primary'}
        fontWeight={strong ? 700 : 500}
        sx={{
          borderRadius: 0.5,
          '--flash-color': alpha(theme.palette.primary.main, 0.16),
          animation: animateKey > 0 ? `${flashHighlight} 0.6s ease-out` : 'none',
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

export default function ConfigurationSummary({
  quote, isCalculating, onContinue, continueDisabled, continueLoading,
  items, onRemove, onRemoveAll, onMonthsChange, billingCycle, onBillingCycleChange, yearlyDiscountPercent = 20,
  ctaLabel = 'Continue to Payment', ctaLoadingLabel = 'Preparing secure checkout...',
  title = 'Your Selection', paymentDueLabel = 'Payment Due Today', activationLabel,
  showBillingCycleToggle = true,
}: ConfigurationSummaryProps) {
  const theme = useTheme();
  const removableCount = items.filter((i) => !i.isCore).length;

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 4, p: 3, position: 'sticky', top: 24,
        border: `1px solid ${theme.palette.divider}`,
        background: theme.palette.background.paper,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1" fontWeight={800}>{title}</Typography>
        {removableCount > 0 && (
          <ButtonBase
            onClick={onRemoveAll}
            sx={{ fontSize: 12, fontWeight: 700, color: 'error.main', px: 0.5, borderRadius: 1 }}
          >
            Remove All
          </ButtonBase>
        )}
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {items.length === 0 ? (
        <Fade in timeout={300}>
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Select modules to build your workspace.
            </Typography>
          </Box>
        </Fade>
      ) : (
        <Stack sx={{ maxHeight: 320, overflowY: 'auto', pr: 0.5 }}>
          <TransitionGroup component={null}>
            {items.map((item) => {
              const unit = billingCycle === 'MONTHLY' ? 'mo' : 'yr';
              const lineTotal = item.price !== null ? item.price * item.months : null;
              return (
                <Collapse key={item.code} timeout={250}>
                  <Box
                    sx={{
                      py: 0.75, px: 1, mb: 0.75, borderRadius: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.03),
                      animation: `${popIn} 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)`,
                    }}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                          {item.isExtension && (
                            <Chip label="Extend" size="small" sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: alpha(theme.palette.info.main, 0.12), color: theme.palette.info.dark }} />
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {item.isCore
                            ? 'Included'
                            : lineTotal !== null
                              ? `${currency(lineTotal)} (${item.months} ${unit}${item.months === 1 ? '' : 's'})`
                              : 'Contact sales'}
                        </Typography>
                      </Box>
                      {!item.isCore && (
                        <IconButton
                          size="small"
                          onClick={() => onRemove(item.code)}
                          aria-label={`Remove ${item.name}`}
                          sx={{
                            color: 'text.secondary',
                            transition: 'transform 0.15s ease, color 0.15s ease',
                            '&:hover': { color: 'error.main', transform: 'scale(1.15) rotate(90deg)' },
                          }}
                        >
                          <CloseRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      )}
                    </Stack>

                    {!item.isCore && (
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Duration</Typography>
                        <Stack direction="row" alignItems="center" sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
                          <IconButton
                            size="small"
                            onClick={() => onMonthsChange(item.code, -1)}
                            disabled={item.months <= 1}
                            aria-label={`Decrease duration for ${item.name}`}
                            sx={{ p: 0.5, transition: 'transform 0.1s ease', '&:active': { transform: 'scale(0.85)' } }}
                          >
                            <RemoveRoundedIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                          <Typography
                            key={item.months}
                            variant="caption"
                            fontWeight={700}
                            sx={{ minWidth: 42, textAlign: 'center', animation: `${popIn} 0.2s ease-out` }}
                          >
                            {item.months} {unit}{item.months === 1 ? '' : 's'}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => onMonthsChange(item.code, 1)}
                            disabled={item.months >= 24}
                            aria-label={`Increase duration for ${item.name}`}
                            sx={{ p: 0.5, transition: 'transform 0.1s ease', '&:active': { transform: 'scale(0.85)' } }}
                          >
                            <AddRoundedIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      </Stack>
                    )}
                  </Box>
                </Collapse>
              );
            })}
          </TransitionGroup>
        </Stack>
      )}

      {showBillingCycleToggle && (
        <>
          <Divider sx={{ my: 2 }} />

          <Typography variant="caption" fontWeight={700} color="text.secondary" letterSpacing={0.5}>
            BILLING CYCLE
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {(['MONTHLY', 'YEARLY'] as BillingCycle[]).map((cycle) => {
              const active = billingCycle === cycle;
              return (
                <ButtonBase
                  key={cycle}
                  onClick={() => onBillingCycleChange(cycle)}
                  aria-pressed={active}
                  sx={{
                    flex: 1, py: 1, borderRadius: 2, fontWeight: 700, fontSize: 13,
                    border: `1.5px solid ${active ? theme.palette.primary.main : theme.palette.divider}`,
                    bgcolor: active ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                    color: active ? theme.palette.primary.main : theme.palette.text.secondary,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {cycle === 'MONTHLY' ? 'Monthly' : `Yearly`}
                </ButtonBase>
              );
            })}
          </Stack>

          {billingCycle === 'MONTHLY' && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                mt: 1.5, p: 1.25, borderRadius: 2,
                bgcolor: alpha(theme.palette.success.main, 0.08),
              }}
            >
              <LocalOfferRoundedIcon sx={{ fontSize: 16, color: 'success.dark' }} />
              <Typography variant="caption" fontWeight={600} color="success.dark">
                Switch to Yearly and save {yearlyDiscountPercent}%
              </Typography>
            </Stack>
          )}
        </>
      )}

      <Divider sx={{ my: 2 }} />

      {quote ? (
        <Fade in timeout={350} key="quote">
          <Stack spacing={0.25}>
            <Row label="Subtotal" value={currency(quote.baseAmount + quote.moduleAmount, quote.currency)} muted />
            {quote.discount > 0 && (
              <Row label="Yearly discount" value={`-${currency(quote.discount, quote.currency)}`} muted />
            )}
            <Row label="GST" value={currency(quote.tax, quote.currency)} muted />

            <Divider sx={{ my: 1.5 }} />

            <Row label={paymentDueLabel} value={currency(quote.total, quote.currency)} strong />
            {activationLabel && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Activation: {activationLabel}
              </Typography>
            )}
          </Stack>
        </Fade>
      ) : (
        <Fade in timeout={200} key="empty">
          <Box sx={{ py: 2, textAlign: 'center' }}>
            {isCalculating ? (
              <Stack spacing={1.5} alignItems="center">
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">Calculating your price...</Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">Your price will appear here.</Typography>
            )}
          </Box>
        </Fade>
      )}

      <Button
        fullWidth
        size="large"
        variant="contained"
        onClick={onContinue}
        disabled={continueDisabled || isCalculating}
        sx={{
          mt: 2.5, py: 1.4, borderRadius: 2.5, fontWeight: 700,
          transition: 'transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease',
          '&:not(.Mui-disabled):hover': { transform: 'translateY(-1px)', boxShadow: `0 8px 18px ${alpha(theme.palette.primary.main, 0.28)}` },
          '&:not(.Mui-disabled):active': { transform: 'translateY(0) scale(0.98)' },
        }}
        startIcon={continueLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
      >
        {continueLoading ? ctaLoadingLabel : ctaLabel}
      </Button>

      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" sx={{ mt: 1.5 }}>
        <LockRoundedIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary">
          Secured by Razorpay · Cancel anytime
        </Typography>
      </Stack>
    </Paper>
  );
}
