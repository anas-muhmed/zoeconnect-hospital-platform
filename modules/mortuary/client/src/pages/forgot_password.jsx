import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config.js";
import AuthShell from "../components/auth/AuthShell";
import FormField from "../components/auth/FormField";
import StatusBanner from "../components/auth/StatusBanner";
import { Mail } from "lucide-react";

const initialForm = { email: "" };

function validate(fields) {
  const errors = {};
  if (!fields.email.trim()) {
    errors.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  return errors;
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    setSubmitStatus(null);
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
      const res = await axios.post(`${API_BASE}/forgot_password`, {
        email: form.email.trim(),
      });
      setSubmitStatus({ type: "success", message: res.data.message || "Password reset request submitted successfully." });
      setForm(initialForm);
    } catch (error) {
      const message = error.response?.data?.message || "Failed to submit request. Please try again.";
      setSubmitStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell portalLabel="Staff Portal">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-indigo-600">Forgot Password</h1>
        <p className="text-sm text-indigo-400 mt-1">Enter your email to request a password reset.</p>
      </div>
      <StatusBanner type={submitStatus?.type} message={submitStatus?.message} />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FormField
          label="Email Address"
          name="email"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
          placeholder="e.g. john@example.com"
          autoComplete="email"
          iconPath="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
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
          {loading ? "Submitting..." : "Request Password Reset"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400 font-medium">Remember your password?</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <button
        type="button"
        onClick={() => navigate("/")}
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg
          border border-gray-200 text-sm font-medium text-gray-600
          bg-white hover:bg-gray-50 hover:border-gray-300 transition-all"
      >
        Back to Sign In
      </button>
    </AuthShell>
  );
}
