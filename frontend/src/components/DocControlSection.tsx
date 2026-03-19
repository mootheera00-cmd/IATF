// components/DocControlSection.tsx
// Embeddable doc-control panel: filtered document list + inline DCR request flow.
// Used by RiskAssessment, MSA, and any future specialty pages.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { dcrAPI, documentAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import {
  FileText, Plus, RefreshCw, Search, Tag,
  CheckCircle2, AlertCircle, X, ExternalLink,
  ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface ExtraCategory {
  /** Category label shown in the "Create New Document" form (e.g. "MSA") */
  category: string;
  /** Sub-category options for this category */
  subCategories: string[];
}

interface DocControlSectionProps {
  /** Keywords used to filter the document list panel.
   *  A document matches if title, doc_no, level, document_type, or category contains ANY keyword. */
  filterKeywords: string[];
  /** Human-readable label shown in the section header */
  label: string;
  /** Accent colour preset */
  accent?: 'orange' | 'indigo' | 'teal' | 'rose' | 'purple';
  /** Extra categories to add to the "Create New Document" form (page-specific, e.g. MSA) */
  extraNewCategories?: ExtraCategory[];
  /** Optional additional CSS class on the wrapper */
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  released:    'bg-emerald-100 text-emerald-700',
  draft:       'bg-amber-100 text-amber-700',
  in_review:   'bg-blue-100 text-blue-700',
  obsolete:    'bg-rose-100 text-rose-700',
};

const DCR_STATUS_BADGE: Record<string, string> = {
  'Draft':                    'bg-slate-100 text-slate-600 border border-slate-300',
  'Pending DC Review':        'bg-blue-100 text-blue-700 border border-blue-200',
  'Pending Revision':         'bg-cyan-100 text-cyan-700 border border-cyan-200',
  'Returned for Revision':    'bg-rose-100 text-rose-700 border border-rose-200',
  'Pending Checker':          'bg-amber-100 text-amber-700 border border-amber-200',
  'Pending Approval':         'bg-amber-100 text-amber-700 border border-amber-200',
  'Pending Approver':         'bg-indigo-100 text-indigo-700 border border-indigo-200',
  'Pending Non-Sign PDF':     'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'Pending Final DC Release': 'bg-sky-100 text-sky-700 border border-sky-200',
  'Approved':                 'bg-green-100 text-green-700 border border-green-200',
  'Released':                 'bg-purple-100 text-purple-700 border border-purple-200',
  'Rejected':                 'bg-red-100 text-red-700 border border-red-200',
  'Closed':                   'bg-slate-200 text-slate-600 border border-slate-300',
  'Delete Requested':         'bg-orange-100 text-orange-700 border border-orange-200',
};

function docStatusBadge(status: string) {
  const key = String(status || '').trim().toLowerCase().replace(/[\s_]+/g, '_');
  return STATUS_BADGE[key] ?? 'bg-slate-100 text-slate-600';
}

const ACCENT_CLASSES = {
  orange: { border: 'border-orange-500', bg: 'bg-orange-600', hover: 'hover:bg-orange-700', light: 'bg-orange-50', text: 'text-orange-700', ring: 'focus:ring-orange-100', focus: 'focus:border-orange-400' },
  indigo: { border: 'border-indigo-500', bg: 'bg-indigo-600', hover: 'hover:bg-indigo-700', light: 'bg-indigo-50', text: 'text-indigo-700', ring: 'focus:ring-indigo-100', focus: 'focus:border-indigo-400' },
  teal:   { border: 'border-teal-500',   bg: 'bg-teal-600',   hover: 'hover:bg-teal-700',   light: 'bg-teal-50',   text: 'text-teal-700',   ring: 'focus:ring-teal-100',   focus: 'focus:border-teal-400'   },
  rose:   { border: 'border-rose-500',   bg: 'bg-rose-600',   hover: 'hover:bg-rose-700',   light: 'bg-rose-50',   text: 'text-rose-700',   ring: 'focus:ring-rose-100',   focus: 'focus:border-rose-400'   },
  purple: { border: 'border-purple-500', bg: 'bg-purple-600', hover: 'hover:bg-purple-700', light: 'bg-purple-50', text: 'text-purple-700', ring: 'focus:ring-purple-100', focus: 'focus:border-purple-400' },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function DocControlSection({
  filterKeywords,
  label,
  accent = 'purple',
  extraNewCategories = [],
  className = '',
}: DocControlSectionProps) {
  const { user, roleMode } = useAuth();
  const ac = ACCENT_CLASSES[accent];

  // ── Data state ──────────────────────────────────────────────────────────────
  const [allDocs,    setAllDocs]    = useState<any[]>([]);
  const [allDCRs,    setAllDCRs]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [docSearch,  setDocSearch]  = useState('');
  const [showDCRs,   setShowDCRs]   = useState(false);

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [showModal,  setShowModal]  = useState(false);

  // Create DCR form state
  const normalizedRole = String((user as any)?.actual_role || (user as any)?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const isDcRole = ['DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(normalizedRole) && roleMode !== 'USER';

  const [requestMode, setRequestMode] = useState<'CHANGE' | 'NEW' | 'REUPLOAD'>(isDcRole ? 'REUPLOAD' : 'CHANGE');
  const [formError,   setFormError]   = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  // CHANGE mode
  const [selectedCategory,  setSelectedCategory]  = useState('');
  const [docNoInput,         setDocNoInput]         = useState('');
  const [selectedDocId,      setSelectedDocId]      = useState('');
  const [changeReason,       setChangeReason]       = useState('');

  // NEW mode
  const [newCategory,        setNewCategory]        = useState('');
  const [newSubCategory,     setNewSubCategory]     = useState('');
  const [newDocName,         setNewDocName]         = useState('');
  const [newReason,          setNewReason]          = useState('');
  const [generatedDocNo,     setGeneratedDocNo]     = useState('');
  const [generatedLevel,     setGeneratedLevel]     = useState('');
  const [previewMsg,         setPreviewMsg]         = useState('');

  // REUPLOAD mode
  const [reuploadSearch,     setReuploadSearch]     = useState('');
  const [reuploadDocId,      setReuploadDocId]      = useState('');
  const [reuploadOptions,    setReuploadOptions]    = useState<any>(null);
  const [reuploadRevId,      setReuploadRevId]      = useState('');
  const [reuploadAssignee,   setReuploadAssignee]   = useState('');
  const [reuploadReason,     setReuploadReason]     = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      setLoading(true);
      const [docRes, dcrRes] = await Promise.all([
        documentAPI.list(),
        dcrAPI.list('all'),
      ]);
      setAllDocs(Array.isArray(docRes.data) ? docRes.data : []);
      setAllDCRs(dcrRes.data.change_requests || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Filtered docs ─────────────────────────────────────────────────────────
  const keywords = useMemo(() => filterKeywords.map(k => k.toLowerCase()), [filterKeywords]);

  const matchesKeyword = (doc: any) => {
    const haystack = [doc.title, doc.doc_no, doc.level, doc.document_type, doc.category]
      .join(' ').toLowerCase();
    return keywords.some(k => haystack.includes(k));
  };

  const filteredDocs = useMemo(() => {
    const q = docSearch.toLowerCase();
    return allDocs.filter(doc => {
      if (!matchesKeyword(doc)) return false;
      if (!q) return true;
      return (doc.title || '').toLowerCase().includes(q) ||
             (doc.doc_no || '').toLowerCase().includes(q);
    });
  }, [allDocs, docSearch, keywords]);

  // ── Filtered DCRs ─────────────────────────────────────────────────────────
  const filteredDCRs = useMemo(() => {
    return allDCRs.filter(dcr => {
      const hay = [dcr.title, dcr.document_title, dcr.doc_no, dcr.doc_number,
                   dcr.document_category, dcr.level].join(' ').toLowerCase();
      return keywords.some(k => hay.includes(k));
    });
  }, [allDCRs, keywords]);

  // ── New-document preview ──────────────────────────────────────────────────
  useEffect(() => {
    if (requestMode !== 'NEW' || !newCategory || !newSubCategory) {
      setGeneratedDocNo(''); setGeneratedLevel(''); return;
    }
    let alive = true;
    setPreviewMsg('Generating…');
    dcrAPI.previewNewDocument({ category: newCategory, subCategory: newSubCategory })
      .then(r => { if (alive) { setGeneratedDocNo(r.data?.documentNo || ''); setGeneratedLevel(r.data?.level || ''); setPreviewMsg(''); } })
      .catch(() => { if (alive) { setGeneratedDocNo(''); setGeneratedLevel(''); setPreviewMsg('Unable to generate doc number'); } });
    return () => { alive = false; };
  }, [requestMode, newCategory, newSubCategory]);

  // ── Reupload options ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!reuploadDocId) { setReuploadOptions(null); return; }
    dcrAPI.getReuploadOptions(reuploadDocId)
      .then(r => {
        setReuploadOptions(r.data || null);
        setReuploadRevId(String(r.data?.current_revision_id || r.data?.revisions?.[0]?.id || ''));
        setReuploadAssignee(String(r.data?.default_assignee_id || r.data?.users?.[0]?.id || ''));
      })
      .catch(() => setFormError('Failed to load re-upload options'));
  }, [reuploadDocId]);

  // ── All released docs (for CHANGE/REUPLOAD suggestions) ──────────────────
  // releasedDocs = ALL released (needed for DCR API which uses real doc IDs)
  const releasedDocs = useMemo(() =>
    allDocs
      .filter(d => String(d.status || '').trim().toLowerCase() === 'released')
      .map(d => ({ ...d, category: d.level || d.category || 'Uncategorized' })),
    [allDocs]
  );

  // pageReleasedDocs = only docs that match this page's keywords (used for CHANGE + REUPLOAD search)
  const pageReleasedDocs = useMemo(() =>
    releasedDocs.filter(d => matchesKeyword(d)),
    [releasedDocs, keywords]
  );

  // Category dropdown for CHANGE mode — derived from this page's docs only
  const categories = useMemo(() =>
    [...new Set(pageReleasedDocs.map(d => d.category).filter(Boolean))].sort(),
    [pageReleasedDocs]
  );

  const catDocs = selectedCategory
    ? pageReleasedDocs.filter(d => d.category === selectedCategory)
    : [];

  const docSuggestions = catDocs
    .filter(d => {
      if (!docNoInput.trim()) return true;
      const q = docNoInput.toLowerCase();
      return (d.doc_no || '').toLowerCase().includes(q) || (d.title || '').toLowerCase().includes(q);
    }).slice(0, 10);

  // REUPLOAD search — only within this page's docs
  const reuploadSuggestions = pageReleasedDocs
    .filter(d => {
      if (!reuploadSearch.trim()) return true;
      const q = reuploadSearch.toLowerCase();
      return (d.doc_no || '').toLowerCase().includes(q) || (d.title || '').toLowerCase().includes(q);
    }).slice(0, 8);

  const selectedDoc = pageReleasedDocs.find(d => String(d.id) === selectedDocId);

  // ── Reset modal state ─────────────────────────────────────────────────────
  const resetModal = () => {
    setRequestMode(isDcRole ? 'REUPLOAD' : 'CHANGE');
    setFormError(''); setFormSuccess(''); setSubmitting(false);
    setSelectedCategory(''); setDocNoInput(''); setSelectedDocId(''); setChangeReason('');
    setNewCategory(''); setNewSubCategory(''); setNewDocName(''); setNewReason('');
    setGeneratedDocNo(''); setGeneratedLevel(''); setPreviewMsg('');
    setReuploadSearch(''); setReuploadDocId(''); setReuploadOptions(null);
    setReuploadRevId(''); setReuploadAssignee(''); setReuploadReason('');
  };

  const openModal = () => { resetModal(); setShowModal(true); };
  const closeModal = () => { setShowModal(false); };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const reason = requestMode === 'NEW' ? newReason
                 : requestMode === 'REUPLOAD' ? reuploadReason
                 : changeReason;

    if (!reason.trim()) { setFormError('Please enter a reason.'); return; }

    if (requestMode === 'CHANGE' && !selectedDocId) { setFormError('Please select a document.'); return; }
    if (requestMode === 'NEW' && (!newCategory || !newSubCategory || !newDocName.trim())) {
      setFormError('Please fill in category, sub-category and document name.'); return;
    }
    if (requestMode === 'REUPLOAD' && (!reuploadDocId || !reuploadRevId || !reuploadAssignee)) {
      setFormError('Please select document, revision and uploader.'); return;
    }

    try {
      setSubmitting(true);
      let crId: number | string;

      if (requestMode === 'REUPLOAD') {
        const r = await dcrAPI.createReupload({
          document_id:      parseInt(reuploadDocId, 10),
          target_revision_id: parseInt(reuploadRevId, 10),
          assignee_id:      parseInt(reuploadAssignee, 10),
          reason,
        });
        crId = r.data?.change_request_id || r.data?.cr_id || r.data?.id;
      } else if (requestMode === 'NEW') {
        const r = await dcrAPI.createNewDocument({ category: newCategory, subCategory: newSubCategory, reason, documentName: newDocName });
        crId = r.data?.change_request_id || r.data?.cr_id || r.data?.id;
        await dcrAPI.submit(crId);
      } else {
        const r = await dcrAPI.create({ document_id: parseInt(selectedDocId, 10), reason });
        crId = r.data?.change_request_id || r.data?.cr_id || r.data?.id;
        await dcrAPI.submit(crId);
      }

      setFormSuccess(`Request #${String(crId).padStart(4, '0')} submitted. Document Control has been notified.`);
      fetchData(); // refresh DCR list
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`space-y-4 ${className}`}>

      {/* Section header */}
      <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border ${ac.light} border-opacity-60 border-current`}
           style={{ borderColor: 'var(--tw-border-opacity)' }}>
        <div className="flex items-center gap-3">
          <FileText size={18} className={ac.text} />
          <div>
            <p className={`font-semibold text-sm ${ac.text}`}>{label} — Controlled Documents</p>
            <p className="text-xs text-slate-500">Documents linked to this module · manage via Change Request</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
            title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button onClick={openModal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow transition-colors ${ac.bg} ${ac.hover}`}>
            <Plus size={13} /> Request Change / New Doc
          </button>
        </div>
      </div>

      {/* Document table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={docSearch} onChange={e => setDocSearch(e.target.value)}
              placeholder="Search documents…"
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-300 bg-slate-50"
            />
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap">{filteredDocs.length} doc{filteredDocs.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-slate-400 mb-2" />
            <p>Loading…</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <FileText size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">No documents found</p>
            <p className="text-xs mt-1 text-slate-300">
              {docSearch ? 'Try a different search term' : 'No documents are tagged to this module yet'}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Doc No.</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rev</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredDocs.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700">{doc.doc_no}</td>
                    <td className="px-4 py-3 text-xs text-slate-800 max-w-[280px] truncate">{doc.title}</td>
                    <td className="px-4 py-3">
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600">R{doc.revision ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${docStatusBadge(doc.status)}`}>
                        {doc.status || 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/documents/${doc.id}`}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium">
                        View <ExternalLink size={10} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DCR history toggle */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowDCRs(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
          <span className="flex items-center gap-2">
            <Tag size={14} className="text-slate-400" />
            Change Requests for this module
            <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-slate-100 rounded-full text-slate-500 font-bold">
              {filteredDCRs.length}
            </span>
          </span>
          {showDCRs ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </button>

        {showDCRs && (
          filteredDCRs.length === 0 ? (
            <div className="px-4 pb-5 pt-1 text-xs text-slate-400 text-center">No change requests found for this module.</div>
          ) : (
            <div className="table-wrap border-t border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Doc No.</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredDCRs.map(dcr => (
                    <tr key={dcr.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-purple-700 font-semibold font-mono">
                        #{String(dcr.id).padStart(4, '0')}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{dcr.doc_no || dcr.doc_number || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 max-w-[200px] truncate">{dcr.title || dcr.document_title || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[180px] truncate">{dcr.reason || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${DCR_STATUS_BADGE[dcr.status] || 'bg-slate-100 text-slate-600'}`}>
                          {dcr.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link to={`/dcr/${dcr.id}`}
                          className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 font-medium">
                          Open <ExternalLink size={10} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Create/Change Request Modal ──────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 px-4 py-10 overflow-y-auto">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 mt-4">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <p className="font-bold text-slate-900">Request Change / New Document</p>
                <p className="text-xs text-slate-500 mt-0.5">{label} module</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

              {/* Feedback */}
              {formError && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 text-xs text-rose-700">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-xs text-emerald-700">
                  <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{formSuccess}
                    {' '}<Link to="/dcr" className="underline font-semibold hover:text-emerald-900">View all requests →</Link>
                  </span>
                </div>
              )}

              {/* Mode tabs */}
              <div className="flex gap-2 flex-wrap">
                {!isDcRole && (
                  <button type="button"
                    onClick={() => setRequestMode('CHANGE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                      ${requestMode === 'CHANGE' ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    Change Request
                  </button>
                )}
                {!isDcRole && (
                  <button type="button"
                    onClick={() => setRequestMode('NEW')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                      ${requestMode === 'NEW' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    Create New Document
                  </button>
                )}
                <button type="button"
                  onClick={() => setRequestMode('REUPLOAD')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                    ${requestMode === 'REUPLOAD' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  Re-Upload Request
                </button>
              </div>

              {/* ── CHANGE mode ── */}
              {requestMode === 'CHANGE' && (
                <div className="space-y-4">
                  {/* Category dropdown */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                      <Tag size={12} /> Step 1 — Category
                    </p>
                    {categories.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No categories found — no released documents in this module yet.</p>
                    ) : (
                      <select
                        value={selectedCategory}
                        onChange={e => { setSelectedCategory(e.target.value); setDocNoInput(''); setSelectedDocId(''); }}
                        className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus} bg-white`}>
                        <option value="">— Select category —</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {/* Doc search */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1"><FileText size={12} /> Step 2 — Select Document</p>
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={docNoInput}
                        onChange={e => { setDocNoInput(e.target.value); setSelectedDocId(''); }}
                        disabled={!selectedCategory}
                        placeholder={selectedCategory ? `Search in ${selectedCategory}…` : 'Select a category first'}
                        className={`w-full pl-7 pr-3 py-2 text-xs border rounded-lg focus:outline-none transition-colors
                          ${!selectedCategory ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : `bg-white border-slate-200 ${ac.focus}`}`}
                      />
                    </div>
                    {selectedCategory && docSuggestions.length > 0 && (
                      <div className="mt-1.5 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white shadow-md divide-y divide-slate-100">
                        {docSuggestions.map(doc => (
                          <button key={doc.id} type="button"
                            onClick={() => { setSelectedDocId(String(doc.id)); setDocNoInput(doc.doc_no || ''); }}
                            className={`w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors
                              ${selectedDocId === String(doc.id) ? `bg-slate-50 border-l-2 ${ac.border}` : ''}`}>
                            <p className="text-xs font-semibold text-slate-800">{doc.doc_no}</p>
                            <p className="text-[10px] text-slate-500 truncate">{doc.title}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedCategory && docSuggestions.length === 0 && (
                      <p className="text-[10px] text-slate-400 mt-1 italic">No released documents in this category.</p>
                    )}
                    {selectedDoc && (
                      <p className="text-[10px] text-emerald-600 mt-1 font-medium">✓ {selectedDoc.doc_no} — {selectedDoc.title}</p>
                    )}
                  </div>
                  {/* Reason */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">Reason <span className="text-rose-500">*</span></p>
                    <input value={changeReason} onChange={e => setChangeReason(e.target.value)}
                      placeholder="Short reason for the change request"
                      className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus} transition-colors`} />
                  </div>
                </div>
              )}

              {/* ── NEW mode ── */}
              {requestMode === 'NEW' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Category <span className="text-rose-500">*</span></p>
                      <select value={newCategory} onChange={e => { setNewCategory(e.target.value); setNewSubCategory(''); }}
                        className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus}`}>
                        <option value="">Select category</option>
                        <option value="Form">Form</option>
                        <option value="Procedure">Procedure</option>
                        <option value="Support">Support</option>
                        <option value="Work Instruction">Work Instruction</option>
                        {extraNewCategories.map(ec => (
                          <option key={ec.category} value={ec.category}>{ec.category}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Sub-Category <span className="text-rose-500">*</span></p>
                      <select value={newSubCategory} onChange={e => setNewSubCategory(e.target.value)}
                        className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus}`}>
                        <option value="">Select sub-category</option>
                        {newCategory === 'Form' && <><option value="Investigation">Investigation</option><option value="Test">Test</option><option value="DOC LAB Control">DOC LAB Control</option><option value="Calibration">Calibration</option><option value="Document">Document</option><option value="Traning">Traning</option></>}
                        {newCategory === 'Procedure' && <option value="Procedure">Procedure</option>}
                        {newCategory === 'Support' && <><option value="Investigation">Investigation</option><option value="Test">Test</option><option value="DOC LAB Control">DOC LAB Control</option><option value="Calibration">Calibration</option><option value="Traning">Traning</option></>}
                        {newCategory === 'Work Instruction' && <><option value="Investigation">Investigation</option><option value="Test">Test</option><option value="DOC LAB Control">DOC LAB Control</option><option value="Calibration">Calibration</option></>}
                        {extraNewCategories.find(ec => ec.category === newCategory)?.subCategories.map(sc => (
                          <option key={sc} value={sc}>{sc}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">Document Name <span className="text-rose-500">*</span></p>
                    <input value={newDocName} onChange={e => setNewDocName(e.target.value)}
                      placeholder="Enter document name"
                      className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus}`} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Doc No. (auto)</p>
                      <input value={generatedDocNo} readOnly placeholder={previewMsg || 'Auto-generated'}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Level (auto)</p>
                      <input value={generatedLevel} readOnly placeholder="Auto-filled"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-600" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">Reason <span className="text-rose-500">*</span></p>
                    <input value={newReason} onChange={e => setNewReason(e.target.value)}
                      placeholder="Short reason for creating this document"
                      className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus}`} />
                  </div>
                </div>
              )}

              {/* ── REUPLOAD mode ── */}
              {requestMode === 'REUPLOAD' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">Document <span className="text-rose-500">*</span></p>
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={reuploadSearch} onChange={e => setReuploadSearch(e.target.value)}
                        placeholder="Search document number or name…"
                        className={`w-full pl-7 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus}`} />
                    </div>
                    {reuploadSuggestions.length > 0 && (
                      <div className="mt-1.5 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white shadow-md divide-y divide-slate-100">
                        {reuploadSuggestions.map(doc => (
                          <button key={doc.id} type="button"
                            onClick={() => { setReuploadDocId(String(doc.id)); setReuploadSearch(`${doc.doc_no} — ${doc.title}`); }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors">
                            <p className="text-xs font-semibold text-slate-800">{doc.doc_no}</p>
                            <p className="text-[10px] text-slate-500 truncate">{doc.title}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {reuploadOptions && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-1.5">Revision</p>
                        <select value={reuploadRevId} onChange={e => setReuploadRevId(e.target.value)}
                          className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus}`}>
                          {reuploadOptions.revisions?.map((rev: any) => (
                            <option key={rev.id} value={rev.id}>
                              {rev.rev_code || `Rev ${rev.id}`}{rev.id === reuploadOptions.current_revision_id ? ' (Current)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-1.5">Uploader</p>
                        <select value={reuploadAssignee} onChange={e => setReuploadAssignee(e.target.value)}
                          className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus}`}>
                          {(reuploadOptions.users || []).map((u: any) => (
                            <option key={u.id} value={u.id}>{u.employee_code} — {u.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">Reason <span className="text-rose-500">*</span></p>
                    <input value={reuploadReason} onChange={e => setReuploadReason(e.target.value)}
                      placeholder="Short reason for re-uploading"
                      className={`w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none ${ac.focus}`} />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                {!formSuccess && (
                  <button type="submit" disabled={submitting}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 ${ac.bg} ${ac.hover}`}>
                    {submitting ? 'Submitting…' : 'Send Request'}
                  </button>
                )}
                <button type="button" onClick={closeModal}
                  className={`${formSuccess ? 'flex-1' : 'px-5'} py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors`}>
                  {formSuccess ? 'Close' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
