'use client';

import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import GppGoodRoundedIcon from '@mui/icons-material/GppGoodRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';

const ITEMS = [
  { icon: AutorenewRoundedIcon, title: 'No Long-term Lock-in', caption: 'Cancel or change modules anytime, no questions asked.' },
  { icon: BoltRoundedIcon, title: 'Instant Activation', caption: 'Your workspace is ready the moment payment is confirmed.' },
  { icon: GppGoodRoundedIcon, title: 'Secure & Compliant', caption: 'Payments handled by Razorpay with bank-grade encryption.' },
  { icon: SupportAgentRoundedIcon, title: 'Dedicated Support', caption: 'Priority support from our ZoeConnect team.' },
];

export default function TrustBadgesRow() {
  const theme = useTheme();

  return (
    <Grid container spacing={3}>
      {ITEMS.map(({ icon: Icon, title, caption }) => (
        <Grid item xs={12} sm={6} md={3} key={title}>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Box
              sx={{
                width: 36, height: 36, borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: alpha(theme.palette.primary.main, 0.08), color: theme.palette.primary.main,
              }}
            >
              <Icon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
              <Typography variant="caption" color="text.secondary">{caption}</Typography>
            </Box>
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}
