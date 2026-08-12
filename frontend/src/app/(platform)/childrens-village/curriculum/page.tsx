"use client";

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import AddIcon from '@mui/icons-material/Add';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PageHeader from '@/components/PageHeader';

export default function CurriculumBuilderPage() {
  const [activeTab, setActiveTab] = useState('frameworks');

  // Mock Data
  const frameworks = [
    { id: '1', name: 'Early Intervention Core 2026', grades: 4, isActive: true },
    { id: '2', name: 'Preschool Readiness Program', grades: 2, isActive: true },
  ];

  const tabs: { label: string; value: string }[] = [
    { label: 'Frameworks', value: 'frameworks' },
    { label: 'Grade Mapping', value: 'grade mapping' },
    { label: 'Subjects', value: 'subjects' },
    { label: 'Units & Topics', value: 'units & topics' },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Curriculum Builder"
        subtitle="Manage frameworks, grades, and mapping."
        icon={<MenuBookIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />}>
            New Framework
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, val) => setActiveTab(val)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((tab) => (
          <Tab key={tab.value} label={tab.label} value={tab.value} />
        ))}
      </Tabs>

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        {activeTab === 'frameworks' && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell><b>Framework Name</b></TableCell>
                  <TableCell><b>Grades / Levels</b></TableCell>
                  <TableCell><b>Status</b></TableCell>
                  <TableCell align="right"><b>Actions</b></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {frameworks.map((fw) => (
                  <TableRow key={fw.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{fw.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{fw.grades} configured</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={fw.isActive ? 'Active' : 'Inactive'}
                        size="small"
                        color={fw.isActive ? 'success' : 'error'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Link href="#" underline="hover" sx={{ fontSize: 14, fontWeight: 600 }}>
                        Manage
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {activeTab !== 'frameworks' && (
          <Box sx={{ p: 8, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              This section is under construction for Phase 5.
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
