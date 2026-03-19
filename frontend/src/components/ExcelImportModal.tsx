// frontend/src/components/ExcelImportModal.tsx
// Generic Excel → App import modal with column auto-detection + preview

import React, { useCallback, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle, ChevronDown, Loader2, Info } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FieldDef {
  key: string;          // internal field name
  label: string;        // display name
  required?: boolean;
  aliases?: string[];   // extra header aliases to auto-match
  type?: 'text' | 'date' | 'number';
}

interface ParsedRow {
  [key: string]: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface Props {
  title: string;
  fields: FieldDef[];
  onImport: (rows: ParsedRow[]) => Promise<ImportResult>;
  onClose: () => void;
  templateUrl?: string;       // optional link to download template
  sampleHeaders?: string[];   // shown in the "expected columns" hint
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise a header string for fuzzy matching (Latin/ASCII only) */
function norm(s: string) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Raw-trim for Thai / full-width comparisons (keep unicode, just collapse whitespace & lowercase) */
function rawTrim(s: string) {
  return String(s).toLowerCase().replace(/\s+/g, '').trim();
}

/** Parse an Excel value to YYYY-MM-DD.
 *  Handles: serial numbers, JS Date objects (from xlsx cellDates:true),
 *  ISO strings, DD/MM/YYYY, YYYY-MM-DD, and Thai date strings.
 */
function excelDateToISO(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  // xlsx may return a Date object when cellDates:true
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return '';
    const mm = String(d.m).padStart(2, '0');
    const dd = String(d.d).padStart(2, '0');
    return `${d.y}-${mm}-${dd}`;
  }
  const str = String(val).trim();
  if (!str) return '';
  // ISO datetime  e.g. "2025-03-14T00:00:00.000Z"
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10);
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`;
  // Native Date parse as last resort
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return str;
}

/** Auto-detect mapping: excelHeader → fieldKey
 *  Supports both Latin and Thai column headers.
 *  Priority: 1) exact norm match  2) exact raw match (Thai)  3) norm substring (Latin only)
 */
function autoMap(headers: string[], fields: FieldDef[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const hn   = norm(h);
    const hRaw = rawTrim(h);
    outer:
    for (const f of fields) {
      if (mapping[h]) break;
      const aliases       = f.aliases || [];
      const normList      = [norm(f.key), norm(f.label), ...aliases.map(norm)];
      const rawList       = [rawTrim(f.label), ...aliases.map(rawTrim)];

      // 1. Exact normalised match (strips all punctuation — good for "SERIAL NO" vs "serial_no")
      if (normList.some((c) => c && hn === c)) { mapping[h] = f.key; break outer; }
      // 2. Exact raw match — catches Thai strings and "DATE AND CAL.NEXT CAL" style
      if (rawList.some((c) => c && hRaw === c)) { mapping[h] = f.key; break outer; }
      // 3. Normalised substring (Latin only, min 4 chars to avoid false positives)
      if (hn.length >= 4 && normList.some((c) => c.length >= 4 && (hn.includes(c) || c.includes(hn)))) {
        mapping[h] = f.key; break outer;
      }
    }
  }
  return mapping;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExcelImportModal({ title, fields, onImport, onClose, sampleHeaders }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});   // excelCol → fieldKey
  const [step, setStep] = useState<'upload' | 'map' | 'result'>('upload');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState('');

  // ── Parse file ──────────────────────────────────────────────────────────────
  const parseFile = useCallback((file: File) => {
    setParseError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (rows.length === 0) { setParseError('The sheet is empty or has no data rows.'); return; }
        const headers = Object.keys(rows[0]);
        setRawHeaders(headers);
        setRawRows(rows);
        setMapping(autoMap(headers, fields));
        setFileName(file.name);
        setStep('map');
      } catch (err: any) {
        setParseError(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  }, [fields]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  // ── Build preview rows from mapping ─────────────────────────────────────────
  const buildMapped = (): ParsedRow[] => {
    return rawRows.map((row) => {
      const out: ParsedRow = {};
      for (const [excelCol, fieldKey] of Object.entries(mapping)) {
        if (!fieldKey) continue;
        const fd = fields.find((f) => f.key === fieldKey);
        const raw = row[excelCol];
        if (fd?.type === 'date') {
          out[fieldKey] = excelDateToISO(raw);
        } else {
          out[fieldKey] = String(raw ?? '').trim();
        }
      }
      return out;
    });
  };

  const mappedRows = step === 'map' ? buildMapped() : [];
  const previewRows = mappedRows.slice(0, 5);

  // Required field coverage
  const missingRequired = fields
    .filter((f) => f.required)
    .filter((f) => !Object.values(mapping).includes(f.key))
    .map((f) => f.label);

  // ── Import ──────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (missingRequired.length > 0) return;
    try {
      setImporting(true);
      const res = await onImport(buildMapped());
      setResult(res);
      setStep('result');
    } finally {
      setImporting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-emerald-600" />
            <h3 className="text-lg font-bold text-slate-900">Import from Excel — {title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 pt-4 shrink-0">
          {['Upload', 'Map Columns', 'Done'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${
                (step === 'upload' && i === 0) || (step === 'map' && i === 1) || (step === 'result' && i === 2)
                  ? 'bg-indigo-600 text-white'
                  : i < (['upload','map','result'].indexOf(step))
                    ? 'text-emerald-600'
                    : 'text-slate-400'
              }`}>
                {i < (['upload','map','result'].indexOf(step)) && <CheckCircle size={13} />}
                {s}
              </div>
              {i < 2 && <div className="flex-1 h-px bg-slate-200 max-w-[40px]" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <>
              {/* Drag-drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                  dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                }`}
              >
                <Upload size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="font-semibold text-slate-700">Drop your Excel file here</p>
                <p className="text-sm text-slate-400 mt-1">or click to browse — .xlsx / .xls</p>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFilePick} />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  {parseError}
                </div>
              )}

              {/* Expected columns hint */}
              {sampleHeaders && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 text-sm">
                  <Info size={15} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-1">Expected column headers (any order):</p>
                    <p className="font-mono text-xs leading-relaxed">{sampleHeaders.join(' · ')}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Column mapping ── */}
          {step === 'map' && (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <FileSpreadsheet size={14} className="text-emerald-500" />
                <span className="font-medium text-slate-700">{fileName}</span>
                <span>— {rawRows.length} rows detected</span>
                <button onClick={() => { setStep('upload'); setRawRows([]); setRawHeaders([]); }}
                  className="ml-auto text-indigo-600 hover:underline text-xs">Change file</button>
              </div>

              {/* Mapping table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="table-wrap">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-1/2">Excel Column</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-1/2">Maps To Field</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rawHeaders.map((h) => (
                      <tr key={h} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs text-slate-700">{h}</td>
                        <td className="px-4 py-2">
                          <div className="relative">
                            <select
                              value={mapping[h] || ''}
                              onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                              className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-400 pr-7"
                            >
                              <option value="">— Skip —</option>
                              {fields.map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.label}{f.required ? ' *' : ''}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              {/* Missing required warning */}
              {missingRequired.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>Required fields not mapped: <strong>{missingRequired.join(', ')}</strong></span>
                </div>
              )}

              {/* Preview */}
              {previewRows.length > 0 && missingRequired.length === 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Preview (first {previewRows.length} of {rawRows.length} rows)
                  </p>
                  <div className="table-wrap rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          {fields.filter((f) => Object.values(mapping).includes(f.key)).map((f) => (
                            <th key={f.key} className="text-left px-3 py-2 font-semibold text-slate-600 whitespace-nowrap">
                              {f.label}{f.required ? ' *' : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {previewRows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {fields.filter((f) => Object.values(mapping).includes(f.key)).map((f) => (
                              <td key={f.key} className="px-3 py-1.5 text-slate-700 max-w-[160px] truncate">
                                {row[f.key] || <span className="text-slate-300">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Step 3: Result ── */}
          {step === 'result' && result && (
            <div className="space-y-4 py-4">
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                result.errors.length === 0
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                {result.errors.length === 0
                  ? <CheckCircle size={24} className="text-emerald-600 shrink-0" />
                  : <AlertTriangle size={24} className="text-amber-600 shrink-0" />}
                <div>
                  <p className="font-bold text-slate-900">Import Complete</p>
                  <p className="text-sm text-slate-600 mt-0.5">
                    <span className="text-emerald-700 font-semibold">{result.imported} imported</span>
                    {result.skipped > 0 && <span className="text-amber-700 font-semibold ml-2">{result.skipped} skipped</span>}
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Error details</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-rose-600 bg-rose-50 rounded px-3 py-1.5">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
          {step === 'result' ? (
            <button onClick={onClose}
              className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              {step === 'map' && (
                <button
                  onClick={handleImport}
                  disabled={importing || missingRequired.length > 0}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {importing
                    ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
                    : <><Upload size={14} /> Import {rawRows.length} rows</>}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
