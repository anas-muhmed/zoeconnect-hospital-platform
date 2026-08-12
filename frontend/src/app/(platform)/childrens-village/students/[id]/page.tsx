"use client";

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import PersonIcon from '@mui/icons-material/Person';
import { apiClient } from '@/lib/api/client';

const TABS = ['Overview', 'Medical', 'Guardians', 'Attendance', 'Learning Records', 'Curriculum', 'IEP', 'Behaviour', 'Documents'];

export default function StudentProfilePage() {
  const params = useParams();
  const studentId = params.id as string;
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // apiClient carries the Bearer token/refresh handling every other
    // module's API calls use -- the previous bare fetch() hit the wrong
    // path (missing the /v1 prefix the backend's URI versioning adds)
    // and sent no auth header, so the profile always 404'd/401'd silently.
    apiClient.get(`/childrens-village/students/${studentId}/profile`)
      .then(res => {
        setProfile(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [studentId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!profile) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Profile not found.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header Profile Card */}
      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
        <Avatar sx={{ width: 96, height: 96, bgcolor: 'primary.light', color: 'primary.dark', fontSize: 32, fontWeight: 700 }}>
          {profile.student.firstName[0]}{profile.student.lastName[0]}
        </Avatar>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            {profile.student.firstName} {profile.student.lastName}
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              Reg: {profile.student.registrationNumber || 'N/A'}
            </Typography>
            <Divider orientation="vertical" flexItem />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">Status:</Typography>
              <Chip label={profile.student.studentStatus || 'ACTIVE'} size="small" color="success" variant="outlined" />
            </Box>
            <Divider orientation="vertical" flexItem />
            <Typography variant="body2" color="text.secondary">
              DOB: {profile.student.dateOfBirth ? new Date(profile.student.dateOfBirth).toLocaleDateString() : 'N/A'}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Tabs */}
      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          {TABS.map((tab) => (
            <Tab key={tab} label={tab} value={tab.toLowerCase()} />
          ))}
        </Tabs>

        {/* Tab Content */}
        <Box sx={{ p: 3, minHeight: 400 }}>
          {activeTab === 'overview' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <Box>
                <Typography variant="h6" sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                  Basic Info
                </Typography>
                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Gender</Typography>
                    <Typography variant="body2">{profile.student.gender || '-'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Address</Typography>
                    <Typography variant="body2">{profile.student.address || '-'}</Typography>
                  </Box>
                </Box>
              </Box>
              <Box>
                <Typography variant="h6" sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                  Current Class
                </Typography>
                {profile.currentAllocation ? (
                  <Paper elevation={0} sx={{ mt: 2, p: 2, bgcolor: 'primary.50', borderRadius: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700} color="primary.dark">
                      {profile.currentAllocation.cvClass.name}
                    </Typography>
                    <Typography variant="body2" color="primary.main" sx={{ mt: 0.5 }}>
                      Academic Year: {profile.currentAllocation.academicYear.name}
                    </Typography>
                  </Paper>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Not allocated to a class.
                  </Typography>
                )}
              </Box>
            </Box>
          )}

          {activeTab === 'medical' && (
            <Box>
              <Typography variant="h6" sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                Medical Profile
              </Typography>
              {profile.medicalProfile ? (
                <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Blood Group</Typography>
                    <Typography variant="body2">{profile.medicalProfile.bloodGroup || '-'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Allergies</Typography>
                    <Typography variant="body2">{profile.medicalProfile.allergies || '-'}</Typography>
                  </Box>
                  <Box sx={{ gridColumn: 'span 2' }}>
                    <Typography variant="caption" color="text.secondary">Disability Type</Typography>
                    <Typography variant="body2">{profile.medicalProfile.disabilityType || '-'}</Typography>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  No medical profile found.
                </Typography>
              )}
            </Box>
          )}

          {activeTab === 'guardians' && (
            <Box>
              <Typography variant="h6" sx={{ borderBottom: 1, borderColor: 'divider', pb: 1, mb: 2 }}>
                Guardians
              </Typography>
              {profile.guardians?.length > 0 ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {profile.guardians.map((g: any, i: number) => (
                    <Paper
                      key={i}
                      elevation={0}
                      sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'grey.50', position: 'relative' }}
                    >
                      {g.isPrimaryGuardian && (
                        <Chip
                          label="Primary"
                          size="small"
                          color="success"
                          sx={{ position: 'absolute', top: 8, right: 8 }}
                        />
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon fontSize="small" color="action" />
                        <Typography variant="subtitle2" fontWeight={600}>{g.firstName} {g.lastName}</Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {g.relationship}
                      </Typography>
                      <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PhoneIcon fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">{g.phone || 'N/A'}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <EmailIcon fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">{g.email || 'N/A'}</Typography>
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">No guardians linked.</Typography>
              )}
            </Box>
          )}

          {activeTab === 'attendance' && (
            <Box>
              <Typography variant="h6" sx={{ borderBottom: 1, borderColor: 'divider', pb: 1, mb: 2 }}>
                Attendance History
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, bgcolor: 'grey.50', borderRadius: 2, border: 1, borderStyle: 'dashed', borderColor: 'divider' }}>
                <Typography color="text.secondary">Attendance records will appear here.</Typography>
              </Box>
            </Box>
          )}

          {activeTab === 'learning records' && (
            <Box>
              <Typography variant="h6" sx={{ borderBottom: 1, borderColor: 'divider', pb: 1, mb: 2 }}>
                Daily Learning Records
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, bgcolor: 'grey.50', borderRadius: 2, border: 1, borderStyle: 'dashed', borderColor: 'divider' }}>
                <Typography color="text.secondary">Past DLRs will appear here.</Typography>
              </Box>
            </Box>
          )}

          {activeTab === 'curriculum' && (
            <Box>
              <Typography variant="h6" sx={{ borderBottom: 1, borderColor: 'divider', pb: 1, mb: 2 }}>
                Curriculum Progress
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, bgcolor: 'grey.50', borderRadius: 2, border: 1, borderStyle: 'dashed', borderColor: 'divider' }}>
                <Typography color="text.secondary">Curriculum objective progress maps will appear here.</Typography>
              </Box>
            </Box>
          )}

          {activeTab === 'iep' && (
            <Box>
              <Typography variant="h6" sx={{ borderBottom: 1, borderColor: 'divider', pb: 1, mb: 2 }}>
                Individual Education Plan (IEP)
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, bgcolor: 'grey.50', borderRadius: 2, border: 1, borderStyle: 'dashed', borderColor: 'divider' }}>
                <Typography color="text.secondary">Active IEP goals and review history will appear here.</Typography>
              </Box>
            </Box>
          )}

          {activeTab === 'behaviour' && (
            <Box>
              <Typography variant="h6" sx={{ borderBottom: 1, borderColor: 'divider', pb: 1, mb: 2 }}>
                Behaviour Logs
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, bgcolor: 'grey.50', borderRadius: 2, border: 1, borderStyle: 'dashed', borderColor: 'divider' }}>
                <Typography color="text.secondary">Positive reinforcements and behaviour incidents will appear here.</Typography>
              </Box>
            </Box>
          )}

          {activeTab === 'documents' && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, bgcolor: 'grey.50', borderRadius: 2, border: 1, borderStyle: 'dashed', borderColor: 'divider' }}>
              <Typography color="text.secondary">Documents coming soon</Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
