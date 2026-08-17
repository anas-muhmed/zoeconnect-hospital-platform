import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config.js";
import AuthShell from "../components/auth/AuthShell";
import FormField from "../components/auth/FormField";
import StatusBanner from "../components/auth/StatusBanner";
import { useMortuaryName } from "../context/MortuaryNameContext.jsx";

const KEY_ICON = "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z";
const USER_ICON = "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0";
const LOCK_ICON = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";

function SuperAdminLogin() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { fetchMortuarySettings } = useMortuaryName();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.username || !form.password) {
      setError("Username and password required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/superadmin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Invalid credentials");
        return;
      }

      localStorage.setItem("role", "SuperAdmin");
      localStorage.setItem("admin", JSON.stringify(data.user));
      await fetchMortuarySettings();
      navigate("/dashboard/superadmin-dashboard");
    } catch (err) {
      setError("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell iconPath={KEY_ICON} title="SuperAdmin Login" subtitle="System-level access for maintaining this app" portalLabel="SuperAdmin Portal" noBranding hideToggle>
      <StatusBanner type="error" message={error} />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormField label="Username" name="username" value={form.username} onChange={handleChange}
          placeholder="Enter superadmin username" autoComplete="username" iconPath={USER_ICON} />

        <FormField label="Password" name="password" value={form.password} onChange={handleChange}
          placeholder="Enter password" autoComplete="current-password" iconPath={LOCK_ICON} isPassword />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white
            bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]
            transition-all shadow-md shadow-indigo-200
            disabled:opacity-60 disabled:cursor-not-allowed
            flex items-center justify-center gap-2 mt-2"
        >
          {loading ? "Logging in..." : "Login as SuperAdmin"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-100" />
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <a href="/admin-login"
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg
          border border-gray-200 text-sm font-medium text-gray-600
          bg-white hover:bg-gray-50 hover:border-gray-300 transition-all">
        Back to Admin Login
      </a>
    </AuthShell>
  );
}

export default SuperAdminLogin;