import React, { useRef, useState } from 'react';
import {
  Box, Typography, LinearProgress, IconButton, Tooltip, alpha, useTheme,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import VideocamIcon from '@mui/icons-material/Videocam';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useQueryClient } from '@tanstack/react-query';
import { incidentApi } from '../../lib/api/incident.api';
import { incidentKeys, useIncidentAttachments } from '../../hooks/incident/use-incident';
import { getApiErrorMessage } from '../../lib/utils/api-error';
import { useSnackbar } from 'notistack';
import { IncidentAttachment } from '../../types/incident.types';

interface AttachmentManagerProps {
  incidentId: string;
  parentType: string;
  parentId: string;
  readOnly?: boolean;
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function fileIconFor(mimeType: string): React.ReactNode {
  if (mimeType?.startsWith('image/')) return <ImageIcon />;
  if (mimeType?.startsWith('video/')) return <VideocamIcon />;
  if (mimeType?.startsWith('audio/')) return <AudiotrackIcon />;
  if (mimeType === 'application/pdf') return <PictureAsPdfIcon />;
  if (mimeType?.includes('word') || mimeType?.includes('document') || mimeType === 'text/plain') return <DescriptionIcon />;
  return <InsertDriveFileIcon />;
}

// Opens the file in a new tab (for previewable types like PDF/image) or
// triggers the browser's native download prompt otherwise. Fetches the file
// as an authenticated blob via the buffered /download endpoint — presigned
// URLs are not used because the default local-filesystem storage provider
// doesn't support them.
async function openBlobInNewTab(attachmentId: string, mimeType: string) {
  const res = await incidentApi.downloadAttachmentBlob(attachmentId);
  const blob = new Blob([res.data], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function saveBlobAs(attachmentId: string, mimeType: string, fileName: string) {
  const res = await incidentApi.downloadAttachmentBlob(attachmentId);
  const blob = new Blob([res.data], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export const AttachmentManager: React.FC<AttachmentManagerProps> = ({ incidentId, parentType, parentId, readOnly = false }) => {
  const theme = useTheme();
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: attachments, isLoading } = useIncidentAttachments(incidentId);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const filteredAttachments = (attachments?.filter((a) => a.parentId === parentId && a.parentType === parentType) || []) as IncidentAttachment[];

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    try {
      for (const file of fileArray) {
        await incidentApi.uploadAttachment(incidentId, parentType, parentId, file);
      }
      enqueueSnackbar(`${fileArray.length} file${fileArray.length > 1 ? 's' : ''} uploaded`, { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: incidentKeys.attachments(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentKeys.timeline(incidentId) });
    } catch (err) {
      enqueueSnackbar(getApiErrorMessage(err, 'Failed to upload files'), { variant: 'error' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) uploadFiles(event.target.files);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (readOnly || uploading) return;
    if (event.dataTransfer.files?.length) uploadFiles(event.dataTransfer.files);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await incidentApi.deleteAttachment(incidentId, id);
      enqueueSnackbar('Attachment deleted', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: incidentKeys.attachments(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentKeys.timeline(incidentId) });
    } catch (err) {
      enqueueSnackbar(getApiErrorMessage(err, 'Failed to delete attachment'), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handlePreview = async (att: IncidentAttachment) => {
    setBusyId(att.id);
    try {
      await openBlobInNewTab(att.id, att.mimeType);
    } catch (err) {
      enqueueSnackbar(getApiErrorMessage(err, 'Failed to open preview'), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (att: IncidentAttachment) => {
    setBusyId(att.id);
    try {
      await saveBlobAs(att.id, att.mimeType, att.originalName);
    } catch (err) {
      enqueueSnackbar(getApiErrorMessage(err, 'Failed to download file'), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box>
      {!readOnly && (
        <Box
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: dragActive ? 'primary.main' : 'divider',
            borderRadius: 2,
            bgcolor: dragActive ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
            p: 3,
            mb: 2.5,
            textAlign: 'center',
            cursor: uploading ? 'default' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 32, color: dragActive ? 'primary.main' : 'text.secondary', mb: 0.5 }} />
          <Typography variant="body2" fontWeight={600}>
            {dragActive ? 'Drop files to upload' : 'Drag & drop files, or click to browse'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Images, PDF, Office documents, audio/video evidence — up to 25 MB each
          </Typography>
          <input ref={fileInputRef} type="file" hidden multiple onChange={handleFileChange} />
          {uploading && <LinearProgress sx={{ mt: 1.5, borderRadius: 1 }} />}
        </Box>
      )}

      {isLoading ? (
        <LinearProgress sx={{ borderRadius: 1 }} />
      ) : filteredAttachments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No attachments yet.</Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.5 }}>
          {filteredAttachments.map((att) => (
            <Box
              key={att.id}
              sx={{
                border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5,
                display: 'flex', gap: 1.25, alignItems: 'flex-start',
                opacity: busyId === att.id ? 0.6 : 1,
                transition: 'border-color 0.15s ease',
                '&:hover': { borderColor: 'primary.light' },
              }}
            >
              <Box
                sx={{
                  width: 38, height: 38, borderRadius: 1.5, flexShrink: 0,
                  bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {fileIconFor(att.mimeType)}
              </Box>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Tooltip title={att.originalName}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    noWrap
                    sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                    onClick={() => handlePreview(att)}
                  >
                    {att.originalName}
                  </Typography>
                </Tooltip>
                <Typography variant="caption" color="text.secondary" noWrap display="block">
                  {formatSize(att.sizeBytes)} • {new Date(att.createdAt).toLocaleDateString()}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.25, mt: 0.25 }}>
                  <Tooltip title="Preview">
                    <IconButton size="small" onClick={() => handlePreview(att)} disabled={busyId === att.id} aria-label="Preview">
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Download">
                    <IconButton size="small" onClick={() => handleDownload(att)} disabled={busyId === att.id} aria-label="Download">
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {!readOnly && (
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => handleDelete(att.id, att.originalName)} disabled={busyId === att.id} aria-label="Delete">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
