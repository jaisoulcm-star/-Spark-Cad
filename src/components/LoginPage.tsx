import React, { useState, useEffect } from 'react';
import { Lock, Mail, User as UserIcon, ArrowRight, ArrowLeft, ShieldAlert } from 'lucide-react';
import { SparkCatLogo } from './SparkCatLogo';

interface AuthResult {
  success: boolean;
  error?: string;
}

interface LoginPageProps {
  onLogin: (email: string, pass: string) => Promise<AuthResult>;
  onRegister: (name: string, email: string, pass: string) => Promise<AuthResult>;
  onGoogleLogin?: () => Promise<AuthResult>;
  onSetupAdmin?: (email: string, pass: string) => Promise<AuthResult>;
  onBackHome: () => void;
}

export function LoginPage({ onLogin, onRegister, onBackHome }: LoginPageProps) {
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLoginTab) {
        const res = await onLogin(email, password);
        if (!res.success) {
          setError(res.error || 'Invalid email or password.');
        }
      } else {
        if (!name.trim() || !email.trim() || !password) {
          setError('Please fill in all required fields.');
          setLoading(false);
          return;
        }
        const res = await onRegister(name, email, password);
        if (!res.success) {
          setError(res.error || 'Unable to create account.');
        }
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 classic-drafting-grid flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-2 min-h-[44px] sm:min-h-0 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-3.5 py-2 rounded-lg mb-5 sm:mb-6 shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <div className="flex justify-center mb-4">
          <span className="sm:hidden">
            <SparkCatLogo size="md" />
          </span>
          <span className="hidden sm:inline-flex">
            <SparkCatLogo size="lg" />
          </span>
        </div>

        <h2 className="text-center text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {isLoginTab ? 'Sign in to Spark Cat' : 'Create your CAD Account'}
        </h2>
        <p className="mt-2 text-center text-xs text-slate-500">
          {isLoginTab ? 'Access verified electrical & engineering CAD designs' : 'Join professional engineers on Spark Cat'}
        </p>
      </div>

      <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 py-6 px-5 sm:py-8 sm:px-8 shadow-sm rounded-xl">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-lg mb-5 sm:mb-6">
            <button
              type="button"
              onClick={() => {
                setIsLoginTab(true);
                setError('');
              }}
              className={`flex-1 min-h-[40px] sm:min-h-0 py-2 text-xs font-semibold rounded-md transition-colors ${
                isLoginTab ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLoginTab(false);
                setError('');
              }}
              className={`flex-1 min-h-[40px] sm:min-h-0 py-2 text-xs font-semibold rounded-md transition-colors ${
                !isLoginTab ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 text-center font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLoginTab && (
              <div>
                <label htmlFor="login-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    id="login-name"
                    type="text"
                    placeholder="John Engineer"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required={!isLoginTab}
                    className="w-full bg-white text-slate-900 text-sm rounded-lg pl-9 pr-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 placeholder:text-slate-400"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  placeholder="engineer@sparkcat.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-white text-slate-900 text-sm rounded-lg pl-9 pr-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-white text-slate-900 text-sm rounded-lg pl-9 pr-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 placeholder:text-slate-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 px-5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
            >
              <span>{loading ? 'Please wait...' : isLoginTab ? 'Sign In to Spark Cat' : 'Create Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
