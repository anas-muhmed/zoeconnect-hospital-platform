import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  UserCheck, UserX, Eye, Search, RefreshCw,
  Clock, CheckCircle, XCircle, ChevronDown, X, User,
  Phone, Mail, Briefcase, Calendar, MessageSquare
} from 'lucide-react';

import { API_BASE } from '../config.js';

// Helper: read admin role from localStorage for the header
function adminHeaders() {
  return { 'x-admin-role': 'Admin' };
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ── Status Badge ──────────────────────────────────────────────────
function StatusBadge({ status, resetRequested }) {
  const cfg = {
    pending:  { cls: 'bg-amber-100 text-amber-800 border-amber-200',  icon: <Clock size={11} />,        label: 'Pending'  },
    approved: { cls: 'bg-green-100 text-green-800 border-green-200',  icon: <CheckCircle size={11} />,   label: 'Approved' },
    rejected: { cls: 'bg-red-100   text-red-800   border-red-200',    icon: <XCircle size={11} />,       label: 'Rejected' },
  }[status] || { cls: 'bg-gray-100 text-gray-700 border-gray-200', icon: null, label: status };

  return (
    <div className="flex flex-col gap-1 items-start">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.cls}`}>
        {cfg.icon} {cfg.label}
      </span>
      {resetRequested && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-indigo-100 text-indigo-800 border-indigo-200">
          Reset Requested
        </span>
      )}
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────
function DetailModal({ user, onClose, onApprove, onReject, onResetClick }) {
  const [rejectMode, setRejectMode]   = useState(false);
  const [remarks, setRemarks]         = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  if (!user) return null;

  const handleApprove = async () => {
    setActionLoading(true);
    await onApprove(user.id);
    setActionLoading(false);
    onClose();
  };

  const handleReject = async () => {
    setActionLoading(true);
    await onReject(user.id, remarks);
    setActionLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-700 to-indigo-500 rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-bold">User Details</h2>
            <p className="text-indigo-100 text-sm mt-0.5">{user.full_name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">

          {/* Status row */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-gray-600">Current Status</span>
            <StatusBadge status={user.approval_status} resetRequested={user.password_reset_requested} />
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 gap-3">
            {[
              { icon: <User size={15} />,      label: 'Full Name',   value: user.full_name },
              { icon: <Briefcase size={15} />, label: 'Employee ID', value: user.employee_id },
              { icon: <Briefcase size={15} />, label: 'Department',  value: user.department },
              { icon: <Phone size={15} />,     label: 'Phone 1',     value: user.phone1 },
              { icon: <Phone size={15} />,     label: 'Phone 2',     value: user.phone2 || '—' },
              { icon: <Mail size={15} />,      label: 'Email',       value: user.email },
              { icon: <Calendar size={15} />,  label: 'Registered',  value: fmtDate(user.created_at) },
            ].map(r => (
              <div key={r.label} className="flex items-start gap-3 border border-gray-100 rounded-xl px-4 py-3">
                <span className="text-indigo-500 mt-0.5 shrink-0">{r.icon}</span>
                <div>
                  <p className="text-xs text-gray-500 font-medium">{r.label}</p>
                  <p className="text-sm text-gray-800 font-semibold">{r.value}</p>
                </div>
              </div>
            ))}

            {/* Admin remarks (if any) */}
            {user.admin_remarks && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <MessageSquare size={15} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-red-500 font-medium">Admin Remarks</p>
                  <p className="text-sm text-red-800">{user.admin_remarks}</p>
                </div>
              </div>
            )}
          </div>

          {/* Action area — only for pending */}
          {user.approval_status === 'pending' && (
            <div className="border-t pt-4 space-y-3">
              {!rejectMode ? (
                <div className="flex gap-3">
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                      bg-green-600 hover:bg-green-700 text-white font-semibold text-sm
                      transition-all disabled:opacity-60 shadow-sm"
                  >
                    <UserCheck size={16} /> Approve
                  </button>
                  <button
                    onClick={() => setRejectMode(true)}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                      bg-red-600 hover:bg-red-700 text-white font-semibold text-sm
                      transition-all disabled:opacity-60 shadow-sm"
                  >
                    <UserX size={16} /> Reject
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Rejection Reason <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="e.g. Duplicate registration, invalid employee ID..."
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm
                      focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 resize-none"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleReject}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white
                        font-semibold text-sm transition-all disabled:opacity-60 shadow-sm"
                    >
                      {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
                    </button>
                    <button
                      onClick={() => { setRejectMode(false); setRemarks(''); }}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600
                        hover:bg-gray-50 font-semibold text-sm transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action area — approved users password reset */}
          {user.approval_status === 'approved' && (
            <div className="border-t pt-4">
              <button
                onClick={() => { onResetClick(user); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                  bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm
                  transition-all shadow-sm"
              >
                <RefreshCw size={16} /> Reset Password
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function UserApprovals() {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [searchQuery, setSearchQuery]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionMsg, setActionMsg]       = useState(null); // { type:'success'|'error', text }
  const [resettingUser, setResettingUser] = useState(null);

  // Inline reject state for table-level quick reject
  const [inlineReject, setInlineReject] = useState(null); // userId
  const [inlineRemarks, setInlineRemarks] = useState('');

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/admin/users`, { headers: adminHeaders() });
      setUsers(res.data);
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleApprove = async (id) => {
    try {
      await axios.post(`${API_BASE}/admin/users/${id}/approve`, {}, { headers: adminHeaders() });
      showMsg('success', 'User approved successfully.');
      fetchUsers();
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Approval failed.');
    }
  };

  const handleReject = async (id, remarks) => {
    try {
      await axios.post(`${API_BASE}/admin/users/${id}/reject`, { remarks }, { headers: adminHeaders() });
      showMsg('success', 'User rejected.');
      setInlineReject(null);
      setInlineRemarks('');
      fetchUsers();
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Rejection failed.');
    }
  };

  const handleResetPassword = async (id, tempPassword) => {
    try {
      await axios.post(`${API_BASE}/admin/users/${id}/reset_password`, { password: tempPassword }, { headers: adminHeaders() });
      showMsg('success', 'Password reset successfully.');
      fetchUsers();
    } catch (err) {
      showMsg('error', err.response?.data?.message || 'Password reset failed.');
      throw err;
    }
  };

  const counts = useMemo(() => ({
    pending:  users.filter(u => u.approval_status === 'pending').length,
    approved: users.filter(u => u.approval_status === 'approved').length,
    rejected: users.filter(u => u.approval_status === 'rejected').length,
    resets:   users.filter(u => u.password_reset_requested).length,
  }), [users]);

  const filtered = useMemo(() => users.filter(u => {
    const q = searchQuery.toLowerCase();
    const matchQ = !q ||
      u.full_name?.toLowerCase().includes(q) ||
      u.employee_id?.toLowerCase().includes(q) ||
      u.department?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone1?.includes(q);
    
    let matchS = true;
    if (filterStatus === 'reset_requests') {
      matchS = !!u.password_reset_requested;
    } else if (filterStatus) {
      matchS = u.approval_status === filterStatus;
    }
    
    return matchQ && matchS;
  }), [users, searchQuery, filterStatus]);

  return (
    <div className="space-y-6">

      {/* Toast */}
      {actionMsg && (
        <div className={`fixed top-5 right-5 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg border
          flex items-center gap-2 text-sm font-semibold transition-all
          ${actionMsg.type === 'success'
            ? 'bg-green-50 text-green-800 border-green-200'
            : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {actionMsg.type === 'success'
            ? <CheckCircle size={16} className="shrink-0" />
            : <XCircle size={16} className="shrink-0" />}
          {actionMsg.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <UserCheck size={26} className="text-indigo-600" />
            User Approvals
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Review and approve staff registration requests
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200
            text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending Approval', val: counts.pending,  color: 'text-amber-600  bg-amber-50  border-amber-100',  icon: <Clock size={18} className="text-amber-500" />,        filter: 'pending'  },
          { label: 'Approved',         val: counts.approved, color: 'text-green-600  bg-green-50  border-green-100',  icon: <CheckCircle size={18} className="text-green-500" />,  filter: 'approved' },
          { label: 'Rejected',         val: counts.rejected, color: 'text-red-600    bg-red-50    border-red-100',    icon: <XCircle size={18} className="text-red-500" />,        filter: 'rejected' },
          { label: 'Reset Requests',   val: counts.resets,   color: 'text-indigo-600 bg-indigo-50 border-indigo-100', icon: <RefreshCw size={18} className="text-indigo-500" />,     filter: 'reset_requests' },
        ].map(k => (
          <button
            key={k.filter}
            onClick={() => setFilterStatus(filterStatus === k.filter ? '' : k.filter)}
            className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all hover:shadow-md
              ${filterStatus === k.filter ? 'ring-2 ring-indigo-400' : ''}
              ${k.color}`}
          >
            {k.icon}
            <div>
              <p className="text-xl font-extrabold leading-none">{k.val}</p>
              <p className="text-xs font-semibold mt-0.5 opacity-80">{k.label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[220px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
            <input
              type="text"
              placeholder="Search by name, ID, department, email, phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="input-field w-auto"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="reset_requests">Reset Requests</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">Employee ID</th>
                <th className="px-5 py-3 text-left">Department</th>
                <th className="px-5 py-3 text-left">Phone</th>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Registered</th>
                <th className="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-10 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw size={24} className="animate-spin text-indigo-400" />
                      <span className="text-sm">Loading registrations...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-10 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <UserCheck size={28} className="text-gray-300" />
                      <span className="text-sm">No registrations found</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(u => (
                  <React.Fragment key={u.id}>
                    <tr className="table-row">
                      {/* Name */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-indigo-700">
                              {u.full_name?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-gray-800">{u.full_name}</span>
                        </div>
                      </td>
                      {/* Employee ID */}
                      <td className="px-5 py-4 text-sm font-mono text-blue-600">{u.employee_id}</td>
                      {/* Department */}
                      <td className="px-5 py-4 text-sm text-gray-700">{u.department}</td>
                      {/* Phone */}
                      <td className="px-5 py-4 text-sm text-gray-700">{u.phone1}</td>
                      {/* Email */}
                      <td className="px-5 py-4 text-sm text-gray-700 max-w-[160px] truncate">{u.email}</td>
                      {/* Status */}
                      <td className="px-5 py-4"><StatusBadge status={u.approval_status} /></td>
                      {/* Registered */}
                      <td className="px-5 py-4 text-xs text-gray-500">
                        {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* View */}
                          <button
                            onClick={() => setSelectedUser(u)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100
                              hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-colors border border-gray-200"
                          >
                            <Eye size={12} /> View
                          </button>

                          {u.approval_status === 'pending' && (
                            <>
                              {/* Quick Approve */}
                              <button
                                onClick={() => handleApprove(u.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                                  bg-green-100 hover:bg-green-200 text-green-800 text-xs font-semibold
                                  transition-colors border border-green-200"
                              >
                                <UserCheck size={12} /> Approve
                              </button>

                              {/* Quick Reject toggle */}
                              {inlineReject === u.id ? null : (
                                <button
                                  onClick={() => { setInlineReject(u.id); setInlineRemarks(''); }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                                    bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold
                                    transition-colors border border-red-200"
                                >
                                  <UserX size={12} /> Reject
                                </button>
                              )}
                            </>
                          )}

                          {u.approval_status === 'approved' && (
                            <button
                              onClick={() => setResettingUser(u)}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                                ${u.password_reset_requested 
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700 shadow-sm animate-pulse'
                                  : 'bg-white hover:bg-gray-50 text-indigo-600 border-indigo-200'
                                }`}
                            >
                              <RefreshCw size={12} className={u.password_reset_requested ? 'animate-spin' : ''} /> Reset PW
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Inline Reject Row */}
                    {inlineReject === u.id && (
                      <tr>
                        <td colSpan="8" className="px-5 py-3 bg-red-50 border-b border-red-100">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-semibold text-red-700">Rejection reason (optional):</span>
                            <input
                              type="text"
                              value={inlineRemarks}
                              onChange={e => setInlineRemarks(e.target.value)}
                              maxLength={500}
                              placeholder="e.g. Duplicate employee ID..."
                              className="flex-1 min-w-[200px] border border-red-200 rounded-lg px-3 py-1.5 text-sm
                                focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 bg-white"
                            />
                            <button
                              onClick={() => handleReject(u.id, inlineRemarks)}
                              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white
                                text-xs font-semibold transition-colors shadow-sm"
                            >
                              Confirm Reject
                            </button>
                            <button
                              onClick={() => { setInlineReject(null); setInlineRemarks(''); }}
                              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600
                                hover:bg-gray-100 text-xs font-semibold transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedUser && (
        <DetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onResetClick={setResettingUser}
        />
      )}

      {/* Password Reset Modal */}
      {resettingUser && (
        <PasswordResetModal
          user={resettingUser}
          onClose={() => setResettingUser(null)}
          onResetConfirm={handleResetPassword}
        />
      )}
    </div>
  );
}

function PasswordResetModal({ user, onClose, onResetConfirm }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedPass, setGeneratedPass] = useState("");

  const handleGenerate = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
    let temp = "";
    for (let i = 0; i < 12; i++) {
      temp += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(temp);
    setGeneratedPass(temp);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onResetConfirm(user.id, password);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Reset User Password</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Reset password for <strong>{user.full_name}</strong> (Emp ID: {user.employee_id}). The user will be required to change it on their next login.
        </p>

        {error && (
          <div className="p-3 bg-red-50 text-red-800 border border-red-200 text-xs font-semibold rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                className="flex-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-mono"
                placeholder="Type or generate a password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleGenerate}
                className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                disabled={loading}
              >
                Generate
              </button>
            </div>
            {generatedPass && (
              <p className="text-xs text-green-600 font-medium mt-1">
                Generated password: <span className="font-mono font-bold select-all bg-green-50 px-1 py-0.5 rounded">{generatedPass}</span> (Click/Double-click to copy)
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-md shadow-indigo-200 transition-colors"
              disabled={loading}
            >
              {loading ? "Resetting..." : "Confirm Reset"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
