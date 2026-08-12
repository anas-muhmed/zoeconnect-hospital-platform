import React from 'react';
import { Box, Typography, Chip, CircularProgress, Paper } from '@mui/material';
import { format } from 'date-fns';
import { CommentComponent } from './CommentComponent';
import { useIncidentComments, useAddComment } from '../../hooks/incident/use-incident-comments';
import { CommentVisibility } from '../../types/incident.types';
import { useSnackbar } from 'notistack';
import { getApiErrorMessage } from '../../lib/utils/api-error';

interface CommentThreadProps {
  incidentId: string;
}

export const CommentThread: React.FC<CommentThreadProps> = ({ incidentId }) => {
  const { data: comments, isLoading } = useIncidentComments(incidentId);
  const addComment = useAddComment(incidentId);
  const { enqueueSnackbar } = useSnackbar();

  const handleAddComment = async (content: string, visibility: CommentVisibility) => {
    try {
      await addComment.mutateAsync({ content, visibility });
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to add comment'), { variant: 'error' });
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <CommentComponent onAddComment={handleAddComment} isSubmitting={addComment.isPending} />
      </Box>

      {isLoading ? (
        <CircularProgress size={20} />
      ) : comments && comments.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {comments.map((c) => (
            <Paper key={c.id} variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="subtitle2" fontWeight="bold">
                  {c.authorName || c.authorId}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip
                    label={c.visibility === 'PUBLIC' ? 'Public' : 'Internal'}
                    color={c.visibility === 'PUBLIC' ? 'info' : 'default'}
                    size="small"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {format(new Date(c.createdAt), 'PP p')}
                  </Typography>
                </Box>
              </Box>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.content}</Typography>
            </Paper>
          ))}
        </Box>
      ) : (
        <Typography color="text.secondary" variant="body2">No comments yet.</Typography>
      )}
    </Box>
  );
};
