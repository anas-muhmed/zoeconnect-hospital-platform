'use client';

import { forwardRef } from 'react';
import Dialog, { DialogProps } from '@mui/material/Dialog';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/**
 * Drop-in replacement for MUI's <Dialog>. Phase 1 responsive primitive --
 * see the responsiveness audit's finding that none of this app's 65 Dialog
 * call sites ever set `fullScreen`, so every one of them (including
 * content-heavy ones like RoleFormDialog's permission matrix or
 * BackupWizardDialog's multi-step wizard) rendered as a centered,
 * padding-constrained modal on phones instead of expanding to fill the
 * screen.
 *
 * Usage: change
 *   import Dialog from '@mui/material/Dialog';
 *   ... <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth> ...
 * to
 *   import ResponsiveDialog from '@/components/ResponsiveDialog';
 *   ... <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth> ...
 * Nothing else needs to change -- DialogTitle/DialogContent/DialogActions
 * children, and every other DialogProps prop, work exactly as before. This
 * component only adds behavior, it doesn't change the API.
 *
 * What it adds:
 *  - `fullScreen` automatically below the `sm` breakpoint (matches MUI's
 *    own documented responsive-dialog recipe), unless the caller passes an
 *    explicit `fullScreen` prop, which always wins.
 *  - DialogActions stack to full-width, column-reverse buttons below `sm`
 *    (primary action on top, within thumb reach) instead of staying in a
 *    cramped non-wrapping row.
 *  - A `maxHeight` cap + scroll on the dialog paper on larger screens so
 *    tall content (long forms, permission matrices) never grows past the
 *    viewport.
 *
 * What it does NOT fix: a dialog with no Cancel/Close button in its
 * DialogActions (relying solely on Escape or backdrop-click) still has no
 * visible way to dismiss it on a touchscreen, since fullScreen removes the
 * backdrop. Every dialog audited so far already includes a Cancel button in
 * DialogActions, but this wrapper can't guarantee that for dialogs not yet
 * checked -- verify each call site still has one when migrating it.
 */
const ResponsiveDialog = forwardRef<HTMLDivElement, DialogProps>(function ResponsiveDialog(
  { children, sx, PaperProps, fullScreen: fullScreenProp, ...props },
  ref,
) {
  const theme = useTheme();
  const autoFullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const fullScreen = fullScreenProp ?? autoFullScreen;

  return (
    <Dialog
      ref={ref}
      fullScreen={fullScreen}
      PaperProps={{
        ...PaperProps,
        sx: {
          ...(!fullScreen && { maxHeight: 'calc(100dvh - 64px)' }),
          ...(PaperProps?.sx as object),
        },
      }}
      sx={{
        '& .MuiDialogContent-root': {
          px: { xs: 2, sm: 3 },
        },
        '& .MuiDialogActions-root': {
          flexDirection: { xs: 'column-reverse', sm: 'row' },
          alignItems: 'stretch',
          px: { xs: 2, sm: 3 },
          pb: { xs: 2, sm: 1.5 },
          gap: { xs: 1, sm: 0 },
          '& > :not(style) ~ :not(style)': { marginLeft: { xs: 0, sm: 1 } },
          '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' } },
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Dialog>
  );
});

export default ResponsiveDialog;
