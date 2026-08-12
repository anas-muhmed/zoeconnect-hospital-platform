import React, { useEffect, useState } from 'react';
import {
  DialogTitle, DialogContent, DialogActions, Button, Box, Typography, List, ListItem,
  ListItemText, ListItemAvatar, Avatar, IconButton, Autocomplete, TextField, CircularProgress,
  Divider, Alert,
} from '@mui/material';
import ResponsiveDialog from '../../ResponsiveDialog';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import { useSnackbar } from 'notistack';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { usersApi, UserListItem } from '../../../lib/api/users.api';
import {
  useNotificationRoleMembers, useAddNotificationRoleMember, useRemoveNotificationRoleMember,
} from '../../../hooks/incident/use-incident-settings';
import { getApiErrorMessage } from '../../../lib/utils/api-error';
import { IncidentNotificationRole } from '../../../types/incident.types';

interface NotificationRoleMembersDialogProps {
  open: boolean;
  onClose: () => void;
  role: IncidentNotificationRole | null;
  roleName?: string;
  canManage: boolean;
}

/**
 * Manages which users are assigned to an incident-scoped notification role
 * (e.g. "RISK_MANAGER"). These are the people who actually receive
 * notifications when a severity level or notification rule targets this
 * role name — separate from platform RBAC/login roles.
 */
export const NotificationRoleMembersDialog: React.FC<NotificationRoleMembersDialogProps> = ({ open, onClose, role, roleName, canManage }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { data: members, isLoading } = useNotificationRoleMembers(role?.id);
  const addMember = useAddNotificationRoleMember();
  const removeMember = useRemoveNotificationRoleMember();

  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<UserListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const debouncedInput = useDebounce(inputValue, 400);

  useEffect(() => {
    if (!open) {
      setInputValue('');
      setOptions([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !role) return;
    setSearching(true);
    usersApi.list(1, 10, debouncedInput || undefined)
      .then((res) => setOptions(res.items))
      .catch(() => setOptions([]))
      .finally(() => setSearching(false));
  }, [open, role, debouncedInput]);

  const memberIds = new Set((members || []).map((m) => m.id));

  const handleAdd = async (user: UserListItem | null) => {
    if (!user || !role) return;
    try {
      await addMember.mutateAsync({ roleId: role.id, userId: user.id });
      enqueueSnackbar(`${user.fullName || user.username} added to ${role.name}`, { variant: 'success' });
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to add member'), { variant: 'error' });
    }
  };

  const handleRemove = async (userId: string, label: string) => {
    if (!role) return;
    try {
      await removeMember.mutateAsync({ roleId: role.id, userId });
      enqueueSnackbar(`${label} removed from ${role.name}`, { variant: 'success' });
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to remove member'), { variant: 'error' });
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Role Members
        {role && (
          <Typography variant="body2" color="text.secondary">
            Users assigned to <strong>{role.name.replace(/_/g, ' ')}</strong> receive notifications targeting this role.
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {!role ? (
          <Alert severity="warning">
            {roleName
              ? `"${roleName}" doesn't match any configured notification role. Create it in the Role Assignments tab first.`
              : 'No role selected.'}
          </Alert>
        ) : (
          <>
            {canManage && (
              <Autocomplete
                options={options}
                loading={searching}
                inputValue={inputValue}
                onInputChange={(_, val) => setInputValue(val)}
                getOptionLabel={(u) => u.fullName || u.username}
                filterOptions={(opts) => opts.filter((o) => !memberIds.has(o.id))}
                onChange={(_, val) => handleAdd(val)}
                value={null}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box>
                      <Typography variant="body2">{option.fullName || option.username}</Typography>
                      <Typography variant="caption" color="text.secondary">{option.email}</Typography>
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Add a user to this role"
                    placeholder="Search by name or email"
                    size="small"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {searching ? <CircularProgress size={16} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            )}

            <Divider sx={{ my: 2 }} />

            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
            ) : !members || members.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No users currently hold this role. Notifications targeting it won't reach anyone.
              </Typography>
            ) : (
              <List dense disablePadding>
                {members.map((m) => (
                  <ListItem
                    key={m.id}
                    secondaryAction={canManage && (
                      <IconButton edge="end" size="small" onClick={() => handleRemove(m.id, m.fullName || m.username)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ width: 32, height: 32 }}><PersonIcon fontSize="small" /></Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={m.fullName || m.username} secondary={m.email} />
                  </ListItem>
                ))}
              </List>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  );
};
