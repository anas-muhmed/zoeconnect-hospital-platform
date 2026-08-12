import React, { useMemo, useState } from 'react';
import { DataGrid, GridColDef, GridPaginationModel, GridSortModel } from '@mui/x-data-grid';
import { Box, IconButton, Tooltip, Typography, alpha, useTheme } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useIncidents } from '../../hooks/incident/use-incident';
import { IncidentStatusChip } from './IncidentStatusChip';
import { SeverityBadge } from './SeverityBadge';
import { PriorityBadge } from './PriorityBadge';
import { INCIDENT_ROUTES } from '../../lib/constants/incident-routes';

interface IncidentTableProps {
  filters?: Record<string, any>;
}

export const IncidentTable: React.FC<IncidentTableProps> = ({ filters = {} }) => {
  const router = useRouter();
  const theme = useTheme();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 15 });
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'createdAt', sort: 'desc' }]);

  const sortParams = useMemo(() => {
    const first = sortModel[0];
    if (!first) return {};
    return { sortBy: first.field, sortOrder: first.sort === 'asc' ? 'ASC' : 'DESC' };
  }, [sortModel]);

  const { data: response, isLoading } = useIncidents({
    ...filters,
    ...sortParams,
    page: paginationModel.page + 1,
    limit: paginationModel.pageSize,
  });

  const columns: GridColDef[] = [
    {
      field: 'incidentNumber',
      headerName: 'Incident #',
      flex: 1.3,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, height: '100%' }}>
          {(params.row.isSentinelEvent) && (
            <Tooltip title="Sentinel event">
              <ReportProblemIcon sx={{ fontSize: 16, color: 'error.main' }} />
            </Tooltip>
          )}
          <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
            {params.row.incidentNumber}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      flex: 0.9,
      minWidth: 130,
      renderCell: (params) => <IncidentStatusChip status={params.row.status} />,
    },
    {
      field: 'severityCode',
      headerName: 'Severity',
      flex: 0.8,
      minWidth: 110,
      renderCell: (params) => <SeverityBadge level={params.row.severityCode} />,
    },
    {
      field: 'priorityCode',
      headerName: 'Priority',
      flex: 0.8,
      minWidth: 110,
      renderCell: (params) => <PriorityBadge level={params.row.priorityCode} />,
    },
    { field: 'department', headerName: 'Department', flex: 1, minWidth: 140 },
    {
      field: 'incidentDate',
      headerName: 'Incident Date',
      flex: 1.1,
      minWidth: 170,
      valueFormatter: (value: any) => (value ? format(new Date(value), 'PPp') : ''),
    },
    {
      field: 'createdAt',
      headerName: 'Reported On',
      flex: 1.1,
      minWidth: 170,
      valueFormatter: (value: any) => (value ? format(new Date(value), 'PPp') : ''),
    },
    {
      field: 'actions',
      headerName: '',
      width: 60,
      sortable: false,
      align: 'center',
      renderCell: (params) => (
        <Tooltip title="View Details">
          <IconButton
            onClick={(e) => { e.stopPropagation(); router.push(INCIDENT_ROUTES.DETAIL(params.row.id)); }}
            size="small"
            color="primary"
           aria-label="View Details">
            <VisibilityIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box sx={{ height: 620, width: '100%' }}>
      <DataGrid
        rows={response?.data || []}
        columns={columns}
        loading={isLoading}
        rowCount={response?.total || 0}
        paginationMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        pageSizeOptions={[15, 30, 50]}
        disableRowSelectionOnClick
        onRowClick={(params) => router.push(INCIDENT_ROUTES.DETAIL(params.row.id))}
        getRowClassName={() => 'incident-row'}
        sx={{
          border: 'none',
          '& .MuiDataGrid-columnHeaders': { bgcolor: alpha(theme.palette.primary.main, 0.04), borderRadius: 0 },
          // Suppress the default cell/column-header focus ring — rows navigate on
          // click, they're not editable cells, so the outline is just visual noise.
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none !important' },
          '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': { outline: 'none !important' },
          '& .incident-row': { cursor: 'pointer' },
          '& .incident-row:hover': { bgcolor: `${alpha(theme.palette.primary.main, 0.08)} !important` },
          '& .incident-row.Mui-hovered': { bgcolor: `${alpha(theme.palette.primary.main, 0.08)} !important` },
        }}
        initialState={{
          pagination: { paginationModel: { pageSize: 15 } },
        }}
      />
    </Box>
  );
};
