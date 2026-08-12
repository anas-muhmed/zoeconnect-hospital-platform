'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import Checkbox from '@mui/material/Checkbox';
import { alpha, useTheme, keyframes } from '@mui/material/styles';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import HistoryToggleOffRoundedIcon from '@mui/icons-material/HistoryToggleOffRounded';
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded';
import type { ModuleCatalogEntry, BillingCycle } from '@/lib/api/billing.api';

const selectPulse = keyframes`
  0% { transform: scale(1); }
  40% { transform: scale(1.035); }
  100% { transform: scale(1); }
`;

const currency = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export interface ModuleCardProps {
  module: ModuleCatalogEntry;
  billingCycle: BillingCycle;
  /** Whether this module is currently sitting in the NEW-purchase cart -- only meaningful for NOT_LICENSED/EXPIRED modules. */
  selected: boolean;
  /** Add/remove from the new-purchase cart (NOT_LICENSED/EXPIRED only). */
  onToggle: (code: string) => void;
  /** LICENSED -- opens the module management dialog (Schedule Removal, etc). No purchase ever happens from here. */
  onManage: (module: ModuleCatalogEntry) => void;
  /** PENDING_ADD/PENDING_REMOVAL -- opens the pending-change dialog (with Undo). */
  onViewPending: (module: ModuleCatalogEntry) => void;
  accentColor?: string;
}

/**
 * Compact tile: icon, name, and price only. The rest of the detail that
 * used to live in the card body (description, per-state footer copy,
 * "Manage from this card" etc.) now surfaces on demand -- full activation
 * timing appears in ConfigurationSummary once a module is selected, and
 * LICENSED/PENDING details still open their existing dialogs
 * (ModuleManagementDialog / PendingChangeDialog) on click. The name is
 * truncated at this width, so a Tooltip carries the full name on hover;
 * the state indicator in the corner is icon-only (also Tooltip-labeled) so
 * the grid stays dense without losing which of the 5 states a module is in.
 */
export default function ModuleCard({ module, billingCycle, selected, onToggle, onManage, onViewPending, accentColor }: ModuleCardProps) {
  const theme = useTheme();
  const isCore = module.isCore;
  const iconColor = accentColor || theme.palette.primary.main;
  const state = module.licenseState;
  const price = billingCycle === 'MONTHLY' ? module.monthlyPrice : module.yearlyPrice;
  const priceLabel = isCore
    ? 'Included'
    : price !== null
      ? `${currency(price)} / ${billingCycle === 'MONTHLY' ? 'mo' : 'yr'}`
      : 'Contact sales';

  const purchasable = state === 'NOT_LICENSED' || state === 'EXPIRED';
  const disabled = !isCore && purchasable && (!module.isAvailable || !module.isPurchasable);
  const isActive = isCore || (purchasable && selected);

  // Fires a one-shot pulse animation whenever this card's own selection
  // just flipped on -- gives immediate, obvious feedback that the click
  // registered without permanently altering the resting animation.
  const wasSelected = useRef(selected);
  const [justSelected, setJustSelected] = useState(false);
  useEffect(() => {
    if (selected && !wasSelected.current) {
      setJustSelected(true);
      const t = setTimeout(() => setJustSelected(false), 260);
      wasSelected.current = selected;
      return () => clearTimeout(t);
    }
    wasSelected.current = selected;
  }, [selected]);

  const handleClick = () => {
    if (isCore || disabled) return;
    if (state === 'LICENSED') return onManage(module);
    if (state === 'PENDING_ADD' || state === 'PENDING_REMOVAL') return onViewPending(module);
    return onToggle(module.code); // NOT_LICENSED / EXPIRED
  };

  const stateIndicator = () => {
    if (isCore) {
      return (
        <Tooltip title="Included in every workspace">
          <CheckCircleRoundedIcon sx={{ fontSize: 18, color: theme.palette.success.main }} />
        </Tooltip>
      );
    }
    switch (state) {
      case 'LICENSED':
        return (
          <Tooltip title="Licensed -- click to manage">
            <CheckCircleRoundedIcon sx={{ fontSize: 18, color: theme.palette.success.main }} />
          </Tooltip>
        );
      case 'PENDING_ADD':
        return (
          <Tooltip title="Pending addition -- click for details">
            <ScheduleRoundedIcon sx={{ fontSize: 18, color: theme.palette.info.main }} />
          </Tooltip>
        );
      case 'PENDING_REMOVAL':
        return (
          <Tooltip title="Scheduled for removal -- click for details">
            <RemoveCircleOutlineRoundedIcon sx={{ fontSize: 18, color: theme.palette.warning.main }} />
          </Tooltip>
        );
      case 'EXPIRED':
        return (
          <Tooltip title="Expired -- click to renew">
            <HistoryToggleOffRoundedIcon sx={{ fontSize: 18, color: theme.palette.text.secondary }} />
          </Tooltip>
        );
      default:
        return (
          <Checkbox
            checked={selected}
            disabled={disabled}
            tabIndex={-1}
            size="small"
            sx={{
              p: 0, color: alpha(theme.palette.text.primary, 0.2),
              transition: 'transform 0.15s ease',
              '&.Mui-checked': { color: theme.palette.primary.main, transform: 'scale(1.08)' },
            }}
          />
        );
    }
  };

  const ariaLabel = isCore
    ? `${module.name} is included in every workspace`
    : state === 'LICENSED'
    ? `Manage ${module.name}`
    : state === 'PENDING_ADD' || state === 'PENDING_REMOVAL'
    ? `View pending change for ${module.name}`
    : selected
    ? `Remove ${module.name} from your cart`
    : `Add ${module.name} to your cart`;

  return (
    <ButtonBase
      onClick={handleClick}
      disabled={isCore || disabled}
      aria-pressed={isActive}
      aria-label={ariaLabel}
      sx={{ width: '100%', display: 'block', textAlign: 'left', borderRadius: 3, cursor: isCore ? 'default' : 'pointer' }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          p: 1.25,
          borderRadius: 3,
          width: '100%',
          transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease, border-color 0.15s ease, background 0.15s ease',
          animation: justSelected ? `${selectPulse} 0.26s ease-out` : 'none',
          borderColor: isActive ? theme.palette.primary.main
            : state === 'LICENSED' ? alpha(theme.palette.success.main, 0.4)
            : state === 'PENDING_ADD' ? alpha(theme.palette.info.main, 0.4)
            : state === 'PENDING_REMOVAL' ? alpha(theme.palette.warning.main, 0.4)
            : alpha(theme.palette.text.primary, 0.08),
          borderWidth: isActive || state === 'LICENSED' || state === 'PENDING_ADD' || state === 'PENDING_REMOVAL' ? 2 : 1,
          borderStyle: 'solid',
          background: isActive
            ? `linear-gradient(165deg, ${alpha(theme.palette.primary.main, 0.07)} 0%, ${alpha(theme.palette.secondary.main, 0.04)} 100%)`
            : state === 'LICENSED' ? alpha(theme.palette.success.main, 0.03)
            : state === 'PENDING_ADD' ? alpha(theme.palette.info.main, 0.03)
            : state === 'PENDING_REMOVAL' ? alpha(theme.palette.warning.main, 0.03)
            : theme.palette.background.paper,
          boxShadow: isActive
            ? `0 6px 16px ${alpha(theme.palette.primary.main, 0.12)}`
            : `0 1px 2px ${alpha(theme.palette.text.primary, 0.04)}`,
          opacity: disabled ? 0.55 : 1,
          '&:hover': isCore ? undefined : {
            transform: 'translateY(-2px)',
            boxShadow: `0 10px 20px ${alpha(iconColor, 0.14)}`,
          },
          '&:active': isCore ? undefined : { transform: 'translateY(0) scale(0.99)' },
        }}
      >
        <Box
          sx={{
            width: 36, height: 36, borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(150deg, ${alpha(iconColor, 0.16)} 0%, ${alpha(iconColor, 0.08)} 100%)`,
            color: iconColor,
            boxShadow: `inset 0 0 0 1px ${alpha(iconColor, 0.12)}`,
          }}
        >
          <WidgetsRoundedIcon fontSize="small" />
        </Box>

        <Stack sx={{ flexGrow: 1, minWidth: 0 }} spacing={0}>
          <Tooltip title={module.name} enterDelay={400}>
            <Typography variant="subtitle2" fontWeight={700} noWrap>
              {module.name}
            </Typography>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" noWrap>
            {priceLabel}
          </Typography>
        </Stack>

        <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {stateIndicator()}
        </Box>
      </Box>
    </ButtonBase>
  );
}
