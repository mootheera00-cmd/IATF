import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { reportAPI } from '../api';
import { FileSearch, Loader2, FileText, ExternalLink, Download, ArrowLeft, FolderOpen, Eye } from 'lucide-react';

interface ReportFileInfo {
  fileName: string;
  path: string;
}

interface ReportSearchResponse {
  keyword: string;
  standard: ReportFileInfo | null;
  zero: ReportFileInfo | null;
}

export default function ReportSearch() {
  const [keyword, setKeyword] = useState('');
  const [statusMessage, setStatusMessage] = useState('Ready');
  const [loading, setLoading] = useState(false);
  const [standardInfo, setStandardInfo] = useState<ReportFileInfo | null>(null);
  const [zeroInfo, setZeroInfo] = useState<ReportFileInfo | null>(null);
  const [standardUrl, setStandardUrl] = useState('');
  const [zeroUrl, setZeroUrl] = useState('');
  const [showZero, setShowZero] = useState(false);
  const [openingFolder, setOpeningFolder] = useState<'standard' | 'zero' | null>(null);
  const [folderToast, setFolderToast] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    label: string;
    path: string;
  } | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (standardUrl) URL.revokeObjectURL(standardUrl);
      if (zeroUrl) URL.revokeObjectURL(zeroUrl);
    };
  }, [standardUrl, zeroUrl]);

  const canSearch = useMemo(() => keyword.trim().length >= 6, [keyword]);

  const clearPreviews = () => {
    if (standardUrl) URL.revokeObjectURL(standardUrl);
    if (zeroUrl) URL.revokeObjectURL(zeroUrl);
    setStandardUrl('');
    setZeroUrl('');
  };

  const showFolderToast = () => {
    setFolderToast(true);
    setTimeout(() => setFolderToast(false), 2800);
  };

  const handleOpenFolder = async (path: string, which: 'standard' | 'zero') => {
    if (!path) return;
    try {
      setOpeningFolder(which);
      showFolderToast();
      await reportAPI.openFolder(path);
    } finally {
      setOpeningFolder(null);
    }
  };

  const handleContextMenuOpenFolder = async () => {
    if (!contextMenu?.path) return;
    try {
      setMenuLoading(true);
      showFolderToast();
      await reportAPI.openFolder(contextMenu.path);
    } finally {
      setMenuLoading(false);
      setContextMenu(null);
    }
  };

  const loadPdf = async (filePath: string) => {
    const response = await reportAPI.file(filePath, 'inline');
    return URL.createObjectURL(response.data);
  };

  const handleSearch = async () => {
    const trimmed = keyword.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setStatusMessage('Searching...');
    clearPreviews();
    setStandardInfo(null);
    setZeroInfo(null);

    try {
      const response = await reportAPI.search(trimmed);
      const data = response.data as ReportSearchResponse;

      setStandardInfo(data.standard || null);
      setZeroInfo(data.zero || null);

      if (!data.standard && !data.zero) {
        setStatusMessage('No PDF found.');
        return;
      }

      if (data.standard?.path) {
        const url = await loadPdf(data.standard.path);
        setStandardUrl(url);
      }

      if (data.zero?.path) {
        const url = await loadPdf(data.zero.path);
        setZeroUrl(url);
      }

      setStatusMessage('Found!');
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Search failed.';
      setStatusMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const openInNewTab = (url: string) => {
    if (!url) return;
    // Blob URLs require same-origin access; noopener breaks them in some browsers
    window.open(url, '_blank');
  };

  const downloadPdf = (url: string, filename: string) => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'report.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="min-h-screen bg-slate-50" onClick={() => setContextMenu(null)}>
      <div className="w-full px-6 py-6 space-y-6">
        <header className="space-y-3">
          <Link to="/report" className="inline-flex items-center gap-2 text-sm text-indigo-600 font-semibold">
            <ArrowLeft className="h-4 w-4" /> Back to Report
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Report Search (APTX)</h1>
            <p className="text-slate-600">Search APTX reports and preview PDFs.</p>
          </div>
        </header>

        {/* Search bar */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700 mb-1">APTX Number</label>
          <p className="text-xs text-slate-400 mb-3">Enter the full APTX report number (e.g. APTX26001) to search and preview the PDF.</p>
          <div className="flex items-center gap-3">
            <input
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="APTX26001"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSearch) {
                  handleSearch();
                }
              }}
            />
            <button
              type="button"
              disabled={loading || !canSearch}
              onClick={handleSearch}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-white font-semibold shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
              Search
            </button>
          </div>
          <span className="mt-2 block text-xs font-semibold text-slate-500">{statusMessage}</span>
        </section>

        {/* PDF panels */}
        <section className={`grid gap-6 ${showZero ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
          {/* ── APTX (Standard) panel ── */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <FileText className="h-4 w-4 text-indigo-500" />
                APTX Report
                {standardInfo && (
                  <span className="text-xs text-slate-400 font-normal ml-1">({standardInfo.fileName})</span>
                )}
              </div>
              {standardInfo && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={openingFolder === 'standard'}
                    onClick={() => handleOpenFolder(standardInfo.path, 'standard')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                    {openingFolder === 'standard' ? 'Opening...' : 'Open Folder'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openInNewTab(standardUrl)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Open
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPdf(standardUrl, standardInfo.fileName)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline"
                  >
                    <Download className="h-3 w-3" /> Download
                  </button>
                </div>
              )}
            </div>
            <div
              className="h-[72vh] bg-slate-100"
              onContextMenu={(event) => {
                if (!standardInfo?.path) return;
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, label: standardInfo.fileName, path: standardInfo.path });
              }}
            >
              {standardUrl ? (
                <iframe title="Standard PDF" src={standardUrl} className="h-full w-full" />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  {standardInfo ? 'Loading preview...' : 'No file loaded'}
                </div>
              )}
            </div>
          </div>

          {/* ── Zero-Prefix panel (only when revealed) ── */}
          {showZero && (
            <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200 bg-amber-50">
                <div className="flex items-center gap-2 text-amber-700 font-semibold">
                  <FileText className="h-4 w-4" />
                  Zero-Prefix PDF
                  {zeroInfo && (
                    <span className="text-xs text-amber-500 font-normal ml-1">({zeroInfo.fileName})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {zeroInfo && (
                    <>
                      <button
                        type="button"
                        disabled={openingFolder === 'zero'}
                        onClick={() => handleOpenFolder(zeroInfo.path, 'zero')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                        {openingFolder === 'zero' ? 'Opening...' : 'Open Folder'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openInNewTab(zeroUrl)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Open
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadPdf(zeroUrl, zeroInfo.fileName)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline"
                      >
                        <Download className="h-3 w-3" /> Download
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowZero(false)}
                    className="ml-2 text-xs text-slate-400 hover:text-red-500"
                    title="Hide zero-prefix"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div
                className="h-[72vh] bg-amber-50/30"
                onContextMenu={(event) => {
                  if (!zeroInfo?.path) return;
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, label: zeroInfo.fileName, path: zeroInfo.path });
                }}
              >
                {zeroUrl ? (
                  <iframe title="Zero PDF" src={zeroUrl} className="h-full w-full" />
                ) : (
                  <div className="h-full flex items-center justify-center text-amber-400 text-sm">
                    {zeroInfo ? 'Loading preview...' : 'No zero-prefix file found'}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Context menu */}
        {contextMenu && (
          <div
            className="fixed z-50 rounded-xl border border-slate-200 bg-white shadow-xl text-sm"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">{contextMenu.label}</div>
            <button
              type="button"
              disabled={menuLoading}
              onClick={handleContextMenuOpenFolder}
              className="w-full px-4 py-2 text-left font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-60 flex items-center gap-2"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {menuLoading ? 'Opening...' : 'Open Folder'}
            </button>
          </div>
        )}

        {/* Hidden reveal button — bottom-right corner */}
        {!showZero && (
          <button
            type="button"
            onClick={() => setShowZero(true)}
            title="Show Zero-Prefix PDF"
            className="fixed bottom-5 right-5 z-40 opacity-10 hover:opacity-70 transition-opacity duration-300 bg-slate-700 text-white rounded-full p-2 shadow-lg"
          >
            <Eye className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Folder Opening Toast */}
      {folderToast && (
        <div
          className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
          style={{ animation: 'folderToastIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          <div className="flex items-center gap-4 rounded-2xl border-2 border-amber-400 bg-amber-50 shadow-2xl px-6 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
              <FolderOpen className="h-6 w-6 text-amber-500" style={{ animation: 'folderBounce 0.6s ease-in-out infinite alternate' }} />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-amber-800">Opening Folder</span>
              <span className="text-xs text-amber-600">Windows Explorer is opening — check your taskbar</span>
            </div>
          </div>
          <style>{`
            @keyframes folderToastIn {
              from { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.9); }
              to   { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1);   }
            }
            @keyframes folderBounce {
              from { transform: translateY(0);   }
              to   { transform: translateY(-4px); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
