import React, { useState, useEffect, useRef } from 'react';
import { Search, Heart, User as UserIcon, ShieldAlert, LogOut, Download, Menu, X, PlusCircle } from 'lucide-react';
import { SparkCatLogo } from './SparkCatLogo';
import { User } from '../types';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  currentUser: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenUpload?: () => void;
  onOpenProfileTab?: (tab: 'favorites' | 'downloads') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
}

export function Navbar({
  currentView,
  setCurrentView,
  currentUser,
  onOpenAuth,
  onLogout,
  onOpenUpload,
  onOpenProfileTab,
  searchQuery,
  setSearchQuery,
  onSearchSubmit
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navLinks = [
    { id: 'home', label: 'Home' },
    { id: 'library', label: 'CAD Library' },
    { id: 'latest', label: 'Latest Uploads' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 sm:gap-6 h-14 sm:h-16">
          {/* Logo */}
          <button
            type="button"
            onClick={() => {
              setCurrentView('home');
              setMobileMenuOpen(false);
            }}
            aria-label="Spark Cat Home"
            className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 rounded-lg shrink-0"
          >
            <span className="sm:hidden">
              <SparkCatLogo size="sm" />
            </span>
            <span className="hidden sm:inline-flex">
              <SparkCatLogo size="md" />
            </span>
          </button>

          {/* Desktop Navigation Links */}
          <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => {
              const isActive = currentView === link.id;
              return (
                <button
                  type="button"
                  key={link.id}
                  onClick={() => setCurrentView(link.id)}
                  className={`py-2 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors duration-150 ${
                    isActive
                      ? 'border-blue-700 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Search Bar in Navbar */}
          <form onSubmit={onSearchSubmit} className="hidden xl:flex items-center relative w-56">
            <label htmlFor="navbar-search" className="sr-only">
              Search CAD designs
            </label>
            <input
              id="navbar-search"
              type="text"
              placeholder="Search CAD, DWG, EPLAN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 text-slate-900 text-xs rounded-lg pl-9 pr-3 py-2 border border-slate-200 focus:bg-white focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700 transition-colors placeholder:text-slate-400"
            />
            <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
          </form>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {currentUser ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  aria-expanded={userMenuOpen}
                  aria-label={`Account menu for ${currentUser.name}`}
                  className="flex items-center gap-2 bg-white hover:bg-slate-50 px-2 sm:px-3 py-1.5 min-h-[40px] rounded-lg border border-slate-200 transition-colors text-left whitespace-nowrap"
                >
                  <div className="w-7 h-7 rounded-md bg-slate-900 flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs font-semibold text-slate-900 truncate max-w-[115px]">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-slate-500 capitalize font-medium">
                      {currentUser.role}
                    </div>
                  </div>
                </button>

                {/* User Dropdown Menu */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
                    <div className="px-4 py-2.5 border-b border-slate-100 mb-1">
                      <p className="text-[11px] text-slate-500">Signed in as</p>
                      <p className="text-xs font-semibold text-slate-900 truncate">{currentUser.email}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenProfileTab) onOpenProfileTab('favorites');
                        else setCurrentView('profile');
                        setUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5"
                    >
                      <UserIcon className="w-4 h-4 text-slate-500" />
                      <span>My Profile & Favorites</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenProfileTab) onOpenProfileTab('downloads');
                        else setCurrentView('profile');
                        setUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5"
                    >
                      <Download className="w-4 h-4 text-slate-500" />
                      <span className="tabular-nums">Download History ({currentUser.downloadHistory?.length || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenProfileTab) onOpenProfileTab('favorites');
                        else setCurrentView('profile');
                        setUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5"
                    >
                      <Heart className="w-4 h-4 text-slate-500" />
                      <span className="tabular-nums">Saved Designs ({currentUser.favorites?.length || 0})</span>
                    </button>

                    {currentUser.role === 'admin' && (
                      <>
                        <div className="my-1 border-t border-slate-100" />
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentView('admin');
                            setUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 flex items-center gap-2.5"
                        >
                          <ShieldAlert className="w-4 h-4 text-blue-700" />
                          <span>Admin Dashboard</span>
                        </button>
                        {onOpenUpload && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenUpload();
                              setUserMenuOpen(false);
                            }}
                            className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                          >
                            <PlusCircle className="w-4 h-4 text-slate-500" />
                            <span>Upload CAD Design</span>
                          </button>
                        )}
                      </>
                    )}

                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        onLogout();
                        setUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                    >
                      <LogOut className="w-4 h-4 text-red-600" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm px-3 sm:px-4 min-h-[40px] rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0"
              >
                <UserIcon className="w-4 h-4 shrink-0" />
                <span className="sm:hidden">Sign In</span>
                <span className="hidden sm:inline">Sign In / Register</span>
              </button>
            )}

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 pt-3 pb-5 space-y-3 shadow-sm">
          {/* 1. Search */}
          <form
            onSubmit={(e) => {
              onSearchSubmit(e);
              setMobileMenuOpen(false);
            }}
            className="relative"
          >
            <label htmlFor="mobile-navbar-search" className="sr-only">
              Search CAD designs
            </label>
            <input
              id="mobile-navbar-search"
              type="text"
              placeholder="Search CAD designs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 text-slate-900 text-sm rounded-lg pl-10 pr-4 min-h-[44px] border border-slate-200 focus:bg-white focus:outline-none focus:border-blue-700"
            />
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
          </form>

          {/* 2. Primary Navigation */}
          <nav aria-label="Mobile Navigation" className="space-y-1">
            {navLinks.map((link) => (
              <button
                type="button"
                key={link.id}
                onClick={() => {
                  setCurrentView(link.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3.5 min-h-[44px] rounded-lg text-sm font-medium flex items-center transition-colors ${
                  currentView === link.id
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* 3. Account & Admin Links */}
          {currentUser && (
            <div className="pt-2 border-t border-slate-200 space-y-1">
              <button
                type="button"
                onClick={() => {
                  if (onOpenProfileTab) onOpenProfileTab('favorites');
                  else setCurrentView('profile');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3.5 min-h-[44px] rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
              >
                <UserIcon className="w-4 h-4 text-slate-500" />
                <span>My Profile & Favorites</span>
              </button>

              {currentUser.role === 'admin' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('admin');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 min-h-[44px] rounded-lg text-sm font-semibold text-blue-700 bg-blue-50 flex items-center gap-2.5"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Admin Dashboard</span>
                  </button>
                  {onOpenUpload && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenUpload();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full text-left px-3.5 min-h-[44px] rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                    >
                      <PlusCircle className="w-4 h-4 text-slate-500" />
                      <span>Upload CAD Design</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  onLogout();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3.5 min-h-[44px] rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-2.5"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
