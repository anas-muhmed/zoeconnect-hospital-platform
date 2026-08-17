'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Navbar } from '../../components/layout/Navbar';
import { Sidebar } from '../../components/layout/Sidebar';
import { Button } from '../../components/ui/Button';
import { useLayoutStore } from '../../store/layoutStore';
import { useToast } from '../../components/ui/Toast';
import { aiService } from '../../services/aiService';
import { 
  MessageSquare, 
  Send, 
  Sparkles, 
  Bot, 
  FileText, 
  Stethoscope, 
  Mail, 
  BookOpen,
  ArrowRight,
  User,
  Loader2
} from 'lucide-react';

import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services/authService';

interface ChatMessage {
  id: string;
  sender: 'doctor' | 'zoibot';
  text: string;
  timestamp: Date;
}

export default function ZoiBotPage() {
  const { sidebarOpen } = useLayoutStore();
  const { showToast } = useToast();
  const { initAuth, setAuth } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'zoibot',
      text: "Hello Doctor! I am Zoi Bot, your intelligent clinical assistant. I'm trained to help you write professional patient communications, draft certificates, provide medical reference notes, and construct educational summaries. How can I assist your practice today?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initAuth();
    if (typeof window !== 'undefined' && !localStorage.getItem('jwt_token')) {
      authService.login('doctor@hospital.com', 'Password123!').then((data) => {
        setAuth(data.user, data.token);
      }).catch(() => {});
    }
  }, [initAuth, setAuth]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const doctorMessage: ChatMessage = {
      id: Math.random().toString(),
      sender: 'doctor',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, doctorMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const data = await aiService.askZoiBot(textToSend);
      const zoibotMessage: ChatMessage = {
        id: Math.random().toString(),
        sender: 'zoibot',
        text: data.response,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, zoibotMessage]);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Zoi Bot is currently offline', 'error');
      
      const errorMessage: ChatMessage = {
        id: Math.random().toString(),
        sender: 'zoibot',
        text: "❌ Error: I couldn't reach the AI models. Please check your internet connection or backend server status.",
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  const quickPrompts = [
    {
      label: 'Draft Referral',
      icon: FileText,
      text: 'Draft a professional referral letter for a 45-year-old male with chronic chest pressure to a cardiologist.',
      color: 'border-teal-200 text-teal-700 bg-teal-50 dark:border-teal-500/20 dark:text-teal-300 dark:bg-teal-500/5'
    },
    {
      label: 'Clinical Diagnosis',
      icon: Stethoscope,
      text: 'Suggest differential diagnoses for a child presenting with sudden barking cough, high fever, and stridor.',
      color: 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-500/20 dark:text-emerald-300 dark:bg-emerald-500/5'
    },
    {
      label: 'Patient Email',
      icon: Mail,
      text: 'Draft a friendly follow-up email explaining that the recent lipid panel results are normal, advising diet maintenance.',
      color: 'border-sky-200 text-sky-700 bg-sky-50 dark:border-sky-500/20 dark:text-sky-300 dark:bg-sky-500/5'
    },
    {
      label: 'Health Education',
      icon: BookOpen,
      text: 'Create a simple patient-friendly explanation of why taking daily anti-hypertensive medication is crucial.',
      color: 'border-indigo-200 text-indigo-700 bg-indigo-50 dark:border-indigo-500/20 dark:text-indigo-300 dark:bg-indigo-500/5'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-200">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 min-w-0 p-6 flex flex-col h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 transition-all duration-300">
          
          {/* Futuristic Page Header */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4 shrink-0">
            <div>
              <h2 className={`font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2.5 transition-all duration-300 ${sidebarOpen ? 'text-xl' : 'text-2xl'}`}>
                <div className="relative">
                  <div className="absolute -inset-1 rounded-full bg-teal-500/30 blur-sm animate-pulse" />
                  <Bot className="relative h-6.5 w-6.5 text-teal-600 dark:text-teal-400" />
                </div>
                Zoi.AI Clinical Co-Pilot
              </h2>
              <p className={`text-slate-500 dark:text-slate-400 mt-0.5 transition-all duration-300 ${sidebarOpen ? 'text-xs' : 'text-sm'}`}>
                Advanced conversational model assisting with documentation, templates, and general practice support.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
                <Sparkles className="h-3 w-3 text-teal-500" /> Zoi.AI active
              </span>
            </div>
          </div>

          {/* Futuristic Chat Box Layout */}
          <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-100 dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none overflow-hidden">
            
            {/* Quick Actions / Prompts Container */}
            <div className="border-b border-slate-100 dark:border-slate-800 p-4 shrink-0 bg-slate-50/50 dark:bg-slate-900/40">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                Quick Assistant Actions
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {quickPrompts.map((prompt) => {
                  const Icon = prompt.icon;
                  return (
                    <button
                      key={prompt.label}
                      type="button"
                      onClick={() => handleSendMessage(prompt.text)}
                      disabled={isLoading}
                      className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left text-xs font-medium transition-all duration-200 hover:scale-[1.01] hover:shadow-sm disabled:opacity-50 ${prompt.color}`}
                    >
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="block font-bold">{prompt.label}</span>
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {prompt.text}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white dark:bg-slate-950/40">
              {messages.map((msg) => {
                const isZoi = msg.sender === 'zoibot';
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3.5 max-w-[85%] ${isZoi ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
                  >
                    {/* Avatar */}
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-white transition-all ${
                      isZoi 
                        ? 'bg-gradient-to-br from-teal-500 to-emerald-600 border-teal-400 shadow-sm' 
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      {isZoi ? <Bot className="h-4.5 w-4.5" /> : <User className="h-4.5 w-4.5" />}
                    </div>

                    {/* Balloon */}
                    <div className="space-y-1">
                      <div className={`rounded-2xl border p-4 shadow-sm text-sm leading-relaxed transition-all duration-200 ${
                        isZoi
                          ? 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-900/60 dark:border-slate-800 dark:text-slate-100 rounded-tl-sm'
                          : 'bg-teal-600 border-teal-500 text-white dark:bg-teal-950/60 dark:border-teal-500/40 dark:text-teal-200 rounded-tr-sm'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      </div>
                      <span className={`block text-[10px] text-slate-400 ${!isZoi && 'text-right'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Typing Animation */}
              {isLoading && (
                <div className="flex gap-3.5 max-w-[80%] mr-auto">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br from-teal-500 to-emerald-600 border-teal-400 text-white shadow-sm">
                    <Bot className="h-4.5 w-4.5" />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60 rounded-tl-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-teal-600 dark:text-teal-400" />
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Zoi Bot is drafting response...</span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="border-t border-slate-200 dark:border-slate-800 p-4 shrink-0 bg-slate-50/50 dark:bg-slate-900/40">
              <form onSubmit={handleFormSubmit} className="flex gap-2.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Zoi Bot for medical drafts, referral notes, education templates, or clinical info..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 shadow-inner"
                    disabled={isLoading}
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">Enter</span>
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  className="rounded-xl px-5 shrink-0"
                  disabled={!input.trim() || isLoading}
                  rightIcon={<Send className="h-4.5 w-4.5" />}
                >
                  Ask
                </Button>
              </form>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
