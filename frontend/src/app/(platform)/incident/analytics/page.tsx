'use client';

import React, { useMemo, useState } from 'react';
import { Typography, Box, Grid, ToggleButtonGroup, ToggleButton } from '@mui/material';
import PageHeader from '../../../../components/PageHeader';
import { DashboardPanel } from '../../../../components/incident/DashboardPanel';
import { DateRangeFilter, DateRange } from '../../../../components/incident/DateRangeFilter';
import { RepeatIncidentsTable } from '../../../../components/incident/RepeatIncidentsTable';
import { InvestigationTimeStats } from '../../../../components/incident/InvestigationTimeStats';
import {
  useIncidentAnalyticsTrends, useIncidentAnalyticsCategories, useIncidentDashboardWorkload,
  useIncidentAnalyticsRepeatIncidents, useIncidentAnalyticsInvestigationTime, useIncidentAnalyticsSentinelEvents,
} from '../../../../hooks/incident/use-incident-dashboard';
import { useIncidentCategories } from '../../../../hooks/incident/use-incident-settings';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#f44336', '#4caf50'];

type Granularity = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export default function IncidentAnalyticsPage() {
  const [range, setRange] = useState<DateRange>({});
  const [granularity, setGranularity] = useState<Granularity>('MONTHLY');

  const { data: trends, isLoading: trendsLoading } = useIncidentAnalyticsTrends({ ...range, granularity });
  const { data: categories, isLoading: categoriesLoading } = useIncidentAnalyticsCategories(range);
  const { data: workload, isLoading: workloadLoading } = useIncidentDashboardWorkload();
  const { data: repeatIncidents, isLoading: repeatLoading } = useIncidentAnalyticsRepeatIncidents(range);
  const { data: investigationTime, isLoading: investigationTimeLoading } = useIncidentAnalyticsInvestigationTime(range);
  const { data: sentinelTrend, isLoading: sentinelLoading } = useIncidentAnalyticsSentinelEvents(range);
  const { data: incidentCategories } = useIncidentCategories();

  const categoryNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (incidentCategories || []).forEach((c: any) => { map[c.id] = c.name; });
    return map;
  }, [incidentCategories]);

  const sentinelChartData = (sentinelTrend || []).map((row: any) => ({
    month: row.month ? new Date(row.month).toLocaleString('default', { month: 'short', year: 'numeric' }) : '—',
    count: parseInt(row.sentinel_count || '0', 10),
  }));

  return (
    <Box>
      <PageHeader
        title="Incident Analytics"
        subtitle="Detailed reporting and long-term trends"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        <Grid item xs={12}>
          <DashboardPanel
            title="Monthly Trends"
            subtitle="Total, critical, and near-miss incidents over time"
            height={360}
            isLoading={trendsLoading}
            isEmpty={!trends?.monthly?.length}
            action={
              <ToggleButtonGroup
                size="small"
                exclusive
                value={granularity}
                onChange={(e, v) => v && setGranularity(v)}
              >
                <ToggleButton value="MONTHLY">Monthly</ToggleButton>
                <ToggleButton value="QUARTERLY">Quarterly</ToggleButton>
                <ToggleButton value="YEARLY">Yearly</ToggleButton>
              </ToggleButtonGroup>
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends?.monthly || []} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#8884d8" strokeWidth={2} name="Total Incidents" />
                <Line type="monotone" dataKey="critical" stroke="#f44336" strokeWidth={2} name="Critical" />
                <Line type="monotone" dataKey="nearMiss" stroke="#4caf50" strokeWidth={2} name="Near Miss" />
              </LineChart>
            </ResponsiveContainer>
          </DashboardPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <DashboardPanel
            title="Category Distribution"
            subtitle="Incident volume by category"
            height={340}
            isLoading={categoriesLoading}
            isEmpty={!categories?.length}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categories || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                  nameKey="category_name"
                  label={({ category_name, count }: any) => `${category_name} (${count})`}
                >
                  {(categories || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </DashboardPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <DashboardPanel
            title="Investigator Workload"
            subtitle="Active cases per investigator"
            height={340}
            isLoading={workloadLoading}
            isEmpty={!workload?.length}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workload || []} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="investigator_id" fontSize={11} tickFormatter={(v: string) => v?.slice(0, 8)} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Bar dataKey="active" fill="#8884d8" name="Active Cases" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" fill="#c5cae9" name="Total Assigned" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DashboardPanel>
        </Grid>

        <Grid item xs={12} md={5}>
          <DashboardPanel
            title="Repeat Incidents"
            subtitle="Same category + department occurring more than once"
            isLoading={repeatLoading}
            isEmpty={!repeatIncidents?.length}
            emptyText="No repeat patterns detected in this period."
          >
            <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
              <RepeatIncidentsTable data={repeatIncidents || []} categoryNameById={categoryNameById} />
            </Box>
          </DashboardPanel>
        </Grid>

        <Grid item xs={12} md={3}>
          <DashboardPanel
            title="Investigation Time"
            subtitle="Time to complete investigations"
            isLoading={investigationTimeLoading}
          >
            <InvestigationTimeStats
              avgHours={investigationTime?.avg_hours}
              minHours={investigationTime?.min_hours}
              maxHours={investigationTime?.max_hours}
              totalCompleted={investigationTime?.total_completed}
            />
          </DashboardPanel>
        </Grid>

        <Grid item xs={12} md={4}>
          <DashboardPanel
            title="Sentinel Event Trend"
            subtitle="Monthly sentinel events"
            height={260}
            isLoading={sentinelLoading}
            isEmpty={sentinelChartData.every((d: { count: number }) => d.count === 0) && sentinelChartData.length === 0}
            emptyText="No sentinel events in this period."
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sentinelChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#b71c1c" fill="#b71c1c" fillOpacity={0.25} name="Sentinel Events" />
              </AreaChart>
            </ResponsiveContainer>
          </DashboardPanel>
        </Grid>
      </Grid>
    </Box>
  );
}
