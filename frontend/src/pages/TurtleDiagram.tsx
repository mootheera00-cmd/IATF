import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wrench, Users, ArrowRightLeft, ClipboardList, AlertTriangle, BarChart3, Settings, HeartHandshake, Edit3, Bell, Check, XCircle, X, ExternalLink, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { genericEditRequestAPI, riskAssessmentAPI } from '../api';

/* ──────────────────── Turtle Diagram Data ──────────────────── */

interface TurtleItem {
  text: string;
  risk?: string;
}

interface TurtleDiagram {
  processName: string;
  processOwner: string;
  docRef: string;
  revision: string;
  effectiveDate: string;

  withWhat: TurtleItem[];        // Facilities / Equipment / Tools
  withWho: TurtleItem[];         // Competence / Skills / Training
  inputs: TurtleItem[];          // Materials, Pre-Products
  process: string[];             // Process steps
  outputs: TurtleItem[];         // Product / Records
  howMethods: TurtleItem[];      // Methods / Procedures / Specifications
  supportProcess: TurtleItem[];  // Support Process
  kpiResults: string[];          // Key Criteria / KPI
}

interface RiskItem {
  id: number; category_id: number; category_name: string; item_no: number;
  risk_opportunity: string; impact: string; existing_control: string;
  severity: number; occurrence: number; risk_score: number;
  detail: string; responsibility: string; status: string;
}

const turtleData: TurtleDiagram = {
  processName: 'Inspection and Test / Laboratory',
  processOwner: 'APTC',
  docRef: 'S-01-DOC-006',
  revision: 'Rev.02',
  effectiveDate: '2020-02-03',

  withWhat: [
    { text: 'Test machine', risk: 'Machine trouble' },
    { text: 'Measuring device', risk: 'Device trouble' },
    { text: 'Test room', risk: 'Uncondition (Climate control), Keep condition of temp, silentness of sound proof room' },
    { text: 'Measuring room', risk: 'Uncondition (Climate control, Ambient noise control) / humidity of measuring room' },
    { text: 'Std sample', risk: 'Quality of sample' },
    { text: 'Computer', risk: 'Computer trouble, Cyber attack, Update list of all hardware/software' },
    { text: 'Office automation (printer/copy machine)', risk: 'Obsolete of software/hardware' },
  ],

  withWho: [
    { text: 'Test engineer (Test machine skill, investigation skill)', risk: 'Lack of skill, During recruitment to fulfill manpower as MTP (2022-2026)' },
    { text: 'Investigating engineer (measuring device skill, application)', risk: 'Lack of skill, During recruitment to fulfill manpower as MTP (2022-2026)' },
    { text: 'Group Manager (customer spec., investigation skill, test skill, communication with related dept)', risk: 'Lack of skill' },
  ],

  inputs: [
    { text: 'Sample part', risk: 'Quality of sample part' },
    { text: 'Material supply (chemical substance)', risk: 'Quality of material supply (e.g. out of expire date)' },
  ],

  process: [
    'Order receiving (Order information, email)',
    'Confirmation of order detail',
    'Planning',
    'Perform test / investigation',
    'Making report',
    'Check report',
    'Issue report',
  ],

  outputs: [
    { text: 'Test / Investigation report', risk: 'Missing of info. / wrong info. / Not on plan' },
    { text: 'Record of test / investigation', risk: 'Lost of record / Cannot trace back to machine/device' },
    { text: 'Sample part after test / investigation', risk: 'Mis-handling' },
    { text: 'Calibration record', risk: 'Mis-handling / Not on plan' },
    { text: 'Training record', risk: 'Mis-handling / Not on plan' },
  ],

  howMethods: [
    { text: 'Investigation procedure', risk: 'Out of date' },
    { text: 'Test procedure', risk: 'Out of date' },
    { text: 'Work instruction', risk: 'Out of date' },
    { text: 'Customer specification', risk: 'Out of date' },
  ],

  supportProcess: [
    { text: 'Calibration', risk: 'Out of acceptable level' },
    { text: 'Machining (jig & fixture, modify of actual part)', risk: 'Out of accuracy' },
    { text: 'Repair and Maintenance', risk: 'Missing of preventive maintenance / Shortage of spare parts / Discontinuity of spare parts' },
  ],

  kpiResults: [
    'Lead time',
    'Test machine operation rate',
    'No. of revised report',
  ],
};

/* ──────────────────── Colors ──────────────────── */

const sectionStyles = {
  withWhat:   { bg: 'bg-sky-50',     border: 'border-sky-200',     header: 'bg-sky-100 text-sky-800',     icon: Wrench },
  withWho:    { bg: 'bg-violet-50',  border: 'border-violet-200',  header: 'bg-violet-100 text-violet-800', icon: Users },
  inputs:     { bg: 'bg-amber-50',   border: 'border-amber-200',   header: 'bg-amber-100 text-amber-800',   icon: ArrowRightLeft },
  process:    { bg: 'bg-indigo-50',  border: 'border-indigo-200',  header: 'bg-indigo-100 text-indigo-800',  icon: Settings },
  outputs:    { bg: 'bg-emerald-50', border: 'border-emerald-200', header: 'bg-emerald-100 text-emerald-800', icon: ClipboardList },
  howMethods: { bg: 'bg-rose-50',    border: 'border-rose-200',    header: 'bg-rose-100 text-rose-800',      icon: ClipboardList },
  support:    { bg: 'bg-teal-50',    border: 'border-teal-200',    header: 'bg-teal-100 text-teal-800',      icon: HeartHandshake },
  kpi:        { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', header: 'bg-fuchsia-100 text-fuchsia-800', icon: BarChart3 },
};

/* ──────────────────── Component ──────────────────── */

export default function TurtleDiagram() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const d = turtleData;

  // ─── Request Changes state ─────────────────────────────────────────────
  const [editRequests, setEditRequests] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ section: '', item_label: '', reason: '', approver_id: '', approver_name: '', request_type: 'EDIT' as string, details: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRequests, setShowRequests] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRequests = async () => {
    try {
      const { data } = await genericEditRequestAPI.getRequests('TurtleDiagram');
      setEditRequests(data.requests || []);
    } catch { /* */ }
  };

  const fetchManagers = async () => {
    try {
      const { data } = await genericEditRequestAPI.getManagers();
      setManagers(data.managers || []);
    } catch { /* */ }
  };

  useEffect(() => { fetchRequests(); fetchManagers(); }, []);

  const handleSubmitEditRequest = async () => {
    setFormError('');
    if (!editForm.reason.trim() || !editForm.approver_id) {
      setFormError('Reason and approver are required.'); return;
    }
    try {
      setSaving(true);
      await genericEditRequestAPI.create({
        module: 'TurtleDiagram',
        section: editForm.section,
        item_label: editForm.item_label,
        request_type: editForm.request_type,
        field_changes: { details: editForm.details },
        reason: editForm.reason,
        approver_id: Number(editForm.approver_id),
        approver_name: editForm.approver_name,
      });
      showToast('Change request submitted');
      setEditingSection(null);
      setEditForm({ section: '', item_label: '', reason: '', approver_id: '', approver_name: '', request_type: 'EDIT', details: '' });
      fetchRequests();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || 'Failed to submit request');
    } finally { setSaving(false); }
  };

  const handleApproveRequest = async (id: number) => {
    if (!confirm('Approve this change request?')) return;
    try {
      const { data } = await genericEditRequestAPI.approve(id);
      showToast(data.message || 'Request approved');
      fetchRequests();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to approve', 'error');
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectRequestId || !rejectReason.trim()) return;
    try {
      const { data } = await genericEditRequestAPI.reject(rejectRequestId, rejectReason.trim());
      showToast(data.message || 'Request rejected', 'info');
      setRejectRequestId(null);
      setRejectReason('');
      fetchRequests();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to reject', 'error');
    }
  };

  const pendingCount = editRequests.filter(r => r.status === 'PENDING').length;
  const SECTIONS = ['With What', 'With Who', 'Inputs', 'Process', 'Outputs', 'How Methods', 'Support Process', 'Key Results (KPI)'];

  // ─── Risk Assessment data ─────────────────────────────────────────────
  const [allRiskItems, setAllRiskItems] = useState<RiskItem[]>([]);
  const [riskLoading, setRiskLoading] = useState(false);
  const [selectedTurtleItem, setSelectedTurtleItem] = useState<{ item: TurtleItem; section: string } | null>(null);

  useEffect(() => {
    const fetchRiskItems = async () => {
      try {
        setRiskLoading(true);
        const { data } = await riskAssessmentAPI.getItems();
        setAllRiskItems(data.items || []);
      } catch { /* */ } finally {
        setRiskLoading(false);
      }
    };
    fetchRiskItems();
  }, []);

  const extractKeywords = (text: string): string[] => {
    const stopWords = new Set(['of', 'and', 'the', 'a', 'an', 'is', 'in', 'on', 'at', 'to', 'for', 'with', 'or', 'not', 'out', 'after', 'from', 'all', 'its', 'can', 'also', 'per', 'any', 'e.g']);
    return text.toLowerCase()
      .replace(/[()\/, .\[\]]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  };

  const getRelatedRisks = (item: TurtleItem): RiskItem[] => {
    const keywords = [
      ...extractKeywords(item.text),
      ...extractKeywords(item.risk || ''),
    ];
    if (keywords.length === 0) return [];
    return allRiskItems
      .map(risk => {
        const haystack = [risk.risk_opportunity, risk.impact, risk.category_name, risk.existing_control, risk.detail]
          .filter(Boolean).join(' ').toLowerCase();
        const score = keywords.filter(kw => haystack.includes(kw)).length;
        return { risk, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ risk }) => risk);
  };

  const riskBadgeStyle = (score: number) => {
    if (score >= 20) return { border: 'border-red-200',    bg: 'bg-red-50',    badge: 'bg-red-100 text-red-800',    text: 'text-red-700' };
    if (score >= 9)  return { border: 'border-orange-200', bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-800', text: 'text-orange-700' };
    if (score >= 4)  return { border: 'border-yellow-200', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-800', text: 'text-yellow-700' };
    return             { border: 'border-green-200',  bg: 'bg-green-50',  badge: 'bg-green-100 text-green-800',  text: 'text-green-700' };
  };

  const handleItemClick = (item: TurtleItem, section: string) => {
    setSelectedTurtleItem({ item, section });
  };

  const startEditing = (section: string) => {
    setEditingSection(section);
    setEditForm({ section, item_label: '', reason: '', approver_id: '', approver_name: '', request_type: 'EDIT', details: '' });
    setFormError('');
  };

  const renderInlineForm = (section: string) => {
    if (editingSection !== section) return null;
    return (
      <div className="border-t border-orange-200 bg-orange-50/60 p-4 space-y-3">
        {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{formError}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Request Type</label>
            <select value={editForm.request_type} onChange={e => setEditForm({ ...editForm, request_type: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="EDIT">Edit existing item</option>
              <option value="ADD">Add new item</option>
              <option value="DELETE">Remove item</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Approver (Manager) *</label>
            <select value={editForm.approver_id}
              onChange={e => {
                const m = managers.find((mg: any) => String(mg.id) === e.target.value);
                setEditForm({ ...editForm, approver_id: e.target.value, approver_name: m?.display_name || '' });
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Select approver —</option>
              {managers.map((m: any) => (
                <option key={m.id} value={m.id}>{m.display_name} ({m.employee_code}) — {m.role_name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Proposed Changes / Details</label>
          <textarea rows={2} value={editForm.details} onChange={e => setEditForm({ ...editForm, details: e.target.value })}
            placeholder="Describe what should be changed..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Reason for Change *</label>
          <textarea rows={2} value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
            placeholder="Why is this change needed?"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditingSection(null)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmitEditRequest} disabled={saving}
            className="px-4 py-1.5 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
            {saving ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 w-full px-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/safety')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Turtle Diagram</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {d.docRef} {d.revision} &middot; Process: {d.processName} &middot; Owner: {d.processOwner}
          </p>
        </div>
      </div>

      {/* ─── THE TURTLE LAYOUT ─── */}
      {/* Top row: With What (left) + With Who (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ItemRiskCard
          title="With What?"
          subtitle="Facilities / Equipment / Tools"
          items={d.withWhat}
          style={sectionStyles.withWhat}
          isEditMode={isEditMode}
          isEditing={editingSection === 'With What'}
          onEditClick={() => startEditing('With What')}
          editFormNode={renderInlineForm('With What')}
          onItemClick={(item) => handleItemClick(item, 'With What')}
        />
        <ItemRiskCard
          title="With Who?"
          subtitle="Competence / Skills / Training"
          items={d.withWho}
          style={sectionStyles.withWho}
          isEditMode={isEditMode}
          isEditing={editingSection === 'With Who'}
          onEditClick={() => startEditing('With Who')}
          editFormNode={renderInlineForm('With Who')}
          onItemClick={(item) => handleItemClick(item, 'With Who')}
        />
      </div>

      {/* Arrows: With What ↓ and With Who ↓  — vertical, centered over Process box */}
      <div className="hidden md:block w-full" style={{ height: '48px' }}>
        <svg width="100%" height="48" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="td-arr-sky" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#38bdf8" />
            </marker>
            <marker id="td-arr-violet" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#a78bfa" />
            </marker>
          </defs>
          {/* With What — left of Process center */}
          <line x1="44%" y1="4" x2="44%" y2="42" stroke="#38bdf8" strokeWidth="2.5" markerEnd="url(#td-arr-sky)" />
          {/* With Who — right of Process center */}
          <line x1="56%" y1="4" x2="56%" y2="42" stroke="#a78bfa" strokeWidth="2.5" markerEnd="url(#td-arr-violet)" />
        </svg>
      </div>

      {/* Middle row: Inputs → Process → Outputs */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1.8fr_auto_1fr] gap-0 items-stretch">
        {/* Inputs */}
        <ItemRiskCard
          title="Inputs"
          subtitle="Materials / Pre-Products"
          items={d.inputs}
          style={sectionStyles.inputs}
          isEditMode={isEditMode}
          isEditing={editingSection === 'Inputs'}
          onEditClick={() => startEditing('Inputs')}
          editFormNode={renderInlineForm('Inputs')}
          onItemClick={(item) => handleItemClick(item, 'Inputs')}
        />

        {/* Arrow → */}
        <div className="hidden md:flex items-center justify-center px-2">
          <svg width="32" height="24" viewBox="0 0 32 24" className="text-slate-300">
            <line x1="0" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
            <polygon points="32,12 20,4 20,20" fill="currentColor" />
          </svg>
        </div>

        {/* Process (center) */}
        <div className={`rounded-xl border-2 ${sectionStyles.process.border} ${sectionStyles.process.bg} overflow-hidden ${editingSection === 'Process' ? 'ring-2 ring-orange-300' : ''}`}>
          <div className={`px-4 py-2 ${sectionStyles.process.header} font-semibold text-sm flex items-center gap-2`}>
            <Settings size={15} />
            <span>Process</span>
            {isEditMode && (
              <button onClick={() => startEditing('Process')} className="ml-auto p-1 rounded hover:bg-white/40 transition" title="Request change for this section">
                <Edit3 size={14} />
              </button>
            )}
          </div>
          <div className="p-4">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">{d.processName}</p>
            <ol className="space-y-1.5">
              {d.process.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-200 text-indigo-800 text-[10px] font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          {renderInlineForm('Process')}
        </div>

        {/* Arrow → */}
        <div className="hidden md:flex items-center justify-center px-2">
          <svg width="32" height="24" viewBox="0 0 32 24" className="text-slate-300">
            <line x1="0" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
            <polygon points="32,12 20,4 20,20" fill="currentColor" />
          </svg>
        </div>

        {/* Outputs */}
        <ItemRiskCard
          title="Outputs"
          subtitle="Product / Records"
          items={d.outputs}
          style={sectionStyles.outputs}
          isEditMode={isEditMode}
          isEditing={editingSection === 'Outputs'}
          onEditClick={() => startEditing('Outputs')}
          editFormNode={renderInlineForm('Outputs')}
          onItemClick={(item) => handleItemClick(item, 'Outputs')}
        />
      </div>

      {/* Arrows from bottom: How ↑ | Support ↑ (trapezoid) | KPI ↓ — all vertically aligned to their columns */}
      <div className="hidden md:block relative w-full" style={{ height: '56px' }}>
        {/* Rose (How, col 1 ~17%) and Fuchsia (KPI, col 3 ~83%) — vertical lines */}
        <svg width="100%" height="56" className="absolute inset-0 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="td-arr-rose" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#fb7185" />
            </marker>
            <marker id="td-arr-fuchsia" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#c026d3" />
            </marker>
          </defs>
          {/* How — vertical at col 1 center */}
          <line x1="16.7%" y1="52" x2="16.7%" y2="6" stroke="#fb7185" strokeWidth="2.5" markerEnd="url(#td-arr-rose)" />
          {/* Process → KPI — vertical at col 3 center, pointing down */}
          <line x1="83.3%" y1="6" x2="83.3%" y2="50" stroke="#c026d3" strokeWidth="2.5" markerEnd="url(#td-arr-fuchsia)" />
        </svg>
        {/* Teal trapezoidal arrow for Support Process — vertical at col 2 center (50%) */}
        <div className="absolute inset-0 flex justify-center pointer-events-none">
          <svg width="90" height="56" viewBox="0 0 90 56" xmlns="http://www.w3.org/2000/svg">
            <polygon points="45,0 70,26 58,26 58,56 32,56 32,26 20,26" fill="#2dd4bf" opacity="0.82" />
          </svg>
        </div>
      </div>

      {/* Bottom row: How (left) + Support Process (center) + KPI (right) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ItemRiskCard
          title="How?"
          subtitle="Methods / Procedures / Specifications"
          items={d.howMethods}
          style={sectionStyles.howMethods}
          isEditMode={isEditMode}
          isEditing={editingSection === 'How Methods'}
          onEditClick={() => startEditing('How Methods')}
          editFormNode={renderInlineForm('How Methods')}
          onItemClick={(item) => handleItemClick(item, 'How Methods')}
        />
        <ItemRiskCard
          title="Support Process"
          subtitle=""
          items={d.supportProcess}
          style={sectionStyles.support}
          isEditMode={isEditMode}
          isEditing={editingSection === 'Support Process'}
          onEditClick={() => startEditing('Support Process')}
          editFormNode={renderInlineForm('Support Process')}
          onItemClick={(item) => handleItemClick(item, 'Support Process')}
        />
        {/* KPI — simple list, no risks */}
        <div className={`rounded-xl border ${sectionStyles.kpi.border} ${sectionStyles.kpi.bg} overflow-hidden ${editingSection === 'Key Results (KPI)' ? 'ring-2 ring-orange-300' : ''}`}>
          <div className={`px-4 py-2 ${sectionStyles.kpi.header} font-semibold text-sm flex items-center gap-2`}>
            <BarChart3 size={15} />
            <span>Key Results (KPI)</span>
            {isEditMode && (
              <button onClick={() => startEditing('Key Results (KPI)')} className="ml-auto p-1 rounded hover:bg-white/40 transition" title="Request change for this section">
                <Edit3 size={14} />
              </button>
            )}
          </div>
          <div className="p-4">
            <ul className="space-y-2">
              {d.kpiResults.map((kpi, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-fuchsia-200 text-fuchsia-800 text-[10px] font-bold shrink-0">
                    {i + 1}
                  </span>
                  <span>{kpi}</span>
                </li>
              ))}
            </ul>
          </div>
          {renderInlineForm('Key Results (KPI)')}
        </div>
      </div>

      {/* Revision history note */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Revision History:</span> Rev.01 (2018-04-18) → Rev.08 (2026-01-29). Updated annually.
        Effective Date: {d.effectiveDate}
      </div>

      {/* ─── Request Changes Section ─── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Edit3 size={16} className="text-orange-500" />
              Request Changes
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditMode ? 'Click the pen icon on any section to request a change' : 'Submit a change request for approval by a manager'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editRequests.length > 0 && (
              <button onClick={() => setShowRequests(!showRequests)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition">
                <ClipboardList size={15} /> View Requests ({editRequests.length})
              </button>
            )}
            <button
              onClick={() => { setIsEditMode(!isEditMode); setEditingSection(null); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm ${isEditMode ? 'bg-slate-600 text-white hover:bg-slate-700' : 'bg-orange-500 text-white hover:bg-orange-600'}`}
            >
              <Edit3 size={16} /> {isEditMode ? 'Exit Edit Mode' : 'Request Change'}
            </button>
          </div>
        </div>
        {pendingCount > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <Bell size={14} />
              <span className="font-medium">{pendingCount} pending request(s) awaiting approval</span>
              <button onClick={() => setShowRequests(true)} className="ml-auto text-blue-600 hover:underline font-medium">View All</button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Requests Table ─── */}
      {showRequests && editRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Change Requests</h3>
            <button onClick={() => setShowRequests(false)} className="text-slate-400 hover:text-slate-600">
              <XCircle size={18} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Section</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Requester</th>
                  <th className="px-3 py-2 text-left">Approver</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {editRequests.map((r, idx) => {
                  const isMyApproval = r.status === 'PENDING' && r.approver_id === (user as any)?.id;
                  return (
                    <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${isMyApproval ? 'bg-amber-50/60' : ''}`}>
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.request_type === 'ADD' ? 'bg-green-100 text-green-700' : r.request_type === 'DELETE' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          {r.request_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{r.section || '-'}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">{r.reason}</td>
                      <td className="px-3 py-2 text-slate-600">{r.requester_name}</td>
                      <td className="px-3 py-2 text-slate-600">{r.approver_name}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : r.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isMyApproval && (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleApproveRequest(r.id)}
                              className="p-1 rounded bg-emerald-100 hover:bg-emerald-200" title="Approve">
                              <Check size={13} className="text-emerald-700" />
                            </button>
                            <button onClick={() => { setRejectRequestId(r.id); setRejectReason(''); }}
                              className="p-1 rounded bg-red-100 hover:bg-red-200" title="Reject">
                              <XCircle size={13} className="text-red-700" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Reject Modal ─── */}
      {rejectRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Reject Change Request</h2>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectRequestId(null); setRejectReason(''); }}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleRejectRequest} disabled={!rejectReason.trim()}
                className="px-6 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Risk Assessment Drawer ─── */}
      {selectedTurtleItem && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSelectedTurtleItem(null)} />
          {/* Panel */}
          <div className="relative bg-white w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{selectedTurtleItem.section}</p>
                  <h2 className="text-base font-bold text-slate-800 leading-snug">{selectedTurtleItem.item.text}</h2>
                  {selectedTurtleItem.item.risk && (
                    <div className="flex items-center gap-1.5 text-sm text-amber-700">
                      <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                      <span>{selectedTurtleItem.item.risk}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedTurtleItem(null)}
                  className="shrink-0 p-2 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                  <Search size={12} />
                  Related Risk Assessment Items
                  {riskLoading && <span className="text-slate-400 animate-pulse"> — loading...</span>}
                </p>
                <button
                  onClick={() => { setSelectedTurtleItem(null); navigate('/safety'); }}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                >
                  <ExternalLink size={12} /> Open Risk Register
                </button>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {(() => {
                const related = getRelatedRisks(selectedTurtleItem.item);
                if (riskLoading) {
                  return <div className="text-center py-12 text-slate-400 text-sm">Loading risk data...</div>;
                }
                if (related.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400 text-sm space-y-2">
                      <Search size={32} className="mx-auto opacity-30" />
                      <p>No matching risk assessment items found.</p>
                      <p className="text-xs">Try adding more specific risk data to the Risk Register.</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    {related.map(risk => {
                      const s = riskBadgeStyle(risk.risk_score);
                      return (
                        <div key={risk.id} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider border border-slate-200 px-1.5 py-0.5 rounded bg-white/70">
                                {risk.category_name}
                              </span>
                              <span className="text-[10px] text-slate-400">#{risk.item_no}</span>
                            </div>
                            <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
                              Score {risk.risk_score}
                            </span>
                          </div>
                          <p className={`text-sm font-medium ${s.text} mb-1`}>{risk.risk_opportunity}</p>
                          {risk.impact && (
                            <p className="text-xs text-slate-600 mb-1.5"><span className="font-medium">Impact:</span> {risk.impact}</p>
                          )}
                          {risk.existing_control && (
                            <p className="text-xs text-slate-500"><span className="font-medium">Control:</span> {risk.existing_control}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 pt-2 border-t border-white/60 text-[11px] text-slate-500">
                            <span>Severity <strong className="text-slate-700">{risk.severity}</strong></span>
                            <span>Occurrence <strong className="text-slate-700">{risk.occurrence}</strong></span>
                            <span>Score <strong className={s.text}>{risk.risk_score}</strong></span>
                            {risk.responsibility && <span className="ml-auto">By: <strong className="text-slate-700">{risk.responsibility}</strong></span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'error' ? 'bg-red-600 text-white' : toast.type === 'info' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ──────────────────── Item + Risk Card ──────────────────── */

function ItemRiskCard({
  title,
  subtitle,
  items,
  style,
  isEditMode,
  isEditing,
  onEditClick,
  editFormNode,
  onItemClick,
}: {
  title: string;
  subtitle: string;
  items: TurtleItem[];
  style: { bg: string; border: string; header: string; icon: React.ElementType };
  isEditMode?: boolean;
  isEditing?: boolean;
  onEditClick?: () => void;
  editFormNode?: React.ReactNode;
  onItemClick?: (item: TurtleItem) => void;
}) {
  const Icon = style.icon;
  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} overflow-hidden ${isEditing ? 'ring-2 ring-orange-300' : ''}`}>
      <div className={`px-4 py-2 ${style.header} font-semibold text-sm flex items-center gap-2`}>
        <Icon size={15} />
        <span>{title}</span>
        {subtitle && <span className="font-normal text-[11px] opacity-70 ml-1">({subtitle})</span>}
        {isEditMode && (
          <button onClick={onEditClick} className="ml-auto p-1 rounded hover:bg-white/40 transition" title="Request change for this section">
            <Edit3 size={14} />
          </button>
        )}
      </div>
      <div className="p-3 space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg p-1.5 -mx-1.5 transition-colors ${
              onItemClick ? 'cursor-pointer hover:bg-white/70 hover:shadow-sm' : ''
            }`}
            onClick={onItemClick ? () => onItemClick(item) : undefined}
            title={onItemClick ? 'Click to view related Risk Assessment items' : undefined}
          >
            <div className="flex items-start gap-2 text-slate-700">
              <span className="text-slate-400 mt-0.5 shrink-0 text-xs font-bold">{i + 1}.</span>
              <span className="flex-1">{item.text}</span>
              {onItemClick && item.risk && <Search size={11} className="shrink-0 mt-0.5 text-slate-300" />}
            </div>
            {item.risk && (
              <div className="flex items-start gap-1.5 ml-5 mt-0.5">
                <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                <span className="text-[11px] text-amber-700 leading-tight">{item.risk}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {editFormNode}
    </div>
  );
}
