// frontend/src/pages/CalibrationHistory.tsx
// Unified calibration history page  shows ALL tools on the left panel.
// User clicks a tool to see its full history + chart on the right.
// History rows are auto-generated from calibration_interval + calibration_date
// (yearly / 2 yearly / monthly / 6 monthly / quarterly / etc.)
// and user fills in result, error%, measured value, remark per scheduled row.
import React, {
  useState, useEffect, useCallback, useMemo, useRef,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Download, Upload, X,
  CheckCircle, XCircle, AlertCircle,
  FileText, Search, History,
  Calendar, Gauge, RefreshCw, Pencil, Eye, BarChart2,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar, Scatter } from 'react-chartjs-2';
import { calibrationAPI, inHouseCalibrationAPI } from '../api';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler,
);

// --- Types ---
interface Equipment {
  id: number;
  equipment_name: string;
  equipment_id: string;
  equipment_type: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  calibration_method: string | null;
  calibration_interval: string | null;
  calibrated_by: string | null;
  acceptance_criteria: string | null;
  calibration_date: string | null;
  next_due_date: string;
  certificate_number: string | null;
  notes: string | null;
  calibration_status: 'OK' | 'Due Soon' | 'Overdue';
  last_result: string | null;
  last_cal_status: string | null;
  last_error_percent: number | null;
  last_performed_date: string | null;
}

interface HistoryEntry {
  id: number;
  source: string;
  equipment_row_id: number;
  equipment_id: string;
  performed_date: string;
  scheduled_date: string | null;
  performed_by: string | null;
  result: 'Pass' | 'Not Pass';
  action: string | null;
  measured_value: number | null;
  error_percent: number | null;
  cal_status: 'OK' | 'Near criteria' | 'Over criteria' | null;
  remark: string | null;
  file_name: string | null;
  file_path: string | null;
  created_at: string;
}

interface ScheduleRow {
  scheduledDate: string;
  historyEntry: HistoryEntry | null;
  isFuture: boolean;
  isPending: boolean;
}

// --- Constants ---
const CAL_STATUS_STYLE: Record<string, string> = {
  'OK':             'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Near criteria':  'bg-amber-100 text-amber-700 border-amber-200',
  'Over criteria':  'bg-rose-100 text-rose-700 border-rose-200',
};
const CAL_STATUS_DOT: Record<string, string> = {
  'OK':             'bg-emerald-500',
  'Near criteria':  'bg-amber-400',
  'Over criteria':  'bg-rose-500',
};
const RESULT_STYLE: Record<string, string> = {
  'Pass':     'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Not Pass': 'text-rose-700 bg-rose-50 border-rose-200',
};
const CALIB_STATUS_STYLE: Record<string, string> = {
  OK:         'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Due Soon': 'bg-amber-100 text-amber-700 border-amber-200',
  Overdue:    'bg-rose-100 text-rose-700 border-rose-200',
};

const emptyForm = {
  performed_date: new Date().toISOString().slice(0, 10),
  performed_by:   '',
  action:         'Calibration',
  result:         'Pass' as 'Pass' | 'Not Pass',
  measured_value: '',
  error_percent:  '',
  remark:         '',
};

// --- Interval parser ---
function parseInterval(interval: string | null): { months: number } | null {
  if (!interval) return null;
  const s = interval.toLowerCase().trim();
  if (/5\s*year/i.test(s))       return { months: 60 };
  if (/3\s*year/i.test(s))       return { months: 36 };
  if (/2\s*year/i.test(s))       return { months: 24 };
  if (/year|annual|yearly/i.test(s)) return { months: 12 };
  if (/6\s*month|semi.?annual|half.?year/i.test(s)) return { months: 6 };
  if (/quarter|3\s*month/i.test(s)) return { months: 3 };
  if (/2\s*month/i.test(s))      return { months: 2 };
  if (/month|monthly/i.test(s))  return { months: 1 };
  const numMonth = s.match(/(\d+)\s*m/);
  if (numMonth) return { months: parseInt(numMonth[1]) };
  const numYear = s.match(/(\d+)\s*y/);
  if (numYear) return { months: parseInt(numYear[1]) * 12 };
  return null;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function generateSchedule(
  calibrationDate: string | null,
  nextDueDate: string,
  interval: string | null,
): string[] {
  const parsed = parseInterval(interval);
  const months = parsed?.months ?? 12;
  // Anchor: prefer calibration_date, fall back to next_due_date minus one interval
  const anchor = calibrationDate || addMonths(nextDueDate, -months);
  const today  = new Date().toISOString().slice(0, 10);

  const dates: string[] = [];
  const seen  = new Set<string>();

  // Walk forward from anchor until we have 5 dates that are in the future
  let cursor       = anchor;
  let futureCycles = 0;
  // Start from anchor and step forward until we pass today, then collect 5
  // First: advance cursor to the first date >= today
  while (cursor < today) cursor = addMonths(cursor, months);

  // Now collect exactly 5 future dates
  while (futureCycles < 5) {
    if (!seen.has(cursor)) { dates.push(cursor); seen.add(cursor); futureCycles++; }
    cursor = addMonths(cursor, months);
  }

  // Always include next_due_date if it's in the future and not already listed
  if (nextDueDate > today && !seen.has(nextDueDate)) {
    dates.push(nextDueDate);
  }

  return [...new Set(dates)].sort();
}

// --- Component ---
export default function CalibrationHistory() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const isInhouse = location.pathname.includes('/inhouse-calibration/');
  const api       = isInhouse ? inHouseCalibrationAPI : calibrationAPI;
  const fileLabel = isInhouse ? 'Check Sheet' : 'Certificate (CERT)';
  const accent    = isInhouse ? 'teal' : 'indigo';

  const initSelectedId = (location.state as any)?.selectedId as number | undefined;

  const [allEquipment, setAllEquipment] = useState<Equipment[]>([]);
  const [loadingList, setLoadingList]   = useState(true);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedEq, setSelectedEq]     = useState<Equipment | null>(null);

  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [loadingHist, setLoadingHist]   = useState(false);

  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState({ ...emptyForm });
  const [prefillDate, setPrefillDate]   = useState<string | null>(null);
  const [file, setFile]                 = useState<File | null>(null);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [deletingId, setDeletingId]     = useState<number | null>(null);
  const [hiddenRows, setHiddenRows]     = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);
  const [detailEntry, setDetailEntry]   = useState<HistoryEntry | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartType, setChartType]           = useState<'line' | 'bar' | 'scatter'>('line');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track if we have already applied the initial selection
  const initApplied = useRef(false);

  const fetchAllEquipment = useCallback(async () => {
    try {
      setLoadingList(true);
      const res = await api.getAllEquipmentWithHistory();
      const list: Equipment[] = res.data.equipment || [];
      setAllEquipment(list);
      if (initSelectedId && !initApplied.current) {
        initApplied.current = true;
        const found = list.find(e => e.id === initSelectedId);
        if (found) setSelectedEq(found);
      }
    } catch {
      setAllEquipment([]);
    } finally {
      setLoadingList(false);
    }
  }, [api]);

  // Reset list + selection whenever the user switches between external / in-house pages
  useEffect(() => {
    setAllEquipment([]);
    setSelectedEq(null);
    setHistory([]);
    initApplied.current = false;
  }, [api]);

  useEffect(() => { fetchAllEquipment(); }, [fetchAllEquipment]);

  const fetchHistory = useCallback(async (eq: Equipment) => {
    try {
      setLoadingHist(true);
      const res = await api.getHistory(eq.id);
      setHistory(res.data.history || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHist(false);
    }
  }, [api]);

  useEffect(() => {
    if (selectedEq) fetchHistory(selectedEq);
    else setHistory([]);
    setHiddenRows(new Set()); // clear hidden rows when switching tool
  }, [selectedEq, fetchHistory]);

  // --- Schedule rows ---
  const scheduleRows = useMemo((): ScheduleRow[] => {
    if (!selectedEq) return [];
    const today = new Date().toISOString().slice(0, 10);
    const futureDates = generateSchedule(
      selectedEq.calibration_date,
      selectedEq.next_due_date,
      selectedEq.calibration_interval,
    );
    const usedHistIds = new Set<number>();
    const rows: ScheduleRow[] = [];

    // ── 1. Future rows (from schedule, 5 forward dates) ─────────────────
    for (const sd of futureDates) {
      // Fuzzy-match: does any history entry fall within ±15 days?
      let entry: HistoryEntry | undefined;
      const sdTime = new Date(sd).getTime();
      for (const h of history) {
        if (usedHistIds.has(h.id)) continue;
        const matchDate = h.scheduled_date || h.performed_date;
        const diff = Math.abs(new Date(matchDate).getTime() - sdTime);
        if (diff / (1000 * 60 * 60 * 24) <= 15) { entry = h; break; }
      }
      if (entry) usedHistIds.add(entry.id);
      rows.push({
        scheduledDate: sd,
        historyEntry:  entry || null,
        isFuture:      sd > today,
        isPending:     sd <= today && !entry,
      });
    }

    // ── 2. All filled history entries (past records from DB) ─────────────
    // Show every history record regardless of whether it matched a schedule slot
    for (const h of history) {
      if (usedHistIds.has(h.id)) continue; // already shown via future slot
      rows.push({
        scheduledDate: h.scheduled_date || h.performed_date,
        historyEntry:  h,
        isFuture:      false,
        isPending:     false,
      });
      usedHistIds.add(h.id);
    }

    // ── 3. Sort: newest first ─────────────────────────────────────────────
    return rows.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  }, [selectedEq, history]);

  // --- Chart ---
  const criteriaLimit = useMemo(() => {
    if (!selectedEq?.acceptance_criteria) return null;
    const m = String(selectedEq.acceptance_criteria).match(/[\d.]+/);
    return m ? parseFloat(m[0]) : null;
  }, [selectedEq]);

  const chartRows = useMemo(() =>
    [...history].filter(r => r.error_percent != null)
      .sort((a, b) => a.performed_date.localeCompare(b.performed_date)),
    [history]
  );

  const chartData = useMemo(() => {
    const labels = chartRows.map(r => r.performed_date);
    const datasets: any[] = [{
      label: 'Error %',
      data: chartRows.map(r => r.error_percent),
      borderColor: accent === 'teal' ? '#0d9488' : '#6366f1',
      backgroundColor: accent === 'teal' ? 'rgba(13,148,136,0.08)' : 'rgba(99,102,241,0.08)',
      pointBackgroundColor: chartRows.map(r =>
        r.cal_status === 'OK' ? '#10b981' : r.cal_status === 'Near criteria' ? '#f59e0b' : '#ef4444'
      ),
      pointRadius: 5, pointHoverRadius: 7, fill: true, tension: 0.3,
    }];
    if (criteriaLimit != null) {
      datasets.push({ label: `Criteria Limit (±${criteriaLimit})`, data: labels.map(() => criteriaLimit), borderColor: '#ef4444', borderDash: [6,4], borderWidth: 2, pointRadius: 0, fill: false });
      datasets.push({ label: `Near criteria zone (±${(criteriaLimit*0.8).toFixed(4)})`, data: labels.map(() => criteriaLimit*0.8), borderColor: '#f59e0b', borderDash: [3,5], borderWidth: 1.5, pointRadius: 0, fill: false });
    }
    return { labels, datasets };
  }, [chartRows, criteriaLimit, accent]);

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' as const },
      title: { display: true, text: `Error % Trend${selectedEq ? `  ${selectedEq.equipment_name}` : ''}`, font: { size: 13 } },
      tooltip: { callbacks: { afterLabel: (ctx: any) => { const r = chartRows[ctx.dataIndex]; if (!r) return ''; return [`Result: ${r.result}`, `Status: ${r.cal_status}`, r.remark ? `Remark: ${r.remark}` : ''].filter(Boolean).join('\n'); } } },
    },
    scales: { y: { title: { display: true, text: 'Error (%)' } }, x: { title: { display: true, text: 'Date' } } },
  };

  // --- Full chart modal data (error% + measured value, all chart types) ---
  const measRows = useMemo(() =>
    [...history].filter(r => r.measured_value != null)
      .sort((a, b) => a.performed_date.localeCompare(b.performed_date)),
    [history]
  );

  // Combined sorted rows for modal (union of rows with error% or measured_value)
  const modalChartRows = useMemo(() => {
    const ids = new Set<number>();
    const rows: HistoryEntry[] = [];
    [...history]
      .filter(r => r.error_percent != null || r.measured_value != null)
      .sort((a, b) => a.performed_date.localeCompare(b.performed_date))
      .forEach(r => { if (!ids.has(r.id)) { ids.add(r.id); rows.push(r); } });
    return rows;
  }, [history]);

  const modalLabels = modalChartRows.map(r => r.performed_date);
  const accentMain  = accent === 'teal' ? '#0d9488' : '#6366f1';
  const accentLight = accent === 'teal' ? 'rgba(13,148,136,0.15)' : 'rgba(99,102,241,0.15)';

  const buildModalDatasets = (type: 'line' | 'bar' | 'scatter') => {
    const pointColors = modalChartRows.map(r =>
      r.cal_status === 'OK' ? '#10b981'
      : r.cal_status === 'Near criteria' ? '#f59e0b'
      : r.cal_status === 'Over criteria' ? '#ef4444'
      : accentMain
    );

    const datasets: any[] = [];

    // Error % dataset
    if (modalChartRows.some(r => r.error_percent != null)) {
      if (type === 'scatter') {
        datasets.push({
          label: 'Error %',
          data: modalChartRows.map((r, i) => ({ x: i, y: r.error_percent })),
          backgroundColor: pointColors,
          pointRadius: 7, pointHoverRadius: 9,
          yAxisID: 'yErr',
        });
      } else if (type === 'bar') {
        datasets.push({
          label: 'Error %',
          data: modalChartRows.map(r => r.error_percent),
          backgroundColor: pointColors,
          borderColor: pointColors,
          borderWidth: 1,
          yAxisID: 'yErr',
        });
      } else {
        datasets.push({
          label: 'Error %',
          data: modalChartRows.map(r => r.error_percent),
          borderColor: accentMain,
          backgroundColor: accentLight,
          pointBackgroundColor: pointColors,
          pointRadius: 5, pointHoverRadius: 7,
          fill: true, tension: 0.3,
          yAxisID: 'yErr',
        });
      }
    }

    // Measured value dataset
    if (modalChartRows.some(r => r.measured_value != null)) {
      if (type === 'scatter') {
        datasets.push({
          label: 'Measured Value',
          data: modalChartRows.map((r, i) => ({ x: i, y: r.measured_value })),
          backgroundColor: '#94a3b8',
          pointRadius: 6, pointHoverRadius: 8,
          yAxisID: 'yMeas',
        });
      } else if (type === 'bar') {
        datasets.push({
          label: 'Measured Value',
          data: modalChartRows.map(r => r.measured_value),
          backgroundColor: 'rgba(148,163,184,0.5)',
          borderColor: '#94a3b8',
          borderWidth: 1,
          yAxisID: 'yMeas',
        });
      } else {
        datasets.push({
          label: 'Measured Value',
          data: modalChartRows.map(r => r.measured_value),
          borderColor: '#94a3b8',
          backgroundColor: 'rgba(148,163,184,0.08)',
          pointRadius: 4, pointHoverRadius: 6,
          fill: false, tension: 0.3,
          borderDash: [4, 3],
          yAxisID: 'yMeas',
        });
      }
    }

    // Criteria lines (only on line/bar; scatter uses numeric x so skip)
    if (criteriaLimit != null && type !== 'scatter') {
      datasets.push({
        label: `Criteria Limit ±${criteriaLimit}%`,
        data: modalLabels.map(() => criteriaLimit),
        borderColor: '#ef4444', borderDash: [8, 4], borderWidth: 2,
        pointRadius: 0, fill: false, yAxisID: 'yErr',
        type: 'line',
      });
      datasets.push({
        label: `Near criteria zone ±${(criteriaLimit * 0.8).toFixed(4)}%`,
        data: modalLabels.map(() => criteriaLimit * 0.8),
        borderColor: '#f59e0b', borderDash: [4, 5], borderWidth: 1.5,
        pointRadius: 0, fill: false, yAxisID: 'yErr',
        type: 'line',
      });
      datasets.push({
        label: `−Criteria ±${criteriaLimit}%`,
        data: modalLabels.map(() => -criteriaLimit),
        borderColor: '#ef4444', borderDash: [8, 4], borderWidth: 2,
        pointRadius: 0, fill: false, yAxisID: 'yErr',
        type: 'line',
      });
    }

    return { labels: type === 'scatter' ? modalLabels : modalLabels, datasets };
  };

  const modalChartData = useMemo(
    () => buildModalDatasets(chartType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartType, modalChartRows, criteriaLimit, accentMain, accentLight]
  );

  const hasDualAxis = modalChartRows.some(r => r.measured_value != null);

  const modalChartOptions: any = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
      title: {
        display: true,
        text: selectedEq ? `${selectedEq.equipment_name} — ${selectedEq.equipment_id}` : '',
        font: { size: 14, weight: 'bold' },
      },
      tooltip: {
        callbacks: {
          title: (items: any[]) => {
            const idx = items[0]?.dataIndex;
            return modalChartRows[idx]?.performed_date || '';
          },
          afterBody: (items: any[]) => {
            const idx = items[0]?.dataIndex;
            const r = modalChartRows[idx];
            if (!r) return [];
            return [
              `Result: ${r.result}`,
              `Cal Status: ${r.cal_status || '—'}`,
              r.performed_by ? `By: ${r.performed_by}` : '',
              r.remark ? `Remark: ${r.remark}` : '',
            ].filter(Boolean);
          },
        },
      },
    },
    scales: {
      x: { title: { display: true, text: 'Performed Date' } },
      yErr: {
        type: 'linear' as const,
        position: 'left' as const,
        title: { display: true, text: 'Error (%)' },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      ...(hasDualAxis ? {
        yMeas: {
          type: 'linear' as const,
          position: 'right' as const,
          title: { display: true, text: 'Measured Value' },
          grid: { drawOnChartArea: false },
        },
      } : {}),
    },
  }), [selectedEq, modalChartRows, hasDualAxis]);

  // --- Stats ---
  const stats = useMemo(() => ({
    total: history.length,
    pass:  history.filter(r => r.result === 'Pass').length,
    ok:    history.filter(r => r.cal_status === 'OK').length,
    near:  history.filter(r => r.cal_status === 'Near criteria').length,
    over:  history.filter(r => r.cal_status === 'Over criteria').length,
  }), [history]);

  // --- Submit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.performed_date || !form.result || !selectedEq) { setSaveError('Date and Result are required.'); return; }
    try {
      setSaving(true); setSaveError('');
      const fd = new FormData();
      fd.append('equipment_id', selectedEq.equipment_id);
      fd.append('performed_date', form.performed_date);
      fd.append('performed_by', form.performed_by);
      fd.append('action', form.action);
      fd.append('result', form.result);
      // Always send these fields (even empty string) so the backend can clear them when user deletes the value
      fd.append('measured_value', form.measured_value);
      fd.append('error_percent',  form.error_percent);
      fd.append('remark', form.remark);
      if (prefillDate) fd.append('scheduled_date', prefillDate);
      if (file) fd.append('file', file);
      if (editingEntry) {
        await api.updateHistory(editingEntry.id, fd);
      } else {
        await api.addHistory(selectedEq.id, fd);
      }
      setForm({ ...emptyForm }); setPrefillDate(null); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowForm(false);
      setEditingEntry(null);
      await Promise.all([fetchHistory(selectedEq), fetchAllEquipment()]);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save record.');
    } finally { setSaving(false); }
  };

  // --- Delete ---
  const handleDelete = async (histId: number) => {
    if (!confirm('Delete this history record?')) return;
    try {
      setDeletingId(histId);
      await api.deleteHistory(histId);
      if (selectedEq) await Promise.all([fetchHistory(selectedEq), fetchAllEquipment()]);
    } catch {} finally { setDeletingId(null); }
  };

  // --- Hide unfilled row (no DB record — just remove from local schedule view) ---
  const handleHideRow = (scheduledDate: string) => {
    if (!confirm('Remove this row from the schedule?\n(No data will be deleted — it was not filled.)')) return;
    setHiddenRows(prev => new Set([...prev, scheduledDate]));
  };

  // --- Download ---
  const handleDownload = async (entry: HistoryEntry) => {
    try {
      const res = await api.downloadHistoryFile(entry.id);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = entry.file_name || `history_${entry.id}`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  // --- Open modal ---
  const openAddRecord = (scheduledDate?: string) => {
    const d = scheduledDate || new Date().toISOString().slice(0, 10);
    setForm({ ...emptyForm, performed_date: d });
    setPrefillDate(scheduledDate || null);
    setEditingEntry(null);
    setSaveError(''); setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowForm(true);
  };

  const openEditRecord = (entry: HistoryEntry) => {
    setEditingEntry(entry);
    setForm({
      performed_date: entry.performed_date,
      performed_by:   entry.performed_by || '',
      action:         entry.action || 'Calibration',
      result:         entry.result,
      measured_value: entry.measured_value != null ? String(entry.measured_value) : '',
      error_percent:  entry.error_percent  != null ? String(entry.error_percent)  : '',
      remark:         entry.remark || '',
    });
    setPrefillDate(entry.scheduled_date || null);
    setSaveError(''); setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowForm(true);
  };

  // --- Filtered list ---
  const filteredEquipment = useMemo(() => {
    const q = search.toLowerCase();
    return allEquipment.filter(eq => {
      const matchQ = !q || eq.equipment_name.toLowerCase().includes(q) || eq.equipment_id.toLowerCase().includes(q) || eq.location?.toLowerCase().includes(q);
      const matchS = filterStatus === 'ALL' || eq.calibration_status === filterStatus;
      return matchQ && matchS;
    });
  }, [allEquipment, search, filterStatus]);

  // --- Interval label ---
  const intervalLabel = useMemo(() => {
    if (!selectedEq?.calibration_interval) return null;
    const parsed = parseInterval(selectedEq.calibration_interval);
    if (!parsed) return selectedEq.calibration_interval;
    const map: Record<number, string> = { 1: 'Monthly', 3: 'Quarterly', 6: 'Semi-annual', 12: 'Yearly', 24: '2 Yearly', 36: '3 Yearly', 60: '5 Yearly' };
    return map[parsed.months] || `Every ${parsed.months} months`;
  }, [selectedEq]);

  const accentBg    = accent === 'teal' ? 'bg-teal-600'       : 'bg-indigo-600';
  const accentHover = accent === 'teal' ? 'hover:bg-teal-700' : 'hover:bg-indigo-700';
  const accentBorder= accent === 'teal' ? 'border-teal-300'   : 'border-indigo-300';
  const accentText  = accent === 'teal' ? 'text-teal-700'     : 'text-indigo-700';
  const accentFocus = accent === 'teal' ? 'focus:border-teal-400' : 'focus:border-indigo-400';

  return (
    <div className="flex gap-0 h-[calc(100vh-4rem)] overflow-hidden">

      {/* LEFT PANEL */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white">
        <div className={`px-4 py-3 border-b border-slate-200 ${accent === 'teal' ? 'bg-teal-50' : 'bg-indigo-50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-white/60 text-slate-500 transition-colors">
              <ArrowLeft size={16} />
            </button>
            <h2 className={`font-bold text-sm ${accentText}`}>
              {isInhouse ? 'In-House Calibration' : 'External Calibration'}
            </h2>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tools"
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-300 bg-white" />
          </div>
          <div className="flex gap-1 mt-2 flex-wrap">
            {(['ALL', 'OK', 'Due Soon', 'Overdue'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={['text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-colors',
                  filterStatus === s
                    ? s === 'Overdue' ? 'bg-rose-500 text-white border-rose-500'
                    : s === 'Due Soon' ? 'bg-amber-500 text-white border-amber-500'
                    : s === 'OK' ? 'bg-emerald-500 text-white border-emerald-500'
                    : `${accentBg} text-white border-transparent`
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300',
                ].join(' ')}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500 mb-2" /><p>Loading</p>
            </div>
          ) : filteredEquipment.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              <Gauge size={24} className="mx-auto mb-2 opacity-30" /><p>No equipment found</p>
            </div>
          ) : filteredEquipment.map(eq => {
            const isSelected = selectedEq?.id === eq.id;
            return (
              <button key={eq.id} onClick={() => setSelectedEq(eq)}
                className={['w-full text-left px-4 py-3 border-b border-slate-100 transition-colors',
                  isSelected
                    ? accent === 'teal' ? 'bg-teal-50 border-l-2 border-l-teal-500' : 'bg-indigo-50 border-l-2 border-l-indigo-500'
                    : 'hover:bg-slate-50 border-l-2 border-l-transparent',
                ].join(' ')}>
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isSelected ? accentText : 'text-slate-800'}`}>{eq.equipment_name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{eq.equipment_id}</p>
                    {eq.location && <p className="text-[10px] text-slate-400 truncate">{eq.location}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${CALIB_STATUS_STYLE[eq.calibration_status]}`}>{eq.calibration_status}</span>
                    {eq.last_cal_status && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold border ${CAL_STATUS_STYLE[eq.last_cal_status] || ''}`}>{eq.last_cal_status}</span>
                    )}
                  </div>
                </div>
                {eq.last_performed_date ? (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Last: {eq.last_performed_date}
                    {eq.last_result && <span className={`ml-1 font-semibold ${eq.last_result === 'Pass' ? 'text-emerald-600' : 'text-rose-600'}`}>  {eq.last_result}</span>}
                  </p>
                ) : <p className="text-[10px] text-slate-300 mt-1 italic">No records yet</p>}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-100">
          <button onClick={fetchAllEquipment} className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
            <RefreshCw size={11} /> Refresh list
          </button>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {!selectedEq ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-slate-400">
              <History size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-lg font-semibold text-slate-500">Select a tool</p>
              <p className="text-sm mt-1">Click any tool from the left panel to view its calibration history</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* ── FROZEN TOP SECTION ── */}
            <div className="flex-shrink-0 overflow-y-auto p-5 space-y-5 max-h-[55%]">

            {/* Tool info card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${CALIB_STATUS_STYLE[selectedEq.calibration_status]}`}>{selectedEq.calibration_status}</span>
                    <span className="font-mono text-xs text-slate-400">{selectedEq.equipment_id}</span>
                    {selectedEq.calibration_interval && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${accent === 'teal' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                        <Calendar size={10} className="inline mr-1" />{intervalLabel || selectedEq.calibration_interval}
                      </span>
                    )}
                    {isInhouse
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600 font-semibold border border-teal-200">In-House</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-semibold border border-indigo-200">External</span>
                    }
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedEq.equipment_name}</h2>
                  {selectedEq.manufacturer && <p className="text-sm text-slate-500">{selectedEq.manufacturer}{selectedEq.model ? `  ${selectedEq.model}` : ''}</p>}
                </div>
                <button onClick={() => openAddRecord()} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow transition-colors flex-shrink-0 ${accentBg} ${accentHover}`}>
                  <Plus size={15} /> Add Record
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {([
                  { label: 'Type / Category', value: selectedEq.equipment_type },
                  { label: 'Location', value: selectedEq.location },
                  { label: 'Serial No.', value: selectedEq.serial_number },
                  { label: 'Cal. Lab / Method', value: selectedEq.calibrated_by || selectedEq.calibration_method },
                  { label: 'Last Calibrated', value: selectedEq.calibration_date },
                  { label: 'Next Due', value: selectedEq.next_due_date },
                  { label: 'Acceptance Criteria', value: selectedEq.acceptance_criteria ? `${selectedEq.acceptance_criteria}${criteriaLimit != null ? `  (OK < ${criteriaLimit}%  Near ≥${(criteriaLimit*0.8).toFixed(3)}%  Over > ${criteriaLimit}%)` : ''}` : null },
                  { label: 'Reference / Sheet', value: selectedEq.certificate_number },
                ] as { label: string; value: string | null }[]).filter(x => x.value).map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
                    <p className="text-xs text-slate-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Total',         value: stats.total, color: 'text-slate-700 bg-slate-50 border-slate-200' },
                { label: 'Pass',          value: stats.pass,  color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { label: 'OK',            value: stats.ok,    color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { label: 'Near criteria', value: stats.near,  color: 'text-amber-700 bg-amber-50 border-amber-200' },
                { label: 'Over criteria', value: stats.over,  color: 'text-rose-700 bg-rose-50 border-rose-200' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border p-3 text-center shadow-sm ${s.color}`}>
                  <p className="text-xl font-black">{s.value}</p>
                  <p className="text-[10px] mt-0.5 font-medium leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            {chartRows.length >= 2 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <Line data={chartData} options={chartOptions} />
                <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-3 px-1">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> OK</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Near criteria</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> Over criteria</span>
                </div>
              </div>
            )}

            </div>

            {/* ── SCROLLABLE BOTTOM — TABLE ONLY ── */}
            <div className="flex-1 panel-scroll p-5 pt-0 min-h-0">

            {/* Schedule / History table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">Calibration Schedule &amp; History</p>
                  <p className="text-xs text-slate-400 mt-0.5">Auto-generated from interval · click pending row or use Add button to fill result</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{scheduleRows.length} rows</span>
                  {modalChartRows.length >= 2 && (
                    <button onClick={() => setShowChartModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors shadow-sm">
                      <BarChart2 size={13} /> Chart
                    </button>
                  )}
                  <button onClick={() => openAddRecord()} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow transition-colors ${accentBg} ${accentHover}`}>
                    <Plus size={13} /> Add Record
                  </button>
                </div>
              </div>

              {loadingHist ? (
                <div className="p-10 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mb-2" />
                  <p className="text-sm">Loading</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Scheduled Date</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Performed Date</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Performed By</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Action</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Result</th>
                        <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs">Measured Value</th>
                        <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs">Error %</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Cal Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">Remark</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs">{fileLabel}</th>
                        <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {scheduleRows.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                            <Calendar size={28} className="mx-auto mb-2 opacity-30" />
                            <p className="text-sm font-medium">No schedule generated</p>
                            <p className="text-xs mt-1">Add a calibration date and interval to auto-generate the schedule.</p>
                          </td>
                        </tr>
                      ) : scheduleRows.filter(row => !hiddenRows.has(row.scheduledDate)).map((row, idx) => {
                        const entry = row.historyEntry;
                        const today = new Date().toISOString().slice(0, 10);
                        const isToday = row.scheduledDate === today;
                        const rowBg = row.isFuture
                          ? 'bg-slate-50/60 opacity-70'
                          : row.isPending
                            ? 'bg-amber-50/60 hover:bg-amber-50 cursor-pointer'
                            : 'hover:bg-slate-50/60';

                        return (
                          <tr key={entry ? `h-${entry.id}` : `s-${idx}-${row.scheduledDate}`}
                            className={`transition-colors ${rowBg}`}
                            onClick={() => { if (row.isPending) openAddRecord(row.scheduledDate); }}
                            onDoubleClick={() => { if (entry) setDetailEntry(entry); }}
                            title={row.isPending ? 'Click to fill calibration result' : entry ? 'Double-click for full detail' : undefined}>

                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {row.isFuture && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">FUTURE</span>}
                                {row.isPending && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-700">PENDING</span>}
                                {isToday && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-200 text-indigo-700">TODAY</span>}
                                <span className={`text-xs font-medium ${row.isPending ? 'text-amber-700' : row.isFuture ? 'text-slate-400' : 'text-slate-700'}`}>
                                  {row.scheduledDate}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                              {entry ? entry.performed_date : row.isPending ? (
                                <button onClick={e => { e.stopPropagation(); openAddRecord(row.scheduledDate); }}
                                  className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg border transition-colors ${accentBorder} ${accentText} hover:bg-slate-50`}>
                                  <Plus size={10} /> Fill Result
                                </button>
                              ) : <span className="text-slate-300 text-xs"></span>}
                            </td>

                            <td className="px-4 py-3 text-xs text-slate-500">{entry?.performed_by || (entry ? '' : '')}</td>

                            <td className="px-4 py-3">
                              {entry?.action ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-sky-50 text-sky-700 border-sky-200">
                                  {entry.action}
                                </span>
                              ) : (entry ? <span className="text-slate-300 text-xs">—</span> : null)}
                            </td>

                            <td className="px-4 py-3">
                              {entry && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${RESULT_STYLE[entry.result]}`}>
                                  {entry.result === 'Pass' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                                  {entry.result}
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                              {entry?.measured_value != null ? entry.measured_value : (entry ? '' : '')}
                            </td>

                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {entry?.error_percent != null ? (
                                <span className={entry.cal_status === 'OK' ? 'text-emerald-600' : entry.cal_status === 'Near criteria' ? 'text-amber-600' : 'text-rose-600'}>
                                  {entry.error_percent}%
                                </span>
                              ) : (entry ? <span className="text-slate-300"></span> : '')}
                            </td>

                            <td className="px-4 py-3">
                              {entry?.cal_status && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CAL_STATUS_STYLE[entry.cal_status] || ''}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${CAL_STATUS_DOT[entry.cal_status] || 'bg-slate-300'}`} />
                                  {entry.cal_status}
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-[11px] text-slate-500 max-w-[140px] truncate">
                              {entry?.remark || (entry ? '' : '')}
                            </td>

                            <td className="px-4 py-3">
                              {entry?.file_path ? (
                                <button onClick={e => { e.stopPropagation(); handleDownload(entry); }}
                                  className="flex items-center gap-1 text-[11px] text-indigo-600 hover:underline">
                                  <Download size={11} />
                                  {entry.file_name ? (entry.file_name.length > 16 ? entry.file_name.slice(0,16)+'' : entry.file_name) : 'Download'}
                                </button>
                              ) : entry ? <span className="text-slate-300 text-xs"></span> : null}
                            </td>

                            <td className="px-4 py-3 text-center">
                              {entry ? (
                                /* Filled row — delete from DB */
                                <button
                                  onClick={e => { e.stopPropagation(); handleDelete(entry.id); }}
                                  disabled={deletingId === entry.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 transition-colors disabled:opacity-40"
                                  title="Delete this record">
                                  {deletingId === entry.id
                                    ? <span className="inline-block w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                    : <Trash2 size={12} />}
                                  Delete
                                </button>
                              ) : row.isPending ? (
                                /* Pending (past, unfilled) — hide from local schedule */
                                <button
                                  onClick={e => { e.stopPropagation(); handleHideRow(row.scheduledDate); }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                                  title="Remove this row from view">
                                  <Trash2 size={12} />
                                  Remove
                                </button>
                              ) : row.isFuture ? (
                                <span className="text-[10px] text-slate-300 italic">future</span>
                              ) : null}
                            </td>
                          </tr>
                        );
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

      {/* Add / Edit Record Modal */}
      {showForm && selectedEq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingEntry ? 'Edit Calibration Record' : 'Add Calibration Record'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedEq.equipment_name}  {selectedEq.equipment_id}
                  {prefillDate && <span className="ml-2 text-amber-600 font-semibold"> Scheduled: {prefillDate}</span>}
                </p>
              </div>
              <button onClick={() => { setShowForm(false); setEditingEntry(null); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            {saveError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle size={14} /> {saveError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Performed Date <span className="text-rose-500">*</span></label>
                  <input type="date" value={form.performed_date} onChange={e => setForm(f => ({ ...f, performed_date: e.target.value }))} required
                    className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none ${accentFocus}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Performed By</label>
                  <input value={form.performed_by} onChange={e => setForm(f => ({ ...f, performed_by: e.target.value }))}
                    placeholder={isInhouse ? 'e.g. QC Team' : 'e.g. CLC Lab'}
                    className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none ${accentFocus}`} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Action</label>
                <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
                  className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none ${accentFocus} bg-white`}>
                  <option value="Calibration">Calibration</option>
                  <option value="Verify">Verify</option>
                  <option value="Checking">Checking</option>
                  <option value="Verification">Verification</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Result <span className="text-rose-500">*</span></label>
                <div className="flex gap-3">
                  {(['Pass', 'Not Pass'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setForm(f => ({ ...f, result: r }))}
                      className={['flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors',
                        form.result === r ? (r === 'Pass' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600')
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                      ].join(' ')}>
                      {r === 'Pass' ? ' Pass' : ' Not Pass'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Measured Value</label>
                  <input type="number" step="any" value={form.measured_value} onChange={e => setForm(f => ({ ...f, measured_value: e.target.value }))} placeholder="e.g. 100.02"
                    className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none ${accentFocus}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Error % <span className="text-slate-400 font-normal">(for status)</span></label>
                  <input type="number" step="any" value={form.error_percent} onChange={e => setForm(f => ({ ...f, error_percent: e.target.value }))} placeholder="e.g. 0.02"
                    className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none ${accentFocus}`} />
                </div>
              </div>

              {selectedEq.acceptance_criteria && (
                <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500">
                  <span className="font-semibold text-slate-600">Criteria: </span>{selectedEq.acceptance_criteria}
                  {criteriaLimit != null && <span className="ml-2 text-slate-400"> OK &lt; {criteriaLimit}%  Near ≥{(criteriaLimit*0.8).toFixed(4)}%  Over &gt; {criteriaLimit}%</span>}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Remark / Notes</label>
                <textarea value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} rows={2} placeholder="Optional observations or comments"
                  className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none ${accentFocus} resize-none`} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Upload {fileLabel} <span className="text-slate-400 font-normal">(PDF, PNG, JPG, DOCX  max 20 MB)</span>
                </label>
                <div className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer ${file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-indigo-300 bg-slate-50'}`}
                  onClick={() => fileInputRef.current?.click()}>
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-700">
                      <FileText size={16} />
                      <span className="text-sm font-medium">{file.name}</span>
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
                <button type="submit" disabled={saving} className={`px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-60 ${accentBg} ${accentHover}`}>
                  {saving ? 'Saving…' : editingEntry ? 'Update Record' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chart Modal */}
      {showChartModal && selectedEq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6"
          onClick={() => setShowChartModal(false)}>
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart2 size={18} className="text-violet-500" />
                  Calibration Chart
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedEq.equipment_name} · {selectedEq.equipment_id}</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Chart type toggle */}
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                  {(['line', 'bar', 'scatter'] as const).map(t => (
                    <button key={t} onClick={() => setChartType(t)}
                      className={['px-3 py-1.5 capitalize transition-colors',
                        chartType === t
                          ? 'bg-violet-600 text-white'
                          : 'bg-white text-slate-500 hover:bg-slate-50',
                      ].join(' ')}>
                      {t === 'line' ? '📈 Line' : t === 'bar' ? '📊 Bar' : '⬤ Scatter'}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowChartModal(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
              </div>
            </div>

            {/* Chart area */}
            <div className="flex-1 overflow-y-auto p-6">
              {modalChartRows.length < 2 ? (
                <div className="flex items-center justify-center h-48 text-slate-400">
                  <p className="text-sm">Not enough data points to render a chart.</p>
                </div>
              ) : (
                <>
                  <div style={{ height: 380 }}>
                    {chartType === 'bar' ? (
                      <Bar data={modalChartData} options={modalChartOptions} />
                    ) : chartType === 'scatter' ? (
                      <Scatter
                        data={{
                          datasets: modalChartData.datasets.map(ds => ({
                            ...ds,
                            data: modalChartRows.map((r, i) => ({
                              x: i,
                              y: ds.label?.startsWith('Error') ? r.error_percent
                                : ds.label?.startsWith('Measured') ? r.measured_value
                                : null,
                            })).filter(p => p.y != null),
                          })),
                        }}
                        options={{
                          ...modalChartOptions,
                          scales: {
                            x: {
                              type: 'linear' as const,
                              title: { display: true, text: 'Record index' },
                              ticks: {
                                callback: (val: any) => modalLabels[val] || val,
                              },
                            },
                            yErr: { ...modalChartOptions.scales?.yErr },
                            ...(hasDualAxis ? { yMeas: { ...modalChartOptions.scales?.yMeas } } : {}),
                          },
                        }}
                      />
                    ) : (
                      <Line data={modalChartData} options={modalChartOptions} />
                    )}
                  </div>

                  {/* Legend / info */}
                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500 px-1 border-t border-slate-100 pt-3">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> OK</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Near criteria</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> Over criteria</span>
                    {criteriaLimit != null && (
                      <>
                        <span className="flex items-center gap-1.5 ml-4">
                          <span className="inline-block w-6 border-t-2 border-dashed border-rose-500" /> Criteria limit ±{criteriaLimit}%
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-6 border-t-2 border-dashed border-amber-400" /> Near criteria zone ±{(criteriaLimit * 0.8).toFixed(4)}%
                        </span>
                      </>
                    )}
                    {hasDualAxis && (
                      <span className="flex items-center gap-1.5 ml-4">
                        <span className="inline-block w-6 border-t-2 border-slate-400" /> Measured Value (right axis)
                      </span>
                    )}
                  </div>

                  {/* Data table summary */}
                  <div className="mt-4 table-wrap">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Date</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Measured Value</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Error %</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Cal Status</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalChartRows.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5 font-mono text-slate-700">{r.performed_date}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-700">{r.measured_value ?? '—'}</td>
                            <td className={`px-3 py-1.5 text-right font-mono font-semibold ${r.cal_status === 'OK' ? 'text-emerald-600' : r.cal_status === 'Near criteria' ? 'text-amber-600' : r.cal_status === 'Over criteria' ? 'text-rose-600' : 'text-slate-600'}`}>
                              {r.error_percent != null ? `${r.error_percent}%` : '—'}
                            </td>
                            <td className="px-3 py-1.5">
                              {r.cal_status && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${CAL_STATUS_STYLE[r.cal_status] || ''}`}>{r.cal_status}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${RESULT_STYLE[r.result] || ''}`}>{r.result}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailEntry && selectedEq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8 overflow-y-auto"
          onClick={() => setDetailEntry(null)}>
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl p-6"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${RESULT_STYLE[detailEntry.result]}`}>
                    {detailEntry.result === 'Pass' ? <CheckCircle size={11} className="inline mr-1" /> : <XCircle size={11} className="inline mr-1" />}
                    {detailEntry.result}
                  </span>
                  {detailEntry.cal_status && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${CAL_STATUS_STYLE[detailEntry.cal_status] || ''}`}>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${CAL_STATUS_DOT[detailEntry.cal_status] || 'bg-slate-300'}`} />
                      {detailEntry.cal_status}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900">Calibration Record Detail</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedEq.equipment_name} · {selectedEq.equipment_id}</p>
              </div>
              <button onClick={() => setDetailEntry(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X size={20} /></button>
            </div>

            {/* Fields grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Scheduled Date</p>
                <p className="mt-0.5 font-medium text-slate-800">{detailEntry.scheduled_date || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Performed Date</p>
                <p className="mt-0.5 font-medium text-slate-800">{detailEntry.performed_date}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Performed By</p>
                <p className="mt-0.5 font-medium text-slate-800">{detailEntry.performed_by || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Action</p>
                {detailEntry.action ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-sky-50 text-sky-700 border-sky-200 mt-0.5">
                    {detailEntry.action}
                  </span>
                ) : <p className="mt-0.5 text-slate-400">—</p>}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Result</p>
                <p className={`mt-0.5 font-semibold ${detailEntry.result === 'Pass' ? 'text-emerald-700' : 'text-rose-700'}`}>{detailEntry.result}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Measured Value</p>
                <p className="mt-0.5 font-mono text-slate-800">{detailEntry.measured_value != null ? detailEntry.measured_value : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Error %</p>
                <p className={`mt-0.5 font-mono font-semibold ${detailEntry.cal_status === 'OK' ? 'text-emerald-700' : detailEntry.cal_status === 'Near criteria' ? 'text-amber-600' : detailEntry.cal_status === 'Over criteria' ? 'text-rose-600' : 'text-slate-800'}`}>
                  {detailEntry.error_percent != null ? `${detailEntry.error_percent}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Cal Status</p>
                <p className="mt-0.5 font-semibold text-slate-800">{detailEntry.cal_status || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Acceptance Criteria</p>
                <p className="mt-0.5 text-slate-600">{selectedEq.acceptance_criteria || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Remark / Notes</p>
                <p className="mt-0.5 text-slate-700 whitespace-pre-wrap">{detailEntry.remark || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Certificate / File</p>
                {detailEntry.file_path ? (
                  <button onClick={() => handleDownload(detailEntry)} className="mt-0.5 flex items-center gap-1.5 text-indigo-600 hover:underline font-medium text-sm">
                    <Download size={13} /> {detailEntry.file_name || 'Download'}
                  </button>
                ) : <p className="mt-0.5 text-slate-400">—</p>}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Record Created</p>
                <p className="mt-0.5 text-slate-500 text-xs">{detailEntry.created_at}</p>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => { setDetailEntry(null); openEditRecord(detailEntry); }}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${accent === 'teal' ? 'text-teal-600 bg-teal-50 border-teal-200 hover:bg-teal-100' : 'text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100'}`}>
                <Pencil size={14} /> Edit Record
              </button>
              <button onClick={() => setDetailEntry(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}