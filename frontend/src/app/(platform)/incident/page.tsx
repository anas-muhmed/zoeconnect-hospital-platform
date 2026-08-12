'use client';

import React, { useState } from 'react';
import { Box, Button, TextField, InputAdornment, Stack, Badge, Chip, Tooltip, IconButton } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useRouter } from 'next/navigation';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import PageHeader from '../../../components/PageHeader';
import { INCIDENT_ROUTES } from '../../../lib/constants/incident-routes';
import { IncidentTable } from '../../../components/incident/IncidentTable';
import { IncidentFilterDialog, IncidentFilters, countActiveFilters } from '../../../components/incident/IncidentFilterDialog';
import { useDebounce } from '../../../lib/hooks/useDebounce';
import { incidentApi } from '../../../lib/api/incident.api';
import { incidentKeys } from '../../../hooks/incident/use-incident';
import { exportToCsv } from '../../../lib/utils/csv-export';
import { getApiErrorMessage } from '../../../lib/utils/api-error';
import { getStatusLabel } from '../../../lib/utils/incident-formatters';

export default function IncidentListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [advancedFilters, setAdvancedFilters] = useState<IncidentFilters>({});
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filters: Record<string, any> = {
    ...advancedFilters,
    search: debouncedSearch || undefined,
  };

  const activeFilterCount = countActiveFilters(advancedFilters);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await incidentApi.getAll({ ...filters, page: 1, limit: 100 });
      if (!res.data.length) {
        enqueueSnackbar('No incidents match the current filters to export', { variant: 'info' });
        return;
      }
      exportToCsv(
        res.data,
        [
          { header: 'Incident Number', accessor: (r: any) => r.incidentNumber },
          { header: 'Status', accessor: (r: any) => getStatusLabel(r.status) },
          { header: 'Severity', accessor: (r: any) => r.severityCode },
          { header: 'Priority', accessor: (r: any) => r.priorityCode },
          { header: 'Department', accessor: (r: any) => r.department },
          { header: 'Category', accessor: (r: any) => r.category?.name || r.categoryId },
          { header: 'Incident Date', accessor: (r: any) => r.incidentDate },
          { header: 'Reported On', accessor: (r: any) => r.createdAt },
          { header: 'Near Miss', accessor: (r: any) => (r.isNearMiss ? 'Yes' : 'No') },
          { header: 'Sentinel Event', accessor: (r: any) => (r.isSentinelEvent ? 'Yes' : 'No') },
        ],
        `incidents-${new Date().toISOString().split('T')[0]}.csv`,
      );
      if (res.total > 100) {
        enqueueSnackbar(`Exported first 100 of ${res.total} matching incidents — narrow your filters to export the rest.`, { variant: 'info' });
      } else {
        enqueueSnackbar(`Exported ${res.data.length} incidents`, { variant: 'success' });
      }
    } catch (err) {
      enqueueSnackbar(getApiErrorMessage(err, 'Failed to export incidents'), { variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
  };

  const clearFilter = (key: keyof IncidentFilters) => {
    setAdvancedFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <Box>
      <PageHeader
        title="Incident Management"
        subtitle="View and manage hospital incidents"
        actions={
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => router.push(INCIDENT_ROUTES.NEW)}
          >
            Report Incident
          </Button>
        }
      />
      <Box sx={{ mt: 3, bgcolor: 'background.paper', borderRadius: 3, p: 2.5, boxShadow: 1 }}>

        {/* Search and Filter Toolbar */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
          <TextField
            placeholder="Search incident number or description..."
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 300 }}
          />
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh">
              <IconButton onClick={handleRefresh} size="small" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }} aria-label="Refresh">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Badge badgeContent={activeFilterCount} color="primary">
              <Button variant="outlined" startIcon={<FilterListIcon />} onClick={() => setFilterDialogOpen(true)}>
                Filter
              </Button>
            </Badge>
            <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export'}
            </Button>
          </Stack>
        </Box>

        {activeFilterCount > 0 && (
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
            {Object.entries(advancedFilters).map(([key, val]) =>
              val !== undefined && val !== '' ? (
                <Chip
                  key={key}
                  size="small"
                  label={`${key}: ${val}`}
                  onDelete={() => clearFilter(key as keyof IncidentFilters)}
                />
              ) : null,
            )}
          </Stack>
        )}

        <IncidentTable filters={filters} />
      </Box>

      <IncidentFilterDialog
        open={filterDialogOpen}
        value={advancedFilters}
        onClose={() => setFilterDialogOpen(false)}
        onApply={setAdvancedFilters}
      />
    </Box>
  );
}
