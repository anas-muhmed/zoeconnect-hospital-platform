import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import LinkIcon from '@mui/icons-material/Link';

export interface VendorRegisterDto {
  vendorApiUrl: string;
  publicIp: string;
  publicPort: number;
  hospitalName: string;
  hospitalCode: string;
}

interface VendorRegisterDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (dto: VendorRegisterDto) => Promise<any>;
}

export default function VendorRegisterDialog({ open, onClose, onSubmit }: VendorRegisterDialogProps) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [vendorApiUrl, setVendorApiUrl] = useState('');
  const [publicIp,    setPublicIp]    = useState('');
  const [publicPort,  setPublicPort]  = useState('3001');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalCode, setHospitalCode] = useState('');

  const mutation = useMutation({
    mutationFn: () => onSubmit({
      vendorApiUrl: vendorApiUrl.trim(),
      publicIp:     publicIp.trim(),
      publicPort:   parseInt(publicPort, 10),
      hospitalName: hospitalName.trim(),
      hospitalCode: hospitalCode.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license-registration'] });
      enqueueSnackbar('Successfully registered with vendor platform', { variant: 'success' });
      onClose();
    },
    onError: (err: any) => {
      enqueueSnackbar(err?.response?.data?.message ?? 'Registration failed', { variant: 'error' });
    },
  });

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Register with Vendor Platform</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Enter the vendor platform details. Your machine fingerprint and hospital info will be sent automatically.
        </Typography>
        <TextField
          label="Vendor Platform URL"
          placeholder="http://192.168.1.50:4000"
          fullWidth size="small"
          value={vendorApiUrl}
          onChange={e => setVendorApiUrl(e.target.value)}
          helperText="Base URL of the vendor's local server"
        />
        <TextField
          label="Hospital Name"
          placeholder="General Hospital"
          fullWidth size="small"
          value={hospitalName}
          onChange={e => setHospitalName(e.target.value)}
          helperText="Full name of this hospital"
        />
        <TextField
          label="Hospital Code"
          placeholder="GH01"
          fullWidth size="small"
          value={hospitalCode}
          onChange={e => setHospitalCode(e.target.value)}
          helperText="Short identifying code for this hospital"
        />
        <TextField
          label="This Server's Public IP"
          placeholder="203.0.113.45"
          fullWidth size="small"
          value={publicIp}
          onChange={e => setPublicIp(e.target.value)}
          helperText="The vendor will use this IP to deliver license approvals"
        />
        <TextField
          label="ZoeConnect Backend Port"
          placeholder="3001"
          fullWidth size="small"
          type="number"
          value={publicPort}
          onChange={e => setPublicPort(e.target.value)}
          helperText="Port on which this backend is publicly reachable"
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={!vendorApiUrl.trim() || !publicIp.trim() || !hospitalName.trim() || !hospitalCode.trim() || mutation.isPending}
          startIcon={mutation.isPending ? <CircularProgress size={16} /> : <LinkIcon />}
        >
          Register
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
