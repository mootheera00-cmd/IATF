// frontend/src/pages/DocumentView.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_BASE_URL, adminAPI, documentAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Printer, Shield, Eye, Calendar, User, Download, FileText, AlertTriangle } from 'lucide-react';
import PdfViewer from '../components/PdfViewer';

export default function DocumentView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [document, setDocument] = useState<any | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [currentRevisionId, setCurrentRevisionId] = useState<string | number | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | number | null>(null);
  const pdfUrlRef = useRef<string | null>(null);
  const closeLoggedRef = useRef(false);
  const accessSessionRef = useRef<string | null>(null);
  const hasEnteredRef = useRef(false);

  const normalizedRole = String(user?.role || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const canViewAllRevisions = ['ADMIN', 'DOCUMENT_CONTROL', 'DOCUMENT_CONTROLLER'].includes(normalizedRole);
  const canPrint = true;
  const selectedRevision = useMemo(() => {
    if (!selectedRevisionId) return null;
    return revisions.find((rev) => String(rev.id) === String(selectedRevisionId)) || null;
  }, [revisions, selectedRevisionId]);

  const isObsoleteRevision = Boolean(
    selectedRevisionId && currentRevisionId && String(selectedRevisionId) !== String(currentRevisionId)
  );

  useEffect(() => {
    fetchDocument();
  }, [id]);

  useEffect(() => {
    const logClose = () => {
      if (closeLoggedRef.current || !id || !hasEnteredRef.current) return;
      closeLoggedRef.current = true;

      const token = localStorage.getItem('token');
      const payload = JSON.stringify({ session_id: accessSessionRef.current || null });

      try {
        fetch(`${API_BASE_URL}/documents/${id}/close`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch (_) {
      }
    };

    const handlePageHide = () => logClose();
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      logClose();
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [id]);

  // Block right-click on the entire page while this view is mounted
  // (the browser PDF plugin context menu cannot be caught from inside the iframe,
  //  so we intercept at the window level with capture:true)
  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', blockContextMenu, true);
    return () => window.removeEventListener('contextmenu', blockContextMenu, true);
  }, []);

  const fetchDocument = async () => {
    try {
      setLoading(true);

      const meta = await documentAPI.get(id || '');
      setDocument(meta.data);

      if (canViewAllRevisions && id) {
        try {
          const revisionResponse = await adminAPI.getDocumentRevisions(id);
          const revisionData = revisionResponse.data || {};
          setRevisions(Array.isArray(revisionData.revisions) ? revisionData.revisions : []);
          const currentId = revisionData.summary?.current_revision_id || revisionData.document?.current_revision_id || null;
          setCurrentRevisionId(currentId);
          if (!selectedRevisionId) {
            setSelectedRevisionId(currentId || revisionData.revisions?.[0]?.id || null);
          }
        } catch (revError) {
          console.error('Failed to load document revisions:', revError);
        }
      }

      await loadPdf(meta.data, selectedRevisionId || null);
    } catch (err) {
      console.error(err);
      setError('Failed to load document. It might be restricted or deleted.');
      hasEnteredRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  const loadPdf = async (metaData: any, revisionId: string | number | null) => {
    if (!id) return;
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }

    const useRevisionView = Boolean(revisionId && currentRevisionId && String(revisionId) !== String(currentRevisionId));
    const blobRes = useRevisionView
      ? await documentAPI.viewRevision(id, revisionId as string | number)
      : await documentAPI.view(id);
  const url = URL.createObjectURL(blobRes.data);
  setPdfUrl(url);
  pdfUrlRef.current = url;
    accessSessionRef.current = blobRes.headers?.['x-access-session'] || null;
    closeLoggedRef.current = false;
    hasEnteredRef.current = true;

    if (metaData?.status && metaData.status !== document?.status) {
      setDocument(metaData);
    }
  };

  useEffect(() => {
    if (!id || !selectedRevisionId || !document) return;
    if (!canViewAllRevisions) return;
    setLoading(true);
    loadPdf(document, selectedRevisionId)
      .catch((err) => {
        console.error(err);
        setError('Failed to load document revision.');
      })
      .finally(() => setLoading(false));
  }, [selectedRevisionId, id, canViewAllRevisions]);

  const handlePrint = async () => {
    if (!id) return;
    try {
      setPrintError(null);
      const useRevisionPrint = Boolean(
        selectedRevisionId && currentRevisionId && String(selectedRevisionId) !== String(currentRevisionId)
      );
      const response = useRevisionPrint
        ? await documentAPI.printRevision(id, selectedRevisionId as string | number)
        : await documentAPI.print(id);
      const printUrl = URL.createObjectURL(response.data);
      const printCompleteEndpoint = useRevisionPrint
        ? `${API_BASE_URL}/documents/${id}/revisions/${selectedRevisionId}/print-complete`
        : `${API_BASE_URL}/documents/${id}/print-complete`;
      const printLogPayload = {
        revision_id: useRevisionPrint ? selectedRevisionId : null,
        obsolete: isObsoleteRevision
      };
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head><title>Print Document</title></head>
            <body style="margin:0">
              <iframe src="${printUrl}" style="border:0;width:100%;height:100%" onload="this.contentWindow.focus();this.contentWindow.print();"></iframe>
              <script>
                const endpoint = ${JSON.stringify(printCompleteEndpoint)};
                const payload = ${JSON.stringify(printLogPayload)};
                let logged = false;
                const logPrint = () => {
                  if (logged) return;
                  logged = true;
                  const token = localStorage.getItem('token');
                  fetch(endpoint, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: 'Bearer ' + token } : {})
                    },
                    body: JSON.stringify(payload),
                    keepalive: true
                  }).catch(() => {});
                };
                window.addEventListener('afterprint', logPrint);
                window.addEventListener('beforeunload', logPrint);
              <\/script>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        window.location.href = printUrl;
      }
    } catch (err: any) {
      console.error(err);
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setPrintError('Print access denied. Please sign in again.');
      } else if (status === 404) {
        setPrintError('Print file not found. The revision file may be missing.');
      } else {
        setPrintError('Failed to print document. Please try again.');
      }
    }
  };

  const handleSave = async () => {
    if (!id) return;
    try {
      setSaving(true);
      setSaveError(null);
      const useRevisionSave = Boolean(
        selectedRevisionId && currentRevisionId && String(selectedRevisionId) !== String(currentRevisionId)
      );
      const response = useRevisionSave
        ? await documentAPI.saveRevision(id, selectedRevisionId as string | number)
        : await documentAPI.save(id);

      const url = URL.createObjectURL(response.data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${document?.doc_no || 'document'}_Rev${document?.revision || ''}_COPY.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      const saveCompleteEndpoint = useRevisionSave
        ? `${API_BASE_URL}/documents/${id}/revisions/${selectedRevisionId}/save-complete`
        : `${API_BASE_URL}/documents/${id}/save-complete`;
      const token = localStorage.getItem('token');
      fetch(saveCompleteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        keepalive: true
      }).catch(() => {});
    } catch (err: any) {
      console.error(err);
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setSaveError('Save access denied. Please sign in again.');
      } else if (status === 404) {
        setSaveError('Save file not found. The revision file may be missing.');
      } else {
        setSaveError('Failed to save document. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link to="/documents" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft size={18} />
            Back to Documents
          </Link>
        </div>
      </div>
    );
  }

  const isObsolete = document.status === 'Obsolete' || isObsoleteRevision;
  const activeRevisionNumber = selectedRevision?.revision_number ?? document.revision;
  const activeRevisionDate = selectedRevision?.created_at || document.rev_date;

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/documents" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {document.doc_no}
              {isObsolete && (
                <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded border border-red-200 uppercase tracking-wide">
                  OBSOLETE
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 truncate max-w-md">{document.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
            {isObsolete ? (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 animate-pulse">
                    <AlertTriangle size={16} />
                    <span className="text-xs font-bold uppercase tracking-wide">Uncontrolled Document</span>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
                    <Shield size={16} />
                    <span className="text-xs font-bold uppercase tracking-wide">Controlled Copy</span>
                </div>
            )}

      <button
        onClick={handlePrint}
        className="bg-slate-800 text-white hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        title={canPrint ? 'Print Document' : 'Print available for Admin/DC only'}
        disabled={!canPrint}
      >
        <Printer size={16} />
        <span>Print</span>
      </button>

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        title="Save a copy of this document (watermarked)"
      >
        <Download size={16} />
        <span>{saving ? 'Saving…' : 'Save Copy'}</span>
      </button>
        </div>
      </header>

      {printError && (
        <div className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {printError}
        </div>
      )}

      {saveError && (
        <div className="mx-6 mt-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
          {saveError}
        </div>
      )}

      {/* Main Content: PDF View + Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer Area */}
        <div className="flex-1 bg-slate-200 relative overflow-hidden">
          {pdfUrl ? (
            <PdfViewer src={pdfUrl} />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">Loading document preview...</div>
          )}

          {/* Watermark Overlay (HTML-based backup) */}
          {isObsolete && (
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-20 opacity-20 select-none">
                 <div className="transform -rotate-45 whitespace-nowrap text-9xl font-black text-red-600 tracking-widest border-4 border-red-600 p-8 rounded-xl mixed-blend-multiply">
                     OBSOLETE
                 </div>
             </div>
          )}
        </div>

        {/* Info Sidebar */}
        <aside className="w-80 bg-white border-l border-slate-200 overflow-y-auto hidden lg:block shrink-0">
            <div className="p-6 space-y-8">
                {/* Meta Block 1 */}
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Document Details</h3>
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <FileText className="text-slate-400 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-medium text-slate-900">Revision {activeRevisionNumber}</p>
                                <p className="text-xs text-slate-500">
                                  {isObsolete ? 'Obsolete revision' : 'Latest approved version'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Calendar className="text-slate-400 mt-0.5" size={18} />
                            <div>
                <p className="text-sm font-medium text-slate-900">
                  {activeRevisionDate ? new Date(activeRevisionDate).toLocaleDateString() : '-'}
                </p>
                                <p className="text-xs text-slate-500">Effective Date</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <User className="text-slate-400 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-medium text-slate-900">{document.owner_name || 'System Admin'}</p>
                                <p className="text-xs text-slate-500">Document Owner</p>
                            </div>
                        </div>
                    </div>
                </div>

                {canViewAllRevisions && revisions.length > 0 && (
                  <div className="border-t border-slate-100 pt-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Revision History</h3>
                    <div className="space-y-3">
                      {revisions.map((rev) => {
                        const isCurrent = currentRevisionId && String(rev.id) === String(currentRevisionId);
                        const isSelected = selectedRevisionId && String(rev.id) === String(selectedRevisionId);
                        return (
                          <button
                            key={rev.id}
                            type="button"
                            onClick={() => setSelectedRevisionId(rev.id)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              isSelected
                                ? 'border-blue-200 bg-blue-50'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-slate-800">Rev {rev.revision_number}</p>
                                <p className="text-xs text-slate-500">
                                  {rev.created_at ? new Date(rev.created_at).toLocaleDateString() : '-'}
                                </p>
                              </div>
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  isCurrent
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {isCurrent ? 'Current' : 'Obsolete'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Security Classification</h3>
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 text-xs text-yellow-800 leading-relaxed">
                        <p className="font-bold mb-1">confidential - Internal Use Only</p>
                        This document is intended solely for internal use. Any unauthorized distribution is prohibited. Printed copies are uncontrolled unless stamped.
                    </div>
                </div>
            </div>
        </aside>
      </div>
    </div>
  );
}
