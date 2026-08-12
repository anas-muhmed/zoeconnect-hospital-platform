'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';

import ExpandMoreIcon      from '@mui/icons-material/ExpandMore';
import SecurityIcon        from '@mui/icons-material/Security';
import PeopleIcon          from '@mui/icons-material/People';
import LockIcon            from '@mui/icons-material/Lock';
import EditIcon            from '@mui/icons-material/Edit';
import AddIcon             from '@mui/icons-material/Add';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

import { useQuery } from '@tanstack/react-query';
import { rolesApi, type Permission, type RoleWithPermissions } from '@/lib/api/users.api';
import { useAuthStore } from '@/lib/store/auth.store';
import PageHeader from '@/components/PageHeader';
import RoleFormDialog from '@/components/rbac/RoleFormDialog';

type Role = RoleWithPermissions;

// Module colour + icon map
const MODULE_META: Record<string, { color: string; bg: string; label: string }> = {
  PLATFORM: { color: '#1565C0', bg: alpha('#1565C0', 0.1), label: 'Platform' },
  LOYALTY:  { color: '#2E7D32', bg: alpha('#2E7D32', 0.1), label: 'Loyalty'  },
  EIC:      { color: '#6A1B9A', bg: alpha('#6A1B9A', 0.1), label: 'EIC'      },
  HIS:      { color: '#E65100', bg: alpha('#E65100', 0.1), label: 'HIS'      },
  TOKEN:    { color: '#00838F', bg: alpha('#00838F', 0.1), label: 'Token'    },
  FORMS:    { color: '#5D4037', bg: alpha('#5D4037', 0.1), label: 'Forms'    },
  FEEDBACK: { color: '#AD1457', bg: alpha('#AD1457', 0.1), label: 'Feedback' },
  CMS:      { color: '#4527A0', bg: alpha('#4527A0', 0.1), label: 'CMS'      },
  INCIDENT: { color: '#C62828', bg: alpha('#C62828', 0.1), label: 'Incident' },
};

// Action tag colour
const ACTION_COLOR: Record<string, { bg: string; color: string }> = {
  READ:   { bg: '#E3F2FD', color: '#1565C0' },
  CREATE: { bg: '#E8F5E9', color: '#2E7D32' },
  UPDATE: { bg: '#FFF3E0', color: '#E65100' },
  DELETE: { bg: '#FCE4EC', color: '#C62828' },
  MANAGE: { bg: '#F3E5F5', color: '#6A1B9A' },
};
function actionStyle(action: string) {
  return ACTION_COLOR[action] ?? { bg: '#F5F7FA', color: '#3D4A66' };
}

// ── Role Card ─────────────────────────────────────────────────────────────────
function RoleCard({ role, canEdit, onEdit }: { role: Role; canEdit: boolean; onEdit: (role: Role) => void }) {
  const meta  = role.moduleCode ? (MODULE_META[role.moduleCode] ?? MODULE_META.PLATFORM) : MODULE_META.PLATFORM;
  const initials = role.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  // System roles (SUPER_ADMIN/HOSPITAL_ADMIN) are protected at the backend
  // service layer too (RolesService.update()/assignPermissions() both throw
  // ForbiddenException for role.isSystem) -- hiding the edit affordance here
  // just avoids sending a request that would only ever come back rejected.
  const showEdit = canEdit && !role.isSystem;

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1, p: 2.5, '&:last-child': { pb: 2.5 } }}>
        {/* Card header row */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.75 }}>
          <Avatar
            sx={{
              width: 40, height: 40, borderRadius: 2,
              bgcolor: meta.bg, color: meta.color,
              fontSize: 13, fontWeight: 800, flexShrink: 0,
            }}
          >
            {initials}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={700} sx={{ fontSize: '0.9rem', lineHeight: 1.2, color: '#1A2340' }}>
              {role.name}
            </Typography>
            {role.description && (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                {role.description}
              </Typography>
            )}
          </Box>
          {role.isSystem && (
            <Chip
              icon={<LockIcon sx={{ fontSize: '12px !important' }} />}
              label="System"
              size="small"
              sx={{ bgcolor: alpha('#E65100', 0.1), color: '#E65100', fontWeight: 700, fontSize: '0.65rem', height: 20 }}
            />
          )}
          {showEdit && (
            <Tooltip title="Edit role">
              <IconButton size="small" onClick={() => onEdit(role)} sx={{ mt: -0.5, mr: -0.5 }} aria-label="Edit role">
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Divider sx={{ mb: 1.75 }} />

        {/* Stats row */}
        <Box sx={{ display: 'flex', gap: 2, mb: 1.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <PeopleIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              {role.userCount ?? 0} user{role.userCount !== 1 ? 's' : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <SecurityIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              {role.permissions?.length ?? 0} permissions
            </Typography>
          </Box>
        </Box>

        {/* Module badge */}
        {role.moduleCode && (
          <Chip
            label={meta.label}
            size="small"
            sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700, fontSize: '0.7rem', height: 22 }}
          />
        )}
        {!role.moduleCode && (
          <Chip
            label="All Modules"
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600, fontSize: '0.7rem', height: 22 }}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RbacPage() {
  const { hasPermission } = useAuthStore();
  const canCreate = hasPermission('PLATFORM:ROLES:CREATE');
  const canUpdate = hasPermission('PLATFORM:ROLES:UPDATE');

  const [formOpen,    setFormOpen]    = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const openCreate = () => { setEditingRole(null); setFormOpen(true); };
  const openEdit   = (role: Role) => { setEditingRole(role); setFormOpen(true); };

  const { data: roles = [], isLoading, error } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const { data: permissions = [] } = useQuery({ queryKey: ['permissions'], queryFn: rolesApi.listPermissions });

  const permsByModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.moduleCode] ??= []).push(p);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Roles & Permissions" icon={<SecurityIcon />} />
        <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Roles & Permissions" icon={<SecurityIcon />} />
        <Alert severity="error">Failed to load roles. Check your permissions.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Roles & Permissions"
        subtitle={`${roles.length} roles · ${permissions.length} permissions`}
        icon={<AdminPanelSettingsIcon />}
        actions={canCreate && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openCreate}>
            Add Role
          </Button>
        )}
      />

      {/* ── Role Cards ──────────────────────────────────────────────────── */}
      <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block' }}>
        Role Definitions
      </Typography>
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {roles.map((role) => (
          <Grid item xs={12} sm={6} lg={4} key={role.id}>
            <RoleCard role={role} canEdit={canUpdate} onEdit={openEdit} />
          </Grid>
        ))}
      </Grid>

      {/* ── Permissions by module ────────────────────────────────────────── */}
      <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block' }}>
        All Permissions
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {Object.entries(permsByModule).map(([module, perms]) => {
          const meta = MODULE_META[module] ?? { color: '#37474F', bg: alpha('#37474F', 0.1), label: module };
          return (
            <Accordion
              key={module}
              defaultExpanded={module === 'PLATFORM'}
              disableGutters
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '12px !important',
                '&:before': { display: 'none' },
                overflow: 'hidden',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
                sx={{
                  px: 2.5, py: 1.25, minHeight: 52,
                  '& .MuiAccordionSummary-content': { my: 0.75 },
                  '&:hover': { bgcolor: '#F7F9FC' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Chip
                    label={meta.label}
                    size="small"
                    sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700, height: 24 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {perms.length} permission{perms.length !== 1 ? 's' : ''}
                  </Typography>
                </Box>
              </AccordionSummary>
              <Divider />
              <AccordionDetails sx={{ px: 2.5, py: 2 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {perms.map((p) => {
                    const style = actionStyle(p.action);
                    return (
                      <Box
                        key={p.id}
                        sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.5,
                          px: 1.25, py: 0.4,
                          borderRadius: 1.5,
                          bgcolor: '#F5F7FA',
                          border: '1px solid #E2E8F2',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          color: '#3D4A66',
                        }}
                      >
                        <Typography
                          component="span"
                          sx={{
                            fontSize: '0.65rem', fontWeight: 700,
                            px: 0.75, py: 0.15,
                            borderRadius: 1,
                            bgcolor: style.bg, color: style.color,
                          }}
                        >
                          {p.action}
                        </Typography>
                        {p.resource}
                      </Box>
                    );
                  })}
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>

      {(canCreate || canUpdate) && (
        <RoleFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          role={editingRole}
          permissions={permissions}
        />
      )}
    </Box>
  );
}
