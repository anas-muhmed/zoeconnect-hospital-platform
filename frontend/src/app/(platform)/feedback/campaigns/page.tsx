'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import StarIcon from '@mui/icons-material/Star';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface FeedbackCampaign {
  id: string;
  formId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  googleReviewEnabled: boolean;
  googleReviewUrl: string | null;
  googleReviewThreshold: number;
  googleReviewThankYouMessage: string | null;
  googleReviewInvitationMessage: string | null;
}

interface FeedbackForm {
  id: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

const emptyDto = {
  name: '', formId: '', description: '',
  googleReviewEnabled: false,
  googleReviewUrl: '',
  googleReviewThreshold: 4,
  googleReviewThankYouMessage: '',
  googleReviewInvitationMessage: '',
};

export default function FeedbackCampaignsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeedbackCampaign | null>(null);
  const [dto, setDto] = useState(emptyDto);
  const [formError, setFormError] = useState('');

  const { data: campaigns = [], isLoading } = useQuery<FeedbackCampaign[]>({
    queryKey: ['feedback-campaigns'],
    queryFn: () => apiClient.get('/feedback/campaigns').then(r => r.data),
  });

  const { data: forms = [] } = useQuery<FeedbackForm[]>({
    queryKey: ['feedback-forms'],
    queryFn: () => apiClient.get('/feedback/forms').then(r => r.data),
  });
  const publishableForms = forms.filter(f => f.status !== 'ARCHIVED');
  const formName = (id: string) => forms.find(f => f.id === id)?.name ?? 'Unknown form';

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['feedback-campaigns'] });

  const openCreate = () => { setEditing(null); setDto(emptyDto); setFormError(''); setDialogOpen(true); };
  const openEdit = (c: FeedbackCampaign) => {
    setEditing(c);
    setDto({
      name: c.name, formId: c.formId, description: c.description ?? '',
      googleReviewEnabled: c.googleReviewEnabled ?? false,
      googleReviewUrl: c.googleReviewUrl ?? '',
      googleReviewThreshold: c.googleReviewThreshold ?? 4,
      googleReviewThankYouMessage: c.googleReviewThankYouMessage ?? '',
      googleReviewInvitationMessage: c.googleReviewInvitationMessage ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      // googleReviewUrl is validated with @IsUrl on the backend, which (unlike most
      // decorators) does NOT treat '' as "skip" the way @IsOptional does for
      // undefined/null -- so an empty string here would 400. Omit it instead.
      const payload = {
        ...dto,
        googleReviewUrl: dto.googleReviewUrl.trim() || undefined,
        googleReviewThankYouMessage: dto.googleReviewThankYouMessage.trim() || undefined,
        googleReviewInvitationMessage: dto.googleReviewInvitationMessage.trim() || undefined,
      };
      return editing
        ? apiClient.patch(`/feedback/campaigns/${editing.id}`, payload)
        : apiClient.post('/feedback/campaigns', payload);
    },
    onSuccess: () => { invalidate(); setDialogOpen(false); },
    onError: (e: any) => setFormError(e?.response?.data?.message ?? 'Failed to save campaign'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/feedback/campaigns/${id}`, { isActive }),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/feedback/campaigns/${id}`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Failed to delete campaign'),
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading campaigns...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Feedback Campaigns</Typography>
          <Typography variant="body2" color="text.secondary">
            A campaign is a named purpose (e.g. "Reception Survey") bound to a form. QR codes point at a campaign,
            so you can swap which form it collects against without reprinting anything.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New Campaign
        </Button>
      </Box>

      {campaigns.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No campaigns yet. Create one and bind it to a published form.</Typography>
        </Paper>
      )}

      {campaigns.map(c => (
        <Paper key={c.id} sx={{ p: 3, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography fontWeight={700} variant="h6">{c.name}</Typography>
                <Chip size="small" label={c.isActive ? 'Active' : 'Inactive'} color={c.isActive ? 'success' : 'default'} />
                {c.googleReviewEnabled && c.googleReviewUrl && (
                  <Chip size="small" icon={<StarIcon fontSize="small" />} label={`Google Review ≥ ${c.googleReviewThreshold}★`} color="warning" variant="outlined" />
                )}
              </Box>
              <Typography variant="body2" color="text.secondary">Form: {formName(c.formId)}</Typography>
              {c.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{c.description}</Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title={c.isActive ? 'Deactivate' : 'Activate'}>
                <Switch
                  checked={c.isActive}
                  onChange={e => toggleActiveMutation.mutate({ id: c.id, isActive: e.target.checked })}
                />
              </Tooltip>
              <Tooltip title="QR codes for this campaign">
                <IconButton size="small" onClick={() => router.push(`/feedback/qr-codes?campaignId=${c.id}`)} aria-label="QR codes for this campaign">
                  <QrCode2Icon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => openEdit(c)} aria-label="Edit">
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" color="error" onClick={() => {
                  if (confirm(`Delete campaign "${c.name}"? This is only allowed if no QR codes reference it.`)) removeMutation.mutate(c.id);
                }} aria-label="Delete">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Paper>
      ))}

      <ResponsiveDialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 3 }}>
          <TextField
            label="Campaign Name"
            value={dto.name}
            onChange={e => setDto(d => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Reception Survey"
            fullWidth
          />
          <TextField
            select
            label="Form"
            value={dto.formId}
            onChange={e => setDto(d => ({ ...d, formId: e.target.value }))}
            fullWidth
            helperText="Only published (or draft) forms can be assigned; archived forms are excluded"
          >
            {publishableForms.map(f => (
              <MenuItem key={f.id} value={f.id}>{f.name} {f.status !== 'PUBLISHED' && `(${f.status})`}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Description"
            value={dto.description}
            onChange={e => setDto(d => ({ ...d, description: e.target.value }))}
            multiline minRows={2}
            fullWidth
          />
          <Divider />

          <Box>
            <Typography variant="subtitle2" fontWeight={700}>Google Review Prompt</Typography>
            <Typography variant="caption" color="text.secondary">
              After a patient submits high-rated feedback, invite them to share it on Google. The patient always
              posts the review themselves through their own Google account -- nothing is ever posted automatically.
            </Typography>
          </Box>

          <FormControlLabel
            control={<Switch
              checked={dto.googleReviewEnabled}
              onChange={e => setDto(d => ({ ...d, googleReviewEnabled: e.target.checked }))}
            />}
            label="Enable Google Review prompt for this campaign"
          />

          {dto.googleReviewEnabled && (
            <>
              <TextField
                label="Google Review URL"
                value={dto.googleReviewUrl}
                onChange={e => setDto(d => ({ ...d, googleReviewUrl: e.target.value }))}
                placeholder="https://g.page/r/your-listing/review"
                fullWidth
                helperText="The 'write a review' link for your hospital's Google Business listing"
              />
              <TextField
                label="Rating Threshold"
                type="number"
                value={dto.googleReviewThreshold}
                onChange={e => setDto(d => ({ ...d, googleReviewThreshold: Number(e.target.value) }))}
                inputProps={{ min: 1, max: 5, step: 0.5 }}
                helperText="Show the prompt only when the patient's overall rating is at least this (1-5)"
                sx={{ maxWidth: 260 }}
              />
              <TextField
                label="Thank-you message"
                value={dto.googleReviewThankYouMessage}
                onChange={e => setDto(d => ({ ...d, googleReviewThankYouMessage: e.target.value }))}
                placeholder="Thank you for your valuable feedback! We're glad you had a good experience."
                fullWidth
              />
              <TextField
                label="Review invitation message"
                value={dto.googleReviewInvitationMessage}
                onChange={e => setDto(d => ({ ...d, googleReviewInvitationMessage: e.target.value }))}
                placeholder="Would you like to share your experience on Google to help others?"
                fullWidth
              />
            </>
          )}

          {formError && <Alert severity="error">{formError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => saveMutation.mutate()}
            disabled={!dto.name || !dto.formId || saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : editing ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
