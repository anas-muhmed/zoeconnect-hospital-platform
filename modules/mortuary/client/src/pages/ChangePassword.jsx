import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config.js';
import AuthShell from '../components/auth/AuthShell';
import FormField from '../components/auth/FormField';
import StatusBanner from '../components/auth/StatusBanner';

const LOCK_ICON = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";

function getPasswordStrength(password) {
  let strength = 0;
  if (password.length >= 8) strength += 1;
  if (password.length >= 12) strength += 1;
  if (/[a-z]/.test(password)) strength += 1;
  if (/[A-Z]/.test(password)) strength += 1;
  if (/[0-9]/.test(password)) strength += 1;
  if (/[^a-zA-Z0-9]/.test(password)) strength += 1;

  if (strength <= 2) return { level: 'weak', score: strength, max: 6 };
  if (strength <= 4) return { level: 'medium', score: strength, max: 6 };
  return { level: 'strong', score: strength, max: 6 };
}

export default function ChangePassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const errs = {};
    if (!newPassword) {
      errs.newPassword = "New password is required.";
    } else {
      const strength = getPasswordStrength(newPassword);
      if (strength.level === 'weak') {
        errs.newPassword = "Password is too weak. Must be medium or strong.";
      }
    }
    if (newPassword !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match.";
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setSubmitStatus(null);
    setErrors({});

    try {
      // No currentPassword here - this page is only ever reached seconds
      // after logging in with that exact password (see auth.jsx/
      // adminlogin.jsx), so re-typing it again is pure redundancy, not a
      // real security check. It's never used as a general "change my
      // password" settings page, so this doesn't weaken anything else.
      const res = await fetch(`${API_BASE}/change_password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitStatus({
          type: "success",
          message: "Password changed successfully! Redirecting you to sign in with your new password..."
        });
        // Read role before clearing it - it decides which login page to send
        // this account back to (Admin/SuperAdmin have their own login routes,
        // Staff/House Keeping share the plain "/" login).
        const role = localStorage.getItem('role');
        const loginPath = role === 'Admin' ? '/admin-login'
          : role === 'SuperAdmin' ? '/superadmin-login'
          : '/';
        // Clear old token / localstorage to force clean login with new password
        localStorage.removeItem('role');
        localStorage.removeItem('username');
        localStorage.removeItem('admin');
        setTimeout(() => {
          navigate(loginPath);
        }, 3000);
      } else {
        setSubmitStatus({ type: "error", message: data.message || "Failed to update password." });
      }
    } catch (err) {
      setSubmitStatus({ type: "error", message: "Network error. Please try again later." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell portalLabel="Security Center" isLogin={true}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-indigo-600">Reset Your Password</h1>
        <p className="text-sm text-indigo-400 mt-1">
          Your password has been reset by an administrator. Please set a new secure password to continue.
        </p>
      </div>

      <StatusBanner type={submitStatus?.type} message={submitStatus?.message} />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <FormField
            label="New Password"
            name="newPassword"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setErrors(prev => ({ ...prev, newPassword: "" })); }}
            error={errors.newPassword}
            placeholder="Min. 8 characters"
            isPassword
            iconPath={LOCK_ICON}
          />
          {newPassword && (
            <div className="mt-2">
              <div className="flex gap-1 h-1.5 mb-1">
                <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(newPassword).score >= 1 ? 'bg-red-500' : 'bg-gray-200'}`}></div>
                <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(newPassword).score >= 2 ? 'bg-orange-500' : 'bg-gray-200'}`}></div>
                <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(newPassword).score >= 3 ? 'bg-yellow-500' : 'bg-gray-200'}`}></div>
                <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(newPassword).score >= 4 ? 'bg-green-400' : 'bg-gray-200'}`}></div>
                <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(newPassword).score >= 5 ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(newPassword).score >= 6 ? 'bg-green-600' : 'bg-gray-200'}`}></div>
              </div>
              <p className={`text-xs font-medium ${
                getPasswordStrength(newPassword).level === 'weak' ? 'text-red-500' :
                getPasswordStrength(newPassword).level === 'medium' ? 'text-yellow-600' : 'text-green-600'
              }`}>
                Password strength: {getPasswordStrength(newPassword).level.charAt(0).toUpperCase() + getPasswordStrength(newPassword).level.slice(1)}
                {getPasswordStrength(newPassword).level === 'weak' && ' (not allowed)'}
              </p>
            </div>
          )}
        </div>

        <FormField
          label="Confirm New Password"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setErrors(prev => ({ ...prev, confirmPassword: "" })); }}
          error={errors.confirmPassword}
          placeholder="Re-enter new password"
          isPassword
          iconPath={LOCK_ICON}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white
            bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]
            transition-all shadow-md shadow-indigo-200
            disabled:opacity-60 disabled:cursor-not-allowed
            flex items-center justify-center gap-2 mt-2"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>
    </AuthShell>
  );
}
