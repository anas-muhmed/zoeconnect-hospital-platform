'use client';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import { alpha, useTheme } from '@mui/material/styles';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import WorkspacesRoundedIcon from '@mui/icons-material/WorkspacesRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';

const TABS = [
  { href: '/settings/billing/subscribe', label: 'Subscribe', icon: AddShoppingCartRoundedIcon },
  { href: '/settings/billing/subscription', label: 'My Subscription', icon: WorkspacesRoundedIcon },
  { href: '/settings/billing/history', label: 'Billing History', icon: ReceiptLongRoundedIcon },
];

export default function BillingSubNav() {
  const theme = useTheme();
  const pathname = usePathname();

  return (
    <Box
      sx={{
        bgcolor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
        position: 'sticky',
        top: 0,
        zIndex: theme.zIndex.appBar - 1,
      }}
    >
      <Container maxWidth="lg">
        <Stack direction="row" spacing={0.5} sx={{ py: 1.25, overflowX: 'auto' }}>
          {TABS.map((tab) => {
            const active = pathname?.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <ButtonBase
                key={tab.href}
                component={Link}
                href={tab.href}
                sx={{
                  px: 2, py: 1, borderRadius: 2.5, whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 1,
                  fontWeight: 700, fontSize: 14,
                  color: active ? theme.palette.primary.main : theme.palette.text.secondary,
                  bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, active ? 0.1 : 0.04) },
                }}
              >
                <Icon sx={{ fontSize: 18 }} />
                <Typography variant="body2" fontWeight={700} color="inherit">{tab.label}</Typography>
              </ButtonBase>
            );
          })}
        </Stack>
      </Container>
    </Box>
  );
}
