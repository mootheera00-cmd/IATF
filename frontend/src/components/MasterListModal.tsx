// frontend/src/components/MasterListModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { documentAPI } from '../api';

interface RevisionEntry {
  revision_number: string | number;
  effective_date: string | null;
  status: string;
  is_purged?: boolean;
}

interface MasterListRow {
  no: number;
  id: number;
  doc_no: string;
  title: string;
  level: string;
  sub_category: string | null;
  revision: string | number;
  status: string;
  revisions: RevisionEntry[];
}

interface Props {
  onClose: () => void;
}

const MAX_REV_COLS = 7;

const CATEGORY_MAP: Record<string, { label: string; subCats: string[] }> = {
  ALL:               { label: 'All',       subCats: [] },
  FORM:              { label: 'Form',      subCats: ['Investigation', 'Test', 'DOC LAB Control', 'Calibration', 'Document', 'Training'] },
  PROCEDURE:         { label: 'Procedure', subCats: ['Procedure'] },
  SUPPORT:           { label: 'Support',   subCats: ['Investigation', 'Test', 'DOC LAB Control', 'Calibration', 'Training'] },
  'WORK INSTRUCTION':{ label: 'WI',        subCats: ['Investigation', 'Test', 'DOC LAB Control', 'Calibration'] },
};

const TAB_ORDER = ['ALL', 'FORM', 'PROCEDURE', 'SUPPORT', 'WORK INSTRUCTION'];

const TAB_COLORS: Record<string, { active: string; hover: string; badge: string; subActive: string; subHover: string }> = {
  ALL:               { active: 'border-slate-600 text-slate-800 bg-slate-50',   hover: 'hover:bg-slate-50 hover:text-slate-700',   badge: 'bg-slate-100 text-slate-600',   subActive: 'bg-slate-600 text-white',   subHover: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
  FORM:              { active: 'border-indigo-600 text-indigo-800 bg-indigo-50', hover: 'hover:bg-indigo-50 hover:text-indigo-700', badge: 'bg-indigo-100 text-indigo-700', subActive: 'bg-indigo-600 text-white',  subHover: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
  PROCEDURE:         { active: 'border-blue-600 text-blue-800 bg-blue-50',       hover: 'hover:bg-blue-50 hover:text-blue-700',     badge: 'bg-blue-100 text-blue-700',     subActive: 'bg-blue-600 text-white',    subHover: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
  SUPPORT:           { active: 'border-cyan-600 text-cyan-800 bg-cyan-50',       hover: 'hover:bg-cyan-50 hover:text-cyan-700',     badge: 'bg-cyan-100 text-cyan-700',     subActive: 'bg-cyan-600 text-white',    subHover: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100' },
  'WORK INSTRUCTION':{ active: 'border-teal-600 text-teal-800 bg-teal-50',       hover: 'hover:bg-teal-50 hover:text-teal-700',     badge: 'bg-teal-100 text-teal-700',     subActive: 'bg-teal-600 text-white',    subHover: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
};

function formatDate(raw: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

function normalizeLevel(level: string): string {
  const t = String(level || '').trim().toUpperCase();
  if (t === 'QM' || t.includes('QUALITY MANUAL')) return 'QUALITY MANUAL';
  if (t === 'QP' || t.includes('PROCEDURE')) return 'PROCEDURE';
  if (t.includes('WORK INSTRUCTION')) return 'WORK INSTRUCTION';
  if (t.includes('SUPPORT')) return 'SUPPORT';
  if (t.includes('OUTSIDE')) return 'OUTSIDE DOCUMENT';
  if (t.includes('OPERATION STANDARD')) return 'OPERATION STANDARD';
  if (t === 'FM' || t.includes('FORM')) return 'FORM';
  if (t.includes('REPORT')) return 'REPORT';
  return t;
}

function normalizeSub(sub: string | null): string {
  const t = String(sub || '').trim().toUpperCase();
  if (!t) return '';
  if (t === 'TRANING' || t === 'TRAINING') return 'TRAINING';
  return t;
}

export default function MasterListModal({ onClose }: Props) {
  const [rows,      setRows]      = useState<MasterListRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [activeTab, setActiveTab] = useState('ALL');
  const [activeSub, setActiveSub] = useState('ALL');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    documentAPI.getMasterList()
      .then((res) => setRows(Array.isArray(res.data) ? res.data : []))
      .catch(() => setError('Failed to load master list.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setActiveSub('ALL');
  };

  const subCatOptions: string[] = React.useMemo(() => {
    if (activeTab === 'ALL') return [];
    const defined = CATEGORY_MAP[activeTab]?.subCats ?? [];
    const inData = new Set(
      rows
        .filter(r => normalizeLevel(r.level) === activeTab)
        .map(r => normalizeSub(r.sub_category))
        .filter(Boolean)
    );
    return defined.filter(sc => inData.has(sc.toUpperCase()));
  }, [rows, activeTab]);

  const countFor = (tab: string) =>
    tab === 'ALL'
      ? rows.length
      : rows.filter(r => normalizeLevel(r.level) === tab).length;

  const countSub = (tab: string, sub: string) =>
    sub === 'ALL'
      ? rows.filter(r => normalizeLevel(r.level) === tab).length
      : rows.filter(r =>
          normalizeLevel(r.level) === tab &&
          normalizeSub(r.sub_category) === sub.toUpperCase()
        ).length;

  const filtered = React.useMemo(() =>
    rows.filter(r => {
      const lvl = normalizeLevel(r.level);
      const sub = normalizeSub(r.sub_category);
      const matchTab = activeTab === 'ALL' || lvl === activeTab;
      const matchSub = activeSub === 'ALL' || sub === activeSub.toUpperCase();
      const q = search.toLowerCase();
      const matchSearch = !q ||
        r.doc_no?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q);
      return matchTab && matchSub && matchSearch;
    }), [rows, activeTab, activeSub, search]);

  const maxRevs = Math.min(MAX_REV_COLS, Math.max(1, ...filtered.map(r => r.revisions.length)));
  const colors = TAB_COLORS[activeTab] || TAB_COLORS['ALL'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] mx-2 flex flex-col"
        style={{ minWidth: 900, maxHeight: '96vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Form Master List (Index)</h2>
            <p className="text-xs text-slate-500 mt-0.5">All controlled documents with revision history</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download size={15} /> Print
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Level tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto shrink-0 bg-white">
          {TAB_ORDER.map(tab => {
            const isActive = activeTab === tab;
            const c = TAB_COLORS[tab];
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  isActive ? `${c.active} border-current` : `border-transparent text-slate-500 ${c.hover}`
                }`}
              >
                {CATEGORY_MAP[tab].label}
                <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? c.badge : 'bg-slate-100 text-slate-400'}`}>
                  {countFor(tab)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sub-category chips */}
        {activeTab !== 'ALL' && subCatOptions.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 overflow-x-auto shrink-0 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 mr-1 shrink-0">Sub-category:</span>
            <button
              onClick={() => setActiveSub('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${activeSub === 'ALL' ? colors.subActive : colors.subHover}`}
            >
              All <span className="opacity-70">({countSub(activeTab, 'ALL')})</span>
            </button>
            {subCatOptions.map(sc => (
              <button
                key={sc}
                onClick={() => setActiveSub(sc.toUpperCase())}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  activeSub.toUpperCase() === sc.toUpperCase() ? colors.subActive : colors.subHover
                }`}
              >
                {sc} <span className="opacity-70">({countSub(activeTab, sc)})</span>
              </button>
            ))}
          </div>
        )}

        {/* Search bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 bg-white shrink-0">
          <div className="relative">
            <input
              type="text"
              placeholder="Search Doc No. or Title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 w-64"
            />
            <svg className="absolute left-2.5 top-2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <span className="text-xs text-slate-400 ml-auto">
            {filtered.length} document{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-48 gap-3 text-slate-500">
              <Loader2 size={24} className="animate-spin text-blue-500" />
              Loading master list...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-48 text-red-500">{error}</div>
          ) : (
            <table className="w-full text-sm border-collapse min-w-max">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wide">
                  <th className="border border-slate-300 px-2 py-2.5 whitespace-nowrap w-10 text-center">No.</th>
                  <th className="border border-slate-300 px-3 py-2.5 whitespace-nowrap">Doc / Form No.</th>
                  <th className="border border-slate-300 px-3 py-2.5 whitespace-nowrap min-w-[220px]">Title / Name Record</th>
                  <th className="border border-slate-300 px-3 py-2.5 whitespace-nowrap">Category</th>
                  <th className="border border-slate-300 px-3 py-2.5 whitespace-nowrap">Sub-Category</th>
                  <th className="border border-slate-300 px-3 py-2.5 whitespace-nowrap text-center">Rev.</th>
                  {Array.from({ length: maxRevs }, (_, i) => (
                    <th key={i} className="border border-slate-300 px-3 py-2.5 whitespace-nowrap text-center text-red-600">
                      (Rev.{String(i + 1).padStart(2, '0')}) Eff. Date
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6 + maxRevs} className="text-center py-14 text-slate-400">No documents found.</td>
                  </tr>
                ) : (
                  filtered.map((row, idx) => {
                    const lvlNorm = normalizeLevel(row.level);
                    const subNorm = normalizeSub(row.sub_category);
                    const lvlBadge =
                      lvlNorm === 'FORM'             ? 'bg-indigo-50 text-indigo-700 ring-indigo-200' :
                      lvlNorm === 'PROCEDURE'        ? 'bg-blue-50 text-blue-700 ring-blue-200' :
                      lvlNorm === 'SUPPORT'          ? 'bg-cyan-50 text-cyan-700 ring-cyan-200' :
                      lvlNorm === 'WORK INSTRUCTION' ? 'bg-teal-50 text-teal-700 ring-teal-200' :
                      lvlNorm === 'QUALITY MANUAL'   ? 'bg-purple-50 text-purple-700 ring-purple-200' :
                                                       'bg-slate-50 text-slate-600 ring-slate-200';
                    return (
                      <tr key={row.id} className="hover:bg-blue-50/30 transition-colors border-b border-slate-100">
                        <td className="border border-slate-200 px-2 py-2 text-center text-slate-400 text-xs">{idx + 1}</td>
                        <td className="border border-slate-200 px-3 py-2 font-mono font-semibold text-blue-700 text-xs whitespace-nowrap">{row.doc_no}</td>
                        <td className="border border-slate-200 px-3 py-2 text-slate-800 text-sm">{row.title}</td>
                        <td className="border border-slate-200 px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${lvlBadge}`}>
                            {lvlNorm === 'FORM' ? 'Form' :
                             lvlNorm === 'PROCEDURE' ? 'Procedure' :
                             lvlNorm === 'SUPPORT' ? 'Support' :
                             lvlNorm === 'WORK INSTRUCTION' ? 'WI' :
                             lvlNorm === 'QUALITY MANUAL' ? 'QM' :
                             (row.level || '-')}
                          </span>
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                          {subNorm ? subNorm.charAt(0) + subNorm.slice(1).toLowerCase() : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-bold text-slate-700">
                            {row.revision != null ? `R${row.revision}` : '-'}
                          </span>
                        </td>
                        {Array.from({ length: maxRevs }, (_, colIdx) => {
                          const rev = row.revisions[colIdx];
                          // Last entry = current revision (bold black)
                          // is_purged = deleted per retention rule (red)
                          // in-between = retained prior revision (normal slate)
                          const isLatest = rev ? colIdx === row.revisions.length - 1 : false;
                          const isPurged = rev?.is_purged === true;
                          return (
                            <td key={colIdx} className="border border-slate-200 px-3 py-2 text-center text-xs whitespace-nowrap">
                              {rev ? (
                                <span className={
                                  isPurged
                                    ? 'text-red-500'
                                    : isLatest
                                      ? 'font-semibold text-slate-800'
                                      : 'text-slate-500'
                                }>
                                  {formatDate(rev.effective_date)}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-xs text-slate-400">
              <span className="font-semibold text-slate-600">Bold date</span> = current revision
              &nbsp;·&nbsp;
              <span className="text-slate-500">Normal date</span> = prior revision (still in system)
              &nbsp;·&nbsp;
              <span className="text-red-500 font-medium">Red date</span> = deleted per retention rule
            </p>
            <p className="text-xs text-slate-400">
              Retention: <span className="font-medium text-slate-500">Forms</span> → current only
              &nbsp;·&nbsp;
              <span className="font-medium text-slate-500">All others</span> → current + 1 prior revision
            </p>
          </div>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}