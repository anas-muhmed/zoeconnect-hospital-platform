'use client';

import React, { useState } from 'react';
import {
  Typography, Box, Paper, Tabs, Tab, Grid, CircularProgress, Divider, Button, Alert,
  Chip, Stack, IconButton, Tooltip, alpha, useTheme,
  DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import ResponsiveDialog from '../../../../components/ResponsiveDialog';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PageHeader from '../../../../components/PageHeader';
import { InfoTile } from '../../../../components/incident/InfoTile';
import { EmployeeName } from '../../../../components/incident/EmployeeName';
import { useIncident, useIncidentTimeline, useIncidentWorkflow } from '../../../../hooks/incident/use-incident';
import { useIncidentInvestigations, useIncidentRcas, useIncidentCapas, useIncidentVerifications, useIncidentFiveWhys, useIncidentFishbone, useCreateInvestigation, useCreateRca, useUpdateRca } from '../../../../hooks/incident/use-incident-investigation';
import { useQueryClient } from '@tanstack/react-query';
import { useIncidentTriage, useBeginContainment } from '../../../../hooks/incident/use-incident-triage';
import { IncidentStatusChip } from '../../../../components/incident/IncidentStatusChip';
import { SeverityBadge } from '../../../../components/incident/SeverityBadge';
import { RiskBadge } from '../../../../components/incident/RiskBadge';
import { IncidentTimeline } from '../../../../components/incident/IncidentTimeline';
import { AttachmentManager } from '../../../../components/incident/AttachmentManager';
import { InvestigationCard } from '../../../../components/incident/InvestigationCard';
import { IncidentWorkflowStatus } from '../../../../components/incident/IncidentWorkflowStatus';
import { RcaFiveWhy } from '../../../../components/incident/RcaFiveWhy';
import { RcaFishbone } from '../../../../components/incident/RcaFishbone';
import { CapaCard } from '../../../../components/incident/CapaCard';
import { CapaFormDialog } from '../../../../components/incident/CapaFormDialog';
import { VerificationPanel } from '../../../../components/incident/VerificationPanel';
import { VerificationFormDialog } from '../../../../components/incident/VerificationFormDialog';
import { ClosureFormDialog } from '../../../../components/incident/ClosureFormDialog';
import { AssignInvestigatorDialog } from '../../../../components/incident/AssignInvestigatorDialog';
import { ReopenDialog } from '../../../../components/incident/ReopenDialog';
import { CommentThread } from '../../../../components/incident/CommentThread';
import { TriageForm } from '../../../../components/incident/TriageForm';
import { incidentApi } from '../../../../lib/api/incident.api';
import { useAuthStore } from '../../../../lib/store/auth.store';
import { INCIDENT_PERMISSIONS } from '../../../../lib/constants/incident-permissions';
import { getNextStepMessage } from '../../../../lib/utils/incident-workflow';
import { IncidentCapa } from '../../../../types/incident.types';
import { getApiErrorMessage } from '../../../../lib/utils/api-error';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} id={`incident-tabpanel-${index}`} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const PRE_ASSIGNMENT_STATUSES = ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED'];

function TriageTabContent({ incidentId, severityCode, status, canManage }: { incidentId: string; severityCode: string; status: string; canManage: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: triage, isLoading } = useIncidentTriage(incidentId);
  const beginContainment = useBeginContainment(incidentId);
  const isMandatory = severityCode === 'CRITICAL' || severityCode === 'HIGH';
  const notYetAssigned = PRE_ASSIGNMENT_STATUSES.includes(status);
  const canCreateNow = status === 'ASSIGNED';

  if (isLoading) return <CircularProgress />;

  // Triage can only be created once the incident has an assigned investigator.
  // Creating it earlier is rejected by the backend state machine (must reach ASSIGNED first).
  if (!triage && notYetAssigned) {
    return (
      <Alert severity="info">
        Triage becomes available once this incident has been submitted, acknowledged, and assigned to an investigator.
        Current stage: {status}.
      </Alert>
    );
  }

  const handleBeginContainment = () => {
    beginContainment.mutate(undefined, {
      onSuccess: () => enqueueSnackbar(`Containment started. Next: ${getNextStepMessage('CONTAINMENT')}`, { variant: 'success' }),
      onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Failed to start containment'), { variant: 'error' }),
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {isMandatory && !triage && (
        <Alert severity="warning">
          Triage is mandatory for {severityCode} severity incidents before investigation can proceed.
        </Alert>
      )}
      {!triage && !canCreateNow && !notYetAssigned && (
        <Alert severity="info">
          This incident moved past the Assigned stage without a triage record — it was skipped or already handled elsewhere.
        </Alert>
      )}
      {!canManage && !triage && (
        <Typography color="text.secondary">No triage assessment recorded yet.</Typography>
      )}
      {(canManage || triage) && (canCreateNow || triage) && (
        <TriageForm incidentId={incidentId} triage={triage || undefined} readOnly={!canManage} />
      )}
      {status === 'TRIAGE' && triage?.containmentRequired && (
        <Alert
          severity="warning"
          action={
            canManage && (
              <Button color="inherit" size="small" variant="outlined" disabled={beginContainment.isPending} onClick={handleBeginContainment}>
                Begin Containment
              </Button>
            )
          }
        >
          This triage flagged containment as required. The incident stays in Triage until containment is started.
        </Alert>
      )}
      {status === 'CONTAINMENT' && (
        <Alert severity="info">
          Containment is in progress{triage?.containmentNotes ? `: ${triage.containmentNotes}` : ''}. Start the
          Investigation (Investigation tab) once containment measures are complete.
        </Alert>
      )}
    </Box>
  );
}

const INVESTIGATION_ELIGIBLE_STATUSES = ['ASSIGNED', 'TRIAGE', 'CONTAINMENT'];

function InvestigationTabContent({
  incidentId, status, createdById, investigations, canManage,
}: {
  incidentId: string; status: string; createdById?: string; investigations: any[]; canManage: boolean;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const canStartNow = INVESTIGATION_ELIGIBLE_STATUSES.includes(status);
  const hasOpenInvestigation = investigations.some((inv) => inv.status !== 'COMPLETED');
  const createInvestigation = useCreateInvestigation(incidentId);

  // Bug fix (rca-capa-tab-reset, 2026-07-31): this used to call the API
  // directly and follow up with `window.location.reload()` -- a full page
  // reload remounts IncidentDetailPage from scratch, resetting its tab
  // `useState(0)` back to Overview, so starting an investigation while on
  // this tab bounced the user back to Overview and made them navigate back
  // here to keep working. `useCreateInvestigation` already invalidates the
  // right query keys (investigations + timeline) on success, so the list
  // refreshes in place without leaving this tab.
  const handleStart = () => {
    createInvestigation.mutate(
      { title: 'Initial Investigation', leadId: createdById || '00000000-0000-0000-0000-000000000000' },
      {
        onSuccess: () => enqueueSnackbar(`Investigation started. Next: ${getNextStepMessage('INVESTIGATION')}`, { variant: 'success' }),
        onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Failed to start investigation'), { variant: 'error' }),
      },
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Investigations</Typography>
        {canManage && !hasOpenInvestigation && canStartNow && (
          <Button variant="contained" color="primary" onClick={handleStart}>
            Start Investigation
          </Button>
        )}
      </Box>
      {canManage && !hasOpenInvestigation && !canStartNow && investigations.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Investigation can begin once the incident is Assigned{status === 'DRAFT' || status === 'SUBMITTED' || status === 'ACKNOWLEDGED' ? ' to an investigator' : ' (and triage/containment, if applicable, are complete)'}.
          Current stage: {status}.
        </Alert>
      )}
      {investigations.length > 0 ? (
        investigations.map((inv: any) => (
          <InvestigationCard key={inv.id} incidentId={incidentId} investigation={inv} readOnly={!canManage} />
        ))
      ) : (
        <Typography color="text.secondary">No investigations started.</Typography>
      )}
    </Box>
  );
}

function CapaTabContent({ incidentId, canManage, onVerifyCapa, canVerify }: { incidentId: string; canManage: boolean; onVerifyCapa: (capa: IncidentCapa) => void; canVerify: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: capas, isLoading } = useIncidentCapas(incidentId);
  const { data: rcas } = useIncidentRcas(incidentId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  if (isLoading) return <CircularProgress />;

  // Backend does not currently gate CAPA creation/completion on RCA status
  // (any CAPA_MANAGE user can add or complete a CAPA at any incident
  // stage) -- by design, teams may want to draft CAPAs proactively while
  // RCA is still in progress. This banner just makes that state visible
  // rather than silently letting CAPA get ahead of RCA.
  const rca = rcas?.[0];
  const rcaNotCompleted = !!rca && rca.status !== 'COMPLETED';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {rcaNotCompleted && (
        <Alert severity="warning">
          Root Cause Analysis is not completed yet (status: {rca.status.replace('_', ' ')}). CAPAs added now can
          proceed, but consider completing the RCA first so corrective actions are grounded in a confirmed root cause.
        </Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">CAPAs</Typography>
        {canManage && (
          <Button variant="contained" onClick={() => setDialogOpen(true)}>
            Add CAPA
          </Button>
        )}
      </Box>
      {capas && capas.length > 0 ? (
        capas.map((capa: IncidentCapa) => (
          <Box key={capa.id}>
            <CapaCard
              capa={capa}
              readOnly={!canManage}
              // Bug fix (rca-capa-tab-reset, 2026-07-31): was
              // `.then(() => window.location.reload())` -- a full page
              // reload remounts IncidentDetailPage, resetting its tab state
              // back to Overview. Invalidating the same query keys
              // `useUpdateCapa`'s onSuccess would (capaId varies per row
              // here, so that hook can't be called per-map-iteration --
              // rules of hooks -- hence the manual invalidate instead of
              // switching to the hook) refreshes this list in place.
              onUpdateStatus={canManage ? (status) => incidentApi.updateCapa(incidentId, capa.id, { status: status as any })
                .then(() => {
                  // Bug fix (rca-complete-stale-list, 2026-07-31): narrow
                  // per-feature invalidation left the Incident Management
                  // table stale after status changes here (same root cause
                  // as the RCA-completion delay) -- invalidate the shared
                  // `['incidents']` prefix so list, detail, and this tab
                  // all refresh together.
                  queryClient.invalidateQueries({ queryKey: ['incidents'] });

                  if (status === 'COMPLETED') {
                    const others = (capas || []).filter((c) => c.id !== capa.id);
                    const allOthersDone = others.every((c) => c.status === 'COMPLETED' || c.status === 'REJECTED');
                    enqueueSnackbar(
                      allOthersDone
                        ? `CAPA completed — all CAPAs are now done, incident should move to Verification. Next: ${getNextStepMessage('VERIFICATION')}`
                        : `CAPA completed. ${others.filter((c) => c.status !== 'COMPLETED' && c.status !== 'REJECTED').length} CAPA(s) still need to be completed before Verification.`,
                      { variant: 'success' },
                    );
                  } else {
                    enqueueSnackbar('CAPA marked in progress. Next: complete the action and mark it Completed.', { variant: 'success' });
                  }
                })
                .catch((e) => enqueueSnackbar(getApiErrorMessage(e, 'Failed to update CAPA status'), { variant: 'error' })) : undefined}
            />
            {canVerify && capa.status === 'COMPLETED' && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1, mb: 2 }}>
                <Button size="small" variant="outlined" onClick={() => onVerifyCapa(capa)}>
                  Verify This CAPA
                </Button>
              </Box>
            )}
          </Box>
        ))
      ) : (
        <Typography color="text.secondary">No CAPAs defined.</Typography>
      )}
      <CapaFormDialog incidentId={incidentId} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </Box>
  );
}

function VerificationTabContent({ incidentId, canVerify, onVerify }: { incidentId: string; canVerify: boolean; onVerify: (capa: IncidentCapa) => void }) {
  const { data: verifications, isLoading: vLoad } = useIncidentVerifications(incidentId);
  const { data: capas, isLoading: cLoad } = useIncidentCapas(incidentId);
  const verifiedCapaIds = new Set((verifications || []).filter((v) => v.outcome === 'APPROVED').map((v) => v.capaId));
  const nextCapa = capas?.find((c) => c.status === 'COMPLETED' && !verifiedCapaIds.has(c.id)) || null;

  if (vLoad || cLoad) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h6" mb={2}>Verifications</Typography>
      {canVerify && !nextCapa && (
        <Typography variant="body2" color="text.secondary" mb={2}>
          No completed CAPA is currently awaiting verification.
        </Typography>
      )}
      <VerificationPanel
        verifications={verifications || []}
        canVerify={canVerify && !!nextCapa}
        onVerify={() => nextCapa && onVerify(nextCapa)}
      />
    </Box>
  );
}

export default function IncidentDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [value, setValue] = useState(0);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [closureOpen, setClosureOpen] = useState(false);
  const [verifyingCapa, setVerifyingCapa] = useState<IncidentCapa | null>(null);

  const { data: incident, isLoading } = useIncident(id);
  const { data: investigations } = useIncidentInvestigations(id);
  const { data: timelineEvents } = useIncidentTimeline(id);

  const { submit, acknowledge } = useIncidentWorkflow(id);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();

  const canUpdate = hasPermission(INCIDENT_PERMISSIONS.UPDATE);
  const canAssign = hasPermission(INCIDENT_PERMISSIONS.ASSIGN);
  const canClose = hasPermission(INCIDENT_PERMISSIONS.CLOSE);
  const canInvestigate = hasPermission(INCIDENT_PERMISSIONS.INVESTIGATE);
  const canManageRca = hasPermission(INCIDENT_PERMISSIONS.RCA_MANAGE);
  const canManageCapa = hasPermission(INCIDENT_PERMISSIONS.CAPA_MANAGE);
  const canVerify = hasPermission(INCIDENT_PERMISSIONS.VERIFY);

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  }

  if (!incident) {
    return <Typography>Incident not found.</Typography>;
  }

  const anySlaBreached = incident.slaResponseBreached || incident.slaInvestigationBreached || incident.slaCapaBreached || incident.slaClosureBreached;

  const handleCopyNumber = () => {
    navigator.clipboard.writeText(incident.incidentNumber).then(() => {
      enqueueSnackbar('Incident number copied', { variant: 'success' });
    });
  };

  return (
    <Box>
      <PageHeader
        title={`Incident ${incident.incidentNumber}`}
        subtitle={`Reported on ${format(new Date(incident.createdAt), 'PPP')}`}
        actions={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Tooltip title="Copy incident number">
              <IconButton size="small" onClick={handleCopyNumber} aria-label="Copy incident number">
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {incident.status === 'DRAFT' && canUpdate && (
              <Button
                variant="outlined"
                size="small"
                disabled={submit.isPending}
                onClick={() =>
                  submit.mutate(undefined, {
                    onSuccess: () => enqueueSnackbar(`Incident submitted. Next: ${getNextStepMessage('SUBMITTED')}`, { variant: 'success' }),
                    onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Failed to submit incident'), { variant: 'error' }),
                  })
                }
              >
                Submit
              </Button>
            )}
            {incident.status === 'SUBMITTED' && canAssign && (
              <Button
                variant="outlined"
                size="small"
                disabled={acknowledge.isPending}
                onClick={() =>
                  acknowledge.mutate(undefined, {
                    onSuccess: () => enqueueSnackbar(`Incident acknowledged. Next: ${getNextStepMessage('ACKNOWLEDGED')}`, { variant: 'success' }),
                    onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Failed to acknowledge incident'), { variant: 'error' }),
                  })
                }
              >
                Acknowledge
              </Button>
            )}
            {['ACKNOWLEDGED', 'ASSIGNED', 'TRIAGE', 'CONTAINMENT', 'INVESTIGATION'].includes(incident.status) && canAssign && (
              <Button variant="outlined" size="small" onClick={() => setAssignOpen(true)}>
                Assign Investigator
              </Button>
            )}
            {incident.status === 'VERIFICATION' && canClose && (
              <Button variant="contained" size="small" color="success" onClick={() => setClosureOpen(true)}>
                Close Incident
              </Button>
            )}
            {incident.status === 'CLOSED' && canClose && (
              <Button variant="outlined" size="small" color="warning" onClick={() => setReopenOpen(true)}>
                Reopen
              </Button>
            )}
            <IncidentStatusChip status={incident.status} />
            <SeverityBadge level={incident.severityCode} />
          </Box>
        }
      />

      {/* Context badges — near-miss / sentinel / anonymous / SLA breach */}
      {(incident.isNearMiss || incident.isSentinelEvent || incident.isAnonymous || anySlaBreached) && (
        <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1} sx={{ mb: 2 }}>
          {incident.isSentinelEvent && (
            <Chip size="small" icon={<ReportProblemOutlinedIcon />} label="Sentinel Event" color="error" variant="filled" />
          )}
          {incident.isNearMiss && (
            <Chip size="small" icon={<HealthAndSafetyOutlinedIcon />} label="Near Miss" color="success" variant="outlined" />
          )}
          {incident.isAnonymous && (
            <Chip size="small" icon={<VisibilityOffOutlinedIcon />} label="Reported Anonymously" variant="outlined" />
          )}
          {anySlaBreached && (
            <Chip size="small" icon={<WarningAmberOutlinedIcon />} label="SLA Breached" color="warning" variant="filled" />
          )}
        </Stack>
      )}

      <IncidentWorkflowStatus status={incident.status} timelineEvents={timelineEvents || []} />

      <Paper sx={{ mt: 1, width: '100%', borderRadius: 3, overflow: 'hidden' }} variant="outlined">
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
          <Tabs value={value} onChange={(e, v) => setValue(v)} variant="scrollable" scrollButtons="auto">
            <Tab label="Overview" icon={<DescriptionOutlinedIcon fontSize="small" />} iconPosition="start" />
            <Tab label="Triage" icon={<FactCheckOutlinedIcon fontSize="small" />} iconPosition="start" />
            <Tab label="Investigation" icon={<SearchOutlinedIcon fontSize="small" />} iconPosition="start" />
            <Tab label="RCA" icon={<PsychologyOutlinedIcon fontSize="small" />} iconPosition="start" />
            <Tab label="CAPA" icon={<TaskAltOutlinedIcon fontSize="small" />} iconPosition="start" />
            <Tab label="Verification" icon={<VerifiedOutlinedIcon fontSize="small" />} iconPosition="start" />
            <Tab label="Timeline" icon={<HistoryOutlinedIcon fontSize="small" />} iconPosition="start" />
            <Tab label="Attachments" icon={<AttachFileOutlinedIcon fontSize="small" />} iconPosition="start" />
            <Tab label="Audit & Comments" icon={<ForumOutlinedIcon fontSize="small" />} iconPosition="start" />
          </Tabs>
        </Box>

        <CustomTabPanel value={value} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={3}>
              <InfoTile icon={<FlagOutlinedIcon fontSize="small" />} label="Priority" value={incident.priorityCode} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <InfoTile icon={<BusinessOutlinedIcon fontSize="small" />} label="Department" value={incident.department} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <InfoTile icon={<WarningAmberOutlinedIcon fontSize="small" />} label="Risk Score" value={<RiskBadge score={incident.riskScore} level={incident.riskLevel} />} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <InfoTile icon={<EventOutlinedIcon fontSize="small" />} label="Date of Incident" value={format(new Date(incident.incidentDate), 'PPP p')} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <InfoTile icon={<CategoryOutlinedIcon fontSize="small" />} label="Category" value={incident.category?.name || incident.categoryId} />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <InfoTile icon={<LabelOutlinedIcon fontSize="small" />} label="Type" value={incident.type?.name || incident.typeId} />
            </Grid>
            {incident.ward && (
              <Grid item xs={12} sm={6} md={3}>
                <InfoTile icon={<BusinessOutlinedIcon fontSize="small" />} label="Ward" value={incident.ward} />
              </Grid>
            )}
            {!incident.isAnonymous && (
              <Grid item xs={12} sm={6} md={3}>
                <InfoTile icon={<PersonOutlineIcon fontSize="small" />} label="Reported By" value={<EmployeeName id={incident.reporterId} variant="body2" fontWeight={600} />} />
              </Grid>
            )}

            {incident.tags && incident.tags.length > 0 && (
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>Tags</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                  {incident.tags.map((tag) => <Chip key={tag} label={tag} size="small" variant="outlined" />)}
                </Stack>
              </Grid>
            )}

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary">Description</Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{incident.description}</Typography>
            </Grid>
            {incident.immediateAction && (
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Immediate Action Taken</Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{incident.immediateAction}</Typography>
              </Grid>
            )}
          </Grid>
        </CustomTabPanel>

        <CustomTabPanel value={value} index={1}>
          <TriageTabContent incidentId={id} severityCode={incident.severityCode} status={incident.status} canManage={canInvestigate} />
        </CustomTabPanel>

        <CustomTabPanel value={value} index={2}>
          <InvestigationTabContent
            incidentId={id}
            status={incident.status}
            createdById={incident.createdById}
            investigations={investigations || []}
            canManage={canInvestigate}
          />
        </CustomTabPanel>

        <CustomTabPanel value={value} index={3}>
          <RcaTabContent incidentId={id} status={incident.status} canManage={canManageRca} />
        </CustomTabPanel>

        <CustomTabPanel value={value} index={4}>
          <CapaTabContent
            incidentId={id}
            canManage={canManageCapa}
            canVerify={canVerify}
            onVerifyCapa={(capa) => setVerifyingCapa(capa)}
          />
        </CustomTabPanel>

        <CustomTabPanel value={value} index={5}>
          <VerificationTabContent
            incidentId={id}
            canVerify={canVerify}
            onVerify={(capa) => setVerifyingCapa(capa)}
          />
        </CustomTabPanel>

        <CustomTabPanel value={value} index={6}>
          <IncidentTimeline events={timelineEvents || []} />
        </CustomTabPanel>

        <CustomTabPanel value={value} index={7}>
          <AttachmentManager incidentId={id} parentType="INCIDENT" parentId={id} />
        </CustomTabPanel>

        <CustomTabPanel value={value} index={8}>
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom>Comments</Typography>
            <CommentThread incidentId={id} />
          </Box>
          <Typography variant="h6" gutterBottom>Audit Trail</Typography>
          <IncidentTimeline events={timelineEvents || []} />
        </CustomTabPanel>
      </Paper>

      <AssignInvestigatorDialog incidentId={id} open={assignOpen} onClose={() => setAssignOpen(false)} />
      <ReopenDialog incidentId={id} open={reopenOpen} onClose={() => setReopenOpen(false)} />
      <ClosureFormDialog incidentId={id} open={closureOpen} onClose={() => setClosureOpen(false)} />
      <VerificationFormDialog
        incidentId={id}
        capa={verifyingCapa}
        open={!!verifyingCapa}
        onClose={() => setVerifyingCapa(null)}
      />
    </Box>
  );
}

function RcaTabContent({ incidentId, status, canManage }: { incidentId: string; status: string; canManage: boolean }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: rcas, isLoading } = useIncidentRcas(incidentId);
  const rca = rcas?.[0]; // Usually one RCA per incident
  const { data: fiveWhys } = useIncidentFiveWhys(incidentId, rca?.id || '');
  const { data: fishbone } = useIncidentFishbone(incidentId, rca?.id || '');
  const createRca = useCreateRca(incidentId);
  const updateRca = useUpdateRca(incidentId, rca?.id || '');
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);

  // Backend's create-RCA endpoint doesn't check incident.status, so nothing
  // stops "Start RCA" from being clicked on an incident that never left
  // DRAFT (seen in practice: it creates an orphan RCA row that can never be
  // completed, since RCA_PENDING -> CAPA_PENDING is the only valid target
  // for that transition). Gate the button here instead so the incident has
  // actually reached the point where an RCA makes sense.
  const canStartRca = status === 'INVESTIGATION' || status === 'RCA_PENDING';

  if (isLoading) return <CircularProgress />;
  if (!rca) {
    return (
      <Box>
        <Typography color="text.secondary" mb={2}>No RCA started.</Typography>
        {canManage && (
          <Tooltip title={canStartRca ? '' : `Incident must be in Investigation or RCA Pending to start an RCA (currently ${status.replace('_', ' ')})`}>
            <span>
              <Button
                variant="contained"
                disabled={!canStartRca || createRca.isPending}
                // Bug fix (rca-capa-tab-reset, 2026-07-31): was
                // `.then(() => window.location.reload())` -- the full page
                // reload remounted IncidentDetailPage, resetting its tab
                // `useState(0)` back to Overview right after starting an RCA, so
                // the user had to navigate back to this tab to keep working.
                // `useCreateRca` invalidates both `detail` and `rcas` on
                // success, so this list refreshes in place without leaving the
                // tab.
                onClick={() =>
                  createRca.mutate(
                    { method: 'FIVE_WHY' },
                    {
                      onSuccess: () => enqueueSnackbar('RCA started. Next: add a 5 Why analysis with a confirmed root cause, then mark the RCA complete.', { variant: 'success' }),
                      onError: (e) => enqueueSnackbar(getApiErrorMessage(e, 'Failed to start RCA'), { variant: 'error' }),
                    },
                  )
                }
              >
                Start RCA
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>
    );
  }

  const hasRootCause = !!rca.rootCause;
  // The backend only allows RCA_PENDING -> CAPA_PENDING; completing an RCA
  // whose incident is at any other stage (e.g. still DRAFT, because it was
  // started too early per the gap above) will 400. Mirror that constraint
  // here instead of letting the click round-trip to the server to fail.
  const canCompleteRca = status === 'RCA_PENDING';

  const handleConfirmComplete = async () => {
    try {
      await updateRca.mutateAsync({ status: 'COMPLETED' });
      enqueueSnackbar(`RCA marked complete — incident moved to CAPA Pending. Next: ${getNextStepMessage('CAPA_PENDING')}`, { variant: 'success' });
      setConfirmCompleteOpen(false);
    } catch (e) {
      enqueueSnackbar(getApiErrorMessage(e, 'Failed to complete RCA'), { variant: 'error' });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Root Cause Analysis</Typography>
        {canManage && rca.status !== 'COMPLETED' && (
          <Tooltip
            title={
              !canCompleteRca
                ? `Incident is currently ${status.replace('_', ' ')} — it must be in RCA Pending to complete the RCA`
                : hasRootCause ? '' : 'Add at least one 5 Why analysis with a root cause before completing'
            }
          >
            <span>
              <Button
                variant="contained"
                color="success"
                disabled={!hasRootCause || !canCompleteRca}
                onClick={() => setConfirmCompleteOpen(true)}
              >
                Mark RCA Complete
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>
      <RcaFiveWhy incidentId={incidentId} rca={rca} fiveWhys={fiveWhys || []} />
      <RcaFishbone incidentId={incidentId} rca={rca} nodes={fishbone || []} />

      <ResponsiveDialog open={confirmCompleteOpen} onClose={() => setConfirmCompleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Complete Root Cause Analysis?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will mark the RCA as Completed and move the incident from RCA Pending to CAPA Pending.
            Root cause on record: "{rca.rootCause}". This cannot be undone from here — corrective actions
            will need to be added next.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCompleteOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" disabled={updateRca.isPending} onClick={handleConfirmComplete}>
            Confirm Complete
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </Box>
  );
}
