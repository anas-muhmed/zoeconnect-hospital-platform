import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config.js";
import AuthShell from "../components/auth/AuthShell";
import FormField from "../components/auth/FormField";
import StatusBanner from "../components/auth/StatusBanner";
import { useMortuaryName } from "../context/MortuaryNameContext.jsx";

const SHIELD_ICON = "M9 12.75L11.25 15 15 9.75M21 12c0 4.556-3.03 8.25-8.25 9.75C7.53 20.25 4.5 16.556 4.5 12V6.31c0-.51.325-.962.808-1.13a48.99 48.99 0 0111.384 0c.483.168.808.62.808 1.13V12z";
const USER_ICON = "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0";
const LOCK_ICON = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";

function AdminLogin() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { fetchMortuarySettings, updateMortuaryLogo, updateMortuaryName } = useMortuaryName();

  // Preview the admin's hospital branding as they type their username,
  // same idea as the staff login page's Employee ID lookup. Debounced so
  // it doesn't fire on every keystroke, and the ref guards against a
  // slow earlier response overwriting a faster later one.
  const latestUsernameLookup = useRef("");
  useEffect(() => {
    const username = form.username.trim();
    if (username.length < 3) {
      updateMortuaryLogo(null);
      updateMortuaryName(null);
      return;
    }
    const timer = setTimeout(async () => {
      latestUsernameLookup.current = username;
      try {
        const res = await axios.get(`${API_BASE}/hospitals/by-admin-username/${encodeURIComponent(username)}`);
        if (latestUsernameLookup.current !== username) return; // stale response
        updateMortuaryLogo(res.data?.mortuary_logo || null);
        updateMortuaryName(res.data?.mortuary_name || null);
      } catch {
        if (latestUsernameLookup.current !== username) return;
        updateMortuaryLogo(null);
        updateMortuaryName(null);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.username]);

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
      const res = await fetch(`${API_BASE}/admin/login`, {
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

      localStorage.setItem("role", "Admin");
      localStorage.setItem("admin", JSON.stringify(data.user));

      if (data.mustChangePassword) {
        // Temporary password (set by SuperAdmin at onboarding, or by another
        // Admin inviting a co-admin) - the server also enforces this on
        // every other request, so this redirect isn't the only thing
        // stopping access, just the friendly path there.
        navigate("/change-password");
        return;
      }

      // The sidebar/header show whichever hospital's branding was fetched
      // when the app first loaded (before login) - refresh it now that the
      // login cookie carries this admin's actual hospital_id, or the
      // dashboard would keep showing whatever hospital resolved first.
      await fetchMortuarySettings();
      navigate("/dashboard/admin");
    } catch (err) {
      setError("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell iconPath={SHIELD_ICON} title="Admin Login" subtitle="Sign in to manage cabins, billing & staff" portalLabel="Admin Portal" hideToggle>
      <StatusBanner type="error" message={error} />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormField label="Username" name="username" value={form.username} onChange={handleChange}
          placeholder="Enter username" autoComplete="username" iconPath={USER_ICON} />

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
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Signing in...
            </>
          ) : "Sign In"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400 font-medium">Other options</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <a href="/mortuary/"
          className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg
            border border-gray-200 text-xs font-semibold text-gray-600
            bg-white hover:bg-gray-50 hover:border-gray-300 transition-all text-center">
          Staff Login
        </a>
      </div>
    </AuthShell>
  );
}

export default AdminLogin;