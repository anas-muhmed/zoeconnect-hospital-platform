'use client';

import React, { useState } from 'react';
import { Typography, Box, Grid, Alert, Chip } from '@mui/material';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import PriorityHighOutlinedIcon from '@mui/icons-material/PriorityHighOutlined';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import PageHeader from '../../../../components/PageHeader';
import { StatCard } from '../../../../components/incident/StatCard';
import { DashboardPanel } from '../../../../components/incident/DashboardPanel';
import { DateRangeFilter, DateRange } from '../../../../components/incident/DateRangeFilter';
import { DepartmentHeatmap } from '../../../../components/incident/DepartmentHeatmap';
import { NearMissRatioGauge } from '../../../../components/incident/NearMissRatioGauge';
import { LessonsLearnedList } from '../../../../components/incident/LessonsLearnedList';
import {
  useIncidentDashboardExecutive, useIncidentDashboardSla, useIncidentDashboardCapa,
  useIncidentDashboardHeatmap, useIncidentDashboardNearMiss, useIncidentDashboardLessons,
} from '../../../../hooks/incident/use-incident-dashboard';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const SEVERITY_COLORS: Record<string, string> = {
  LOW: '#4caf50',
  MODERATE: '#ff9800',
  MEDIUM: '#ff9800',
  HIGH: '#f44336',
  CRITICAL: '#b71c1c',
  SENTINEL: '#000000',
};

const CAPA_STATUS_COLORS: Record<string, string> = {
  PENDING: '#9e9e9e',
  IN_PROGRESS: '#2196f3',
  COMPLETED: '#4caf50',
  REJECTED: '#f44336',
  REOPENED: '#ff9800',
};

export default function IncidentDashboardPage() {
  const [range, setRange] = useState<DateRange>({});

  const { data: exec, isLoading: isExecLoading, error: execError } = useIncidentDashboardExecutive(range);
  const { data: sla, isLoading: isSlaLoading } = useIncidentDashboardSla();
  const { data: capa, isLoading: isCapaLoading } = useIncidentDashboardCapa();
  const { data: heatmap, isLoading: isHeatmapLoading } = useIncidentDashboardHeatmap(range);
  const { data: nearMiss, isLoading: isNearMissLoading } = useIncidentDashboardNearMiss(range);
  const { data: lessons, isLoading: isLessonsLoading } = useIncidentDashboardLessons(5);

  if (execError) {
    return <Alert severity="error">Failed to load dashboard data.</Alert>;
  }

  const kpis = [
    { label: 'Total Incidents', value: exec?.totalIncidents ?? 0, icon: <FolderOpenOutlinedIcon fontSize="small" />, color: 'primary' as const },
    { label: 'Open Incidents', value: exec?.openIncidents ?? 0, icon: <AssignmentLateOutlinedIcon fontSize="small" />, color: 'warning' as const },
    { label: 'Critical / Sentinel', value: exec?.criticalIncidents ?? 0, icon: <PriorityHighOutlinedIcon fontSize="small" />, color: 'error' as const },
    { label: 'CAPA Overdue', value: capa?.overdueCount ?? 0, icon: <ReportProblemOutlinedIcon fontSize="small" />, color: (capa?.overdueCount ?? 0) > 0 ? 'error' as const : 'success' as const },
    { label: 'SLA Breaches (Closure)', value: sla?.closureBreached ?? 0, icon: <RuleOutlinedIcon fontSize="small" />, color: (sla?.closureBreached ?? 0) > 0 ? 'warning' as const : 'success' as const },
    { label: 'Near-Miss Ratio', value: nearMiss ? `${Math.round((nearMiss.ratio || 0) * 100)}%` : '—', icon: <HealthAndSafetyOutlinedIcon fontSize="small" />, color: 'info' as const },
  ];

  const slaData = [
    { name: 'Response', breached: sla?.responseBreached || 0, met: sla?.responseMet || 0 },
    { name: 'Investigation', breached: sla?.investigationBreached || 0, met: sla?.investigationMet || 0 },
    { name: 'CAPA', breached: sla?.capaBreached || 0, met: sla?.capaMet || 0 },
    { name: 'Closure', breached: sla?.closureBreached || 0, met: sla?.closureMet || 0 },
  ];

  return (
    <Box>
      <PageHeader
        title="Incident Dashboard"
        subtitle="Executive KPIs and real-time incident monitoring"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        {/* KPI row */}
        {kpis.map((kpi) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={kpi.label}>
            <StatCard label={kpi.label} value={kpi.value} icon={kpi.icon} color={kpi.color} />
          </Grid>
        ))}

        {/* SLA + Severity */}
        <Grid item xs={12} md={6}>
          <DashboardPanel title="SLA Compliance" subtitle="Met vs. breached by stage" height={340} isLoading={isSlaLoading}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slaData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <XAxis dataKey="name" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="met" stackId="a" fill="#4caf50" name="Met" radius={[0, 0, 0, 0]} />
                <Bar dataKey="breached" stackId="a" fill="#f44336" name="Breached" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DashboardPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <DashboardPanel
            title="Severity Distribution"
            subtitle="Incidents by severity level"
            height={340}
            isLoading={isExecLoading}
            isEmpty={!exec?.severityDistribution?.length}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={exec?.severityDistribution || []} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <XAxis dataKey="severity" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <RechartsTooltip />
                <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                  {(exec?.severityDistribution || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.severity?.toUpperCase()] || '#8884d8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </DashboardPanel>
        </Grid>

        {/* Heatmap + Near-miss */}
        <Grid item xs={12} md={7}>
          <DashboardPanel
            title="Department × Severity Heatmap"
            subtitle="Where incidents are concentrated"
            isLoading={isHeatmapLoading}
            isEmpty={!heatmap?.length}
          >
            <DepartmentHeatmap data={heatmap || []} />
          </DashboardPanel>
        </Grid>

        <Grid item xs={12} md={5}>
          <DashboardPanel
            title="Near-Miss Ratio"
            subtitle="Safety-reporting culture indicator"
            isLoading={isNearMissLoading}
            isEmpty={!nearMiss || nearMiss.total === 0}
          >
            {nearMiss && (
              <NearMissRatioGauge
                total={nearMiss.total}
                nearMiss={nearMiss.nearMiss}
                actualIncidents={nearMiss.actualIncidents}
                ratio={nearMiss.ratio}
              />
            )}
          </DashboardPanel>
        </Grid>

        {/* CAPA effectiveness + Lessons learned */}
        <Grid item xs={12} md={6}>
          <DashboardPanel
            title="CAPA Effectiveness"
            subtitle="Status distribution of corrective/preventive actions"
            height={320}
            isLoading={isCapaLoading}
            isEmpty={!capa?.statusDistribution?.length}
          >
            <Box sx={{ display: 'flex', height: '100%', alignItems: 'center' }}>
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie
                    data={capa?.statusDistribution || []}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {(capa?.statusDistribution || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={CAPA_STATUS_COLORS[entry.status] || '#8884d8'} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {(capa?.statusDistribution || []).map((entry: any) => (
                  <Box key={entry.status} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: CAPA_STATUS_COLORS[entry.status] || '#8884d8' }} />
                    <Typography variant="caption">{entry.status}</Typography>
                    <Chip label={entry.count} size="small" sx={{ height: 18, fontSize: 11 }} />
                  </Box>
                ))}
              </Box>
            </Box>
          </DashboardPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <DashboardPanel
            title="Recent Lessons Learned"
            subtitle="From closed incidents"
            height={320}
            isLoading={isLessonsLoading}
            isEmpty={!lessons?.length}
          >
            <Box sx={{ height: '100%', overflowY: 'auto' }}>
              <LessonsLearnedList data={lessons || []} />
            </Box>
          </DashboardPanel>
        </Grid>
      </Grid>
    </Box>
  );
}
