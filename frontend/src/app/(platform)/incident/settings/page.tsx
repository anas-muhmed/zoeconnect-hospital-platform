'use client';

import React, { useState } from 'react';
import {
  Typography, Box, Paper, Tabs, Tab, Grid, Card, CardContent, Chip, Button, IconButton,
  Tooltip, Divider, Stack, CircularProgress, Alert, useMediaQuery, useTheme,
} from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import LabelIcon from '@mui/icons-material/Label';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import GridViewIcon from '@mui/icons-material/GridView';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import TimerIcon from '@mui/icons-material/Timer';
import ScheduleIcon from '@mui/icons-material/Schedule';
import BlockIcon from '@mui/icons-material/Block';
import PeopleIcon from '@mui/icons-material/People';
import GroupsIcon from '@mui/icons-material/Groups';
import PageHeader from '../../../../components/PageHeader';
import {
  useIncidentCategories, useIncidentTypes, useIncidentSeverityLevels, useIncidentNotificationRules,
  useIncidentNotificationRoles,
} from '../../../../hooks/incident/use-incident-settings';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { INCIDENT_PERMISSIONS } from '../../../../lib/constants/incident-permissions';
import { CategoryFormDialog } from '../../../../components/incident/settings/CategoryFormDialog';
import { TypeFormDialog } from '../../../../components/incident/settings/TypeFormDialog';
import { SeverityFormDialog } from '../../../../components/incident/settings/SeverityFormDialog';
import { RiskMatrixEditor } from '../../../../components/incident/settings/RiskMatrixEditor';
import { NotificationRuleFormDialog } from '../../../../components/incident/settings/NotificationRuleFormDialog';
import { NotificationRoleDefFormDialog } from '../../../../components/incident/settings/NotificationRoleDefFormDialog';
import { NotificationRoleMembersDialog } from '../../../../components/incident/settings/NotificationRoleMembersDialog';
import {
  IncidentCategory, IncidentType, IncidentSeverityLevel, IncidentNotificationRule, IncidentNotificationRole,
} from '../../../../types/incident.types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} id={`settings-tabpanel-${index}`} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const SectionIntro: React.FC<{ title: string; description: string; canManage: boolean; onAdd?: () => void; addLabel?: string }> = ({
  title, description, canManage, onAdd, addLabel,
}) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5, gap: 2 }}>
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>{title}</Typography>
      <Typography variant="body2" color="text.secondary">{description}</Typography>
    </Box>
    {canManage && onAdd && (
      <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onAdd} sx={{ flexShrink: 0 }}>
        {addLabel || 'Add'}
      </Button>
    )}
  </Box>
);

export default function IncidentSettingsPage() {
  const [value, setValue] = useState(0);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(INCIDENT_PERMISSIONS.SETTINGS);

  const { data: categories, isLoading: categoriesLoading } = useIncidentCategories();
  const { data: types, isLoading: typesLoading } = useIncidentTypes();
  const { data: severities, isLoading: severitiesLoading } = useIncidentSeverityLevels();
  const { data: notificationRules, isLoading: rulesLoading } = useIncidentNotificationRules();
  const { data: notificationRoles, isLoading: notificationRolesLoading } = useIncidentNotificationRoles();

  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category: IncidentCategory | null }>({ open: false, category: null });
  const [typeDialog, setTypeDialog] = useState<{ open: boolean; type: IncidentType | null; defaultCategoryId?: string }>({ open: false, type: null });
  const [severityDialog, setSeverityDialog] = useState<{ open: boolean; severity: IncidentSeverityLevel | null }>({ open: false, severity: null });
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule: IncidentNotificationRule | null }>({ open: false, rule: null });
  const [roleDefDialog, setRoleDefDialog] = useState<{ open: boolean; role: IncidentNotificationRole | null }>({ open: false, role: null });
  const [memberDialog, setMemberDialog] = useState<{ open: boolean; roleName: string }>({ open: false, roleName: '' });

  const openRoleMembers = (name: string) => setMemberDialog({ open: true, roleName: name });
  const matchedRole = (name: string): IncidentNotificationRole | null => (notificationRoles || []).find((r) => r.name === name) || null;

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  const typesByCategory = (categoryId: string) => (types || []).filter((t) => t.categoryId === categoryId);

  // Phase 3 polish: this vertical Tabs + content Paper had no responsive
  // breakpoint at all -- the 220px-wide vertical tab rail beside a flexGrow
  // content pane doesn't have anywhere to shrink to below ~768px, so it was
  // clipping. Below `md`, switch the rail to a horizontal scrollable strip
  // above the content instead of stacking it in the narrow flex row.
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box>
      <PageHeader
        title="Incident Settings"
        subtitle="Manage module configuration and reference data"
        icon={<CategoryIcon />}
      />

      {!canManage && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have read-only access to these settings. Contact an administrator with the Incident Settings permission to make changes.
        </Alert>
      )}

      <Paper sx={{ mt: 1, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: { xs: 'auto', md: 600 }, borderRadius: 2, overflow: 'hidden' }}>
        <Tabs
          orientation={isMobile ? 'horizontal' : 'vertical'}
          variant="scrollable"
          value={value}
          onChange={handleChange}
          sx={{
            borderRight: isMobile ? 0 : 1,
            borderBottom: isMobile ? 1 : 0,
            borderColor: 'divider',
            minWidth: isMobile ? 'auto' : 220,
            bgcolor: 'grey.50',
          }}
        >
          <Tab icon={<CategoryIcon fontSize="small" />} iconPosition="start" label="Categories & Types" sx={{ alignItems: 'center', justifyContent: 'flex-start', minHeight: 48 }} />
          <Tab icon={<PriorityHighIcon fontSize="small" />} iconPosition="start" label="Severity Levels" sx={{ alignItems: 'center', justifyContent: 'flex-start', minHeight: 48 }} />
          <Tab icon={<GridViewIcon fontSize="small" />} iconPosition="start" label="Priority & Risk Matrix" sx={{ alignItems: 'center', justifyContent: 'flex-start', minHeight: 48 }} />
          <Tab icon={<NotificationsActiveIcon fontSize="small" />} iconPosition="start" label="Notification Rules" sx={{ alignItems: 'center', justifyContent: 'flex-start', minHeight: 48 }} />
          <Tab icon={<AccountTreeIcon fontSize="small" />} iconPosition="start" label="Workflow Rules" sx={{ alignItems: 'center', justifyContent: 'flex-start', minHeight: 48 }} />
          <Tab icon={<TimerIcon fontSize="small" />} iconPosition="start" label="SLA Configuration" sx={{ alignItems: 'center', justifyContent: 'flex-start', minHeight: 48 }} />
          <Tab icon={<PeopleIcon fontSize="small" />} iconPosition="start" label="Role Assignments" sx={{ alignItems: 'center', justifyContent: 'flex-start', minHeight: 48 }} />
        </Tabs>

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {/* Categories & Types */}
          <CustomTabPanel value={value} index={0}>
            <SectionIntro
              title="Categories & Types"
              description="Configure the classification hierarchy used to categorize incidents."
              canManage={canManage}
              onAdd={() => setCategoryDialog({ open: true, category: null })}
              addLabel="Add Category"
            />

            {categoriesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>
            ) : !categories || categories.length === 0 ? (
              <Alert severity="info">No categories configured yet.</Alert>
            ) : (
              <Stack spacing={2}>
                {categories.map((cat) => (
                  <Card key={cat.id} variant="outlined" sx={{ borderRadius: 2, opacity: cat.isActive ? 1 : 0.6 }}>
                    <CardContent sx={{ pb: '16px !important' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'primary.50', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
                            <CategoryIcon fontSize="small" />
                          </Box>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography fontWeight={700}>{cat.name}</Typography>
                              <Chip label={cat.code} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: 11 }} />
                              {!cat.isActive && <Chip label="Inactive" size="small" color="default" icon={<BlockIcon sx={{ fontSize: 14 }} />} />}
                            </Box>
                            {cat.description && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{cat.description}</Typography>
                            )}
                          </Box>
                        </Box>
                        {canManage && (
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Add type in this category">
                              <IconButton size="small" onClick={() => setTypeDialog({ open: true, type: null, defaultCategoryId: cat.id })} aria-label="Add type in this category">
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit category">
                              <IconButton size="small" onClick={() => setCategoryDialog({ open: true, category: cat })} aria-label="Edit category">
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </Box>

                      {typesByCategory(cat.id).length > 0 && (
                        <>
                          <Divider sx={{ my: 1.5 }} />
                          <Grid container spacing={1}>
                            {typesByCategory(cat.id).map((t) => (
                              <Grid item xs={12} sm={6} md={4} key={t.id}>
                                <Box
                                  onClick={() => canManage && setTypeDialog({ open: true, type: t })}
                                  sx={{
                                    display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1.5,
                                    border: '1px solid', borderColor: 'divider', cursor: canManage ? 'pointer' : 'default',
                                    opacity: t.isActive ? 1 : 0.55,
                                    '&:hover': canManage ? { borderColor: 'primary.main', bgcolor: 'primary.50' } : {},
                                  }}
                                >
                                  <LabelIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography variant="body2" fontWeight={600} noWrap>{t.name}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{t.code}</Typography>
                                  </Box>
                                  {!t.isActive && <Chip label="Inactive" size="small" sx={{ height: 18, fontSize: 10 }} />}
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        </>
                      )}
                      {typesByCategory(cat.id).length === 0 && (
                        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
                          No types configured for this category.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </CustomTabPanel>

          {/* Severity Levels */}
          <CustomTabPanel value={value} index={1}>
            <SectionIntro
              title="Severity Levels"
              description="Define severity levels and their SLA targets and escalation roles."
              canManage={canManage}
              onAdd={() => setSeverityDialog({ open: true, severity: null })}
              addLabel="Add Severity Level"
            />
            {severitiesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>
            ) : !severities || severities.length === 0 ? (
              <Alert severity="info">No severity levels configured yet.</Alert>
            ) : (
              <Grid container spacing={2}>
                {severities.map((sev) => (
                  <Grid item xs={12} md={6} key={sev.id}>
                    <Card variant="outlined" sx={{ borderLeft: 5, borderColor: sev.color || 'primary.main', borderRadius: 2, opacity: sev.isActive ? 1 : 0.6, height: '100%' }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography fontWeight={700}>{sev.name}</Typography>
                            <Chip label={sev.code} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: 11 }} />
                            {!sev.isActive && <Chip label="Inactive" size="small" />}
                          </Box>
                          {canManage && (
                            <IconButton size="small" onClick={() => setSeverityDialog({ open: true, severity: sev })} aria-label="Edit severity level">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                        <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block">Response</Typography>
                            <Typography variant="body2" fontWeight={600}>{sev.slaResponseHours ? `${sev.slaResponseHours}h` : '—'}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block">Investigation</Typography>
                            <Typography variant="body2" fontWeight={600}>{sev.slaInvestigationHours ? `${sev.slaInvestigationHours}h` : '—'}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block">CAPA</Typography>
                            <Typography variant="body2" fontWeight={600}>{sev.slaCapaDays ? `${sev.slaCapaDays}d` : '—'}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block">Closure</Typography>
                            <Typography variant="body2" fontWeight={600}>{sev.slaClosureDays ? `${sev.slaClosureDays}d` : '—'}</Typography>
                          </Box>
                        </Stack>
                        {sev.notifyRoles && sev.notifyRoles.length > 0 && (
                          <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {sev.notifyRoles.map((r) => (
                              <Chip key={r} label={r.replace(/_/g, ' ')} size="small" variant="outlined" clickable onClick={() => openRoleMembers(r)} />
                            ))}
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </CustomTabPanel>

          {/* Priority & Risk Matrix */}
          <CustomTabPanel value={value} index={2}>
            <SectionIntro
              title="Priority & Risk Matrix"
              description="Map likelihood × impact combinations to a risk level. Used to auto-score incident risk."
              canManage={false}
            />
            <RiskMatrixEditor />
          </CustomTabPanel>

          {/* Notification Rules */}
          <CustomTabPanel value={value} index={3}>
            <SectionIntro
              title="Notification Rules"
              description="Configure who gets notified when incident workflow events occur."
              canManage={canManage}
              onAdd={() => setRuleDialog({ open: true, rule: null })}
              addLabel="Add Rule"
            />
            {rulesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>
            ) : !notificationRules || notificationRules.length === 0 ? (
              <Alert severity="info">No notification rules configured yet.</Alert>
            ) : (
              <Stack spacing={1.5}>
                {notificationRules.map((rule) => (
                  <Card key={rule.id} variant="outlined" sx={{ borderRadius: 2, opacity: rule.isActive ? 1 : 0.6 }}>
                    <CardContent sx={{ pb: '16px !important' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'warning.50', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'warning.main' }}>
                            <NotificationsActiveIcon fontSize="small" />
                          </Box>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography fontWeight={700}>{rule.name}</Typography>
                              <Chip label={rule.triggerEvent.replace(/_/g, ' ')} size="small" color="primary" variant="outlined" />
                              <Chip label={rule.channel} size="small" variant="outlined" />
                              {!rule.isActive && <Chip label="Inactive" size="small" />}
                            </Box>
                            {rule.description && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{rule.description}</Typography>
                            )}
                            {rule.notifyRoles && rule.notifyRoles.length > 0 && (
                              <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {rule.notifyRoles.map((r) => (
                                  <Chip key={r} label={r.replace(/_/g, ' ')} size="small" variant="outlined" clickable onClick={() => openRoleMembers(r)} />
                                ))}
                              </Box>
                            )}
                          </Box>
                        </Box>
                        {canManage && (
                          <IconButton size="small" onClick={() => setRuleDialog({ open: true, rule })} aria-label="Edit notification rule">
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </CustomTabPanel>

          {/* Workflow Rules */}
          <CustomTabPanel value={value} index={4}>
            <SectionIntro
              title="Workflow Rules"
              description="Define automated assignment and approval rules for the incident workflow."
              canManage={false}
            />
            <Alert severity="info" icon={<AccountTreeIcon />}>
              Automated workflow rules (auto-assignment, approval routing) are not yet supported by the backend. The current workflow is driven by the fixed status state machine and role-based permissions.
            </Alert>
          </CustomTabPanel>

          {/* SLA Configuration */}
          <CustomTabPanel value={value} index={5}>
            <SectionIntro
              title="SLA Configuration"
              description="Response, investigation, CAPA, and closure SLA targets are configured per severity level."
              canManage={false}
            />
            <Alert severity="info" icon={<ScheduleIcon />} sx={{ mb: 2 }}>
              SLA thresholds are set per severity level rather than globally. Open the <strong>Severity Levels</strong> tab to edit response, investigation, CAPA, and closure targets for each severity.
            </Alert>
            {severities && severities.length > 0 && (
              <Grid container spacing={2}>
                {severities.map((sev) => (
                  <Grid item xs={12} sm={6} md={4} key={sev.id}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: sev.color || 'primary.main' }} />
                          <Typography fontWeight={700} variant="body2">{sev.name}</Typography>
                        </Box>
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">Response: <strong>{sev.slaResponseHours ? `${sev.slaResponseHours}h` : 'not set'}</strong></Typography>
                          <Typography variant="caption" color="text.secondary">Investigation: <strong>{sev.slaInvestigationHours ? `${sev.slaInvestigationHours}h` : 'not set'}</strong></Typography>
                          <Typography variant="caption" color="text.secondary">CAPA: <strong>{sev.slaCapaDays ? `${sev.slaCapaDays}d` : 'not set'}</strong></Typography>
                          <Typography variant="caption" color="text.secondary">Closure: <strong>{sev.slaClosureDays ? `${sev.slaClosureDays}d` : 'not set'}</strong></Typography>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </CustomTabPanel>

          {/* Role Assignments */}
          <CustomTabPanel value={value} index={6}>
            <SectionIntro
              title="Role Assignments"
              description="These are the incident-module notification roles (e.g. RISK_MANAGER) referenced by Severity Levels and Notification Rules — separate from platform login roles. Add, deactivate, and map users to them here."
              canManage={canManage}
              onAdd={() => setRoleDefDialog({ open: true, role: null })}
              addLabel="Add Role"
            />
            {notificationRolesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} /></Box>
            ) : !notificationRoles || notificationRoles.length === 0 ? (
              <Alert severity="info">No notification roles configured yet.</Alert>
            ) : (
              <Stack spacing={1.5}>
                {notificationRoles.map((r) => (
                  <Card key={r.id} variant="outlined" sx={{ borderRadius: 2, opacity: r.isActive ? 1 : 0.6 }}>
                    <CardContent sx={{ pb: '16px !important', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'info.50', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'info.main' }}>
                          <GroupsIcon fontSize="small" />
                        </Box>
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography fontWeight={700}>{r.name.replace(/_/g, ' ')}</Typography>
                            {!r.isActive && <Chip label="Inactive" size="small" />}
                          </Box>
                          {r.description && <Typography variant="caption" color="text.secondary">{r.description}</Typography>}
                        </Box>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Tooltip title={`${r.memberCount ?? 0} user${(r.memberCount ?? 0) === 1 ? '' : 's'} mapped to this role`}>
                          <Chip
                            label={`${r.memberCount ?? 0} member${(r.memberCount ?? 0) === 1 ? '' : 's'}`}
                            size="small"
                            color={(r.memberCount ?? 0) > 0 ? 'primary' : 'default'}
                            variant={(r.memberCount ?? 0) > 0 ? 'filled' : 'outlined'}
                          />
                        </Tooltip>
                        <Button size="small" variant="outlined" startIcon={<PeopleIcon fontSize="small" />} onClick={() => openRoleMembers(r.name)}>
                          Manage Members
                        </Button>
                        {canManage && (
                          <IconButton size="small" onClick={() => setRoleDefDialog({ open: true, role: r })} aria-label="Edit notification role">
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </CustomTabPanel>
        </Box>
      </Paper>

      <CategoryFormDialog
        open={categoryDialog.open}
        category={categoryDialog.category}
        onClose={() => setCategoryDialog({ open: false, category: null })}
      />
      <TypeFormDialog
        open={typeDialog.open}
        type={typeDialog.type}
        defaultCategoryId={typeDialog.defaultCategoryId}
        categories={categories || []}
        onClose={() => setTypeDialog({ open: false, type: null })}
      />
      <SeverityFormDialog
        open={severityDialog.open}
        severity={severityDialog.severity}
        onClose={() => setSeverityDialog({ open: false, severity: null })}
      />
      <NotificationRuleFormDialog
        open={ruleDialog.open}
        rule={ruleDialog.rule}
        onClose={() => setRuleDialog({ open: false, rule: null })}
      />
      <NotificationRoleDefFormDialog
        open={roleDefDialog.open}
        role={roleDefDialog.role}
        onClose={() => setRoleDefDialog({ open: false, role: null })}
      />
      <NotificationRoleMembersDialog
        open={memberDialog.open}
        role={matchedRole(memberDialog.roleName)}
        roleName={memberDialog.roleName}
        canManage={canManage}
        onClose={() => setMemberDialog({ open: false, roleName: '' })}
      />
    </Box>
  );
}
