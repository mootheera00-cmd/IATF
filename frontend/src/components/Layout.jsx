// frontend/src/components/Layout.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { notificationAPI } from '../api';
import {
  Menu, X, Home, FileText, FolderOpen, ClipboardCheck, Settings,
  Bell, LogOut, ChevronRight, LayoutGrid, User, Search, Database, Network, ClipboardList
} from 'lucide-react';

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const searchRef = useRef(null);
  const notificationRef = useRef(null);

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

  const avatarStorageKey = `avatar_choice_${user?.id || user?.employee_code || 'default'}`;
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
    const onOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
        setPickerOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationOpen(false);
      }
    };

    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const loadNotifications = async (unreadOnly = false) => {
    if (!user) return;
    try {
      setLoadingNotifications(true);
      const response = await notificationAPI.getNotifications(unreadOnly);
      setNotifications(response.data?.notifications || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    loadNotifications(false);
    const intervalId = setInterval(() => loadNotifications(false), 15000);

    return () => clearInterval(intervalId);
  }, [user]);

  const unreadCount = notifications.filter((item) => Number(item.is_read || 0) === 0).length;
  const pendingActions = notifications
    .filter((item) => (item.cr_id || item.metadata?.cr_id))
    .slice(0, 5);

  const openChangeRequestDetail = (item) => {
    const crId = item.cr_id || item.metadata?.cr_id;
    setNotificationOpen(false);
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
  }, [searchQuery, user?.role]);

  const activeAvatar = avatarOptions.find((option) => option.id === selectedAvatar) || avatarOptions[0];
  const profileName = user?.name || '-';
  const profilePosition = user?.position || user?.role || '-';
  const profileEmail = user?.email || (user?.employee_code ? `${String(user.employee_code).toLowerCase()}@nsk.local` : '-');

  const handleAvatarSelect = (avatarId) => {
    setSelectedAvatar(avatarId);
    localStorage.setItem(avatarStorageKey, avatarId);
  };

  const searchablePages = [
    { path: '/dashboard', label: 'Dashboard', keywords: 'home overview summary status metrics repository' },
    { path: '/dcr', label: 'Change Requests', keywords: 'dcr change request workflow approvals review submit decision' },
    { path: '/dcr/create', label: 'Create DCR', keywords: 'create new change request draft' },
    { path: '/flowchart', label: 'Flowchart', keywords: 'flow chart process map' },
    { path: '/flowchart/workflow', label: 'Workflow Flowchart', keywords: 'workflow process owner manager document controller' },
    { path: '/flowchart/kpi', label: 'KPI Flowchart', keywords: 'kpi charts graph performance indicator excel reference' },
    { path: '/flowchart/procedure', label: 'Procedure Flowchart', keywords: 'procedure acronym terms status reference documents' },
    { path: '/plan', label: 'Plan', keywords: 'planning equipment calibration maintenance training hub powertrain' },
    { path: '/report', label: 'Report', keywords: 'report work log management summary analytics' },
    ...(user?.role === 'ADMIN' || user?.role === 'QMR'
      ? [{ path: '/admin', label: 'Administration', keywords: 'admin users roles audit compliance migration settings' }]
      : []),
    ...(user?.role === 'ADMIN'
      ? [{ path: '/admin/migrate', label: 'Data Migration', keywords: 'migration upload legacy import documents' }]
      : []),
  ];

  const getSearchMatches = (query) => {
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

  const runSearch = (query) => {
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

  const isPathMatch = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
    { path: '/dcr', label: 'Change Requests', icon: ClipboardCheck },
    { path: '/flowchart', label: 'Flowchart', icon: Network },
    { path: '/plan', label: 'Plan', icon: ClipboardList },
    { path: '/report', label: 'Report', icon: FileText },
  ];

  // Admin menu items
  if (user?.role === 'ADMIN' || user?.role === 'QMR') {
    menuItems.push({
      path: '/admin',
      label: 'Administration',
      icon: Settings
    });
  }

  // Admin Only: Direct link to Migration
  if (user?.role === 'ADMIN') {
    menuItems.push({
      path: '/admin/migrate',
      label: 'Data Migration',
      icon: Database
    });
  }

  const activePath = menuItems
    .filter((item) => isPathMatch(item.path))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  return (
    <div className="flex bg-slate-50 min-h-screen font-sans text-slate-900">
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
              <span className="font-bold text-slate-300">{user?.name?.charAt(0) || 'U'}</span>
            </div>
            
            <div className={`flex-1 min-w-0 transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 hidden'}`}>
              <p className="text-sm font-semibold truncate text-white">{user?.name}</p>
              <p className="text-xs text-blue-300 truncate capitalize font-medium">{user?.role?.toLowerCase()}</p>
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
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                {menuItems.find((i) => i.path === activePath)?.label || 'Dashboard'}
              </h1>
              <p className="text-sm text-slate-500 font-medium">Welcome, {user?.name}</p>
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
                  onClick={() => {
                    setNotificationOpen((prev) => !prev);
                    if (!notificationOpen) {
                      loadNotifications(false);
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
                          return (
                            <div key={item.id} className="px-4 py-3">
                              <p className="text-xs font-semibold text-slate-500">{item.type || 'Notification'}</p>
                              <p className="text-sm text-slate-800 mt-1">{item.message}</p>
                              <div className="mt-2 flex items-center justify-between gap-3">
                                <span className="text-xs text-slate-500">
                                  Request ID: {crId || '-'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openChangeRequestDetail(item)}
                                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                >
                                  Open Details
                                </button>
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
                            return (
                              <button
                                key={`pending-${item.id}`}
                                type="button"
                                onClick={() => openChangeRequestDetail(item)}
                                className="w-full text-left px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                              >
                                <p className="text-xs font-semibold text-slate-700">Change Request #{crId || '-'}</p>
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
                        <p className="text-sm text-slate-500 truncate">{profileEmail}</p>
                      </div>
                    </div>

                    <div className="pt-4">
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
