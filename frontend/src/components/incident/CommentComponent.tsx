import React, { useState } from 'react';
import { Box, TextField, Button, Paper, Avatar, ToggleButtonGroup, ToggleButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import PublicIcon from '@mui/icons-material/Public';
import { CommentVisibility } from '../../types/incident.types';

interface CommentComponentProps {
  onAddComment: (comment: string, visibility: CommentVisibility) => Promise<void>;
  isSubmitting?: boolean;
}

export const CommentComponent: React.FC<CommentComponentProps> = ({ onAddComment, isSubmitting = false }) => {
  const [comment, setComment] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibility>('INTERNAL');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    await onAddComment(comment.trim(), visibility);
    setComment('');
  };

  return (
    <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
      <form onSubmit={handleSubmit}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
            <PersonIcon />
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              placeholder="Add a comment or internal note..."
              variant="outlined"
              size="small"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isSubmitting}
              sx={{ bgcolor: 'background.paper' }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <ToggleButtonGroup
                value={visibility}
                exclusive
                size="small"
                onChange={(e, val) => val && setVisibility(val)}
              >
                <ToggleButton value="INTERNAL" sx={{ px: 1.5, py: 0.25, textTransform: 'none' }}>
                  <LockIcon fontSize="small" sx={{ mr: 0.5 }} /> Internal
                </ToggleButton>
                <ToggleButton value="PUBLIC" sx={{ px: 1.5, py: 0.25, textTransform: 'none' }}>
                  <PublicIcon fontSize="small" sx={{ mr: 0.5 }} /> Public
                </ToggleButton>
              </ToggleButtonGroup>
              <Button
                type="submit"
                variant="contained"
                endIcon={<SendIcon />}
                disabled={!comment.trim() || isSubmitting}
                size="small"
              >
                Post Comment
              </Button>
            </Box>
          </Box>
        </Box>
      </form>
    </Paper>
  );
};
