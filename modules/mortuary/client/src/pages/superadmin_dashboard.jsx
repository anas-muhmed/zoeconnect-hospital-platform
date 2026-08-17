import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Users, Shield, Settings, LogOut, Activity, Database,
  Server, AlertCircle, CheckCircle, UserPlus, Trash2, Edit, Building2, Power
} from 'lucide-react';
import { API_BASE, getUploadUrl } from '../config.js';
import { useMortuaryName } from '../context/MortuaryNameContext.jsx';
import PasswordInput from '../components/auth/PasswordInput.jsx';

function SuperAdminDashboard() {
  const { search } = window.location;
  const tab = new URLSearchParams(search).get('tab');
  const [stats, setStats] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [mortuaryName, setMortuaryName] = useState('');
  const [mortuaryLogo, setMortuaryLogo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditMortuaryModal, setShowEditMortuaryModal] = useState(false);
  const [showUploadLogoModal, setShowUploadLogoModal] = useState(false);
  const [editMortuaryName, setEditMortuaryName] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [hospitals, setHospitals] = useState([]);
  const [showAddHospitalModal, setShowAddHospitalModal] = useState(false);
  const [showEditHospitalModal, setShowEditHospitalModal] = useState(false);
  const [savingHospital, setSavingHospital] = useState(false);
  const emptyHospitalForm = {
    name: '', contact_email: '', contact_phone: '', address: '', client_id: '',
    pricing_model: 'tiered_flat_hourly', first_day_charge: 2100, hourly_charge_after_24hrs: 130,
    daily_rate: 500, staff_discount_percent: 100,
    adminUsername: '', adminPassword: ''
  };
  const [newHospital, setNewHospital] = useState(emptyHospitalForm);
  const [newHospitalLogo, setNewHospitalLogo] = useState(null);
  const [editHospital, setEditHospital] = useState(null); // { id, ...form fields, is_active }
  const [editHospitalLogo, setEditHospitalLogo] = useState(null);

  const navigate = useNavigate();
  const { updateMortuaryLogo, fetchMortuarySettings } = useMortuaryName();

  useEffect(() => {
    if (!tab) return;
    if (tab === 'hospital') setShowAddHospitalModal(true);
  }, [tab]);


  useEffect(() => {
    console.log('SuperAdminDashboard mounted');
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, adminsRes, mortuaryRes, logoRes, hospitalsRes] = await Promise.all([
        axios.get(`${API_BASE}/dashboard/stats`).catch(() => ({ data: null })),
        axios.get(`${API_BASE}/admin/list`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/billing-settings/mortuary-name`).catch(() => ({ data: { mortuary_name: 'MOSC Medical College Mortuary' } })),
        axios.get(`${API_BASE}/billing-settings/mortuary-logo`).catch(() => ({ data: { mortuary_logo: null } })),
        axios.get(`${API_BASE}/superadmin/hospitals`).catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setAdmins(adminsRes.data);
      setMortuaryName(mortuaryRes.data.mortuary_name || 'MOSC Medical College Mortuary');
      setMortuaryLogo(logoRes.data.mortuary_logo);
      setHospitals(hospitalsRes.data);
    } catch (error) {
      console.error('Error loading superadmin dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddHospital = async (e) => {
    e.preventDefault();
    setSavingHospital(true);
    try {
      const formData = new FormData();
      Object.entries(newHospital).forEach(([key, value]) => formData.append(key, value));
      if (newHospitalLogo) formData.append('logo', newHospitalLogo);

      await axios.post(`${API_BASE}/superadmin/hospitals`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setShowAddHospitalModal(false);
      setNewHospital(emptyHospitalForm);
      setNewHospitalLogo(null);
      fetchDashboardData();
      alert('Hospital onboarded successfully');
    } catch (error) {
      alert('Error onboarding hospital: ' + (error.response?.data?.error || error.message));
    } finally {
      setSavingHospital(false);
    }
  };

  const openEditHospital = (h) => {
    setEditHospital({
      id: h.id,
      name: h.name || '',
      contact_email: h.contact_email || '',
      contact_phone: h.contact_phone || '',
      address: h.address || '',
      client_id: h.client_id || '',
      is_active: h.is_active,
      pricing_model: h.pricing_model || 'tiered_flat_hourly',
      first_day_charge: h.first_day_charge || 2100,
      hourly_charge_after_24hrs: h.hourly_charge_after_24hrs || 130,
      daily_rate: h.daily_rate || 500,
      staff_discount_percent: h.staff_discount_percent || 100,
    });
    setEditHospitalLogo(null);
    setShowEditHospitalModal(true);
  };

  const handleUpdateHospital = async (e) => {
    e.preventDefault();
    setSavingHospital(true);
    try {
      const formData = new FormData();
      Object.entries(editHospital).forEach(([key, value]) => {
        if (key !== 'id') formData.append(key, value);
      });
      if (editHospitalLogo) formData.append('logo', editHospitalLogo);

      await axios.put(`${API_BASE}/superadmin/hospitals/${editHospital.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setShowEditHospitalModal(false);
      setEditHospital(null);
      setEditHospitalLogo(null);
      fetchDashboardData();
      alert('Hospital updated successfully');
    } catch (error) {
      alert('Error updating hospital: ' + (error.response?.data?.error || error.message));
    } finally {
      setSavingHospital(false);
    }
  };

  const handleToggleHospitalActive = async (h) => {
    const action = h.is_active ? 'deactivate' : 'reactivate';
    if (!confirm(`Are you sure you want to ${action} ${h.name}?`)) return;
    try {
      const formData = new FormData();
      formData.append('is_active', !h.is_active);
      await axios.put(`${API_BASE}/superadmin/hospitals/${h.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchDashboardData();
    } catch (error) {
      alert('Error updating hospital: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteHospital = async (h) => {
    if (!confirm(`Permanently delete "${h.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_BASE}/superadmin/hospitals/${h.id}`);
      fetchDashboardData();
      alert('Hospital deleted successfully');
    } catch (error) {
      alert('Error deleting hospital: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteAdmin = async (adminId) => {
    if (!confirm('Are you sure you want to delete this admin?')) return;
    try {
      await axios.delete(`${API_BASE}/admin/${adminId}`);
      fetchDashboardData();
      alert('Admin deleted successfully');
    } catch (error) {
      alert('Error deleting admin: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleUpdateMortuaryName = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/billing-settings/mortuary-name`, {
        mortuary_name: editMortuaryName,
        updated_by: 'SuperAdmin'
      });
      setShowEditMortuaryModal(false);
      setEditMortuaryName('');
      fetchDashboardData();
      alert('Mortuary name updated successfully');
    } catch (error) {
      alert('Error updating mortuary name: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUploadLogo = async (e) => {
    e.preventDefault();
    if (!logoFile) {
      alert('Please select a logo file');
      return;
    }

    setUploadingLogo(true);
    const formData = new FormData();
    formData.append('logo', logoFile);
    formData.append('updated_by', 'SuperAdmin');

    try {
      const response = await axios.post(`${API_BASE}/billing-settings/mortuary-logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setShowUploadLogoModal(false);
      setLogoFile(null);
      fetchDashboardData();
      updateMortuaryLogo(response.data.mortuary_logo);
      fetchMortuarySettings();
      alert('Logo uploaded successfully');
    } catch (error) {
      alert('Error uploading logo: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE}/superadmin/logout`, {}, { withCredentials: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('role');
    localStorage.removeItem('admin');
    navigate('/superadmin-login');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] bg-slate-50/50">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-purple-500/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-purple-600 rounded-full animate-spin"></div>
        </div>
        <span className="text-sm font-semibold text-slate-600 mt-4 animate-pulse">
          Loading SuperAdmin Dashboard...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-slate-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-purple-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-purple-600 tracking-wider uppercase bg-purple-50 px-2.5 py-1 rounded-full w-fit mb-1">
                <Shield size={12} /> SuperAdmin Control Center
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">SuperAdmin Dashboard</h1>
              {/* Mortuary name removed for SuperAdmin (shared layout hides it) */}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* actions intentionally hidden */}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Total Hospitals', val: hospitals.length, icon: Building2, color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
            { label: 'Total Bodies', val: stats?.totalBodies || 0, icon: Users, color: 'bg-blue-50 text-blue-600 border-blue-200' },
            { label: 'Active Allocations', val: stats?.activeAllocations || 0, icon: Activity, color: 'bg-green-50 text-green-600 border-green-200' },
            { label: 'Total Admins', val: admins.length, icon: Shield, color: 'bg-purple-50 text-purple-600 border-purple-200' },
          ].map((stat, i) => (
            <div key={i} className={`bg-white border rounded-xl p-6 shadow-sm ${stat.color}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-600">{stat.label}</span>
                <stat.icon size={20} />
              </div>
              <div className="text-3xl font-bold text-slate-900">{stat.val}</div>
            </div>
          ))}
        </div>

        {/* Hospitals Section */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Hospitals</h2>
              <p className="text-sm text-slate-500">Onboard and manage client hospitals</p>
            </div>
            <button
              onClick={() => setShowAddHospitalModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Building2 size={16} /> Add Hospital
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Client ID</th>
                  <th className="px-6 py-3">Pricing Model</th>
                  <th className="px-6 py-3">Admins</th>
                  <th className="px-6 py-3">Bodies</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {hospitals.length > 0 ? (
                  hospitals.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium">{h.name}</td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{h.client_id}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                          {h.pricing_model === 'flat_daily' ? 'Flat Daily'
                            : h.pricing_model === 'free' ? 'Free'
                            : 'Tiered + Hourly'}
                        </span>
                      </td>
                      <td className="px-6 py-4">{h.adminCount}</td>
                      <td className="px-6 py-4">{h.bodyCount}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          h.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {h.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 flex items-center gap-3">
                        <button onClick={() => openEditHospital(h)} className="text-purple-600 hover:text-purple-800">
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleToggleHospitalActive(h)}
                          className={h.is_active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}
                          title={h.is_active ? 'Deactivate' : 'Reactivate'}
                        >
                          <Power size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteHospital(h)}
                          disabled={Number(h.bodyCount) > 0}
                          className={Number(h.bodyCount) > 0
                            ? 'text-slate-300 cursor-not-allowed'
                            : 'text-red-600 hover:text-red-800'}
                          title={Number(h.bodyCount) > 0
                            ? 'Cannot delete - this hospital has body records. Deactivate it instead.'
                            : 'Delete hospital permanently'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="px-6 py-10 text-center text-slate-400">
                      No hospitals onboarded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Admin Management Section */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Admin Management</h2>
              <p className="text-sm text-slate-500">
                A hospital's first Admin is created when the hospital is onboarded above.
                Additional admins are added by that hospital's own Admin, not here.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                  <th className="px-6 py-3">Username</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Created At</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {admins.length > 0 ? (
                  admins.map((admin) => (
                    <tr key={admin.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium">{admin.username}</td>
                      <td className="px-6 py-4">{admin.email || 'N/A'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          admin.role === 'SuperAdmin' 
                            ? 'bg-purple-100 text-purple-800' 
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {admin.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          admin.status === 'Active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {admin.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {new Date(admin.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-6 py-4">
                        {admin.role !== 'SuperAdmin' && (
                          <button
                            onClick={() => handleDeleteAdmin(admin.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-slate-400">
                      No admins found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <Server size={24} className="text-purple-600" />
            <h2 className="text-lg font-bold text-slate-800">System Status</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle size={20} className="text-green-600" />
              <div>
                <div className="text-sm font-semibold text-slate-800">Database</div>
                <div className="text-xs text-green-600">Connected</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle size={20} className="text-green-600" />
              <div>
                <div className="text-sm font-semibold text-slate-800">API Server</div>
                <div className="text-xs text-green-600">Operational</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle size={20} className="text-green-600" />
              <div>
                <div className="text-sm font-semibold text-slate-800">Application</div>
                <div className="text-xs text-green-600">Running</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Hospital Modal */}
      {showAddHospitalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Onboard New Hospital</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setShowAddHospitalModal(false);
                  setNewHospital(emptyHospitalForm);
                  setNewHospitalLogo(null);
                }}
                className="text-slate-800 hover:text-slate-900 transition-colors"
              >
                <span className="text-2xl font-extrabold leading-none">×</span>
              </button>
            </div>
            <form onSubmit={handleAddHospital} className="space-y-4 text-slate-800 font-semibold">



              <div>
                <label className="text-sm font-extrabold text-slate-800">Hospital Name</label>
                <input type="text" required value={newHospital.name}
                  onChange={(e) => setNewHospital({ ...newHospital, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm font-extrabold text-slate-800">Client ID</label>
                <input type="text" value={newHospital.client_id} placeholder="Leave blank to auto-generate"
                  onChange={(e) => setNewHospital({ ...newHospital, client_id: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                <p className="text-xs font-extrabold text-slate-800 mt-1">Staff type this at registration/login to identify this hospital.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-extrabold text-slate-800">Contact Email</label>
                    <input type="email" value={newHospital.contact_email}
                    onChange={(e) => setNewHospital({ ...newHospital, contact_email: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                </div>
                  <div>
                    <label className="text-sm font-extrabold text-slate-900">Contact Phone</label>
                    <input type="text" value={newHospital.contact_phone}
                    onChange={(e) => setNewHospital({ ...newHospital, contact_phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                </div>
              </div>
              <div>
                <label className="text-sm font-extrabold text-slate-800">Address</label>
                <input type="text" value={newHospital.address}
                  onChange={(e) => setNewHospital({ ...newHospital, address: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm font-extrabold text-slate-800">Logo</label>
                <input type="file" accept="image/*"
                  onChange={(e) => setNewHospitalLogo(e.target.files[0])}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
              </div>

              <hr className="border-slate-200" />
              <div>
                <label className="text-sm font-extrabold text-slate-900">Pricing Model</label>
                <select value={newHospital.pricing_model}
                  onChange={(e) => setNewHospital({ ...newHospital, pricing_model: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1">
                  <option value="tiered_flat_hourly">Tiered - flat first day + hourly after 24h</option>
                  <option value="flat_daily">Flat daily rate</option>
                  <option value="free">Free</option>
                </select>
              </div>

              {newHospital.pricing_model === 'tiered_flat_hourly' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-extrabold text-slate-800">First Day Charge (₹)</label>
                    <input type="number" min="0" value={newHospital.first_day_charge}
                      onChange={(e) => setNewHospital({ ...newHospital, first_day_charge: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-extrabold text-slate-800">Hourly Rate After 24h (₹)</label>
                    <input type="number" min="0" value={newHospital.hourly_charge_after_24hrs}
                      onChange={(e) => setNewHospital({ ...newHospital, hourly_charge_after_24hrs: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                  </div>
                </div>
              )}
              {newHospital.pricing_model === 'flat_daily' && (
                <div>
                  <label className="text-sm font-extrabold text-slate-800">Daily Rate (₹)</label>
                  <input type="number" min="0" value={newHospital.daily_rate}
                    onChange={(e) => setNewHospital({ ...newHospital, daily_rate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                </div>
              )}
              <div>
                    <label className="text-sm font-extrabold text-slate-900">Staff Welfare Discount (%)</label>
                    <input type="number" min="0" max="100" value={newHospital.staff_discount_percent}
                  onChange={(e) => setNewHospital({ ...newHospital, staff_discount_percent: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
              </div>

              <hr className="border-slate-200" />
              <p className="text-xs font-extrabold text-slate-800">First Admin account for this hospital - hand these credentials to the hospital.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-extrabold text-slate-800">Admin Username</label>
                  <input type="text" required value={newHospital.adminUsername}
                    onChange={(e) => setNewHospital({ ...newHospital, adminUsername: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                </div>
                <div>
                  <label className="text-sm font-extrabold text-slate-800">Temporary Password</label>
                  <PasswordInput required minLength={8} value={newHospital.adminPassword}
                    onChange={(e) => setNewHospital({ ...newHospital, adminPassword: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                  <p className="text-[10px] font-semibold text-slate-500 mt-1">
                    The Admin will be required to set their own password on first login.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" disabled={savingHospital}
                  onClick={() => { setShowAddHospitalModal(false); setNewHospital(emptyHospitalForm); setNewHospitalLogo(null); }}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={savingHospital}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400">
                  {savingHospital ? 'Onboarding...' : 'Onboard Hospital'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Hospital Modal */}
      {showEditHospitalModal && editHospital && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-slate-800">Edit Hospital</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setShowEditHospitalModal(false);
                  setEditHospital(null);
                  setEditHospitalLogo(null);
                }}
                className="text-slate-800 hover:text-slate-900 transition-colors"
              >
                <span className="text-2xl leading-none">×</span>
              </button>
            </div>
            <form onSubmit={handleUpdateHospital} className="space-y-4">

              <div>
                <label className="text-sm font-medium text-slate-700">Hospital Name</label>
                <input type="text" required value={editHospital.name}
                  onChange={(e) => setEditHospital({ ...editHospital, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Client ID</label>
                <input type="text" value={editHospital.client_id}
                  onChange={(e) => setEditHospital({ ...editHospital, client_id: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                <p className="text-xs text-slate-500 mt-1">Staff type this at registration/login to identify this hospital.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Contact Email</label>
                  <input type="email" value={editHospital.contact_email}
                    onChange={(e) => setEditHospital({ ...editHospital, contact_email: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Contact Phone</label>
                  <input type="text" value={editHospital.contact_phone}
                    onChange={(e) => setEditHospital({ ...editHospital, contact_phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Address</label>
                <input type="text" value={editHospital.address}
                  onChange={(e) => setEditHospital({ ...editHospital, address: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Logo (leave blank to keep current)</label>
                <input type="file" accept="image/*"
                  onChange={(e) => setEditHospitalLogo(e.target.files[0])}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
              </div>

              <hr className="border-slate-200" />
              <div>
                <label className="text-sm font-medium text-slate-700">Pricing Model</label>
                <select value={editHospital.pricing_model}
                  onChange={(e) => setEditHospital({ ...editHospital, pricing_model: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1">
                  <option value="tiered_flat_hourly">Tiered - flat first day + hourly after 24h</option>
                  <option value="flat_daily">Flat daily rate</option>
                  <option value="free">Free</option>
                </select>
              </div>

              {editHospital.pricing_model === 'tiered_flat_hourly' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">First Day Charge (₹)</label>
                    <input type="number" min="0" value={editHospital.first_day_charge}
                      onChange={(e) => setEditHospital({ ...editHospital, first_day_charge: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Hourly Rate After 24h (₹)</label>
                    <input type="number" min="0" value={editHospital.hourly_charge_after_24hrs}
                      onChange={(e) => setEditHospital({ ...editHospital, hourly_charge_after_24hrs: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                  </div>
                </div>
              )}
              {editHospital.pricing_model === 'flat_daily' && (
                <div>
                  <label className="text-sm font-medium text-slate-700">Daily Rate (₹)</label>
                  <input type="number" min="0" value={editHospital.daily_rate}
                    onChange={(e) => setEditHospital({ ...editHospital, daily_rate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-slate-700">Staff Welfare Discount (%)</label>
                <input type="number" min="0" max="100" value={editHospital.staff_discount_percent}
                  onChange={(e) => setEditHospital({ ...editHospital, staff_discount_percent: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1" />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" disabled={savingHospital}
                  onClick={() => { setShowEditHospitalModal(false); setEditHospital(null); setEditHospitalLogo(null); }}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={savingHospital}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400">
                  {savingHospital ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Mortuary Name Modal */}
      {showEditMortuaryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-slate-800">Edit Mortuary Name</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setShowEditMortuaryModal(false);
                  setEditMortuaryName('');
                }}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                <span className="text-2xl leading-none">×</span>
              </button>
            </div>
            <form onSubmit={handleUpdateMortuaryName} className="space-y-4">

              <div>
                <label className="text-sm font-medium text-slate-700">Mortuary Name</label>
                <input
                  type="text"
                  required
                  value={editMortuaryName}
                  onChange={(e) => setEditMortuaryName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                  placeholder="Enter mortuary name"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditMortuaryModal(false);
                    setEditMortuaryName('');
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Update Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Logo Modal */}
      {showUploadLogoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-slate-800">Upload Mortuary Logo</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setShowUploadLogoModal(false);
                  setLogoFile(null);
                }}
                className="text-slate-500 hover:text-slate-700 transition-colors"
                disabled={uploadingLogo}
              >
                <span className="text-2xl leading-none">×</span>
              </button>
            </div>
            {mortuaryLogo && (

              <div className="mb-4 flex justify-center">
                <img src={getUploadUrl(mortuaryLogo)} alt="Current Logo" className="h-24 w-auto object-contain border rounded" />
              </div>
            )}
            <form onSubmit={handleUploadLogo} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Logo Image</label>
                <input
                  type="file"
                  required
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files[0])}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">Supported formats: JPG, PNG, JPEG</p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadLogoModal(false);
                    setLogoFile(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                  disabled={uploadingLogo}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdminDashboard;
