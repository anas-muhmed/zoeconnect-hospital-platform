'use client';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';
import { alpha, useTheme } from '@mui/material/styles';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import Link from 'next/link';
import type { SubscriptionItem } from '@/lib/api/billing.api';

export interface CurrentModulesListProps {
  items: SubscriptionItem[];
}

const dateLabel = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const EXPIRING_SOON_DAYS = 14;

/**
 * "Current Modules" section on My Subscription. Per-module prepayment:
 * each module now carries its OWN paid-through date (`item.periodEnd`),
 * independent of the subscription's shared renewal date -- two modules
 * bought on different days, or with different "months" chosen at
 * purchase, can expire on entirely different dates. Every row shows its
 * own date rather than a single flat "Licensed" badge, and a row within
 * `EXPIRING_SOON_DAYS` of its own expiry is flagged so the tenant notices
 * before that specific module (not necessarily the whole subscription)
 * lapses. "Extend" deep-links to Subscribe, where the module's
 * management dialog offers "Buy More Months".
 */
export default function CurrentModulesList({ items }: CurrentModulesListProps) {
  const theme = useTheme();

  if (items.length === 0) {
    return <Typography variant="body2" color="text.secondary">No modules licensed yet.</Typography>;
  }

  const now = Date.now();
  const sorted = [...items].sort((a, b) => new Date(a.periodEnd).getTime() - new Date(b.periodEnd).getTime());

  return (
    <Stack spacing={0.75}>
      {sorted.map((item) => {
        const periodEndMs = new Date(item.periodEnd).getTime();
        const daysLeft = Math.ceil((periodEndMs - now) / (24 * 60 * 60 * 1000));
        const expiringSoon = daysLeft <= EXPIRING_SOON_DAYS;
        return (
          <Stack
            key={item.moduleCode}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{
              py: 1, px: 1.5, borderRadius: 2,
              bgcolor: expiringSoon ? alpha(theme.palette.warning.main, 0.05) : alpha(theme.palette.success.main, 0.03),
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600}>{item.moduleName}</Typography>
              <Typography variant="caption" color={expiringSoon ? 'warning.dark' : 'text.secondary'}>
                Licensed until {dateLabel(item.periodEnd)}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              {expiringSoon && (
                <Tooltip title={`Expires in ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? '' : 's'} unless extended`}>
                  <ScheduleRoundedIcon sx={{ fontSize: 16, color: 'warning.dark' }} />
                </Tooltip>
              )}
              <Chip
                size="small"
                icon={<CheckCircleRoundedIcon sx={{ fontSize: 14 }} />}
                label="Licensed"
                sx={{ fontWeight: 700, height: 22, fontSize: 11, bgcolor: alpha(theme.palette.success.main, 0.12), color: theme.palette.success.dark }}
              />
              <ButtonBase
                component={Link}
                href="/settings/billing/subscribe"
                sx={{ fontSize: 11, fontWeight: 700, color: 'primary.main', px: 0.75, py: 0.25, borderRadius: 1 }}
              >
                Extend
              </ButtonBase>
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
