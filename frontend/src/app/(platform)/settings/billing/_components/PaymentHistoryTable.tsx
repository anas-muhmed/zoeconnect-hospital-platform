'use client';

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';
import type { Payment, PaymentStatus } from '@/lib/api/billing.api';

export interface PaymentHistoryTableProps {
  payments: Payment[];
  loading?: boolean;
}

const STATUS_COLOR: Record<PaymentStatus, 'success' | 'warning' | 'error' | 'default'> = {
  SUCCESS: 'success',
  PENDING: 'warning',
  CREATED: 'default',
  FAILED: 'error',
};

const currency = (n: number, ccy: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(n);

export default function PaymentHistoryTable({ payments, loading }: PaymentHistoryTableProps) {
  const theme = useTheme();

  return (
    <Paper elevation={0} sx={{ borderRadius: 4, p: 3, border: `1px solid ${theme.palette.divider}` }}>
      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>Payment History</Typography>

      {loading ? (
        <Typography variant="body2" color="text.secondary">Loading payment history...</Typography>
      ) : payments.length === 0 ? (
        <Box sx={{ py: 2 }}>
          <Typography variant="body2" color="text.secondary">No payment attempts yet.</Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Reference ID</TableCell>
                <TableCell align="right">Status</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{new Date(p.paidAt ?? p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</TableCell>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{p.provider}</TableCell>
                  <TableCell align="right">{currency(p.amount, p.currency)}</TableCell>
                  <TableCell>
                    <Tooltip title={p.id}>
                      <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                        {p.id.slice(0, 8).toUpperCase()}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Chip size="small" label={p.status} color={STATUS_COLOR[p.status]} sx={{ fontWeight: 600, fontSize: 11 }} />
                  </TableCell>
                  <TableCell align="right">
                    {p.status === 'FAILED' && (
                      <Button
                        component={Link}
                        href="/settings/billing/subscribe"
                        size="small"
                        variant="outlined"
                        color="error"
                        sx={{ fontWeight: 700, borderRadius: 2 }}
                      >
                        Retry
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
