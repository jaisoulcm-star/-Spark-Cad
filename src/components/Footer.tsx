import React, { useState } from 'react';
import { SparkCatLogo } from './SparkCatLogo';
import { ShieldCheck } from 'lucide-react';

interface FooterProps {
  setCurrentView: (view: string) => void;
  onSubscribe: (email: string) => Promise<{ success: boolean; error?: string }>;
}

export function Footer({ setCurrentView, onSubscribe }: FooterProps) {
  const [email, setEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    if (!email.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter an email address.' });
      return;
    }
    setSubmitting(true);
    const res = await onSubscribe(email);
    setSubmitting(false);
    if (res.success) {
      setEmail('');
      setStatusMsg({ type: 'success', text: 'Subscribed to weekly CAD engineering updates.' });
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Please enter a valid email.' });
    }
  };

  return (
    <footer className="bg-slate-950 border-t border-slate-900 text-slate-400 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand info */}
          <div className="md:col-span-1 space-y-4">
            <SparkCatLogo size="md" />
            <p className="text-xs text-slate-400 leading-relaxed">
              Spark Cat is the professional engineering and electrical CAD platform empowering engineers worldwide with verified schematics and 3D models.
            </p>
            <div className="flex items-center space-x-2 text-xs text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Verified CAD Standards</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4">Quick Links</h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button type="button" onClick={() => setCurrentView('home')} className="hover:text-white transition-colors">
                  Home Hub
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setCurrentView('library')} className="hover:text-white transition-colors">
                  CAD Design Library
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setCurrentView('categories')} className="hover:text-white transition-colors">
                  Engineering Categories
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setCurrentView('latest')} className="hover:text-white transition-colors">
                  Latest Uploads
                </button>
              </li>
            </ul>
          </div>

          {/* Software & Formats */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4">Supported Formats</h4>
            <ul className="space-y-2.5 text-xs">
              <li><span className="text-slate-300">AutoCAD DWG & DXF</span></li>
              <li><span className="text-slate-300">EPLAN Electric P8</span></li>
              <li><span className="text-slate-300">Autodesk Revit MEP</span></li>
              <li><span className="text-slate-300">SolidWorks & Inventor</span></li>
              <li><span className="text-slate-300">Fusion 360, PDF & ZIP</span></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4">Engineering Newsletter</h4>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Subscribe to get weekly notifications when new electrical and mechanical CAD designs are published.
            </p>
            <form onSubmit={handleJoin} className="flex items-center">
              <label htmlFor="footer-newsletter-email" className="sr-only">
                Newsletter email address
              </label>
              <input
                id="footer-newsletter-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="engineer@company.com"
                className="bg-slate-900 text-xs text-white px-4 py-2.5 rounded-l-xl border border-slate-800 focus:outline-none focus:border-blue-500 w-full"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-r-xl text-xs font-bold transition-all shrink-0 disabled:opacity-60"
              >
                {submitting ? '...' : 'Join'}
              </button>
            </form>
            {statusMsg && (
              <p
                role="status"
                className={`mt-2 text-xs font-medium ${
                  statusMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {statusMsg.text}
              </p>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <p>© 2026 Spark Cat CAD Design Hub. All rights reserved.</p>
          <div className="flex items-center space-x-6 mt-4 sm:mt-0">
            <span className="text-slate-600">Verified Engineering Repository</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
