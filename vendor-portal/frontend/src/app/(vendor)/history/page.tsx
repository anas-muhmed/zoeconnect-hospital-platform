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
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { vendorApi, MODULE_LABELS } from '@/lib/api/vendor.api';

const LICENSE_STATUS: Record<string, { label: string; color: 'success' | 'error' | 'default' | 'warning'; icon: React.ReactNode }> = {
  ACTIVE:  { label: 'Active',   color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
  REVOKED: { label: 'Revoked',  color: 'error',   icon: <CancelIcon fontSize="small" /> },
  EXPIRED: { label: 'Expired',  color: 'default',  icon: <AccessTimeIcon fontSize="small" /> },
};

const LICENSE_TYPE: Record<string, string> = {
  MODULE_LICENSE:  'Module License',
  TRIAL_EXTENSION: 'Trial Extension',
  PERPETUAL:       'Perpetual',
};

export default function LicenseHistoryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['licenses-history'],
    queryFn:  vendorApi.getLicenseHistory,
    refetchInterval: 30_000,
  });

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        icon={<HistoryIcon color="primary" />}
        title="License History"
        subtitle="All issued licenses across all hospitals — active, revoked, and expired"
        actions={data && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            {(['ACTIVE', 'REVOKED', 'EXPIRED'] as const).map(s => {
              const count = data.filter(l => l.status === s).length;
              if (!count) return null;
              const meta = LICENSE_STATUS[s];
              return (
                <Chip
                  key={s}
                  label={`${count} ${meta.label}`}
                  color={meta.color}
                  size="small"
                  variant="outlined"
                />
              );
            })}
          </Box>
        )}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load license history</Alert>}

      <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <ResponsiveTable minWidth={1100}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell><b>Hospital</b></TableCell>
              <TableCell><b>License Type</b></TableCell>
              <TableCell><b>Licensed Modules</b></TableCell>
              <TableCell><b>Max Users</b></TableCell>
              <TableCell><b>Machine Locked</b></TableCell>
              <TableCell><b>Expires</b></TableCell>
              <TableCell><b>Issued</b></TableCell>
              <TableCell><b>Status</b></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              : !data?.length
              ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.disabled' }}>
                    No license history found
                  </TableCell>
                </TableRow>
              )
              : data.map(license => {
                  const meta = LICENSE_STATUS[license.status] ?? LICENSE_STATUS.EXPIRED;
                  return (
                    <TableRow key={license.id} hover
                      sx={{ opacity: license.status !== 'ACTIVE' ? 0.75 : 1 }}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {license.hospital?.hospitalName ?? '–'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {license.hospital?.hospitalCode}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={LICENSE_TYPE[license.licenseType] ?? license.licenseType}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {license.licensedModules.map(m => (
                            <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>{license.maxUsers}</TableCell>
                      <TableCell>
                        {license.machineLocked
                          ? <Chip label="Yes" size="small" color="warning" variant="outlined" />
                          : <Typography variant="body2" color="text.disabled">No</Typography>}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {license.expiresAt
                          ? new Date(license.expiresAt).toLocaleDateString()
                          : <Chip label="Perpetual" size="small" variant="outlined" />}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {new Date(license.issuedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={meta.label}
                          color={meta.color}
                          size="small"
                          icon={meta.icon as any}
                        />
                        {license.revokedAt && (
                          <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.5 }}>
                            Revoked {new Date(license.revokedAt).toLocaleDateString()}
                            {license.revokeReason ? ` — ${license.revokeReason}` : ''}
                          </Typography>
                        )}
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
