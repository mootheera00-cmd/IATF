// frontend/src/pages/Dashboard.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dcrAPI, documentAPI } from '../api';
import {
  FileText, AlertCircle, CheckCircle, Clock,
  ArrowRight, Briefcase, File, Book,
  LayoutGrid, ClipboardList, FlaskConical, ShieldAlert,
  Wrench, GraduationCap, Gauge, Sparkles, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import NewBadge from '../components/NewBadge';
import { isNew, markSeen, countNew, getNewItems } from '../hooks/useNewBadge';
import { normalizeCategory, getLevelId } from '../utils/category';

export default function Dashboard() {
  const { user } = useAuth();

  const normalizedRole = String(user?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const isActionOwnerRole = ['ADMIN','MGR','MANAGER','QMR','DOCUMENT_CONTROL','DOCUMENT_CONTROLLER','PRESIDENT','ASSISTANT_MANAGER'].includes(normalizedRole);

  const [myRequests,   setMyRequests]   = useState<any[]>([]);
  const [myActions,    setMyActions]    = useState<any[]>([]);
  const [docStats,     setDocStats]     = useState({ total: 0, L1: 0, L2: 0, L3: 0, L4: 0 });
  const [allDocs,      setAllDocs]      = useState<any[]>([]);
  const [allDcrs,      setAllDcrs]      = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [ticketFilter, setTicketFilter] = useState<'ALL'|'OPEN'|'FINISHED'>('OPEN');
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const reqRes = await dcrAPI.list('requester');
      setMyRequests(reqRes.data.change_requests || []);

      const actionRoleContexts: { role: string; label: string; filterStatuses?: string[] }[] = [];
      if (['DOCUMENT_CONTROL','DOCUMENT_CONTROLLER','ADMIN'].includes(normalizedRole))
        actionRoleContexts.push({ role: 'all', label: 'Document Control', filterStatuses: ['Pending DC Review','Pending Final DC Release'] });
      if (['ADMIN','QMR','MANAGER'].includes(normalizedRole))
        actionRoleContexts.push({ role: 'manager', label: 'Manager' });
      if (['ASSISTANT_MANAGER','MANAGER','ADMIN'].includes(normalizedRole))
        actionRoleContexts.push({ role: 'checker', label: 'Checker' });
      if (['PRESIDENT','MANAGER','ADMIN'].includes(normalizedRole))
        actionRoleContexts.push({ role: 'approver', label: 'Approver' });

      const actionResults = await Promise.all(
        actionRoleContexts.map(async (ctx) => {
          const r = await dcrAPI.list(ctx.role);
          let items: any[] = r.data.change_requests || [];
          if (ctx.filterStatuses?.length) items = items.filter((i: any) => ctx.filterStatuses!.includes(i.status));
          return items.map((i: any) => ({ ...i, action_role: ctx.label }));
        })
      );
      setMyActions(Array.from(new Map(actionResults.flat().map((i: any) => [i.id, i])).values()));

      const [docRes, allCrRes] = await Promise.all([documentAPI.list(), dcrAPI.list('all')]);
      const docs: any[]   = Array.isArray(docRes.data) ? docRes.data : [];
      const allCrs: any[] = allCrRes.data.change_requests || [];
      const allowedStatuses = new Set(['pending revision','returned for revision','pending checker','pending approval','pending approver','pending non-sign pdf','pending final dc release','released','approved']);
      const approvedDocIds  = new Set(allCrs.filter((cr: any) => allowedStatuses.has(String(cr.status||'').trim().toLowerCase())).map((cr: any) => Number(cr.document_id)));
      const visible = docs.filter((doc) => {
        const s = String(doc.status||'').trim().toLowerCase();
        return s === 'released' || approvedDocIds.has(Number(doc.id));
      });
      setAllDocs(visible);
      setAllDcrs(allCrs);
      setDocStats({
        total: visible.length,
        L1: visible.filter((d: any) => getLevelId(normalizeCategory(d.level||d.document_type||d.category||'')) === 'L1').length,
        L2: visible.filter((d: any) => getLevelId(normalizeCategory(d.level||d.document_type||d.category||'')) === 'L2').length,
        L3: visible.filter((d: any) => getLevelId(normalizeCategory(d.level||d.document_type||d.category||'')) === 'L3').length,
        L4: visible.filter((d: any) => getLevelId(normalizeCategory(d.level||d.document_type||d.category||'')) === 'L4').length,
      });
    } catch (err) {
      console.error('Dashboard fetchData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const personalTickets = useMemo(() => {
    const req = myRequests.map((i: any) => ({ ...i, relation: 'Requester' }));
    const act = myActions.map((i: any)  => ({ ...i, relation: i.action_role || 'Action Owner' }));
    return Array.from(new Map([...req,...act].map((i: any)=>[i.id,i])).values());
  }, [myRequests, myActions]);

  const finishedSet     = new Set(['released','approved','closed','rejected','effective','deleted']);
  const openTickets     = useMemo(()=>personalTickets.filter((i: any)=>!finishedSet.has(String(i.status||'').toLowerCase())),[personalTickets]);
  const finishedTickets = useMemo(()=>personalTickets.filter((i: any)=> finishedSet.has(String(i.status||'').toLowerCase())),[personalTickets]);
  const filteredTickets = useMemo(()=>{
    if (ticketFilter==='OPEN')     return openTickets;
    if (ticketFilter==='FINISHED') return finishedTickets;
    return personalTickets;
  },[ticketFilter,openTickets,finishedTickets,personalTickets]);

  const openActionCount = myActions.filter((i: any)=>!finishedSet.has(String(i.status||'').toLowerCase())).length;

  // NEW counts for overview cards and What's New feed
  const newDocCount = useMemo(() => countNew('doc', allDocs, 'created_at'), [allDocs]);
  const newDcrCount = useMemo(() => countNew('dcr', allDcrs, 'created_at'), [allDcrs]);
  const totalNewCount = newDocCount + newDcrCount;

  // Items for What's New feed — newest first, limit 20
  const whatsNewItems = useMemo(() => {
    const docs = getNewItems('doc', allDocs, 'created_at').map((d: any) => ({
      type: 'doc' as const,
      id: d.id,
      title: d.title || d.doc_no || 'Document',
      subtitle: d.doc_no || '',
      date: d.created_at,
      to: `/documents/${d.id}`,
    }));
    const dcrs = getNewItems('dcr', allDcrs, 'created_at').map((d: any) => ({
      type: 'dcr' as const,
      id: d.id,
      title: d.document_title || d.title || `Request #${String(d.id).padStart(4,'0')}`,
      subtitle: `#${String(d.id).padStart(4,'0')} · ${d.status || ''}`,
      date: d.created_at || d.submitted_at,
      to: `/dcr/${d.id}`,
    }));
    return [...docs, ...dcrs]
      .sort((a, b) => new Date(b.date||0).getTime() - new Date(a.date||0).getTime())
      .slice(0, 20);
  }, [allDocs, allDcrs]);

  const getStatusBadge = (status: string) => {
    const n = String(status||'').trim().toLowerCase();
    if (n==='submitted')                    return 'bg-blue-100 text-blue-700 border border-blue-200';
    if (n==='pre-approved')                 return 'bg-indigo-100 text-indigo-700 border border-indigo-200';
    if (n==='pending dc review')            return 'bg-amber-100 text-amber-700 border border-amber-200';
    if (n==='pending revision')             return 'bg-orange-100 text-orange-700 border border-orange-200';
    if (n==='pending checker')              return 'bg-cyan-100 text-cyan-700 border border-cyan-200';
    if (n==='pending approval'||n==='pending approver') return 'bg-sky-100 text-sky-700 border border-sky-200';
    if (n==='pending final dc release')     return 'bg-violet-100 text-violet-700 border border-violet-200';
    if (n==='returned for revision')        return 'bg-rose-100 text-rose-700 border border-rose-200';
    if (n==='approved')                     return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    if (n==='released')                     return 'bg-green-100 text-green-700 border border-green-200';
    if (n==='rejected')                     return 'bg-red-100 text-red-700 border border-red-200';
    return 'bg-slate-100 text-slate-700 border border-slate-200';
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h<12) return 'Good morning';
    if (h<17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) return (
    <div className="flex justify-center items-center h-[calc(100vh-100px)]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-10">

      {/* Greeting */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutGrid size={20} className="text-indigo-500" />
            {greeting()}, {(user as any)?.full_name || (user as any)?.username || 'User'} 
          </h1>
          <p className="text-slate-500 text-sm mt-1">Here is your personal activity summary and system overview.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* What's New button */}
          <button
            onClick={() => setWhatsNewOpen(true)}
            className="relative flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"
          >
            <Sparkles size={16} className="text-amber-500" />
            What's New
            {totalNewCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 flex items-center justify-center bg-rose-500 text-white text-[10px] font-bold rounded-full ring-2 ring-white animate-pulse">
                {totalNewCount}
              </span>
            )}
          </button>
          <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-full uppercase tracking-wide">
            {(user as any)?.role || 'User'}
          </span>
        </div>
      </div>

      {/* ── What's New Panel ───────────────────────────────────────────── */}
      {whatsNewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-16 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" />
                <h2 className="text-base font-bold text-slate-800">What's New</h2>
                {totalNewCount > 0 && (
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">
                    {totalNewCount} new
                  </span>
                )}
              </div>
              <button onClick={() => setWhatsNewOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            {/* Feed */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {whatsNewItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="p-4 bg-slate-50 rounded-full mb-3">
                    <CheckCircle size={28} className="text-slate-300" />
                  </div>
                  <p className="text-slate-500 text-sm font-medium">You're all caught up!</p>
                  <p className="text-slate-400 text-xs mt-1">No new items in the last 7 days.</p>
                </div>
              ) : (
                whatsNewItems.map((item) => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={item.to}
                    onClick={() => { markSeen(item.type, item.id); setWhatsNewOpen(false); }}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                  >
                    <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 ${item.type === 'doc' ? 'bg-indigo-100' : 'bg-amber-100'}`}>
                      {item.type === 'doc'
                        ? <LayoutGrid size={14} className="text-indigo-600" />
                        : <FileText size={14} className="text-amber-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.subtitle}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      </p>
                    </div>
                    <NewBadge variant="dot" />
                  </Link>
                ))
              )}
            </div>
            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex gap-3">
              <Link to="/documents" onClick={() => setWhatsNewOpen(false)}
                className="flex-1 text-center text-xs font-semibold text-indigo-600 hover:text-indigo-800 py-2 rounded-lg hover:bg-indigo-50 transition-colors">
                All Documents
              </Link>
              <Link to="/dcr" onClick={() => setWhatsNewOpen(false)}
                className="flex-1 text-center text-xs font-semibold text-amber-600 hover:text-amber-800 py-2 rounded-lg hover:bg-amber-50 transition-colors">
                All Requests
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Personal stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Open Tickets',    value: openTickets.length,     icon: Clock,        color: 'bg-amber-50  text-amber-600',  border: 'border-amber-200'  },
          { label: 'My Requests',     value: myRequests.length,      icon: FileText,     color: 'bg-blue-50   text-blue-600',   border: 'border-blue-200'   },
          { label: 'Action Required', value: openActionCount,        icon: AlertCircle,  color: 'bg-rose-50   text-rose-600',   border: 'border-rose-200'   },
          { label: 'Completed',       value: finishedTickets.length, icon: CheckCircle,  color: 'bg-green-50  text-green-600',  border: 'border-green-200'  },
        ].map(({ label, value, icon: Icon, color, border }) => (
          <div key={label} className={`bg-white rounded-xl p-5 border ${border} shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex justify-between items-start mb-2">
              <p className="text-slate-500 text-xs font-medium">{label}</p>
              <div className={`p-2 rounded-lg ${color}`}><Icon size={16} /></div>
            </div>
            <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
          </div>
        ))}
      </div>

      {/* My Tickets */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-800">My Tickets</h2>
            <p className="text-xs text-slate-500 mt-0.5">Change requests you submitted or need to action</p>
          </div>
          <div className="flex gap-2">
            {([
              { key: 'OPEN',     label: `Open (${openTickets.length})`      },
              { key: 'FINISHED', label: `Done (${finishedTickets.length})`  },
              { key: 'ALL',      label: `All (${personalTickets.length})`   },
            ] as const).map((f) => (
              <button key={f.key} onClick={() => setTicketFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  ticketFilter===f.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="table-wrap">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Ticket</th>
                  <th className="px-6 py-4">Document</th>
                  <th className="px-6 py-4">My Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTickets.length > 0 ? filteredTickets.map((ticket: any) => {
                  const showNew = isNew('dcr', ticket.id, ticket.created_at || ticket.submitted_at);
                  return (
                  <tr key={ticket.id} className={`hover:bg-slate-50/80 transition-colors ${showNew ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-6 py-4 font-mono text-sm font-semibold text-slate-700">
                      <span className="flex items-center gap-2">
                        #{String(ticket.id).padStart(4,'0')}
                        {showNew && <NewBadge />}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="font-semibold text-slate-800">{ticket.doc_no||ticket.doc_number||''}</div>
                      <div className="text-xs text-slate-500">{ticket.document_title||ticket.title||''}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{ticket.relation}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/dcr/${ticket.id}`}
                        onClick={() => markSeen('dcr', ticket.id)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-semibold">
                        Open <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">
                      No tickets for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* System Overview */}
      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-4">System Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          <Link to="/documents"
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-indigo-300 transition-all group">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                  <LayoutGrid size={20} className="text-indigo-600" />
                </div>
                <h3 className="font-semibold text-slate-800">Document Repository</h3>
              </div>
              {newDocCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold rounded-full border border-rose-200 animate-pulse">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                  {newDocCount} NEW
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { label:'L1', value:docStats.L1, icon:Book,      cls:'text-purple-600 bg-purple-50' },
                { label:'L2', value:docStats.L2, icon:Briefcase, cls:'text-blue-600 bg-blue-50'     },
                { label:'L3', value:docStats.L3, icon:FileText,  cls:'text-cyan-600 bg-cyan-50'     },
                { label:'L4', value:docStats.L4, icon:File,      cls:'text-slate-600 bg-slate-50'   },
              ].map(({ label, value, icon: Icon, cls }: { label: string; value: number; icon: any; cls: string }) => (
                <div key={label} className={`rounded-lg p-2 text-center ${cls}`}>
                  <Icon size={13} className="mx-auto mb-0.5" />
                  <div className="text-sm font-bold">{value}</div>
                  <div className="text-xs opacity-70">{label}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">{docStats.total} controlled documents total</p>
            <div className="flex items-center gap-1 text-indigo-600 text-xs font-semibold mt-3 group-hover:gap-2 transition-all">
              View all <ArrowRight size={12} />
            </div>
          </Link>

          <Link to="/dcr"
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-amber-300 transition-all group">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
                  <FileText size={20} className="text-amber-600" />
                </div>
                <h3 className="font-semibold text-slate-800">Change Requests</h3>
              </div>
              {newDcrCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold rounded-full border border-rose-200 animate-pulse">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                  {newDcrCount} NEW
                </span>
              )}
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1 bg-amber-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-700">{openTickets.length}</div>
                <div className="text-xs text-amber-600 mt-0.5">My Open</div>
              </div>
              <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{finishedTickets.length}</div>
                <div className="text-xs text-green-600 mt-0.5">Completed</div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-amber-600 text-xs font-semibold group-hover:gap-2 transition-all">
              View DCR list <ArrowRight size={12} />
            </div>
          </Link>

          <Link to="/plan"
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-teal-300 transition-all group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-teal-50 rounded-lg group-hover:bg-teal-100 transition-colors">
                <ClipboardList size={20} className="text-teal-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Plans</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label:'Training',    icon:GraduationCap, cls:'text-indigo-600 bg-indigo-50'  },
                { label:'Calibration', icon:Gauge,         cls:'text-blue-600 bg-blue-50'      },
                { label:'Maintenance', icon:Wrench,        cls:'text-orange-600 bg-orange-50'  },
              ].map(({ label, icon: Icon, cls }: { label: string; icon: any; cls: string }) => (
                <div key={label} className={`rounded-lg p-2 text-center ${cls}`}>
                  <Icon size={13} className="mx-auto mb-0.5" />
                  <div className="text-xs font-medium">{label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 text-teal-600 text-xs font-semibold group-hover:gap-2 transition-all">
              View plans <ArrowRight size={12} />
            </div>
          </Link>

          <Link to="/quality"
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-emerald-300 transition-all group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-emerald-50 rounded-lg group-hover:bg-emerald-100 transition-colors">
                <FlaskConical size={20} className="text-emerald-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Quality</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">MSA, measurement system analysis, gauge R&R  IATF Clause 7.1.5.1</p>
            <div className="flex items-center gap-1 text-emerald-600 text-xs font-semibold group-hover:gap-2 transition-all">
              View quality <ArrowRight size={12} />
            </div>
          </Link>

          <Link to="/safety"
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-rose-300 transition-all group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-rose-50 rounded-lg group-hover:bg-rose-100 transition-colors">
                <ShieldAlert size={20} className="text-rose-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Risk Assessment</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">Risk assessment, hazard identification, safety controls  ISO 45001</p>
            <div className="flex items-center gap-1 text-rose-600 text-xs font-semibold group-hover:gap-2 transition-all">
              View Risk Assessment <ArrowRight size={12} />
            </div>
          </Link>

          <Link to="/report"
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-violet-300 transition-all group">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-violet-50 rounded-lg group-hover:bg-violet-100 transition-colors">
                <FileText size={20} className="text-violet-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Reports</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">Work logs, management summaries, activity analytics and exports</p>
            <div className="flex items-center gap-1 text-violet-600 text-xs font-semibold group-hover:gap-2 transition-all">
              View reports <ArrowRight size={12} />
            </div>
          </Link>

        </div>
      </section>

    </div>
  );
}