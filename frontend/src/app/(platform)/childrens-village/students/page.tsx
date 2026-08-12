"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import Alert from '@mui/material/Alert';
import SearchIcon from '@mui/icons-material/Search';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import GroupIcon from '@mui/icons-material/Group';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PageHeader from '@/components/PageHeader';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useDebounce } from '@/lib/hooks/useDebounce';

const ADMISSION_STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  ENROLLED: 'success',
  PENDING:  'warning',
  REJECTED: 'error',
};

type StatusFilter = '' | 'PENDING' | 'ENROLLED' | 'REJECTED';

export default function StudentsDirectoryPage() {
  const router = useRouter();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canApprove = hasPermission('CV:ADMISSIONS:APPROVE');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [students, setStudents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 400);

  // Browse-by-default: loads on mount with no query needed, newest
  // admissions first (backend orders by createdAt DESC) -- replaces the old
  // "type 3+ characters to see anything" search-only landing state.
  useEffect(() => {
    setLoading(true);
    setError('');
    apiClient.get('/childrens-village/students', {
      params: {
        q: debouncedSearch || undefined,
        status: statusFilter || undefined,
        page: page + 1,
        limit: rowsPerPage,
      },
    })
      .then((res) => {
        setStudents(res.data.items ?? []);
        setTotal(res.data.total ?? 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err?.response?.data?.message || 'Failed to load students.');
        setLoading(false);
      });
  }, [debouncedSearch, statusFilter, page, rowsPerPage]);

  // Reset to page 1 whenever the filters actually change the result set.
  useEffect(() => { setPage(0); }, [debouncedSearch, statusFilter]);

  // Approve/reject only meaningfully apply while Children's Village's
  // "Require admission approval" setting is on -- see
  // /childrens-village/settings. When it's off, every admission comes back
  // already 'ENROLLED' and these buttons just never show.
  const handleAdmissionAction = async (studentId: string, action: 'approve' | 'reject') => {
    setActioningId(studentId);
    try {
      const { data: updated } = await apiClient.patch(`/childrens-village/admissions/${studentId}/${action}`);
      setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, admissionStatus: updated.admissionStatus } : s)));
    } catch (err: any) {
      alert(err?.response?.data?.message || `Failed to ${action} admission`);
    } finally {
      setActioningId(null);
    }
  };

  const handleStatusChange = (_: React.MouseEvent, value: StatusFilter | null) => {
    setStatusFilter(value ?? '');
  };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Student Directory"
        subtitle="Browse and manage student profiles across all branches and programs."
        icon={<GroupIcon />}
        actions={
          <Button
            component={Link}
            href="/childrens-village/admissions"
            variant="contained"
            startIcon={<AddIcon />}
          >
            New Admission
          </Button>
        }
      />

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
        {/* Filter bar: search + admission status */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 3 }}>
          <TextField
            placeholder="Search by name, code, or registration number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: 280 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
              sx: { borderRadius: 999 },
            }}
          />

          <ToggleButtonGroup
            size="small"
            exclusive
            value={statusFilter}
            onChange={handleStatusChange}
          >
            <ToggleButton value="">All</ToggleButton>
            <ToggleButton value="PENDING">Pending</ToggleButton>
            <ToggleButton value="ENROLLED">Enrolled</ToggleButton>
            <ToggleButton value="REJECTED">Rejected</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!loading && !error && students.length === 0 && (
          <Box sx={{ textAlign: 'center', color: 'text.disabled', py: 6 }}>
            <PersonSearchIcon sx={{ fontSize: 48, mb: 2, color: 'grey.300' }} />
            <Typography color="text.secondary">
              {debouncedSearch || statusFilter
                ? 'No students match your filters.'
                : 'No students admitted yet.'}
            </Typography>
          </Box>
        )}

        {!loading && !error && students.length > 0 && (
          <>
            <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell><b>Name</b></TableCell>
                    <TableCell><b>ID / Reg No</b></TableCell>
                    <TableCell><b>Status</b></TableCell>
                    <TableCell><b>Admission</b></TableCell>
                    <TableCell align="right"><b>Actions</b></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.dark', fontWeight: 700 }}>
                            {student.firstName[0]}{student.lastName[0]}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight={600}>
                              {student.firstName} {student.lastName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              DOB: {student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : 'N/A'}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {student.registrationNumber || student.studentCode || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={student.studentStatus || 'ACTIVE'}
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={student.admissionStatus || 'PENDING'}
                          size="small"
                          color={ADMISSION_STATUS_COLOR[student.admissionStatus] ?? 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          {canApprove && student.admissionStatus === 'PENDING' && (
                            <>
                              <Button
                                size="small"
                                color="success"
                                variant="outlined"
                                startIcon={actioningId === student.id ? <CircularProgress size={14} /> : <CheckCircleIcon fontSize="small" />}
                                disabled={actioningId === student.id}
                                onClick={() => handleAdmissionAction(student.id, 'approve')}
                              >
                                Approve
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                startIcon={<CancelIcon fontSize="small" />}
                                disabled={actioningId === student.id}
                                onClick={() => handleAdmissionAction(student.id, 'reject')}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                            size="small"
                            onClick={() => router.push(`/childrens-village/students/${student.id}`)}
                          >
                            View Profile
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={total}
              page={page}
              rowsPerPage={rowsPerPage}
              rowsPerPageOptions={[10, 20, 50]}
              onPageChange={(_, newPage) => setPage(newPage)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
