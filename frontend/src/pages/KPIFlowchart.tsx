import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart3, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { documentAPI } from '../api';

interface KpiRow {
  metric: string;
  target: number;
  actual: number;
  rate: number;
}

interface TrendPoint {
  month: string;
  value: number;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractKpiRows(rows: Record<string, unknown>[]) {
  const result: KpiRow[] = [];

  for (const row of rows) {
    const keys = Object.keys(row);
    const metricKey = keys.find((k) => /(kpi|metric|indicator|parameter|item|name)/i.test(k));
    const targetKey = keys.find((k) => /(target|goal|plan)/i.test(k));
    const actualKey = keys.find((k) => /(actual|result|value|achievement|current)/i.test(k));

    if (!metricKey || !targetKey || !actualKey) continue;

    const target = toNumber(row[targetKey]);
    const actual = toNumber(row[actualKey]);
    const metric = String(row[metricKey] || '').trim();

    if (metric && target !== null && actual !== null) {
      result.push({ metric, target, actual, rate: target === 0 ? 0 : (actual / target) * 100 });
    }

    if (result.length >= 6) break;
  }

  if (result.length >= 3) return result.slice(0, 3);

  const fallback: KpiRow[] = [];
  for (const row of rows) {
    const values = Object.values(row);
    if (values.length < 3) continue;

    const metric = String(values[0] || '').trim();
    const target = toNumber(values[1]);
    const actual = toNumber(values[2]);

    if (metric && target !== null && actual !== null) {
      fallback.push({ metric, target, actual, rate: target === 0 ? 0 : (actual / target) * 100 });
    }

    if (fallback.length >= 3) break;
  }

  return fallback;
}

function extractTrend(rows: Record<string, unknown>[], fallbackRows: KpiRow[]) {
  const monthPattern = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  for (const row of rows) {
    const monthEntries = Object.entries(row)
      .filter(([key, value]) => monthPattern.test(key) && toNumber(value) !== null)
      .map(([key, value]) => ({ month: key.slice(0, 3), value: toNumber(value) as number }));

    if (monthEntries.length >= 3) {
      return monthEntries.slice(0, 12);
    }
  }

  return fallbackRows.map((item, index) => ({ month: `P${index + 1}`, value: Number(item.actual || 0) }));
}

function TrendLine({ data }: { data: TrendPoint[] }) {
  if (!data.length) return null;

  const width = 700;
  const height = 240;
  const padding = 32;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const points = data.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
    const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
    return { ...point, x, y };
  });

  const line = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
      <rect x="0" y="0" width={width} height={height} fill="#f8fafc" rx="12" />
      <polyline fill="none" stroke="#4f46e5" strokeWidth="3" points={line} />
      {points.map((p) => (
        <g key={p.month}>
          <circle cx={p.x} cy={p.y} r="4" fill="#4f46e5" />
          <text x={p.x} y={height - 10} textAnchor="middle" fontSize="11" fill="#64748b">{p.month}</text>
        </g>
      ))}
    </svg>
  );
}

export default function KPIFlowchart() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [latestDoc, setLatestDoc] = useState<any | null>(null);
  const [kpiRows, setKpiRows] = useState<KpiRow[]>([]);
  const [trendRows, setTrendRows] = useState<TrendPoint[]>([]);
  const [openingReference, setOpeningReference] = useState(false);

  const openReferenceExcel = async () => {
    if (!latestDoc?.id) return;

    try {
      setOpeningReference(true);
      const originalRes = await documentAPI.original(latestDoc.id);
      const blob = originalRes.data;
      const fileUrl = URL.createObjectURL(blob);

      const popup = window.open(fileUrl, '_blank', 'noopener,noreferrer');
      if (!popup) {
        const fallback = document.createElement('a');
        fallback.href = fileUrl;
        fallback.download = `${latestDoc.doc_no || 'KPI-01-001'}_Reference.xlsx`;
        fallback.click();
      }

      setTimeout(() => URL.revokeObjectURL(fileUrl), 10000);
    } catch (err) {
      console.error(err);
      setError('Failed to open reference Excel file.');
    } finally {
      setOpeningReference(false);
    }
  };

  useEffect(() => {
    const loadKpi = async () => {
      try {
        setLoading(true);
        setError('');

        const searchRes = await documentAPI.getLatestKpi();
        const matches = (searchRes.data || []);

        if (!matches.length) {
          setError('KPI file "KPI KPI-01-001" was not found in the central repository.');
          return;
        }

        const document = matches[0];
        setLatestDoc(document);

        const originalRes = await documentAPI.original(document.id);
        const arrayBuffer = await originalRes.data.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        if (!workbook.SheetNames.length) {
          setError('KPI file exists but has no readable worksheet.');
          return;
        }

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) as Record<string, unknown>[];

        const extractedRows = extractKpiRows(rows);
        if (!extractedRows.length) {
          setError('Unable to parse KPI target/actual values from the latest KPI file.');
          return;
        }

        setKpiRows(extractedRows);
        setTrendRows(extractTrend(rows, extractedRows));
      } catch (err) {
        console.error(err);
        setError('Failed to load KPI data from the latest Excel source file.');
      } finally {
        setLoading(false);
      }
    };

    loadKpi();
  }, []);

  const maxBarValue = useMemo(() => {
    const values = kpiRows.flatMap((row) => [row.target, row.actual]);
    return Math.max(...values, 1);
  }, [kpiRows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><BarChart3 size={20} className="text-indigo-500" /> KPI Monitoring</h1>
        <p className="text-slate-600 mt-2">Graphs are generated from the latest "KPI KPI-01-001" Excel file.</p>
      </div>

      {latestDoc && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-900 flex flex-wrap items-center justify-between gap-3">
          <div>
            Source: <span className="font-semibold">{latestDoc.title}</span> | Revision {latestDoc.revision || '-'}
          </div>
          <button
            type="button"
            onClick={openReferenceExcel}
            disabled={openingReference}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 bg-white text-indigo-700 font-semibold hover:bg-indigo-100 disabled:opacity-60"
          >
            <ExternalLink size={16} />
            {openingReference ? 'Opening...' : 'Reference'}
          </button>
        </div>
      )}

      {loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-600">
          Loading KPI graphs from latest Excel source...
        </div>
      )}

      {!loading && error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-3">
          <AlertCircle className="text-amber-600 mt-0.5" size={20} />
          <p className="text-amber-800">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="font-bold text-slate-900 mb-5">Graph 1: Target vs Actual</h2>
              <div className="space-y-4">
                {kpiRows.map((row) => (
                  <div key={row.metric}>
                    <p className="text-sm font-semibold text-slate-800 mb-2">{row.metric}</p>
                    <div className="space-y-1.5">
                      <div className="h-3 rounded bg-slate-100 overflow-hidden">
                        <div className="h-full bg-indigo-300" style={{ width: `${(row.target / maxBarValue) * 100}%` }} />
                      </div>
                      <div className="h-3 rounded bg-slate-100 overflow-hidden">
                        <div className="h-full bg-indigo-600" style={{ width: `${(row.actual / maxBarValue) * 100}%` }} />
                      </div>
                      <div className="text-xs text-slate-500">Target: {row.target} | Actual: {row.actual}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="font-bold text-slate-900 mb-5">Graph 2: KPI Achievement Status</h2>
              <div className="space-y-5">
                {kpiRows.map((row) => {
                  const safeRate = Math.max(0, Math.min(200, row.rate));
                  const isPass = row.actual >= row.target;
                  return (
                    <div key={`${row.metric}-status`}>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-sm font-semibold text-slate-800">{row.metric}</p>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${isPass ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {safeRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-3 rounded bg-slate-100 overflow-hidden">
                        <div className={`h-full ${isPass ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(safeRate, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="text-indigo-600" size={20} />
              <h2 className="font-bold text-slate-900">Graph 3: KPI Trend</h2>
            </div>
            <TrendLine data={trendRows} />
            <div className="mt-3 text-xs text-slate-500 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-600" />
              Trend is calculated from month columns when available, otherwise from latest KPI values.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
