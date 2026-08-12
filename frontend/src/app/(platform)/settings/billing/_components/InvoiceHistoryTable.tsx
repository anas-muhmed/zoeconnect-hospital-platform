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
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import type { Invoice } from '@/lib/api/billing.api';

export interface InvoiceHistoryTableProps {
  invoices: Invoice[];
  loading?: boolean;
}

const currency = (n: number, ccy: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(n);

const dateLabel = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Renders a printable receipt entirely client-side (from data already
 * fetched via GET /billing/invoices) and opens the browser's print
 * dialog, where "Save as PDF" produces the download -- billing has no
 * server-side PDF generation endpoint, and this refactor is frontend-only
 * (no backend changes), so this is the honest way to offer a "Download
 * PDF" action without inventing an API that doesn't exist.
 */
function downloadInvoice(invoice: Invoice) {
  const receiptWindow = window.open('', '_blank', 'width=640,height=800');
  if (!receiptWindow) return;
  receiptWindow.document.write(`
    <html>
      <head>
        <title>${invoice.invoiceNumber}</title>
        <style>
          body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; padding: 48px; color: #111827; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .muted { color: #6b7280; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 32px; }
          td { padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
          td:last-child { text-align: right; font-weight: 600; }
          .total td { font-size: 16px; font-weight: 800; border-bottom: none; border-top: 2px solid #111827; padding-top: 16px; }
        </style>
      </head>
      <body>
        <h1>ZoeConnect</h1>
        <div class="muted">Invoice ${invoice.invoiceNumber}</div>
        <div class="muted">Issued ${dateLabel(invoice.issuedAt)} · Status: ${invoice.status}</div>
        <table>
          <tr><td>Subscription charge</td><td>${currency(invoice.amount - invoice.tax, invoice.currency)}</td></tr>
          <tr><td>Tax</td><td>${currency(invoice.tax, invoice.currency)}</td></tr>
          <tr class="total"><td>Total</td><td>${currency(invoice.amount, invoice.currency)}</td></tr>
        </table>
      </body>
    </html>
  `);
  receiptWindow.document.close();
  receiptWindow.focus();
  receiptWindow.print();
}

export default function InvoiceHistoryTable({ invoices, loading }: InvoiceHistoryTableProps) {
  const theme = useTheme();

  return (
    <Paper elevation={0} sx={{ borderRadius: 4, p: 3, border: `1px solid ${theme.palette.divider}` }}>
      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 2 }}>Invoices</Typography>

      {loading ? (
        <Typography variant="body2" color="text.secondary">Loading invoices...</Typography>
      ) : invoices.length === 0 ? (
        <Box sx={{ py: 2 }}>
          <Typography variant="body2" color="text.secondary">No invoices yet.</Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Invoice #</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Status</TableCell>
                <TableCell align="right">PDF</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{inv.invoiceNumber}</TableCell>
                  <TableCell>{dateLabel(inv.issuedAt)}</TableCell>
                  <TableCell align="right">{currency(inv.amount, inv.currency)}</TableCell>
                  <TableCell align="right">
                    <Chip size="small" label={inv.status} sx={{ fontWeight: 600, fontSize: 11 }} />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Download / Print PDF">
                      <IconButton size="small" onClick={() => downloadInvoice(inv)} aria-label={`Download invoice ${inv.invoiceNumber}`}>
                        <DownloadRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
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
