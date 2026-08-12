'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import StorageIcon from '@mui/icons-material/Storage';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import TimelineIcon from '@mui/icons-material/Timeline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HistoryIcon from '@mui/icons-material/History';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageHeader from '@/components/PageHeader';
import SectionCard from '@/components/SectionCard';
import { attendanceMonitoringApi } from '@/lib/api/attendance-monitoring.api';
import { useAuthStore } from '@/lib/store/auth.store';

type Status = 'Healthy' | 'Warning' | 'Failed';

const statusColors: Record<Status, 'success' | 'warning' | 'error'> = {
  Healthy: 'success',
  Warning: 'warning',
  Failed: 'error',
};

function isUnavailable(value: unknown): value is { value: null; available: false; reason: string } {
  return !!value && typeof value === 'object' && (value as any).available === false;
}

function display(value: any): string {
  if (isUnavailable(value)) return 'Not Available';
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString();
  return String(value);
}

function ValueCell({ value }: { value: any }) {
  if (isUnavailable(value)) {
    return (
      <Tooltip title={value.reason} arrow>
        <Chip label="Not Available" size="small" color="default" variant="outlined" />
      </Tooltip>
    );
  }
  return <>{display(value)}</>;
}

function MetricCard({ title, value, sub }: { title: string; value: any; sub?: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">
          {title}
        </Typography>
        <Typography sx={{ mt: 0.75, fontSize: '1.35rem', fontWeight: 800, color: '#111827' }}>
          <ValueCell value={value} />
        </Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

function StatusCard({ card }: { card: any }) {
  const color = statusColors[(card.status ?? 'Warning') as Status] ?? 'warning';
  return (
    <Card sx={{ height: '100%', borderTop: '3px solid', borderTopColor: `${color}.main` }}>
      <CardContent sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Typography fontWeight={800} sx={{ fontSize: '0.9rem' }}>{card.name}</Typography>
          <Chip label={card.status} size="small" color={color} />
        </Stack>
        <Divider sx={{ my: 1.5 }} />
        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">Last Updated: <ValueCell value={card.lastUpdated} /></Typography>
          <Typography variant="caption" color="text.secondary">Latency: <ValueCell value={card.latency} /></Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function KeyValueGrid({ data }: { data: Record<string, any> }) {
  return (
    <Grid container spacing={1.5}>
      {Object.entries(data).map(([key, value]) => (
        <Grid item xs={12} sm={6} md={4} key={key}>
          <Box sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: '#FBFCFF' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
            </Typography>
            <Typography variant="body2" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
              <ValueCell value={value} />
            </Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

function DataTable({ columns, rows }: { columns: { key: string; label: string }[]; rows: any[] }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell key={col.key} sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{col.label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                No records found
              </TableCell>
            </TableRow>
          ) : rows.map((row, idx) => (
            <TableRow key={row.id ?? row.attlogId ?? idx} hover>
              {columns.map((col) => (
                <TableCell key={col.key} sx={{ whiteSpace: col.key.includes('stack') ? 'normal' : 'nowrap', maxWidth: 320 }}>
                  <ValueCell value={row[col.key]} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function AttendanceMonitoringPage() {
  const [tab, setTab] = useState(0);
  const [employeeCode, setEmployeeCode] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState('');
  const { hasPermission } = useAuthStore();
  const canView = hasPermission('ATTENDANCE:MONITORING:READ');

  const summary = useQuery({
    queryKey: ['attendance-monitoring-summary'],
    queryFn: attendanceMonitoringApi.summary,
    refetchInterval: 5000,
    enabled: canView,
  });
  const liveFeed = useQuery({
    queryKey: ['attendance-live-feed'],
    queryFn: () => attendanceMonitoringApi.liveFeed(50),
    refetchInterval: 5000,
    enabled: canView,
  });
  const performance = useQuery({
    queryKey: ['attendance-performance'],
    queryFn: attendanceMonitoringApi.performance,
    refetchInterval: 30000,
    enabled: canView,
  });
  const debugMode = useQuery({
    queryKey: ['attendance-debug-mode'],
    queryFn: attendanceMonitoringApi.debugMode,
    enabled: canView,
  });
  const trace = useQuery({
    queryKey: ['attendance-trace', selectedEmployee, date],
    queryFn: () => attendanceMonitoringApi.employeeTrace(selectedEmployee, date),
    enabled: canView && !!selectedEmployee,
  });
  const errors = useQuery({
    queryKey: ['attendance-errors', date, filter],
    queryFn: () => attendanceMonitoringApi.errors({ date, q: filter || undefined }),
    refetchInterval: 10000,
    enabled: canView,
  });
  const audit = useQuery({
    queryKey: ['attendance-audit', date, filter],
    queryFn: () => attendanceMonitoringApi.audit({ date, q: filter || undefined }),
    refetchInterval: 10000,
    enabled: canView,
  });

  const data = summary.data;
  const stats = data?.statistics ?? {};
  const chartRows = useMemo(
    () => (performance.data?.charts?.last24Hours ?? []).map((row: any) => ({
      time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      count: row.count,
    })),
    [performance.data],
  );

  if (!canView) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">You do not have permission to view Attendance Monitoring.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Attendance Monitoring"
        subtitle="Realtime diagnostics for punches, queues, rule decisions, reconciliation and audit trails."
        icon={<MonitorHeartIcon />}
        breadcrumbs={[{ label: 'Attendance' }, { label: 'Monitoring' }]}
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              summary.refetch();
              liveFeed.refetch();
              performance.refetch();
            }}
          >
            Refresh
          </Button>
        }
      />

      {summary.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : (
        <Stack spacing={2.5}>
          {data?.unavailableNotes?.map((note: string) => (
            <Alert key={note} severity="info" sx={{ borderRadius: 2 }}>{note}</Alert>
          ))}

          <Grid container spacing={2}>
            {(data?.cards ?? []).map((card: any) => (
              <Grid item xs={12} sm={6} lg={4} xl={2} key={card.name}>
                <StatusCard card={card} />
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={2}>
            {[
              ['Today Punches', stats.todaysPunches],
              ['Employees', stats.employeesProcessed],
              ['Present', stats.present],
              ['Miss Punch', stats.missPunch],
              ['NPNL', stats.npnl],
              ['Week Off', stats.weekOff],
              ['Holiday', stats.holiday],
              ['Leave', stats.leave],
              ['Manual Override', stats.manualOverride],
              ['Errors', stats.errors],
              ['Retries', stats.retries],
            ].map(([title, value]) => (
              <Grid item xs={6} md={3} xl={2} key={String(title)}>
                <MetricCard title={String(title)} value={value} />
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} lg={4}>
              <SectionCard title="Oracle Polling Monitor" icon={<StorageIcon />}>
                <KeyValueGrid data={data?.oracle ?? {}} />
              </SectionCard>
            </Grid>
            <Grid item xs={12} lg={4}>
              <SectionCard title="Queue Monitor" icon={<AccountTreeIcon />}>
                <KeyValueGrid data={data?.queue ?? {}} />
              </SectionCard>
            </Grid>
            <Grid item xs={12} lg={4}>
              <SectionCard title="Reconciliation Monitor" icon={<HistoryIcon />}>
                <KeyValueGrid data={data?.reconciliation ?? {}} />
              </SectionCard>
            </Grid>
          </Grid>

          <SectionCard
            title="Attendance Settings"
            subtitle="Debug mode follows the existing AttendanceStructuredLogger configuration."
          >
            <Stack direction="row" alignItems="center" spacing={2}>
              <Switch checked={!!debugMode.data?.enabled} disabled />
              <Box>
                <Typography fontWeight={800}>Debug Mode {debugMode.data?.mode ?? 'OFF'}</Typography>
                <Typography variant="body2" color="text.secondary">{debugMode.data?.reason}</Typography>
              </Box>
            </Stack>
          </SectionCard>

          <SectionCard title="Live Punch Feed" icon={<TimelineIcon />} noPadding>
            <DataTable
              rows={liveFeed.data ?? []}
              columns={[
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'employeeCode', label: 'Employee Code' },
                { key: 'employeeName', label: 'Employee Name' },
                { key: 'punchDirection', label: 'Direction' },
                { key: 'punchTime', label: 'Punch Time' },
                { key: 'shift', label: 'Shift' },
                { key: 'processingStage', label: 'Processing Stage' },
                { key: 'decision', label: 'Decision' },
                { key: 'attendance', label: 'Attendance' },
                { key: 'status', label: 'Status' },
              ]}
            />
          </SectionCard>

          <SectionCard title="Employee Attendance Trace" icon={<SearchIcon />}>
            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={12} sm={5}>
                <TextField
                  fullWidth
                  size="small"
                  label="Employee Code"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth size="small" type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <Button fullWidth variant="contained" startIcon={<SearchIcon />} onClick={() => setSelectedEmployee(employeeCode.trim())}>
                  Trace
                </Button>
              </Grid>
            </Grid>

            {trace.data && (
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} lg={6}>
                  <Typography fontWeight={800} sx={{ mb: 1 }}>Processing Timeline</Typography>
                  <Stack spacing={1}>
                    {trace.data.timeline?.map((item: any, idx: number) => (
                      <Box key={`${item.stage}-${idx}`} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: idx === trace.data.timeline.length - 1 ? alpha('#16A34A', 0.06) : '#fff' }}>
                        <Typography fontWeight={800} fontSize="0.85rem">{display(item.executionTime)} - {item.stage}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Duration: <ValueCell value={item.duration} /> | Decision: <ValueCell value={item.decision} /> | Exception: <ValueCell value={item.exception} />
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Grid>
                <Grid item xs={12} lg={6}>
                  <Typography fontWeight={800} sx={{ mb: 1 }}>Rule Evaluation Panel</Typography>
                  <KeyValueGrid data={trace.data.ruleEvaluation ?? {}} />
                </Grid>
              </Grid>
            )}
          </SectionCard>

          <SectionCard title="Performance Metrics" icon={<TimelineIcon />}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><MetricCard title="Average Processing" value={performance.data?.averageProcessingTime} /></Grid>
              <Grid item xs={12} md={3}><MetricCard title="Fastest" value={performance.data?.fastest} /></Grid>
              <Grid item xs={12} md={3}><MetricCard title="Slowest" value={performance.data?.slowest} /></Grid>
              <Grid item xs={12} md={3}><MetricCard title="Oracle Query Time" value={performance.data?.oracleQueryTime} /></Grid>
              <Grid item xs={12}>
                <Box sx={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRows}>
                      <XAxis dataKey="time" minTickGap={24} />
                      <YAxis allowDecimals={false} />
                      <ChartTooltip />
                      <Line type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Grid>
            </Grid>
          </SectionCard>

          <SectionCard title="Errors and Audit Viewer" icon={<ErrorOutlineIcon />}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
              <TextField size="small" type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField size="small" label="Search" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 260 }} />
            </Stack>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
              <Tab label="Errors" />
              <Tab label="Audit" />
            </Tabs>
            {tab === 0 ? (
              <DataTable
                rows={errors.data ?? []}
                columns={[
                  { key: 'timestamp', label: 'Timestamp' },
                  { key: 'employee', label: 'Employee' },
                  { key: 'module', label: 'Module' },
                  { key: 'exception', label: 'Exception' },
                  { key: 'stackTrace', label: 'Stack Trace' },
                  { key: 'retryStatus', label: 'Retry Status' },
                  { key: 'resolved', label: 'Resolved' },
                ]}
              />
            ) : (
              <DataTable
                rows={audit.data ?? []}
                columns={[
                  { key: 'timestamp', label: 'Timestamp' },
                  { key: 'employeeCode', label: 'Employee' },
                  { key: 'oldStatus', label: 'Old Value' },
                  { key: 'newStatus', label: 'New Value' },
                  { key: 'reason', label: 'Reason' },
                  { key: 'updatedBy', label: 'Updated By' },
                  { key: 'source', label: 'Source' },
                ]}
              />
            )}
          </SectionCard>
        </Stack>
      )}
    </Box>
  );
}
