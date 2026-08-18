import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Bed,
  UserPlus,
  Receipt,
  LogOut,
  FileText,
  Settings,
  TrendingUp,
  Calendar,
  AlertCircle,
  CheckCircle,
  List,
  ClipboardCheck,
  Tag
} from 'lucide-react';

// Route-level code splitting: each page becomes its own chunk, loaded on
// navigation instead of all being bundled into a single ~2MB main chunk.
const BodyRegistration = lazy(() => import('./pages/BodyRegistration'));
const PatientList = lazy(() => import('./pages/PatientList'));
const CabinAllocation = lazy(() => import('./pages/CabinAllocation'));
const Billing = lazy(() => import('./pages/Billing'));
const BodyRelease = lazy(() => import('./pages/BodyRelease'));
const CabinMaster = lazy(() => import('./pages/CabinMaster'));
const Reports = lazy(() => import('./pages/Reports'));
const HousekeepingDashboard = lazy(() => import('./pages/HousekeepingDashboard'));
const ServiceMaster = lazy(() => import('./pages/ServiceMaster'));
const Auth = lazy(() => import('./pages/auth'));
const ForgotPassword = lazy(() => import('./pages/forgot_password'));
const Dashboard_Base = lazy(() => import('./pages/dashboard_base'));
const AdminLogin = lazy(() => import('./pages/adminlogin'));
const SuperAdminLogin = lazy(() => import('./pages/superadminlogin'));
const AdminDashboard = lazy(() => import('./pages/admin_dashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/superadmin_dashboard'));
const BillingSettings = lazy(() => import('./pages/BillingSettings'));
const ResetOwnPassword = lazy(() => import('./pages/ResetOwnPassword'));
const ReleaseHistory = lazy(() => import('./pages/ReleaseHistory'));
const UserApprovals = lazy(() => import('./pages/UserApprovals'));
const UserGuide = lazy(() => import('./pages/UserGuide'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));

function App() {

  return (


            <Suspense fallback={<div style={{padding: '2rem', textAlign: 'center'}}>Loading...</div>}>
            <Routes>
              <Route path="/signup" element={<Auth/>}/>
              <Route path="/" element={<Auth/>}/>
              <Route path="/forgot-password" element={<ForgotPassword/>}/>
              <Route path="/change-password" element={<ChangePassword/>}/>
              <Route path="/admin-login" element={<AdminLogin/>}/>
              <Route path="/superadmin-login" element={<SuperAdminLogin/>}/>
              <Route path="/user-guide" element={<UserGuide/>}/>
              <Route path="/dashboard" element={<Dashboard_Base/>}>
               {/* Admin-only pages, grouped under their own /admin namespace -
                   distinct from Staff's and SuperAdmin's routes below, instead
                   of everything sharing one flat, unlabeled /dashboard/* list. */}
               <Route path="admin" element={<AdminDashboard/>}/>
               <Route path="admin/user-approvals" element={<UserApprovals/>}/>
               <Route path="admin/cabin-master" element={<CabinMaster/>}/>
               <Route path="admin/service-master" element={<ServiceMaster/>}/>
               <Route path="admin/billing-settings" element={<BillingSettings/>}/>
               <Route path="admin/reports" element={<Reports/>}/>
               <Route path="admin/reset-password" element={<ResetOwnPassword/>}/>
               <Route path="superadmin-dashboard" element={<SuperAdminDashboard/>}/>

              <Route path="housekeeping" element={<HousekeepingDashboard/>}/>
                  <Route path="patient-list" element={<PatientList />} />
                  <Route path="body-registration" element={<BodyRegistration />} />
                  <Route path="cabin-allocation" element={<CabinAllocation />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="body-release" element={<BodyRelease />} />
                  <Route path="release-history" element={<ReleaseHistory />} />
              </Route>
          
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>


  );
}

export default App;
