import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Plus, Search, X, Check, XCircle, ChevronDown, Eye, Filter, RotateCcw, Edit3, Paperclip, Download, Trash2, History, Bell } from 'lucide-react';
import { incidentAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';

interface IncidentRecord {
  id: number;
  record_no: string;
  machine_name: string;
  incident_details: string;
  incident_date: string;
  discoverer: string;
  discovery_date: string;
  resolution: string;
  reporter_id: number;
  reporter_name: string;
  approver_id: number;
  approver_name: string;
  status: string;
  reject_reason?: string;
  edit_count: number;
  created_at: string;
}

interface Attachment {
  id: number;
  record_id: number;
  filename: string;
  original_name: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at: string;
}

interface EditHistoryEntry {
  id: number;
  record_id: number;
  editor_name: string;
  approver_name: string;
  changes: string;
  edited_at: string;
}

interface MachineOption { id: number; name: string; }
interface Manager { id: number; display_name: string; employee_code: string; }

const statusBadge = (s: string) => {
  switch (s) {
    case 'APPROVED': return 'bg-emerald-100 text-emerald-700';
    case 'REJECTED': return 'bg-red-100 text-red-700';
    default:         return 'bg-amber-100 text-amber-700';
  }
};

export default function AbnormalSituations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManager = ['MANAGER', 'QMR', 'ADMIN'].includes(String(user?.role).toUpperCase());
  const isAdmin = String(user?.role).toUpperCase() === 'ADMIN';

  // toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewRecord, setViewRecord] = useState<IncidentRecord | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Delete confirmation modal
  const [deleteConfirm, setDeleteConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editRecord, setEditRecord] = useState<IncidentRecord | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editApproverName, setEditApproverName] = useState('');

  // attachments & edit history for detail view
  const [viewAttachments, setViewAttachments] = useState<Attachment[]>([]);
  const [viewEditHistory, setViewEditHistory] = useState<EditHistoryEntry[]>([]);

  // file upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // filters
  const [filterMachine, setFilterMachine] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDiscoverer, setFilterDiscoverer] = useState('');

  // machine combobox
  const [machineOptions, setMachineOptions] = useState<MachineOption[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);

  // form state
  const emptyForm = {
    machine_name: '', incident_details: '', incident_date: '',
    discoverer: '', discovery_date: '', resolution: '',
    approver_id: '', approver_name: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // combobox state
  const [machineInput, setMachineInput] = useState('');
  const [machineOpen, setMachineOpen] = useState(false);
  const machineRef = useRef<HTMLDivElement>(null);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await incidentAPI.list();
      setRecords(data.records || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [mRes, mgRes] = await Promise.all([
        incidentAPI.getMachineOptions(),
        incidentAPI.getManagers(),
      ]);
      setMachineOptions(mRes.data.options || []);
      setManagers(mgRes.data.managers || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  // click-outside for combobox
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (machineRef.current && !machineRef.current.contains(e.target as Node)) setMachineOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Derive unique years and discoverers from records for filter dropdowns
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    records.forEach(r => {
      const y = r.incident_date?.substring(0, 4);
      if (y) years.add(y);
    });
    return Array.from(years).sort().reverse();
  }, [records]);

  const availableDiscoverers = useMemo(() => {
    const names = new Set<string>();
    records.forEach(r => { if (r.discoverer) names.add(r.discoverer); });
    return Array.from(names).sort();
  }, [records]);

  // Client-side filtering
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (filterMachine && r.machine_name !== filterMachine) return false;
      if (filterYear && !r.incident_date?.startsWith(filterYear)) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterDiscoverer && r.discoverer !== filterDiscoverer) return false;
      if (search) {
        const q = search.toLowerCase();
        const fields = [r.record_no, r.machine_name, r.incident_details, r.incident_date,
          r.discoverer, r.discovery_date, r.resolution, r.reporter_name, r.approver_name, r.status];
        if (!fields.some(f => (f || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [records, filterMachine, filterYear, filterStatus, filterDiscoverer, search]);

  const hasActiveFilters = filterMachine || filterYear || filterStatus || filterDiscoverer || search;
  const clearFilters = () => { setFilterMachine(''); setFilterYear(''); setFilterStatus(''); setFilterDiscoverer(''); setSearch(''); };

  const filteredMachines = machineOptions.filter(o =>
    o.name.toLowerCase().includes(machineInput.toLowerCase()));

  const selectMachine = (name: string) => {
    setForm(f => ({ ...f, machine_name: name }));
    setMachineInput(name);
    setMachineOpen(false);
  };

  const createMachineOption = async () => {
    if (!machineInput.trim()) return;
    try {
      const { data } = await incidentAPI.addMachineOption(machineInput.trim());
      if (data.option) {
        setMachineOptions(prev => [...prev, data.option].sort((a, b) => a.name.localeCompare(b.name)));
      }
      selectMachine(machineInput.trim());
    } catch { /* ignore */ }
  };

  const handleCreate = async () => {
    setFormError('');
    const { machine_name, incident_details, incident_date, discoverer, discovery_date, resolution, approver_id } = form;
    if (!machine_name || !incident_details || !incident_date || !discoverer || !discovery_date || !resolution || !approver_id) {
      setFormError('All fields are required'); return;
    }
    try {
      setSaving(true);
      await incidentAPI.create({ ...form, approver_id: Number(form.approver_id) });
      setShowCreate(false);
      setForm(emptyForm);
      setMachineInput('');
      fetchRecords();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || 'Failed to create record');
    } finally { setSaving(false); }
  };

  const handleApprove = async (id: number) => {
    if (!confirm('Approve this record?')) return;
    try {
      const { data } = await incidentAPI.approve(id);
      showToast(data.message || 'Record approved successfully', 'success');
      fetchRecords();
      setViewRecord(null);
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to approve record', 'error');
    }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    try {
      const { data } = await incidentAPI.reject(rejectId, rejectReason.trim());
      showToast(data.message || 'Record rejected', 'info');
      setRejectId(null); setRejectReason(''); fetchRecords(); setViewRecord(null);
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to reject record', 'error');
    }
  };

  // Open detail view: fetch full record with attachments & edit history
  const openDetailView = async (rec: IncidentRecord) => {
    setViewRecord(rec);
    setViewAttachments([]);
    setViewEditHistory([]);
    try {
      const { data } = await incidentAPI.get(rec.id);
      if (data.record) setViewRecord({ ...rec, ...data.record });
      setViewAttachments(data.attachments || []);
      setViewEditHistory(data.editHistory || []);
    } catch { /* ignore */ }
  };

  // Open edit modal
  const openEditModal = (rec: IncidentRecord) => {
    setEditRecord(rec);
    setForm({
      machine_name: rec.machine_name,
      incident_details: rec.incident_details,
      incident_date: rec.incident_date,
      discoverer: rec.discoverer,
      discovery_date: rec.discovery_date,
      resolution: rec.resolution,
      approver_id: String(rec.approver_id),
      approver_name: rec.approver_name,
    });
    setMachineInput(rec.machine_name);
    setEditorName('');
    setEditApproverName('');
    setUploadFiles([]);
    setFormError('');
    setShowEdit(true);
    setViewRecord(null);
  };

  const handleEdit = async () => {
    if (!editRecord) return;
    setFormError('');
    const { machine_name, incident_details, incident_date, discoverer, discovery_date, resolution, approver_id } = form;
    if (!machine_name || !incident_details || !incident_date || !discoverer || !discovery_date || !resolution || !approver_id) {
      setFormError('All fields are required'); return;
    }
    if (!editorName.trim() || !editApproverName.trim()) {
      setFormError('Editor name and Approver name are required'); return;
    }
    try {
      setSaving(true);
      await incidentAPI.update(editRecord.id, {
        ...form,
        approver_id: Number(form.approver_id),
        editor_name: editorName.trim(),
        edit_approver_name: editApproverName.trim(),
      });
      // Upload files if any
      if (uploadFiles.length > 0) {
        const fd = new FormData();
        uploadFiles.forEach(f => fd.append('files', f));
        await incidentAPI.uploadAttachments(editRecord.id, fd);
      }
      setShowEdit(false);
      setEditRecord(null);
      setForm(emptyForm);
      setMachineInput('');
      setUploadFiles([]);
      fetchRecords();
    } catch (e: any) {
      setFormError(e?.response?.data?.error || 'Failed to update record');
    } finally { setSaving(false); }
  };

  const handleUploadFiles = async (recordId: number) => {
    if (uploadFiles.length === 0) return;
    try {
      setUploading(true);
      const fd = new FormData();
      uploadFiles.forEach(f => fd.append('files', f));
      await incidentAPI.uploadAttachments(recordId, fd);
      setUploadFiles([]);
      // Refresh attachments in view
      const { data } = await incidentAPI.get(recordId);
      setViewAttachments(data.attachments || []);
    } catch { /* ignore */ } finally { setUploading(false); }
  };

  const handleDownloadAttachment = async (recordId: number, att: Attachment) => {
    try {
      const { data } = await incidentAPI.downloadAttachment(recordId, att.id);
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = att.original_name;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const handleDeleteAttachment = (recordId: number, attId: number) => {
    setDeleteConfirm({
      message: 'Delete this attachment?',
      onConfirm: async () => {
        setDeleteConfirm(null);
        try {
          await incidentAPI.deleteAttachment(recordId, attId);
          setViewAttachments(prev => prev.filter(a => a.id !== attId));
        } catch { /* ignore */ }
      },
    });
  };

  const handleDeleteRecord = (id: number) => {
    setDeleteConfirm({
      message: 'Are you sure you want to permanently delete this record? This action cannot be undone.',
      onConfirm: async () => {
        setDeleteConfirm(null);
        try {
          const { data } = await incidentAPI.deleteRecord(id);
          showToast(data.message || 'Record deleted successfully', 'success');
          setViewRecord(null);
          fetchRecords();
        } catch (e: any) {
          showToast(e?.response?.data?.error || 'Failed to delete record', 'error');
        }
      },
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const cols = [
    'No.', 'Machine/Equipment Name', 'Incident Description', 'Incident Date',
    'First Discovered By', 'Date of Discovery', 'Resolution/Action Taken',
    'Recorded By', 'Approver', 'Edits',
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/other')} className="p-1.5 rounded-lg hover:bg-slate-200 transition">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" /> Abnormal Situations Record
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Incident tracking records</p>
          </div>
        </div>
        <button onClick={() => { setFormError(''); setForm(emptyForm); setMachineInput(''); setShowCreate(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm">
          <Plus size={16} /> Create Record
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={16} className="text-slate-400 shrink-0" />
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white min-w-[100px]">
            <option value="">All Years</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filterMachine} onChange={e => setFilterMachine(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white min-w-[140px]">
            <option value="">All Machines</option>
            {machineOptions.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
          </select>
          <select value={filterDiscoverer} onChange={e => setFilterDiscoverer(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white min-w-[140px]">
            <option value="">All Discoverers</option>
            {availableDiscoverers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white min-w-[120px]">
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <div className="relative ml-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search all columns..." className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 w-52" />
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Clear all filters">
              <RotateCcw size={14} /> Clear
            </button>
          )}
        </div>
        {hasActiveFilters && (
          <div className="text-xs text-slate-400 mt-2">
            Showing {filteredRecords.length} of {records.length} records
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-xs table-fixed">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[9%]">No.</th>
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[8%]">Machine</th>
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[13%]">Incident Desc.</th>
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[7%]">Inc. Date</th>
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[8%]">Discovered By</th>
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[7%]">Disc. Date</th>
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[13%]">Resolution</th>
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[7%]">Recorded By</th>
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[7%]">Approver</th>
              <th className="px-2 py-2.5 text-center font-semibold text-slate-600 w-[4%]">Edits</th>
              <th className="px-2 py-2.5 text-left font-semibold text-slate-600 w-[10%]">Status</th>
              <th className="px-2 py-2.5 text-center font-semibold text-slate-600 w-[7%]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="text-center py-20 text-slate-400">Loading...</td></tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-20 text-slate-400">
                  <AlertTriangle size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No records found</p>
                  <p className="text-sm mt-1">{hasActiveFilters ? 'Try adjusting your filters.' : 'Records will appear here once created.'}</p>
                </td>
              </tr>
            ) : filteredRecords.map(r => {
              const needsMyApproval = r.status === 'PENDING' && r.approver_id === (user as any)?.id;
              return (
              <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50/60 transition cursor-pointer ${needsMyApproval ? 'bg-amber-50/60' : ''}`} onClick={() => openDetailView(r)}>
                <td className="px-2 py-2 font-mono text-xs text-blue-600 truncate" title={r.record_no}>
                  <div className="flex items-center gap-1">
                    {needsMyApproval && (
                      <span className="relative flex h-2 w-2 shrink-0" title="Needs your approval">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                    )}
                    <span className="truncate">{r.record_no}</span>
                  </div>
                </td>
                <td className="px-2 py-2 truncate" title={r.machine_name}>{r.machine_name}</td>
                <td className="px-2 py-2 truncate" title={r.incident_details}>{r.incident_details}</td>
                <td className="px-2 py-2 truncate">{r.incident_date}</td>
                <td className="px-2 py-2 truncate" title={r.discoverer}>{r.discoverer}</td>
                <td className="px-2 py-2 truncate">{r.discovery_date}</td>
                <td className="px-2 py-2 truncate" title={r.resolution}>{r.resolution}</td>
                <td className="px-2 py-2 truncate" title={r.reporter_name}>{r.reporter_name}</td>
                <td className="px-2 py-2 truncate" title={r.approver_name}>{r.approver_name}</td>
                <td className="px-2 py-2 text-center">
                  {r.edit_count > 0 ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      <Edit3 size={10} /> {r.edit_count}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(r.status)}`}>{r.status}</span>
                    {needsMyApproval && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500 text-white whitespace-nowrap" title="Click to review">
                        <Bell size={9} /> Review
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5">
                    <button onClick={() => openDetailView(r)} className="p-1 rounded hover:bg-slate-200" title="View details">
                      <Eye size={14} className="text-slate-500" />
                    </button>
                    <button onClick={() => openEditModal(r)} className="p-1 rounded hover:bg-slate-200" title="Edit record">
                      <Edit3 size={14} className="text-blue-500" />
                    </button>
                    {isAdmin && (
                      <button onClick={() => handleDeleteRecord(r.id)} className="p-1 rounded hover:bg-amber-100" title="Delete record">
                        <Trash2 size={14} className="text-amber-700" />
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

      {/* ─── Create Modal ─── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-4xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">Create Abnormal Situation Record</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{formError}</div>}

              {/* Machine combobox */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Machine/Equipment Name <span className="text-red-500">*</span></label>
                <div className="relative" ref={machineRef}>
                  <input value={machineInput}
                    onChange={e => { setMachineInput(e.target.value); setForm(f => ({ ...f, machine_name: e.target.value })); setMachineOpen(true); }}
                    onFocus={() => setMachineOpen(true)}
                    placeholder="Select or type a new machine name..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 pr-8" />
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  {machineOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {filteredMachines.map(o => (
                        <div key={o.id} onClick={() => selectMachine(o.name)}
                          className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer">{o.name}</div>
                      ))}
                      {machineInput.trim() && !machineOptions.some(o => o.name.toLowerCase() === machineInput.trim().toLowerCase()) && (
                        <div onClick={createMachineOption}
                          className="px-3 py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 cursor-pointer border-t border-slate-100">
                          + Create "{machineInput.trim()}"
                        </div>
                      )}
                      {filteredMachines.length === 0 && !machineInput.trim() && (
                        <div className="px-3 py-2 text-sm text-slate-400">No options</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Incident Details */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Incident Description <span className="text-red-500">*</span></label>
                <textarea rows={3} value={form.incident_details} onChange={e => setForm(f => ({ ...f, incident_details: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Incident Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date of Discovery <span className="text-red-500">*</span></label>
                  <input type="date" value={form.discovery_date} onChange={e => setForm(f => ({ ...f, discovery_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">First Discovered By <span className="text-red-500">*</span></label>
                <input value={form.discoverer} onChange={e => setForm(f => ({ ...f, discoverer: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Resolution/Action Taken <span className="text-red-500">*</span></label>
                <textarea rows={3} value={form.resolution} onChange={e => setForm(f => ({ ...f, resolution: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              {/* Approver dropdown */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Approver (Manager) <span className="text-red-500">*</span></label>
                <select value={form.approver_id}
                  onChange={e => {
                    const mgr = managers.find(m => m.id === Number(e.target.value));
                    setForm(f => ({ ...f, approver_id: e.target.value, approver_name: mgr?.display_name || '' }));
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">Select approver...</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>{m.display_name} ({m.employee_code})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
                <button onClick={handleCreate} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {saving ? 'Saving...' : 'Create Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── View / Approval Modal ─── */}
      {viewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Record: {viewRecord.record_no}</h2>
                {viewRecord.edit_count > 0 && (
                  <span className="text-xs text-blue-600 font-medium">Edited {viewRecord.edit_count} time{viewRecord.edit_count > 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEditModal(viewRecord)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
                  <Edit3 size={14} /> Edit
                </button>
                {isAdmin && (
                  <button onClick={() => handleDeleteRecord(viewRecord.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 transition">
                    <Trash2 size={14} /> Delete
                  </button>
                )}
                <button onClick={() => setViewRecord(null)} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-slate-500 block">Machine/Equipment</span><span className="font-medium">{viewRecord.machine_name}</span></div>
                <div><span className="text-slate-500 block">Status</span><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(viewRecord.status)}`}>{viewRecord.status}</span></div>
                <div><span className="text-slate-500 block">Incident Date</span>{viewRecord.incident_date}</div>
                <div><span className="text-slate-500 block">Date of Discovery</span>{viewRecord.discovery_date}</div>
                <div><span className="text-slate-500 block">First Discovered By</span>{viewRecord.discoverer}</div>
                <div><span className="text-slate-500 block">Recorded By</span>{viewRecord.reporter_name}</div>
                <div><span className="text-slate-500 block">Approver</span>{viewRecord.approver_name}</div>
                <div><span className="text-slate-500 block">Times Edited</span>{viewRecord.edit_count || 0}</div>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Incident Description</span>
                <p className="bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{viewRecord.incident_details}</p>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Resolution/Action Taken</span>
                <p className="bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{viewRecord.resolution}</p>
              </div>
              {viewRecord.status === 'REJECTED' && viewRecord.reject_reason && (
                <div>
                  <span className="text-red-500 font-medium block mb-1">Rejection Reason</span>
                  <p className="bg-red-50 rounded-lg p-3 text-red-700">{viewRecord.reject_reason}</p>
                </div>
              )}

              {/* Attachments section */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-600 font-semibold flex items-center gap-1.5"><Paperclip size={14} /> Attachments ({viewAttachments.length})</span>
                  <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" multiple className="hidden"
                      onChange={e => setUploadFiles(Array.from(e.target.files || []))} />
                    {uploadFiles.length > 0 && (
                      <button onClick={() => handleUploadFiles(viewRecord.id)} disabled={uploading}
                        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {uploading ? 'Uploading...' : `Upload ${uploadFiles.length} file(s)`}
                      </button>
                    )}
                    <button onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                      <Plus size={12} className="inline mr-1" />Add Files
                    </button>
                  </div>
                </div>
                {uploadFiles.length > 0 && (
                  <div className="mb-2 text-xs text-slate-500">
                    Selected: {uploadFiles.map(f => f.name).join(', ')}
                    <button onClick={() => setUploadFiles([])} className="ml-2 text-red-500 hover:underline">Clear</button>
                  </div>
                )}
                {viewAttachments.length > 0 ? (
                  <div className="space-y-1.5">
                    {viewAttachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Paperclip size={14} className="text-slate-400 shrink-0" />
                          <span className="truncate text-sm">{att.original_name}</span>
                          <span className="text-xs text-slate-400 shrink-0">{formatFileSize(att.file_size)}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => handleDownloadAttachment(viewRecord.id, att)}
                            className="p-1 rounded hover:bg-slate-200" title="Download">
                            <Download size={14} className="text-blue-500" />
                          </button>
                          <button onClick={() => handleDeleteAttachment(viewRecord.id, att.id)}
                            className="p-1 rounded hover:bg-amber-100" title="Delete">
                            <Trash2 size={14} className="text-amber-700" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No attachments</p>
                )}
              </div>

              {/* Edit History section */}
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
                        {h.changes && <div className="text-slate-500 mt-1">{h.changes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approval actions — only the designated approver sees these */}
              {viewRecord.status === 'PENDING' && (
                <div className="border-t border-slate-100 pt-3">
                  {Number(user?.id) === viewRecord.approver_id ? (
                    <div className="flex gap-3">
                      <button onClick={() => handleApprove(viewRecord.id)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition">
                        <Check size={16} /> Approve
                      </button>
                      <button onClick={() => { setRejectId(viewRecord.id); setRejectReason(''); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition">
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      Awaiting approval from <span className="font-semibold">{viewRecord.approver_name}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Modal ─── */}
      {showEdit && editRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-4xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">Edit Record: {editRecord.record_no}</h2>
              <button onClick={() => { setShowEdit(false); setEditRecord(null); }} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {formError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{formError}</div>}

              {/* Editor info */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800">Edit Authentication</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Editor Name <span className="text-red-500">*</span></label>
                    <input value={editorName} onChange={e => setEditorName(e.target.value)}
                      placeholder="Who is making this edit?"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Approver Name <span className="text-red-500">*</span></label>
                    <input value={editApproverName} onChange={e => setEditApproverName(e.target.value)}
                      placeholder="Who approves this edit?"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                </div>
              </div>

              {/* Machine combobox */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Machine/Equipment Name <span className="text-red-500">*</span></label>
                <div className="relative" ref={machineRef}>
                  <input value={machineInput}
                    onChange={e => { setMachineInput(e.target.value); setForm(f => ({ ...f, machine_name: e.target.value })); setMachineOpen(true); }}
                    onFocus={() => setMachineOpen(true)}
                    placeholder="Select or type a new machine name..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 pr-8" />
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  {machineOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {filteredMachines.map(o => (
                        <div key={o.id} onClick={() => selectMachine(o.name)}
                          className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer">{o.name}</div>
                      ))}
                      {machineInput.trim() && !machineOptions.some(o => o.name.toLowerCase() === machineInput.trim().toLowerCase()) && (
                        <div onClick={createMachineOption}
                          className="px-3 py-2 text-sm text-blue-600 font-medium hover:bg-blue-50 cursor-pointer border-t border-slate-100">
                          + Create "{machineInput.trim()}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Incident Description <span className="text-red-500">*</span></label>
                <textarea rows={3} value={form.incident_details} onChange={e => setForm(f => ({ ...f, incident_details: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Incident Date <span className="text-red-500">*</span></label>
                  <input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date of Discovery <span className="text-red-500">*</span></label>
                  <input type="date" value={form.discovery_date} onChange={e => setForm(f => ({ ...f, discovery_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">First Discovered By <span className="text-red-500">*</span></label>
                <input value={form.discoverer} onChange={e => setForm(f => ({ ...f, discoverer: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Resolution/Action Taken <span className="text-red-500">*</span></label>
                <textarea rows={3} value={form.resolution} onChange={e => setForm(f => ({ ...f, resolution: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Approver (Manager) <span className="text-red-500">*</span></label>
                <select value={form.approver_id}
                  onChange={e => {
                    const mgr = managers.find(m => m.id === Number(e.target.value));
                    setForm(f => ({ ...f, approver_id: e.target.value, approver_name: mgr?.display_name || '' }));
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">Select approver...</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>{m.display_name} ({m.employee_code})</option>
                  ))}
                </select>
              </div>

              {/* File attachments */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Attach Files</label>
                <input type="file" multiple onChange={e => setUploadFiles(Array.from(e.target.files || []))}
                  className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                {uploadFiles.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">{uploadFiles.length} file(s) selected</p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => { setShowEdit(false); setEditRecord(null); }} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
                <button onClick={handleEdit} disabled={saving}
                  className="px-6 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reject Reason Modal ─── */}
      {rejectId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Rejection Reason</h3>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Provide a reason for rejection..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectId(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button onClick={handleReject} disabled={!rejectReason.trim()}
                className="px-5 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast Notification ─── */}
      {toast && (
        <div className="fixed top-6 right-6 z-[100] animate-slide-in">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' :
            toast.type === 'error'   ? 'bg-red-600 text-white' :
                                       'bg-blue-600 text-white'
          }`}>
            {toast.type === 'success' && <Check size={18} />}
            {toast.type === 'error' && <XCircle size={18} />}
            {toast.type === 'info' && <AlertTriangle size={18} />}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={16} /></button>
          </div>
          <style>{`
            @keyframes slideIn { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
            .animate-slide-in { animation: slideIn 0.3s ease-out; }
          `}</style>
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
