// pages/MSA.tsx  — MSA Plan (F-02-CAL-008)
import React, { useMemo, useRef, useState } from 'react';
import {
  FlaskConical, Upload, CheckCircle2, XCircle,
  Search, Calendar, FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import DocControlSection from '../components/DocControlSection';

/* ================================================================
   Types
   ================================================================ */

interface MsaItem {
  no: string;
  measurementSystem: string;
  specification: string;
  equipment: string;
  invNo: string;
  appraisers: string[];
  plan:   { bias: string; stability: string; grr: string };
  actual: { bias: string; stability: string; grr: string };
  result: { bias: string; stability: string; grr: string };
}

interface YearData {
  year: string;
  items: MsaItem[];
}

/* ================================================================
   Excel parse helpers
   ================================================================ */
function excelValToStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return val.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (typeof val === 'number') {
    try {
      const d = (XLSX.SSF as any).parse_date_code(val);
      if (d && d.y > 1900 && d.y < 2100) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${String(d.d).padStart(2, '0')}-${months[d.m - 1]}-${d.y}`;
      }
    } catch { /* not a date */ }
    return String(val);
  }
  return String(val).trim();
}

/**
 * Parse one MSA Plan worksheet.
 *
 * Layout (1-based rows / columns):
 *   Rows 1-6 : header rows (skip)
 *   Row 7+   : data in 3-row blocks: Plan / Actual / Result
 *
 *   Col A (1) : No.
 *   Col B (2) : Measurement System / Part info
 *   Col C (3) : Equipment name / Inventory No.
 *   Col D (4) : Appraiser names
 *   Col E (5) : Row label ("Plan" / "Actual" / "Result")
 *   Col F (6) : Bias
 *   Col G (7) : Stability
 *   Col H (8) : GR&R
 */
function parseSheet(ws: XLSX.WorkSheet, sheetName: string): YearData {
  const cell = (r: number, c: number): unknown => {
    const addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
    return ws[addr]?.v;
  };
  const s = (r: number, c: number) => excelValToStr(cell(r, c));

  const titleCell = s(3, 1) || s(3, 2) || '';
  const yearMatch = titleCell.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : sheetName.replace(/[^0-9]/g, '').slice(0, 4) || sheetName;

  const items: MsaItem[] = [];
  const maxRow = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.r + 1 : 100;

  let r = 7;
  while (r <= maxRow - 2) {
    const labelE  = s(r, 5);
    const labelE2 = s(r + 1, 5);
    const labelE3 = s(r + 2, 5);

    if (labelE !== 'Plan') { r++; continue; }
    if (labelE2 !== 'Actual' || labelE3 !== 'Result') { r++; continue; }

    const no = s(r, 1);
    if (!no || /remark/i.test(no)) { r += 3; continue; }
    if (!/^\d/.test(no)) { r += 3; continue; }

    const msRow1 = s(r, 2);
    const msRow2 = s(r + 1, 2);
    const msRow3 = s(r + 2, 2);
    const measurementSystem = msRow1 || msRow2 || '';
    const specification     = msRow1 ? (msRow2 || msRow3 || '') : msRow3;

    const eqName = s(r, 3);
    const eqRow2 = s(r + 1, 3);
    const invNo  = /^INV|[A-Z]{2,}-/.test(eqRow2) ? eqRow2 : '';

    const appraisers: string[] = [s(r, 4), s(r + 1, 4), s(r + 2, 4)].filter(Boolean);

    items.push({
      no,
      measurementSystem,
      specification,
      equipment: eqName,
      invNo,
      appraisers,
      plan:   { bias: s(r, 6),     stability: s(r, 7),     grr: s(r, 8)     },
      actual: { bias: s(r + 1, 6), stability: s(r + 1, 7), grr: s(r + 1, 8) },
      result: { bias: s(r + 2, 6), stability: s(r + 2, 7), grr: s(r + 2, 8) },
    });
    r += 3;
  }

  return { year, items };
}

function parseWorkbook(buffer: ArrayBuffer): YearData[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const yearSheets = wb.SheetNames.filter((n) => /^\d{4}/.test(n) && n !== '2024_old');
  return yearSheets
    .map((name) => parseSheet(wb.Sheets[name], name))
    .sort((a, b) => a.year.localeCompare(b.year));
}

/* ================================================================
   Result badge
   ================================================================ */
function ResultBadge({ value }: { value: string }) {
  if (!value || value === '-' || value === '') {
    return <span className="text-slate-400 text-xs">—</span>;
  }
  const u = value.toUpperCase();
  if (u === 'PASS' || u === 'OK') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
        <CheckCircle2 size={11} /> Pass
      </span>
    );
  }
  if (u === 'FAIL' || u === 'NG') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">
        <XCircle size={11} /> Fail
      </span>
    );
  }
  return <span className="text-xs text-slate-700">{value}</span>;
}

/* ================================================================
   Study cell: Plan / Actual / Result for one column
   ================================================================ */
function StudyCell({ item, field }: { item: MsaItem; field: 'bias' | 'stability' | 'grr' }) {
  const plan   = item.plan[field];
  const actual = item.actual[field];
  const result = item.result[field];
  const allEmpty = [plan, actual, result].every((v) => !v || v === '-');
  if (allEmpty) {
    return <td className="px-3 py-2 text-center text-slate-300 text-xs">—</td>;
  }
  return (
    <td className="px-3 py-2 align-top">
      <div className="space-y-0.5 min-w-[90px]">
        <div className="text-[11px] leading-tight">
          <span className="font-medium text-slate-400 mr-1">P:</span>
          <span className="text-slate-600">{plan || '—'}</span>
        </div>
        <div className="text-[11px] leading-tight">
          <span className="font-medium text-slate-400 mr-1">A:</span>
          <span className="text-slate-600">{actual || '—'}</span>
        </div>
        <div className="text-[11px] leading-tight">
          <span className="font-medium text-slate-400 mr-1">R:</span>
          <ResultBadge value={result} />
        </div>
      </div>
    </td>
  );
}

/* ================================================================
   Year summary bar
   ================================================================ */
function YearSummary({ items }: { items: MsaItem[] }) {
  let pass = 0, fail = 0, planned = 0;
  for (const it of items) {
    for (const field of ['bias', 'stability', 'grr'] as const) {
      const r = it.result[field].toUpperCase();
      if (r === 'PASS' || r === 'OK') pass++;
      else if (r === 'FAIL' || r === 'NG') fail++;
      if (it.plan[field] && it.plan[field] !== '-') planned++;
    }
  }
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        <FileText size={14} /> {items.length} items
      </span>
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        <Calendar size={14} /> {planned} planned
      </span>
      {pass > 0 && (
        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
          <CheckCircle2 size={14} /> {pass} pass
        </span>
      )}
      {fail > 0 && (
        <span className="inline-flex items-center gap-1 text-red-600 font-medium">
          <XCircle size={14} /> {fail} fail
        </span>
      )}
    </div>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function MSA() {
  const [yearDataList, setYearDataList] = useState<YearData[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [importing, setImporting]       = useState(false);
  const [search, setSearch]             = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseWorkbook(buf);
      setYearDataList(parsed);
      setSelectedYear(parsed[parsed.length - 1]?.year ?? '');
    } catch { /* ignore */ }
    finally { setImporting(false); e.target.value = ''; }
  }

  const currentYearData = useMemo(
    () => yearDataList.find((y) => y.year === selectedYear),
    [yearDataList, selectedYear]
  );

  const filteredItems = useMemo(() => {
    if (!currentYearData) return [];
    const q = search.toLowerCase().trim();
    if (!q) return currentYearData.items;
    return currentYearData.items.filter((it) =>
      [it.measurementSystem, it.equipment, it.invNo, it.specification, it.appraisers.join(' ')]
        .some((v) => v.toLowerCase().includes(q))
    );
  }, [currentYearData, search]);

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FlaskConical size={24} className="text-indigo-600" />
            Measurement System Analysis (MSA) Plan
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            F-02-CAL-008 · IATF 16949 Clause 7.1.5.1 · Accuracy (Bias / Stability) &amp; Precision (GR&amp;R)
          </p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
          >
            <Upload size={16} />
            {importing ? 'Importing…' : 'Import Excel (F-02-CAL-008)'}
          </button>
        </div>
      </div>

      {/* ---- Empty state ---- */}
      {yearDataList.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center">
          <Upload size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">No MSA Plan loaded</p>
          <p className="text-slate-400 text-sm mt-1">
            Click{' '}
            <span className="font-semibold text-indigo-600">Import Excel</span>{' '}
            and select{' '}
            <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
              F-02-CAL-008 MSA Plan.xlsx
            </span>
          </p>
        </div>
      )}

      {/* ---- Content ---- */}
      {yearDataList.length > 0 && (
        <>
          {/* Year selector tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
            {yearDataList.map((yd) => (
              <button
                key={yd.year}
                onClick={() => setSelectedYear(yd.year)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selectedYear === yd.year
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                FY{yd.year}
              </button>
            ))}
          </div>

          {/* Search + summary bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search equipment, measurement system…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            {currentYearData && <YearSummary items={currentYearData.items} />}
          </div>

          {/* Plan table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {(!currentYearData || filteredItems.length === 0) ? (
              <div className="p-12 text-center text-slate-400">
                {!currentYearData ? 'Select a year.' : 'No items match your search.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th rowSpan={2} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-10">
                        No.
                      </th>
                      <th rowSpan={2} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Measurement System
                      </th>
                      <th rowSpan={2} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Equipment / Inv. No.
                      </th>
                      <th rowSpan={2} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Appraiser
                      </th>
                      <th colSpan={2} className="px-3 py-2 text-center text-xs font-semibold text-indigo-600 uppercase tracking-wider border-l border-indigo-100 bg-indigo-50">
                        Accuracy
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-violet-600 uppercase tracking-wider border-l border-violet-100 bg-violet-50">
                        Precision
                      </th>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-1 text-center text-xs font-medium text-indigo-500 border-l border-indigo-100 bg-indigo-50/70">
                        Bias
                      </th>
                      <th className="px-3 py-1 text-center text-xs font-medium text-indigo-500 bg-indigo-50/70">
                        Stability
                      </th>
                      <th className="px-3 py-1 text-center text-xs font-medium text-violet-500 border-l border-violet-100 bg-violet-50/70">
                        GR&amp;R
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map((item, idx) => (
                      <tr
                        key={`${item.no}-${idx}`}
                        className={`hover:bg-slate-50/60 transition ${idx % 2 === 1 ? 'bg-slate-50/30' : ''}`}
                      >
                        <td className="px-3 py-3 font-bold text-slate-700 text-center">{item.no}</td>
                        <td className="px-3 py-3 align-top">
                          <div className="font-medium text-slate-800">{item.measurementSystem}</div>
                          {item.specification && item.specification !== item.measurementSystem && (
                            <div className="text-xs text-slate-400 mt-0.5">{item.specification}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="text-slate-700">{item.equipment}</div>
                          {item.invNo && (
                            <div className="text-xs text-indigo-500 font-mono mt-0.5">{item.invNo}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-slate-500 max-w-[140px]">
                          {item.appraisers.map((a, i) => (
                            <div key={i}>{a}</div>
                          ))}
                        </td>
                        <StudyCell item={item} field="bias" />
                        <StudyCell item={item} field="stability" />
                        <StudyCell item={item} field="grr" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200 flex-wrap">
            <span className="font-medium text-slate-600">Legend:</span>
            <span><span className="font-semibold">P</span> = Planned date</span>
            <span><span className="font-semibold">A</span> = Actual date</span>
            <span><span className="font-semibold">R</span> = Result</span>
            <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} /> Pass</span>
            <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={12} /> Fail</span>
            <span className="text-slate-400">— = Not applicable</span>
          </div>
        </>
      )}

      {/* ---- Controlled documents section ---- */}
      <DocControlSection
        label="MSA"
        filterKeywords={['msa', 'measurement system', 'gauge', 'gage', 'r&r', 'linearity', 'bias', '7.1.5', 'f-02-cal-008']}
        accent="indigo"
        extraNewCategories={[{
          category: 'MSA',
          subCategories: ['MSA Plan', 'Bias Study', 'GR&R Study', 'Stability Study'],
        }]}
      />
    </div>
  );
}
