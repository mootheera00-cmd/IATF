// pages/RiskAssessment.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ShieldAlert, Plus, Search, X, Check, XCircle, Eye, Filter, RotateCcw,
         Edit3, History, Bell, ChevronDown, ChevronRight, Trash2, ArrowDown,
         Layers, BarChart3, AlertTriangle, ClipboardList, Database } from 'lucide-react';
import { riskAssessmentAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

/* ─── Types ─────────────────────────────────────────────────────── */
interface Category { id: number; name: string; sort_order: number; }

interface RiskItem {
  id: number; category_id: number; category_name: string; item_no: number;
  risk_opportunity: string; impact: string; existing_control: string;
  type_risk: number; type_opportunity: number;
  severity: number; occurrence: number; risk_score: number;
  measure_accept: number; measure_procedure: number;
  measure_kpi: number; measure_preventive: number;
  detail: string; responsibility: string; status: string;
  created_at: string; updated_at: string;
}

interface EditRequest {
  id: number; item_id: number | null; request_type: string;
  category_id: number | null; field_changes: string | null;
  reason: string; requester_id: number; requester_name: string;
  approver_id: number; approver_name: string;
  status: string; reject_reason: string | null;
  risk_opportunity?: string; category_name?: string;
  created_at: string; decided_at: string | null;
}

interface EditHistoryEntry {
  id: number; item_id: number; request_id: number;
  editor_name: string; approver_name: string;
  changes: string; edited_at: string;
}

interface Revision {
  id: number; rev_no: string; effective_date: string;
  detail: string; remark: string;
}

interface Manager { id: number; display_name: string; employee_code: string; }

/* ─── Helpers ───────────────────────────────────────────────────── */
const riskColor = (score: number) => {
  if (score >= 20) return 'bg-red-100 text-red-800 border-red-200';
  if (score >= 9) return 'bg-orange-100 text-orange-800 border-orange-200';
  if (score >= 4) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-green-100 text-green-800 border-green-200';
};

const statusBadge = (s: string) => {
  switch (s) {
    case 'APPROVED': return 'bg-emerald-100 text-emerald-700';
    case 'REJECTED': return 'bg-red-100 text-red-700';
    default: return 'bg-amber-100 text-amber-700';
  }
};

/* ─── Main Component ────────────────────────────────────────────── */
export default function RiskAssessment() {
  const { user } = useAuth();
  const isManager = ['MANAGER', 'QMR', 'ADMIN'].includes(String(user?.role).toUpperCase());
  const isAdmin = String(user?.role).toUpperCase() === 'ADMIN';

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<RiskItem[]>([]);
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<'register' | 'requests' | 'revisions'>('register');
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Modals
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditRequest, setShowEditRequest] = useState(false);
  const [showViewItem, setShowViewItem] = useState<RiskItem | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddRevision, setShowAddRevision] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Delete confirmation modal
  const [deleteConfirm, setDeleteConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Form for adding item
  const emptyItemForm = {
    category_id: '', risk_opportunity: '', impact: '', existing_control: '',
    type_risk: true, type_opportunity: false,
    severity: '1', occurrence: '1',
    measure_accept: false, measure_procedure: false, measure_kpi: false, measure_preventive: false,
    detail: '', responsibility: '', insert_after: null as number | null,
  };
  const [itemForm, setItemForm] = useState(emptyItemForm);

  // Form for edit request
  const emptyEditForm = {
    item_id: null as number | null,
    request_type: 'EDIT' as string,
    category_id: null as number | null,
    reason: '', approver_id: '', approver_name: '',
    // Field changes
    risk_opportunity: '', impact: '', existing_control: '',
    type_risk: true, type_opportunity: false,
    severity: '1', occurrence: '1',
    measure_accept: false, measure_procedure: false, measure_kpi: false, measure_preventive: false,
    detail: '', responsibility: '',
    // For ADD_CATEGORY
    new_category_name: '',
  };
  const [editForm, setEditForm] = useState(emptyEditForm);

  // Category form
  const [catName, setCatName] = useState('');

  // Revision form
  const emptyRevForm = { rev_no: '', effective_date: '', detail: '', remark: '' };
  const [revForm, setRevForm] = useState(emptyRevForm);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // View item detail
  const [viewEditHistory, setViewEditHistory] = useState<EditHistoryEntry[]>([]);

  /* ─── Data fetching ───────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [catRes, itemRes, reqRes, revRes, mgrRes] = await Promise.allSettled([
        riskAssessmentAPI.getCategories(),
        riskAssessmentAPI.getItems(),
        riskAssessmentAPI.getEditRequests(),
        riskAssessmentAPI.getRevisions(),
        riskAssessmentAPI.getManagers(),
      ]);
      const cats = catRes.status === 'fulfilled' ? catRes.value.data.categories || [] : [];
      const itms = itemRes.status === 'fulfilled' ? itemRes.value.data.items || [] : [];
      const reqs = reqRes.status === 'fulfilled' ? reqRes.value.data.requests || [] : [];
      const revs = revRes.status === 'fulfilled' ? revRes.value.data.revisions || [] : [];
      const mgrs = mgrRes.status === 'fulfilled' ? mgrRes.value.data.managers || [] : [];
      setCategories(cats);
      setItems(itms);
      setEditRequests(reqs);
      setRevisions(revs);
      setManagers(mgrs);
      // Expand all categories initially
      const allIds = new Set<number>(cats.map((c: Category) => c.id));
      setExpandedCats(allIds);
      // Log any failures for debugging
      [catRes, itemRes, reqRes, revRes, mgrRes].forEach((r, i) => {
        if (r.status === 'rejected') console.error(`[RiskAssessment] API call ${i} failed:`, r.reason);
      });
    } catch (e) { console.error('[RiskAssessment] fetchAll error:', e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ─── Derived data ────────────────────────────────────────────── */
  const filteredItems = useMemo(() => {
    return items.filter(i => {
      if (filterCategory && i.category_id !== Number(filterCategory)) return false;
      if (search) {
        const q = search.toLowerCase();
        const fields = [i.risk_opportunity, i.impact, i.existing_control, i.detail, i.responsibility, i.category_name];
        if (!fields.some(f => (f || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [items, filterCategory, search]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<number, RiskItem[]>();
    for (const c of categories) map.set(c.id, []);
    for (const i of filteredItems) {
      const arr = map.get(i.category_id);
      if (arr) arr.push(i);
      else map.set(i.category_id, [i]);
    }
    return map;
  }, [categories, filteredItems]);

  const pendingForMe = useMemo(() =>
    editRequests.filter(r => r.status === 'PENDING' && r.approver_id === (user as any)?.id),
  [editRequests, user]);

  const hasActiveFilters = search || filterCategory;

  /* ─── Handlers ────────────────────────────────────────────────── */
  const toggleCat = (id: number) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Seed data
  const handleSeed = async () => {
    if (!confirm('Seed initial risk assessment data from Excel form? This only works if no items exist yet.')) return;
    try {
      const { data } = await riskAssessmentAPI.seed();
      showToast(data.message || 'Data seeded successfully');
      fetchAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to seed data', 'error');
    }
  };

  // Add item directly (admin/manager)
  const handleAddItem = async () => {
    setFormError('');
    if (!itemForm.category_id || !itemForm.risk_opportunity.trim()) {
      setFormError('Category and Risk/Opportunity description are required'); return;
    }
    try {
      setSaving(true);
      await riskAssessmentAPI.createItem({
        category_id: Number(itemForm.category_id),
        risk_opportunity: itemForm.risk_opportunity,
        impact: itemForm.impact,
        existing_control: itemForm.existing_control,
        type_risk: itemForm.type_risk,
        type_opportunity: itemForm.type_opportunity,
        severity: Number(itemForm.severity),
        occurrence: Number(itemForm.occurrence),
        measure_accept: itemForm.measure_accept,
        measure_procedure: itemForm.measure_procedure,
        measure_kpi: itemForm.measure_kpi,
        measure_preventive: itemForm.measure_preventive,
        detail: itemForm.detail,
        responsibility: itemForm.responsibility,
        insert_after: itemForm.insert_after,
      });
      setShowAddItem(false);
      setItemForm(emptyItemForm);
      showToast('Risk item added');
      fetchAll();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || 'Failed to add item');
    } finally { setSaving(false); }
  };

  // Submit edit request
  const handleSubmitEditRequest = async () => {
    setFormError('');
    if (!editForm.reason.trim() || !editForm.approver_id) {
      setFormError('Reason and approver are required'); return;
    }
    const field_changes: Record<string, any> = {};
    if (editForm.request_type === 'EDIT' || editForm.request_type === 'ADD') {
      field_changes.risk_opportunity = editForm.risk_opportunity;
      field_changes.impact = editForm.impact;
      field_changes.existing_control = editForm.existing_control;
      field_changes.type_risk = editForm.type_risk ? 1 : 0;
      field_changes.type_opportunity = editForm.type_opportunity ? 1 : 0;
      field_changes.severity = Number(editForm.severity);
      field_changes.occurrence = Number(editForm.occurrence);
      field_changes.measure_accept = editForm.measure_accept ? 1 : 0;
      field_changes.measure_procedure = editForm.measure_procedure ? 1 : 0;
      field_changes.measure_kpi = editForm.measure_kpi ? 1 : 0;
      field_changes.measure_preventive = editForm.measure_preventive ? 1 : 0;
      field_changes.detail = editForm.detail;
      field_changes.responsibility = editForm.responsibility;
      if (editForm.request_type === 'ADD') field_changes.category_id = editForm.category_id;
    } else if (editForm.request_type === 'ADD_CATEGORY') {
      field_changes.name = editForm.new_category_name;
    }

    try {
      setSaving(true);
      await riskAssessmentAPI.createEditRequest({
        item_id: editForm.item_id,
        request_type: editForm.request_type,
        category_id: editForm.category_id,
        field_changes,
        reason: editForm.reason,
        approver_id: Number(editForm.approver_id),
        approver_name: editForm.approver_name,
      });
      setShowEditRequest(false);
      setEditForm(emptyEditForm);
      showToast('Edit request submitted for approval');
      fetchAll();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || 'Failed to submit request');
    } finally { setSaving(false); }
  };

  // Approve edit request
  const handleApproveRequest = async (id: number) => {
    if (!confirm('Approve this edit request?')) return;
    try {
      const { data } = await riskAssessmentAPI.approveEditRequest(id);
      showToast(data.message || 'Request approved');
      fetchAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to approve', 'error');
    }
  };

  // Reject edit request
  const handleRejectRequest = async () => {
    if (!rejectRequestId || !rejectReason.trim()) return;
    try {
      const { data } = await riskAssessmentAPI.rejectEditRequest(rejectRequestId, rejectReason.trim());
      showToast(data.message || 'Request rejected', 'info');
      setRejectRequestId(null);
      setRejectReason('');
      fetchAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to reject', 'error');
    }
  };

  // Delete item (admin)
  const handleDeleteItem = (id: number) => {
    setDeleteConfirm({
      message: 'Remove this risk item?',
      onConfirm: async () => {
        setDeleteConfirm(null);
        try {
          await riskAssessmentAPI.deleteItem(id);
          showToast('Item removed');
          fetchAll();
        } catch (e: any) {
          showToast(e?.response?.data?.error || 'Failed to delete', 'error');
        }
      },
    });
  };

  // Add category
  const handleAddCategory = async () => {
    if (!catName.trim()) return;
    try {
      setSaving(true);
      await riskAssessmentAPI.createCategory({ name: catName.trim() });
      setCatName('');
      setShowAddCategory(false);
      showToast('Category added');
      fetchAll();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to add category', 'error');
    } finally { setSaving(false); }
  };

  // Add revision
  const handleAddRevision = async () => {
    setFormError('');
    if (!revForm.rev_no.trim() || !revForm.effective_date || !revForm.detail.trim()) {
      setFormError('Revision number, date, and detail are required'); return;
    }
    try {
      setSaving(true);
      await riskAssessmentAPI.createRevision(revForm);
      setRevForm(emptyRevForm);
      setShowAddRevision(false);
      showToast('Revision added');
      fetchAll();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || 'Failed');
    } finally { setSaving(false); }
  };

  // Open view detail
  const openItemDetail = async (item: RiskItem) => {
    setShowViewItem(item);
    setViewEditHistory([]);
    try {
      const { data } = await riskAssessmentAPI.getItem(item.id);
      if (data.item) setShowViewItem(data.item);
      setViewEditHistory(data.editHistory || []);
    } catch { /* */ }
  };

  // Open edit request for an item
  const openEditRequestForItem = (item: RiskItem) => {
    setEditForm({
      ...emptyEditForm,
      item_id: item.id,
      request_type: 'EDIT',
      category_id: item.category_id,
      risk_opportunity: item.risk_opportunity,
      impact: item.impact,
      existing_control: item.existing_control,
      type_risk: !!item.type_risk,
      type_opportunity: !!item.type_opportunity,
      severity: String(item.severity),
      occurrence: String(item.occurrence),
      measure_accept: !!item.measure_accept,
      measure_procedure: !!item.measure_procedure,
      measure_kpi: !!item.measure_kpi,
      measure_preventive: !!item.measure_preventive,
      detail: item.detail,
      responsibility: item.responsibility,
    });
    setFormError('');
    setShowEditRequest(true);
    setShowViewItem(null);
  };

  // Open add request (for non-managers who want to add an item via approval)
  const openAddRequest = (catId?: number) => {
    setEditForm({
      ...emptyEditForm,
      request_type: 'ADD',
      category_id: catId || null,
    });
    setFormError('');
    setShowEditRequest(true);
  };

  // Insert row after
  const openInsertAfter = (item: RiskItem) => {
    setItemForm({
      ...emptyItemForm,
      category_id: String(item.category_id),
      insert_after: item.item_no,
    });
    setFormError('');
    setShowAddItem(true);
  };

  /* ─── Render ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' :
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
        }`}>
          {toast.type === 'success' ? <Check size={16} /> : toast.type === 'error' ? <XCircle size={16} /> : <Bell size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert size={20} className="text-indigo-500" />
            Risk Assessment
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            F-01-DOC-002 Risk Assessment FORM_APTC — IATF 16949:2016
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pendingForMe.length > 0 && (
            <button onClick={() => setActiveTab('requests')}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition shadow-sm">
              <Bell size={14} /> {pendingForMe.length} Pending Review
            </button>
          )}
          {isAdmin && items.length === 0 && (
            <button onClick={handleSeed}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition shadow-sm">
              <Database size={14} /> Seed from Excel
            </button>
          )}
          {isManager ? (
            <button onClick={() => { setItemForm(emptyItemForm); setFormError(''); setShowAddItem(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm">
              <Plus size={16} /> Add Risk Item
            </button>
          ) : (
            <button onClick={() => openAddRequest()}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition shadow-sm">
              <Edit3 size={16} /> Request Add Item
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'register' as const, label: 'Risk Register', icon: <Layers size={14} /> },
          { key: 'requests' as const, label: `Edit Requests${pendingForMe.length ? ` (${pendingForMe.length})` : ''}`, icon: <ClipboardList size={14} /> },
          { key: 'revisions' as const, label: 'Revision History', icon: <History size={14} /> },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === tab.key
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Risk Register ═══ */}
      {activeTab === 'register' && (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={16} className="text-slate-400 shrink-0" />
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white min-w-[180px]">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="relative ml-auto">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search risks..." className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 w-52" />
              </div>
              {isManager && (
                <button onClick={() => setShowAddCategory(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition border border-indigo-200">
                  <Plus size={12} /> Category
                </button>
              )}
              {hasActiveFilters && (
                <button onClick={() => { setSearch(''); setFilterCategory(''); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                  <RotateCcw size={14} /> Clear
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <div className="text-xs text-slate-400 mt-2">
                Showing {filteredItems.length} of {items.length} risk items
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
              <div className="text-xs text-slate-500 mb-0.5">Total Items</div>
              <div className="text-xl font-bold text-slate-800">{items.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
              <div className="text-xs text-slate-500 mb-0.5">Categories</div>
              <div className="text-xl font-bold text-slate-800">{categories.length}</div>
            </div>
            <div className="bg-white rounded-xl border border-red-200 shadow-sm p-3">
              <div className="text-xs text-red-500 mb-0.5">High Risk (≥10)</div>
              <div className="text-xl font-bold text-red-700">
                {items.filter(i => i.severity * i.occurrence >= 10).length}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-3">
              <div className="text-xs text-amber-500 mb-0.5">Pending Requests</div>
              <div className="text-xl font-bold text-amber-700">
                {editRequests.filter(r => r.status === 'PENDING').length}
              </div>
            </div>
          </div>

          {/* Risk tables by category */}
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center text-slate-400">
              Loading risk assessment data...
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center gap-3">
              <ShieldAlert size={36} className="text-slate-300" />
              <h2 className="text-lg font-bold text-slate-600">No Risk Items Yet</h2>
              <p className="text-slate-400 text-sm max-w-md">
                {isAdmin
                  ? 'Click "Seed from Excel" to import initial data from F-01-DOC-002, or add items manually.'
                  : 'Risk items will appear once they are added by a manager.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => {
                const catItems = itemsByCategory.get(cat.id) || [];
                if (filterCategory && Number(filterCategory) !== cat.id) return null;
                if (catItems.length === 0 && !filterCategory) return null;
                const expanded = expandedCats.has(cat.id);
                return (
                  <div key={cat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Category header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 border-b border-slate-200 cursor-pointer select-none"
                         onClick={() => toggleCat(cat.id)}>
                      <div className="flex items-center gap-2">
                        {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        <span className="font-semibold text-sm text-slate-700">{cat.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{catItems.length}</span>
                      </div>
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        {isManager && (
                          <button onClick={() => { setItemForm({ ...emptyItemForm, category_id: String(cat.id) }); setFormError(''); setShowAddItem(true); }}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Add row to this category">
                            <Plus size={12} /> Add Row
                          </button>
                        )}
                        {!isManager && (
                          <button onClick={() => openAddRequest(cat.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition"
                            title="Request to add a row">
                            <Edit3 size={12} /> Request Add
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Table */}
                    {expanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60">
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[4%]">No.</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[16%]">Risk & Opportunity</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[12%]">Impact</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[12%]">Existing Control</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[4%]" title="Risk Type">R</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[4%]" title="Opportunity Type">O</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[4%]" title="Severity">Sev</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[4%]" title="Occurrence">Occ</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[5%]" title="Risk Score = Severity × Occurrence">Score</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[15%]">Measures</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[12%]">Detail</th>
                              <th className="px-2 py-2 text-left font-semibold text-slate-600 w-[8%]">Responsibility</th>
                              <th className="px-2 py-2 text-center font-semibold text-slate-600 w-[6%]">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catItems.length === 0 ? (
                              <tr><td colSpan={13} className="text-center py-6 text-slate-400">No items in this category</td></tr>
                            ) : catItems.map(item => {
                              const score = item.severity * item.occurrence;
                              return (
                              <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition">
                                <td className="px-2 py-2 font-mono text-center">{item.item_no}</td>
                                <td className="px-2 py-2">{item.risk_opportunity}</td>
                                <td className="px-2 py-2 text-slate-600">{item.impact}</td>
                                <td className="px-2 py-2 text-slate-600">{item.existing_control}</td>
                                <td className="px-2 py-2 text-center">{item.type_risk ? <span className="text-red-500 font-bold">✕</span> : '—'}</td>
                                <td className="px-2 py-2 text-center">{item.type_opportunity ? <span className="text-emerald-500 font-bold">✕</span> : '—'}</td>
                                <td className="px-2 py-2 text-center font-medium">{item.severity}</td>
                                <td className="px-2 py-2 text-center font-medium">{item.occurrence}</td>
                                <td className="px-2 py-2 text-center">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold border ${riskColor(score)}`}>
                                    {score}
                                  </span>
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {item.measure_accept ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">Accept (1-3)</span> : null}
                                    {item.measure_procedure ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Procedure (4-8)</span> : null}
                                    {item.measure_kpi ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">KPI (9-16)</span> : null}
                                    {item.measure_preventive ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Preventive (20-25)</span> : null}
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-slate-600 whitespace-pre-line text-[11px]">{item.detail}</td>
                                <td className="px-2 py-2 text-slate-600">{item.responsibility}</td>
                                <td className="px-2 py-2 text-center">
                                  <div className="flex items-center justify-center gap-0.5">
                                    <button onClick={() => openItemDetail(item)} className="p-1 rounded hover:bg-slate-200" title="View">
                                      <Eye size={13} className="text-slate-500" />
                                    </button>
                                    <button onClick={() => openEditRequestForItem(item)} className="p-1 rounded hover:bg-slate-200" title="Request Edit">
                                      <Edit3 size={13} className="text-orange-500" />
                                    </button>
                                    {isManager && (
                                      <button onClick={() => openInsertAfter(item)} className="p-1 rounded hover:bg-slate-200" title="Insert row below">
                                        <ArrowDown size={13} className="text-blue-500" />
                                      </button>
                                    )}
                                    {isAdmin && (
                                      <button onClick={() => handleDeleteItem(item.id)} className="p-1 rounded hover:bg-amber-100" title="Delete">
                                        <Trash2 size={13} className="text-amber-700" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Request Change section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Edit3 size={16} className="text-orange-500" />
                  Request Changes
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Submit a change request for review and approval by a manager
                </p>
              </div>
              <button
                onClick={() => { setEditForm({ ...emptyEditForm, request_type: 'EDIT' }); setFormError(''); setShowEditRequest(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition shadow-sm"
              >
                <Edit3 size={16} /> Request Change
              </button>
            </div>
            {/* Recent pending requests summary */}
            {editRequests.filter(r => r.status === 'PENDING').length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-amber-600">
                  <Bell size={14} />
                  <span className="font-medium">
                    {editRequests.filter(r => r.status === 'PENDING').length} pending request{editRequests.filter(r => r.status === 'PENDING').length !== 1 ? 's' : ''} awaiting approval
                  </span>
                  <button onClick={() => setActiveTab('requests')} className="ml-auto text-blue-600 hover:underline font-medium">
                    View all
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ TAB: Edit Requests ═══ */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[5%]">#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">Type</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[15%]">Item/Category</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[20%]">Reason</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">Requester</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">Approver</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">Status</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-[10%]">Date</th>
                <th className="px-3 py-2.5 text-center font-semibold text-slate-600 w-[10%]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {editRequests.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16 text-slate-400">
                  <ClipboardList size={32} className="mx-auto mb-2 opacity-40" />
                  No edit requests yet
                </td></tr>
              ) : editRequests.map((r, idx) => {
                const isMyApproval = r.status === 'PENDING' && r.approver_id === (user as any)?.id;
                return (
                  <tr key={r.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${isMyApproval ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        r.request_type === 'EDIT' ? 'bg-blue-100 text-blue-700' :
                        r.request_type === 'ADD' ? 'bg-emerald-100 text-emerald-700' :
                        r.request_type === 'DELETE' ? 'bg-red-100 text-red-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>{r.request_type}</span>
                    </td>
                    <td className="px-3 py-2 truncate" title={r.risk_opportunity || r.category_name || ''}>
                      {r.risk_opportunity || r.category_name || '—'}
                    </td>
                    <td className="px-3 py-2">{r.reason}</td>
                    <td className="px-3 py-2">{r.requester_name}</td>
                    <td className="px-3 py-2">{r.approver_name}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                      {r.reject_reason && (
                        <div className="text-[10px] text-red-500 mt-0.5" title={r.reject_reason}>
                          Reason: {r.reject_reason.substring(0, 40)}...
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
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
      )}

      {/* ═══ TAB: Revision History ═══ */}
      {activeTab === 'revisions' && (
        <div className="space-y-3">
          {isManager && (
            <div className="flex justify-end">
              <button onClick={() => { setRevForm(emptyRevForm); setFormError(''); setShowAddRevision(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm">
                <Plus size={16} /> Add Revision
              </button>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[8%]">No.</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[15%]">Revise No.</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[15%]">Effective Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[42%]">Detail</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600 w-[20%]">Remark</th>
                </tr>
              </thead>
              <tbody>
                {revisions.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">No revision history</td></tr>
                ) : [...revisions].reverse().map((r, idx) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{r.rev_no}</td>
                    <td className="px-4 py-2.5">{r.effective_date}</td>
                    <td className="px-4 py-2.5">{r.detail}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.remark || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Add Item ═══ */}
      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">
                {itemForm.insert_after != null ? `Insert Risk Item (after #${itemForm.insert_after})` : 'Add Risk Item'}
              </h2>
              <button onClick={() => setShowAddItem(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category <span className="text-red-500">*</span></label>
                <select value={itemForm.category_id} onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">Select category...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Risk / Opportunity <span className="text-red-500">*</span></label>
                <textarea rows={2} value={itemForm.risk_opportunity}
                  onChange={e => setItemForm(f => ({ ...f, risk_opportunity: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Impact</label>
                  <textarea rows={2} value={itemForm.impact}
                    onChange={e => setItemForm(f => ({ ...f, impact: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Existing Process Control</label>
                  <textarea rows={2} value={itemForm.existing_control}
                    onChange={e => setItemForm(f => ({ ...f, existing_control: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.type_risk}
                      onChange={e => setItemForm(f => ({ ...f, type_risk: e.target.checked }))}
                      className="rounded border-slate-300" />
                    Risk
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.type_opportunity}
                      onChange={e => setItemForm(f => ({ ...f, type_opportunity: e.target.checked }))}
                      className="rounded border-slate-300" />
                    Opportunity
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Severity (1-5)</label>
                  <input type="number" min={1} max={5} value={itemForm.severity}
                    onChange={e => setItemForm(f => ({ ...f, severity: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Occurrence (1-5)</label>
                  <input type="number" min={1} max={5} value={itemForm.occurrence}
                    onChange={e => setItemForm(f => ({ ...f, occurrence: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <label className="block text-sm font-medium text-slate-700 mb-2">Additional Measures</label>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.measure_accept}
                      onChange={e => setItemForm(f => ({ ...f, measure_accept: e.target.checked }))}
                      className="rounded border-slate-300" />
                    Accept Risk (1-3)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.measure_procedure}
                      onChange={e => setItemForm(f => ({ ...f, measure_procedure: e.target.checked }))}
                      className="rounded border-slate-300" />
                    Procedure/WI (4-8)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.measure_kpi}
                      onChange={e => setItemForm(f => ({ ...f, measure_kpi: e.target.checked }))}
                      className="rounded border-slate-300" />
                    KPI's (9-16)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={itemForm.measure_preventive}
                      onChange={e => setItemForm(f => ({ ...f, measure_preventive: e.target.checked }))}
                      className="rounded border-slate-300" />
                    Preventive Action (20-25)
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Detail / Document Reference</label>
                  <textarea rows={2} value={itemForm.detail}
                    onChange={e => setItemForm(f => ({ ...f, detail: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Responsibility</label>
                  <input value={itemForm.responsibility}
                    onChange={e => setItemForm(f => ({ ...f, responsibility: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setShowAddItem(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
                <button onClick={handleAddItem} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {saving ? 'Saving...' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Edit Request ═══ */}
      {showEditRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">
                {editForm.request_type === 'EDIT' ? 'Request Edit' :
                 editForm.request_type === 'ADD' ? 'Request Add Item' :
                 editForm.request_type === 'DELETE' ? 'Request Deletion' :
                 'Request New Category'}
              </h2>
              <button onClick={() => setShowEditRequest(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{formError}</div>}

              {/* Request type selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Request Type</label>
                <select value={editForm.request_type}
                  onChange={e => setEditForm(f => ({ ...f, request_type: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="EDIT">Edit Existing Item</option>
                  <option value="ADD">Add New Item</option>
                  <option value="DELETE">Delete Item</option>
                  <option value="ADD_CATEGORY">Add New Category</option>
                </select>
              </div>

              {editForm.request_type === 'ADD_CATEGORY' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category Name <span className="text-red-500">*</span></label>
                  <input value={editForm.new_category_name}
                    onChange={e => setEditForm(f => ({ ...f, new_category_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              ) : (
                <>
                  {editForm.request_type === 'ADD' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Category <span className="text-red-500">*</span></label>
                      <select value={editForm.category_id || ''}
                        onChange={e => setEditForm(f => ({ ...f, category_id: Number(e.target.value) || null }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                        <option value="">Select category...</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {(editForm.request_type === 'EDIT' || editForm.request_type === 'ADD') && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Risk / Opportunity</label>
                        <textarea rows={2} value={editForm.risk_opportunity}
                          onChange={e => setEditForm(f => ({ ...f, risk_opportunity: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Impact</label>
                          <textarea rows={2} value={editForm.impact}
                            onChange={e => setEditForm(f => ({ ...f, impact: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Existing Control</label>
                          <textarea rows={2} value={editForm.existing_control}
                            onChange={e => setEditForm(f => ({ ...f, existing_control: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.type_risk}
                              onChange={e => setEditForm(f => ({ ...f, type_risk: e.target.checked }))} className="rounded border-slate-300" />
                            Risk
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.type_opportunity}
                              onChange={e => setEditForm(f => ({ ...f, type_opportunity: e.target.checked }))} className="rounded border-slate-300" />
                            Opportunity
                          </label>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Severity</label>
                          <input type="number" min={1} max={5} value={editForm.severity}
                            onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Occurrence</label>
                          <input type="number" min={1} max={5} value={editForm.occurrence}
                            onChange={e => setEditForm(f => ({ ...f, occurrence: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Additional Measures</label>
                        <div className="flex flex-wrap gap-3">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.measure_accept}
                              onChange={e => setEditForm(f => ({ ...f, measure_accept: e.target.checked }))} className="rounded border-slate-300" />
                            Accept Risk (1-3)
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.measure_procedure}
                              onChange={e => setEditForm(f => ({ ...f, measure_procedure: e.target.checked }))} className="rounded border-slate-300" />
                            Procedure/WI (4-8)
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.measure_kpi}
                              onChange={e => setEditForm(f => ({ ...f, measure_kpi: e.target.checked }))} className="rounded border-slate-300" />
                            KPI's (9-16)
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={editForm.measure_preventive}
                              onChange={e => setEditForm(f => ({ ...f, measure_preventive: e.target.checked }))} className="rounded border-slate-300" />
                            Preventive Action (20-25)
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Detail</label>
                          <textarea rows={2} value={editForm.detail}
                            onChange={e => setEditForm(f => ({ ...f, detail: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Responsibility</label>
                          <input value={editForm.responsibility}
                            onChange={e => setEditForm(f => ({ ...f, responsibility: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Reason & approver */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800">Approval Required</p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reason for change <span className="text-red-500">*</span></label>
                  <textarea rows={2} value={editForm.reason}
                    onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="Explain why this change is needed..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Approver (Manager) <span className="text-red-500">*</span></label>
                  <select value={editForm.approver_id}
                    onChange={e => {
                      const mgr = managers.find(m => m.id === Number(e.target.value));
                      setEditForm(f => ({ ...f, approver_id: e.target.value, approver_name: mgr?.display_name || '' }));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300">
                    <option value="">Select approver...</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>{m.display_name} ({m.employee_code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setShowEditRequest(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
                <button onClick={handleSubmitEditRequest} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50 transition">
                  {saving ? 'Submitting...' : 'Submit for Approval'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: View Item Detail ═══ */}
      {showViewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">{showViewItem.category_name} — #{showViewItem.item_no}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => openEditRequestForItem(showViewItem)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition">
                  <Edit3 size={14} /> Request Edit
                </button>
                <button onClick={() => setShowViewItem(null)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm">
              <div>
                <span className="text-slate-500 block mb-1">Risk / Opportunity</span>
                <p className="bg-slate-50 rounded-lg p-3 font-medium">{showViewItem.risk_opportunity}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block mb-1">Impact</span>
                  <p className="bg-slate-50 rounded-lg p-3">{showViewItem.impact || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Existing Control</span>
                  <p className="bg-slate-50 rounded-lg p-3">{showViewItem.existing_control || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <span className="text-slate-500 block">Type</span>
                  <span className="font-medium">
                    {showViewItem.type_risk ? 'Risk' : ''}{showViewItem.type_risk && showViewItem.type_opportunity ? ' / ' : ''}{showViewItem.type_opportunity ? 'Opportunity' : ''}
                    {!showViewItem.type_risk && !showViewItem.type_opportunity ? '—' : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Severity</span>
                  <span className="font-medium">{showViewItem.severity}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Occurrence</span>
                  <span className="font-medium">{showViewItem.occurrence}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Risk Score</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${riskColor(showViewItem.severity * showViewItem.occurrence)}`}>
                    {showViewItem.severity * showViewItem.occurrence}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Additional Measures</span>
                <div className="flex flex-wrap gap-2">
                  {showViewItem.measure_accept ? <span className="px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">Accept Risk (1-3)</span> : null}
                  {showViewItem.measure_procedure ? <span className="px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">Procedure/WI/Contingency (4-8)</span> : null}
                  {showViewItem.measure_kpi ? <span className="px-2 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">KPI's (9-16)</span> : null}
                  {showViewItem.measure_preventive ? <span className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">Preventive Action (20-25)</span> : null}
                  {!showViewItem.measure_accept && !showViewItem.measure_procedure && !showViewItem.measure_kpi && !showViewItem.measure_preventive && <span className="text-slate-400">None specified</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block mb-1">Detail / Document Reference</span>
                  <p className="bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{showViewItem.detail || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Responsibility</span>
                  <p className="bg-slate-50 rounded-lg p-3">{showViewItem.responsibility || '—'}</p>
                </div>
              </div>

              {/* Edit History */}
              {viewEditHistory.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <span className="text-slate-600 font-semibold flex items-center gap-1.5 mb-2"><History size={14} /> Edit History ({viewEditHistory.length})</span>
                  <div className="space-y-2">
                    {viewEditHistory.map(h => (
                      <div key={h.id} className="bg-slate-50 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-700">Edited by: {h.editor_name}</span>
                          <span className="text-slate-400">{new Date(h.edited_at).toLocaleString()}</span>
                        </div>
                        <div className="text-slate-500">Approved by: {h.approver_name}</div>
                        {h.changes && <div className="text-slate-500 mt-1">Fields changed: {h.changes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Add Category ═══ */}
      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">Add Category</h2>
              <button onClick={() => setShowAddCategory(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category Name <span className="text-red-500">*</span></label>
                <input value={catName} onChange={e => setCatName(e.target.value)}
                  placeholder="e.g., External Factors"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowAddCategory(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
                <button onClick={handleAddCategory} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
                  {saving ? 'Adding...' : 'Add Category'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Add Revision ═══ */}
      {showAddRevision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">Add Revision History</h2>
              <button onClick={() => setShowAddRevision(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Revise No. <span className="text-red-500">*</span></label>
                  <input value={revForm.rev_no} onChange={e => setRevForm(f => ({ ...f, rev_no: e.target.value }))}
                    placeholder="e.g., Rev.10"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Effective Date <span className="text-red-500">*</span></label>
                  <input type="date" value={revForm.effective_date} onChange={e => setRevForm(f => ({ ...f, effective_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Detail <span className="text-red-500">*</span></label>
                <textarea rows={2} value={revForm.detail} onChange={e => setRevForm(f => ({ ...f, detail: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Remark</label>
                <input value={revForm.remark} onChange={e => setRevForm(f => ({ ...f, remark: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowAddRevision(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
                <button onClick={handleAddRevision} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {saving ? 'Adding...' : 'Add Revision'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Reject Request ═══ */}
      {rejectRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">Reject Edit Request</h2>
              <button onClick={() => setRejectRequestId(null)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="Explain why this request is being rejected..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setRejectRequestId(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
                <button onClick={handleRejectRequest} disabled={!rejectReason.trim()}
                  className="px-6 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition">
                  Reject Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 pt-6 pb-2 flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">Confirm Delete</h3>
                <p className="text-sm text-slate-600 mt-1">{deleteConfirm.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition">
                Cancel
              </button>
              <button onClick={deleteConfirm.onConfirm}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
