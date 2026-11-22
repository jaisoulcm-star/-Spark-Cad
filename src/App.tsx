import React, { useState, useEffect, useCallback, useRef } from 'react';
import { signInWithPopup, signOut, onIdTokenChanged } from 'firebase/auth';
import { auth, googleAuthProvider } from './lib/firebase';
import { CADDesign, Category, ContactMessage, User, PlatformStats } from './types';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { DesignCard } from './components/DesignCard';
import { DesignLibrary } from './components/DesignLibrary';
import { DesignDetail } from './components/DesignDetail';
import { AdminDashboard } from './components/AdminDashboard';
import { UserDashboard } from './components/UserDashboard';
import { AuthModal } from './components/AuthModal';
import { UploadModal } from './components/UploadModal';
import { LoginPage } from './components/LoginPage';
import { ArrowRight, CheckCircle2, X } from 'lucide-react';

const VALID_VIEWS = new Set(['home', 'library', 'latest', 'admin', 'profile', 'login']);

function readInitialViewFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam && VALID_VIEWS.has(viewParam)) {
      return viewParam;
    }
  } catch {
    // ignore URL read errors
  }
  return 'home';
}

function readDesignIdFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('design');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [designs, setDesigns] = useState<CADDesign[]>([]);
  const [allPublishedDesigns, setAllPublishedDesigns] = useState<CADDesign[]>([]);
  const [adminDesigns, setAdminDesigns] = useState<CADDesign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [inquiries, setInquiries] = useState<ContactMessage[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);

  const [currentView, setCurrentView] = useState<string>(() => readInitialViewFromUrl());
  const [profileTab, setProfileTab] = useState<'favorites' | 'downloads' | 'settings'>('favorites');
  const [selectedDesign, setSelectedDesign] = useState<CADDesign | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Keep bearer token strictly in React memory (never written to web storage)
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSoftware, setSelectedSoftware] = useState<string>('All');
  const [selectedFormat, setSelectedFormat] = useState<string>('All');
  const [selectedComplexity, setSelectedComplexity] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('latest');

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [editingDesign, setEditingDesign] = useState<CADDesign | null>(null);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const syncUrl = useCallback((view: string, designId?: string | null, replace = false) => {
    try {
      const nextParams = new URLSearchParams();
      if (designId) {
        nextParams.set('design', designId);
      } else if (view && view !== 'home') {
        nextParams.set('view', view);
      }
      const queryStr = nextParams.toString();
      const targetUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (targetUrl !== currentUrl) {
        if (replace) {
          window.history.replaceState({ view, designId: designId || null }, '', targetUrl);
        } else {
          window.history.pushState({ view, designId: designId || null }, '', targetUrl);
        }
      }
    } catch {
      // ignore history errors in sandboxed frames
    }
  }, []);

  const openDesignDetail = useCallback(
    (design: CADDesign) => {
      setSelectedDesign(design);
      syncUrl(currentView, design.id);
      window.scrollTo(0, 0);
    },
    [currentView, syncUrl]
  );

  const closeDesignDetail = useCallback(() => {
    setSelectedDesign(null);
    syncUrl(currentView, null);
  }, [currentView, syncUrl]);

  const navigateTo = useCallback(
    (view: string) => {
      const safeView = VALID_VIEWS.has(view) ? view : 'home';
      setSelectedDesign(null);
      setCurrentView(safeView);
      syncUrl(safeView, null);
      window.scrollTo(0, 0);
    },
    [syncUrl]
  );

  // Hydrate deep-linked ?design=<id> on mount and support browser Back/Forward
  const loadDeepLinkedDesign = useCallback(
    async (designId: string) => {
      try {
        const res = await fetch(`/api/designs/${encodeURIComponent(designId)}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          cache: 'no-store',
        });
        if (res.ok) {
          const data: CADDesign = await res.json();
          setSelectedDesign(data);
        } else {
          setSelectedDesign(null);
          showToast('Requested CAD design could not be found.');
          syncUrl('library', null, true);
          setCurrentView('library');
        }
      } catch {
        setSelectedDesign(null);
      }
    },
    [authToken, showToast, syncUrl]
  );

  useEffect(() => {
    const initialDesignId = readDesignIdFromUrl();
    if (initialDesignId) {
      loadDeepLinkedDesign(initialDesignId);
    }

    const handlePopState = () => {
      const designId = readDesignIdFromUrl();
      if (designId) {
        loadDeepLinkedDesign(designId);
      } else {
        setSelectedDesign(null);
        setCurrentView(readInitialViewFromUrl());
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [loadDeepLinkedDesign]);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory !== 'All') params.append('category', selectedCategory);
      if (selectedSoftware !== 'All') params.append('software', selectedSoftware);
      if (selectedFormat !== 'All') params.append('format', selectedFormat);
      if (selectedComplexity !== 'All') params.append('complexity', selectedComplexity);
      if (sortBy) params.append('sort', sortBy);

      const isAdmin = Boolean(authToken && currentUser?.role === 'admin');
      const authHeaders: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const [designsRes, allPubRes, catRes, statsRes, adminRes, userRes, contactRes] = await Promise.all([
        fetch(`/api/designs?${params.toString()}`, { cache: 'no-store' }),
        fetch('/api/designs?sort=order', { cache: 'no-store' }),
        fetch('/api/categories', { cache: 'no-store' }),
        fetch('/api/stats', { cache: 'no-store' }),
        isAdmin ? fetch('/api/designs?status=all&sort=order', { headers: authHeaders, cache: 'no-store' }) : Promise.resolve(null),
        isAdmin ? fetch('/api/users', { headers: authHeaders, cache: 'no-store' }) : Promise.resolve(null),
        isAdmin ? fetch('/api/contact', { headers: authHeaders, cache: 'no-store' }) : Promise.resolve(null),
      ]);

      let pubList: CADDesign[] = [];
      let adminList: CADDesign[] = [];

      if (designsRes.ok) {
        setDesigns(await designsRes.json());
      }
      if (allPubRes.ok) {
        pubList = await allPubRes.json();
        setAllPublishedDesigns(pubList);
      }
      if (catRes.ok) setCategories(await catRes.json());
      if (statsRes.ok) setStats(await statsRes.json());

      if (adminRes && adminRes.ok) {
        adminList = await adminRes.json();
        setAdminDesigns(adminList);
      } else if (!isAdmin) {
        setAdminDesigns([]);
      }

      if (userRes && userRes.ok) {
        setUsers(await userRes.json());
      } else if (!isAdmin) {
        setUsers([]);
      }

      if (contactRes && contactRes.ok) {
        setInquiries(await contactRes.json());
      } else if (!isAdmin) {
        setInquiries([]);
      }

      setSelectedDesign((prev) => {
        if (!prev) return null;
        return adminList.find((d) => d.id === prev.id) || pubList.find((d) => d.id === prev.id) || prev;
      });
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }, [searchQuery, selectedCategory, selectedSoftware, selectedFormat, selectedComplexity, sortBy, authToken, currentUser?.role]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Synchronize live PostgreSQL updates when user returns to tab/window or periodically while active
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    }, 15000);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.clearInterval(intervalId);
    };
  }, [fetchData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo('library');
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedSoftware('All');
    setSelectedFormat('All');
    setSelectedComplexity('All');
    setSortBy('latest');
  };

  const handleDownload = async (design: CADDesign, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    try {
      const authHeaders: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const res = await fetch(`/api/designs/${design.id}/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({})
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || `Download failed for ${design.title}.`);
        return;
      }

      const data = await res.json();
      const fileUrl = data.downloadUrl || `/api/designs/${design.id}/file`;
      const fileRes = await fetch(fileUrl, { headers: authHeaders });
      if (!fileRes.ok) {
        showToast(`Could not retrieve CAD file for "${design.title}".`);
        return;
      }

      const blob = await fileRes.blob();
      const disposition = fileRes.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const downloadName = match?.[1] || `${design.id}.${design.format.toLowerCase()}`;
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', downloadName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      showToast(`Successfully downloaded "${design.title}" (${design.fileSize})!`);
      if (selectedDesign?.id === design.id) {
        setSelectedDesign({ ...selectedDesign, downloadsCount: data.downloadsCount });
      }
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          downloadHistory: [
            { designId: design.id, downloadedAt: new Date().toISOString().split('T')[0] },
            ...(currentUser.downloadHistory || [])
          ]
        });
      }
      fetchData();
    } catch (err) {
      console.error('Download error:', err);
      showToast(`Download failed for ${design.title}. Please try again.`);
    }
  };

  const handleToggleFavorite = async (designId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser || !authToken) {
      setAuthModalOpen(true);
      return;
    }

    try {
      const res = await fetch('/api/users/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ designId })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser({ ...currentUser, favorites: data.favorites });
        const isFav = data.favorites.includes(designId);
        showToast(isFav ? 'Added to your favorites' : 'Removed from your favorites');
      } else if (res.status === 401) {
        handleLogout();
        setAuthModalOpen(true);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Could not update favorites.');
      }
    } catch (err) {
      console.error('Error updating favorites:', err);
      showToast('Could not update favorites.');
    }
  };

  const handleSubmitReview = async (
    designId: string,
    rating: number,
    comment: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser || !authToken) {
      setAuthModalOpen(true);
      return { success: false, error: 'Please sign in to submit a review.' };
    }
    try {
      const res = await fetch(`/api/designs/${encodeURIComponent(designId)}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.design) {
        setSelectedDesign(data.design);
        showToast('Thank you! Your engineering review has been posted.');
        fetchData();
        return { success: true };
      }
      if (res.status === 401) {
        handleLogout();
        setAuthModalOpen(true);
      }
      return { success: false, error: data.error || 'Unable to submit review.' };
    } catch {
      return { success: false, error: 'Network error while submitting review.' };
    }
  };

  const handleDeleteReview = async (designId: string, reviewId: string): Promise<void> => {
    if (!authToken) return;
    try {
      const res = await fetch(
        `/api/designs/${encodeURIComponent(designId)}/reviews/${encodeURIComponent(reviewId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.design) {
        setSelectedDesign(data.design);
        showToast('Review removed.');
        fetchData();
      } else {
        showToast(data.error || 'Unable to remove review.');
      }
    } catch {
      showToast('Network error removing review.');
    }
  };

  const handleLogin = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // ignore non-json error responses
      }
      if (res.ok && data.success) {
        setAuthToken(data.token || null);
        setCurrentUser(data.user);
        const nextView = data.user.role === 'admin' ? 'admin' : 'library';
        if (!selectedDesign) {
          setCurrentView(nextView);
          syncUrl(nextView, null);
        }
        showToast(`Welcome back, ${data.user.name}!`);
        return { success: true };
      }
      return { success: false, error: data.error || `Invalid email or password (HTTP ${res.status}).` };
    } catch (err) {
      console.error(err);
      return { success: false, error: 'Network error during sign in.' };
    }
  };

  const handleRegister = async (
    name: string,
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {}
      if (res.ok && data.success) {
        setAuthToken(data.token || null);
        setCurrentUser(data.user);
        if (!selectedDesign) {
          setCurrentView('library');
          syncUrl('library', null);
        }
        showToast('Account created successfully. Welcome to Spark Cat!');
        return { success: true };
      }
      return { success: false, error: data.error || `Unable to register account (HTTP ${res.status}).` };
    } catch (err) {
      console.error(err);
      return { success: false, error: 'Network error during registration.' };
    }
  };

  const handleSetupAdmin = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {}
      if (res.ok && data.success) {
        setAuthToken(data.token || null);
        setCurrentUser(data.user);
        setSelectedDesign(null);
        setCurrentView('admin');
        syncUrl('admin', null);
        showToast('Administrator password configured and signed in.');
        return { success: true };
      }
      return { success: false, error: data.error || `Unable to configure admin password (HTTP ${res.status}).` };
    } catch (err) {
      console.error(err);
      return { success: false, error: 'Network error configuring admin password.' };
    }
  };

  const handleGoogleLogin = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await credential.user.getIdToken();
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.user) {
        setAuthToken(idToken);
        setCurrentUser(data.user);
        const nextView = data.user.role === 'admin' ? 'admin' : 'library';
        if (!selectedDesign) {
          setCurrentView(nextView);
          syncUrl(nextView, null);
        }
        showToast(`Signed in as ${data.user.name}`);
        return { success: true };
      }
      return { success: false, error: data.error || 'Could not verify Google account with server.' };
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        return { success: false, error: 'Google sign-in popup was closed.' };
      }
      console.error('Google Sign-In error:', err);
      return { success: false, error: 'Unable to complete Google sign-in.' };
    }
  }, [selectedDesign, showToast, syncUrl]);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      if (!fbUser) return;
      try {
        const idToken = await fbUser.getIdToken();
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success && data.user) {
          setAuthToken(idToken);
          setCurrentUser(data.user);
        }
      } catch {
        // Ignore transient token sync issues
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth).catch(() => {});
    setAuthToken(null);
    setCurrentUser(null);
    setAdminDesigns([]);
    setUsers([]);
    setInquiries([]);
    setSelectedDesign(null);
    setCurrentView('home');
    syncUrl('home', null);
    showToast('Signed out successfully.');
  };

  const handleUpdateProfile = async (payload: {
    name: string;
    currentPassword?: string;
    newPassword?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!authToken) {
      return { success: false, error: 'Please sign in to update your profile.' };
    }
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.user) {
        setCurrentUser(data.user);
        showToast('Account settings updated.');
        fetchData();
        return { success: true };
      }
      return { success: false, error: data.error || 'Unable to update profile.' };
    } catch {
      return { success: false, error: 'Network error updating profile.' };
    }
  };

  const handleClearDownloadHistory = async (): Promise<void> => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/users/downloads', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        setCurrentUser((prev) => (prev ? { ...prev, downloadHistory: [] } : prev));
        showToast('Download history cleared.');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Unable to clear download history.');
      }
    } catch {
      showToast('Network error clearing download history.');
    }
  };

  const handleSaveDesign = async (
    designData: Partial<CADDesign> & {
      fileDataBase64?: string;
      originalFilename?: string;
      previewDataBase64?: string;
    }
  ): Promise<boolean> => {
    try {
      const url = designData.id ? `/api/designs/${designData.id}` : '/api/designs';
      const method = designData.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          ...designData,
          uploadedBy: designData.uploadedBy || currentUser?.name || 'Spark Cat Admin'
        })
      });

      if (res.ok) {
        const savedDesign: CADDesign | null = await res.json().catch(() => null);
        if (savedDesign && selectedDesign?.id === savedDesign.id) {
          setSelectedDesign(savedDesign);
        }
        showToast(designData.id ? 'CAD design updated successfully!' : 'New CAD design saved successfully!');
        await fetchData();
        setEditingDesign(null);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Error saving CAD design.');
        return false;
      }
    } catch (err) {
      console.error('Error saving design:', err);
      showToast('Error saving CAD design.');
      return false;
    }
  };

  const handleToggleDesignStatus = async (design: CADDesign): Promise<void> => {
    const nextStatus = design.status === 'published' ? 'draft' : 'published';
    try {
      const res = await fetch(`/api/designs/${encodeURIComponent(design.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await fetchData();
        showToast(
          nextStatus === 'published'
            ? `"${design.title}" is now published.`
            : `"${design.title}" moved to draft.`
        );
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Could not update design status.');
      }
    } catch {
      showToast('Could not update design status.');
    }
  };

  const handleDeleteDesign = async (designId: string) => {
    try {
      const res = await fetch(`/api/designs/${designId}`, {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        showToast('CAD design deleted successfully.');
        setCurrentUser((prev) =>
          prev
            ? { ...prev, favorites: (prev.favorites || []).filter((fid) => fid !== designId) }
            : prev
        );
        fetchData();
        if (selectedDesign?.id === designId) {
          setSelectedDesign(null);
          setCurrentView('library');
          syncUrl('library', null);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Error deleting design.');
      }
    } catch (err) {
      console.error(err);
      showToast('Error deleting design.');
    }
  };

  const handleCreateCategory = async (
    name: string,
    description: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ name, description })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Category "${data.name}" added.`);
        fetchData();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to add category.' };
    } catch (err) {
      console.error(err);
      return { success: false, error: 'Network error creating category.' };
    }
  };

  const handleUpdateCategory = async (
    id: string,
    name: string,
    description: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Category "${data.name}" updated.`);
        fetchData();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to update category.' };
    } catch {
      return { success: false, error: 'Network error updating category.' };
    }
  };

  const handleDeleteCategory = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('Category deleted.');
        fetchData();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to delete category.' };
    } catch {
      return { success: false, error: 'Network error deleting category.' };
    }
  };

  const handleUpdateUserRole = async (userId: string, role: 'admin' | 'user'): Promise<void> => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Updated account role to ${role}.`);
        fetchData();
      } else {
        showToast(data.error || 'Could not update user role.');
      }
    } catch {
      showToast('Network error updating user role.');
    }
  };

  const handleDeleteUser = async (userId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('User account removed.');
        fetchData();
      } else {
        showToast(data.error || 'Could not remove user.');
      }
    } catch {
      showToast('Network error removing user.');
    }
  };

  const handleUpdateInquiryStatus = async (id: string, status: 'new' | 'resolved'): Promise<void> => {
    try {
      const res = await fetch(`/api/contact/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showToast(status === 'resolved' ? 'Inquiry marked as resolved.' : 'Inquiry reopened.');
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Could not update inquiry status.');
      }
    } catch {
      showToast('Network error updating inquiry.');
    }
  };

  const handleDeleteInquiry = async (id: string): Promise<void> => {
    try {
      const res = await fetch(`/api/contact/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        showToast('Inquiry deleted.');
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Could not delete inquiry.');
      }
    } catch {
      showToast('Network error deleting inquiry.');
    }
  };

  const handleResetAdminDashboard = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        setSelectedDesign(null);
        setEditingDesign(null);
        handleResetFilters();
        await fetchData();
        showToast('Admin Dashboard has been reset to default state.');
        return true;
      }
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Error resetting Admin Dashboard.');
      return false;
    } catch (err) {
      console.error('Error resetting Admin Dashboard:', err);
      showToast('Error resetting Admin Dashboard.');
      return false;
    }
  };

  const handleBatchUploadDesigns = async (
    items: (Partial<CADDesign> & {
      fileDataBase64?: string;
      previewDataBase64?: string;
      originalFilename?: string;
    })[]
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/designs/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          designs: items.map((item) => ({
            ...item,
            uploadedBy: item.uploadedBy || currentUser?.name || 'Spark Cat Admin',
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data.created) ? data.created.length : items.length;
        showToast(`Uploaded ${count} CAD ${count === 1 ? 'design' : 'designs'} successfully!`);
        await fetchData();
        return true;
      }
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Error uploading CAD designs.');
      return false;
    } catch (err) {
      console.error('Batch upload error:', err);
      showToast('Error uploading CAD designs.');
      return false;
    }
  };

  const handleReorderDesigns = async (orderedIds: string[]): Promise<void> => {
    setAdminDesigns((prev) => {
      const byId = new Map(prev.map((d) => [d.id, d]));
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((d): d is CADDesign => Boolean(d));
      const seen = new Set(orderedIds);
      for (const d of prev) {
        if (!seen.has(d.id)) next.push(d);
      }
      return next.map((d, idx) => ({ ...d, order: idx }));
    });
    try {
      const res = await fetch('/api/designs/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ orderedIds }),
      });
      if (res.ok) {
        await fetchData();
        showToast('Updated CAD design order.');
      } else {
        const err = await res.json().catch(() => ({}));
        await fetchData();
        showToast(err.error || 'Could not save design order.');
      }
    } catch (err) {
      console.error('Reorder error:', err);
      await fetchData();
      showToast('Could not save design order.');
    }
  };

  const handleMoveDesignCategory = async (designId: string, category: string): Promise<void> => {
    try {
      const res = await fetch(`/api/designs/${designId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ category }),
      });
      if (res.ok) {
        await fetchData();
        showToast(`Moved design to "${category}".`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Could not update design category.');
      }
    } catch (err) {
      console.error('Move category error:', err);
      showToast('Could not update design category.');
    }
  };

  if (currentView === 'login' && !selectedDesign) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-700 selection:text-white">
        {toastMessage && (
          <div
            role="status"
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50 bg-white border border-slate-200 shadow-lg rounded-xl px-4 py-3 flex items-center gap-3 text-xs sm:text-sm text-slate-900"
          >
            <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}
        <LoginPage
          onLogin={handleLogin}
          onRegister={handleRegister}
          onSetupAdmin={handleSetupAdmin}
          onGoogleLogin={handleGoogleLogin}
          onBackHome={() => navigateTo('home')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-700 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50 bg-white border border-slate-200 shadow-lg rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm text-slate-900"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-slate-700 p-1 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navbar */}
      <Navbar
        currentView={currentView}
        setCurrentView={(view) => {
          if (view === 'latest') {
            setSortBy('latest');
          }
          navigateTo(view);
        }}
        currentUser={currentUser}
        onOpenAuth={() => navigateTo('login')}
        onLogout={handleLogout}
        onOpenUpload={() => {
          setEditingDesign(null);
          setUploadModalOpen(true);
        }}
        onOpenProfileTab={(tab) => {
          setProfileTab(tab);
          navigateTo('profile');
        }}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {selectedDesign ? (
          <DesignDetail
            design={selectedDesign}
            currentUser={currentUser}
            onBack={closeDesignDetail}
            onDownload={handleDownload}
            isFavorite={currentUser?.favorites?.includes(selectedDesign.id) || false}
            onToggleFavorite={handleToggleFavorite}
            onOpenAuth={() => setAuthModalOpen(true)}
            onSubmitReview={handleSubmitReview}
            onDeleteReview={handleDeleteReview}
            onEditDesign={(d) => {
              setEditingDesign(d);
              setUploadModalOpen(true);
            }}
            allDesigns={allPublishedDesigns}
            onSelectDesign={openDesignDetail}
          />
        ) : currentView === 'home' ? (
          <>
            <Hero
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSearchSubmit={handleSearchSubmit}
              onCategorySelect={(catName) => {
                setSelectedCategory(catName);
                navigateTo('library');
              }}
              stats={stats}
              onExploreClick={() => navigateTo('library')}
            />

            {/* Featured Designs Section */}
            <section className="py-10 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-10 pb-4 sm:pb-5 border-b border-slate-200">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                    Top Rated CAD Designs
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigateTo('library')}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-800 hover:text-blue-700 bg-white px-4 py-2.5 rounded-lg border border-slate-200 hover:border-slate-300 shadow-xs transition-colors whitespace-nowrap"
                >
                  <span>Explore Full Library</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {allPublishedDesigns.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                  {allPublishedDesigns.slice(0, 6).map((design) => (
                    <DesignCard
                      key={design.id}
                      design={design}
                      onSelect={openDesignDetail}
                      onDownload={handleDownload}
                      isFavorite={currentUser?.favorites?.includes(design.id) || false}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center space-y-4 shadow-xs">
                  <p className="text-slate-700 font-semibold text-sm sm:text-base">No featured CAD designs available yet.</p>
                  {currentUser?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDesign(null);
                        setUploadModalOpen(true);
                      }}
                      className="w-full sm:w-auto min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition-colors"
                    >
                      <span>Upload CAD Design</span>
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        ) : currentView === 'library' || currentView === 'latest' ? (
          <DesignLibrary
            designs={designs}
            categories={categories}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            selectedSoftware={selectedSoftware}
            setSelectedSoftware={setSelectedSoftware}
            selectedFormat={selectedFormat}
            setSelectedFormat={setSelectedFormat}
            selectedComplexity={selectedComplexity}
            setSelectedComplexity={setSelectedComplexity}
            sortBy={sortBy}
            setSortBy={setSortBy}
            onSelectDesign={openDesignDetail}
            onDownload={handleDownload}
            favorites={currentUser?.favorites || []}
            onToggleFavorite={handleToggleFavorite}
            onResetFilters={handleResetFilters}
          />
        ) : currentView === 'admin' ? (
          currentUser?.role === 'admin' ? (
            <AdminDashboard
              designs={adminDesigns}
              categories={categories}
              users={users}
              inquiries={inquiries}
              currentUserId={currentUser.id}
              stats={stats}
              onRefreshData={fetchData}
              onOpenUploadModal={() => {
                setEditingDesign(null);
                setUploadModalOpen(true);
              }}
              onViewDesign={openDesignDetail}
              onToggleDesignStatus={handleToggleDesignStatus}
              onEditDesign={(d) => {
                setEditingDesign(d);
                setUploadModalOpen(true);
              }}
              onDeleteDesign={handleDeleteDesign}
              onCreateCategory={handleCreateCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              onUpdateUserRole={handleUpdateUserRole}
              onDeleteUser={handleDeleteUser}
              onUpdateInquiryStatus={handleUpdateInquiryStatus}
              onDeleteInquiry={handleDeleteInquiry}
              onResetDashboard={handleResetAdminDashboard}
              onBatchUploadDesigns={handleBatchUploadDesigns}
              onReorderDesigns={handleReorderDesigns}
              onMoveDesignCategory={handleMoveDesignCategory}
            />
          ) : (
            <div className="max-w-md mx-auto py-28 px-4">
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs">
                <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
                <p className="text-slate-600 text-sm mb-6">
                  You must be signed in as an administrator to access the Admin Dashboard.
                </p>
                <button
                  type="button"
                  onClick={() => navigateTo('login')}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-5 py-2.5 rounded-lg transition-colors"
                >
                  Sign In as Admin
                </button>
              </div>
            </div>
          )
        ) : currentView === 'profile' ? (
          currentUser ? (
            <UserDashboard
              currentUser={currentUser}
              designs={adminDesigns.length > 0 ? adminDesigns : allPublishedDesigns}
              initialTab={profileTab}
              onSelectDesign={openDesignDetail}
              onDownload={handleDownload}
              onToggleFavorite={handleToggleFavorite}
              onUpdateProfile={handleUpdateProfile}
              onClearDownloadHistory={handleClearDownloadHistory}
            />
          ) : (
            <div className="max-w-md mx-auto py-28 px-4">
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-xs">
                <h2 className="text-xl font-bold text-slate-900 mb-2">Sign In Required</h2>
                <p className="text-slate-600 text-sm mb-6">
                  Please sign in to view your profile, favorites, and download history.
                </p>
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-5 py-2.5 rounded-lg transition-colors"
                >
                  Sign In
                </button>
              </div>
            </div>
          )
        ) : null}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onGoogleLogin={handleGoogleLogin}
      />

      {/* Upload / Edit Modal */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          setEditingDesign(null);
        }}
        categories={categories}
        onSaveDesign={handleSaveDesign}
        editingDesign={editingDesign}
      />
    </div>
  );
}
