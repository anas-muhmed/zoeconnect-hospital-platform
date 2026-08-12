'use client';

import { useState, useEffect } from 'react';
import {
  Menu, MenuItem, ListItemText, ListItemIcon,
  CircularProgress, Typography, Divider, Box, Tooltip, IconButton,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/store/auth.store';

interface Props {
  /** When true, renders a compact icon-only button (collapsed sidebar state) */
  collapsed?: boolean;
}

export default function BranchSwitcher({ collapsed = false }: Props) {
  const { activeBranchId, userBranches, setActiveBranch, user } = useAuthStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  // Hydration fix: userBranches comes from the sessionStorage-persisted auth.
  // store, which is always empty during SSR. Returning null here based on
  // the store's (still-default) value on the very first client render, then
  // rendering the real button once persist rehydrates a moment later,
  // disagrees with the server HTML and trips React's hydration check.
  // Stay in the "not rendered" state until we're safely past first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Don't render if user has no branches assigned (or we haven't mounted yet)
  // Or if this session is locked to a specific branch via HIS integration
  if (!mounted || !userBranches || userBranches.length === 0 || user?.isHisIntegration) return null;

  const activeBranch = userBranches.find((b) => b.id === activeBranchId);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleSwitch = async (branchId: string) => {
    if (branchId === activeBranchId) { handleClose(); return; }
    try {
      setSwitching(branchId);
      const { accessToken, activeBranchId: newBranchId } = await authApi.selectBranch(branchId);
      setActiveBranch(newBranchId, accessToken);
      handleClose();
      window.location.reload();
    } catch {
      /* fail silently — user stays on current branch */
    } finally {
      setSwitching(null);
    }
  };

  // ── Collapsed: icon-only button ─────────────────────────────────────────────
  if (collapsed) {
    return (
      <>
        <Tooltip title={activeBranch?.name ?? 'Select Branch'} placement="right" arrow>
          <IconButton
            onClick={handleOpen}
            size="small"
            sx={{
              mx: 'auto',
              display: 'flex',
              color: activeBranch ? '#60A5FA' : 'rgba(255,255,255,0.45)',
              bgcolor: activeBranch ? 'rgba(96,165,250,0.12)' : 'transparent',
              borderRadius: 1.5,
              width: 36, height: 36,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
            }}
            aria-label={activeBranch?.name ?? 'Select Branch'}>
            <AccountBalanceIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <BranchMenu
          anchorEl={anchorEl}
          onClose={handleClose}
          userBranches={userBranches}
          activeBranchId={activeBranchId}
          switching={switching}
          onSwitch={handleSwitch}
        />
      </>
    );
  }

  // ── Expanded: full sidebar panel ────────────────────────────────────────────
  return (
    <>
      <Box
        onClick={handleOpen}
        sx={{
          mx: 1,
          mb: 0.5,
          px: 1.5,
          py: 0.9,
          borderRadius: 1.5,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: activeBranch ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)',
          border: '1px solid',
          borderColor: activeBranch ? 'rgba(96,165,250,0.25)' : 'rgba(255,255,255,0.08)',
          transition: 'all 0.15s',
          '&:hover': {
            bgcolor: 'rgba(59,130,246,0.15)',
            borderColor: 'rgba(96,165,250,0.4)',
          },
        }}
      >
        <AccountBalanceIcon sx={{ fontSize: 15, color: activeBranch ? '#60A5FA' : 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.575rem', color: 'rgba(255,255,255,0.32)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.2 }}>
            Active Branch
          </Typography>
          <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: activeBranch ? 'white' : 'rgba(255,255,255,0.45)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeBranch?.name ?? 'Select Branch'}
          </Typography>
        </Box>
        <ExpandMoreIcon sx={{ fontSize: 13, color: 'rgba(255,255,255,0.28)', flexShrink: 0 }} />
      </Box>

      <BranchMenu
        anchorEl={anchorEl}
        onClose={handleClose}
        userBranches={userBranches}
        activeBranchId={activeBranchId}
        switching={switching}
        onSwitch={handleSwitch}
      />
    </>
  );
}

// ── Shared dropdown menu ───────────────────────────────────────────────────────
function BranchMenu({
  anchorEl, onClose, userBranches, activeBranchId, switching, onSwitch,
}: {
  anchorEl: null | HTMLElement;
  onClose: () => void;
  userBranches: { id: string; name: string }[];
  activeBranchId?: string | null;
  switching: string | null;
  onSwitch: (id: string) => void;
}) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      PaperProps={{ sx: { minWidth: 220, mt: 0.5, borderRadius: 2, maxHeight: 360, overflow: 'auto' } }}
    >
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
          Switch Branch
        </Typography>
      </Box>
      <Divider />
      {userBranches.map((branch) => (
        <MenuItem
          key={branch.id}
          onClick={() => onSwitch(branch.id)}
          selected={branch.id === activeBranchId}
          sx={{ py: 1.2 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            {switching === branch.id ? (
              <CircularProgress size={16} />
            ) : branch.id === activeBranchId ? (
              <CheckIcon fontSize="small" color="primary" />
            ) : null}
          </ListItemIcon>
          <ListItemText
            primary={branch.name}
            primaryTypographyProps={{
              fontWeight: branch.id === activeBranchId ? 700 : 400,
              fontSize: '0.875rem',
            }}
          />
        </MenuItem>
      ))}
    </Menu>
  );
}
