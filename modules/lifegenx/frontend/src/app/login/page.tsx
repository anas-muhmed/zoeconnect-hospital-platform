'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Stethoscope, Lock, Mail, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../components/ui/Toast';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Please enter both email and password', 'error');
      return;
    }
    try {
      setIsLoading(true);
      const res = await authService.login(email, password);
      setAuth(res.user, res.token);
      showToast(`Welcome back, ${res.user.name}!`, 'success');
      router.push('/dashboard');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Authentication failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoDoctor = () => {
    setEmail('doctor@hospital.com');
    setPassword('Password123!');
    showToast('Demo doctor credentials filled!', 'info');
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden transition-colors duration-200">
      {/* Subtle background decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-200/30 dark:bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10 space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-xl shadow-teal-200 dark:shadow-teal-950/60 border border-teal-400/30">
          <Stethoscope className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">MedAI Clinical Portal</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Hospital EMR AI Symptom Extraction & Differential Diagnosis System</p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Doctor Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@hospital.com"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Security Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 transition-colors"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Sign In to Clinical Workspace
            </Button>
          </form>

          <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-5 text-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={fillDemoDoctor}
              leftIcon={<Sparkles className="h-4 w-4 text-teal-500" />}
            >
              Auto-fill Demo Doctor Credentials
            </Button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          <span>HIPAA Compliant Security & JWT Authentication</span>
        </div>
      </div>
    </div>
  );
}
