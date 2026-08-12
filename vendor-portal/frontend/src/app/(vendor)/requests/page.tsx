'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
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
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import InboxIcon from '@mui/icons-material/Inbox';
import { vendorApi, MODULE_LABELS } from '@/lib/api/vendor.api';

const STATUS_PROPS = {
  PENDING:  { label: 'Pending',  color: 'warning' },
  APPROVED: { label: 'Approved', color: 'success' },
  REJECTED: { label: 'Rejected', color: 'error'   },
} as const;

export default function RequestsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<string>('PENDING');

  const { data, isLoading, error } = useQuery({
    queryKey: ['requests', filter],
    queryFn:  () => vendorApi.getRequests(filter || undefined),
    refetchInterval: 15_000,
  });

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        icon={<InboxIcon color="primary" />}
        title="License Requests"
        actions={
          <ToggleButtonGroup size="small" value={filter}
            exclusive onChange={(_, v) => v && setFilter(v)}>
            <ToggleButton value="PENDING">Pending</ToggleButton>
            <ToggleButton value="APPROVED">Approved</ToggleButton>
            <ToggleButton value="REJECTED">Rejected</ToggleButton>
          </ToggleButtonGroup>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load requests</Alert>}

      <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <ResponsiveTable minWidth={900}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell><b>Hospital</b></TableCell>
              <TableCell><b>Submitted</b></TableCell>
              <TableCell><b>Requested Modules</b></TableCell>
              <TableCell><b>Currently Has</b></TableCell>
              <TableCell><b>Trial?</b></TableCell>
              <TableCell><b>Remarks</b></TableCell>
              <TableCell><b>Status</b></TableCell>
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
              : data?.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.disabled' }}>
                    No {filter.toLowerCase()} requests
                  </TableCell>
                </TableRow>
              )
              : data?.map(req => {
                const sp = STATUS_PROPS[req.status];
                return (
                  <TableRow key={req.id} hover sx={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/requests/${req.id}`)}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{req.hospital.hospitalName}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {req.hospital.hospitalCode}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{new Date(req.submittedAt).toLocaleDateString()}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(req.submittedAt).toLocaleTimeString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {req.requestedModules.map(m => (
                          <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" color="primary" variant="outlined" />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {req.currentModules.map(m => (
                          <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {req.isTrial
                        ? <Chip label="Trial" size="small" color="warning" />
                        : <Typography variant="body2" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 180 }}>
                        {req.remarks ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={sp.label} color={sp.color} size="small" />
                    </TableCell>
                  </TableRow>
                );
              })
            }
          </TableBody>
        </Table>
        </ResponsiveTable>
      </Card>
    </Box>
  );
}
