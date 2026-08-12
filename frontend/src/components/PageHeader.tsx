'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { alpha } from '@mui/material/styles';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Pass a path string to push, or `true` to go back */
  back?: string | true;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  /** Render a divider below the header */
  divider?: boolean;
  /** Extra vertical spacing below */
  mb?: number;
}

export default function PageHeader({
  title,
  subtitle,
  icon,
  back,
  breadcrumbs,
  actions,
  divider = false,
  mb = 3,
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof back === 'string') router.push(back);
    else router.back();
  };

  return (
    <Box sx={{ mb }}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs
          separator={<NavigateNextIcon sx={{ fontSize: 13 }} />}
          sx={{ mb: 1.25 }}
        >
          {breadcrumbs.map((crumb, idx) =>
            crumb.href && idx < breadcrumbs.length - 1 ? (
              <Link
                key={idx}
                href={crumb.href}
                style={{
                  color: '#6B7899',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                {crumb.label}
              </Link>
            ) : (
              <Typography
                key={idx}
                sx={{ fontSize: '0.8rem', color: '#3D4A66', fontWeight: 600 }}
              >
                {crumb.label}
              </Typography>
            )
          )}
        </Breadcrumbs>
      )}

      {/* Main row: [back | icon | title+subtitle] then actions.
          Responsiveness fix (2026-08, Phase 1 primitives): this used to be
          one non-wrapping `display:'flex'` row -- title+subtitle sharing
          space with an `actions` block (often 2-3 buttons) with no wrap and
          no stacking, so on narrow screens the actions either got squeezed
          unreadable or forced the whole header into horizontal overflow.
          Used directly by 47 pages across the app (childrens-village and
          eic account for most of them), so this one fix lands everywhere
          those pages already use PageHeader without any per-page changes.
          Below `sm`, the title block and the actions block stack instead of
          sharing a row, and actions themselves wrap if there are several. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'flex-start' },
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flex: 1, minWidth: 0 }}>
          {back && (
            <IconButton
              onClick={handleBack}
              size="small"
              sx={{
                mt: 0.2,
                color: 'text.secondary',
                border: '1.5px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                width: 32,
                height: 32,
                flexShrink: 0,
                '&:hover': {
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
                  color: 'primary.main',
                  borderColor: 'primary.light',
                },
              }}
            >
              <ArrowBackIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}

          {icon && (
            <Box
              sx={{
                width: 40, height: 40,
                borderRadius: 2,
                bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'primary.main',
                flexShrink: 0,
              }}
            >
              {icon}
            </Box>
          )}

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="h5"
              fontWeight={800}
              sx={{ letterSpacing: '-0.02em', lineHeight: 1.2, color: '#1A2340' }}
            >
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.4, lineHeight: 1.5 }}
              >
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
              mt: { xs: 0, sm: 0.25 },
              justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            }}
          >
            {actions}
          </Box>
        )}
      </Box>

      {divider && <Divider sx={{ mt: 2 }} />}
    </Box>
  );
}
