'use client';

import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RestoreIcon from '@mui/icons-material/Restore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ImageIcon from '@mui/icons-material/Image';
import VideocamIcon from '@mui/icons-material/Videocam';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface CMSMedia {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
  mediaType: 'IMAGE' | 'VIDEO';
  size: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface MediaUsage {
  playlistId: string;
  playlistName: string;
  itemCount: number;
}

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CmsMediaLibraryPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [usageTarget, setUsageTarget] = useState<CMSMedia | null>(null);

  const { data: media = [], isLoading } = useQuery<CMSMedia[]>({
    queryKey: ['cms-media', showDeleted],
    queryFn: () => apiClient.get('/cms/media', { params: { includeDeleted: showDeleted } }).then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cms-media'] });

  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const cleanupMutation = useMutation({
    mutationFn: () => apiClient.post('/cms/asset-cleanup/run'),
    onSuccess: (res: any) => {
      const removed = res?.data?.removed ?? 0;
      setCleanupResult(`Removed ${removed} orphaned media file(s).`);
      invalidate();
      setTimeout(() => setCleanupResult(null), 4000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cms/media/${id}`),
    onSuccess: invalidate,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/cms/media/${id}/restore`),
    onSuccess: invalidate,
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/cms/media/${id}/permanent`),
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Permanent delete failed'),
  });

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', file);
      await apiClient.post('/cms/media/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      invalidate();
    } catch (err: any) {
      setUploadError(err?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 2 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading media library...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>CMS Media Library</Typography>
          <Typography variant="body2" color="text.secondary">
            Upload images and videos to use in digital signage playlists.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControlLabel
            control={<Switch size="small" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />}
            label={<Typography variant="body2">Show deleted</Typography>}
          />
          <Button variant="outlined" startIcon={<CleaningServicesIcon />} disabled={cleanupMutation.isPending}
            onClick={() => cleanupMutation.mutate()}>
            {cleanupMutation.isPending ? 'Cleaning...' : 'Run Asset Cleanup'}
          </Button>
          <Button variant="contained" component="label" startIcon={<UploadFileIcon />} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload Media'}
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime"
              onChange={handleFileSelected}
            />
          </Button>
        </Box>
      </Box>

      {cleanupResult && (
        <Paper sx={{ p: 2, mb: 2, bgcolor: 'success.lighter', border: '1px solid', borderColor: 'success.light' }}>
          <Typography color="success.main" variant="body2">{cleanupResult}</Typography>
        </Paper>
      )}

      {uploading && <LinearProgress sx={{ mb: 2 }} />}
      {uploadError && (
        <Paper sx={{ p: 2, mb: 2, bgcolor: 'error.lighter', border: '1px solid', borderColor: 'error.light' }}>
          <Typography color="error.main" variant="body2">{uploadError}</Typography>
        </Paper>
      )}

      {media.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {showDeleted ? 'No deleted media.' : 'No media uploaded yet. Upload an image or video to get started.'}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {media.map(item => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={item.id}>
              <Paper sx={{ overflow: 'hidden', opacity: item.deletedAt ? 0.55 : 1 }}>
                <Box sx={{ position: 'relative', height: 140, bgcolor: 'grey.900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.mediaType === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${API_ORIGIN}${item.url}`} alt={item.originalName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <video src={`${API_ORIGIN}${item.url}`} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <Chip
                    size="small"
                    icon={item.mediaType === 'IMAGE' ? <ImageIcon /> : <VideocamIcon />}
                    label={item.deletedAt ? 'Deleted' : item.mediaType}
                    color={item.deletedAt ? 'error' : 'default'}
                    sx={{ position: 'absolute', top: 8, left: 8, bgcolor: item.deletedAt ? undefined : 'rgba(0,0,0,0.6)', color: 'white' }}
                  />
                  <Box sx={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Usage & details">
                      <IconButton
                        size="small"
                        onClick={() => setUsageTarget(item)}
                        sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'grey.800' } }}
                       aria-label="Usage & details">
                        <InfoOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {item.deletedAt ? (
                      <>
                        <Tooltip title="Restore">
                          <IconButton
                            size="small"
                            onClick={() => restoreMutation.mutate(item.id)}
                            sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'success.main' } }}
                           aria-label="Restore">
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete permanently">
                          <IconButton
                            size="small"
                            onClick={() => {
                              if (confirm(`Permanently delete "${item.originalName}"? This cannot be undone and will fail if it's still used by a playlist.`)) {
                                permanentDeleteMutation.mutate(item.id);
                              }
                            }}
                            sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'error.main' } }}
                          >
                            <DeleteForeverIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : (
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => {
                            if (confirm(`Delete "${item.originalName}"? It can be restored later from "Show deleted".`)) {
                              deleteMutation.mutate(item.id);
                            }
                          }}
                          sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'error.main' } }}
                         aria-label="Delete">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
                <Box sx={{ p: 1.5 }}>
                  <Typography variant="body2" fontWeight={600} noWrap title={item.originalName}>
                    {item.originalName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatSize(item.size)}
                    {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {usageTarget && (
        <MediaDetailsDialog media={usageTarget} onClose={() => setUsageTarget(null)} />
      )}
    </Box>
  );
}

// ── Media Details / Usage Dialog ──────────────────────────────────────────────
function MediaDetailsDialog({ media, onClose }: { media: CMSMedia; onClose: () => void }) {
  const { data: usage = [], isLoading } = useQuery<MediaUsage[]>({
    queryKey: ['cms-media-usage', media.id],
    queryFn: () => apiClient.get(`/cms/media/${media.id}/usage`).then(r => r.data),
  });

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{media.originalName}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="body2"><strong>Type:</strong> {media.mediaType} ({media.mimeType})</Typography>
          <Typography variant="body2"><strong>Size:</strong> {formatSize(media.size)}</Typography>
          {media.width && media.height && (
            <Typography variant="body2"><strong>Dimensions:</strong> {media.width}×{media.height}px</Typography>
          )}
          {media.checksum && (
            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
              <strong>Checksum:</strong> <Typography component="span" variant="caption" fontFamily="monospace">{media.checksum}</Typography>
            </Typography>
          )}
          <Typography variant="body2"><strong>Uploaded:</strong> {new Date(media.createdAt).toLocaleString()}</Typography>
        </Box>

        <Typography variant="subtitle2" sx={{ mt: 1 }}>Used by</Typography>
        {isLoading ? (
          <CircularProgress size={20} />
        ) : usage.length === 0 ? (
          <Alert severity="info" sx={{ py: 0.5 }}>Not currently used by any playlist.</Alert>
        ) : (
          usage.map(u => (
            <Typography key={u.playlistId} variant="body2">
              {u.playlistName} <Typography component="span" variant="caption" color="text.secondary">({u.itemCount} item{u.itemCount === 1 ? '' : 's'})</Typography>
            </Typography>
          ))
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
}
