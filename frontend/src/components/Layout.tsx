// frontend/src/components/Layout.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notificationAPI } from '../api';
import {
  Menu, X, Home, FileText, FolderOpen, ClipboardCheck, Settings,
  Bell, LogOut, ChevronRight, ChevronDown, LayoutGrid, User, Search, Database, Network, ClipboardList,
  Users, Gauge, History as HistoryIcon, Wrench, FlaskConical, ShieldAlert, BarChart3,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

interface NotificationItem {
  id?: number | string;
  type?: string;
  message?: string;
  cr_id?: number | string;
  metadata?: { cr_id?: number | string; year?: number | string };
  is_read?: number | string;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [qualityExpanded, setQualityExpanded] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [adminModeOpen, setAdminModeOpen] = useState(false);
  const [adminModeLoading, setAdminModeLoading] = useState(false);
  const [adminModeError, setAdminModeError] = useState('');
  const [adminModeForm, setAdminModeForm] = useState({ employee_code: '', password: '' });
  const { user, logout, login, roleMode, setRoleMode } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const profileRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);

  const avatarOptions = [
    { id: 'male-1', label: 'Male 1', gender: 'Male', emoji: '👨' },
    { id: 'male-2', label: 'Male 2', gender: 'Male', emoji: '👨🏻' },
    { id: 'male-3', label: 'Male 3', gender: 'Male', emoji: '👨🏽' },
    { id: 'male-4', label: 'Male 4', gender: 'Male', emoji: '👨🏾' },
    { id: 'male-5', label: 'Male 5', gender: 'Male', emoji: '👨🏿' },
    { id: 'female-1', label: 'Female 1', gender: 'Female', emoji: '👩' },
    { id: 'female-2', label: 'Female 2', gender: 'Female', emoji: '👩🏻' },
    { id: 'female-3', label: 'Female 3', gender: 'Female', emoji: '👩🏽' },
    { id: 'female-4', label: 'Female 4', gender: 'Female', emoji: '👩🏾' },
    { id: 'female-5', label: 'Female 5', gender: 'Female', emoji: '👩🏿' },
  ];

  const avatarStorageKey = `avatar_choice_${(user as any)?.id || (user as any)?.employee_code || 'default'}`;
  const [selectedAvatar, setSelectedAvatar] = useState('male-1');

  useEffect(() => {
    const savedAvatar = localStorage.getItem(avatarStorageKey);
    if (savedAvatar && avatarOptions.some((option) => option.id === savedAvatar)) {
      setSelectedAvatar(savedAvatar);
    } else {
      setSelectedAvatar('male-1');
    }
  }, [avatarStorageKey]);

  useEffect(() => {
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
        setPickerOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setNotificationOpen(false);
      }
    };

    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      setLoadingNotifications(true);
      const response = await notificationAPI.getNotifications(true);
      const items = response.data?.notifications || [];
      setNotifications((prev) => {
        const seen = new Map<string, NotificationItem>();
        const combined = [...items, ...prev].filter((item) => {
          const key = String(item.id || item.message || Math.random());
          if (seen.has(key)) return false;
          seen.set(key, item);
          return true;
        });
        return combined.slice(0, 3);
      });
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (!user) return;

  loadNotifications();
  const intervalId = setInterval(() => loadNotifications(), 15000);

    return () => clearInterval(intervalId);
  }, [user, notificationOpen]);

  const unreadCount = notifications.filter((item) => Number(item.is_read || 0) === 0).length;
  const pendingActions = notifications
    .filter((item) => item.cr_id || item.metadata?.cr_id || String(item.type || '').toUpperCase().startsWith('TRAINING_PLAN_'))
    .slice(0, 5);

  const openChangeRequestDetail = (item: NotificationItem) => {
    setNotificationOpen(false);
    if (String(item.type || '').toUpperCase().startsWith('TRAINING_PLAN_')) {
      navigate('/plan/training');
      return;
    }
    const crId = item.cr_id || item.metadata?.cr_id;
    if (crId) {
      navigate(`/dcr/${crId}`);
    } else {
      navigate('/dcr');
    }
  };

  useEffect(() => {
    const matches = getSearchMatches(searchQuery);
    setSearchResults(matches);
    setSearchOpen(Boolean(searchQuery.trim()));
  }, [searchQuery, (user as any)?.role]);

  const activeAvatar = avatarOptions.find((option) => option.id === selectedAvatar) || avatarOptions[0];
  const profileName = (user as any)?.name || '-';
  const actualRole = (user as any)?.actual_role || (user as any)?.role;
  const profilePosition = (user as any)?.position || actualRole || '-';
  const normalizedActualRole = String(actualRole || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const canSwitchToUserMode = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(normalizedActualRole);
  const canUseAdminMode = Boolean(user);
  const profileEmail = (user as any)?.email || ((user as any)?.employee_code ? `${String((user as any).employee_code).toLowerCase()}@nsk.local` : '-');

  const handleAdminModeLogin = async () => {
    if (!adminModeForm.employee_code.trim() || !adminModeForm.password.trim()) {
      setAdminModeError('Please enter admin username and password.');
      return;
    }
    try {
      setAdminModeLoading(true);
      setAdminModeError('');
      await login(adminModeForm.employee_code.trim(), adminModeForm.password.trim());
      setAdminModeOpen(false);
      setAdminModeForm({ employee_code: '', password: '' });
    } catch (error: any) {
      setAdminModeError(String(error || 'Admin login failed'));
    } finally {
      setAdminModeLoading(false);
    }
  };

  const handleAvatarSelect = (avatarId: string) => {
    setSelectedAvatar(avatarId);
    localStorage.setItem(avatarStorageKey, avatarId);
  };

  const searchablePages = [
    { path: '/dashboard', label: 'Dashboard', keywords: 'home overview summary personal my tickets dcr' },
    { path: '/documents', label: 'Document Repository', keywords: 'documents repository controlled IATF level 1 2 3 4 quality manual procedure work instruction form report' },
  { path: '/dcr', label: 'Create/Change Request', keywords: 'dcr change request workflow approvals review submit decision reupload re-upload' },
    { path: '/dcr/create', label: 'Create DCR', keywords: 'create new change request draft' },
    { path: '/flowchart', label: 'Flowchart', keywords: 'flow chart process map workflow process owner manager document controller' },
    { path: '/flowchart/kpi', label: 'KPI', keywords: 'kpi charts graph performance indicator excel reference' },
    { path: '/flowchart/procedure', label: 'Procedure Flowchart', keywords: 'procedure acronym terms status reference documents' },
    { path: '/plan', label: 'Plan', keywords: 'planning equipment calibration maintenance training hub powertrain' },
    { path: '/quality', label: 'Quality', keywords: 'quality msa measurement system analysis gauge repeatability reproducibility' },
    { path: '/quality/msa', label: 'MSA', keywords: 'msa measurement system analysis gauge r&r bias linearity stability 7.1.5.1' },
    { path: '/safety', label: 'Risk Assessment', keywords: 'safety risk assessment hazard iso 45001 workplace hazard identification severity likelihood control measures' },
    { path: '/report', label: 'Report', keywords: 'report work log management summary analytics' },
    { path: '/logs', label: 'System Logs', keywords: 'audit trail activity history view logs' },
    ...(((user as any)?.role === 'ADMIN' || (user as any)?.role === 'QMR')
      ? [{ path: '/admin', label: 'Administration', keywords: 'admin users roles audit compliance migration settings' }]
      : []),
    ...(((user as any)?.role === 'ADMIN')
      ? [{ path: '/admin/migrate', label: 'Data Migration', keywords: 'migration upload legacy import documents' }]
      : []),
  ];

  const getSearchMatches = (query: string) => {
    const normalized = String(query || '').toLowerCase().trim();
    if (!normalized) return [];

    const words = normalized.split(/\s+/).filter(Boolean);

    return searchablePages
      .map((page) => {
        const haystack = `${page.label} ${page.path} ${page.keywords}`.toLowerCase();
        let score = 0;

        if (haystack.includes(normalized)) {
          score += 100;
        }

        words.forEach((word) => {
          if (haystack.includes(word)) score += 20;
          if (page.label.toLowerCase().includes(word)) score += 10;
          if (page.path.toLowerCase().includes(word)) score += 8;
        });

        return { ...page, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  };

  const runSearch = (query: string) => {
    const matches = getSearchMatches(query);
    if (matches.length > 0) {
      navigate(matches[0].path);
      setSearchQuery('');
      setSearchOpen(false);
      setSearchResults([]);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isPathMatch = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
    { path: '/documents', label: 'Documents', icon: FolderOpen },
  { path: '/dcr', label: 'Create/Change Request', icon: ClipboardCheck },
    { path: '/flowchart', label: 'Flowchart', icon: Network },
    { path: '/flowchart/kpi', label: 'KPI', icon: BarChart3 },
    { path: '/plan', label: 'Plan', icon: ClipboardList },
    { path: '/quality', label: 'Quality', icon: FlaskConical },
    { path: '/safety', label: 'Risk Assessment', icon: ShieldAlert },
    { path: '/report', label: 'Report', icon: FileText },
    { path: '/logs', label: 'System Logs', icon: FileText },
  ];

  if ((user as any)?.role === 'ADMIN' || (user as any)?.role === 'QMR') {
    menuItems.push({
      path: '/admin',
      label: 'Administration',
      icon: Settings
    });
  }

  if ((user as any)?.role === 'ADMIN') {
    menuItems.push({
      path: '/admin/migrate',
      label: 'Data Migration',
      icon: Database
    });
  }

  const activePath = menuItems
    .filter((item) => isPathMatch(item.path))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  // Auto-expand Quality section when on a quality sub-route
  React.useEffect(() => {
    if (location.pathname.startsWith('/quality/')) {
      setQualityExpanded(true);
    }
  }, [location.pathname]);



  return (
    <div className="flex bg-slate-50 min-h-screen font-sans text-slate-900">
      {adminModeOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Admin Mode</h3>
            <p className="text-sm text-slate-600 mt-1">Login with admin username and password.</p>

            {adminModeError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {adminModeError}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <input
                value={adminModeForm.employee_code}
                onChange={(e) => setAdminModeForm((prev) => ({ ...prev, employee_code: e.target.value }))}
                placeholder="Admin username"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
              <input
                type="password"
                value={adminModeForm.password}
                onChange={(e) => setAdminModeForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Admin password"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdminModeOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdminModeLogin}
                disabled={adminModeLoading}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {adminModeLoading ? 'Signing in...' : 'Login'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar - Discord/Twitter Style (Fixed Left Rail) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#0f172a] text-white transition-all duration-300 ease-in-out flex flex-col border-r border-slate-700/50 shadow-2xl ${
          sidebarOpen ? 'w-72' : 'w-20'
        }`}
      >
        {/* Brand Area */}
        <div className="h-20 flex items-center px-5 border-b border-slate-700/50">
          <div className="flex items-center gap-4 w-full overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-blue-900/20 shrink-0 transform transition-transform hover:scale-105 duration-200">
              <span className="text-red-600 font-black text-xs tracking-tight">NSK</span>
            </div>
            <div className={`flex flex-col transition-all duration-300 ${sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}>
              <span className="font-bold text-lg tracking-tight whitespace-nowrap text-white">NSK APTC</span>
              <span className="text-xs text-blue-300 font-medium tracking-wide">IATF 16949 System</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto scrollbar-hide">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = activePath === item.path;
            const isPlan = item.path === '/plan';

            if (isPlan) {
              const planSubActive = location.pathname.startsWith('/plan/');
              return (
                <Link
                  key={item.path}
                  to="/plan"
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 group relative ${
                    active || planSubActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 translate-x-1'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-white hover:translate-x-1'
                  }`}
                >
                  <Icon size={22} strokeWidth={active || planSubActive ? 2.5 : 2} className="shrink-0 transition-transform group-hover:scale-110 duration-200" />
                  <span className={`font-medium whitespace-nowrap transition-all duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                    {item.label}
                  </span>
                  {!sidebarOpen && (
                    <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-all duration-200 shadow-xl border border-slate-700">
                      {item.label}
                      <div className="absolute top-1/2 -left-1.5 -mt-1 border-4 border-transparent border-r-slate-900"></div>
                    </div>
                  )}
                </Link>
              );
            }

            // ── Quality expandable section ──────────────────────────────────
            if (item.path === '/quality') {
              const qualitySubActive = location.pathname.startsWith('/quality/');
              return (
                <div key={item.path}>
                  <button
                    type="button"
                    onClick={() => {
                      if (sidebarOpen) setQualityExpanded((v) => !v);
                      else setQualityExpanded(true);
                    }}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 group relative ${
                      active || qualitySubActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 translate-x-1'
                        : 'text-slate-400 hover:bg-slate-800/80 hover:text-white hover:translate-x-1'
                    }`}
                  >
                    <FlaskConical size={22} strokeWidth={active || qualitySubActive ? 2.5 : 2} className="shrink-0 transition-transform group-hover:scale-110 duration-200" />
                    <span className={`flex-1 font-medium whitespace-nowrap text-left transition-all duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                      {item.label}
                    </span>
                    {sidebarOpen && (qualityExpanded ? <ChevronDown size={14} className="shrink-0 opacity-70" /> : <ChevronRight size={14} className="shrink-0 opacity-70" />)}
                    {!sidebarOpen && (
                      <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-all duration-200 shadow-xl border border-slate-700">
                        {item.label}
                        <div className="absolute top-1/2 -left-1.5 -mt-1 border-4 border-transparent border-r-slate-900"></div>
                      </div>
                    )}
                  </button>
                  {qualityExpanded && sidebarOpen && (
                    <div className="mt-1 ml-4 pl-4 border-l border-slate-700 space-y-1">
                      <Link
                        to="/quality"
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group ${
                          location.pathname === '/quality'
                            ? 'bg-slate-700 text-white font-semibold'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <FlaskConical size={16} className="shrink-0" />
                        All Modules
                      </Link>
                      <Link
                        to="/quality/msa"
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group ${
                          location.pathname.startsWith('/quality/msa')
                            ? 'bg-slate-700 text-white font-semibold'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span className="text-base leading-none">📏</span>
                        MSA
                        <span className="ml-auto text-xs text-slate-500 font-medium">7.1.5.1</span>
                      </Link>
                    </div>
                  )}
                </div>
              );
            }



            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 group relative ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 translate-x-1'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-white hover:translate-x-1'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} className="shrink-0 transition-transform group-hover:scale-110 duration-200" />

                <span className={`font-medium whitespace-nowrap transition-all duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  {item.label}
                </span>

                {/* Tooltip for collapsed state */}
                {!sidebarOpen && (
                  <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-all duration-200 shadow-xl border border-slate-700">
                    {item.label}
                    {/* Arrow */}
                    <div className="absolute top-1/2 -left-1.5 -mt-1 border-4 border-transparent border-r-slate-900"></div>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile - Bottom */}
        <div className="p-4 border-t border-slate-700/50 bg-slate-900/50">
          <div className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${sidebarOpen ? 'bg-slate-800/80 border border-slate-700' : 'justify-center'}`}>
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0 border-2 border-slate-600 overflow-hidden">
               {/* Use initials if avatar not available */}
              <span className="font-bold text-slate-300">{(user as any)?.name?.charAt(0) || 'U'}</span>
            </div>

            <div className={`flex-1 min-w-0 transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 hidden'}`}>
              <p className="text-sm font-semibold truncate text-white">{(user as any)?.name}</p>
              <p className="text-xs text-blue-300 truncate capitalize font-medium">{String((user as any)?.role || '').toLowerCase()}</p>
            </div>

            {sidebarOpen && (
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors ml-1"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 min-h-screen bg-slate-50 ${
          sidebarOpen ? 'ml-72' : 'ml-20'
        }`}
      >
        {/* Top Header - Glassmorphism */}
        <header className="h-20 bg-white/90 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40 px-8 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2.5 -ml-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600 rounded-xl transition-all active:scale-95 duration-200 shadow-sm border border-transparent hover:border-slate-200"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="hidden sm:block">
              <h1 className="text-base font-semibold text-slate-800 leading-tight">
                {menuItems.find((i) => i.path === activePath)?.label || 'Dashboard'}
              </h1>
              <p className="text-[11px] text-slate-400 leading-none mt-0.5">Welcome, {(user as any)?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Modern Search Bar */}
            <div className="hidden md:block relative" ref={searchRef}>
              <div className="flex items-center bg-slate-100/80 rounded-full px-5 py-2.5 border border-transparent focus-within:border-blue-500/50 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10 transition-all w-72 shadow-inner">
                <Search size={18} className="text-slate-400 mr-3" />
                <input
                  type="text"
                  placeholder="Search anything..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchOpen(Boolean(searchQuery.trim()))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      runSearch(searchQuery);
                    }
                  }}
                  className="bg-transparent border-none outline-none text-sm w-full placeholder:text-slate-400 text-slate-700 font-medium"
                />
              </div>

              {searchOpen && searchResults.length > 0 && (
                <div className="absolute top-12 left-0 w-96 max-w-[70vw] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2">
                  {searchResults.map((result) => (
                    <button
                      key={result.path}
                      type="button"
                      onClick={() => {
                        navigate(result.path);
                        setSearchQuery('');
                        setSearchOpen(false);
                        setSearchResults([]);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <p className="text-sm font-semibold text-slate-900">{result.label}</p>
                      <p className="text-xs text-slate-500">{result.path}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 border-l border-slate-200 pl-5">
              <div className="relative" ref={notificationRef}>
                <button
                  type="button"
                  onClick={async () => {
                    const nextOpen = !notificationOpen;
                    setNotificationOpen(nextOpen);
                    if (nextOpen && unreadCount > 0) {
                      await notificationAPI.markAllAsRead();
                      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: 1 })));
                    }
                  }}
                  className="relative p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all duration-200 active:scale-95 group"
                >
                  <Bell size={22} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center group-hover:scale-110 transition-transform">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notificationOpen && (
                  <div className="absolute right-0 mt-2 w-[430px] max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
                      <span className="text-xs font-semibold text-slate-500">{notifications.length} items</span>
                    </div>

                    <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100">
                      {loadingNotifications ? (
                        <div className="px-4 py-6 text-sm text-slate-500">Loading notifications...</div>
                      ) : notifications.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-500">No notifications</div>
                      ) : (
                        notifications.map((item) => {
                          const crId = item.cr_id || item.metadata?.cr_id;
                          const isTrainingPlanNotif = String(item.type || '').toUpperCase().startsWith('TRAINING_PLAN_');
                          const refLabel = isTrainingPlanNotif
                            ? `Training Plan ${item.metadata?.year || ''}`
                            : `Request ID: ${crId || '-'}`;
                          return (
                            <div
                              key={item.id}
                              className="px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                              onClick={() => openChangeRequestDetail(item)}
                            >
                              <p className="text-xs font-semibold text-slate-500">{item.type || 'Notification'}</p>
                              <p className="text-sm text-slate-800 mt-1">{item.message}</p>
                              <div className="mt-2 flex items-center justify-between gap-3">
                                <span className="text-xs text-slate-500">{refLabel}</span>
                                <span className="text-xs font-semibold text-indigo-600">Open →</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Pending Actions</p>
                      {pendingActions.length === 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-500">No pending actions</p>
                          <button
                            type="button"
                            onClick={() => {
                              setNotificationOpen(false);
                              navigate('/dcr');
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                          >
                            <p className="text-xs font-semibold text-slate-700">Open Change Request List</p>
                            <p className="text-xs text-indigo-600 font-semibold mt-0.5">Go to all requests</p>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {pendingActions.map((item) => {
                            const crId = item.cr_id || item.metadata?.cr_id;
                            const isTPlan = String(item.type || '').toUpperCase().startsWith('TRAINING_PLAN_');
                            const btnTitle = isTPlan
                              ? `Training Plan ${item.metadata?.year || ''}`
                              : `Change Request #${crId || '-'}`;
                            return (
                              <button
                                key={`pending-${item.id}`}
                                type="button"
                                onClick={() => openChangeRequestDetail(item)}
                                className="w-full text-left px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                              >
                                <p className="text-xs font-semibold text-slate-700">{btnTitle}</p>
                                <p className="text-xs text-indigo-600 font-semibold mt-0.5">Go to details</p>
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              setNotificationOpen(false);
                              navigate('/dcr');
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                          >
                            <p className="text-xs font-semibold text-slate-700">Open Change Request List</p>
                            <p className="text-xs text-indigo-600 font-semibold mt-0.5">Go to all requests</p>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen((prev) => !prev);
                    setPickerOpen(false);
                  }}
                  className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 p-[2px] cursor-pointer hover:shadow-lg transition-shadow"
                  aria-label="Open profile"
                >
                  <div className="h-full w-full rounded-full bg-white flex items-center justify-center text-lg">
                    <span role="img" aria-label={activeAvatar.label}>{activeAvatar.emoji}</span>
                  </div>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-5">
                    <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                      <div className="h-14 w-14 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-3xl">
                        <span role="img" aria-label={activeAvatar.label}>{activeAvatar.emoji}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-bold text-slate-900 truncate">{profileName}</p>
                        <p className="text-sm text-slate-600 truncate">{profilePosition}</p>
                        {canSwitchToUserMode && roleMode === 'USER' && (
                          <p className="text-xs font-semibold text-amber-600">Normal user mode</p>
                        )}
                        <p className="text-sm text-slate-500 truncate">{profileEmail}</p>
                      </div>
                    </div>

                    <div className="pt-4">
                      {canUseAdminMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setAdminModeOpen(true);
                            setAdminModeError('');
                          }}
                          className="w-full px-3 py-2 mb-3 text-sm font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          Admin Mode
                        </button>
                      )}
                      {canSwitchToUserMode && (
                        <button
                          type="button"
                          onClick={() => setRoleMode(roleMode === 'USER' ? 'DEFAULT' : 'USER')}
                          className="w-full px-3 py-2 mb-3 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          {roleMode === 'USER' ? 'Switch back to Document Control' : 'Switch to Normal User'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPickerOpen((prev) => !prev)}
                        className="w-full px-3 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        {pickerOpen ? 'Hide Avatar Choices' : 'Change Avatar'}
                      </button>

                      {pickerOpen && (
                        <div className="mt-3 grid grid-cols-5 gap-2">
                          {avatarOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleAvatarSelect(option.id)}
                              className={`h-11 w-11 rounded-full border flex items-center justify-center text-xl transition-all ${
                                selectedAvatar === option.id
                                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                                  : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                              }`}
                              title={`${option.gender} avatar`}
                              aria-label={option.label}
                            >
                              <span role="img" aria-label={option.label}>{option.emoji}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content Container */}
        <main className="flex-1 p-8 max-w-[1600px] w-full mx-auto animate-fade-in-up">
           {/* Breadcrumb-ish or decorative element */}
           <div className="hidden mb-6 text-sm text-slate-500 font-medium tracking-wide uppercase">
             {location.pathname.replace('/', '') || 'Overview'}
           </div>
          {children}
        </main>
      </div>
    </div>
  );
}
