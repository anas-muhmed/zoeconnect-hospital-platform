'use client';

/**
 * Feedback analytics dashboard -- a fixed set of aggregate views
 * (KPIs, rating distribution, submissions trend, per-campaign breakdown,
 * complaint status/category) over GET /feedback/analytics/dashboard.
 * A flexible report builder/export is a separate, later phase.
 */

import { useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Button from '@mui/material/Button';
import StarIcon from '@mui/icons-material/Star';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DownloadIcon from '@mui/icons-material/Download';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, Legend,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import ResponsiveTable from '@/components/ResponsiveTable';

interface Dashboard {
  rangeDays: number;
  totalSubmissions: number;
  averageRating: number | null;
  ratingDistribution: { rating: number; count: number }[];
  submissionsTrend: { date: string; count: number; avgRating: number | null }[];
  campaignBreakdown: { campaignId: string; campaignName: string; count: number; avgRating: number | null }[];
  complaints: {
    total: number;
    byStatus: { status: string; count: number }[];
    byCategory: { category: string; count: number }[];
  };
}

interface FeedbackCampaign { id: string; name: string; }

const COMPLAINT_COLORS = ['#E65100', '#1565C0', '#2E7D32', '#6A1B9A', '#C62828', '#00838F', '#F9A825', '#5D4037'];

function KpiCard({ label, value, sub, icon, gradient }: { label: string; value: string | number; sub?: string; icon: ReactNode; gradient: string }) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Box sx={{
        width: 40, height: 40, borderRadius: 2, background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', mb: 1.5,
      }}>
        {icon}
      </Box>
      <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.02em' }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{label}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
}

export default function FeedbackAnalyticsPage() {
  const [campaignId, setCampaignId] = useState('');
  const [days, setDays] = useState(30);

  const { data: campaigns = [] } = useQuery<FeedbackCampaign[]>({
    queryKey: ['feedback-campaigns'],
    queryFn: () => apiClient.get('/feedback/campaigns').then(r => r.data),
  });

  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ['feedback-analytics-dashboard', campaignId, days],
    queryFn: () => apiClient.get('/feedback/analytics/dashboard', {
      params: { days, ...(campaignId ? { campaignId } : {}) },
    }).then(r => r.data),
  });

  const downloadCsv = async (kind: 'submissions' | 'complaints' | 'answers') => {
    const res = await apiClient.get(`/feedback/reports/export/${kind}`, {
      responseType: 'blob',
      params: { days, ...(campaignId ? { campaignId } : {}) },
    });
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resolutionRate = data && data.complaints.total > 0
    ? Math.round(((data.complaints.byStatus.find(s => s.status === 'RESOLVED')?.count ?? 0)
        + (data.complaints.byStatus.find(s => s.status === 'CLOSED')?.count ?? 0)) / data.complaints.total * 100)
    : null;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Feedback Analytics</Typography>
          <Typography variant="body2" color="text.secondary">
            Aggregate view across submissions and complaints for the selected range.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField select label="Campaign" value={campaignId} onChange={e => setCampaignId(e.target.value)} sx={{ minWidth: 200 }} size="small">
            <MenuItem value="">All campaigns</MenuItem>
            {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField select label="Range" value={days} onChange={e => setDays(Number(e.target.value))} sx={{ minWidth: 140 }} size="small">
            <MenuItem value={7}>Last 7 days</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
            <MenuItem value={365}>Last 12 months</MenuItem>
          </TextField>
        </Box>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
          <CircularProgress size={28} />
          <Typography color="text.secondary">Loading analytics...</Typography>
        </Box>
      )}

      {data && !isLoading && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <KpiCard label="Total Submissions" value={data.totalSubmissions} sub={`last ${data.rangeDays} days`}
                icon={<AssignmentIcon fontSize="small" />} gradient="linear-gradient(135deg,#1565C0,#1E88E5)" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiCard label="Average Rating" value={data.averageRating !== null ? data.averageRating.toFixed(2) : '--'}
                sub={data.averageRating !== null ? 'out of 5' : 'no rated submissions yet'}
                icon={<StarIcon fontSize="small" />} gradient="linear-gradient(135deg,#E65100,#FF7043)" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiCard label="Complaints" value={data.complaints.total} sub={`last ${data.rangeDays} days`}
                icon={<ReportProblemIcon fontSize="small" />} gradient="linear-gradient(135deg,#C62828,#E53935)" />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KpiCard label="Resolution Rate" value={resolutionRate !== null ? `${resolutionRate}%` : '--'}
                sub="resolved or closed"
                icon={<CheckCircleIcon fontSize="small" />} gradient="linear-gradient(135deg,#2E7D32,#43A047)" />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Rating Distribution</Typography>
                {data.ratingDistribution.every(r => r.count === 0) ? (
                  <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No rated submissions in this range.</Typography>
                ) : (
                  <Box sx={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.ratingDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="rating" tickFormatter={v => `${v}★`} />
                        <YAxis allowDecimals={false} />
                        <RechartTooltip formatter={(v: number) => [v, 'Submissions']} labelFormatter={v => `${v} star`} />
                        <Bar dataKey="count" fill="#1E88E5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Submissions Over Time</Typography>
                {data.submissionsTrend.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No submissions in this range.</Typography>
                ) : (
                  <Box sx={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.submissionsTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} />
                        <RechartTooltip />
                        <Line type="monotone" dataKey="count" name="Submissions" stroke="#1E88E5" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={7}>
              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>By Campaign</Typography>
                {data.campaignBreakdown.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No submissions in this range.</Typography>
                ) : (
                  <ResponsiveTable minWidth={500}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Campaign</TableCell>
                        <TableCell align="right">Submissions</TableCell>
                        <TableCell align="right">Avg. Rating</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.campaignBreakdown.map(c => (
                        <TableRow key={c.campaignId}>
                          <TableCell>{c.campaignName}</TableCell>
                          <TableCell align="right">{c.count}</TableCell>
                          <TableCell align="right">{c.avgRating !== null ? c.avgRating.toFixed(2) : '--'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </ResponsiveTable>
                )}
              </Paper>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Complaints by Category</Typography>
                {data.complaints.byCategory.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No complaints in this range.</Typography>
                ) : (
                  <Box sx={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.complaints.byCategory} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={80} label>
                          {data.complaints.byCategory.map((entry, i) => (
                            <Cell key={entry.category} fill={COMPLAINT_COLORS[i % COMPLAINT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend />
                        <RechartTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </Paper>
            </Grid>
          </Grid>

          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>Export Reports</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              CSV downloads for the same filters selected above (campaign + date range).
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadCsv('submissions')}>
                Submissions Summary
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadCsv('complaints')}>
                Complaints
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadCsv('answers')}>
                Detailed Answers
              </Button>
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}
