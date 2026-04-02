import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Scatter } from 'react-chartjs-2';
import { BarChart3, FileText, Clock, TrendingUp, Filter, X, MessageSquare, Upload, RefreshCw } from 'lucide-react';
import axios from 'axios';
import APTX_DATA, { type AptxRecord } from './aptxData';

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
);

// ─── Data from IATF_KPI.xlsx ─────────────────────────────────────────────────
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

const REVISED_REPORTS: (number | null)[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, null];

// Lead Time data is now computed from APTX scatter data below.

const EVALUATION = {
  hub:  [17.5, 25, 25, 32.26, 40.73, 42.06, 22.58, 57.08, 65.32, 29.44, 0, null],
  pt:   [20.41, 36.29, 36.43, 7.53, 7.8, 11.09, 13.44, 10.83, 10.22, 11.29, 0, null],
  rate: [0.1896, 0.30645, 0.30715, 0.19859, 0.24265, 0.26575, 0.1801, 0.33955, 0.3777, 0.20365, null, null],
};

const LEAD_TIME_TARGET = 15;
const EVALUATION_TARGET = 15;

// ─── Component ────────────────────────────────────────────────────────────────
export default function KPIFlowchart() {
  const [activeTab, setActiveTab] = useState<'reports' | 'leadtime' | 'evaluation'>('leadtime');

  // --- Scatter click state ---
  type PointInfo = { r_id: string; x: string; y: number; done: boolean; cat: string; grp: string; finish: string; remark: string };
  const [selectedPoints, setSelectedPoints] = useState<PointInfo[]>([]);

  // --- CSV upload state (shared via server API) ---
  const API_URL = import.meta.env.VITE_API_URL || '/api';
  const authH = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const [csvData, setCsvData] = useState<AptxRecord[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load shared CSV data from server on mount
  useEffect(() => {
    axios.get(`${API_URL}/kpi-csv`, authH())
      .then(r => {
        if (r.data?.data) {
          setCsvData(r.data.data);
          setCsvFileName(r.data.fileName || '');
        }
      })
      .catch(() => {});
  }, []);

  /** Parse pipe-delimited CSV and filter for Warranty/Investigation + HUB/Powertrain */
  const parseCsv = useCallback((text: string): AptxRecord[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const hdr = lines[0].split('|').map(h => h.trim().replace(/^"|"$/g, ''));
    const idx = (name: string) => hdr.indexOf(name);
    const iR = idx('Report_no'), iA = idx('Assign_date'), iF = idx('Finish_date');
    const iG = idx('Product_group'), iC = idx('Work_category'), iM = idx('Remark');
    if (iR < 0 || iA < 0 || iF < 0 || iG < 0 || iC < 0) return [];
    const records: AptxRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('|').map(c => c.trim().replace(/^"|"$/g, ''));
      const cat = cols[iC];
      const grp = cols[iG];
      if (cat !== 'Investigation' && cat !== 'Warranty') continue;
      if (grp !== 'HUB' && grp !== 'Powertrain') continue;
      records.push({
        r: cols[iR],
        a: cols[iA],
        f: cols[iF],
        c: cat === 'Investigation' ? 'I' : 'W',
        g: grp === 'HUB' ? 'H' : 'P',
        m: iM >= 0 ? (cols[iM] || '') : '',
      });
    }
    return records;
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(reader.result as string);
      setCsvData(parsed);
      setSelectedPoints([]);
      // Save to server so all users can see it
      axios.post(`${API_URL}/kpi-csv`, { fileName: file.name, data: parsed }, authH())
        .catch(() => {});
    };
    reader.readAsText(file);
    // reset so same file can be re-selected
    e.target.value = '';
  }, [parseCsv]);

  const handleResetData = useCallback(() => {
    setCsvData(null);
    setCsvFileName('');
    setSelectedPoints([]);
    setShowResetConfirm(false);
    // Remove from server
    axios.delete(`${API_URL}/kpi-csv`, authH()).catch(() => {});
  }, []);

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Active data: CSV if uploaded, otherwise built-in
  const activeData = csvData ?? APTX_DATA;

  // --- Chart 1: No. of Revised Reports (Bar) ---
  const revisedReportsData = {
    labels: MONTHS,
    datasets: [{
      label: 'No. of Revised Reports',
      data: REVISED_REPORTS,
      backgroundColor: 'rgba(99, 102, 241, 0.7)',
      borderColor: 'rgb(99, 102, 241)',
      borderWidth: 1,
      borderRadius: 4,
    }],
  };
  const revisedReportsOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: { label: (ctx: any) => ctx.parsed.y === 0 ? 'No data (-)' : `${ctx.parsed.y} reports` },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 11 } },
        title: { display: true, text: 'Count', font: { size: 12, weight: 'bold' as const } },
        grid: { color: '#e2e8f0' },
      },
      x: { ticks: { font: { size: 11 } }, grid: { display: false } },
    },
  };

  // --- Business day calculator (exclude Sat/Sun) ---
  function businessDays(startStr: string, endStr: string): number {
    const s = new Date(startStr), e = new Date(endStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    let count = 0;
    const cur = new Date(s);
    cur.setDate(cur.getDate() + 1);
    while (cur <= e) {
      const d = cur.getDay();
      if (d !== 0 && d !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  // --- Scatter filter state ---
  const [catFilter, setCatFilter] = useState<'All' | 'I' | 'W'>('All');
  const [grpFilter, setGrpFilter] = useState<'All' | 'H' | 'P'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Done' | 'Open'>('All');

  const TODAY = '2026-03-30';

  // Processed scatter data
  const processedAptx = useMemo(() =>
    activeData.map(r => {
      const endDate = r.f || TODAY;
      const elapsed = businessDays(r.a, endDate);
      return { ...r, elapsed, done: !!r.f };
    }),
    [activeData]
  );

  const filteredAptx = useMemo(() =>
    processedAptx.filter(r => {
      if (catFilter !== 'All' && r.c !== catFilter) return false;
      if (grpFilter !== 'All' && r.g !== grpFilter) return false;
      if (statusFilter === 'Done' && !r.done) return false;
      if (statusFilter === 'Open' && r.done) return false;
      return true;
    }),
    [processedAptx, catFilter, grpFilter, statusFilter]
  );

  // Group scatter points by group+category
  const SCATTER_COLORS: Record<string, { bg: string; border: string }> = {
    'H-I': { bg: 'rgba(99,102,241,0.75)',  border: '#6366f1' },
    'H-W': { bg: 'rgba(59,130,246,0.75)',  border: '#3b82f6' },
    'P-I': { bg: 'rgba(249,115,22,0.75)',  border: '#f97316' },
    'P-W': { bg: 'rgba(234,179,8,0.75)',   border: '#eab308' },
  };
  const SCATTER_LABELS: Record<string, string> = {
    'H-I': 'HUB – Investigation',
    'H-W': 'HUB – Warranty',
    'P-I': 'Powertrain – Investigation',
    'P-W': 'Powertrain – Warranty',
  };

  const scatterDatasets = useMemo(() => {
    const xLabels = [...new Set(filteredAptx.map(r => r.a))].sort();
    const groups: Record<string, { x: string; y: number; r_id: string; done: boolean }[]> = {};
    filteredAptx.forEach(r => {
      const key = `${r.g}-${r.c}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ x: r.a, y: r.elapsed, r_id: r.r, done: r.done });
    });
    const datasets = Object.entries(groups).map(([key, points]) => {
      const col = SCATTER_COLORS[key] || { bg: 'rgba(148,163,184,0.7)', border: '#94a3b8' };
      return {
        label: SCATTER_LABELS[key] || key,
        data: points,
        backgroundColor: points.map(p => p.done ? col.bg : col.bg.replace('0.75', '0.3')),
        borderColor: points.map(p => p.done ? col.border : col.border + '66'),
        borderWidth: 1.5,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointStyle: points.map(p => p.done ? 'circle' as const : 'rectRot' as const),
      };
    });
    return { xLabels, datasets };
  }, [filteredAptx]);

  const scatterChartData = {
    labels: scatterDatasets.xLabels,
    datasets: [
      ...scatterDatasets.datasets,
      {
        label: `Target (≤ ${LEAD_TIME_TARGET} days)`,
        data: scatterDatasets.xLabels.map(x => ({ x, y: LEAD_TIME_TARGET })),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 0,
        showLine: true,
        type: 'line' as const,
      },
    ],
  };

  const handleScatterClick = useCallback((_event: any, elements: any[], chart: any) => {
    if (!elements.length) return;
    const seen = new Set<string>();
    const pts: PointInfo[] = [];
    for (const el of elements) {
      const ds = chart.data.datasets[el.datasetIndex];
      const pt = ds.data[el.index];
      if (!pt?.r_id || seen.has(pt.r_id)) continue;
      seen.add(pt.r_id);
      const src = activeData.find(d => d.r === pt.r_id);
      pts.push({
        r_id: pt.r_id,
        x: pt.x,
        y: pt.y,
        done: pt.done,
        cat: src?.c === 'I' ? 'Investigation' : 'Warranty',
        grp: src?.g === 'H' ? 'HUB' : 'Powertrain',
        finish: src?.f || '',
        remark: src?.m || '',
      });
    }
    if (pts.length) setSelectedPoints(pts);
  }, [activeData]);

  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: handleScatterClick,
    plugins: {
      legend: { position: 'top' as const, labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const p = ctx.raw;
            if (!p.r_id) return `Target: ${LEAD_TIME_TARGET} days`;
            return [`${p.r_id} — ${p.done ? 'Completed' : 'In Progress'}`, `Assign: ${p.x}`, `Elapsed: ${p.y} business days`];
          },
        },
      },
    },
    scales: {
      x: {
        type: 'category' as const,
        title: { display: true, text: 'Assign (Issue) Date', font: { size: 12, weight: 'bold' as const } },
        ticks: { maxRotation: 45, font: { size: 9 }, maxTicksLimit: 20 },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Elapsed Business Days', font: { size: 12, weight: 'bold' as const } },
        ticks: { font: { size: 11 } },
        grid: { color: '#e2e8f0' },
      },
    },
  };

  // Scatter summary stats
  const completedAptx = filteredAptx.filter(r => r.done);
  const openAptx = filteredAptx.filter(r => !r.done);
  const avgElapsed = completedAptx.length
    ? (completedAptx.reduce((s, r) => s + r.elapsed, 0) / completedAptx.length)
    : 0;
  const maxElapsed = completedAptx.length ? Math.max(...completedAptx.map(r => r.elapsed)) : 0;

  // --- Chart 2: old Lead Time line chart replaced by scatter above ---

  // --- Chart 3: KPI Evaluation (Grouped Bar: HUB + PT, Line: Rate) ---
  const evaluationData = {
    labels: MONTHS,
    datasets: [
      {
        type: 'bar' as const,
        label: 'HUB (%)',
        data: EVALUATION.hub,
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
        borderRadius: 3,
        order: 2,
      },
      {
        type: 'bar' as const,
        label: 'PT (%)',
        data: EVALUATION.pt,
        backgroundColor: 'rgba(249, 115, 22, 0.7)',
        borderColor: 'rgb(249, 115, 22)',
        borderWidth: 1,
        borderRadius: 3,
        order: 2,
      },
      {
        type: 'line' as const,
        label: 'Overall Rate',
        data: EVALUATION.rate.map(v => v === null ? null : +(v * 100).toFixed(2)),
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        yAxisID: 'y1',
        fill: false,
        order: 1,
      },
      {
        type: 'line' as const,
        label: `Target (${EVALUATION_TARGET}%)`,
        data: MONTHS.map(() => EVALUATION_TARGET),
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 0,
        fill: false,
        order: 0,
      },
    ],
  };
  const evaluationOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { usePointStyle: true, padding: 16, font: { size: 12 } } },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            if (ctx.parsed.y === null) return 'No data yet';
            const suffix = ctx.dataset.yAxisID === 'y1' ? '%' : '%';
            return `${ctx.dataset.label}: ${ctx.parsed.y}${suffix}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        position: 'left' as const,
        ticks: { font: { size: 11 } },
        title: { display: true, text: 'HUB / PT (%)', font: { size: 12, weight: 'bold' as const } },
        grid: { color: '#e2e8f0' },
      },
      y1: {
        beginAtZero: true,
        max: 50,
        position: 'right' as const,
        ticks: { font: { size: 11 }, callback: (v: any) => `${v}%` },
        title: { display: true, text: 'Overall Rate (%)', font: { size: 12, weight: 'bold' as const } },
        grid: { drawOnChartArea: false },
      },
      x: { ticks: { font: { size: 11 } }, grid: { display: false } },
    },
  };

  // --- Summary cards ---
  const hubValues = EVALUATION.hub.filter((v): v is number => v !== null && v > 0);
  const ptValues = EVALUATION.pt.filter((v): v is number => v !== null && v > 0);
  const avgHub = hubValues.length ? (hubValues.reduce((a, b) => a + b, 0) / hubValues.length) : 0;
  const avgPt = ptValues.length ? (ptValues.reduce((a, b) => a + b, 0) / ptValues.length) : 0;

  const TABS = [
    { key: 'leadtime' as const,   label: 'KPI Lead Time',         icon: Clock },
    { key: 'evaluation' as const, label: 'KPI Evaluation',        icon: TrendingUp },
    { key: 'reports' as const,    label: 'No. of Revised Reports', icon: FileText },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 size={20} className="text-indigo-500" /> KPI Monitoring
        </h1>
        <p className="text-slate-400 text-[11px] mt-0">
          Data sourced from IATF_KPI.xlsx — FY 2025-2026 (Apr–Mar)
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Avg Lead Time</p>
          <p className={`text-2xl font-bold mt-1 ${avgElapsed <= LEAD_TIME_TARGET ? 'text-emerald-600' : 'text-rose-600'}`}>
            {avgElapsed.toFixed(1)} <span className="text-sm font-normal text-slate-400">days</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Target ≤ {LEAD_TIME_TARGET} biz days</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Avg HUB</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">
            {avgHub.toFixed(1)} <span className="text-sm font-normal text-slate-400">%</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Avg PT</p>
          <p className="text-2xl font-bold mt-1 text-orange-600">
            {avgPt.toFixed(1)} <span className="text-sm font-normal text-slate-400">%</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">APTX Records</p>
          <p className="text-2xl font-bold mt-1 text-indigo-600">
            {filteredAptx.length} <span className="text-sm font-normal text-slate-400">reports</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{completedAptx.length} done · {openAptx.length} open</p>
        </div>
      </div>

      {/* Main chart panel */}
      <div className="bg-white border-2 border-indigo-200 rounded-xl shadow-lg overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 text-sm font-semibold">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 flex items-center justify-center gap-2 transition-colors ${
                  activeTab === tab.key
                    ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Chart area */}
        <div className="p-5">
          {activeTab === 'reports' && (
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-1">No. of Revised Reports</h2>
              <p className="text-xs text-slate-400 mb-4">Number of document revisions issued per month. Currently no revisions recorded.</p>
              <div style={{ height: 360 }}>
                <Bar data={revisedReportsData} options={revisedReportsOptions} />
              </div>
            </div>
          )}

          {activeTab === 'leadtime' && (
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-1">KPI Lead Time — APTX Scatter</h2>
              <p className="text-xs text-slate-400 mb-3">
                Each point is one report. X = assign date, Y = elapsed business days. Target ≤ {LEAD_TIME_TARGET} days.
                <span className="ml-2 inline-flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" /> circle = completed
                  <span className="inline-block w-2 h-2 bg-indigo-300 rotate-45 ml-2" /> diamond = open
                </span>
              </p>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4 items-center text-xs">
                <Filter size={13} className="text-slate-400" />
                <label className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500">Category</span>
                  <select value={catFilter} onChange={e => setCatFilter(e.target.value as any)}
                    className="border border-slate-300 rounded px-1.5 py-0.5 text-xs">
                    <option value="All">All</option>
                    <option value="I">Investigation</option>
                    <option value="W">Warranty</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500">Group</span>
                  <select value={grpFilter} onChange={e => setGrpFilter(e.target.value as any)}
                    className="border border-slate-300 rounded px-1.5 py-0.5 text-xs">
                    <option value="All">All</option>
                    <option value="H">HUB</option>
                    <option value="P">Powertrain</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <span className="font-semibold text-slate-500">Status</span>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                    className="border border-slate-300 rounded px-1.5 py-0.5 text-xs">
                    <option value="All">All</option>
                    <option value="Done">Completed</option>
                    <option value="Open">Open</option>
                  </select>
                </label>

                <div className="ml-auto flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-slate-600 transition-colors"
                    title="Upload CSV (pipe-delimited exported_data.csv)"
                  >
                    <Upload size={12} /> Upload CSV
                  </button>
                  {csvData && (
                    <div className="relative">
                      <button
                        onClick={() => setShowResetConfirm(true)}
                        className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-400 transition-colors text-[11px]"
                        title="Reset to built-in data"
                      >
                        <RefreshCw size={11} /> Reset
                      </button>
                      {showResetConfirm && (
                        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-300 rounded-lg shadow-lg p-3 w-56">
                          <p className="text-xs text-slate-600 mb-3">Reset to built-in data? Uploaded CSV data will be cleared.</p>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setShowResetConfirm(false)}
                              className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 text-slate-600 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleResetData}
                              className="px-3 py-1 text-xs bg-rose-500 hover:bg-rose-600 text-white rounded transition-colors"
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* CSV status badge */}
              {csvData && (
                <div className="mb-3 flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    <Upload size={10} /> {csvFileName}
                  </span>
                  <span className="text-slate-400">
                    {csvData.length} records loaded (filtered from CSV)
                  </span>
                </div>
              )}

              <span className="text-slate-400 text-xs">
                Showing <strong className="text-slate-700">{filteredAptx.length}</strong> of {processedAptx.length}
              </span>

              {/* Scatter chart */}
              <div style={{ height: 400 }}>
                <Scatter data={scatterChartData as any} options={scatterOptions as any} />
              </div>

              {/* Selected point detail panel */}
              {selectedPoints.length > 0 && (
                <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-4 relative">
                  <button
                    onClick={() => setSelectedPoints([])}
                    className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={16} />
                  </button>
                  <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-1.5 mb-3">
                    <MessageSquare size={14} />
                    {selectedPoints.length === 1
                      ? selectedPoints[0].r_id
                      : `${selectedPoints.length} Overlapping Reports`}
                  </h3>
                  <div className="space-y-3 max-h-72 overflow-y-auto">
                    {selectedPoints.map(sp => (
                      <div key={sp.r_id} className="bg-white border border-slate-200 rounded-md p-3">
                        <p className="text-xs font-bold text-indigo-700 mb-2">{sp.r_id}</p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs mb-2">
                          <div>
                            <p className="text-slate-400 font-medium">Category</p>
                            <p className="font-semibold text-slate-700">{sp.cat}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium">Group</p>
                            <p className="font-semibold text-slate-700">{sp.grp}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium">Assign Date</p>
                            <p className="font-semibold text-slate-700">{sp.x}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium">Finish Date</p>
                            <p className="font-semibold text-slate-700">{sp.finish || '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-medium">Elapsed</p>
                            <p className={`font-semibold ${sp.y <= LEAD_TIME_TARGET ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {sp.y} biz days
                              {sp.done
                                ? <span className="ml-1 text-emerald-600 text-[10px]">(Completed)</span>
                                : <span className="ml-1 text-amber-600 text-[10px]">(Open)</span>
                              }
                            </p>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500 block mb-1">Remark</label>
                          <p className="text-xs text-slate-700 bg-white border border-slate-200 rounded-md px-3 py-2 min-h-[2rem]">
                            {sp.remark || <span className="text-slate-300 italic">No remark</span>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary stats row */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <p className="text-slate-400 font-medium">Completed</p>
                  <p className="text-lg font-bold text-indigo-700">{completedAptx.length}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <p className="text-slate-400 font-medium">Open</p>
                  <p className="text-lg font-bold text-amber-600">{openAptx.length}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <p className="text-slate-400 font-medium">Avg Elapsed</p>
                  <p className={`text-lg font-bold ${avgElapsed <= LEAD_TIME_TARGET ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {avgElapsed.toFixed(1)} <span className="text-[10px] text-slate-400">days</span>
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <p className="text-slate-400 font-medium">Max Elapsed</p>
                  <p className={`text-lg font-bold ${maxElapsed <= LEAD_TIME_TARGET ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {maxElapsed} <span className="text-[10px] text-slate-400">days</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'evaluation' && (
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-1">KPI Evaluation</h2>
              <p className="text-xs text-slate-400 mb-4">
                HUB and PT evaluation percentages (bars, left axis) with overall rate line (right axis).
              </p>
              <div style={{ height: 380 }}>
                <Bar data={evaluationData as any} options={evaluationOptions} />
              </div>
              {/* Mini data table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-2 py-1.5 text-left font-semibold text-slate-600 w-16">Series</th>
                      {MONTHS.map(m => <th key={m} className="px-2 py-1.5 font-semibold text-slate-600">{m}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-2 py-1 text-left font-semibold text-emerald-700">HUB</td>
                      {EVALUATION.hub.map((v, i) => (
                        <td key={i} className={`px-2 py-1 ${v === null ? 'text-slate-300' : 'text-slate-700'}`}>{v === null ? '—' : v}</td>
                      ))}
                    </tr>
                    <tr className="bg-slate-50/50">
                      <td className="px-2 py-1 text-left font-semibold text-orange-700">PT</td>
                      {EVALUATION.pt.map((v, i) => (
                        <td key={i} className={`px-2 py-1 ${v === null ? 'text-slate-300' : 'text-slate-700'}`}>{v === null ? '—' : v}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-left font-semibold text-indigo-700">Rate</td>
                      {EVALUATION.rate.map((v, i) => (
                        <td key={i} className={`px-2 py-1 ${v === null ? 'text-slate-300' : 'text-slate-700'}`}>{v === null ? '—' : `${(v * 100).toFixed(2)}%`}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
