'use client';

import { useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Tooltip from '@mui/material/Tooltip';
import LockResetIcon from '@mui/icons-material/LockReset';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { vendorApi } from '@/lib/api/vendor.api';

export default function ForgotPasswordPage() {
  const [username, setUsername]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [resetLink, setResetLink] = useState('');
  const [copied, setCopied]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { token } = await vendorApi.forgotPassword(username.trim());
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setResetLink(`${origin}/reset-password?token=${token}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{
      minHeight: '100dvh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      bgcolor: 'background.default',
    }}>
      <Card elevation={0} sx={{ width: 440, border: 1, borderColor: 'divider' }}>
        <CardContent sx={{ p: 4 }}>

          {/* Header */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Box sx={{
              width: 48, height: 48, bgcolor: 'primary.main', borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2,
            }}>
              <LockResetIcon sx={{ color: 'white' }} />
            </Box>
            <Typography variant="h5" fontWeight={700}>Reset Password</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 0.5 }}>
              Enter your username to generate a one-hour reset link.
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {!resetLink ? (
            <form onSubmit={handleSubmit}>
              <TextField
                label="Username" fullWidth size="small" sx={{ mb: 3 }}
                value={username} onChange={e => setUsername(e.target.value)}
                autoFocus autoComplete="username"
              />
              <Button
                type="submit" variant="contained" fullWidth size="large"
                disabled={loading || !username.trim()}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {loading ? 'Generating...' : 'Generate Reset Link'}
              </Button>
            </form>
          ) : (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                Reset link generated — valid for <strong>1 hour</strong>. Copy and open it now.
              </Alert>

              <TextField
                label="Reset link" fullWidth size="small" multiline rows={3}
                value={resetLink} inputProps={{ readOnly: true, style: { fontFamily: 'monospace', fontSize: 12 } }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title={copied ? 'Copied!' : 'Copy link'}>
                        <IconButton size="small" onClick={handleCopy} edge="end">
                          {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />

              <Button
                variant="contained" fullWidth size="large"
                href={resetLink}
              >
                Open Reset Page
              </Button>
            </Box>
          )}

          <Box sx={{ mt: 2.5, textAlign: 'center' }}>
            <Link href="/login" style={{ fontSize: 13, color: 'inherit', opacity: 0.6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ArrowBackIcon sx={{ fontSize: 14 }} /> Back to sign in
            </Link>
          </Box>

        </CardContent>
      </Card>
    </Box>
  );
}
