import React, { useState, useEffect } from 'react';
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
import BodyRegistration from './pages/BodyRegistration';
import PatientList from './pages/PatientList';
import CabinAllocation from './pages/CabinAllocation';
import Billing from './pages/Billing';
import BodyRelease from './pages/BodyRelease';
import CabinMaster from './pages/CabinMaster';
import Reports from './pages/Reports';
import HousekeepingDashboard from './pages/HousekeepingDashboard';
import ServiceMaster from './pages/ServiceMaster';
import Auth from './pages/auth';
import ForgotPassword from './pages/forgot_password';
import Dashboard_Base from './pages/dashboard_base';
import AdminLogin from './pages/adminlogin';
import SuperAdminLogin from './pages/superadminlogin';
import AdminDashboard from './pages/admin_dashboard';
import SuperAdminDashboard from './pages/superadmin_dashboard';
import BillingSettings from './pages/BillingSettings';
import ResetOwnPassword from './pages/ResetOwnPassword';
import ReleaseHistory from './pages/ReleaseHistory';
import UserApprovals from './pages/UserApprovals';
import UserGuide from './pages/UserGuide';
import ChangePassword from './pages/ChangePassword';

function App() {

  return (
    
      
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
          
   
  );
}

export default App;
