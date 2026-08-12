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
import VerifiedIcon from '@mui/icons-material/Verified';
import LockIcon from '@mui/icons-material/Lock';
import { vendorApi, MODULE_LABELS } from '@/lib/api/vendor.api';

const LICENSE_TYPE_LABELS: Record<string, string> = {
  TRIAL_EXTENSION: 'Extended Trial',
  MODULE_LICENSE:  'Module License',
  PERPETUAL:       'Perpetual',
};

function daysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

export default function LicensesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['active-licenses'],
    queryFn:  vendorApi.getActiveLicenses,
    refetchInterval: 30_000,
  });

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        icon={<VerifiedIcon color="primary" />}
        title="Active Licenses"
        actions={data && (
          <Chip label={`${data.length} active`} color="success" size="small" />
        )}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load licenses</Alert>}

      <Card elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        <ResponsiveTable minWidth={1100}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell><b>Hospital</b></TableCell>
              <TableCell><b>Type</b></TableCell>
              <TableCell><b>Licensed Modules</b></TableCell>
              <TableCell><b>Max Users</b></TableCell>
              <TableCell><b>Expiry</b></TableCell>
              <TableCell><b>Machine Locked</b></TableCell>
              <TableCell><b>Issued</b></TableCell>
              <TableCell><b>Status</b></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}
                  </TableRow>
                ))
              : data?.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.disabled' }}>
                    No active licenses
                  </TableCell>
                </TableRow>
              )
              : data?.map(lic => {
                  const days   = daysRemaining(lic.expiresAt);
                  const expiry = lic.expiresAt
                    ? `${new Date(lic.expiresAt).toLocaleDateString()} (${days}d)`
                    : 'Perpetual';
                  const expiryColor = days === null ? 'default'
                    : days <= 7 ? 'error' : days <= 30 ? 'warning' : 'default';

                  return (
                    <TableRow key={lic.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{lic.hospital.hospitalName}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {lic.hospital.hospitalCode}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={LICENSE_TYPE_LABELS[lic.licenseType] ?? lic.licenseType}
                          size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {lic.licensedModules.map(m => (
                            <Chip key={m} label={MODULE_LABELS[m] ?? m} size="small" />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>{lic.maxUsers}</TableCell>
                      <TableCell>
                        <Chip label={expiry} size="small"
                          color={expiryColor as any}
                          variant={expiryColor !== 'default' ? 'filled' : 'outlined'} />
                      </TableCell>
                      <TableCell>
                        {lic.machineLocked
                          ? <Tooltip title={lic.hospital.machineFingerprint}>
                              <Chip icon={<LockIcon />} label="Locked" size="small" color="info" />
                            </Tooltip>
                          : <Typography variant="body2" color="text.disabled">Any</Typography>}
                      </TableCell>
                      <TableCell>{new Date(lic.issuedAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Chip label={lic.status} size="small"
                          color={lic.status === 'ACTIVE' ? 'success' : lic.status === 'EXPIRED' ? 'warning' : 'error'} />
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
