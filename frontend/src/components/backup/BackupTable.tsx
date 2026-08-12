import React, { useMemo, useState } from 'react';
import { DataGrid, GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { Box, IconButton, Tooltip, Typography, alpha, useTheme, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import VerifiedIcon from '@mui/icons-material/VerifiedUser';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CancelIcon from '@mui/icons-material/Cancel';
import LockIcon from '@mui/icons-material/Lock';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useBackups, useCancelBackup, useDeleteBackup, useDownloadBackup, useVerifyBackup } from '../../hooks/backup/use-backup';
import { BackupJob } from '../../types/backup.types';
import { BackupStatusChip } from './BackupStatusChip';
import { formatBytes, formatDuration, getBackupTypeLabel } from '../../lib/utils/backup-formatters';
import { useAuthStore } from '../../lib/store/auth.store';
import { BACKUP_PERMISSIONS } from '../../lib/constants/backup-permissions';
import { BACKUP_ROUTES } from '../../lib/constants/backup-routes';

interface BackupTableProps {
  onViewDetails: (job: BackupJob) => void;
  onRestore: (job: BackupJob) => void;
}

export const BackupTable: React.FC<BackupTableProps> = ({ onViewDetails, onRestore }) => {
  const theme = useTheme();
  const router = useRouter();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 15 });
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<BackupJob | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ id: string; valid: boolean; reason?: string } | null>(null);

  const { data: response, isLoading } = useBackups({ page: paginationModel.page + 1, limit: paginationModel.pageSize });
  const cancelMutation = useCancelBackup();
  const deleteMutation = useDeleteBackup();
  const downloadMutation = useDownloadBackup();
  const verifyMutation = useVerifyBackup();

  const canDownload = hasPermission(BACKUP_PERMISSIONS.DOWNLOAD);
  const canDelete = hasPermission(BACKUP_PERMISSIONS.DELETE);
  const canRestore = hasPermission(BACKUP_PERMISSIONS.RESTORE);
  const canVerify = hasPermission(BACKUP_PERMISSIONS.VERIFY);
  const canCreate = hasPermission(BACKUP_PERMISSIONS.CREATE);

  const openMenu = (e: React.MouseEvent<HTMLElement>, row: BackupJob) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuRow(row);
  };
  const closeMenu = () => { setMenuAnchor(null); setMenuRow(null); };

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'id', headerName: 'Name', flex: 1.3, minWidth: 220,
      renderCell: (params) => (
        <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
          {getBackupTypeLabel(params.row.type)}-{(params.row.id as string).slice(0, 8)}
        </Typography>
      ),
    },
    {
      field: 'createdAt', headerName: 'Date', flex: 1, minWidth: 160,
      valueFormatter: (value: any) => (value ? format(new Date(value), 'PPp') : ''),
    },
    {
      field: 'type', headerName: 'Type', flex: 0.8, minWidth: 120,
      renderCell: (params) => getBackupTypeLabel(params.row.type),
    },
    {
      field: 'sizeBytes', headerName: 'Size', flex: 0.7, minWidth: 100,
      renderCell: (params) => formatBytes(params.row.compressedSizeBytes || params.row.sizeBytes),
    },
    {
      field: 'durationMs', headerName: 'Duration', flex: 0.7, minWidth: 100,
      renderCell: (params) => formatDuration(params.row.durationMs),
    },
    {
      field: 'status', headerName: 'Status', flex: 0.8, minWidth: 120,
      renderCell: (params) => <BackupStatusChip status={params.row.status} />,
    },
    {
      field: 'createdById', headerName: 'Created By', flex: 0.9, minWidth: 140,
      renderCell: (params) => params.row.createdById || 'System (scheduled)',
    },
    {
      field: 'storageConfigId', headerName: 'Storage Location', flex: 0.9, minWidth: 140,
      renderCell: (params) => params.row.storageConfigId ? params.row.storageConfigId.slice(0, 8) : 'Local (default)',
    },
    {
      field: 'actions', headerName: '', width: 170, sortable: false, align: 'right',
      renderCell: (params) => {
        const row = params.row as BackupJob;
        const canCancel = canCreate && (row.status === 'pending' || row.status === 'running');
        return (
          <Box sx={{ display: 'flex', gap: 0.25 }} onClick={(e) => e.stopPropagation()}>
            <Tooltip title="View Details">
              <IconButton size="small" onClick={() => onViewDetails(row)} aria-label="View Details"><VisibilityIcon fontSize="small" /></IconButton>
            </Tooltip>
            {canDownload && row.status === 'completed' && (
              <Tooltip title="Download">
                <IconButton
                  size="small"
                  disabled={downloadMutation.isPending}
                  onClick={() => downloadMutation.mutate({ id: row.id, filename: `${row.id}.tar.gz${row.encrypted ? '.enc' : ''}` })}
                 aria-label="Download">
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canRestore && row.status === 'completed' && (
              <Tooltip title="Restore from this backup">
                <IconButton size="small" color="warning" onClick={() => onRestore(row)} aria-label="Restore from this backup"><RestoreIcon fontSize="small" /></IconButton>
              </Tooltip>
            )}
            <Tooltip title="More actions">
              <IconButton size="small" onClick={(e) => openMenu(e, row)} aria-label="More actions"><MoreVertIcon fontSize="small" /></IconButton>
            </Tooltip>
            {canCancel && (
              <Tooltip title="Cancel">
                <IconButton size="small" color="error" onClick={() => cancelMutation.mutate(row.id)} aria-label="Cancel"><CancelIcon fontSize="small" /></IconButton>
              </Tooltip>
            )}
          </Box>
        );
      },
    },
  ], [canDownload, canRestore, canCreate, downloadMutation, cancelMutation, onViewDetails, onRestore]);

  return (
    <Box sx={{ height: 620, width: '100%' }}>
      {verifyResult && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color={verifyResult.valid ? 'success.main' : 'error.main'}>
            Verification for {verifyResult.id.slice(0, 8)}: {verifyResult.valid ? 'Checksum valid' : `Failed — ${verifyResult.reason}`}
          </Typography>
        </Box>
      )}
      <DataGrid
        rows={response?.data || []}
        columns={columns}
        loading={isLoading}
        rowCount={response?.total || 0}
        paginationMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[15, 30, 50]}
        disableRowSelectionOnClick
        getRowId={(row) => row.id}
        sx={{
          border: 'none',
          '& .MuiDataGrid-columnHeaders': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none !important' },
        }}
      />
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {canVerify && (
          <MenuItem
            disabled={verifyMutation.isPending || !menuRow?.checksumSha256}
            onClick={async () => {
              if (!menuRow) return;
              const result = await verifyMutation.mutateAsync(menuRow.id);
              setVerifyResult({ id: menuRow.id, valid: result.valid, reason: result.reason });
              closeMenu();
            }}
          >
            <ListItemIcon><VerifiedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Verify Checksum</ListItemText>
          </MenuItem>
        )}
        {canRestore && menuRow?.status === 'completed' && (
          <MenuItem onClick={() => { if (menuRow) onRestore(menuRow); closeMenu(); }}>
            <ListItemIcon><RestoreIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Restore</ListItemText>
          </MenuItem>
        )}
        {canDelete && (
          <MenuItem
            sx={{ color: 'error.main' }}
            onClick={() => {
              if (menuRow && window.confirm(`Delete backup ${menuRow.id.slice(0, 8)}? This cannot be undone.`)) {
                deleteMutation.mutate(menuRow.id);
              }
              closeMenu();
            }}
          >
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
        {!canDelete && !canRestore && !canVerify && (
          <MenuItem disabled>
            <ListItemIcon><LockIcon fontSize="small" /></ListItemIcon>
            <ListItemText>No further actions permitted</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
};
