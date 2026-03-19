// pages/MaintenanceHistory.tsx
// Maintenance Plan – History page (mirrors CalibrationHistory UX)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Search, RefreshCw, Plus, X, Trash2, Download,
  AlertCircle, FileText, Upload, CheckCircle, XCircle,
  Calendar, History, Wrench, BarChart2, ClipboardList, Paperclip, Pencil,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { maintenanceAPI } from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

// ─── Types ────────────────────────────────────────────────────────────────────
interface Equipment {
  id: number;
  equipment_no: number;
  equipment_name: string;
  year: number;
  location: string | null;
  notes: string | null;
  status: string;
  last_hist_id: number | null;
  last_result: string | null;
  last_action_code: string | null;
  last_year: number | null;
  last_month: number | null;
  last_day: number | null;
}

interface ActionCode {
  code: string;
  description: string | null;
  frequency: string | null;
}

interface PlanEvent {
  id: number;
  equipment_id: number;
  year: number;
  month: number;
  action_code: string | null;
  notes: string | null;
}

interface HistoryEntry {
  id: number;
  equipment_id: number;
  year: number;
  month: number;
  day: number | null;
  action_code: string | null;
  action_description: string | null;
  result: string;
  performed_by: string | null;
  remark: string | null;
  file_name: string | null;
  file_path: string | null;
  created_at: string;
}

interface ScheduleRow {
  year: number;
  month: number;
  planEvents: PlanEvent[];       // planned actions for this month
  historyEntries: HistoryEntry[]; // actual records for this month
  isPast: boolean;
  isPending: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const RESULT_STYLE: Record<string, string> = {
  'Done':      'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Postponed': 'text-amber-700 bg-amber-50 border-amber-200',
  'Breakdown': 'text-rose-700 bg-rose-50 border-rose-200',
  'N/A':       'text-slate-500 bg-slate-50 border-slate-200',
};

// Calibration result statuses
const CALIB_STATUSES = ['Pass', 'Fail', 'N/A'] as const;
type CalibStatus = typeof CALIB_STATUSES[number];

const CALIB_STATUS_STYLE: Record<CalibStatus, string> = {
  Pass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Fail: 'bg-rose-50 text-rose-700 border-rose-200',
  'N/A': 'bg-slate-100 text-slate-500 border-slate-200',
};

interface CalibrationResult {
  id: number;
  history_id: number;
  item_name: string;
  status: CalibStatus;
  remark: string | null;
  file_name: string | null;
  file_path: string | null;
  created_at: string;
}

const emptyForm = {
  year:         new Date().getFullYear(),
  month:        new Date().getMonth() + 1,
  day:          '' as string | number,
  action_code:  '',
  result:       'Done',
  performed_by: '',
  remark:       '',
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function MaintenanceHistory() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const initSelectedId = (location.state as any)?.selectedId as number | undefined;
  const initYear       = (location.state as any)?.year       as number | undefined;

  const [selectedYear, setSelectedYear]   = useState<number>(initYear || new Date().getFullYear());
  const [availYears, setAvailYears]       = useState<number[]>([]);
  const [allEquipment, setAllEquipment]   = useState<Equipment[]>([]);
  const [loadingList, setLoadingList]     = useState(true);
  const [search, setSearch]               = useState('');
  const [selectedEq, setSelectedEq]       = useState<Equipment | null>(null);
  const [actionCodes, setActionCodes]     = useState<ActionCode[]>([]);

  const [plan, setPlan]                   = useState<PlanEvent[]>([]);
  const [history, setHistory]             = useState<HistoryEntry[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [showForm, setShowForm]           = useState(false);
  const [form, setForm]                   = useState({ ...emptyForm });
  const [file, setFile]                   = useState<File | null>(null);
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState('');
  const [deletingId, setDeletingId]       = useState<number | null>(null);
  const [editingEntry, setEditingEntry]   = useState<HistoryEntry | null>(null);
  const [detailEntry, setDetailEntry]     = useState<HistoryEntry | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartType, setChartType]           = useState<'line' | 'bar'>('bar');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initApplied  = useRef(false);

  // ── Calibration results sub-modal ────────────────────────────────────────
  const [showCalibModal,  setShowCalibModal]  = useState(false);
  const [calibResults,    setCalibResults]    = useState<CalibrationResult[]>([]);
  const [calibLoading,    setCalibLoading]    = useState(false);
  const [calibSaving,     setCalibSaving]     = useState(false);
  const [calibError,      setCalibError]      = useState('');
  const [editingCalib,    setEditingCalib]    = useState<CalibrationResult | null>(null);
  const [showCalibForm,   setShowCalibForm]   = useState(false);
  const [calibForm,       setCalibForm]       = useState<{ item_name: string; status: CalibStatus; remark: string }>({ item_name: '', status: 'Pass', remark: '' });
  const [calibFile,       setCalibFile]       = useState<File | null>(null);
  const calibFileRef = useRef<HTMLInputElement>(null);

  // ── Load years ────────────────────────────────────────────────────────────
  const fetchYears = useCallback(async () => {
    try {
      const res = await maintenanceAPI.getYears();
      const years: number[] = res.data.years || [];
      setAvailYears(years.length ? years : [new Date().getFullYear()]);
    } catch { setAvailYears([new Date().getFullYear()]); }
  }, []);

  // ── Load action codes ─────────────────────────────────────────────────────
  const fetchActionCodes = useCallback(async () => {
    try {
      const res = await maintenanceAPI.getActionCodes();
      setActionCodes(res.data.actionCodes || []);
    } catch {}
  }, []);

  // ── Load equipment list ────────────────────────────────────────────────────
  const fetchEquipment = useCallback(async () => {
    try {
      setLoadingList(true);
      const res = await maintenanceAPI.getEquipment(selectedYear);
      const list: Equipment[] = res.data.equipment || [];
      setAllEquipment(list);
      if (initSelectedId && !initApplied.current) {
        initApplied.current = true;
        const found = list.find(e => e.id === initSelectedId);
        if (found) setSelectedEq(found);
      }
    } catch { setAllEquipment([]); }
    finally { setLoadingList(false); }
  }, [selectedYear]);

  useEffect(() => { fetchYears(); fetchActionCodes(); }, [fetchYears, fetchActionCodes]);
  useEffect(() => { fetchEquipment(); }, [fetchEquipment]);

  useEffect(() => {
    setSelectedEq(null);
    setPlan([]);
    setHistory([]);
    initApplied.current = false;
  }, [selectedYear]);

  // ── Load plan + history for selected equipment ─────────────────────────────
  const fetchDetail = useCallback(async (eq: Equipment) => {
    try {
      setLoadingDetail(true);
      const [planRes, histRes] = await Promise.all([
        maintenanceAPI.getPlan(eq.id, eq.year),
        maintenanceAPI.getHistory(eq.id),
      ]);
      setPlan(planRes.data.plan || []);
      setHistory(histRes.data.history || []);
    } catch { setPlan([]); setHistory([]); }
    finally { setLoadingDetail(false); }
  }, []);

  useEffect(() => {
    if (selectedEq) fetchDetail(selectedEq);
    else { setPlan([]); setHistory([]); }
  }, [selectedEq, fetchDetail]);

  // ── Schedule rows (all 12 months of the equipment's year) ─────────────────
  const scheduleRows = useMemo((): ScheduleRow[] => {
    if (!selectedEq) return [];
    const todayStr = new Date().toISOString().slice(0, 7); // YYYY-MM
    return Array.from({ length: 12 }, (_, i) => {
      const month     = i + 1;
      const monthStr  = `${selectedEq.year}-${String(month).padStart(2, '0')}`;
      const planEvts  = plan.filter(p => p.month === month);
      const histEvts  = history.filter(h => h.year === selectedEq.year && h.month === month);
      const isPast    = monthStr < todayStr;
      const isPending = isPast && planEvts.length > 0 && histEvts.length === 0;
      return { year: selectedEq.year, month, planEvents: planEvts, historyEntries: histEvts, isPast, isPending };
    });
  }, [selectedEq, plan, history]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const yearHist = history.filter(h => h.year === selectedEq?.year);
    return {
      planned:   plan.length,
      done:      yearHist.filter(h => h.result === 'Done').length,
      postponed: yearHist.filter(h => h.result === 'Postponed').length,
      breakdown: yearHist.filter(h => h.result === 'Breakdown').length,
      total:     yearHist.length,
    };
  }, [plan, history, selectedEq]);

  // ── Action code lookup ────────────────────────────────────────────────────
  const acLookup = useMemo(() => {
    const m = new Map<string, ActionCode>();
    actionCodes.forEach(ac => m.set(ac.code, ac));
    return m;
  }, [actionCodes]);

  // ── Chart data (activity count per month) ─────────────────────────────────
  const chartData = useMemo(() => {
    const labels = MONTH_LABELS;
    const planned = Array(12).fill(0);
    const actual  = Array(12).fill(0);
    plan.forEach(p => { if (p.month >= 1 && p.month <= 12) planned[p.month - 1]++; });
    history.filter(h => h.year === selectedEq?.year)
      .forEach(h => { if (h.month >= 1 && h.month <= 12) actual[h.month - 1]++; });
    return {
      labels,
      datasets: [
        { label: 'Planned', data: planned, backgroundColor: 'rgba(99,102,241,0.5)', borderColor: '#6366f1', borderWidth: 2 },
        { label: 'Actual',  data: actual,  backgroundColor: 'rgba(16,185,129,0.5)', borderColor: '#10b981', borderWidth: 2 },
      ],
    };
  }, [plan, history, selectedEq]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
      title:  { display: true, text: `${selectedEq?.equipment_name || ''} — Planned vs Actual (${selectedEq?.year || ''})`, font: { size: 13 } },
    },
    scales: { y: { title: { display: true, text: 'Count' }, ticks: { stepSize: 1 } } },
  };

  // ── Form handlers ─────────────────────────────────────────────────────────
  const openAddRecord = (year: number, month: number) => {
    setForm({ ...emptyForm, year, month });
    setEditingEntry(null);
    setSaveError('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowForm(true);
  };

  const openEditRecord = (entry: HistoryEntry) => {
    setEditingEntry(entry);
    setForm({
      year:         entry.year,
      month:        entry.month,
      day:          entry.day ?? '',
      action_code:  entry.action_code || '',
      result:       entry.result,
      performed_by: entry.performed_by || '',
      remark:       entry.remark || '',
    });
    setSaveError('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.year || !form.month || !selectedEq) { setSaveError('Year and month are required.'); return; }
    try {
      setSaving(true); setSaveError('');
      const fd = new FormData();
      fd.append('year',         String(form.year));
      fd.append('month',        String(form.month));
      if (form.day !== '') fd.append('day', String(form.day));
      if (form.action_code) fd.append('action_code', form.action_code);
      fd.append('result',       form.result);
      fd.append('performed_by', form.performed_by);
      fd.append('remark',       form.remark);
      if (file) fd.append('file', file);

      if (editingEntry) {
        await maintenanceAPI.updateHistory(editingEntry.id, fd);
      } else {
        await maintenanceAPI.addHistory(selectedEq.id, fd);
      }
      setForm({ ...emptyForm }); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowForm(false); setEditingEntry(null);
      await fetchDetail(selectedEq);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save record.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (histId: number) => {
    if (!confirm('Delete this maintenance record?')) return;
    try {
      setDeletingId(histId);
      await maintenanceAPI.deleteHistory(histId);
      if (selectedEq) await fetchDetail(selectedEq);
    } catch {} finally { setDeletingId(null); }
  };

  const handleDownload = async (entry: HistoryEntry) => {
    try {
      const res = await maintenanceAPI.downloadFile(entry.id);
      const blob = new Blob([res.data]);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = entry.file_name || `maint_${entry.id}`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  // ── Calibration results handlers ──────────────────────────────────────────
  const fetchCalibResults = async (histId: number) => {
    setCalibLoading(true);
    try {
      const res = await maintenanceAPI.getCalibrationResults(histId);
      setCalibResults(res.data.results || []);
    } catch { setCalibResults([]); }
    finally { setCalibLoading(false); }
  };

  const openCalibModal = (entry: HistoryEntry) => {
    setShowCalibModal(true);
    setShowCalibForm(false);
    setEditingCalib(null);
    setCalibForm({ item_name: '', status: 'Pass', remark: '' });
    setCalibFile(null);
    setCalibError('');
    fetchCalibResults(entry.id);
  };

  const saveCalibResult = async () => {
    if (!detailEntry) return;
    if (!calibForm.item_name.trim()) { setCalibError('Item name is required.'); return; }
    try {
      setCalibSaving(true);
      setCalibError('');
      const fd = new FormData();
      fd.append('item_name', calibForm.item_name.trim());
      fd.append('status', calibForm.status);
      if (calibForm.remark.trim()) fd.append('remark', calibForm.remark.trim());
      if (calibFile) fd.append('file', calibFile);
      if (editingCalib) {
        await maintenanceAPI.updateCalibrationResult(editingCalib.id, fd);
      } else {
        await maintenanceAPI.addCalibrationResult(detailEntry.id, fd);
      }
      setShowCalibForm(false);
      setEditingCalib(null);
      setCalibFile(null);
      if (calibFileRef.current) calibFileRef.current.value = '';
      await fetchCalibResults(detailEntry.id);
    } catch (e: any) {
      setCalibError(e?.response?.data?.error || 'Save failed. Please try again.');
    } finally { setCalibSaving(false); }
  };

  const startEditCalib = (row: CalibrationResult) => {
    setEditingCalib(row);
    setCalibForm({ item_name: row.item_name, status: row.status, remark: row.remark || '' });
    setCalibFile(null);
    if (calibFileRef.current) calibFileRef.current.value = '';
    setCalibError('');
    setShowCalibForm(true);
  };

  const deleteCalibResult = async (id: number) => {
    if (!detailEntry) return;
    if (!confirm('Delete this calibration result row?')) return;
    try {
      await maintenanceAPI.deleteCalibrationResult(id);
      await fetchCalibResults(detailEntry.id);
    } catch {}
  };

  const downloadCalibFile = async (row: CalibrationResult) => {
    try {
      const res = await maintenanceAPI.downloadCalibrationFile(row.id);
      const blob = new Blob([res.data]);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = row.file_name || `calib_${row.id}`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };
  const filteredEquipment = useMemo(() => {
    const q = search.toLowerCase();
    return allEquipment.filter(eq =>
      !q || eq.equipment_name.toLowerCase().includes(q) || String(eq.equipment_no).includes(q)
    );
  }, [allEquipment, search]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-0 h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 bg-orange-50">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-white/60 text-slate-500 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <h2 className="font-bold text-sm text-orange-700">Maintenance Plan</h2>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-500 font-medium">Year:</span>
            <div className="flex gap-1 flex-wrap">
              {availYears.map(y => (
                <button key={y} onClick={() => setSelectedYear(y)}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border transition-colors ${
                    selectedYear === y
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}>
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search equipment"
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-orange-300 bg-white" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500 mb-2" /><p>Loading…</p>
            </div>
          ) : filteredEquipment.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              <Wrench size={24} className="mx-auto mb-2 opacity-30" /><p>No equipment found</p>
            </div>
          ) : filteredEquipment.map(eq => {
            const isSelected = selectedEq?.id === eq.id;
            const lastDate = eq.last_year != null
              ? `${eq.last_year}-${MONTH_LABELS[(eq.last_month ?? 1) - 1]}${eq.last_day ? `-${eq.last_day}` : ''}`
              : null;
            return (
              <button key={eq.id} onClick={() => setSelectedEq(eq)}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                  isSelected
                    ? 'bg-orange-50 border-l-2 border-l-orange-500'
                    : 'hover:bg-slate-50 border-l-2 border-l-transparent'
                }`}>
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isSelected ? 'text-orange-700' : 'text-slate-800'}`}>
                      {eq.equipment_no}. {eq.equipment_name}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{eq.year}</p>
                  </div>
                  {eq.last_action_code && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border bg-orange-100 text-orange-700 border-orange-200 flex-shrink-0">
                      {eq.last_action_code}
                    </span>
                  )}
                </div>
                {lastDate
                  ? <p className="text-[10px] text-slate-400 mt-1">Last: {lastDate}
                      {eq.last_result && <span className={`ml-1 font-semibold ${eq.last_result === 'Done' ? 'text-emerald-600' : eq.last_result === 'Breakdown' ? 'text-rose-600' : 'text-amber-600'}`}> {eq.last_result}</span>}
                    </p>
                  : <p className="text-[10px] text-slate-300 mt-1 italic">No records yet</p>
                }
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-100">
          <button onClick={fetchEquipment} className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            <RefreshCw size={11} /> Refresh list
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {!selectedEq ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-slate-400">
              <Wrench size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-lg font-semibold text-slate-500">Select equipment</p>
              <p className="text-sm mt-1">Click any equipment from the left panel</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* FROZEN TOP SECTION */}
            <div className="flex-shrink-0 overflow-y-auto p-5 space-y-5 max-h-[55%]">

            {/* Equipment info card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-orange-50 text-orange-700 border-orange-200">
                      #{selectedEq.equipment_no}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold border bg-slate-100 text-slate-600 border-slate-200">
                      <Calendar size={10} className="inline mr-1" />{selectedEq.year}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedEq.equipment_name}</h2>
                  {selectedEq.location && <p className="text-sm text-slate-500">{selectedEq.location}</p>}
                </div>
                <button onClick={() => openAddRecord(selectedEq.year, new Date().getMonth() + 1)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow transition-colors flex-shrink-0 bg-orange-500 hover:bg-orange-600">
                  <Plus size={15} /> Add Record
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Planned',   value: stats.planned,   color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
                { label: 'Total Done',value: stats.total,     color: 'text-slate-700 bg-slate-50 border-slate-200' },
                { label: 'Done',      value: stats.done,      color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { label: 'Postponed', value: stats.postponed, color: 'text-amber-700 bg-amber-50 border-amber-200' },
                { label: 'Breakdown', value: stats.breakdown, color: 'text-rose-700 bg-rose-50 border-rose-200' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-3 text-center shadow-sm ${s.color}`}>
                  <p className="text-xl font-black">{s.value}</p>
                  <p className="text-[10px] mt-0.5 font-medium leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            </div>

            {/* SCROLLABLE BOTTOM — TABLE ONLY */}
            <div className="flex-1 panel-scroll p-5 pt-0 min-h-0">

            {/* Schedule / History table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">Maintenance Schedule &amp; History</p>
                  <p className="text-xs text-slate-400 mt-0.5">12-month view · click pending row to fill result · double-click record for detail</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowChartModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors shadow-sm">
                    <BarChart2 size={13} /> Chart
                  </button>
                  <button onClick={() => openAddRecord(selectedEq.year, new Date().getMonth() + 1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow transition-colors bg-orange-500 hover:bg-orange-600">
                    <Plus size={13} /> Add Record
                  </button>
                </div>
              </div>

              {loadingDetail ? (
                <div className="p-10 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2" />
                  <p className="text-sm">Loading</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs w-24">Month</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Planned Actions</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Day</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Action Code</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Result</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Performed By</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Remark</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">File</th>
                        <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {scheduleRows.map((row) => {
                        const today = new Date();
                        const isCurrentMonth = row.year === today.getFullYear() && row.month === today.getMonth() + 1;
                        const hasPlan   = row.planEvents.length > 0;
                        const hasActual = row.historyEntries.length > 0;
                        const rowBg = !row.isPast
                          ? 'bg-slate-50/60 opacity-70'
                          : row.isPending
                            ? 'bg-amber-50/60 hover:bg-amber-50 cursor-pointer'
                            : 'hover:bg-slate-50/60';

                        // Render one row per actual entry (or one placeholder row per month)
                        const entries = hasActual ? row.historyEntries : [null];

                        return entries.map((entry, ei) => (
                          <tr key={entry ? `h-${entry.id}` : `s-${row.year}-${row.month}-${ei}`}
                            className={`transition-colors ${rowBg}`}
                            onClick={() => { if (row.isPending && !entry) openAddRecord(row.year, row.month); }}
                            onDoubleClick={() => { if (entry) setDetailEntry(entry); }}
                            title={entry ? 'Double-click for full detail' : row.isPending ? 'Click to fill result' : undefined}>

                            {/* Month — only shown on first entry row */}
                            {ei === 0 ? (
                              <td className="px-4 py-3 whitespace-nowrap" rowSpan={entries.length}>
                                <div className="flex items-center gap-1.5">
                                  {isCurrentMonth && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-200 text-orange-700">NOW</span>}
                                  {row.isPending && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-700">PENDING</span>}
                                  <span className={`text-xs font-semibold ${row.isPending ? 'text-amber-700' : !row.isPast ? 'text-slate-400' : 'text-slate-700'}`}>
                                    {MONTH_LABELS[row.month - 1]}
                                  </span>
                                </div>
                              </td>
                            ) : null}

                            {/* Planned actions — only first entry row */}
                            {ei === 0 ? (
                              <td className="px-4 py-3" rowSpan={entries.length}>
                                {hasPlan ? (
                                  <div className="flex flex-wrap gap-1">
                                    {row.planEvents.map((p, pi) => (
                                      <span key={pi} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                        title={acLookup.get(p.action_code || '')?.description || ''}>
                                        {p.action_code}
                                      </span>
                                    ))}
                                  </div>
                                ) : <span className="text-slate-300 text-xs">—</span>}
                              </td>
                            ) : null}

                            {/* Day */}
                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                              {entry ? (
                                entry.day != null ? entry.day : <span className="text-slate-300">—</span>
                              ) : row.isPending ? (
                                <button onClick={e => { e.stopPropagation(); openAddRecord(row.year, row.month); }}
                                  className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg border transition-colors border-orange-300 text-orange-700 hover:bg-orange-50">
                                  <Plus size={10} /> Fill
                                </button>
                              ) : <span className="text-slate-300 text-xs">—</span>}
                            </td>

                            {/* Action Code */}
                            <td className="px-4 py-3">
                              {entry?.action_code ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-sky-50 text-sky-700 border-sky-200"
                                  title={entry.action_description || entry.action_code}>
                                  {entry.action_code}
                                  {entry.action_description && (
                                    <span className="ml-1 text-sky-400 font-normal hidden sm:inline truncate max-w-[80px]">
                                      · {entry.action_description}
                                    </span>
                                  )}
                                </span>
                              ) : entry ? <span className="text-slate-300 text-xs">—</span> : null}
                            </td>

                            {/* Result */}
                            <td className="px-4 py-3">
                              {entry && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${RESULT_STYLE[entry.result] || RESULT_STYLE['Done']}`}>
                                  {entry.result === 'Done' ? <CheckCircle size={10} /> : entry.result === 'Breakdown' ? <XCircle size={10} /> : null}
                                  {entry.result}
                                </span>
                              )}
                            </td>

                            {/* Performed By */}
                            <td className="px-4 py-3 text-xs text-slate-500">{entry?.performed_by || (entry ? '—' : '')}</td>

                            {/* Remark */}
                            <td className="px-4 py-3 text-[11px] text-slate-500 max-w-[140px] truncate">{entry?.remark || (entry ? '' : '')}</td>

                            {/* File */}
                            <td className="px-4 py-3">
                              {entry?.file_path ? (
                                <button onClick={e => { e.stopPropagation(); handleDownload(entry); }}
                                  className="flex items-center gap-1 text-[11px] text-indigo-600 hover:underline">
                                  <Download size={11} />
                                  {entry.file_name ? (entry.file_name.length > 14 ? entry.file_name.slice(0, 14) + '…' : entry.file_name) : 'File'}
                                </button>
                              ) : entry ? <span className="text-slate-300 text-xs">—</span> : null}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3 text-center">
                              {entry ? (
                                <button onClick={e => { e.stopPropagation(); handleDelete(entry.id); }}
                                  disabled={deletingId === entry.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 transition-colors disabled:opacity-40"
                                  title="Delete this record">
                                  {deletingId === entry.id
                                    ? <span className="inline-block w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                    : <Trash2 size={12} />}
                                  Delete
                                </button>
                              ) : row.isPending ? (
                                <span className="text-slate-300 text-xs italic">pending</span>
                              ) : !row.isPast ? (
                                <span className="text-slate-300 text-[10px] italic">future</span>
                              ) : null}
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            </div>

          </div>
        )}
      </div>

      {/* ── Add / Edit Record Modal ─────────────────────────────────────────── */}
      {showForm && selectedEq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingEntry ? 'Edit Maintenance Record' : 'Add Maintenance Record'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedEq.equipment_name} · {selectedEq.year}
                </p>
              </div>
              <button onClick={() => { setShowForm(false); setEditingEntry(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {saveError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle size={14} /> {saveError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Year <span className="text-rose-500">*</span></label>
                  <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))} required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Month <span className="text-rose-500">*</span></label>
                  <select value={form.month} onChange={e => setForm(f => ({ ...f, month: parseInt(e.target.value) }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-white">
                    {MONTH_LABELS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Day</label>
                  <input type="number" min={1} max={31} value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value }))} placeholder="e.g. 15"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Action Code</label>
                  <select value={form.action_code} onChange={e => setForm(f => ({ ...f, action_code: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-white">
                    <option value="">— none —</option>
                    {actionCodes.filter(ac => ac.description).map(ac => (
                      <option key={ac.code} value={ac.code}>{ac.code} — {ac.description}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Performed By</label>
                  <input value={form.performed_by} onChange={e => setForm(f => ({ ...f, performed_by: e.target.value }))}
                    placeholder="e.g. Maintenance team"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Result <span className="text-rose-500">*</span></label>
                <div className="flex gap-2">
                  {(['Done', 'Postponed', 'Breakdown', 'N/A'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setForm(f => ({ ...f, result: r }))}
                      className={['flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors',
                        form.result === r
                          ? r === 'Done' ? 'bg-emerald-600 text-white border-emerald-600'
                            : r === 'Breakdown' ? 'bg-rose-600 text-white border-rose-600'
                            : r === 'Postponed' ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-slate-500 text-white border-slate-500'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                      ].join(' ')}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Remark / Notes</label>
                <textarea value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} rows={2}
                  placeholder="Optional observations or comments"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Attach File <span className="text-slate-400 font-normal">(PDF, PNG, JPG, DOCX  max 20 MB)</span>
                </label>
                <div className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer ${file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-orange-300 bg-slate-50'}`}
                  onClick={() => fileInputRef.current?.click()}>
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-700">
                      <FileText size={16} /><span className="text-sm font-medium">{file.name}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="ml-1 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="text-slate-400"><Upload size={20} className="mx-auto mb-1" /><p className="text-sm">Click to select file</p></div>
                  )}
                  <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => { setShowForm(false); setEditingEntry(null); }} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60 bg-orange-500 hover:bg-orange-600">
                  {saving ? 'Saving…' : editingEntry ? 'Update Record' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Modal ────────────────────────────────────────────────────── */}
      {detailEntry && selectedEq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8 overflow-y-auto"
          onClick={() => setDetailEntry(null)}>
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${RESULT_STYLE[detailEntry.result] || RESULT_STYLE['Done']}`}>
                    {detailEntry.result}
                  </span>
                  {detailEntry.action_code && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-sky-50 text-sky-700 border-sky-200">
                      {detailEntry.action_code}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900">Maintenance Record Detail</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedEq.equipment_name} · {selectedEq.year}</p>
              </div>
              <button onClick={() => setDetailEntry(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Year</p>
                <p className="mt-0.5 font-medium text-slate-800">{detailEntry.year}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Month / Day</p>
                <p className="mt-0.5 font-medium text-slate-800">
                  {MONTH_LABELS[detailEntry.month - 1]}{detailEntry.day != null ? ` ${detailEntry.day}` : ''}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Action Code</p>
                {detailEntry.action_code ? (
                  <div className="mt-0.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-sky-50 text-sky-700 border-sky-200">
                      {detailEntry.action_code}
                    </span>
                    {detailEntry.action_description && (
                      <p className="text-xs text-slate-500 mt-0.5">{detailEntry.action_description}</p>
                    )}
                  </div>
                ) : <p className="mt-0.5 text-slate-400">—</p>}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Result</p>
                <p className={`mt-0.5 font-semibold ${detailEntry.result === 'Done' ? 'text-emerald-700' : detailEntry.result === 'Breakdown' ? 'text-rose-700' : 'text-amber-700'}`}>
                  {detailEntry.result}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Performed By</p>
                <p className="mt-0.5 font-medium text-slate-800">{detailEntry.performed_by || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Recorded At</p>
                <p className="mt-0.5 text-slate-600">{detailEntry.created_at?.slice(0, 16) || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Remark / Notes</p>
                <p className="mt-0.5 text-slate-700 whitespace-pre-wrap">{detailEntry.remark || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Attached File</p>
                {detailEntry.file_path ? (
                  <button onClick={() => handleDownload(detailEntry)} className="mt-0.5 flex items-center gap-1.5 text-indigo-600 hover:underline font-medium text-sm">
                    <Download size={13} /> {detailEntry.file_name || 'Download'}
                  </button>
                ) : <p className="mt-0.5 text-slate-400">—</p>}
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between items-center gap-2">
              <div>
                {/* Show button if actual action_code is 'I'  OR  any plan event for that month has code 'I' */}
                {(detailEntry.action_code === 'I' ||
                  plan.some(p => p.month === detailEntry.month && p.action_code === 'I')
                ) && (
                  <button onClick={() => openCalibModal(detailEntry)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-50 transition-colors">
                    <ClipboardList size={14} /> Calibration Results
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setDetailEntry(null); openEditRecord(detailEntry); }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 transition-colors">
                  Edit Record
                </button>
                <button onClick={() => setDetailEntry(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Calibration Results Sub-modal ───────────────────────────────────── */}
      {showCalibModal && detailEntry && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/60 px-4 py-6"
          style={{ zIndex: 60 }}
          onClick={() => setShowCalibModal(false)}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 bg-sky-50">
              <div>
                <h3 className="text-base font-bold text-sky-900 flex items-center gap-2">
                  <ClipboardList size={17} className="text-sky-500" /> Calibration Results
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {detailEntry.action_description || 'Calibration'} · {MONTH_LABELS[(detailEntry.month ?? 1) - 1]} {detailEntry.year}
                </p>
              </div>
              <button onClick={() => setShowCalibModal(false)} className="p-1.5 rounded-lg hover:bg-sky-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {calibLoading ? (
                <div className="flex justify-center py-10 text-slate-400">
                  <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
                </div>
              ) : (
                <>
                  {/* Table */}
                  {calibResults.length > 0 ? (
                    <div className="table-wrap">
                    <table className="w-full text-sm border-collapse mb-4">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                          <th className="py-2 px-3 text-left font-semibold border-b border-slate-100 w-8">#</th>
                          <th className="py-2 px-3 text-left font-semibold border-b border-slate-100">Calibration Item</th>
                          <th className="py-2 px-3 text-center font-semibold border-b border-slate-100 w-24">Status</th>
                          <th className="py-2 px-3 text-left font-semibold border-b border-slate-100">Remark</th>
                          <th className="py-2 px-3 text-center font-semibold border-b border-slate-100 w-20">File</th>
                          <th className="py-2 px-3 text-center font-semibold border-b border-slate-100 w-20">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calibResults.map((row, idx) => (
                          <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                            <td className="py-2 px-3 text-slate-400 text-xs">{idx + 1}</td>
                            <td className="py-2 px-3 text-slate-800 font-medium">{row.item_name}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${CALIB_STATUS_STYLE[row.status as CalibStatus] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {row.status === 'Pass' && <CheckCircle size={11} />}
                                {row.status === 'Fail' && <XCircle size={11} />}
                                {row.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600 text-xs">{row.remark || '—'}</td>
                            <td className="py-2 px-3 text-center">
                              {row.file_name ? (
                                <button onClick={() => downloadCalibFile(row)}
                                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs font-medium">
                                  <Paperclip size={12} /> {row.file_name.length > 14 ? row.file_name.slice(0, 14) + '…' : row.file_name}
                                </button>
                              ) : <span className="text-slate-300 text-xs">—</span>}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex justify-center gap-1.5">
                                <button onClick={() => startEditCalib(row)}
                                  className="p-1 rounded hover:bg-amber-50 text-amber-500 hover:text-amber-700 transition-colors" title="Edit">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => deleteCalibResult(row.id)}
                                  className="p-1 rounded hover:bg-rose-50 text-rose-400 hover:text-rose-600 transition-colors" title="Delete">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
                      No calibration results yet. Click <strong>"+ Add Item"</strong> to add one.
                    </div>
                  )}

                  {/* Inline Add / Edit Form */}
                  {showCalibForm && (
                    <div className="border border-sky-200 rounded-xl bg-sky-50/50 p-4 mb-3">
                      <p className="text-xs font-semibold text-sky-700 mb-3">
                        {editingCalib ? `Editing row #${calibResults.findIndex(r => r.id === editingCalib.id) + 1}` : 'New Item'}
                      </p>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Calibration Item <span className="text-rose-500">*</span></label>
                          <input type="text" value={calibForm.item_name}
                            onChange={e => setCalibForm(f => ({ ...f, item_name: e.target.value }))}
                            placeholder="e.g. Vernier Caliper #1"
                            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                          <select value={calibForm.status}
                            onChange={e => setCalibForm(f => ({ ...f, status: e.target.value as CalibStatus }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                            {CALIB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Remark</label>
                          <input type="text" value={calibForm.remark}
                            onChange={e => setCalibForm(f => ({ ...f, remark: e.target.value }))}
                            placeholder="Optional note"
                            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            File Attachment {editingCalib?.file_name && <span className="text-slate-400 font-normal">(current: {editingCalib.file_name})</span>}
                          </label>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => calibFileRef.current?.click()}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-white transition-colors">
                              <Upload size={12} /> {calibFile ? calibFile.name : 'Choose file…'}
                            </button>
                            {calibFile && (
                              <button type="button" onClick={() => { setCalibFile(null); if (calibFileRef.current) calibFileRef.current.value = ''; }}
                                className="text-slate-400 hover:text-rose-500"><X size={14} /></button>
                            )}
                          </div>
                          <input ref={calibFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" className="hidden"
                            onChange={e => setCalibFile(e.target.files?.[0] || null)} />
                        </div>
                      </div>
                      {calibError && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mb-2">
                          <AlertCircle size={12} /> {calibError}
                        </p>
                      )}
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowCalibForm(false); setEditingCalib(null); setCalibError(''); }}
                          className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
                          Cancel
                        </button>
                        <button onClick={saveCalibResult} disabled={calibSaving}
                          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors">
                          {calibSaving ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                          {editingCalib ? 'Update' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <button onClick={() => { setShowCalibForm(true); setEditingCalib(null); setCalibForm({ item_name: '', status: 'Pass', remark: '' }); setCalibFile(null); setCalibError(''); if (calibFileRef.current) calibFileRef.current.value = ''; }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors">
                <Plus size={14} /> Add Item
              </button>
              <button onClick={() => setShowCalibModal(false)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-white">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Chart Modal ─────────────────────────────────────────────────────── */}
      {showChartModal && selectedEq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6"
          onClick={() => setShowChartModal(false)}>
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart2 size={18} className="text-violet-500" /> Maintenance Chart
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedEq.equipment_name} · {selectedEq.year}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                  {(['bar', 'line'] as const).map(t => (
                    <button key={t} onClick={() => setChartType(t)}
                      className={`px-3 py-1.5 capitalize transition-colors ${chartType === t ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                      {t === 'bar' ? '📊 Bar' : '📈 Line'}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowChartModal(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div style={{ height: 340 }}>
                {chartType === 'bar'
                  ? <Bar  data={chartData} options={chartOptions} />
                  : <Line data={chartData} options={chartOptions} />
                }
              </div>
              {/* Summary table */}
              <div className="mt-5 table-wrap">
                <table className="w-full text-xs border border-slate-100 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Month</th>
                      <th className="px-3 py-2 text-center font-semibold text-indigo-600">Planned</th>
                      <th className="px-3 py-2 text-center font-semibold text-emerald-600">Actual</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Action Codes (Actual)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {MONTH_LABELS.map((ml, i) => {
                      const month    = i + 1;
                      const planned  = plan.filter(p => p.month === month);
                      const actuals  = history.filter(h => h.year === selectedEq.year && h.month === month);
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 font-medium text-slate-700">{ml}</td>
                          <td className="px-3 py-1.5 text-center">
                            {planned.length > 0
                              ? <div className="flex flex-wrap gap-0.5 justify-center">{planned.map((p, pi) => <span key={pi} className="px-1 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">{p.action_code}</span>)}</div>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-center font-semibold">{actuals.length || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-1.5">
                            {actuals.length > 0
                              ? <div className="flex flex-wrap gap-0.5">{actuals.map((a, ai) => <span key={ai} className={`px-1 py-0.5 rounded text-[9px] font-bold border ${RESULT_STYLE[a.result] || RESULT_STYLE['Done']}`}>{a.action_code || a.result}</span>)}</div>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
