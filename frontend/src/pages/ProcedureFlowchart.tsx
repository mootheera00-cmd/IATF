import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Circle, RefreshCw } from 'lucide-react';
import { documentAPI } from '../api';

const INITIAL_ROWS = [
  { term: 'DCR', meaning: 'Document Change Request', dc: 'Pending', manager: 'Pending', owner: 'Pending' },
  { term: 'QMR', meaning: 'Quality Management Representative', dc: 'Pending', manager: 'Pending', owner: 'Pending' },
  { term: '', meaning: '', dc: 'Pending', manager: 'Pending', owner: 'Pending' }
];

const LAST_REVIEW_KEY = 'procedure_docs_last_review_at';

function parseDate(value?: string) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function ProcedureFlowchart() {
  const [tableRows, setTableRows] = useState(INITIAL_ROWS);
  const [procedureDocs, setProcedureDocs] = useState<any[]>([]);
  const [showReferences, setShowReferences] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [lastReviewedAt, setLastReviewedAt] = useState(localStorage.getItem(LAST_REVIEW_KEY));

  const fetchProcedureDocs = async () => {
    try {
      setLoadingDocs(true);
      const response = await documentAPI.listProcedure();
      const docs = (response.data || [])
        .sort((a: any, b: any) => new Date(b.approved_date || 0).getTime() - new Date(a.approved_date || 0).getTime());
      setProcedureDocs(docs);
    } catch (err) {
      console.error(err);
      setProcedureDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchProcedureDocs();
  }, []);

  const latestDocDate = useMemo(() => {
    const dates = procedureDocs
      .map((doc) => parseDate(doc.approved_date))
      .filter(Boolean)
      .sort((a, b) => (b as Date).getTime() - (a as Date).getTime());
    return dates[0] || null;
  }, [procedureDocs]);

  const needsUpdate = useMemo(() => {
    if (!procedureDocs.length) return false;
    if (!lastReviewedAt) return true;
    const lastReviewDate = parseDate(lastReviewedAt);
    if (!lastReviewDate) return true;
    if (!latestDocDate) return false;
    return latestDocDate > lastReviewDate;
  }, [procedureDocs, lastReviewedAt, latestDocDate]);

  const handleReferenceClick = async () => {
    await fetchProcedureDocs();
    setShowReferences((value) => !value);
    const now = new Date().toISOString();
    localStorage.setItem(LAST_REVIEW_KEY, now);
    setLastReviewedAt(now);
  };

  const updateCell = (index: number, field: string, value: string) => {
    setTableRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Procedure Terms & Acronyms</h1>
        <p className="text-slate-600 mt-2">Reference table for auditors and employees, with staged review sequence.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleReferenceClick}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
        >
          <BookOpen size={18} />
          Reference Documents
        </button>

        <button
          type="button"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold ${
            needsUpdate
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-green-50 border-green-200 text-green-800'
          }`}
        >
          <Circle size={10} fill="currentColor" />
          {needsUpdate ? 'Update Documents!' : 'Documents are up-to-date.'}
        </button>

        <button
          type="button"
          onClick={fetchProcedureDocs}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {showReferences && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-bold text-slate-900 mb-4">Procedure Category Documents (Central Repository)</h2>
          {loadingDocs ? (
            <p className="text-slate-600">Loading procedure documents...</p>
          ) : procedureDocs.length ? (
            <div className="space-y-2">
              {procedureDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between border border-slate-200 rounded-lg p-3">
                  <div>
                    <p className="font-semibold text-slate-900">{doc.doc_no} - {doc.title}</p>
                    <p className="text-xs text-slate-500">Revision {doc.revision || '-'} | Status {doc.status || '-'}</p>
                  </div>
                  <a href={`/documents/${doc.id}`} className="text-indigo-600 font-semibold hover:text-indigo-700">
                    Open
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600">No Procedure documents found in repository.</p>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Acronym / Term</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Meaning</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Document Controller</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Manager Check</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Owner Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableRows.map((row, index) => (
                <tr key={`procedure-row-${index}`}>
                  <td className="px-4 py-3">
                    <input
                      value={row.term}
                      onChange={(e) => updateCell(index, 'term', e.target.value)}
                      placeholder="e.g. SOP"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={row.meaning}
                      onChange={(e) => updateCell(index, 'meaning', e.target.value)}
                      placeholder="Definition"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.dc}</td>
                  <td className="px-4 py-3 text-slate-700">{row.manager}</td>
                  <td className="px-4 py-3 text-slate-700">{row.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 p-4 bg-slate-50">
          <button
            onClick={() => setTableRows((rows) => [...rows, { term: '', meaning: '', dc: 'Pending', manager: 'Pending', owner: 'Pending' }])}
            className="px-4 py-2 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Add Term Row
          </button>
        </div>
      </div>
    </div>
  );
}
