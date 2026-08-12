'use client';

import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import PageHeader from '@/components/PageHeader';
import ResponsiveTable from '@/components/ResponsiveTable';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { vendorApi, MODULE_LABELS } from '@/lib/api/vendor.api';

const WEBHOOK_STATUS: Record<string, { label: string; color: 'success' | 'error' | 'warning'; icon: React.ReactNode }> = {
  DELIVERED: { label: 'Delivered', color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
  FAILED:    { label: 'Failed',    color: 'error',   icon: <ErrorIcon fontSize="small" /> },
  PENDING:   { label: 'Pending',   color: 'warning', icon: <HourglassEmptyIcon fontSize="small" /> },
};

export default function TransactionLogPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['revocations'],
    queryFn:  vendorApi.getRevocations,
    refetchInterval: 15_000,
  });

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        icon={<ReceiptLongIcon color="primary" />}
        title="Transaction Log"
        subtitle="All revocation events and webhook delivery statuses"
        actions={data && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            {(['DELIVERED', 'FAILED', 'PENDING'] as const).map(s => {
              const count = data.filter(r => r.webhookStatus === s).length;
              if (!count) return null;
              const meta = WEBHOOK_STATUS[s];
              return (
                <Chip key={s} label={`${count} ${meta.label}`}
                  color={meta.color} size="small" variant="outlined" />
              );
            })}
          </Box>
        )}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load transaction log</Alert>}

      <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <ResponsiveTable minWidth={1000}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell><b>Date & Time</b></TableCell>
              <TableCell><b>Hospital</b></TableCell>
              <TableCell><b>Event Type</b></TableCell>
              <TableCell><b>Modules Affected</b></TableCell>
              <TableCell><b>Reason</b></TableCell>
              <TableCell><b>Force Logout</b></TableCell>
              <TableCell><b>Webhook</b></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              : !data?.length
              ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.disabled' }}>
                    No revocation events recorded
                  </TableCell>
                </TableRow>
              )
              : data.map(rev => {
                  const wh = WEBHOOK_STATUS[rev.webhookStatus] ?? WEBHOOK_STATUS.PENDING;
                  return (
                    <TableRow key={rev.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {new Date(rev.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {rev.hospital?.hospitalName ?? '–'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {rev.hospital?.hospitalCode}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={rev.revocationType === 'FULL' ? 'Full Revocation' : 'Module Revocation'}
                          color={rev.revocationType === 'FULL' ? 'error' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {rev.revocationType === 'FULL'
                          ? <Typography variant="body2" color="error.main">All modules</Typography>
                          : (
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              {rev.modules?.map(m => (
                                <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" color="warning" variant="outlined" />
                              )) ?? '–'}
                            </Box>
                          )}
                      </TableCell>
                      <TableCell>
                        <Tooltip title={rev.reason}>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                            {rev.reason}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {rev.forceLogout
                          ? <Chip label="Yes" size="small" color="error" variant="outlined" />
                          : <Typography variant="body2" color="text.disabled">No</Typography>}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={wh.label}
                          color={wh.color}
                          size="small"
                          icon={wh.icon as any}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
        </ResponsiveTable>
      </Card>
    </Box>
  );
}
