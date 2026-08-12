'use client';

/**
 * Admin management of complaints raised by patients on the public
 * portal's "we're sorry, tell us more" screen (only shown after a
 * low-rated submission -- the flip side of the Google Review prompt shown
 * for high-rated ones). There's no "create" here; every row originates
 * from a patient opting in on the public portal.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Badge from '@mui/material/Badge';
import Popover from '@mui/material/Popover';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import VisibilityIcon from '@mui/icons-material/Visibility';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

type ComplaintStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

interface Complaint {
  id: string;
  submissionId: string;
  formId: string;
  campaignId: string;
  category: string;
  description: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: ComplaintStatus;
  assignedTo: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const STATUS_COLOR: Record<ComplaintStatus, 'default' | 'warning' | 'info' | 'success'> = {
  NEW: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  CLOSED: 'default',
};

interface FeedbackNotification {
  id: string;
  type: 'NEW_COMPLAINT';
  complaintId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

/** Bell + unread badge + a dropdown list -- self-contained since there's no platform-wide notification bell to hook into (see FeedbackModule's doc comment). Lives on this page rather than the global app bar to keep the blast radius scoped to this module. */
function NotificationBell() {
  const queryClient = useQueryClient();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ['feedback-notifications-unread-count'],
    queryFn: () => apiClient.get('/feedback/notifications/unread-count').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: notifications = [] } = useQuery<FeedbackNotification[]>({
    queryKey: ['feedback-notifications'],
    queryFn: () => apiClient.get('/feedback/notifications').then(r => r.data),
    enabled: !!anchorEl,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['feedback-notifications'] });
    queryClient.invalidateQueries({ queryKey: ['feedback-notifications-unread-count'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/feedback/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.patch('/feedback/notifications/read-all'),
    onSuccess: invalidate,
  });

  return (
    <>
      <IconButton onClick={e => setAnchorEl(e.currentTarget)}>
        <Badge badgeContent={unread?.count ?? 0} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Popover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 360, maxHeight: 420, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, pb: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
            {(unread?.count ?? 0) > 0 && (
              <Button size="small" onClick={() => markAllReadMutation.mutate()}>Mark all read</Button>
            )}
          </Box>
          {notifications.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              Nothing here yet.
            </Typography>
          )}
          <List dense disablePadding>
            {notifications.map(n => (
              <ListItemButton
                key={n.id}
                selected={!n.isRead}
                onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
                sx={{ alignItems: 'flex-start' }}
              >
                <ListItemText
                  primary={n.message}
                  secondary={new Date(n.createdAt).toLocaleString()}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: n.isRead ? 400 : 600 }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Popover>
    </>
  );
}

export default function FeedbackComplaintsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'ALL'>('ALL');
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [editStatus, setEditStatus] = useState<ComplaintStatus>('NEW');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saveError, setSaveError] = useState('');

  const { data: complaints = [], isLoading } = useQuery<Complaint[]>({
    queryKey: ['feedback-complaints', statusFilter],
    queryFn: () => apiClient.get('/feedback/complaints', {
      params: statusFilter === 'ALL' ? {} : { status: statusFilter },
    }).then(r => r.data),
  });

  const openDetail = (c: Complaint) => {
    setSelected(c);
    setEditStatus(c.status);
    setEditAssignedTo(c.assignedTo ?? '');
    setEditNotes(c.resolutionNotes ?? '');
    setSaveError('');
  };

  const saveMutation = useMutation({
    mutationFn: () => apiClient.patch(`/feedback/complaints/${selected!.id}`, {
      status: editStatus,
      assignedTo: editAssignedTo || undefined,
      resolutionNotes: editNotes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-complaints'] });
      setSelected(null);
    },
    onError: (e: any) => setSaveError(e?.response?.data?.message ?? 'Failed to update complaint'),
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading complaints...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography variant="h5" fontWeight={700}>Feedback Complaints</Typography>
        <NotificationBell />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Raised by patients who opted in after a low-rated submission on the public portal. Nothing here was
        auto-generated -- every complaint is something a patient chose to tell you.
      </Typography>

      <ToggleButtonGroup
        size="small" exclusive value={statusFilter}
        onChange={(_, v) => v !== null && setStatusFilter(v)}
        sx={{ mb: 3 }}
      >
        <ToggleButton value="ALL">All</ToggleButton>
        <ToggleButton value="NEW">New</ToggleButton>
        <ToggleButton value="IN_PROGRESS">In Progress</ToggleButton>
        <ToggleButton value="RESOLVED">Resolved</ToggleButton>
        <ToggleButton value="CLOSED">Closed</ToggleButton>
      </ToggleButtonGroup>

      {complaints.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No complaints in this view.</Typography>
        </Paper>
      )}

      {complaints.map(c => (
        <Paper key={c.id} sx={{ p: 2.5, mb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Chip size="small" label={c.category} />
                <Chip size="small" color={STATUS_COLOR[c.status]} label={c.status.replace('_', ' ')} />
                {c.assignedTo && <Chip size="small" variant="outlined" label={`Assigned: ${c.assignedTo}`} />}
              </Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>{c.description}</Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(c.createdAt).toLocaleString()}
                {c.contactName || c.contactPhone || c.contactEmail
                  ? ` -- Contact: ${[c.contactName, c.contactPhone, c.contactEmail].filter(Boolean).join(', ')}`
                  : ' -- No contact info provided'}
              </Typography>
            </Box>
            <Tooltip title="View / update">
              <IconButton size="small" onClick={() => openDetail(c)} aria-label="View / update">
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Paper>
      ))}

      <ResponsiveDialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Complaint Detail</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {selected && (
            <>
              <Box>
                <Typography variant="caption" color="text.secondary">{selected.category} -- {new Date(selected.createdAt).toLocaleString()}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>{selected.description}</Typography>
              </Box>
              {(selected.contactName || selected.contactPhone || selected.contactEmail) && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  Wants follow-up -- {[selected.contactName, selected.contactPhone, selected.contactEmail].filter(Boolean).join(', ')}
                </Alert>
              )}
              <TextField
                select label="Status" value={editStatus}
                onChange={e => setEditStatus(e.target.value as ComplaintStatus)}
                fullWidth
              >
                <MenuItem value="NEW">New</MenuItem>
                <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                <MenuItem value="RESOLVED">Resolved</MenuItem>
                <MenuItem value="CLOSED">Closed</MenuItem>
              </TextField>
              <TextField
                label="Assigned to (staff name/id)"
                value={editAssignedTo}
                onChange={e => setEditAssignedTo(e.target.value)}
                fullWidth
              />
              <TextField
                label="Resolution notes"
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                multiline minRows={3}
                fullWidth
              />
              {saveError && <Alert severity="error">{saveError}</Alert>}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
