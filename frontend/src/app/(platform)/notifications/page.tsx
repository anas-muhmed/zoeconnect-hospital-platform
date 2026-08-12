'use client';

import React, { useState } from 'react';
import {
  Box, Typography, Stack, Chip, IconButton, Tooltip, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, CircularProgress, Alert, TextField, MenuItem, Tabs, Tab,
  DialogTitle, DialogContent, DialogActions, Divider,
  Pagination,
} from '@mui/material';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import {
  Refresh as RefreshIcon,
  Replay as ResendIcon,
  InfoOutlined as InfoIcon,
  NotificationsNone as NotifIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/PageHeader';
import {
  notificationApi, NotificationLog, NotificationTemplate,
  NotificationStatus, NotificationChannel, NotificationEventType,
  LogFilters,
} from '@/lib/api/notification.api';
import { format, parseISO } from 'date-fns';

// ── constants ─────────────────────────────────────────────────────────────────
const CHANNELS: NotificationChannel[]   = ['WHATSAPP', 'SMS', 'EMAIL'];
const STATUSES: NotificationStatus[]    = ['PENDING', 'SENT', 'FAILED', 'DELIVERED'];
const EVENT_LABELS: Record<NotificationEventType, string> = {
  WELCOME:                'Welcome',
  EARN_POINTS:            'Points Earned',
  REDEEM_POINTS:          'Points Redeemed',
  BIRTHDAY_BONUS:         'Birthday Bonus',
  CAMPAIGN_BONUS:         'Campaign Bonus',
  TIER_UPGRADE:           'Tier Upgrade',
  ACCOUNT_EXPIRY_WARNING: 'Expiry Warning',
  CUSTOM:                 'Custom',
};

const STATUS_COLOR: Record<NotificationStatus, 'default' | 'success' | 'error' | 'info' | 'warning'> = {
  PENDING:   'warning',
  SENT:      'success',
  FAILED:    'error',
  DELIVERED: 'info',
};

const CHANNEL_ICON: Record<NotificationChannel, string> = {
  WHATSAPP: '📱',
  SMS:      '💬',
  EMAIL:    '✉️',
};

function fmtDate(d: string) {
  try { return format(parseISO(d), 'dd MMM yyyy, HH:mm'); } catch { return d; }
}

// ── Log Detail Dialog ─────────────────────────────────────────────────────────
function LogDetailDialog({ log, onClose }: { log: NotificationLog | null; onClose: () => void }) {
  return (
    <ResponsiveDialog open={!!log} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Notification Detail</DialogTitle>
      {log && (
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {[
              ['ID',             log.id],
              ['Phone',          log.phone],
              ['Channel',        `${CHANNEL_ICON[log.channel]} ${log.channel}`],
              ['Event',          EVENT_LABELS[log.eventType] ?? log.eventType],
              ['Template',       log.templateName],
              ['Language',       log.languageCode],
              ['Parameters',     log.templateParams.join(' | ') || '—'],
              ['Status',         log.status],
              ['Provider MsgID', log.providerMessageId ?? '—'],
              ['Attempts',       String(log.attempts)],
              ['Error',          log.errorMessage ?? '—'],
              ['Loyalty Acct',   log.loyaltyAccountId ?? '—'],
              ['MRN',            log.mrn ?? '—'],
              ['Sent At',        fmtDate(log.createdAt)],
              ['Updated At',     fmtDate(log.updatedAt)],
            ].map(([label, value]) => (
              <Box key={label}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{value}</Typography>
              </Box>
            ))}

            {log.metadata && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary">Metadata</Typography>
                  <Box
                    component="pre"
                    sx={{ fontSize: 11, bgcolor: 'action.hover', p: 1, borderRadius: 1, overflow: 'auto' }}
                  >
                    {JSON.stringify(log.metadata, null, 2)}
                  </Box>
                </Box>
              </>
            )}
          </Stack>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Template Dialog ───────────────────────────────────────────────────────────
function TemplateDialog({
  tmpl, onClose,
}: { tmpl: NotificationTemplate | null; onClose: () => void }) {
  return (
    <ResponsiveDialog open={!!tmpl} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Template: {tmpl?.name}</DialogTitle>
      {tmpl && (
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {[
              ['Event Type',    EVENT_LABELS[tmpl.eventType] ?? tmpl.eventType],
              ['Channel',       `${CHANNEL_ICON[tmpl.channel]} ${tmpl.channel}`],
              ['Template Name', tmpl.templateName],
              ['Language',      tmpl.languageCode],
              ['Active',        tmpl.isActive ? 'Yes' : 'No'],
            ].map(([label, value]) => (
              <Box key={label}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="body2">{value}</Typography>
              </Box>
            ))}

            {tmpl.paramDescriptions.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">Parameters</Typography>
                {tmpl.paramDescriptions.map((p, i) => (
                  <Typography key={i} variant="body2">{`{{${i + 1}}} — ${p}`}</Typography>
                ))}
              </Box>
            )}

            {tmpl.bodyPreview && (
              <Box>
                <Typography variant="caption" color="text.secondary">Body Preview</Typography>
                <Box
                  sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1, borderLeft: '3px solid', borderColor: 'primary.main' }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{tmpl.bodyPreview}</Typography>
                </Box>
              </Box>
            )}
          </Stack>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────
function LogsTab() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<LogFilters>({ page: 1, limit: 20 });
  const [detailLog, setDetailLog] = useState<NotificationLog | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notification-logs', filters],
    queryFn:  () => notificationApi.getLogs(filters),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => notificationApi.resend(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notification-logs'] }),
  });

  function setFilter(key: keyof LogFilters, value: string | number | undefined) {
    setFilters(f => ({ ...f, [key]: value || undefined, page: 1 }));
  }

  const logs  = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / (filters.limit ?? 20));

  return (
    <Box>
      {/* Filters */}
      <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap">
        <TextField
          select label="Status" size="small" sx={{ minWidth: 130 }}
          value={filters.status ?? ''}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <MenuItem value="">All statuses</MenuItem>
          {STATUSES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>

        <TextField
          select label="Channel" size="small" sx={{ minWidth: 130 }}
          value={filters.channel ?? ''}
          onChange={(e) => setFilter('channel', e.target.value)}
        >
          <MenuItem value="">All channels</MenuItem>
          {CHANNELS.map(c => <MenuItem key={c} value={c}>{CHANNEL_ICON[c]} {c}</MenuItem>)}
        </TextField>

        <TextField
          label="Phone" size="small" placeholder="+91..."
          value={filters.phone ?? ''}
          onChange={(e) => setFilter('phone', e.target.value)}
          sx={{ minWidth: 160 }}
        />

        <Tooltip title="Refresh">
          <IconButton onClick={() => refetch()} size="small" aria-label="Refresh">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Summary */}
      {data && (
        <Typography variant="body2" color="text.secondary" mb={1}>
          Showing {logs.length} of {total} notifications
        </Typography>
      )}

      {isLoading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : isError ? (
        <Alert severity="error" action={<Button size="small" onClick={() => refetch()}>Retry</Button>}>
          Failed to load notification logs
        </Alert>
      ) : logs.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 6, textAlign: 'center' }}>
          <NotifIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No notifications found</Typography>
        </Paper>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Phone</strong></TableCell>
                  <TableCell><strong>Channel</strong></TableCell>
                  <TableCell><strong>Event</strong></TableCell>
                  <TableCell><strong>Template</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell align="right"><strong>Attempts</strong></TableCell>
                  <TableCell><strong>Sent At</strong></TableCell>
                  <TableCell align="center"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">{log.phone}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{CHANNEL_ICON[log.channel]} {log.channel}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{EVENT_LABELS[log.eventType] ?? log.eventType}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{log.templateName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.status}
                        color={STATUS_COLOR[log.status]}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{log.attempts}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {fmtDate(log.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" justifyContent="center" spacing={0.5}>
                        <Tooltip title="View details">
                          <IconButton size="small" onClick={() => setDetailLog(log)} aria-label="View details">
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {log.status === 'FAILED' && (
                          <Tooltip title="Resend">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => resendMutation.mutate(log.id)}
                              disabled={resendMutation.isPending}
                             aria-label="Resend">
                              <ResendIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {pages > 1 && (
            <Box display="flex" justifyContent="center" mt={2}>
              <Pagination
                count={pages}
                page={filters.page ?? 1}
                onChange={(_, p) => setFilters(f => ({ ...f, page: p }))}
                color="primary"
              />
            </Box>
          )}
        </>
      )}

      <LogDetailDialog log={detailLog} onClose={() => setDetailLog(null)} />
    </Box>
  );
}

// ── Templates Tab ─────────────────────────────────────────────────────────────
function TemplatesTab() {
  const [selected, setSelected] = useState<NotificationTemplate | null>(null);

  const { data: templates = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['notification-templates'],
    queryFn:  () => notificationApi.getTemplates(),
  });

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" mb={2}>
        <Tooltip title="Refresh">
          <IconButton onClick={() => refetch()} size="small" aria-label="Refresh"><RefreshIcon /></IconButton>
        </Tooltip>
      </Stack>

      {isLoading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : isError ? (
        <Alert severity="error" action={<Button size="small" onClick={() => refetch()}>Retry</Button>}>
          Failed to load templates
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Event Type</strong></TableCell>
                <TableCell><strong>Channel</strong></TableCell>
                <TableCell><strong>Template Name</strong></TableCell>
                <TableCell><strong>Language</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="center"><strong>Details</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map(t => (
                <TableRow key={t.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{t.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{EVENT_LABELS[t.eventType] ?? t.eventType}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{CHANNEL_ICON[t.channel]} {t.channel}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" fontFamily="monospace">
                      {t.templateName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{t.languageCode}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t.isActive ? 'Active' : 'Inactive'}
                      color={t.isActive ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="View template">
                      <IconButton size="small" onClick={() => setSelected(t)} aria-label="View template">
                        <InfoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <TemplateDialog tmpl={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Notifications"
        subtitle="WhatsApp · SMS · Email notification log and template management"
        icon={<NotifIcon />}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Notification Log" />
          <Tab label="Templates" />
        </Tabs>
      </Box>

      {tab === 0 && <LogsTab />}
      {tab === 1 && <TemplatesTab />}
    </Box>
  );
}
