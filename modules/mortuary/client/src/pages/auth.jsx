import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE, getUploadUrl } from "../config.js";
import AuthShell from "../components/auth/AuthShell";
import FormField from "../components/auth/FormField";
import StatusBanner from "../components/auth/StatusBanner";
import { useMortuaryName } from "../context/MortuaryNameContext.jsx";
import gsap from "gsap";

const LOCK_ICON = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";
const USER_ICON = "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0";
const USER_ADD_ICON = "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z";

const DEPARTMENTS = ["House Keeping", "M Staff"];

const initialLoginForm = { employeeId: "", password: "" };
const initialRegisterForm = {
  fullName: "",
  employeeId: "",
  department: "",
  phone1: "",
  phone2: "",
  email: "",
  password: "",
  clientId: "",
};

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

function validateLogin(fields) {
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

function validateRegister(fields) {
  const errors = {};
  if (!fields.fullName.trim()) errors.fullName = "Full name is required.";
  if (!fields.employeeId.trim()) {
    errors.employeeId = "Employee ID is required.";
  } else if (!/^[A-Za-z0-9]+$/.test(fields.employeeId.trim())) {
    errors.employeeId = "Employee ID must be alphanumeric.";
  }
  if (!fields.clientId.trim()) {
    errors.clientId = "Client ID is required.";
  }
  if (!fields.department) errors.department = "Please select a department.";
  const phoneRegex = /^[6-9]\d{9}$/;
  if (!fields.phone1.trim()) {
    errors.phone1 = "Phone number is required.";
  } else if (!phoneRegex.test(fields.phone1.trim())) {
    errors.phone1 = "Enter a valid 10-digit phone number.";
  }
  if (fields.phone2.trim() && !phoneRegex.test(fields.phone2.trim())) {
    errors.phone2 = "Enter a valid 10-digit phone number.";
  }
  if (!fields.email.trim()) {
    errors.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  const passwordStrength = getPasswordStrength(fields.password);
  if (!fields.password) {
    errors.password = "Password is required.";
  } else if (passwordStrength.level === 'weak') {
    errors.password = "Password must be medium or strong.";
  }
  return errors;
}

function ApprovalModal({ onGoToLogin }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center animate-fade-in">
        <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center border-4 border-amber-200">
          <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2">Registration Submitted!</h2>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
          <p className="text-sm text-amber-800 font-semibold mb-1 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Pending Admin Approval
          </p>
          <p className="text-sm text-amber-700">
            Your registration has been received. You <strong>cannot log in</strong> until an admin approves your account.
            Please contact the system administrator.
          </p>
        </div>

        <button
          onClick={onGoToLogin}
          className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white
            bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const { fetchMortuarySettings, updateMortuaryLogo, updateMortuaryName } = useMortuaryName();
  const [isLogin, setIsLogin] = useState(true);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [loginErrors, setLoginErrors] = useState({});
  const [registerErrors, setRegisterErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [loginClientLogo, setLoginClientLogo] = useState(null);
  const [registerClientLogo, setRegisterClientLogo] = useState(null);
  const loginFormRef = useRef(null);
  const registerFormRef = useRef(null);

  useEffect(() => {
    const tl = gsap.timeline();
    
    if (isLogin) {
      // Animate out register form
      if (registerFormRef.current) {
        tl.to(registerFormRef.current, {
          opacity: 0,
          x: 20,
          scale: 0.95,
          duration: 0.3,
          ease: "power2.in"
        });
      }
      // Animate in login form
      if (loginFormRef.current) {
        tl.fromTo(loginFormRef.current,
          { opacity: 0, x: -30, scale: 0.95 },
          { opacity: 1, x: 0, scale: 1, duration: 0.4, ease: "back.out(1.2)" },
          "-=0.2"
        );
        // Animate form fields with stagger
        tl.fromTo(loginFormRef.current.querySelectorAll('input, select, button'),
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: "power2.out" },
          "-=0.2"
        );
      }
    } else {
      // Animate out login form
      if (loginFormRef.current) {
        tl.to(loginFormRef.current, {
          opacity: 0,
          x: -20,
          scale: 0.95,
          duration: 0.3,
          ease: "power2.in"
        });
      }
      // Animate in register form
      if (registerFormRef.current) {
        tl.fromTo(registerFormRef.current,
          { opacity: 0, x: 30, scale: 0.95 },
          { opacity: 1, x: 0, scale: 1, duration: 0.4, ease: "back.out(1.2)" },
          "-=0.2"
        );
        // Animate form fields with stagger
        tl.fromTo(registerFormRef.current.querySelectorAll('input, select, button'),
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: "power2.out" },
          "-=0.2"
        );
      }
    }
  }, [isLogin]);

  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
    if (loginErrors[name]) setLoginErrors((prev) => ({ ...prev, [name]: "" }));

    if (name === 'employeeId' && value.length >= 3) {
      fetchClientByEmployeeId(value);
    } else if (name === 'employeeId' && value.length < 3) {
      setLoginClientLogo(null);
    }
  };

  // Typing quickly fires one request per keystroke - responses can arrive
  // out of order (e.g. the lookup for "SUN" can resolve after "SUNH8261"
  // already did), so a stale "not found" can wipe out the correct logo that
  // just loaded. These refs track the latest value actually being looked up,
  // so an in-flight response for an older value gets ignored on arrival.
  const latestEmployeeIdLookup = useRef("");
  const latestClientIdLookup = useRef("");

  const fetchClientByEmployeeId = async (employeeId) => {
    latestEmployeeIdLookup.current = employeeId;
    try {
      const res = await axios.get(`${API_BASE}/hospitals/by-employee-id/${employeeId}`);
      if (latestEmployeeIdLookup.current !== employeeId) return; // stale response
      const logo = res.data?.mortuary_logo || null;
      const name = res.data?.mortuary_name || null;
      setLoginClientLogo(logo);
      // Update left-panel branding immediately
      updateMortuaryLogo(logo);
      updateMortuaryName(name);
    } catch (error) {
      if (latestEmployeeIdLookup.current !== employeeId) return;
      setLoginClientLogo(null);
      // Clear left-panel branding
      updateMortuaryLogo(null);
      updateMortuaryName(null);
    }
  };

  const fetchClientByClientId = async (clientId) => {
    latestClientIdLookup.current = clientId;
    try {
      const res = await axios.get(`${API_BASE}/hospitals/by-client-id/${clientId}`);
      if (latestClientIdLookup.current !== clientId) return; // stale response
      const logo = res.data?.mortuary_logo || null;
      const name = res.data?.mortuary_name || null;
      setRegisterClientLogo(logo);
      // Update left-panel branding immediately
      updateMortuaryLogo(logo);
      updateMortuaryName(name);
    } catch (error) {
      if (latestClientIdLookup.current !== clientId) return;
      setRegisterClientLogo(null);
      // Clear left-panel branding
      updateMortuaryLogo(null);
      updateMortuaryName(null);
    }
  };

  const handleRegisterChange = (e) => {
    const { name, value } = e.target;
    setRegisterForm((prev) => ({ ...prev, [name]: value }));
    if (registerErrors[name]) setRegisterErrors((prev) => ({ ...prev, [name]: "" }));
    setSubmitStatus(null);

    if (name === 'clientId' && value.length >= 3) {
      fetchClientByClientId(value);
    } else if (name === 'clientId' && value.length < 3) {
      setRegisterClientLogo(null);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateLogin(loginForm);
    if (Object.keys(validationErrors).length > 0) {
      setLoginErrors(validationErrors);
      return;
    }
    setLoading(true);
    setSubmitStatus(null);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("username", data.user.fullname);
        localStorage.setItem("role", data.user.role);
        // The sidebar/header show whichever hospital's branding was fetched
        // when the app first loaded (before login) - refresh it now that the
        // login cookie carries this staff member's actual hospital_id.
        await fetchMortuarySettings();

        if (data.mustChangePassword) {
          navigate("/change-password");
        } else {
          setSubmitStatus({ type: "success", message: data.message || "Login successful! Redirecting..." });
          if (data.user.role === "House Keeping") {
            navigate("/dashboard/housekeeping");
          } else if (data.user.role === "M Staff") {
            navigate("/dashboard/body-registration");
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

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateRegister(registerForm);
    if (Object.keys(validationErrors).length > 0) {
      setRegisterErrors(validationErrors);
      return;
    }
    setLoading(true);
    setSubmitStatus(null);
    try {
      const payload = {
        fullname: registerForm.fullName.trim(),
        employee_id: registerForm.employeeId.trim(),
        department: registerForm.department,
        phone1: registerForm.phone1.trim(),
        phone2: registerForm.phone2.trim() || "",
        email: registerForm.email.trim(),
        password: registerForm.password,
        client_id: registerForm.clientId.trim(),
      };

      const res = await fetch(`${API_BASE}/user_register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        setRegisterForm(initialRegisterForm);
        setRegisterErrors({});
        setShowSuccessModal(true);
      } else {
        setSubmitStatus({ type: "error", message: data.message || "Registration failed. Please try again." });
      }
    } catch {
      setSubmitStatus({ type: "error", message: "Network error. Please check your connection." });
    } finally {
      setLoading(false);
    }
  };

  // Login and register are separate forms with separate lookups (employee
  // ID vs Client ID) but share one branding context for the left panel.
  // Without this, switching forms keeps showing whatever the other form's
  // last lookup resolved to, even though the new form hasn't looked
  // anything up yet.
  useEffect(() => {
    updateMortuaryLogo(null);
    updateMortuaryName(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogin]);

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setSubmitStatus(null);
    setLoginErrors({});
    setRegisterErrors({});
  };

  return (
    <>
      {showSuccessModal && <ApprovalModal onGoToLogin={() => { setShowSuccessModal(false); setIsLogin(true); }} />}
      {showForgotPasswordModal && <ForgotPasswordModal onClose={() => setShowForgotPasswordModal(false)} />}

      <AuthShell portalLabel="Staff Portal" onToggle={setIsLogin} isLogin={isLogin}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-indigo-600">
            {isLogin ? "Welcome back" : "Create Staff Account"}
          </h1>
          <p className="text-sm text-indigo-400 mt-1">
            {isLogin ? "Sign in to continue to your account." : "Register for access — subject to admin approval"}
          </p>
        </div>
        <StatusBanner type={submitStatus?.type} message={submitStatus?.message} />

        {isLogin ? (
          <form ref={loginFormRef} onSubmit={handleLoginSubmit} noValidate className="space-y-5">
            <FormField
              label="Employee ID"
              name="employeeId"
              value={loginForm.employeeId}
              onChange={handleLoginChange}
              error={loginErrors.employeeId}
              placeholder="e.g. EMP001"
              autoComplete="username"
              iconPath={USER_ICON}
            />
            {loginClientLogo && (
              <div className="hidden" aria-hidden="true">
                <img
                  src={getUploadUrl(loginClientLogo)}
                  alt="Client Logo"
                />
              </div>
            )}


            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">
                  Password <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                  onClick={() => navigate("/forgot-password")}
                >
                  Forgot password?
                </button>
              </div>
              <FormField 
                label="" 
                name="password" 
                value={loginForm.password} 
                onChange={handleLoginChange}
                error={loginErrors.password} 
                placeholder="Enter your password" 
                autoComplete="current-password"
                iconPath={LOCK_ICON} 
                isPassword 
                required={false} 
              />
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
        ) : (
          <form ref={registerFormRef} onSubmit={handleRegisterSubmit} className="space-y-4" noValidate>
            <FormField
              label="Full Name"
              name="fullName"
              value={registerForm.fullName}
              onChange={handleRegisterChange}
              error={registerErrors.fullName}
              placeholder="e.g. John Mathew"
            />

            <FormField
              label="Employee ID"
              name="employeeId"
              value={registerForm.employeeId}
              onChange={handleRegisterChange}
              error={registerErrors.employeeId}
              placeholder="e.g. EMP001"
            />

            <FormField
              label="Client ID"
              name="clientId"
              value={registerForm.clientId}
              onChange={handleRegisterChange}
              error={registerErrors.clientId}
              placeholder="e.g. CLIENT001"
            />
            {registerClientLogo && (
              <div className="flex items-center justify-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                <img
                  src={getUploadUrl(registerClientLogo)}
                  alt="Client Logo"
                  className="h-16 w-auto object-contain"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                name="department"
                value={registerForm.department}
                onChange={handleRegisterChange}
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm bg-white text-gray-900
                  outline-none transition-all
                  focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500
                  ${registerErrors.department ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
              >
                <option value="">Select Department</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              {registerErrors.department && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-0.5">{registerErrors.department}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField 
                label="Phone (Primary)" 
                name="phone1" 
                value={registerForm.phone1} 
                onChange={handleRegisterChange}
                error={registerErrors.phone1} 
                placeholder="e.g. 9876543210" 
              />
              <FormField 
                label="Phone (Secondary)" 
                name="phone2" 
                value={registerForm.phone2} 
                onChange={handleRegisterChange}
                error={registerErrors.phone2} 
                placeholder="Optional" 
                required={false} 
              />
            </div>

            <FormField 
              label="Email" 
              name="email" 
              type="email" 
              value={registerForm.email} 
              onChange={handleRegisterChange}
              error={registerErrors.email} 
              placeholder="e.g. john@hospital.in" 
            />

            <div>
              <FormField 
                label="Password" 
                name="password" 
                value={registerForm.password} 
                onChange={handleRegisterChange}
                error={registerErrors.password} 
                placeholder="Min. 8 characters" 
                autoComplete="new-password" 
                isPassword 
              />
              {registerForm.password && (
                <div className="mt-2">
                  <div className="flex gap-1 h-1.5 mb-1">
                    <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(registerForm.password).score >= 1 ? 'bg-red-500' : 'bg-gray-200'}`}></div>
                    <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(registerForm.password).score >= 2 ? 'bg-orange-500' : 'bg-gray-200'}`}></div>
                    <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(registerForm.password).score >= 3 ? 'bg-yellow-500' : 'bg-gray-200'}`}></div>
                    <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(registerForm.password).score >= 4 ? 'bg-green-400' : 'bg-gray-200'}`}></div>
                    <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(registerForm.password).score >= 5 ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                    <div className={`flex-1 rounded-full transition-colors ${getPasswordStrength(registerForm.password).score >= 6 ? 'bg-green-600' : 'bg-gray-200'}`}></div>
                  </div>
                  <p className={`text-xs font-medium ${
                    getPasswordStrength(registerForm.password).level === 'weak' ? 'text-red-500' :
                    getPasswordStrength(registerForm.password).level === 'medium' ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    Password strength: {getPasswordStrength(registerForm.password).level.charAt(0).toUpperCase() + getPasswordStrength(registerForm.password).level.slice(1)}
                    {getPasswordStrength(registerForm.password).level === 'weak' && ' (not allowed)'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3.5 text-xs text-blue-700">
              <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span>After registration, your account will be <strong>reviewed by an admin</strong> before you can log in.</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white
                bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]
                transition-all shadow-md shadow-indigo-200
                disabled:opacity-60 disabled:cursor-not-allowed
                flex items-center justify-center gap-2 mt-2"
            >
              {loading ? "Submitting..." : "Submit Registration"}
            </button>
          </form>
        )}

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Need Help Getting Started?</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <a href="/user-guide"
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg
              border border-indigo-100 text-xs font-semibold text-indigo-600
              bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-200 transition-all text-center">
            Open User Guide
          </a>
          <a href="/user-guide?watch=true"
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg
              border border-rose-100 text-xs font-semibold text-rose-600
              bg-rose-50/50 hover:bg-rose-50 hover:border-rose-200 transition-all text-center">
            Watch Tutorial
          </a>
        </div>
      </AuthShell>
    </>
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