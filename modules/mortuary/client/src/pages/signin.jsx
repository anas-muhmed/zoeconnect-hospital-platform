import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config.js";
import AuthShell from "../components/auth/AuthShell";
import FormField from "../components/auth/FormField";
import StatusBanner from "../components/auth/StatusBanner";

const LOCK_ICON = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";
const USER_ICON = "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0";

const initialForm = { employeeId: "", password: "" };

function validate(fields) {
  const errors = {};
  if (!fields.employeeId.trim()) {
    errors.employeeId = "Employee ID is required.";
  } else if (!/^[A-Za-z0-9]+$/.test(fields.employeeId)) {
    errors.employeeId = "Employee ID must be alphanumeric.";
  }
  if (!fields.password) {
    errors.password = "Password is required.";
  } else if (fields.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }
  return errors;
}

export default function Login() {
  const navigation = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hospitalName, setHospitalName] = useState(null);
  const [hospitalLogo, setHospitalLogo] = useState(null);
  const debounceRef = useRef(null);

  // Fetch hospital info when employee ID changes (debounced 600ms)
  useEffect(() => {
    const id = form.employeeId.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (id.length < 3) {
      setHospitalName(null);
      setHospitalLogo(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/hospitals/by-employee-id/${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = await res.json();
          setHospitalName(data.mortuary_name || null);
          setHospitalLogo(data.mortuary_logo || null);
        } else {
          setHospitalName(null);
          setHospitalLogo(null);
        }
      } catch {
        setHospitalName(null);
        setHospitalLogo(null);
      }
    }, 600);
  }, [form.employeeId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const processedValue = name === 'employeeId' ? value.toUpperCase() : value;
    setForm((prev) => ({ ...prev, [name]: processedValue }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    setSubmitStatus(null);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("username", data.user.fullname);
        localStorage.setItem("role", data.user.role);

        if (data.mustChangePassword) {
          navigation("/change-password");
        } else {
          setSubmitStatus({ type: "success", message: data.message || "Login successful! Redirecting..." });
          if (data.user.role === "House Keeping") {
            navigation("/dashboard/housekeeping");
          } else if (data.user.role === "M Staff") {
            navigation("/dashboard/dashboard");
          }
        }
      } else {
        setSubmitStatus({ type: "error", message: data.message || "Invalid credentials. Please try again." });
      }
    } catch {
      setSubmitStatus({ type: "error", message: "Network error. Please check your connection." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell hospitalName={hospitalName} hospitalLogo={hospitalLogo}>
      {showForgotPasswordModal && <ForgotPasswordModal onClose={() => setShowForgotPasswordModal(false)} />}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-indigo-600">Welcome back</h1>
        <p className="text-sm text-indigo-400 mt-1">Sign in to continue to your account.</p>
      </div>
      <StatusBanner type={submitStatus?.type} message={submitStatus?.message} />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormField label="Employee ID" name="employeeId" value={form.employeeId} onChange={handleChange}
          error={errors.employeeId} placeholder="e.g. EMP001" autoComplete="username" iconPath={USER_ICON} />

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              Password <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              onClick={() => setShowForgotPasswordModal(true)}
            >
              Forgot password?
            </button>
          </div>
          <FormField label="" name="password" value={form.password} onChange={handleChange}
            error={errors.password} placeholder="Enter your password" autoComplete="current-password"
            iconPath={LOCK_ICON} isPassword required={false} />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none group">
          <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
          <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
            Remember me on this device
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white
            bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]
            transition-all shadow-md shadow-indigo-200
            disabled:opacity-60 disabled:cursor-not-allowed
            flex items-center justify-center gap-2 mt-2"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400 font-medium">New staff member?</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <a href="/mortuary/signup"
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg
          border border-gray-200 text-sm font-medium text-gray-600
          bg-white hover:bg-gray-50 hover:border-gray-300 transition-all">
        Create an account
      </a>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Need Help Getting Started?</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a href="/mortuary/user-guide"
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg
            border border-indigo-100 text-xs font-semibold text-indigo-600
            bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-200 transition-all text-center">
          Open User Guide
        </a>
        <a href="/mortuary/user-guide?watch=true"
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg
            border border-rose-100 text-xs font-semibold text-rose-600
            bg-rose-50/50 hover:bg-rose-50 hover:border-rose-200 transition-all text-center">
          Watch Tutorial
        </a>
      </div>
    </AuthShell>
  );
}

function ForgotPasswordModal({ onClose }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch(`${API_BASE}/forgot_password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", message: data.message || "Request recorded. Please contact your admin." });
        setEmail("");
      } else {
        setStatus({ type: "error", message: data.message || "Failed to submit request." });
      }
    } catch (err) {
      setStatus({ type: "error", message: "Network error. Please try again later." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Forgot Password</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Enter your registered email address below. We will record a password reset request. You must contact your administrator to receive your new temporary password.
        </p>

        {status && (
          <div className={`p-3 rounded-lg text-xs font-semibold mb-4 border ${
            status.type === "success" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"
          }`}>
            {status.message}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              className={`w-full px-3.5 py-2 rounded-lg border text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 ${
                error ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"
              }`}
              placeholder="e.g. name@hospital.com"
              disabled={loading}
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
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
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-md shadow-indigo-200 transition-colors flex items-center justify-center"
              disabled={loading}
            >
              {loading ? "Submitting..." : "Request Reset"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
