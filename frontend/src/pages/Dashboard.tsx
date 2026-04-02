// frontend/src/pages/Dashboard.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dcrAPI, documentAPI, calibrationAPI, inHouseCalibrationAPI, maintenanceAPI } from '../api';
import {
  FileText, AlertCircle, CheckCircle, Clock,
  ArrowRight, Briefcase, File, Book,
  LayoutGrid, ClipboardList,
  Wrench, Gauge, Sparkles, X,
  BarChart3, TrendingUp,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import APTX_DATA, { type AptxRecord } from './aptxData';
import axios from 'axios';

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
);
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

  // Calibration / In-House / Maintenance stats
  const [calibStats, setCalibStats] = useState({ total: 0, overdue: 0, due_soon: 0, ok: 0 });
  const [inhouseStats, setInhouseStats] = useState({ total: 0, overdue: 0, due_soon: 0, ok: 0 });
  const [maintStats, setMaintStats] = useState({ equipmentCount: 0, planned: 0, done: 0, postponed: 0, breakdown: 0, year: new Date().getFullYear() });

  // KPI CSV data (shared via server)
  const [kpiCsvData, setKpiCsvData] = useState<AptxRecord[] | null>(null);

  useEffect(() => {
    fetchData();
    fetchExtraStats();
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

  const fetchExtraStats = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const [calibRes, inhouseRes, maintRes, maintOverview] = await Promise.all([
        calibrationAPI.stats().catch(() => ({ data: {} })),
        inHouseCalibrationAPI.stats().catch(() => ({ data: {} })),
        maintenanceAPI.getEquipment().catch(() => ({ data: { equipment: [] } })),
        maintenanceAPI.getPlanOverview(currentYear).catch(() => ({ data: { plan: [], history: [] } })),
      ]);
      const cs = calibRes.data?.stats;
      if (cs) setCalibStats({ total: cs.total || 0, overdue: cs.overdue || 0, due_soon: cs.due_soon || 0, ok: cs.ok || 0 });
      const ihs = inhouseRes.data?.stats;
      if (ihs) setInhouseStats({ total: ihs.total || 0, overdue: ihs.overdue || 0, due_soon: ihs.due_soon || 0, ok: ihs.ok || 0 });
      const eqList = maintRes.data?.equipment || [];
      const histList: any[] = maintOverview.data?.history || [];
      const planList: any[] = maintOverview.data?.plan || [];
      let done = 0, postponed = 0, breakdown = 0;
      histList.forEach((h: any) => {
        if (h.result === 'Done') done++;
        else if (h.result === 'Postponed') postponed++;
        else if (h.result === 'Breakdown') breakdown++;
      });
      setMaintStats({ equipmentCount: eqList.length, planned: planList.length, done, postponed, breakdown, year: currentYear });
    } catch { /* non-blocking */ }

    // Load shared KPI CSV data
    const API_URL = import.meta.env.VITE_API_URL || '/api';
    try {
      const r = await axios.get(`${API_URL}/kpi-csv`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (r.data?.data) setKpiCsvData(r.data.data);
    } catch { /* non-blocking */ }
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

  // ─── KPI Mini Charts Data ─────────────────────────────────────────────────
  const KPI_MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
  const KPI_REVISED: (number|null)[] = [0,0,0,0,0,0,0,0,0,0,null,null];
  const KPI_EVAL = {
    hub:  [17.5,25,25,32.26,40.73,42.06,22.58,57.08,65.32,29.44,0,null],
    pt:   [20.41,36.29,36.43,7.53,7.8,11.09,13.44,10.83,10.22,11.29,0,null],
    rate: [0.1896,0.30645,0.30715,0.19859,0.24265,0.26575,0.1801,0.33955,0.3777,0.20365,null,null],
  };
  const LEAD_TIME_TARGET = 15;
  const EVAL_TARGET = 15;

  function businessDays(startStr: string, endStr: string): number {
    const s = new Date(startStr), e = new Date(endStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    let count = 0; const cur = new Date(s); cur.setDate(cur.getDate()+1);
    while (cur <= e) { const d = cur.getDay(); if (d!==0 && d!==6) count++; cur.setDate(cur.getDate()+1); }
    return count;
  }

  const kpiActiveData = kpiCsvData ?? APTX_DATA;
  const kpiProcessed = useMemo(() => kpiActiveData.map(r => ({ ...r, elapsed: businessDays(r.a, r.f || '2026-03-30'), done: !!r.f })), [kpiActiveData]);
  const kpiCompleted = useMemo(() => kpiProcessed.filter(r => r.done), [kpiProcessed]);
  const kpiAvgElapsed = kpiCompleted.length ? kpiCompleted.reduce((s,r)=>s+r.elapsed,0)/kpiCompleted.length : 0;

  // Chart 1: Revised Reports
  const miniRevisedData = { labels: KPI_MONTHS, datasets: [{ label: 'Revised Reports', data: KPI_REVISED, backgroundColor: 'rgba(99,102,241,0.7)', borderColor: 'rgb(99,102,241)', borderWidth: 1, borderRadius: 3 }] };
  const miniBarOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ctx.parsed.y===0?'No data':''+ctx.parsed.y } } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 9 } }, grid: { color: '#f1f5f9' } }, x: { ticks: { font: { size: 8 } }, grid: { display: false } } } };

  // Chart 2: Lead Time scatter
  const kpiScatterDatasets = useMemo(() => {
    const xLabels = [...new Set(kpiProcessed.map(r=>r.a))].sort();
    const groups: Record<string,{x:string;y:number;r_id:string;done:boolean}[]> = {};
    kpiProcessed.forEach(r => { const k=`${r.g}-${r.c}`; if(!groups[k]) groups[k]=[]; groups[k].push({x:r.a,y:r.elapsed,r_id:r.r,done:r.done}); });
    const COLORS: Record<string,{bg:string;border:string}> = { 'H-I':{bg:'rgba(99,102,241,0.75)',border:'#6366f1'},'H-W':{bg:'rgba(59,130,246,0.75)',border:'#3b82f6'},'P-I':{bg:'rgba(249,115,22,0.75)',border:'#f97316'},'P-W':{bg:'rgba(234,179,8,0.75)',border:'#eab308'} };
    const LABELS: Record<string,string> = { 'H-I':'HUB–Inv','H-W':'HUB–War','P-I':'PT–Inv','P-W':'PT–War' };
    const datasets = Object.entries(groups).map(([k,pts]) => { const c=COLORS[k]||{bg:'rgba(148,163,184,0.7)',border:'#94a3b8'}; return { label:LABELS[k]||k, data:pts, backgroundColor:pts.map(p=>p.done?c.bg:c.bg.replace('0.75','0.3')), borderColor:pts.map(p=>p.done?c.border:c.border+'66'), borderWidth:1, pointRadius:3, pointHoverRadius:5, pointStyle:pts.map(p=>p.done?'circle' as const:'rectRot' as const) }; });
    return { xLabels, datasets };
  }, [kpiProcessed]);
  const miniScatterData = { labels: kpiScatterDatasets.xLabels, datasets: [...kpiScatterDatasets.datasets, { label:`Target ≤${LEAD_TIME_TARGET}d`, data:kpiScatterDatasets.xLabels.map(x=>({x,y:LEAD_TIME_TARGET})), borderColor:'rgb(239,68,68)', backgroundColor:'transparent', borderWidth:1.5, borderDash:[4,2], pointRadius:0, showLine:true, type:'line' as const }] };
  const miniScatterOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => { const p=ctx.raw; if(!p.r_id) return 'Target'; return `${p.r_id}: ${p.y}d`; } } } }, scales: { x: { type: 'category' as const, ticks: { maxRotation: 45, font: { size: 7 }, maxTicksLimit: 12 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } } } };

  // Chart 3: Evaluation
  const miniEvalData = { labels: KPI_MONTHS, datasets: [
    { type:'bar' as const, label:'HUB %', data:KPI_EVAL.hub, backgroundColor:'rgba(34,197,94,0.7)', borderColor:'rgb(34,197,94)', borderWidth:1, borderRadius:2, order:2 },
    { type:'bar' as const, label:'PT %', data:KPI_EVAL.pt, backgroundColor:'rgba(249,115,22,0.7)', borderColor:'rgb(249,115,22)', borderWidth:1, borderRadius:2, order:2 },
    { type:'line' as const, label:'Rate', data:KPI_EVAL.rate.map(v=>v===null?null:+(v*100).toFixed(2)), borderColor:'rgb(99,102,241)', borderWidth:2, tension:0.3, pointRadius:2, yAxisID:'y1', fill:false, order:1 },
    { type:'line' as const, label:`Target ${EVAL_TARGET}%`, data:KPI_MONTHS.map(()=>EVAL_TARGET), borderColor:'rgb(239,68,68)', borderWidth:1.5, borderDash:[4,2], pointRadius:0, fill:false, order:0 },
  ] };
  const miniEvalOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } }, y1: { beginAtZero: true, max: 50, position: 'right' as const, ticks: { font: { size: 8 }, callback: (v: any)=>`${v}%` }, grid: { drawOnChartArea: false } }, x: { ticks: { font: { size: 8 } }, grid: { display: false } } } };

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
    <div className="space-y-4 animate-fade-in pb-10">

      {/* Greeting */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <LayoutGrid size={16} className="text-indigo-500" />
          <h1 className="text-base font-bold text-slate-800">
            {greeting()}, {(user as any)?.full_name || (user as any)?.username || 'User'}
          </h1>
          <span className="text-slate-400 text-xs hidden sm:inline">— activity summary & system overview</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWhatsNewOpen(true)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"
          >
            <Sparkles size={13} className="text-amber-500" />
            What's New
            {totalNewCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-rose-500 text-white text-[9px] font-bold rounded-full ring-2 ring-white animate-pulse">
                {totalNewCount}
              </span>
            )}
          </button>
          <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-semibold rounded-full uppercase tracking-wide">
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
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Open Tickets',    value: openTickets.length,     icon: Clock,        color: 'bg-amber-50  text-amber-600',  border: 'border-amber-200'  },
          { label: 'My Requests',     value: myRequests.length,      icon: FileText,     color: 'bg-blue-50   text-blue-600',   border: 'border-blue-200'   },
          { label: 'Action Required', value: openActionCount,        icon: AlertCircle,  color: 'bg-rose-50   text-rose-600',   border: 'border-rose-200'   },
          { label: 'Completed',       value: finishedTickets.length, icon: CheckCircle,  color: 'bg-green-50  text-green-600',  border: 'border-green-200'  },
        ].map(({ label, value, icon: Icon, color, border }) => (
          <div key={label} className={`bg-white rounded-lg px-3 py-2 border ${border} shadow-sm hover:shadow-md transition-shadow flex items-center gap-2.5`}>
            <div className={`p-1 rounded-md ${color}`}><Icon size={12} /></div>
            <div>
              <p className="text-slate-500 text-[10px] font-medium leading-tight">{label}</p>
              <h3 className="text-lg font-bold text-slate-800 leading-tight">{value}</h3>
            </div>
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

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="table-wrap">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-semibold tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Ticket</th>
                  <th className="px-4 py-2.5">Document</th>
                  <th className="px-4 py-2.5">My Role</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTickets.length > 0 ? filteredTickets.slice(0, 5).map((ticket: any) => {
                  const showNew = isNew('dcr', ticket.id, ticket.created_at || ticket.submitted_at);
                  return (
                  <tr key={ticket.id} className={`hover:bg-slate-50/80 transition-colors ${showNew ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-2">
                        #{String(ticket.id).padStart(4,'0')}
                        {showNew && <NewBadge />}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-semibold text-slate-800">{ticket.doc_no||ticket.doc_number||''}</div>
                      <div className="text-[11px] text-slate-500">{ticket.document_title||ticket.title||''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{ticket.relation}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link to={`/dcr/${ticket.id}`}
                        onClick={() => markSeen('dcr', ticket.id)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-semibold">
                        Open <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">
                      No tickets for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredTickets.length > 5 && (
            <div className="px-4 py-2 border-t border-slate-100 text-center">
              <Link to="/dcr" className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                View all {filteredTickets.length} tickets <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* System Overview */}
      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-4">System Overview</h2>

        {/* Row 1: Document Repository (compact) + Change Requests (compact) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Link to="/documents"
            className="bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-md hover:border-indigo-300 transition-all group">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                  <LayoutGrid size={16} className="text-indigo-600" />
                </div>
                <h3 className="font-semibold text-sm text-slate-800">Document Repository</h3>
              </div>
              {newDocCount > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-bold rounded-full border border-rose-200 animate-pulse">
                  <span className="w-1 h-1 bg-rose-500 rounded-full" />
                  {newDocCount} NEW
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[
                { label:'L1', value:docStats.L1, icon:Book,      cls:'text-purple-600 bg-purple-50' },
                { label:'L2', value:docStats.L2, icon:Briefcase, cls:'text-blue-600 bg-blue-50'     },
                { label:'L3', value:docStats.L3, icon:FileText,  cls:'text-cyan-600 bg-cyan-50'     },
                { label:'L4', value:docStats.L4, icon:File,      cls:'text-slate-600 bg-slate-50'   },
              ].map(({ label, value, icon: Icon, cls }: { label: string; value: number; icon: any; cls: string }) => (
                <div key={label} className={`rounded-md p-1.5 text-center ${cls}`}>
                  <Icon size={11} className="mx-auto mb-0.5" />
                  <div className="text-xs font-bold">{value}</div>
                  <div className="text-[10px] opacity-70">{label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400">{docStats.total} documents total</p>
              <span className="flex items-center gap-1 text-indigo-600 text-[10px] font-semibold group-hover:gap-1.5 transition-all">View all <ArrowRight size={10} /></span>
            </div>
          </Link>

          <Link to="/dcr"
            className="bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-md hover:border-amber-300 transition-all group">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
                  <FileText size={16} className="text-amber-600" />
                </div>
                <h3 className="font-semibold text-sm text-slate-800">Change Requests</h3>
              </div>
              {newDcrCount > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-bold rounded-full border border-rose-200 animate-pulse">
                  <span className="w-1 h-1 bg-rose-500 rounded-full" />
                  {newDcrCount} NEW
                </span>
              )}
            </div>
            <div className="flex gap-2 mb-2">
              <div className="flex-1 bg-amber-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-amber-700">{openTickets.length}</div>
                <div className="text-[10px] text-amber-600">My Open</div>
              </div>
              <div className="flex-1 bg-green-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-green-700">{finishedTickets.length}</div>
                <div className="text-[10px] text-green-600">Completed</div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-amber-600 text-[10px] font-semibold group-hover:gap-1.5 transition-all">
              View DCR list <ArrowRight size={10} />
            </div>
          </Link>
        </div>

        {/* Row 2: Calibration Plan, In-House Calibration, Test Equipment Maintenance */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Link to="/plan/calibration"
            className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-blue-300 transition-all group">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                <Gauge size={16} className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-sm text-slate-800">Calibration Plan</h3>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              <div className="bg-emerald-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-emerald-700">{calibStats.ok}</div>
                <div className="text-[10px] text-emerald-600 font-medium">OK</div>
              </div>
              <div className="bg-amber-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-amber-700">{calibStats.due_soon}</div>
                <div className="text-[10px] text-amber-600 font-medium">Due Soon</div>
              </div>
              <div className="bg-rose-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-rose-700">{calibStats.overdue}</div>
                <div className="text-[10px] text-rose-600 font-medium">Overdue</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400">{calibStats.total} equipment total</p>
              <span className="flex items-center gap-1 text-blue-600 text-[10px] font-semibold group-hover:gap-1.5 transition-all">View calendar <ArrowRight size={10} /></span>
            </div>
          </Link>

          <Link to="/plan/inhouse-calibration"
            className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-teal-300 transition-all group">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-teal-50 rounded-lg group-hover:bg-teal-100 transition-colors">
                <ClipboardList size={16} className="text-teal-600" />
              </div>
              <h3 className="font-semibold text-sm text-slate-800">In-House Calibration</h3>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              <div className="bg-emerald-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-emerald-700">{inhouseStats.ok}</div>
                <div className="text-[10px] text-emerald-600 font-medium">OK</div>
              </div>
              <div className="bg-amber-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-amber-700">{inhouseStats.due_soon}</div>
                <div className="text-[10px] text-amber-600 font-medium">Due Soon</div>
              </div>
              <div className="bg-rose-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-rose-700">{inhouseStats.overdue}</div>
                <div className="text-[10px] text-rose-600 font-medium">Overdue</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400">{inhouseStats.total} equipment total</p>
              <span className="flex items-center gap-1 text-teal-600 text-[10px] font-semibold group-hover:gap-1.5 transition-all">View plan <ArrowRight size={10} /></span>
            </div>
          </Link>

          <Link to="/plan/maintenance"
            className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-orange-300 transition-all group">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-orange-50 rounded-lg group-hover:bg-orange-100 transition-colors">
                <Wrench size={16} className="text-orange-600" />
              </div>
              <h3 className="font-semibold text-sm text-slate-800">Equipment Maintenance</h3>
            </div>
            <div className="flex gap-2 mb-2">
              <div className="flex-1 bg-indigo-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-indigo-700">{maintStats.planned}</div>
                <div className="text-[9px] text-indigo-600 font-medium">Planned</div>
              </div>
              <div className="flex-1 bg-emerald-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-emerald-700">{maintStats.done}</div>
                <div className="text-[9px] text-emerald-600 font-medium">Done</div>
              </div>
              <div className="flex-1 bg-amber-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-amber-700">{maintStats.postponed}</div>
                <div className="text-[9px] text-amber-600 font-medium">Postponed</div>
              </div>
              <div className="flex-1 bg-rose-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-rose-700">{maintStats.breakdown}</div>
                <div className="text-[9px] text-rose-600 font-medium">Breakdown</div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400">{maintStats.equipmentCount} equipment tracked ({maintStats.year})</p>
            <div className="flex items-center gap-1 text-orange-600 text-[10px] font-semibold group-hover:gap-1.5 transition-all">
              View maintenance plan <ArrowRight size={10} />
            </div>
          </Link>
        </div>

        {/* Row 3: KPI Monitoring — all three charts */}
        <div className="space-y-3">
          <Link to="/kpi" className="flex items-center gap-2 group">
            <BarChart3 size={16} className="text-indigo-500" />
            <h3 className="font-semibold text-sm text-slate-800">KPI Monitoring</h3>
            <span className="flex items-center gap-1 text-indigo-600 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              View full page <ArrowRight size={10} />
            </span>
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* KPI Lead Time Scatter */}
            <Link to="/kpi" className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-indigo-300 transition-all">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><Clock size={12} className="text-indigo-500" /> Lead Time</h4>
                <span className={`text-xs font-bold ${kpiAvgElapsed <= LEAD_TIME_TARGET ? 'text-emerald-600' : 'text-rose-600'}`}>
                  Avg {kpiAvgElapsed.toFixed(1)}d
                </span>
              </div>
              <div style={{ height: 180 }}>
                <Scatter data={miniScatterData as any} options={miniScatterOpts as any} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Target ≤ {LEAD_TIME_TARGET} business days</p>
            </Link>

            {/* KPI Evaluation */}
            <Link to="/kpi" className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-emerald-300 transition-all">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><TrendingUp size={12} className="text-emerald-500" /> KPI Evaluation</h4>
              </div>
              <div style={{ height: 180 }}>
                <Bar data={miniEvalData as any} options={miniEvalOpts as any} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">HUB + PT evaluation % — Target {EVAL_TARGET}%</p>
            </Link>

            {/* Revised Reports */}
            <Link to="/kpi" className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-violet-300 transition-all">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><FileText size={12} className="text-violet-500" /> Revised Reports</h4>
              </div>
              <div style={{ height: 180 }}>
                <Bar data={miniRevisedData} options={miniBarOpts as any} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Document revisions issued per month — FY 2025-2026</p>
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}