'use client';

import { forwardRef } from 'react';
import Dialog, { DialogProps } from '@mui/material/Dialog';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/**
 * Drop-in replacement for MUI's <Dialog>. Phase 1 responsive primitive --
 * mirrors frontend/src/components/ResponsiveDialog.tsx (the hospital app's
 * equivalent, built for the same reason: none of this app's Dialog call
 * sites (68 <Dialog> instances across hospitals/hdsp-users/his-config/
 * cloud-tenants/requests/security) ever set `fullScreen`, so every one
 * rendered as a centered, padding-constrained modal on phones.
 *
 * Usage: change
 *   import Dialog from '@mui/material/Dialog';
 *   ... <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth> ...
 * to
 *   import ResponsiveDialog from '@/components/ResponsiveDialog';
 *   ... <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth> ...
 * Nothing else needs to change -- DialogTitle/DialogContent/DialogActions
 * children, and every other DialogProps prop, work exactly as before.
 *
 * What it adds:
 *  - `fullScreen` automatically below the `sm` breakpoint, unless the
 *    caller passes an explicit `fullScreen` prop, which always wins.
 *  - DialogActions stack to full-width, column-reverse buttons below `sm`.
 *  - A `maxHeight` cap + scroll on the dialog paper on larger screens.
 *
 * What it does NOT fix: a dialog with no Cancel/Close button in its
 * DialogActions still has no visible way to dismiss it on a touchscreen
 * once fullScreen removes the backdrop -- verify each call site still has
 * one when migrating it (every dialog checked in this app so far does).
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
