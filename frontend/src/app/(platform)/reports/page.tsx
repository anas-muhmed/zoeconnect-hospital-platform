'use client';

import React, { useState } from 'react';
import {
  Box, Typography, Grid, Paper, Stack, Chip, Button, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, Tooltip, IconButton, Select, MenuItem, FormControl,
} from '@mui/material';
import {
  Download as DownloadIcon, Refresh as RefreshIcon,
  PeopleAlt as PeopleIcon, Stars as StarsIcon,
  AccountBalance as LiabilityIcon, TrendingUp as TrendIcon,
  Notifications as NotifIcon, AssignmentTurnedIn as TxIcon,
  BarChart as BarChartIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { reportsApi, type DashboardKpis, type TierDistributionRow, type DailyVolumeRow, type TopEarnerRow, type CampaignPerformanceRow } from '@/lib/api/reports.api';
import PageHeader from '@/components/PageHeader';
import SectionCard from '@/components/SectionCard';

function fmt(n: number) { return new Intl.NumberFormat('en-IN').format(n); }
function fmtCur(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

// ── Gradient KPI Card ─────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon, gradient,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; gradient: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5, height: '100%',
        border: '1px solid', borderColor: 'divider',
        borderRadius: 3,
        transition: 'box-shadow 0.2s, transform 0.2s',
        '&:hover': { boxShadow: '0 8px 20px rgba(0,0,0,0.09)', transform: 'translateY(-2px)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
        <Box
          sx={{
            width: 40, height: 40, borderRadius: 2,
            background: gradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
            color: 'white',
          }}
        >
          {icon}
        </Box>
      </Box>
      <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.02em', color: '#1A2340', lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography variant="body2" sx={{ color: '#3D4A66', fontWeight: 500, mt: 0.5 }}>{label}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
}

// ── KPI Row ───────────────────────────────────────────────────────────────────
function KpisSection({ kpis, loading }: { kpis: DashboardKpis | undefined; loading: boolean }) {
  if (loading) return <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>;
  if (!kpis) return null;
  const cards = [
    { label: 'Total Members',        value: fmt(kpis.totalAccounts),           sub: `${fmt(kpis.activeAccounts)} active`,                  icon: <PeopleIcon sx={{ fontSize: 20 }} />,    gradient: 'linear-gradient(135deg,#1565C0,#1E88E5)' },
    { label: 'New This Month',       value: fmt(kpis.newEnrollmentsMonth),      sub: 'new enrollments',                                     icon: <TrendIcon sx={{ fontSize: 20 }} />,     gradient: 'linear-gradient(135deg,#2E7D32,#43A047)' },
    { label: 'Points Outstanding',   value: fmt(kpis.totalPointsOutstanding),   sub: `≈ ${fmtCur(kpis.estimatedLiabilityInr)} liability`,  icon: <StarsIcon sx={{ fontSize: 20 }} />,     gradient: 'linear-gradient(135deg,#E65100,#FF7043)' },
    { label: 'Estimated Liability',  value: fmtCur(kpis.estimatedLiabilityInr),sub: 'at ₹0.25 / point',                                    icon: <LiabilityIcon sx={{ fontSize: 20 }} />, gradient: 'linear-gradient(135deg,#C62828,#E53935)' },
    { label: "Today's Transactions", value: fmt(kpis.transactionsToday),        sub: `${fmt(kpis.pointsEarnedToday)} pts earned`,           icon: <TxIcon sx={{ fontSize: 20 }} />,        gradient: 'linear-gradient(135deg,#01579B,#0288D1)' },
    { label: 'Notifications Sent',   value: fmt(kpis.notificationsSentToday),   sub: 'today',                                               icon: <NotifIcon sx={{ fontSize: 20 }} />,     gradient: 'linear-gradient(135deg,#00838F,#26C6DA)' },
  ];
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {cards.map(({ label, value, sub, icon, gradient }) => (
        <Grid item xs={12} sm={6} md={4} lg={2} key={label}>
          <KpiCard label={label} value={value} sub={sub} icon={icon} gradient={gradient} />
        </Grid>
      ))}
    </Grid>
  );
}

// ── Chart wrappers (same logic, now inside SectionCard) ───────────────────────
function TierChart({ data }: { data: TierDistributionRow[] }) {
  if (!data.length) return null;
  return (
    <Box sx={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="tierName" cx="50%" cy="50%" outerRadius={100}
            label={({ tierName, percentage }) => `${tierName} ${percentage}%`} labelLine={false}>
            {data.map((entry, i) => <Cell key={i} fill={entry.tierColor || `hsl(${i * 72}, 60%, 55%)`} />)}
          </Pie>
          <RechartTooltip formatter={(val: number) => [fmt(val), 'Members']} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
}

function VolumeChart({ data, days, setDays }: { data: DailyVolumeRow[]; days: number; setDays: (d: number) => void }) {
  const chartData = data.map(r => ({ ...r, label: r.date.slice(5) }));
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <Select value={days} onChange={e => setDays(Number(e.target.value))}>
            <MenuItem value={7}>Last 7 days</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <Box sx={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F8" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7899' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#6B7899' }} />
            <RechartTooltip
              formatter={(val: number, name: string) => [fmt(val), name]}
              labelFormatter={(l) => `Date: ${l}`}
              contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F2', fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="pointsEarned"   name="Points Earned"   stroke="#2E7D32" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="pointsRedeemed" name="Points Redeemed" stroke="#C62828" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="earnCount"      name="Earn Txns"       stroke="#1565C0" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

function TopEarnersTable({ data, onExport }: { data: TopEarnerRow[]; onExport: () => void }) {
  return (
    <TableContainer sx={{ maxHeight: 320 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Card Number</TableCell>
            <TableCell>MRN</TableCell>
            <TableCell>Tier</TableCell>
            <TableCell align="right">Available</TableCell>
            <TableCell align="right">Lifetime</TableCell>
            <TableCell align="right">Spend (₹)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow key={row.accountId} hover>
              <TableCell><Typography variant="caption" color="text.secondary">{idx + 1}</Typography></TableCell>
              <TableCell><Typography sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{row.cardNumber}</Typography></TableCell>
              <TableCell><Typography sx={{ fontSize: '0.875rem' }}>{row.patientMrn}</Typography></TableCell>
              <TableCell>
                <Chip label={row.tierName} size="small"
                  sx={{ bgcolor: row.tierColor, color: '#fff', fontWeight: 700, fontSize: 11 }} />
              </TableCell>
              <TableCell align="right"><Typography variant="body2">{fmt(row.availablePoints)}</Typography></TableCell>
              <TableCell align="right"><Typography variant="body2" fontWeight={700}>{fmt(row.lifetimePoints)}</Typography></TableCell>
              <TableCell align="right"><Typography variant="body2">{fmt(Math.round(row.totalSpend))}</Typography></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function CampaignPerfTable({ data }: { data: CampaignPerformanceRow[] }) {
  return (
    <TableContainer sx={{ maxHeight: 280 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Campaign</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Txns</TableCell>
            <TableCell align="right">Bonus Pts</TableCell>
            <TableCell align="right">Members</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map(row => (
            <TableRow key={row.campaignId} hover>
              <TableCell><Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{row.campaignName}</Typography></TableCell>
              <TableCell><Typography variant="body2" color="text.secondary">{row.campaignType}</Typography></TableCell>
              <TableCell>
                <Chip label={row.isActive ? 'Active' : 'Inactive'} color={row.isActive ? 'success' : 'default'} size="small" />
              </TableCell>
              <TableCell align="right"><Typography variant="body2">{fmt(row.bonusTransactions)}</Typography></TableCell>
              <TableCell align="right"><Typography variant="body2" color="success.main" fontWeight={700}>+{fmt(row.totalBonusPoints)}</Typography></TableCell>
              <TableCell align="right"><Typography variant="body2">{fmt(row.uniqueAccounts)}</Typography></TableCell>
            </TableRow>
          ))}
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} align="center">
                <Typography variant="body2" color="text.secondary" py={3}>No campaign data</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function NotifStatsChart({ data }: { data: Array<{ channel: string; status: string; count: number }> }) {
  const channels = [...new Set(data.map(r => r.channel))];
  const chartData = channels.map(ch => {
    const base: Record<string, number | string> = { channel: ch };
    data.filter(r => r.channel === ch).forEach(r => { base[r.status] = r.count; });
    return base;
  });
  const statuses = [...new Set(data.map(r => r.status))];
  const COLORS: Record<string, string> = { SENT: '#2E7D32', FAILED: '#C62828', PENDING: '#E65100', DELIVERED: '#1565C0' };
  if (!data.length) return <Box sx={{ py: 4, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">No notification data</Typography></Box>;
  return (
    <Box sx={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F8" />
          <XAxis dataKey="channel" tick={{ fontSize: 11, fill: '#6B7899' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6B7899' }} />
          <RechartTooltip formatter={(val: number, name: string) => [fmt(val), name]} contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F2', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {statuses.map(s => <Bar key={s} dataKey={s} name={s} fill={COLORS[s] ?? '#888'} stackId="a" radius={[2,2,0,0]} />)}
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [volumeDays, setVolumeDays] = useState(30);

  const kpiQuery      = useQuery({ queryKey: ['reports-kpi'],                   queryFn: reportsApi.getDashboard,            staleTime: 60_000 });
  const tierQuery     = useQuery({ queryKey: ['reports-tier'],                   queryFn: reportsApi.getTierDistribution,    staleTime: 60_000 });
  const volumeQuery   = useQuery({ queryKey: ['reports-volume', volumeDays],    queryFn: () => reportsApi.getDailyVolume(volumeDays), staleTime: 60_000 });
  const earnersQuery  = useQuery({ queryKey: ['reports-earners'],               queryFn: () => reportsApi.getTopEarners(),           staleTime: 60_000 });
  const campaignQuery = useQuery({ queryKey: ['reports-campaign'],              queryFn: reportsApi.getCampaignPerformance,  staleTime: 60_000 });
  const notifQuery    = useQuery({ queryKey: ['reports-notif'],                 queryFn: () => reportsApi.getNotificationStats(),    staleTime: 60_000 });

  const refetchAll = () => {
    kpiQuery.refetch(); tierQuery.refetch(); volumeQuery.refetch();
    earnersQuery.refetch(); campaignQuery.refetch(); notifQuery.refetch();
  };
  const downloadCsv = (url: string) => { const a = document.createElement('a'); a.href = url; a.click(); };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Live platform metrics — data refreshed every 60 seconds"
        icon={<BarChartIcon />}
        actions={
          <Tooltip title="Refresh all" arrow>
            <IconButton
              onClick={refetchAll}
              size="small"
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
             aria-label="Refresh all">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        }
      />

      {(kpiQuery.isError || tierQuery.isError) && (
        <Alert severity="warning" sx={{ mb: 3 }}>Some report data failed to load. Partial results are shown.</Alert>
      )}

      {/* KPIs */}
      <KpisSection kpis={kpiQuery.data} loading={kpiQuery.isLoading} />

      {/* Charts Row */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <SectionCard title="Tier Distribution">
            {tierQuery.isLoading
              ? <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
              : <TierChart data={tierQuery.data ?? []} />}
          </SectionCard>
        </Grid>
        <Grid item xs={12} md={8}>
          <SectionCard title="Transaction Volume">
            {volumeQuery.isLoading
              ? <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
              : <VolumeChart data={volumeQuery.data ?? []} days={volumeDays} setDays={setVolumeDays} />}
          </SectionCard>
        </Grid>
      </Grid>

      {/* Tables Row */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={7}>
          <SectionCard
            title="Top 20 Members by Lifetime Points"
            action={
              <Tooltip title="Export CSV" arrow>
                <IconButton size="small" onClick={() => downloadCsv(reportsApi.exportTopEarners())} aria-label="Export CSV">
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            }
            noPadding
          >
            {earnersQuery.isLoading
              ? <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
              : <TopEarnersTable data={(earnersQuery.data as TopEarnerRow[] | undefined) ?? []} onExport={() => downloadCsv(reportsApi.exportTopEarners())} />}
          </SectionCard>
        </Grid>
        <Grid item xs={12} lg={5}>
          <SectionCard
            title="Campaign Performance"
            action={
              <Tooltip title="Export CSV" arrow>
                <IconButton size="small" onClick={() => downloadCsv(reportsApi.exportCampaignPerformance())} aria-label="Export CSV">
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            }
            noPadding
          >
            {campaignQuery.isLoading
              ? <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
              : <CampaignPerfTable data={campaignQuery.data ?? []} />}
          </SectionCard>
        </Grid>
      </Grid>

      {/* Notif + CSV Exports */}
      <Grid container spacing={2.5}>
        <Grid item xs={12} md={6}>
          <SectionCard title="Notification Delivery (last 30 days)">
            {notifQuery.isLoading
              ? <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
              : <NotifStatsChart data={(notifQuery.data as { channel: string; status: string; count: number }[] | undefined) ?? []} />}
          </SectionCard>
        </Grid>
        <Grid item xs={12} md={6}>
          <SectionCard title="CSV Exports" icon={<DownloadIcon />}>
            <Stack spacing={1.5}>
              {[
                { label: 'Top Earners',           fn: () => downloadCsv(reportsApi.exportTopEarners()) },
                { label: `Daily Volume — last ${volumeDays} days`, fn: () => downloadCsv(reportsApi.exportDailyVolume(volumeDays)) },
                { label: 'Campaign Performance',  fn: () => downloadCsv(reportsApi.exportCampaignPerformance()) },
              ].map(({ label, fn }) => (
                <Button key={label} variant="outlined" startIcon={<DownloadIcon />} onClick={fn} fullWidth sx={{ justifyContent: 'flex-start' }}>
                  {label}
                </Button>
              ))}
            </Stack>
          </SectionCard>
        </Grid>
      </Grid>
    </Box>
  );
}
