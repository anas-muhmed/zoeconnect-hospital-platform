'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';

import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { eicApi, type EicPreschoolEnrollment } from '@/lib/api/eic.api';
import PageHeader from '@/components/PageHeader';

const STATUS_COLOUR: Record<string, any> = {
  ACTIVE:     'success',
  DISCHARGED: 'default',
  ON_HOLD:    'warning',
};

export default function EicPreschoolPage() {
  const router = useRouter();

  const [enrollments, setEnrollments] = useState<EicPreschoolEnrollment[]>([]);
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await eicApi.listPreschoolEnrollments(q);
      setEnrollments(data);
    } catch {
      setError('Failed to load preschool enrollments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(value || undefined), 300);
  };

  return (
    <Box>
      {/* Header */}
      <PageHeader
        title="Preschool Section"
        subtitle="Preschool class management and attendance"
        icon={<SchoolIcon />}
        back="/eic"
        breadcrumbs={[
          { label: 'Early Intervention', href: '/eic' },
          { label: 'Preschool' },
        ]}
      />

      {/* Search */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ py: '12px !important' }}>
          <TextField
            placeholder="Search by student name, MRN or enrollment number…"
            size="small"
            fullWidth
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : enrollments.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
          <SchoolIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
          <Typography>No preschool enrollments found.</Typography>
          <Button
            variant="outlined" sx={{ mt: 2 }}
            onClick={() => router.push('/eic/preschool/new')}
          >
            Enroll the first student
          </Button>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50' } }}>
                <TableCell>Enrollment #</TableCell>
                <TableCell>Student</TableCell>
                <TableCell>MRN</TableCell>
                <TableCell>Class</TableCell>
                <TableCell>Teacher</TableCell>
                <TableCell>Admission</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {enrollments.map((enr) => (
                <TableRow
                  key={enr.id} hover sx={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/eic/preschool/${enr.id}`)}
                >
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace">
                      {enr.enrollmentNumber}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {enr.patient?.fullName ?? '—'}
                    </Typography>
                    {enr.patient?.fatherName && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        S/D/O {enr.patient.fatherName}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace">
                      {enr.patient?.mrn ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>{enr.classGroup ?? '—'}</TableCell>
                  <TableCell>{enr.teacherName ?? '—'}</TableCell>
                  <TableCell>{enr.admissionDate}</TableCell>
                  <TableCell>
                    <Chip
                      label={enr.status} size="small"
                      color={STATUS_COLOUR[enr.status] ?? 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <OpenInNewIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
