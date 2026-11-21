import React, { useState, useEffect } from 'react';
import { User, CADDesign } from '../types';
import { Heart, Download, Calendar, ShieldCheck, Settings, Trash2, Save } from 'lucide-react';

interface UserDashboardProps {
  currentUser: User;
  designs: CADDesign[];
  initialTab?: 'favorites' | 'downloads' | 'settings';
  onSelectDesign: (design: CADDesign) => void;
  onDownload: (design: CADDesign) => void;
  onToggleFavorite: (designId: string) => void;
  onUpdateProfile?: (payload: {
    name: string;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onClearDownloadHistory?: () => Promise<void>;
}

const FALLBACK_PREVIEW = '/src/assets/images/cad_electrical_panel_1795206880418.jpg';

export function UserDashboard({
  currentUser,
  designs,
  initialTab = 'favorites',
  onSelectDesign,
  onDownload,
  onToggleFavorite,
  onUpdateProfile,
  onClearDownloadHistory,
}: UserDashboardProps) {
  const [activeTab, setActiveTab] = useState<'favorites' | 'downloads' | 'settings'>(initialTab);
  const [displayName, setDisplayName] = useState(currentUser.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setDisplayName(currentUser.name);
  }, [currentUser.name]);

  const favoriteDesigns = designs.filter(d => currentUser.favorites?.includes(d.id));
  const downloadedDesigns = (currentUser.downloadHistory || [])
    .map(dh => {
      const match = designs.find(d => d.id === dh.designId);
      return match ? { ...match, downloadedAt: dh.downloadedAt } : null;
    })
    .filter((d): d is CADDesign & { downloadedAt: string } => d !== null);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateProfile) return;
    setProfileMsg('');
    setProfileError('');
    if (!displayName.trim()) {
      setProfileError('Display name is required.');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setProfileError('New password must be at least 6 characters.');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await onUpdateProfile({
        name: displayName.trim(),
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      if (res.success) {
        setProfileMsg('Account settings updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
      } else {
        setProfileError(res.error || 'Could not update profile.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleClearHistory = async () => {
    if (!onClearDownloadHistory) return;
    setClearingHistory(true);
    try {
      await onClearDownloadHistory();
    } finally {
      setClearingHistory(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* User Profile Header */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 mb-6 sm:mb-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-900 flex items-center justify-center text-white text-xl sm:text-2xl font-extrabold shrink-0">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 truncate">{currentUser.name}</h1>
                <span className="text-xs font-semibold text-blue-700 capitalize shrink-0">
                  · {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">{currentUser.email}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 sm:mt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5 tabular-nums">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Joined {currentUser.createdAt}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Verified Account</span>
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-4 sm:gap-6 border-t sm:border-t-0 sm:border-l border-slate-200 pt-4 sm:pt-0 sm:pl-8 w-full sm:w-auto">
            <div className="text-center">
              <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{favoriteDesigns.length}</div>
              <div className="text-xs text-slate-500">Favorites</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{downloadedDesigns.length}</div>
              <div className="text-xs text-slate-500">Downloads</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 sm:flex sm:items-center sm:gap-6 border-b border-slate-200 mb-6 sm:mb-8">
          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 pb-3.5 pt-1 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'favorites'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Heart className="w-4 h-4 shrink-0" />
            <span className="tabular-nums">Favorites ({favoriteDesigns.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('downloads')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 pb-3.5 pt-1 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'downloads'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="tabular-nums">Downloads ({downloadedDesigns.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 pb-3.5 pt-1 min-h-[44px] text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'settings'
                ? 'border-blue-700 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Settings</span>
          </button>
        </div>

        {/* Tab 1: Favorites */}
        {activeTab === 'favorites' && (
          <div>
            {favoriteDesigns.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {favoriteDesigns.map((design) => (
                  <div
                    key={design.id}
                    className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 flex items-center gap-4 transition-colors shadow-xs group"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDesign(design)}
                      aria-label={`Open ${design.title}`}
                      className="shrink-0"
                    >
                      <img
                        src={design.previewUrl || FALLBACK_PREVIEW}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src !== window.location.origin + FALLBACK_PREVIEW) {
                            target.src = FALLBACK_PREVIEW;
                          }
                        }}
                        className="w-20 h-20 rounded-lg object-cover border border-slate-200"
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-500 font-mono">
                        <span className="text-blue-700 font-sans font-semibold">{design.software}</span> · {design.format}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 truncate mt-0.5">
                        <button
                          type="button"
                          onClick={() => onSelectDesign(design)}
                          className="text-left hover:underline"
                        >
                          {design.title}
                        </button>
                      </h4>
                      <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                        <span className="font-mono tabular-nums">{design.fileSize}</span>
                        <button
                          type="button"
                          onClick={() => onToggleFavorite(design.id)}
                          aria-label={`Remove ${design.title} from favorites`}
                          className="text-red-600 hover:text-red-700 font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white border border-slate-200 rounded-xl shadow-xs">
                <Heart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-900 mb-1">No Saved Favorites Yet</h3>
                <p className="text-xs text-slate-500">Click the heart icon on any CAD design card to save it to your profile.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Downloads */}
        {activeTab === 'downloads' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            {downloadedDesigns.length > 0 ? (
              <>
                {onClearDownloadHistory && (
                  <div className="px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600 tabular-nums">
                      {downloadedDesigns.length} Recorded {downloadedDesigns.length === 1 ? 'Download' : 'Downloads'}
                    </span>
                    <button
                      type="button"
                      disabled={clearingHistory}
                      onClick={handleClearHistory}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{clearingHistory ? 'Clearing...' : 'Clear History'}</span>
                    </button>
                  </div>
                )}
                <div className="divide-y divide-slate-200">
                  {downloadedDesigns.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors gap-3 sm:gap-4">
                      <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                        <img
                          src={item.previewUrl || FALLBACK_PREVIEW}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (target.src !== window.location.origin + FALLBACK_PREVIEW) {
                              target.src = FALLBACK_PREVIEW;
                            }
                          }}
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">
                            <button
                              type="button"
                              onClick={() => onSelectDesign(item)}
                              className="text-left hover:text-blue-700 transition-colors"
                            >
                              {item.title}
                            </button>
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-1 tabular-nums">
                            <span>{item.software} ({item.format})</span>
                            <span aria-hidden="true">·</span>
                            <span>Downloaded on {item.downloadedAt}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDownload(item)}
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-0 justify-center bg-white hover:bg-slate-50 text-slate-800 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-200 shrink-0 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-700" />
                        <span>Download Again</span>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <Download className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-900 mb-1">No Download History</h3>
                <p className="text-xs text-slate-500">Your downloaded CAD files will appear here for quick access.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Account Settings */}
        {activeTab === 'settings' && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 shadow-xs max-w-2xl">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Account Settings</h2>
            <p className="text-xs text-slate-500 mb-6">
              Update your display name or change your account password.
            </p>

            {profileMsg && (
              <div role="status" className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700 font-semibold">
                {profileMsg}
              </div>
            )}
            {profileError && (
              <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 font-semibold">
                {profileError}
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div>
                <label htmlFor="profile-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Display Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="w-full bg-white text-slate-900 text-sm rounded-lg px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
                />
              </div>

              <div>
                <label htmlFor="profile-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={currentUser.email}
                  disabled
                  className="w-full bg-slate-50 text-slate-500 text-sm rounded-lg px-3.5 py-2.5 border border-slate-200 cursor-not-allowed"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Change Password (Optional)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="profile-current-pass" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Current Password
                    </label>
                    <input
                      id="profile-current-pass"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full bg-white text-slate-900 text-sm rounded-lg px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-new-pass" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      New Password
                    </label>
                    <input
                      id="profile-new-pass"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full bg-white text-slate-900 text-sm rounded-lg px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-blue-700"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full sm:w-auto min-h-[44px] bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingProfile ? 'Saving Changes...' : 'Save Account Settings'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
