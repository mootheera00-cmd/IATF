// pages/MSA.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FlaskConical, Plus, Trash2, Eye, X, ChevronDown, CheckCircle2,
  XCircle, AlertTriangle, BarChart3, Target, TrendingUp, Search,
} from 'lucide-react';
import { msaAPI } from '../api';
import DocControlSection from '../components/DocControlSection';

/* ================================================================
   Types
   ================================================================ */
type StudyType = 'bias' | 'grr' | 'stability';

interface MsaStudy {
  id: number;
  study_type: StudyType;
  equipment_no: string;
  equipment_name: string | null;
  equipment_resolution: string | null;
  part_no: string | null;
  part_name: string | null;
  characteristic: string | null;
  specification: string | null;
  studied_date: string | null;
  area: string | null;
  status: string;
  result: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface BiasDetail {
  appraiser_name: string;
  appraiser_dept: string;
  reference_value: number;
  reference_unit: string;
  alpha: number;
  sample_count: number;
  readings: number[];
  mean: number | null;
  std_dev: number | null;
  range_val: number | null;
  bias: number | null;
  t_statistic: number | null;
  degrees_of_freedom: number | null;
  significant_t: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  result: string | null;
}

interface GrrAppraiser {
  name: string;
  readings: number[][];
}

interface GrrDetail {
  num_appraisers: number;
  num_trials: number;
  num_parts: number;
  appraiser_data: GrrAppraiser[];
  part_averages: number[];
  r_bar: number | null;
  x_diff: number | null;
  ucl_r: number | null;
  ev: number | null;
  av: number | null;
  grr: number | null;
  pv: number | null;
  tv: number | null;
  percent_ev: number | null;
  percent_av: number | null;
  percent_grr: number | null;
  percent_pv: number | null;
  ndc: number | null;
  result: string | null;
}

interface StabilityDetail {
  inspector_name: string;
  tolerance: number;
  tolerance_unit: string;
  reference_value: number;
  num_subgroups: number;
  readings_per_subgroup: number;
  readings: number[][];
  x_bar_values: number[];
  range_values: number[];
  x_bar_ucl: number | null;
  x_bar_cl: number | null;
  x_bar_lcl: number | null;
  r_ucl: number | null;
  r_cl: number | null;
  r_lcl: number | null;
  sigma: number | null;
  six_sigma: number | null;
  percent_stability: number | null;
  result: string | null;
}

/* ================================================================
   Constants
   ================================================================ */
const TABS: { key: StudyType; label: string; icon: React.ElementType }[] = [
  { key: 'bias', label: 'Bias Study', icon: Target },
  { key: 'grr', label: 'GR&R Study', icon: BarChart3 },
  { key: 'stability', label: 'Stability Study', icon: TrendingUp },
];

// GR&R constants
const K1: Record<number, number> = { 2: 0.8862, 3: 0.5908 };
const K2: Record<number, number> = { 2: 0.7071, 3: 0.5231 };
const K3: Record<number, number> = {
  2: 0.7071, 3: 0.5231, 4: 0.4467, 5: 0.403, 6: 0.3742,
  7: 0.3534, 8: 0.3375, 9: 0.3249, 10: 0.3146,
};
const D4: Record<number, number> = { 2: 3.27, 3: 2.58 };
const D2: Record<number, number> = { 2: 1.128, 3: 1.693 };
const D3_CHART: Record<number, number> = { 2: 0, 3: 0 };
const A2: Record<number, number> = { 2: 1.880, 3: 1.023 };

// t-distribution critical values (two-tailed, α=0.05)
const T_CRITICAL: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  20: 2.086, 25: 2.060, 30: 2.042, 60: 2.000, 120: 1.980,
};
function tCrit(df: number): number {
  if (T_CRITICAL[df]) return T_CRITICAL[df];
  const keys = Object.keys(T_CRITICAL).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i] && df < keys[i + 1]) {
      const f = (df - keys[i]) / (keys[i + 1] - keys[i]);
      return T_CRITICAL[keys[i]] * (1 - f) + T_CRITICAL[keys[i + 1]] * f;
    }
  }
  return 1.96;
}

/* ================================================================
   Calculation helpers
   ================================================================ */
function calcBias(readings: number[], refValue: number): Omit<BiasDetail, 'appraiser_name' | 'appraiser_dept' | 'reference_value' | 'reference_unit' | 'alpha' | 'sample_count'> & { readings: number[] } {
  const n = readings.length;
  if (n === 0) return { readings, mean: null, std_dev: null, range_val: null, bias: null, t_statistic: null, degrees_of_freedom: null, significant_t: null, ci_lower: null, ci_upper: null, result: null };
  const mean = readings.reduce((s, v) => s + v, 0) / n;
  const variance = readings.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std_dev = Math.sqrt(variance);
  const range_val = Math.max(...readings) - Math.min(...readings);
  const bias = mean - refValue;
  const se = std_dev / Math.sqrt(n);
  const df = n - 1;
  const t_stat = se !== 0 ? bias / se : 0;
  const sig_t = tCrit(df);
  const ci_lower = bias - sig_t * se;
  const ci_upper = bias + sig_t * se;
  const acceptable = ci_lower <= 0 && ci_upper >= 0;
  return {
    readings, mean, std_dev, range_val, bias,
    t_statistic: t_stat, degrees_of_freedom: df,
    significant_t: sig_t, ci_lower, ci_upper,
    result: acceptable ? 'ACCEPTABLE' : 'NOT_ACCEPTABLE',
  };
}

function calcGrr(appraiserData: GrrAppraiser[], numTrials: number, numParts: number) {
  const nAppr = appraiserData.length;
  if (nAppr === 0 || numTrials === 0 || numParts === 0) return null;

  // Per-appraiser averages & ranges per part
  const apprAvgs: number[][] = [];
  const apprRanges: number[][] = [];
  for (const appr of appraiserData) {
    const avgs: number[] = [];
    const ranges: number[] = [];
    for (let p = 0; p < numParts; p++) {
      const trials = appr.readings[p] || [];
      if (trials.length === 0) { avgs.push(0); ranges.push(0); continue; }
      const avg = trials.reduce((s, v) => s + v, 0) / trials.length;
      const rng = Math.max(...trials) - Math.min(...trials);
      avgs.push(avg);
      ranges.push(rng);
    }
    apprAvgs.push(avgs);
    apprRanges.push(ranges);
  }

  // R-bar per appraiser, then overall R-bar
  const rBarPerAppr = apprRanges.map(r => r.reduce((s, v) => s + v, 0) / r.length);
  const r_bar = rBarPerAppr.reduce((s, v) => s + v, 0) / nAppr;

  // X-bar per appraiser (grand mean of their part averages)
  const xBarPerAppr = apprAvgs.map(a => a.reduce((s, v) => s + v, 0) / a.length);
  const x_diff = Math.max(...xBarPerAppr) - Math.min(...xBarPerAppr);

  // UCL_R
  const d4 = D4[numTrials] ?? 2.58;
  const ucl_r = r_bar * d4;

  // Part averages (across all appraisers)
  const partAvgs: number[] = [];
  for (let p = 0; p < numParts; p++) {
    let sum = 0;
    for (let a = 0; a < nAppr; a++) sum += apprAvgs[a][p];
    partAvgs.push(sum / nAppr);
  }
  const rp = Math.max(...partAvgs) - Math.min(...partAvgs);

  // EV, AV, GRR, PV, TV
  const k1 = K1[numTrials] ?? 0.5908;
  const k2 = K2[nAppr] ?? 0.5231;
  const k3 = K3[numParts] ?? 0.3146;

  const ev = r_bar * k1;
  const n = numParts;
  const r = numTrials;
  const avSquared = (x_diff * k2) ** 2 - (ev ** 2 / (n * r));
  const av = avSquared > 0 ? Math.sqrt(avSquared) : 0;
  const grr = Math.sqrt(ev ** 2 + av ** 2);
  const pv = rp * k3;
  const tv = Math.sqrt(grr ** 2 + pv ** 2);

  const percent_ev = tv !== 0 ? (ev / tv) * 100 : 0;
  const percent_av = tv !== 0 ? (av / tv) * 100 : 0;
  const percent_grr = tv !== 0 ? (grr / tv) * 100 : 0;
  const percent_pv = tv !== 0 ? (pv / tv) * 100 : 0;
  const ndc = Math.floor((1.41 * pv) / grr);

  let result = 'NOT_ACCEPTABLE';
  if (percent_grr < 10) result = 'VERY_GOOD';
  else if (percent_grr <= 30) result = 'CONDITIONAL';

  return {
    appraiser_data: appraiserData,
    part_averages: partAvgs,
    r_bar, x_diff, ucl_r,
    ev, av, grr, pv, tv,
    percent_ev, percent_av, percent_grr, percent_pv,
    ndc, result,
  };
}

function calcStability(readings: number[][], numSubgroups: number, readingsPerSubgroup: number) {
  if (!readings.length || !readings[0]?.length) return null;
  const xBars: number[] = [];
  const ranges: number[] = [];
  for (let i = 0; i < numSubgroups; i++) {
    const sg = readings[i] || [];
    if (sg.length === 0) { xBars.push(0); ranges.push(0); continue; }
    const avg = sg.reduce((s, v) => s + v, 0) / sg.length;
    const rng = Math.max(...sg) - Math.min(...sg);
    xBars.push(avg);
    ranges.push(rng);
  }
  const r_cl = ranges.reduce((s, v) => s + v, 0) / ranges.length;
  const x_cl = xBars.reduce((s, v) => s + v, 0) / xBars.length;
  const d4 = D4[readingsPerSubgroup] ?? 2.58;
  const d3 = D3_CHART[readingsPerSubgroup] ?? 0;
  const a2 = A2[readingsPerSubgroup] ?? 1.023;
  const d2 = D2[readingsPerSubgroup] ?? 1.693;

  const r_ucl = d4 * r_cl;
  const r_lcl = d3 * r_cl;
  const x_ucl = x_cl + a2 * r_cl;
  const x_lcl = x_cl - a2 * r_cl;
  const sigma = r_cl / d2;
  const six_sigma = 6 * sigma;
  // %Stability = 0 when all subgroups in control (X2-X1 = 0 by default)
  const percent_stability = six_sigma !== 0 ? 0 : 0; // User provides x2-x1 delta later
  return {
    x_bar_values: xBars, range_values: ranges,
    x_bar_ucl: x_ucl, x_bar_cl: x_cl, x_bar_lcl: x_lcl,
    r_ucl, r_cl, r_lcl: r_lcl,
    sigma, six_sigma, percent_stability,
    result: 'STABLE',
  };
}

/* ================================================================
   Small UI helpers
   ================================================================ */
function Badge({ result }: { result: string | null }) {
  if (!result) return <span className="text-xs text-slate-400">—</span>;
  const map: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    ACCEPTABLE:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2 },
    VERY_GOOD:      { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2 },
    STABLE:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2 },
    CONDITIONAL:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: AlertTriangle },
    NOT_ACCEPTABLE: { bg: 'bg-red-50',     text: 'text-red-700',     icon: XCircle },
    NOT_STABLE:     { bg: 'bg-red-50',     text: 'text-red-700',     icon: XCircle },
  };
  const s = map[result] || { bg: 'bg-slate-100', text: 'text-slate-600', icon: AlertTriangle };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <Icon size={12} /> {result.replace('_', ' ')}
    </span>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder, className = '', required = false, disabled = false }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string; required?: boolean; disabled?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-slate-600">{label}{required && <span className="text-red-400">*</span>}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-50"
      />
    </label>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function MSA() {
  const [activeTab, setActiveTab] = useState<StudyType>('bias');
  const [studies, setStudies] = useState<MsaStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewStudy, setViewStudy] = useState<{ study: MsaStudy; detail: any } | null>(null);
  const [search, setSearch] = useState('');

  // ---- Fetch ----
  const fetchStudies = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await msaAPI.list(activeTab);
      setStudies(data);
    } catch { setStudies([]); }
    finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { fetchStudies(); }, [fetchStudies]);

  const filtered = useMemo(() => {
    if (!search.trim()) return studies;
    const q = search.toLowerCase();
    return studies.filter((s) =>
      [s.equipment_no, s.equipment_name, s.part_no, s.part_name, s.characteristic, s.result, s.created_by_name]
        .some((v) => v && v.toLowerCase().includes(q))
    );
  }, [studies, search]);

  // ---- View detail ----
  async function handleView(s: MsaStudy) {
    try {
      const { data } = await msaAPI.get(s.id);
      // Parse JSON strings in detail
      if (data.detail) {
        for (const key of ['readings', 'appraiser_data', 'part_averages', 'x_bar_values', 'range_values']) {
          if (typeof data.detail[key] === 'string') {
            try { data.detail[key] = JSON.parse(data.detail[key]); } catch { /* keep as-is */ }
          }
        }
      }
      setViewStudy(data);
    } catch { /* ignore */ }
  }

  // ---- Delete ----
  async function handleDelete(id: number) {
    if (!confirm('Delete this MSA study?')) return;
    try { await msaAPI.remove(id); fetchStudies(); } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FlaskConical size={24} className="text-indigo-600" />
          Measurement System Analysis (MSA)
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          IATF 16949 — Clause 7.1.5.1
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setActiveTab(key); setShowForm(false); setViewStudy(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition
              ${activeTab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment, part, result…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <button onClick={() => { setShowForm(true); setViewStudy(null); }}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition">
          <Plus size={16} /> New Study
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        activeTab === 'bias'  ? <BiasForm onDone={() => { setShowForm(false); fetchStudies(); }} onCancel={() => setShowForm(false)} /> :
        activeTab === 'grr'   ? <GrrForm onDone={() => { setShowForm(false); fetchStudies(); }} onCancel={() => setShowForm(false)} /> :
                                <StabilityForm onDone={() => { setShowForm(false); fetchStudies(); }} onCancel={() => setShowForm(false)} />
      )}

      {/* View modal */}
      {viewStudy && (
        <DetailModal data={viewStudy} onClose={() => setViewStudy(null)} />
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No {activeTab} studies found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Equipment</th>
                <th className="px-4 py-3">Part</th>
                <th className="px-4 py-3">Characteristic</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60 transition">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.equipment_no}{s.equipment_name ? ` — ${s.equipment_name}` : ''}</td>
                  <td className="px-4 py-3 text-slate-600">{s.part_no || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.characteristic || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{s.studied_date || '—'}</td>
                  <td className="px-4 py-3"><Badge result={s.result} /></td>
                  <td className="px-4 py-3 text-slate-500">{s.created_by_name || '—'}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button onClick={() => handleView(s)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600"><Eye size={16} /></button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Controlled documents & DCR section */}
      <DocControlSection
        label="MSA"
        filterKeywords={['msa', 'measurement system', 'gauge', 'gage', 'r&r', 'linearity', 'bias', '7.1.5']}
        accent="indigo"
        extraNewCategories={[{
          category: 'MSA',
          subCategories: ['Gauge R&R', 'Bias', 'Linearity', 'Stability', 'Attribute MSA'],
        }]}
      />
    </div>
  );
}

/* ================================================================
   BIAS FORM
   ================================================================ */
function BiasForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [equipNo, setEquipNo] = useState('');
  const [equipName, setEquipName] = useState('');
  const [resolution, setResolution] = useState('');
  const [partNo, setPartNo] = useState('');
  const [partName, setPartName] = useState('');
  const [characteristic, setCharacteristic] = useState('');
  const [spec, setSpec] = useState('');
  const [date, setDate] = useState('');
  const [area, setArea] = useState('');
  const [appraiserName, setAppraiserName] = useState('');
  const [appraiserDept, setAppraiserDept] = useState('');
  const [refValue, setRefValue] = useState('');
  const [refUnit, setRefUnit] = useState('mm');
  const [sampleCount, setSampleCount] = useState(15);
  const [readings, setReadings] = useState<string[]>(Array(15).fill(''));

  const parsedReadings = useMemo(() => readings.map(Number).filter((v) => !isNaN(v) && readings[readings.indexOf(String(v))] !== ''), [readings]);
  const calc = useMemo(() => {
    if (parsedReadings.length === 0 || !refValue) return null;
    return calcBias(parsedReadings, Number(refValue));
  }, [parsedReadings, refValue]);

  function updateReading(i: number, v: string) {
    setReadings((prev) => { const n = [...prev]; n[i] = v; return n; });
  }
  function handleCountChange(v: string) {
    const n = Math.max(1, Math.min(50, Number(v) || 15));
    setSampleCount(n);
    setReadings((prev) => {
      if (n > prev.length) return [...prev, ...Array(n - prev.length).fill('')];
      return prev.slice(0, n);
    });
  }

  async function handleSave() {
    if (!equipNo || !refValue || parsedReadings.length === 0) return;
    setSaving(true);
    try {
      await msaAPI.create({
        study_type: 'bias',
        equipment_no: equipNo, equipment_name: equipName, equipment_resolution: resolution,
        part_no: partNo, part_name: partName, characteristic, specification: spec,
        studied_date: date, area,
        result: calc?.result || null,
        detail: {
          appraiser_name: appraiserName, appraiser_dept: appraiserDept,
          reference_value: Number(refValue), reference_unit: refUnit,
          alpha: 0.05, sample_count: parsedReadings.length,
          ...calc,
        },
      });
      onDone();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Target size={20} className="text-indigo-600" /> New Bias Study</h3>
        <button onClick={onCancel} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
      </div>

      {/* Header fields */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Input label="Equipment No" value={equipNo} onChange={setEquipNo} required />
        <Input label="Equipment Name" value={equipName} onChange={setEquipName} />
        <Input label="Resolution" value={resolution} onChange={setResolution} placeholder="e.g. 0.001 mm" />
        <Input label="Date" value={date} onChange={setDate} type="date" />
        <Input label="Part No" value={partNo} onChange={setPartNo} />
        <Input label="Part Name" value={partName} onChange={setPartName} />
        <Input label="Characteristic" value={characteristic} onChange={setCharacteristic} />
        <Input label="Specification" value={spec} onChange={setSpec} />
        <Input label="Area" value={area} onChange={setArea} />
        <Input label="Appraiser Name" value={appraiserName} onChange={setAppraiserName} />
        <Input label="Appraiser Dept" value={appraiserDept} onChange={setAppraiserDept} />
        <Input label="Reference Value" value={refValue} onChange={setRefValue} type="number" required />
        <Input label="Unit" value={refUnit} onChange={setRefUnit} />
        <Input label="Sample Count" value={sampleCount} onChange={handleCountChange} type="number" />
      </div>

      {/* Readings grid */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-1">Readings</p>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-1.5">
          {readings.map((v, i) => (
            <input key={i} type="number" step="any" value={v}
              onChange={(e) => updateReading(i, e.target.value)}
              placeholder={`#${i + 1}`}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-300" />
          ))}
        </div>
      </div>

      {/* Live calculation results */}
      {calc && (
        <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-500">Mean:</span> <span className="font-mono">{calc.mean?.toFixed(6)}</span></div>
          <div><span className="text-slate-500">Std Dev:</span> <span className="font-mono">{calc.std_dev?.toFixed(6)}</span></div>
          <div><span className="text-slate-500">Bias:</span> <span className="font-mono">{calc.bias?.toFixed(6)}</span></div>
          <div><span className="text-slate-500">t-stat:</span> <span className="font-mono">{calc.t_statistic?.toFixed(4)}</span></div>
          <div><span className="text-slate-500">df:</span> <span className="font-mono">{calc.degrees_of_freedom}</span></div>
          <div><span className="text-slate-500">95% CI Lower:</span> <span className="font-mono">{calc.ci_lower?.toFixed(6)}</span></div>
          <div><span className="text-slate-500">95% CI Upper:</span> <span className="font-mono">{calc.ci_upper?.toFixed(6)}</span></div>
          <div><span className="text-slate-500">Result:</span> <Badge result={calc.result} /></div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
        <button onClick={handleSave} disabled={saving || !equipNo || !refValue || parsedReadings.length === 0}
          className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition">
          {saving ? 'Saving…' : 'Save Bias Study'}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   GR&R FORM
   ================================================================ */
function GrrForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [equipNo, setEquipNo] = useState('');
  const [equipName, setEquipName] = useState('');
  const [resolution, setResolution] = useState('');
  const [partNo, setPartNo] = useState('');
  const [partName, setPartName] = useState('');
  const [characteristic, setCharacteristic] = useState('');
  const [spec, setSpec] = useState('');
  const [date, setDate] = useState('');
  const [area, setArea] = useState('');
  const [numAppr, setNumAppr] = useState(3);
  const [numTrials, setNumTrials] = useState(3);
  const [numParts, setNumParts] = useState(6);
  const [apprNames, setApprNames] = useState<string[]>(['', '', '']);
  const [grid, setGrid] = useState<string[][][]>(
    Array.from({ length: 3 }, () => Array.from({ length: 6 }, () => Array(3).fill('')))
  );

  function resizeGrid(nA: number, nP: number, nT: number) {
    setGrid((prev) => {
      const next: string[][][] = [];
      for (let a = 0; a < nA; a++) {
        const appr: string[][] = [];
        for (let p = 0; p < nP; p++) {
          const trials: string[] = [];
          for (let t = 0; t < nT; t++) {
            trials.push(prev[a]?.[p]?.[t] ?? '');
          }
          appr.push(trials);
        }
        next.push(appr);
      }
      return next;
    });
    setApprNames((prev) => {
      const n = [...prev];
      while (n.length < nA) n.push('');
      return n.slice(0, nA);
    });
  }

  function setCell(a: number, p: number, t: number, v: string) {
    setGrid((prev) => {
      const next = prev.map((aa) => aa.map((pp) => [...pp]));
      next[a][p][t] = v;
      return next;
    });
  }

  const appraiserData: GrrAppraiser[] = useMemo(() =>
    grid.map((appr, i) => ({
      name: apprNames[i] || `Appraiser ${i + 1}`,
      readings: appr.map((part) => part.map(Number).map((v) => isNaN(v) ? 0 : v)),
    }))
  , [grid, apprNames]);

  const calc = useMemo(() => calcGrr(appraiserData, numTrials, numParts), [appraiserData, numTrials, numParts]);

  async function handleSave() {
    if (!equipNo || !calc) return;
    setSaving(true);
    try {
      await msaAPI.create({
        study_type: 'grr',
        equipment_no: equipNo, equipment_name: equipName, equipment_resolution: resolution,
        part_no: partNo, part_name: partName, characteristic, specification: spec,
        studied_date: date, area,
        result: calc.result,
        detail: { num_appraisers: numAppr, num_trials: numTrials, num_parts: numParts, ...calc },
      });
      onDone();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><BarChart3 size={20} className="text-indigo-600" /> New GR&R Study</h3>
        <button onClick={onCancel} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
      </div>

      {/* Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Input label="Equipment No" value={equipNo} onChange={setEquipNo} required />
        <Input label="Equipment Name" value={equipName} onChange={setEquipName} />
        <Input label="Resolution" value={resolution} onChange={setResolution} />
        <Input label="Date" value={date} onChange={setDate} type="date" />
        <Input label="Part No" value={partNo} onChange={setPartNo} />
        <Input label="Part Name" value={partName} onChange={setPartName} />
        <Input label="Characteristic" value={characteristic} onChange={setCharacteristic} />
        <Input label="Specification" value={spec} onChange={setSpec} />
        <Input label="Area" value={area} onChange={setArea} />
        <Input label="# Appraisers" value={numAppr} onChange={(v) => { const n = Math.max(1, Math.min(5, Number(v))); setNumAppr(n); resizeGrid(n, numParts, numTrials); }} type="number" />
        <Input label="# Trials" value={numTrials} onChange={(v) => { const n = Math.max(1, Math.min(5, Number(v))); setNumTrials(n); resizeGrid(numAppr, numParts, n); }} type="number" />
        <Input label="# Parts" value={numParts} onChange={(v) => { const n = Math.max(1, Math.min(15, Number(v))); setNumParts(n); resizeGrid(numAppr, n, numTrials); }} type="number" />
      </div>

      {/* Measurement grid per appraiser */}
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        {Array.from({ length: numAppr }).map((_, a) => (
          <div key={a} className="border border-slate-100 rounded-xl p-3">
            <Input label={`Appraiser ${String.fromCharCode(65 + a)} Name`} value={apprNames[a] || ''}
              onChange={(v) => setApprNames((prev) => { const n = [...prev]; n[a] = v; return n; })}
              className="mb-2 max-w-xs" />
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left px-1 py-1">Trial</th>
                  {Array.from({ length: numParts }).map((_, p) => (
                    <th key={p} className="px-1 py-1 text-center">Part {p + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: numTrials }).map((_, t) => (
                  <tr key={t}>
                    <td className="px-1 py-1 text-slate-500">{t + 1}</td>
                    {Array.from({ length: numParts }).map((_, p) => (
                      <td key={p} className="px-1 py-0.5">
                        <input type="number" step="any" value={grid[a]?.[p]?.[t] ?? ''}
                          onChange={(e) => setCell(a, p, t, e.target.value)}
                          className="w-full rounded border border-slate-200 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Live results */}
      {calc && (
        <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><span className="text-slate-500">EV:</span> <span className="font-mono">{calc.ev?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">AV:</span> <span className="font-mono">{calc.av?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">GRR:</span> <span className="font-mono">{calc.grr?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">PV:</span> <span className="font-mono">{calc.pv?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">TV:</span> <span className="font-mono">{calc.tv?.toFixed(6)}</span></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><span className="text-slate-500">%EV:</span> <span className="font-mono">{calc.percent_ev?.toFixed(1)}%</span></div>
            <div><span className="text-slate-500">%AV:</span> <span className="font-mono">{calc.percent_av?.toFixed(1)}%</span></div>
            <div><span className="text-slate-500 font-semibold">%GRR:</span> <span className="font-mono font-bold">{calc.percent_grr?.toFixed(1)}%</span></div>
            <div><span className="text-slate-500">%PV:</span> <span className="font-mono">{calc.percent_pv?.toFixed(1)}%</span></div>
            <div><span className="text-slate-500">NDC:</span> <span className="font-mono">{calc.ndc}</span></div>
          </div>
          <div><span className="text-slate-500">Result:</span> <Badge result={calc.result} /></div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
        <button onClick={handleSave} disabled={saving || !equipNo}
          className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition">
          {saving ? 'Saving…' : 'Save GR&R Study'}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   STABILITY FORM
   ================================================================ */
function StabilityForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false);
  const [equipNo, setEquipNo] = useState('');
  const [equipName, setEquipName] = useState('');
  const [resolution, setResolution] = useState('');
  const [partNo, setPartNo] = useState('');
  const [partName, setPartName] = useState('');
  const [characteristic, setCharacteristic] = useState('');
  const [spec, setSpec] = useState('');
  const [date, setDate] = useState('');
  const [area, setArea] = useState('');
  const [inspector, setInspector] = useState('');
  const [tolerance, setTolerance] = useState('');
  const [tolUnit, setTolUnit] = useState('g');
  const [refVal, setRefVal] = useState('');
  const [numSG, setNumSG] = useState(20);
  const [rpSG, setRpSG] = useState(3);
  const [grid, setGrid] = useState<string[][]>(
    Array.from({ length: 3 }, () => Array(20).fill(''))
  );

  function resizeGrid(nR: number, nSG: number) {
    setGrid((prev) => {
      const next: string[][] = [];
      for (let r = 0; r < nR; r++) {
        const row: string[] = [];
        for (let s = 0; s < nSG; s++) row.push(prev[r]?.[s] ?? '');
        next.push(row);
      }
      return next;
    });
  }

  function setCell(r: number, s: number, v: string) {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][s] = v;
      return next;
    });
  }

  const readings2D: number[][] = useMemo(() => {
    // Transpose: readings[subgroup][reading_idx]
    const out: number[][] = [];
    for (let s = 0; s < numSG; s++) {
      const sg: number[] = [];
      for (let r = 0; r < rpSG; r++) {
        const v = Number(grid[r]?.[s]);
        if (!isNaN(v) && grid[r]?.[s] !== '') sg.push(v);
      }
      out.push(sg);
    }
    return out;
  }, [grid, numSG, rpSG]);

  const calc = useMemo(() => {
    if (readings2D.every((sg) => sg.length === 0)) return null;
    return calcStability(readings2D, numSG, rpSG);
  }, [readings2D, numSG, rpSG]);

  async function handleSave() {
    if (!equipNo) return;
    setSaving(true);
    try {
      await msaAPI.create({
        study_type: 'stability',
        equipment_no: equipNo, equipment_name: equipName, equipment_resolution: resolution,
        part_no: partNo, part_name: partName, characteristic, specification: spec,
        studied_date: date, area,
        result: calc?.result || null,
        detail: {
          inspector_name: inspector, tolerance: Number(tolerance) || 0,
          tolerance_unit: tolUnit, reference_value: Number(refVal) || 0,
          num_subgroups: numSG, readings_per_subgroup: rpSG,
          readings: readings2D, ...calc,
        },
      });
      onDone();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><TrendingUp size={20} className="text-indigo-600" /> New Stability Study</h3>
        <button onClick={onCancel} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Input label="Equipment No" value={equipNo} onChange={setEquipNo} required />
        <Input label="Equipment Name" value={equipName} onChange={setEquipName} />
        <Input label="Resolution" value={resolution} onChange={setResolution} />
        <Input label="Date" value={date} onChange={setDate} type="date" />
        <Input label="Part No" value={partNo} onChange={setPartNo} />
        <Input label="Part Name" value={partName} onChange={setPartName} />
        <Input label="Characteristic" value={characteristic} onChange={setCharacteristic} />
        <Input label="Specification" value={spec} onChange={setSpec} />
        <Input label="Area" value={area} onChange={setArea} />
        <Input label="Inspector Name" value={inspector} onChange={setInspector} />
        <Input label="Tolerance" value={tolerance} onChange={setTolerance} type="number" />
        <Input label="Tolerance Unit" value={tolUnit} onChange={setTolUnit} />
        <Input label="Reference Value" value={refVal} onChange={setRefVal} type="number" />
        <Input label="# Subgroups" value={numSG} onChange={(v) => { const n = Math.max(1, Math.min(50, Number(v))); setNumSG(n); resizeGrid(rpSG, n); }} type="number" />
        <Input label="Readings/Subgroup" value={rpSG} onChange={(v) => { const n = Math.max(1, Math.min(10, Number(v))); setRpSG(n); resizeGrid(n, numSG); }} type="number" />
      </div>

      {/* Readings grid — rows = readings-per-subgroup, cols = subgroups */}
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="px-1 py-1 text-left">Reading</th>
              {Array.from({ length: numSG }).map((_, s) => (
                <th key={s} className="px-1 py-1 text-center min-w-[60px]">{s + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rpSG }).map((_, r) => (
              <tr key={r}>
                <td className="px-1 py-1 text-slate-500">{r + 1}</td>
                {Array.from({ length: numSG }).map((_, s) => (
                  <td key={s} className="px-0.5 py-0.5">
                    <input type="number" step="any" value={grid[r]?.[s] ?? ''}
                      onChange={(e) => setCell(r, s, e.target.value)}
                      className="w-full min-w-[55px] rounded border border-slate-200 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live results */}
      {calc && (
        <div className="bg-slate-50 rounded-xl p-4 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><span className="text-slate-500">X̄ UCL:</span> <span className="font-mono">{calc.x_bar_ucl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">X̄ CL:</span> <span className="font-mono">{calc.x_bar_cl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">X̄ LCL:</span> <span className="font-mono">{calc.x_bar_lcl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">σ:</span> <span className="font-mono">{calc.sigma?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">R UCL:</span> <span className="font-mono">{calc.r_ucl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">R̄:</span> <span className="font-mono">{calc.r_cl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">R LCL:</span> <span className="font-mono">{calc.r_lcl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">6σ:</span> <span className="font-mono">{calc.six_sigma?.toFixed(6)}</span></div>
          </div>
          <div className="mt-2"><span className="text-slate-500">%Stability:</span> <span className="font-mono font-bold">{calc.percent_stability?.toFixed(2)}%</span> <Badge result={calc.result} /></div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
        <button onClick={handleSave} disabled={saving || !equipNo}
          className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition">
          {saving ? 'Saving…' : 'Save Stability Study'}
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   DETAIL MODAL (read-only view of a saved study)
   ================================================================ */
function DetailModal({ data, onClose }: { data: { study: MsaStudy; detail: any }; onClose: () => void }) {
  const { study: s, detail: d } = data;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">
          {s.study_type === 'bias' ? 'Bias' : s.study_type === 'grr' ? 'GR&R' : 'Stability'} Study — {s.equipment_no}
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X size={18} /></button>
      </div>

      {/* Header info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-sm">
        <div><span className="text-slate-500">Equipment:</span> {s.equipment_no} {s.equipment_name && `— ${s.equipment_name}`}</div>
        <div><span className="text-slate-500">Resolution:</span> {s.equipment_resolution || '—'}</div>
        <div><span className="text-slate-500">Part:</span> {s.part_no || '—'} {s.part_name && `— ${s.part_name}`}</div>
        <div><span className="text-slate-500">Characteristic:</span> {s.characteristic || '—'}</div>
        <div><span className="text-slate-500">Spec:</span> {s.specification || '—'}</div>
        <div><span className="text-slate-500">Date:</span> {s.studied_date || '—'}</div>
        <div><span className="text-slate-500">Area:</span> {s.area || '—'}</div>
        <div><span className="text-slate-500">Result:</span> <Badge result={s.result} /></div>
      </div>

      {/* Type-specific detail */}
      {d && s.study_type === 'bias' && (
        <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><span className="text-slate-500">Appraiser:</span> {d.appraiser_name}</div>
            <div><span className="text-slate-500">Dept:</span> {d.appraiser_dept}</div>
            <div><span className="text-slate-500">Reference:</span> {d.reference_value} {d.reference_unit}</div>
            <div><span className="text-slate-500">Samples:</span> {d.sample_count}</div>
          </div>
          {Array.isArray(d.readings) && (
            <div>
              <span className="text-slate-500">Readings:</span>
              <div className="font-mono text-xs mt-1 flex flex-wrap gap-1">
                {d.readings.map((v: number, i: number) => (
                  <span key={i} className="bg-white px-1.5 py-0.5 rounded border border-slate-200">{v}</span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><span className="text-slate-500">Mean:</span> <span className="font-mono">{d.mean?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">Std Dev:</span> <span className="font-mono">{d.std_dev?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">Bias:</span> <span className="font-mono">{d.bias?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">t-stat:</span> <span className="font-mono">{d.t_statistic?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">95% CI:</span> <span className="font-mono">[{d.ci_lower?.toFixed(6)}, {d.ci_upper?.toFixed(6)}]</span></div>
            <div><span className="text-slate-500">Result:</span> <Badge result={d.result} /></div>
          </div>
        </div>
      )}

      {d && s.study_type === 'grr' && (
        <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div><span className="text-slate-500">Appraisers:</span> {d.num_appraisers}</div>
            <div><span className="text-slate-500">Trials:</span> {d.num_trials}</div>
            <div><span className="text-slate-500">Parts:</span> {d.num_parts}</div>
          </div>
          {Array.isArray(d.appraiser_data) && d.appraiser_data.map((appr: GrrAppraiser, i: number) => (
            <div key={i} className="text-xs">
              <span className="font-medium">{appr.name}:</span>
              <span className="font-mono ml-1">
                {appr.readings?.map((part: number[], pi: number) => `P${pi + 1}[${part.join(',')}]`).join(' ')}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div><span className="text-slate-500">EV:</span> <span className="font-mono">{d.ev?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">AV:</span> <span className="font-mono">{d.av?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">GRR:</span> <span className="font-mono">{d.grr?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">PV:</span> <span className="font-mono">{d.pv?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">TV:</span> <span className="font-mono">{d.tv?.toFixed(6)}</span></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div><span className="text-slate-500">%EV:</span> <span className="font-mono">{d.percent_ev?.toFixed(1)}%</span></div>
            <div><span className="text-slate-500">%AV:</span> <span className="font-mono">{d.percent_av?.toFixed(1)}%</span></div>
            <div><span className="text-slate-500 font-semibold">%GRR:</span> <span className="font-mono font-bold">{d.percent_grr?.toFixed(1)}%</span></div>
            <div><span className="text-slate-500">%PV:</span> <span className="font-mono">{d.percent_pv?.toFixed(1)}%</span></div>
            <div><span className="text-slate-500">NDC:</span> <span className="font-mono">{d.ndc}</span></div>
          </div>
          <div><Badge result={d.result} /></div>
        </div>
      )}

      {d && s.study_type === 'stability' && (
        <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><span className="text-slate-500">Inspector:</span> {d.inspector_name}</div>
            <div><span className="text-slate-500">Tolerance:</span> ±{d.tolerance} {d.tolerance_unit}</div>
            <div><span className="text-slate-500">Subgroups:</span> {d.num_subgroups}</div>
            <div><span className="text-slate-500">Readings/SG:</span> {d.readings_per_subgroup}</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><span className="text-slate-500">X̄ UCL:</span> <span className="font-mono">{d.x_bar_ucl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">X̄ CL:</span> <span className="font-mono">{d.x_bar_cl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">X̄ LCL:</span> <span className="font-mono">{d.x_bar_lcl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">σ:</span> <span className="font-mono">{d.sigma?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">R UCL:</span> <span className="font-mono">{d.r_ucl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">R̄:</span> <span className="font-mono">{d.r_cl?.toFixed(4)}</span></div>
            <div><span className="text-slate-500">6σ:</span> <span className="font-mono">{d.six_sigma?.toFixed(6)}</span></div>
            <div><span className="text-slate-500">%Stability:</span> <span className="font-mono font-bold">{d.percent_stability?.toFixed(2)}%</span></div>
          </div>
          <div><Badge result={d.result} /></div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Close</button>
      </div>
    </div>
  );
}
