import React, { useState } from 'react';
import axios from 'axios';
import { KeyRound, AlertCircle, CheckCircle, Lock } from 'lucide-react';

import { API_BASE } from '../config.js';
import PasswordInput from '../components/auth/PasswordInput.jsx';

function getPasswordStrength(password) {
  let strength = 0;
  if (password.length >= 8) strength += 1;
  if (password.length >= 12) strength += 1;
  if (/[a-z]/.test(password)) strength += 1;
  if (/[A-Z]/.test(password)) strength += 1;
  if (/[0-9]/.test(password)) strength += 1;
  if (/[^a-zA-Z0-9]/.test(password)) strength += 1;

  if (strength <= 2) return { level: 'weak', score: strength };
  if (strength <= 4) return { level: 'medium', score: strength };
  return { level: 'strong', score: strength };
}

function ResetOwnPassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [errors, setErrors] = useState({});

  const strength = getPasswordStrength(newPassword);

  const validate = () => {
    const errs = {};
    if (!currentPassword) errs.currentPassword = 'Current password is required.';
    if (!newPassword) {
      errs.newPassword = 'New password is required.';
    } else if (newPassword.length < 8) {
      errs.newPassword = 'Must be at least 8 characters.';
    }
    if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    setStatus(null);
    setErrors({});

    try {
      const res = await axios.post(`${API_BASE}/reset_own_password`, { currentPassword, newPassword });
      setStatus({ type: 'success', message: res.data.message || 'Password reset successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setStatus({ type: 'error', message: error.response?.data?.message || 'Failed to reset password.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <KeyRound className="text-blue-600" />
          Reset Password
        </h1>
        <p className="text-gray-500">Change your own account password</p>
      </div>

      {status && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm font-medium ${
          status.type === 'success'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {status.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {status.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-5 bg-white shadow-sm border rounded-2xl">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-gray-700">Current Password *</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <PasswordInput
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setErrors((p) => ({ ...p, currentPassword: '' })); }}
              className="w-full pl-9 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
              autoComplete="current-password"
            />
          </div>
          {errors.currentPassword && <p className="text-xs text-red-600">{errors.currentPassword}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-gray-700">New Password *</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <PasswordInput
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setErrors((p) => ({ ...p, newPassword: '' })); }}
              className="w-full pl-9 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
            />
          </div>
          {errors.newPassword && <p className="text-xs text-red-600">{errors.newPassword}</p>}
          {newPassword && (
            <div className="mt-1">
              <div className="flex gap-1 h-1.5 mb-1">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className={`flex-1 rounded-full transition-colors ${
                    strength.score >= n
                      ? strength.level === 'weak' ? 'bg-red-500' : strength.level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                      : 'bg-gray-200'
                  }`} />
                ))}
              </div>
              <p className={`text-xs font-medium ${
                strength.level === 'weak' ? 'text-red-500' : strength.level === 'medium' ? 'text-yellow-600' : 'text-green-600'
              }`}>
                Password strength: {strength.level.charAt(0).toUpperCase() + strength.level.slice(1)}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-gray-700">Confirm New Password *</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirmPassword: '' })); }}
              className="w-full pl-9 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
              autoComplete="new-password"
            />
          </div>
          {errors.confirmPassword && <p className="text-xs text-red-600">{errors.confirmPassword}</p>}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

export default ResetOwnPassword;
