'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';

import StarIcon from '@mui/icons-material/Star';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';

import { loyaltyApi, type LoyaltyTransaction } from '@/lib/api/loyalty.api';
import PageHeader from '@/components/PageHeader';

const TIER_COLORS: Record<string, string> = {
  SILVER:   '#78909C',
  GOLD:     '#F9A825',
  PLATINUM: '#7B1FA2',
};

const TX_COLORS: Record<string, 'success' | 'error' | 'info' | 'default'> = {
  EARN:   'success',
  REDEEM: 'error',
  ADJUST: 'info',
  VOID:   'default',
  EXPIRE: 'default',
};

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(20);

  const { data: account, isLoading } = useQuery({
    queryKey: ['loyalty-account', id],
    queryFn: () => loyaltyApi.getById(id),
  });

  const { data: discount } = useQuery({
    queryKey: ['loyalty-discount', id],
    queryFn: () => loyaltyApi.getDiscount(id),
    enabled: !!account,
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['loyalty-transactions', id, page + 1],
    queryFn: () => loyaltyApi.getTransactions(id, page + 1, rowsPerPage),
    enabled: tab === 0,
    placeholderData: (prev: any) => prev,
  });

  const { data: redemptionData } = useQuery({
    queryKey: ['loyalty-redemptions', id],
    queryFn: () => loyaltyApi.getRedemptions(id),
    enabled: tab === 1,
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="rounded" height={200} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  if (!account) return null;

  const tierColor  = TIER_COLORS[account.category.code] ?? '#78909C';
  const isTopTier  = account.category.maxSpend === null;

  // Tier progress — only meaningful when there's a next tier
  const tierMax      = account.category.maxSpend ?? 0;
  const tierMin      = Number(account.category.minSpend);
  const tierProgress = isTopTier ? 100 : Math.min(
    100,
    ((Number(account.totalLifetimeSpend) - tierMin) / (tierMax - tierMin)) * 100,
  );

  // Card (redemption) value — monetary worth of available points
  const cardValue = (discount as any)?.cardValue
    ?? (Number(account.availablePoints) / 100) * Number(account.category.pointValuePer100);

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title={account.patientName || account.patientMrn}
        subtitle={`Card: ${account.cardNumber} · MRN: ${account.patientMrn}`}
        back="/loyalty"
        breadcrumbs={[
          { label: 'Loyalty', href: '/loyalty' },
          { label: 'Accounts', href: '/loyalty' },
          { label: account.patientName || account.patientMrn },
        ]}
      />

      {/* ── Account Header ───────────────────────────────────────────── */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={8}>
          <Card
            elevation={0}
            sx={{
              border: 2,
              borderColor: tierColor,
              background: `linear-gradient(135deg, ${tierColor}18 0%, white 100%)`,
            }}
          >
            <CardContent sx={{ p: 3 }}>
              {/* Patient info header */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h5" fontWeight={700} gutterBottom>
                    {account.patientName || account.patientMrn}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Typography variant="body2" color="text.secondary">
                      MRN: <b>{account.patientMrn}</b>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Card: <b style={{ fontFamily: 'monospace' }}>{account.cardNumber}</b>
                    </Typography>
                    {account.patientMobile && (
                      <Typography variant="body2" color="text.secondary">
                        📞 {account.patientMobile}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  <Chip
                    label={account.category.name}
                    icon={<StarIcon sx={{ fontSize: 14 }} />}
                    sx={{ bgcolor: tierColor, color: 'white', fontWeight: 700 }}
                  />
                  <Chip
                    label={account.status}
                    size="small"
                    color={account.status === 'ACTIVE' ? 'success' : account.status === 'SUSPENDED' ? 'warning' : 'default'}
                    variant="outlined"
                  />
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Stats grid */}
              <Grid container spacing={2}>
                <StatCell
                  label="Available Points"
                  value={Number(account.availablePoints ?? 0).toLocaleString()}
                  color="primary.main"
                />
                <StatCell
                  label="Redeemable Value"
                  value={`₹${Number(cardValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  color="success.main"
                  icon={<AccountBalanceWalletIcon sx={{ fontSize: 14, mr: 0.5 }} />}
                />
                <StatCell
                  label="Lifetime Points"
                  value={Number(account.totalPointsEarned ?? 0).toLocaleString()}
                />
                <StatCell
                  label="Lifetime Spend"
                  value={`₹${Number(account.totalLifetimeSpend ?? 0).toLocaleString()}`}
                />
                <StatCell
                  label="Discount"
                  value={discount ? `${discount.discountPct}%` : '—'}
                  color={discount?.discountPct ? 'success.main' : undefined}
                />
                <StatCell
                  label="Enrolled On"
                  value={new Date(account.enrolledAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                />
              </Grid>

              {/* Tier progress bar */}
              <Box mt={2}>
                {isTopTier ? (
                  /* Platinum — no next tier */
                  <Box
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1,
                      bgcolor: `${tierColor}18`, borderRadius: 2, px: 2, py: 1,
                    }}
                  >
                    <WorkspacePremiumIcon sx={{ color: tierColor, fontSize: 20 }} />
                    <Typography variant="body2" fontWeight={600} color={tierColor}>
                      Top tier achieved — {account.category.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                      Lifetime spend: ₹{Number(account.totalLifetimeSpend).toLocaleString()}
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Progress to next tier
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ₹{Number(account.totalLifetimeSpend).toLocaleString()} / ₹{tierMax.toLocaleString()}
                        {' '}(₹{Math.max(0, tierMax - Number(account.totalLifetimeSpend)).toLocaleString()} remaining)
                      </Typography>
                    </Box>
                    <Tooltip title={`${Math.round(tierProgress)}% to next tier`}>
                      <LinearProgress
                        variant="determinate"
                        value={tierProgress}
                        sx={{
                          height: 8, borderRadius: 4,
                          bgcolor: 'grey.200',
                          '& .MuiLinearProgress-bar': { bgcolor: tierColor },
                        }}
                      />
                    </Tooltip>
                  </>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Discount thresholds */}
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: 1, borderColor: 'divider', height: '100%' }}>
            <CardHeader
              title="Discount Thresholds"
              subheader={`Based on card value (₹${Number(cardValue).toFixed(2)})`}
              titleTypographyProps={{ variant: 'subtitle2', fontWeight: 600 }}
              subheaderTypographyProps={{ variant: 'caption' }}
              avatar={<TrendingUpIcon color="action" />}
            />
            <Divider />
            <CardContent sx={{ p: 0 }}>
              {(account.category.discountThresholds ?? []).map((t) => (
                <Box
                  key={t.min_value}
                  sx={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', px: 2, py: 1.5,
                    borderBottom: 1, borderColor: 'divider',
                    bgcolor: Number(cardValue) >= t.min_value ? 'success.50' : 'transparent',
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      ₹{t.min_value.toLocaleString()} card value
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ≈ {Math.ceil(t.min_value / (Number(account.category.pointValuePer100) / 100)).toLocaleString()} pts needed
                    </Typography>
                  </Box>
                  <Chip
                    label={`${t.discount_pct}% off`}
                    size="small"
                    color={Number(cardValue) >= t.min_value ? 'success' : 'default'}
                    variant={Number(cardValue) >= t.min_value ? 'filled' : 'outlined'}
                  />
                </Box>
              ))}
              {(account.category.discountThresholds ?? []).length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  No discount thresholds defined for this tier.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Transactions" />
        <Tab label="Redemptions" />
      </Tabs>

      {/* Transactions */}
      {tab === 0 && (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reference</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Points</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {txLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><Skeleton /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : txData?.items.map((tx: LoyaltyTransaction) => (
                      <TableRow key={tx.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {new Date(tx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={tx.transactionType}
                            size="small"
                            color={TX_COLORS[tx.transactionType] ?? 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 11, fontFamily: 'monospace' }}>
                          {tx.referenceId ?? '–'}
                        </TableCell>
                        <TableCell>{tx.description ?? '–'}</TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 700, color: tx.points >= 0 ? 'success.main' : 'error.main' }}
                        >
                          {tx.points >= 0 ? '+' : ''}{tx.points}
                        </TableCell>
                        <TableCell align="right">{Number(tx.balanceAfter).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                }
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={txData?.total ?? 0}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[20]}
          />
        </Paper>
      )}

      {/* Redemptions */}
      {tab === 1 && (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Reward</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Points Used</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(redemptionData?.items ?? []).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>{r.reward.name}</TableCell>
                  <TableCell align="right">{r.pointsUsed.toLocaleString()}</TableCell>
                  <TableCell>
                    <Chip
                      label={r.status}
                      size="small"
                      color={
                        r.status === 'APPROVED' || r.status === 'FULFILLED' ? 'success'
                        : r.status === 'REJECTED' ? 'error'
                        : 'warning'
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
              {(redemptionData?.items ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No redemptions yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}

function StatCell({
  label, value, color, icon,
}: {
  label: string;
  value: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Grid item xs={6} sm={4}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {icon}
        <Typography variant="h6" fontWeight={700} color={color ?? 'text.primary'} lineHeight={1.2}>
          {value}
        </Typography>
      </Box>
    </Grid>
  );
}
