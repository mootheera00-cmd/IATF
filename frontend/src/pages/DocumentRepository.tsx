// frontend/src/pages/DocumentRepository.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { dcrAPI, documentAPI } from '../api';
import {
  FileText, Activity, Briefcase, File, Book, Layout, List, FolderOpen,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import MasterListModal from '../components/MasterListModal';
import NewBadge from '../components/NewBadge';
import { isNew, markSeen } from '../hooks/useNewBadge';
import { normalizeCategory, getLevelId } from '../utils/category';

const IATF_LEVELS = [
  { id: 'ALL', label: 'All Documents',                              icon: Layout,    color: 'text-slate-600',  bg: 'bg-slate-100'  },
  { id: 'L1',  label: 'Level 1: Quality Manual',                   icon: Book,      color: 'text-purple-600', bg: 'bg-purple-100' },
  { id: 'L2',  label: 'Level 2: Procedure',                        icon: Briefcase, color: 'text-blue-600',   bg: 'bg-blue-100'   },
  { id: 'L3',  label: 'Level 3: WI / Support / Outside / Ops Std.',icon: FileText,  color: 'text-cyan-600',   bg: 'bg-cyan-100'   },
  { id: 'L4',  label: 'Level 4: Form / Report',                    icon: File,      color: 'text-slate-600',  bg: 'bg-slate-100'  },
];

export default function DocumentRepository() {
  const [documents,        setDocuments]        = useState<any[]>([]);
  const [allChangeRequests,setAllChangeRequests] = useState<any[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [activeTab,        setActiveTab]        = useState('ALL');
  const [searchQuery,      setSearchQuery]      = useState('');
  const [showMasterList,   setShowMasterList]   = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [docRes, crRes] = await Promise.all([
        documentAPI.list(),
        dcrAPI.list('all'),
      ]);
      setDocuments(Array.isArray(docRes.data) ? docRes.data : []);
      setAllChangeRequests(crRes.data.change_requests || []);
    } catch (err) {
      console.error('DocumentRepository fetchData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const normalizedDocuments = useMemo(() =>
    documents.map((doc) => {
      const category = normalizeCategory(doc.level || doc.document_type || doc.category);
      return { ...doc, category, levelId: getLevelId(category) };
    }), [documents]);

  const visibleDocuments = useMemo(() => {
    const allowedStatuses = new Set([
      'pending revision','returned for revision','pending checker','pending approval',
      'pending approver','pending non-sign pdf','pending final dc release','released','approved',
    ]);
    const approvedDocIds = new Set(
      allChangeRequests
        .filter((cr: any) => allowedStatuses.has(String(cr.status || '').trim().toLowerCase()))
        .map((cr: any) => Number(cr.document_id))
    );
    return normalizedDocuments.filter((doc) => {
      const s = String(doc.status || '').trim().toLowerCase();
      return s === 'released' || approvedDocIds.has(Number(doc.id));
    });
  }, [normalizedDocuments, allChangeRequests]);

  const docStats = useMemo(() => ({
    total: visibleDocuments.length,
    L1: visibleDocuments.filter(d => d.levelId === 'L1').length,
    L2: visibleDocuments.filter(d => d.levelId === 'L2').length,
    L3: visibleDocuments.filter(d => d.levelId === 'L3').length,
    L4: visibleDocuments.filter(d => d.levelId === 'L4').length,
  }), [visibleDocuments]);

  const filteredDocuments = useMemo(() =>
    visibleDocuments.filter((doc) => {
      const matchesTab    = activeTab === 'ALL' || doc.levelId === activeTab;
      const matchesSearch = doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            doc.doc_no?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    }), [visibleDocuments, activeTab, searchQuery]);

  const getDocumentStatusBadge = (status: string) => {
    const n = String(status || '').trim().toLowerCase();
    if (n === 'released')                return { badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' };
    if (n === 'draft')                   return { badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' };
    if (n === 'in_review' || n === 'in review') return { badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' };
    if (n === 'obsolete')               return { badge: 'bg-rose-100 text-rose-700',  dot: 'bg-rose-500' };
    return { badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
  };

  if (loading) return (
    <div className="flex justify-center items-center h-[calc(100vh-100px)]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6 pb-10 animate-fade-in">

      {/* Master List Modal */}
      {showMasterList && (
        <MasterListModal onClose={() => setShowMasterList(false)} />
      )}

      {/* Page title */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FolderOpen size={20} className="text-indigo-500" /> Document Repository</h1>
          <p className="text-sm text-slate-500 mt-1">IATF 16949 Standard Documentation Hierarchy — all controlled documents</p>
        </div>
        <button
          onClick={() => setShowMasterList(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
        >
          <List size={16} />
          Master List
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Documents', value: docStats.total, icon: Book,      color: 'bg-indigo-50 text-indigo-600', sub: 'Across all levels' },
          { label: 'Level 1',         value: docStats.L1,    icon: Activity,  color: 'bg-purple-50 text-purple-600', sub: 'Quality Manual' },
          { label: 'Level 2',         value: docStats.L2,    icon: Briefcase, color: 'bg-blue-50 text-blue-600',     sub: 'Procedures' },
          { label: 'Level 3',         value: docStats.L3,    icon: FileText,  color: 'bg-cyan-50 text-cyan-600',     sub: 'WI / Support / Ops Std.' },
          { label: 'Level 4',         value: docStats.L4,    icon: File,      color: 'bg-slate-50 text-slate-600',   sub: 'Form / Report' },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-slate-500 text-xs font-medium mb-1">{label}</p>
                <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
              </div>
              <div className={`p-2.5 rounded-lg ${color} bg-opacity-60`}>
                <Icon size={20} />
              </div>
            </div>
            <p className="text-xs text-slate-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Document table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Controlled Documents</h2>
            <p className="text-sm text-slate-500 mt-0.5">IATF 16949 Standard Documentation Hierarchy</p>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search by Title or Doc No..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 w-full md:w-64"
            />
            <div className="absolute left-3 top-2.5 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
          </div>
        </div>

        {/* Level tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {IATF_LEVELS.map((level) => {
            const isActive = activeTab === level.id;
            const Icon = level.icon;
            const count = level.id === 'ALL' ? docStats.total : (docStats as any)[level.id];
            return (
              <button
                key={level.id}
                onClick={() => setActiveTab(level.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                {level.label}
                <span className={`ml-1 text-xs py-0.5 px-2 rounded-full ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="flex-1 table-wrap">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold tracking-wider">
              <tr>
                <th className="px-6 py-4">Doc No.</th>
                <th className="px-6 py-4">Title</th>
                <th className="px-6 py-4">Rev</th>
                <th className="px-6 py-4">Level</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocuments.length > 0 ? (
                filteredDocuments.map((doc) => {
                  const badge = getDocumentStatusBadge(doc.status);
                  const showNew = isNew('doc', doc.id, doc.created_at);
                  return (
                    <tr key={doc.id} className={`hover:bg-slate-50/80 transition-colors group ${showNew ? 'bg-rose-50/30' : ''}`}>
                      <td className="px-6 py-4 font-mono text-sm font-medium text-slate-700">
                        <span className="flex items-center gap-2">
                          {doc.doc_no}
                          {showNew && <NewBadge />}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-800">{doc.title}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold">R{doc.revision}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${
                          doc.levelId === 'L1' ? 'bg-purple-50 text-purple-700 ring-purple-600/20' :
                          doc.levelId === 'L2' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                          doc.levelId === 'L3' ? 'bg-cyan-50 text-cyan-700 ring-cyan-600/20' :
                                                 'bg-slate-50 text-slate-700 ring-slate-600/20'
                        }`}>
                          {doc.levelId === 'L1' ? 'Level 1 - Quality Manual' :
                           doc.levelId === 'L2' ? 'Level 2 - Procedure' :
                           doc.levelId === 'L3' ? `Level 3 - ${doc.category || 'Document'}` :
                           doc.levelId === 'L4' ? `Level 4 - ${doc.category || 'Document'}` :
                           (doc.category || doc.level || 'Uncategorized')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {doc.status || 'Draft'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to={`/documents/${doc.id}`}
                          onClick={() => markSeen('doc', doc.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-3">
                      <div className="bg-slate-50 p-4 rounded-full">
                        <FileText size={32} className="text-slate-300" />
                      </div>
                      <p>No documents found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
