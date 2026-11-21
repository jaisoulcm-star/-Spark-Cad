import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, User as UserIcon, ArrowRight } from 'lucide-react';
import { SparkCatLogo } from './SparkCatLogo';

interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (email: string, pass: string) => Promise<AuthResult>;
  onRegister: (name: string, email: string, pass: string) => Promise<AuthResult>;
}

export function AuthModal({ isOpen, onClose, onLogin, onRegister }: AuthModalProps) {
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setPassword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLoginTab) {
        const res = await onLogin(email, password);
        if (res.success) {
          onClose();
        } else {
          setError(res.error || 'Invalid email or password. Try demo credentials below.');
        }
      } else {
        if (!name.trim() || !email.trim() || !password) {
          setError('Please fill in all required fields.');
          setLoading(false);
          return;
        }
        const res = await onRegister(name, email, password);
        if (res.success) {
          onClose();
        } else {
          setError(res.error || 'Unable to register account.');
        }
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setError('');
    setEmail(demoEmail);
    setPassword('demo123');
    setLoading(true);
    const res = await onLogin(demoEmail, 'demo123');
    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Demo sign in failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 sm:p-7 shadow-xl relative my-auto max-h-[calc(100dvh-1.5rem)] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close authentication modal"
          className="absolute top-4 right-4 sm:top-5 sm:right-5 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 flex items-center justify-center text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-5 sm:mb-6">
          <div className="flex justify-center mb-3">
            <SparkCatLogo size="sm" />
          </div>
          <h2 id="auth-modal-title" className="text-xl font-extrabold text-slate-900">
            {isLoginTab ? 'Welcome Back to Spark Cat' : 'Join Spark Cat Hub'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isLoginTab
              ? 'Sign in to access CAD files and download history'
              : 'Register to download professional engineering CAD designs'}
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg mb-5">
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
              <label htmlFor="modal-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  id="modal-name"
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
            <label htmlFor="modal-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                id="modal-email"
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
            <label htmlFor="modal-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                id="modal-password"
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
            <span>{loading ? 'Please wait...' : isLoginTab ? 'Sign In' : 'Create Account'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-200">
          <p className="text-xs text-slate-500 text-center mb-3">Quick demo engineer preview:</p>
          <button
            type="button"
            onClick={() => handleDemoLogin('alex@engineering.io')}
            className="w-full min-h-[44px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs py-2.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <UserIcon className="w-3.5 h-3.5 text-slate-500" />
            <span>Demo Engineer</span>
          </button>
        </div>
      </div>
    </div>
  );
}
