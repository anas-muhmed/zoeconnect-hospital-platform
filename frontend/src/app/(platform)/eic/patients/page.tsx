'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';

import SearchIcon        from '@mui/icons-material/Search';
import AddCircleIcon     from '@mui/icons-material/AddCircle';
import OpenInNewIcon     from '@mui/icons-material/OpenInNew';
import PeopleAltIcon     from '@mui/icons-material/PeopleAlt';
import CloseIcon         from '@mui/icons-material/Close';
import RefreshIcon       from '@mui/icons-material/Refresh';

import { eicApi, type EicPatient } from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

// deterministic colour from string
const PALETTE = ['#1565C0','#00838F','#6A1B9A','#2E7D32','#C62828','#E65100'];
function avatarBg(s: string) {
  let h = 0; for (const c of s) h = (h << 5) - h + c.charCodeAt(0);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function genderChip(g?: string | null) {
  if (!g) return null;
  const colors: Record<string, { color: string; bg: string }> = {
    MALE:   { color: '#1565C0', bg: alpha('#1565C0', 0.1) },
    FEMALE: { color: '#AD1457', bg: alpha('#AD1457', 0.1) },
    OTHER:  { color: '#37474F', bg: alpha('#37474F', 0.1) },
  };
  const style = colors[g.toUpperCase()] ?? colors.OTHER;
  return (
    <Chip
      label={g.charAt(0).toUpperCase() + g.slice(1).toLowerCase()}
      size="small"
      sx={{ bgcolor: style.bg, color: style.color, fontWeight: 600, height: 20, fontSize: '0.7rem' }}
    />
  );
}

export default function EicPatientsPage() {
  const router = useRouter();
  const [search,   setSearch]   = useState('');
  const [patients, setPatients] = useState<EicPatient[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await eicApi.listPatients(q);
      setPatients(data);
    } catch {
      setError('Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(search || undefined), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <Box>
      <PageHeader
        title="EIC Patients"
        subtitle={!loading ? `${patients.length.toLocaleString()} patient${patients.length !== 1 ? 's' : ''}${search ? ' (filtered)' : ''}` : undefined}
        icon={<PeopleAltIcon />}
        back="/eic"
        breadcrumbs={[
          { label: 'Early Intervention', href: '/eic' },
          { label: 'Patients' },
        ]}
        actions={
          <>
            <TextField
              size="small"
              placeholder="Search by name or MRN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    {loading && search
                      ? <CircularProgress size={14} />
                      : <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{ width: 240 }}
            />
            <Tooltip title="Refresh" arrow>
              <IconButton
                size="small"
                onClick={() => load(search || undefined)}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
               aria-label="Refresh">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button variant="contained" startIcon={<AddCircleIcon />} onClick={() => router.push('/eic/patients/search')}>
              New Admission
            </Button>
          </>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      <Paper sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Patient</TableCell>
                <TableCell>MRN</TableCell>
                <TableCell>Date of Birth</TableCell>
                <TableCell>Gender</TableCell>
                <TableCell>Guardian</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 7 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : patients.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ border: 0, p: 0 }}>
                        <EmptyState
                          icon={<PeopleAltIcon sx={{ fontSize: 28 }} />}
                          title={search ? 'No patients matched your search' : 'No EIC patients yet'}
                          description={search
                            ? 'Try a different name or MRN.'
                            : 'Register a patient to get started.'}
                          action={
                            !search && (
                              <Button variant="contained" startIcon={<AddCircleIcon />}
                                onClick={() => router.push('/eic/patients/search')}>
                                New Admission
                              </Button>
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )
                : patients.map((p) => {
                    const name = p.fullName ?? 'Unknown';
                    const bg   = avatarBg(name);
                    return (
                      <TableRow
                        key={p.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => router.push(`/eic/patients/${p.id}`)}
                      >
                        {/* Patient column with avatar */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar
                              sx={{
                                width: 30, height: 30, fontSize: 12,
                                fontWeight: 700, bgcolor: bg, flexShrink: 0,
                              }}
                            >
                              {name[0]?.toUpperCase()}
                            </Avatar>
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                              {name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'text.secondary' }}>
                            {p.mrn ?? '–'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                          {p.dateOfBirth
                            ? new Date(p.dateOfBirth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '–'}
                        </TableCell>
                        <TableCell>{genderChip(p.gender)}</TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem' }}>{p.fatherName ?? p.motherName ?? '–'}</TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{p.mobile ?? p.parentContact ?? '–'}</TableCell>
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="Open patient record" arrow>
                            <IconButton
                              size="small"
                              onClick={() => router.push(`/eic/patients/${p.id}`)}
                              sx={{
                                color: 'text.secondary',
                                '&:hover': { color: 'primary.main', bgcolor: (t) => alpha(t.palette.primary.main, 0.08) },
                              }}
                             aria-label="Open patient record">
                              <OpenInNewIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
