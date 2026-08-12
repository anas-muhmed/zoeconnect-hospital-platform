'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useRouter } from 'next/navigation';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Pass a path string to push, or `true` to go back */
  back?: string | true;
  actions?: React.ReactNode;
  mb?: number;
}

/**
 * Shared page header for the Vendor Portal. Phase 1 responsive primitive --
 * this app had no shared header component at all; the responsiveness audit
 * found the same icon+title+actions row hand-rolled independently, non-
 * wrapping, in 10 files (requests, hospitals, licenses, history, logs,
 * cloud-tenants, cloud-tenants/[id], hdsp-users, security, settings) --
 * e.g. hdsp-users/page.tsx stacking THREE buttons next to a two-line title
 * in one non-wrapping flex row.
 *
 * Mirrors frontend/src/components/PageHeader.tsx's (the hospital app's
 * equivalent) responsive shape: below `sm`, the title block and the
 * actions block stack instead of sharing a row, and actions wrap if there
 * are several, instead of overflowing or squeezing unreadable.
 *
 * Usage: replace a page's hand-rolled
 *   <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
 *     <SomeIcon color="primary" />
 *     <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>Title</Typography>
 *     <Button>Action</Button>
 *   </Box>
 * with
 *   <PageHeader icon={<SomeIcon color="primary" />} title="Title" actions={<Button>Action</Button>} />
 */
export default function PageHeader({ title, subtitle, icon, back, actions, mb = 3 }: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof back === 'string') router.push(back);
    else router.back();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: 1.5,
        mb,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
        {back && (
          <IconButton onClick={handleBack} size="small" sx={{ flexShrink: 0 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        {icon && <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</Box>}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" fontWeight={700} noWrap={false} sx={{ overflowWrap: 'break-word' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>

      {actions && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
            flexShrink: 0,
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}
