'use client';

import { useState } from 'react';
import {
  Box, Modal, Typography, Button, List, ListItemButton,
  ListItemText, CircularProgress, Paper,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/store/auth.store';
import type { Branch } from '@/providers/AuthProvider';

interface Props {
  branches: Branch[];
  onSelected: () => void;
  /** Called when the user dismisses the picker without choosing a branch (backdrop click) */
  onCancel: () => void;
}

export default function BranchSelectModal({ branches, onSelected, onCancel }: Props) {
  const { setActiveBranch } = useAuthStore();
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (branch: Branch) => {
    try {
      setSelecting(branch.id);
      setError(null);
      const { accessToken, activeBranchId } = await authApi.selectBranch(branch.id);
      setActiveBranch(activeBranchId, accessToken);
      onSelected();
    } catch {
      setError('Failed to select branch. Please try again.');
    } finally {
      setSelecting(null);
    }
  };

  return (
    <Modal
      open
      disableEscapeKeyDown
      onClose={(_event, reason) => {
        // Bug fix: clicking outside used to do nothing, trapping the user on
        // a blank screen with no way back. Backdrop click now cancels sign-in
        // and returns to the login page; Esc stays disabled (disableEscapeKeyDown
        // above prevents that reason from ever reaching this handler).
        if (reason === 'backdropClick') onCancel();
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: { xs: '90%', sm: 420 },
          outline: 'none',
        }}
      >
        <Paper
          elevation={8}
          sx={{ borderRadius: 3, overflow: 'hidden' }}
        >
          {/* Header */}
          <Box
            sx={{
              background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
              px: 3,
              py: 2.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <AccountBalanceIcon sx={{ color: 'white', fontSize: 28 }} />
            <Box>
              <Typography variant="h6" fontWeight={700} color="white">
                Select Branch
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
                Choose the branch you want to work in
              </Typography>
            </Box>
          </Box>

          {/* Branch List */}
          <List disablePadding sx={{ maxHeight: 320, overflowY: 'auto' }}>
            {branches.map((branch, idx) => (
              <ListItemButton
                key={branch.id}
                onClick={() => handleSelect(branch)}
                disabled={!!selecting}
                divider={idx < branches.length - 1}
                sx={{
                  px: 3,
                  py: 1.5,
                  '&:hover': { bgcolor: 'primary.50' },
                }}
              >
                <ListItemText
                  primary={branch.name}
                  secondary={`Branch ID: ${branch.id}`}
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
                {selecting === branch.id && (
                  <CircularProgress size={20} sx={{ ml: 1 }} />
                )}
              </ListItemButton>
            ))}
          </List>

          {/* Error */}
          {error && (
            <Box sx={{ px: 3, py: 1.5, bgcolor: 'error.50' }}>
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            </Box>
          )}

          {/* Footer note */}
          <Box sx={{ px: 3, py: 2, bgcolor: 'grey.50', borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              You can switch branches at any time from the top navigation bar.
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Modal>
  );
}
